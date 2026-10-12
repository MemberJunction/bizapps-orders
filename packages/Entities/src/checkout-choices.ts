/**
 * Choice groups a checkout widget offers the buyer — "choose N of these M options" — and the check
 * the buyer's picks pass.
 *
 * The groups live in the widget's Configuration (`choiceGroups`). Unlike a question's answer, a
 * pick decides what the buyer is entitled to: it is recorded on the order line as Order Line
 * Choices, a Product Entitlement with a matching `ChoiceGroupKey` / `ChoiceOptionValue` grants only
 * on a line that carries it, and a renewal copies the picks onto its own line.
 *
 * Pure; no database, no provider. The browser runs the same check to gate the Pay button, and the
 * server runs it on the picks it stored before it opens a payment intent or completes the
 * checkout — the server check is the one that counts. Picks are judged against the widget's own
 * groups, never against anything the buyer sent.
 */

/** One option of a choice group. A bare string is both its value and its label. */
export interface CheckoutChoiceOption {
    value: string;
    label: string;
}

export interface CheckoutChoiceGroup {
    /** Stable identifier, recorded on the line as `GroupKey` and matched by `ProductEntitlement.ChoiceGroupKey`. */
    key: string;
    /** The group as the buyer sees it, e.g. "Choose your department". */
    label: string;
    options: Array<string | CheckoutChoiceOption>;
    /** Fewest options the buyer must pick. 0 makes the group optional. */
    min: number;
    /** Most options the buyer may pick. At least `min`, and no more than the number of options. */
    max: number;
}

/** The buyer's picks, keyed by group key: the option values chosen. */
export type CheckoutChoicesInput = Record<string, string[]>;

/** One pick that passed the check, shaped as the order line records it. */
export interface ResolvedCheckoutChoice {
    GroupKey: string;
    GroupLabel: string;
    OptionValue: string;
    OptionLabel: string;
}

export interface CheckoutChoicesCheck {
    /** Every pick, in the widget's group and option order. Empty when `Error` is set. */
    Choices: ResolvedCheckoutChoice[];
    /** Why the picks were refused, worded for the buyer. */
    Error?: string;
}

/** Column widths of OrderLineChoice. */
export const MAX_CHECKOUT_CHOICE_KEY_LENGTH = 100;
export const MAX_CHECKOUT_CHOICE_LABEL_LENGTH = 500;

/** Message for a widget whose `choiceGroups` cannot be read; the checkout is refused, not skipped. */
export const INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE = 'This checkout is not configured correctly (its choices are invalid).';

export function CheckoutChoiceOptionValue(option: string | CheckoutChoiceOption): string {
    return typeof option === 'string' ? option : option.value;
}

export function CheckoutChoiceOptionLabel(option: string | CheckoutChoiceOption): string {
    return typeof option === 'string' ? option : option.label;
}

/**
 * The widget's choice groups, or an error when `choiceGroups` is present but malformed.
 *
 * A malformed list refuses the checkout rather than dropping the bad entries: a group that
 * silently disappeared would sell the product without the pick its entitlements depend on.
 */
export function ReadCheckoutChoiceGroups(raw: unknown): { Groups: CheckoutChoiceGroup[]; Error?: string } {
    if (raw === undefined || raw === null) return { Groups: [] };
    if (!Array.isArray(raw)) return { Groups: [], Error: INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE };

    const keys = new Set<string>();
    for (const g of raw as unknown[]) {
        if (!IsValidChoiceGroup(g) || keys.has(g.key)) {
            return { Groups: [], Error: INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE };
        }
        keys.add(g.key);
    }
    return { Groups: raw as CheckoutChoiceGroup[] };
}

