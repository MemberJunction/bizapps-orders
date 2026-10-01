/**
 * @fileoverview `SubscriptionTermEntity` — shared entity subclass for Subscription Terms.
 *
 * A term is written once, when the order line that bought it is confirmed. Its dates and amount are
 * what the journal entries and the recognition schedule were built from, and what the renewal keys
 * off. Nothing guarded them, so a booked term's end date could be moved on any save — which is also
 * how a term was extended at no charge with no value recorded and no approval sought.
 *
 * So a saved term's dates and amount are fixed. Extending one is a concession: record it as a
 * Duration `OrderConcession`, which values it at the term's own rate and routes it for approval.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersSubscriptionTermEntity } from './generated/entity_subclasses';

/** Term columns the booking and the recognition schedule were built from. */
export const SUBSCRIPTION_TERM_BOOKED_FIELDS = ['StartDate', 'EndDate', 'Amount'] as const;

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Terms')
export class SubscriptionTermEntity extends mjBizAppsOrdersSubscriptionTermEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.refuseBookedTermEdits(result);
        return result;
    }

    private refuseBookedTermEdits(result: ValidationResult): void {
        if (!this.IsSaved) return;
        const dirty = SUBSCRIPTION_TERM_BOOKED_FIELDS.filter((name) => this.GetFieldByName(name)?.Dirty === true);
        if (dirty.length === 0) return;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                dirty[0],
                `A booked term cannot change ${dirty.join(', ')}: the order's journal entries and the ` +
                    `recognition schedule were built from them. To extend a term at no charge, record a ` +
                    `Duration concession against it so it is valued and approved.`,
                this.GetFieldByName(dirty[0])?.Value,
                ValidationErrorType.Failure,
            ),
        );
    }
}
