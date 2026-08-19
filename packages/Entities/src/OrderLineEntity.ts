/**
 * @fileoverview `OrderLineEntity` — shared entity subclass for Order Lines.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineEntity } from './generated/entity_subclasses';
import { OrderLineExtensionCompanion } from './OrderLineExtensionCompanion';
import { ORDER_LINE_MONEY_FIELDS } from './booked-money';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class OrderLineEntity extends mjBizAppsOrdersOrderLineEntity {
    /**
     * Extension entity (e.g. `EventOrderLine`) companion riding with this line.
     */
    public readonly Extension = this.RegisterCompanion(new OrderLineExtensionCompanion(this));

    /**
     * Runs validation on this line and fans out to the extension companion.
     */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.Extension.Validate(result);
        this.refuseBookedMoneyEdits(result);
        return result;
    }

    /**
     * A line that already carries its booking journal cannot change quantity or
     * price. New lines on a booked order are refused on the header (graph save)
     * and again in the server subclass (standalone save).
     */
    private refuseBookedMoneyEdits(result: ValidationResult): void {
        if (!this.JournalEntryID) return;
        const dirty = ORDER_LINE_MONEY_FIELDS.filter((name) => this.GetFieldByName(name)?.Dirty);
        if (dirty.length === 0) return;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                dirty[0],
                `This line is booked — it cannot change ${dirty.join(', ')}. ` +
                    `Voiding the order is how booked money is undone.`,
                this.GetFieldByName(dirty[0])?.Value,
                ValidationErrorType.Failure,
            ),
        );
    }
}
