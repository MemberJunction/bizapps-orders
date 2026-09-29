/**
 * @fileoverview What choosing a price on an order line WRITES, and what it means — with no screen.
 *
 * The decisions behind the order line's price picker (golive #194, #253) used to live inside the
 * order lines editor. The deal line editor in bizapps-sales needs the same picker (golive #270), and
 * a second copy of these rules would be a second answer to "is this line overridden?" that could
 * drift from the first. They sit here, on the entity layer, because every one of them is decidable
 * from the line and the engine's default alone — a script could make the same pick with the same
 * objects.
 *
 * Nothing here prices anything. The engine default is whatever `Orders.PriceOrder` last reported,
 * and the named prices are whatever `ListApplicablePrices` returned; this file only compares them
 * against the line and stamps the line's own fields.
 */
import { anyFieldIsDirty } from '../field-dirty.js';
import type { mjBizAppsOrdersOrderLineEntity } from '../generated/entity_subclasses.js';
import type { ApplicablePrice } from './PriceResolver.js';
import { isEnginePrice, moneyEqual } from './priceOverride.js';

/**
 * The picker's option values that are not ProductPrice ids.
 *
 * `Default` used to be the empty string, and that is what golive #253 item 1 was: a `<select>`
 * whose bound value names an option that is not in the DOM yet falls back to its first option, and
 * an option whose value is `""` is indistinguishable from "nothing selected". The DOM then showed
 * Default while the component believed the line was on a custom amount, so choosing Default fired
 * no change event and nothing ran. A real sentinel cannot be mistaken for absence.
 */
export const PRICE_PICK_DEFAULT = '__default__';
export const PRICE_PICK_CUSTOM = '__custom__';

/** The rules' answer for a line regardless of any pinned price, as `Orders.PriceOrder` reports it. */
export interface LineEngineDefault {
    UnitPrice: number;
    ProductPriceID: string | null;
    PriceName: string | null;
}

/** What a pick did: put the line back on the rules, or pin it off them. */
export type LinePriceChange = 'restored' | 'pinned';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/**
 * Whether the line's price is a deviation from the rules.
 *
 * The flag settles it when set. Otherwise a dirty price counts only when it differs from the
 * engine default — a saved line put back on its default carries a changed value that is not an
 * override, and saying "overridden" of it is the false statement golive #253 item 2 reported.
 */
export function IsLinePriceOverridden(
    line: mjBizAppsOrdersOrderLineEntity,
    engine: LineEngineDefault | null | undefined,
): boolean {
    const flag = line.GetFieldByName('PriceOverridden');
    if (flag && (flag.Value === true || flag.Value === 1 || flag.Value === '1')) return true;
    if (!anyFieldIsDirty(line, ['UnitPrice', 'ProductPriceID'])) return false;
    return engine ? !isEnginePrice(line, engine) : true;
}

/**
 * The named rules a picker offers BESIDES the default (golive #253 item 3).
 *
 * The rule the engine already chose is not listed: the Default row is that rule, named and priced,
 * and a second option that means the same thing is what made the picker ambiguous. A product with
 * one applicable rule therefore offers Default alone.
 */
export function NamedPricesBesideDefault(
    applicable: readonly ApplicablePrice[],
    engine: LineEngineDefault | null | undefined,
): ApplicablePrice[] {
    const chosen = uuidKey(engine?.ProductPriceID);
    if (!chosen) return [...applicable];
    return applicable.filter((p) => uuidKey(p.ID) !== chosen);
}

/**
 * Whether "back to the rules" is an answer this line can be given right now.
 *
 * An unsaved line always can: its baseline is "unpriced" and the engine fills it at save. A saved
 * line's baseline is whatever was stored — possibly the override itself — so it can only be put
 * back on the default once the pricing pass has said what that default IS.
 */
export function CanRestoreLineDefault(
    line: mjBizAppsOrdersOrderLineEntity,
    engine: LineEngineDefault | null | undefined,
): boolean {
    return !line.IsSaved || engine != null;
}

/**
 * Back to whatever the rules say. The override, its reason and any stated price all go; the flag
 * is cleared because the price is no longer a deviation, not merely hidden.
 *
 * Returns false, and leaves the line exactly as it is, for a saved line whose default is not known:
 * clearing the flag on a price that did not change would keep the concession and erase its audit
 * trail.
 */
