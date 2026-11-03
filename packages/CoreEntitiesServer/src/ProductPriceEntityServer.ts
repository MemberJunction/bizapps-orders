/**
 * ProductPrice server subclass — refuses an AMBIGUOUS rule set when it is written (plan D69).
 *
 * WHY AT WRITE TIME
 * `PickPriceRule` reports a priority tie rather than resolving it, so an ambiguous set fails at
 * ORDER time — which is the worst possible moment: a customer is waiting, the person who created
 * the collision is elsewhere, and the failure looks like a bug in pricing rather than a gap in
 * configuration. Catching it as the second rule is saved puts the error in front of the person who
 * caused it, while they still have the context to fix it.
 *
 * It is deliberately NOT a database constraint. Ambiguity is not a property of a row — two rows are
 * only ambiguous relative to a quantity and a moment, because non-overlapping quantity bands or
 * disjoint seasons make equal priorities perfectly legitimate. A UNIQUE index would forbid a great
 * deal of correct configuration to prevent one specific mistake.
 *
 * WHAT COUNTS AS A COLLISION
 * Same product, same price list, same fee type, same priority, with OVERLAPPING quantity bands AND
 * overlapping absolute windows. Recurrence is not considered: a monthly and a weekday rule can
 * genuinely never coincide, and proving that here would mean reimplementing the applicability
 * engine against every possible date. The order-time check remains the backstop for the cases this
 * cannot see — this catches the common, obvious, avoidable ones.
 *
 * CONNECTS TO:
 *   PURE:  ./PricingBehavior.ts (PickPriceRule — the reader this protects)
 *   DOC:   plans/archive/pricing-schema.md
 */
import { BaseEntity, ValidationErrorInfo, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    IsCompositeFilter,
    LoadOrdersEngine,
    ORGANIZATION_REVENUE_SOURCE,
    OrdersEngine,
    ParseFilterField,
    ProductPriceEntity,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
} from '@mj-biz-apps/orders-entities';

const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const REVENUE_FIELD = 'AnnualRevenue';

interface RevenueInterval {
    min: number;
    minInclusive: boolean;
    max: number;
    maxInclusive: boolean;
}

/**
 * Extract the `[min, max]` interval on `BillToOrganizationRevenue.AnnualRevenue` when a price row's
 * Applicability is an `and`-conjunction of revenue bounds, or null when the row does not constrain
 * revenue to a single interval.
 */
function parseRevenueInterval(applicabilityJson: string | null | undefined): RevenueInterval | null {
    if (applicabilityJson == null || String(applicabilityJson).trim() === '') return null;
    let parsed: CompositeFilterDescriptor | FilterDescriptor;
    try {
        parsed = JSON.parse(applicabilityJson) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return null;
    }
    const rules: FilterDescriptor[] = [];
    const collect = (node: CompositeFilterDescriptor | FilterDescriptor | null | undefined): boolean => {
        if (!node) return true;
        if (IsCompositeFilter(node)) {
            if (node.logic === 'or') return false;
            return (node.filters ?? []).every((child) => collect(child));
        }
        const { source, name } = ParseFilterField(node.field);
        if (source === ORGANIZATION_REVENUE_SOURCE && name === REVENUE_FIELD) {
            rules.push(node);
        }
        return true;
    };
    if (!collect(parsed) || rules.length === 0) return null;

    let min = -Infinity;
    let minInclusive = false;
    let max = Infinity;
    let maxInclusive = false;
    for (const rule of rules) {
        const val = typeof rule.value === 'number' ? rule.value : Number(rule.value);
        if (!Number.isFinite(val)) return null;
        switch (rule.operator) {
            case 'gte':
                if (val > min) {
                    min = val;
                    minInclusive = true;
                }
                break;
            case 'gt':
                if (val > min || (val === min && minInclusive)) {
                    min = val;
                    minInclusive = false;
                }
                break;
            case 'lte':
                if (val < max) {
                    max = val;
                    maxInclusive = true;
                }
                break;
            case 'lt':
                if (val < max || (val === max && maxInclusive)) {
                    max = val;
                    maxInclusive = false;
                }
                break;
            case 'eq':
                if (val > min) {
                    min = val;
                    minInclusive = true;
                }
                if (val < max) {
                    max = val;
                    maxInclusive = true;
                }
                break;
            default:
                return null;
        }
    }
    if (min > max || (min === max && (!minInclusive || !maxInclusive))) {
        return null;
    }
    return { min, minInclusive, max, maxInclusive };
}

