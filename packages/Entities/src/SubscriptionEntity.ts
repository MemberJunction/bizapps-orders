/**
 * @fileoverview `SubscriptionEntity` — shared entity subclass for Subscriptions.
 *
 * Once a payment gateway bills a subscription (`IsProviderBilled`), the gateway charges the card each
 * period. A change made only on the Orders side then leaves the two out of step, and every such change
 * costs a customer money or access: AutoRenew unticked while the gateway still renews, a status set to
 * Canceled while the gateway still charges, the gateway id cleared so Orders renews it as well.
 *
 * So the columns the gateway's billing depends on (`PROVIDER_BILLED_FIELDS`) are fixed on a subscription
 * that was loaded gateway-billed. This class runs on every tier, so the edit form shows the reason before
 * a round trip, and every server path — a Remote Operation, an order save, the generic API — meets the
 * same rule. The writes that do tell the gateway (cancelling, which cancels at the gateway first; the
 * record step that links a new gateway subscription) are sanctioned by the server subclass
 * (`SanctionProviderBilledChange`), never by a flag a client could set.
 *
 * Linking — a subscription loaded with no gateway id gaining one — is not a change to a gateway-billed
 * subscription and stays open: the checkout hand-over and the importers do it.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersSubscriptionEntity } from './generated/entity_subclasses';
import { PROVIDER_BILLED_FIELDS, ProviderBilledChangeRefusal } from './provider-billed';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscriptions')
export class SubscriptionEntity extends mjBizAppsOrdersSubscriptionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.refuseUnsanctionedProviderBilledChanges(result);
        return result;
    }

    /**
     * True when the gateway billed this subscription as loaded: the id it carried before this save.
     * A subscription gaining its first id on this save is being linked, not changed.
     */
    public get LoadedProviderBilled(): boolean {
        if (!this.IsSaved) return false;
        const field = this.GetFieldByName('ProviderSubscriptionID');
        return field != null && field.OldValue != null;
    }

    /**
     * True only for a server write that has told the gateway. The server subclass overrides it; here,
     * where any caller could set a flag, nothing is sanctioned.
     */
    protected ProviderBilledChangeSanctioned(): boolean {
        return false;
    }

    private refuseUnsanctionedProviderBilledChanges(result: ValidationResult): void {
        if (!this.LoadedProviderBilled || this.ProviderBilledChangeSanctioned()) return;
        const dirty = PROVIDER_BILLED_FIELDS.filter((name) => this.GetFieldByName(name)?.Dirty === true);
        if (dirty.length === 0) return;
        const loadedID = this.GetFieldByName('ProviderSubscriptionID')?.OldValue as string | null;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                dirty[0],
                ProviderBilledChangeRefusal(loadedID, dirty.join(', ')),
                this.GetFieldByName(dirty[0])?.Value,
                ValidationErrorType.Failure,
            ),
        );
    }
}