export function RestoreLineDefault(
    line: mjBizAppsOrdersOrderLineEntity,
    engine: LineEngineDefault | null | undefined,
): boolean {
    if (line.IsSaved) {
        if (!engine) return false;
        // A saved line's baseline is whatever was stored, which may itself be the override; the
        // rules' answer is what Default promises, so that is what is written.
        stamp(line, 'UnitPrice', engine.UnitPrice);
        stamp(line, 'ProductPriceID', engine.ProductPriceID);
        stamp(line, 'PriceOverridden', false);
        stamp(line, 'PriceOverrideReason', null);
        return true;
    }
    // An unsaved line's baseline is "unpriced", which the engine fills at save — the purest form of
    // "whatever the rules say".
    const unit = line.GetFieldByName('UnitPrice');
    const named = line.GetFieldByName('ProductPriceID');
    if (unit) unit.Value = unit.OldValue;
    if (named) named.Value = named.OldValue;
    stamp(line, 'PriceOverridden', false);
    stamp(line, 'PriceOverrideReason', null);
    return true;
}

/**
 * Put the line on a named rule. A rule that IS the engine default restates the rules rather than
 * overriding them (golive #253 item 2), so it restores instead of pinning.
 *
 * Null when the line was left alone — a restore the line could not be given yet.
 */
export function PinLineToNamedPrice(
    line: mjBizAppsOrdersOrderLineEntity,
    price: ApplicablePrice,
    engine: LineEngineDefault | null | undefined,
): LinePriceChange | null {
    if (engine && isEnginePrice({ UnitPrice: price.UnitPrice, ProductPriceID: price.ID }, engine)) {
        return RestoreLineDefault(line, engine) ? 'restored' : null;
    }
    stamp(line, 'ProductPriceID', price.ID);
    stamp(line, 'UnitPrice', price.UnitPrice);
    stamp(line, 'PriceOverridden', true);
    return 'pinned';
}

/**
 * Put the line on a typed unit price. Typing the default back in is a return to the rules, not an
 * override of them (golive #253 item 2) — through {@link RestoreLineDefault}, because on a saved
 * line the baseline is the stored override, and undoing the edit would keep the old price while
 * dropping its flag and reason.
 *
 * `defaultUnit` is passed separately from `engine` because a caller may know the default amount
 * from an earlier pass while the current one has not reported the full default yet.
 */
export function PinLineToAmount(
    line: mjBizAppsOrdersOrderLineEntity,
    amount: number,
    defaultUnit: number | null,
    engine: LineEngineDefault | null | undefined,
): LinePriceChange | null {
    if (defaultUnit != null && moneyEqual(amount, defaultUnit)) {
        return RestoreLineDefault(line, engine) ? 'restored' : null;
    }
    stamp(line, 'ProductPriceID', null);
    stamp(line, 'UnitPrice', amount);
    stamp(line, 'PriceOverridden', true);
    return 'pinned';
}

export function LinePriceOverrideReason(line: mjBizAppsOrdersOrderLineEntity): string {
    const field = line.GetFieldByName('PriceOverrideReason');
    return field?.Value == null ? '' : String(field.Value);
}

/**
 * True while the line is overridden and nobody has said why (golive #253 item 4). The server
 * refuses the save on the same rule, so a screen that lets the user close the picker anyway only
 * postpones the refusal.
 */
export function LineNeedsOverrideReason(
    line: mjBizAppsOrdersOrderLineEntity,
    engine: LineEngineDefault | null | undefined,
): boolean {
    return IsLinePriceOverridden(line, engine) && LinePriceOverrideReason(line).trim() === '';
}

/** Record why the price left the rules. Whitespace is not a reason, so it is stored as none. */
export function SetLinePriceOverrideReason(line: mjBizAppsOrdersOrderLineEntity, reason: string): void {
    const trimmed = reason.trim();
    stamp(line, 'PriceOverridden', true);
    stamp(line, 'PriceOverrideReason', trimmed === '' ? null : trimmed);
}

/**
 * Write a field without making a no-op look like an edit: a value set back to what was loaded
 * leaves the field clean, so the save sends nothing for it.
 */
function stamp(line: mjBizAppsOrdersOrderLineEntity, fieldName: string, value: unknown): void {
    const field = line.GetFieldByName(fieldName);
    if (!field) return;
    const baseline = field.OldValue;
    field.Value = value;
    if (!field.Dirty) field.RestoreOldValue(baseline);
}