/** Whether two rows' revenue-band intervals can match the same organization revenue. */
function revenueBandsOverlap(aJson: string | null | undefined, bJson: string | null | undefined): boolean {
    const a = parseRevenueInterval(aJson);
    const b = parseRevenueInterval(bJson);
    if (!a || !b) return true;
    if (a.min > b.max || (a.min === b.max && (!a.minInclusive || !b.maxInclusive))) return false;
    if (b.min > a.max || (b.min === a.max && (!b.minInclusive || !a.maxInclusive))) return false;
    return true;
}

interface SiblingRow {
    ID: string;
    Priority: number;
    MinQuantity: number | null;
    MaxQuantity: number | null;
    EffectiveFrom: Date;
    EffectiveTo: Date | null;
    Description: string | null;
}

/** Do two [min,max] bands overlap? Null bounds are open. */
function bandsOverlap(
    aMin: number | null,
    aMax: number | null,
    bMin: number | null,
    bMax: number | null,
): boolean {
    const lo1 = aMin ?? -Infinity;
    const hi1 = aMax ?? Infinity;
    const lo2 = bMin ?? -Infinity;
    const hi2 = bMax ?? Infinity;
    return lo1 <= hi2 && lo2 <= hi1;
}

/** Do two date windows overlap? Null end is open. */
function windowsOverlap(aFrom: Date, aTo: Date | null, bFrom: Date, bTo: Date | null): boolean {
    const s1 = new Date(aFrom).getTime();
    const e1 = aTo ? new Date(aTo).getTime() : Infinity;
    const s2 = new Date(bFrom).getTime();
    const e2 = bTo ? new Date(bTo).getTime() : Infinity;
    return s1 <= e2 && s2 <= e1;
}

@RegisterClass(BaseEntity, PRODUCT_PRICE_ENTITY)
export class ProductPriceEntityServer extends ProductPriceEntity {
    /** BaseEntity skips ValidateAsync by default; without this the check never runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.Status !== 'Active') return result; // an inactive rule collides with nothing
        const productCategoryID = this.ProductCategoryID;
        if (!this.ProductID && !productCategoryID) return result;

        await LoadOrdersEngine(this.ProviderToUse as never, this.ContextCurrentUser);
        const listKey = (this.PriceListID ?? '').toLowerCase();
        const fee = String(this.FeeType);
        const priority = Number(this.Priority);
        const catKey = (productCategoryID ?? '').toLowerCase();
        const productKey = (this.ProductID ?? '').toLowerCase();
        const siblings = OrdersEngine.Instance.ProductPrices.filter((o) => {
            if (this.IsSaved && o.ID === this.ID) return false;
            if (o.Status !== 'Active') return false;
            if (String(o.FeeType) !== fee) return false;
            if (Number(o.Priority) !== priority) return false;
            if ((o.PriceListID ?? '').toLowerCase() !== listKey) return false;
            if (this.ProductID) return (o.ProductID ?? '').toLowerCase() === productKey;
            return (o.ProductCategoryID ?? '').toLowerCase() === catKey;
        });

        const clash = siblings.find(
            (o) =>
                bandsOverlap(this.MinQuantity, this.MaxQuantity, o.MinQuantity, o.MaxQuantity) &&
                windowsOverlap(this.EffectiveFrom, this.EffectiveTo, o.EffectiveFrom, o.EffectiveTo) &&
                revenueBandsOverlap(this.Applicability, o.Applicability),
        );

        if (clash) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'ProductPriceEntityServer.ValidateAsync',
                    `This price rule collides with an existing one: both have priority ${this.Priority}, overlapping ` +
                        `quantity bands and overlapping effective windows for the same product or category, price list and fee ` +
                        `type. The other is ${clash.Description?.trim() || clash.ID}. Pricing resolves by highest ` +
                        `priority and refuses to break a tie, so an order using either quantity would fail. Give one ` +
                        `of them a different priority, narrow a quantity band, or separate the date windows.`,
                    null,
                ),
            );
        }

        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadProductPriceEntityServer(): void {
    // intentionally empty
}
