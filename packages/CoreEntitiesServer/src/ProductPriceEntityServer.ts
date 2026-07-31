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
 *   DOC:   plans/pricing-schema.md
 */
import { BaseEntity, IRunViewProvider, RunView, ValidationErrorInfo, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersProductPriceEntity } from '@mj-biz-apps/orders-entities';

const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';

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
export class ProductPriceEntityServer extends mjBizAppsOrdersProductPriceEntity {
    /** BaseEntity skips ValidateAsync by default; without this the check never runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.Status !== 'Active') return result; // an inactive rule collides with nothing

        // Statically imported. A dynamic `import()` here violated the house rule and bought nothing:
        // `@memberjunction/core` is already imported at the top of this file for BaseEntity.
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const listClause = this.PriceListID ? `PriceListID = '${this.PriceListID}'` : `PriceListID IS NULL`;
        const notSelf = this.IsSaved ? ` AND ID <> '${this.ID}'` : '';

        const res = await rv.RunView<SiblingRow>(
            {
                EntityName: PRODUCT_PRICE_ENTITY,
                ExtraFilter:
                    `ProductID = '${this.ProductID}' AND Status = 'Active' AND ${listClause} ` +
                    `AND FeeType = '${String(this.FeeType).replace(/'/g, "''")}' ` +
                    `AND Priority = ${Number(this.Priority)}${notSelf}`,
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        // Loud on failure: silently answering "no siblings" would let the ambiguity through, and the
        // whole point is that the ambiguity is otherwise invisible until an order fails.
        if (!res?.Success) {
            throw new Error(`ProductPriceEntityServer: could not check for conflicting price rules: ${res?.ErrorMessage ?? 'unknown error'}`);
        }

        const clash = (res.Results ?? []).find(
            (o) =>
                bandsOverlap(this.MinQuantity, this.MaxQuantity, o.MinQuantity, o.MaxQuantity) &&
                windowsOverlap(this.EffectiveFrom, this.EffectiveTo, o.EffectiveFrom, o.EffectiveTo),
        );

        if (clash) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'ProductPriceEntityServer.ValidateAsync',
                    `This price rule collides with an existing one: both have priority ${this.Priority}, overlapping ` +
                        `quantity bands and overlapping effective windows for the same product, price list and fee ` +
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
