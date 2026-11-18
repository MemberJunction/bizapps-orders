/**
 * Product options (Tier, Size) on a checkout: what the widget renders, and the check the buyer's
 * picks pass before the server writes them onto the line.
 *
 * Unlike a widget's `choiceGroups`, options need no widget configuration: the server reads the sold
 * product's effective options from `OrdersEngine` and hands the browser this public shape. The
 * buyer sends back option code -> value code, and the server judges the picks against the product's
 * options as they are now, never against anything the buyer sent.
 *
 * Pure; no database, no provider, so the public widget bundle can import it without the engine.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { CheckOptionPicks, type EffectiveProductOption, type OptionPick } from './product-options.js';

/** One option as an anonymous browser sees it: codes and labels only, no IDs. */
export interface CheckoutProductOption {
    code: string;
    label: string;
    required: boolean;
    /** The value code pre-selected for the buyer, when the option has a default. */
    defaultValue?: string;
    values: Array<{ value: string; label: string }>;
}

/** The buyer's picks: option code -> value code. */
export type CheckoutOptionPicksInput = Record<string, string>;

/** One pick that passed the check, shaped as `OrderLineChoice` records it. */
export interface ResolvedCheckoutOptionPick extends Required<OptionPick> {
    GroupKey: string;
    GroupLabel: string;
    OptionValue: string;
    OptionLabel: string;
    ProductOptionID: string;
    ProductOptionValueID: string;
}

export interface CheckoutOptionPicksCheck {
    Picks: ResolvedCheckoutOptionPick[];
    /** Why the picks were refused, worded for the buyer. */
    Error?: string;
}

/** More picks than any product offers options is not a buyer's form; refuse it outright. */
const MAX_OPTION_PICKS = 50;

const codeKey = (code: string | null | undefined): string => (code ?? '').trim().toLowerCase();

/** The options a checkout renders for a product, in display order. */
export function CheckoutProductOptions(effective: readonly EffectiveProductOption[]): CheckoutProductOption[] {
    return effective
        .filter((e) => e.Values.length > 0)
        .map((e) => ({
            code: e.Option.Code,
            label: e.Option.Name,
            required: e.IsRequired,
            ...(e.Default ? { defaultValue: e.Default.Code } : {}),
            values: e.Values.map((v) => ({ value: v.Code, label: v.Label })),
        }));
}

/** The picks a checkout starts with: each option's default value code. */
export function CheckoutOptionDefaults(options: readonly CheckoutProductOption[] | null | undefined): CheckoutOptionPicksInput {
    const out: CheckoutOptionPicksInput = {};
    for (const o of options ?? []) if (o.defaultValue) out[o.code] = o.defaultValue;
    return out;
}

/** Names of required options the buyer has not picked, for the widget's own gate. */
export function MissingCheckoutOptions(
    options: readonly CheckoutProductOption[] | null | undefined,
    picks: CheckoutOptionPicksInput | null | undefined,
): string[] {
    return (options ?? []).filter((o) => o.required && !(picks ?? {})[o.code]).map((o) => o.label);
}

/**
 * Judge the buyer's picks against the product's effective options and resolve them to the rows the
 * line records. `partial` (a draft) lets a required option stay unpicked; the payment intent and
 * completion check in full. Anything not an object of string codes is refused.
 */
export function CheckCheckoutOptionPicks(
    effective: readonly EffectiveProductOption[],
    raw: unknown,
    options?: { partial?: boolean },
): CheckoutOptionPicksCheck {
    const refuse = (error: string): CheckoutOptionPicksCheck => ({ Picks: [], Error: error });
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) return refuse('The option picks could not be read.');
    const entries = Object.entries((raw ?? {}) as Record<string, unknown>);
    if (entries.length > MAX_OPTION_PICKS) return refuse('The option picks could not be read.');

    const picks: ResolvedCheckoutOptionPick[] = [];
    for (const [code, value] of entries) {
        if (value == null || value === '') continue;
        if (typeof value !== 'string') return refuse('The option picks could not be read.');
        const option = effective.find((e) => codeKey(e.Option.Code) === codeKey(code));
        if (!option) return refuse(`${code} is not an option of this product.`);
        const picked = option.Values.find((v) => codeKey(v.Code) === codeKey(value));
        if (!picked) return refuse(`${value} is not an available ${option.Option.Name} for this product.`);
        picks.push({
            GroupKey: option.Option.Code,
            GroupLabel: option.Option.Name,
            OptionValue: picked.Code,
            OptionLabel: picked.Label,
            ProductOptionID: option.Option.ID,
            ProductOptionValueID: picked.ID,
        });
    }

    const problems = CheckOptionPicks(effective, picks).filter(
        // A draft may leave a required option open; every other problem refuses it too.
        (p) => !options?.partial || !effective.some((e) => e.IsRequired && p === `Pick a ${e.Option.Name}.`),
    );
    if (problems.length) return refuse(problems.join(' '));
    return { Picks: picks };
}
