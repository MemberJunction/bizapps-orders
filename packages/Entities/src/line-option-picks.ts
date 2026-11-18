/**
 * Writing a line's product option picks (Tier, Size) into its `Choices` collection.
 *
 * A pick is one `OrderLineChoice` row carrying the option and value IDs, with `GroupKey` = option
 * code, `OptionValue` = value code and both labels copied, which is the shape price rules,
 * entitlement templates and renewals read. The order editor, the checkout and any script set picks
 * through these functions, so every caller writes the same row.
 *
 * The collection must be loaded before a saved line is edited: an unloaded collection holds none of
 * the saved rows, so a pick added to it would sit beside the saved one and the line would carry two.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { DefaultOptionPicks, type EffectiveProductOption, type ProductOptionValueRow } from './product-options.js';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/** The `OrderLineChoice` fields a pick sets. */
export interface LineChoiceRow {
    GroupKey: string;
    GroupLabel: string;
    OptionValue: string;
    OptionLabel: string;
    ProductOptionID: string | null;
    ProductOptionValueID: string | null;
}

/** The part of a line's `Choices` collection these functions use. */
export interface LineChoicesCollection<T extends LineChoiceRow = LineChoiceRow> {
    readonly Items: readonly T[];
    Create(): Promise<T>;
    Remove(item: T | number): void;
}

/** A line, as far as its picks go. `mjBizAppsOrdersOrderLineEntity` fits. */
export interface LineWithChoices<T extends LineChoiceRow = LineChoiceRow> {
    Choices: LineChoicesCollection<T>;
}

/** The row recording the line's pick for an option, if any. */
export function LineOptionChoice<T extends LineChoiceRow>(line: LineWithChoices<T>, optionID: string): T | undefined {
    return line.Choices.Items.find((c) => !!c.ProductOptionID && uuidKey(c.ProductOptionID) === uuidKey(optionID));
}

/** The value ID the line picked for an option, or null. */
export function LineOptionValueID<T extends LineChoiceRow>(line: LineWithChoices<T>, optionID: string): string | null {
    return LineOptionChoice(line, optionID)?.ProductOptionValueID ?? null;
}

/**
 * Set, change or clear the line's pick for one option. A value ID that is not one of the option's
 * allowed values clears the pick, so the line is never left holding a value the product does not
 * offer. Returns true when the line changed.
 */
export async function SetLineOptionPick<T extends LineChoiceRow>(
    line: LineWithChoices<T>,
    option: EffectiveProductOption,
    valueID: string | null | undefined,
): Promise<boolean> {
    const value: ProductOptionValueRow | undefined = valueID
        ? option.Values.find((v) => uuidKey(v.ID) === uuidKey(valueID))
        : undefined;
    const existing = LineOptionChoice(line, option.Option.ID);
    if (!value) {
        if (!existing) return false;
        line.Choices.Remove(existing);
        return true;
    }
    if (existing && uuidKey(existing.ProductOptionValueID) === uuidKey(value.ID)) return false;
    const row = existing ?? (await line.Choices.Create());
    row.ProductOptionID = option.Option.ID;
    row.ProductOptionValueID = value.ID;
    row.GroupKey = option.Option.Code;
    row.GroupLabel = option.Option.Name;
    row.OptionValue = value.Code;
    row.OptionLabel = value.Label;
    return true;
}

/**
 * Bring a line's picks in line with its product's options: drop picks for options the product does
 * not offer (after a product change), and pre-fill each option's default where the line has no pick.
 * A required option's default pre-fills too and stays editable. Widget choices are left alone.
 * Returns true when the line changed.
 */
export async function ApplyOptionDefaults<T extends LineChoiceRow>(
    line: LineWithChoices<T>,
    effective: readonly EffectiveProductOption[],
): Promise<boolean> {
    let changed = false;
    const offered = new Set(effective.map((e) => uuidKey(e.Option.ID)));
    for (const row of [...line.Choices.Items]) {
        if (row.ProductOptionID && !offered.has(uuidKey(row.ProductOptionID))) {
            line.Choices.Remove(row);
            changed = true;
        }
    }
    for (const pick of DefaultOptionPicks(effective)) {
        if (LineOptionChoice(line, pick.ProductOptionID as string)) continue;
        const option = effective.find((e) => uuidKey(e.Option.ID) === uuidKey(pick.ProductOptionID));
        if (option && (await SetLineOptionPick(line, option, pick.ProductOptionValueID))) changed = true;
    }
    return changed;
}
