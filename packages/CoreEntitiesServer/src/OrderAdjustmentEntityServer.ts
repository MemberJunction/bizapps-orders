/**
 * OrderAdjustment server subclass — a recorded discount is not rewritten or removed by hand.
 *
 * An adjustment row is how the confirm gate sees a manual discount held for approval: a row with no
 * promotion, no authority and no approver (`HeldManualDiscounts`, golive #328). The line's own
 * `DiscountAmount` carries the money; the row is the only thing saying the discount still needs a
 * decision. So a row that could be edited would let whoever recorded a held discount stamp an
 * authority or an approver on it, or delete it, and the gate would stop seeing a discount the line
 * still gives away.
 *
 *   · A saved row's authorization (`AuthorizedBySalesAuthorityID`, `ApprovedByUserID`,
 *     `ApprovedAt`) and what it discounts (`Amount`, `OrderLineID`, `PromotionID`,
 *     `PromotionCodeID`) are set once, when Orders writes it (`WriteAdjustments`). Nothing updates
 *     those afterwards, so any change to them is refused.
 *   · A row is deleted only by an order's own save: removing a draft line's dependents, and
 *     replacing the promotion rows a re-decided line had (`DeletePromotionAdjustments`). Both set
 *     {@link RemovedByOrderSave} on the row they delete. It is a property of this object, not a
 *     field, so no API caller can send it.
 *
 * A new row is not checked here: the save path decides its authorization, and a row inserted
 * directly takes no money off any line.
 */
import { BaseEntity, BaseEntityResult, type EntityDeleteOptions, type EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderAdjustmentEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ADJUSTMENT_ENTITY = 'MJ_BizApps_Orders: Order Adjustments';

/** Who authorized the discount. Changing these would decide a held discount without an approval. */
const AUTHORIZATION_FIELDS = ['AuthorizedBySalesAuthorityID', 'ApprovedByUserID', 'ApprovedAt'] as const;
/** What the discount is and where it applies. The line's money was stamped from these. */
const DISCOUNT_FIELDS = ['Amount', 'OrderLineID', 'PromotionID', 'PromotionCodeID'] as const;

@RegisterClass(BaseEntity, ORDER_ADJUSTMENT_ENTITY)
export class OrderAdjustmentEntityServer extends mjBizAppsOrdersOrderAdjustmentEntity {
    /**
     * Set only by an order's own save, on a row it is about to delete: a removed draft line's
     * dependents (`OrderEntityServer.deleteLineDependents`) and a re-decided line's promotion rows
     * (`DeletePromotionAdjustments`).
     */
    public RemovedByOrderSave = false;

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            const problem = this.updateRefusal();
            if (problem) {
                this.RegisterResultHistoryEntry(this.buildRejection(problem, 'update'));
                return false;
            }
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.RemovedByOrderSave) {
            this.RegisterResultHistoryEntry(
                this.buildRejection(
                    'An order adjustment is the record of a discount on the order and cannot be deleted directly. ' +
                        'It is removed with its line, or replaced when the order re-decides its promotions.',
                    'delete',
                ),
            );
            return false;
        }
        return super.Delete(options);
    }

    private updateRefusal(): string | null {
        const changed = (names: readonly string[]) => names.filter((n) => this.GetFieldByName(n)?.Dirty === true);
        const authorization = changed(AUTHORIZATION_FIELDS);
        if (authorization.length) {
            return (
                `An order adjustment's authorization (${authorization.join(', ')}) is recorded when the discount is ` +
                `given and cannot be changed afterwards. A discount that needs approval is approved by recording a ` +
                `concession for its line.`
            );
        }
        const discount = changed(DISCOUNT_FIELDS);
        if (discount.length) {
            return (
                `An order adjustment's discount (${discount.join(', ')}) cannot be changed once recorded. ` +
                `Give the line a new discount on the order instead.`
            );
        }
        return null;
    }

    private buildRejection(message: string, type: 'update' | 'delete'): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderAdjustmentEntityServer(): void {
    // intentionally empty
}