function IsValidChoiceGroup(g: unknown): g is CheckoutChoiceGroup {
    if (!g || typeof g !== 'object') return false;
    const c = g as Partial<CheckoutChoiceGroup>;
    if (typeof c.key !== 'string' || !c.key.trim() || c.key.length > MAX_CHECKOUT_CHOICE_KEY_LENGTH) return false;
    if (typeof c.label !== 'string' || !c.label.trim() || c.label.length > MAX_CHECKOUT_CHOICE_LABEL_LENGTH) return false;
    if (!Array.isArray(c.options) || c.options.length === 0) return false;
    const values = new Set<string>();
    for (const o of c.options) {
        const value = typeof o === 'string' ? o : o && typeof o === 'object' ? o.value : undefined;
        const label = typeof o === 'string' ? o : o && typeof o === 'object' ? o.label : undefined;
        if (typeof value !== 'string' || !value || value.length > MAX_CHECKOUT_CHOICE_KEY_LENGTH || values.has(value)) return false;
        if (typeof label !== 'string' || !label || label.length > MAX_CHECKOUT_CHOICE_LABEL_LENGTH) return false;
        values.add(value);
    }
    if (!Number.isInteger(c.min) || !Number.isInteger(c.max)) return false;
    const min = c.min as number;
    const max = c.max as number;
    return min >= 0 && max >= 1 && min <= max && max <= values.size;
}

/** How many options a group asks for, worded for the buyer: "exactly 2", "1 to 3", "up to 2". */
export function DescribeChoiceCount(group: CheckoutChoiceGroup): string {
    if (group.min === group.max) return `exactly ${group.min}`;
    if (group.min === 0) return `up to ${group.max}`;
    return `${group.min} to ${group.max}`;
}

/**
 * Check the buyer's picks against the widget's choice groups.
 *
 * Refuses: picks that are not an object of lists, a group the widget does not offer, an option
 * that is not one of the group's, more picks than `max`, and — unless `partial` — fewer than `min`.
 * A repeated option counts once. `partial` is for the draft, which is priced before the buyer has
 * finished choosing; the payment intent and completion check in full.
 */
export function CheckChoicesAgainstGroups(
    groups: CheckoutChoiceGroup[],
    picks: unknown,
    options?: { partial?: boolean }
): CheckoutChoicesCheck {
    const refuse = (error: string): CheckoutChoicesCheck => ({ Choices: [], Error: error });

    if (picks !== undefined && picks !== null && (typeof picks !== 'object' || Array.isArray(picks))) {
        return refuse('The checkout choices could not be read.');
    }
    const input = (picks ?? {}) as Record<string, unknown>;

    const offered = new Set(groups.map((g) => g.key));
    for (const key of Object.keys(input)) {
        if (!offered.has(key)) return refuse('A choice was sent for a group this checkout does not offer.');
    }

    const resolved: ResolvedCheckoutChoice[] = [];
    for (const g of groups) {
        const raw = input[g.key];
        if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
            return refuse(`The choices for "${g.label}" could not be read.`);
        }
        const chosen = new Set<string>();
        for (const v of (raw ?? []) as unknown[]) {
            if (typeof v !== 'string') return refuse(`The choices for "${g.label}" could not be read.`);
            chosen.add(v);
        }
        for (const v of chosen) {
            if (!g.options.some((o) => CheckoutChoiceOptionValue(o) === v)) {
                return refuse(`"${v}" is not one of the options for "${g.label}".`);
            }
        }
        if (chosen.size > g.max || (!options?.partial && chosen.size < g.min)) {
            return refuse(`Please choose ${DescribeChoiceCount(g)} for "${g.label}".`);
        }
        // Option order, not the order the buyer clicked, so the record reads the same either way.
        for (const o of g.options) {
            const value = CheckoutChoiceOptionValue(o);
            if (!chosen.has(value)) continue;
            resolved.push({ GroupKey: g.key, GroupLabel: g.label, OptionValue: value, OptionLabel: CheckoutChoiceOptionLabel(o) });
        }
    }
    return { Choices: resolved };
}

/** {@link ReadCheckoutChoiceGroups} then {@link CheckChoicesAgainstGroups}, for a raw Configuration value. */
export function CheckCheckoutChoices(rawGroups: unknown, picks: unknown, options?: { partial?: boolean }): CheckoutChoicesCheck {
    const read = ReadCheckoutChoiceGroups(rawGroups);
    if (read.Error) return { Choices: [], Error: read.Error };
    return CheckChoicesAgainstGroups(read.Groups, picks, options);
}

/** Resolved picks back into the input shape, as the session metadata stores them. */
export function ChoicesForStorage(choices: ResolvedCheckoutChoice[]): CheckoutChoicesInput {
    const stored: CheckoutChoicesInput = {};
    for (const c of choices) (stored[c.GroupKey] ??= []).push(c.OptionValue);
    return stored;
}
