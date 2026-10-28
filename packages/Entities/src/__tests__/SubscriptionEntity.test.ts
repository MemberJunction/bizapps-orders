import { describe, expect, it } from 'vitest';
import { SubscriptionEntity } from '../SubscriptionEntity';
import { IsProviderBilled, PROVIDER_BILLED_FIELDS, ProviderBilledChangeRefusal } from '../provider-billed';

/**
 * A subscription a payment gateway bills changes only where the gateway is told (E2b, bizapps-orders#972).
 *
 * Before: on Jane's Stripe-billed SUB-000110 the edit form saved AutoRenew unticked, Status Canceled, a new
 * product, or a cleared `ProviderSubscriptionID`; Stripe kept charging $599 each year, and the cleared id
 * made Spawn Renewals bill her a second time. After: every one of those is refused on every tier, unless
 * the server sanctioned the write after telling the gateway. These drive the real `Validate()` override on
 * an instance held with `Object.create`, the house pattern for entity tests that stand up no metadata.
 */
function validate(opts: { saved: boolean; loadedID: string | null; dirty: string[]; sanctioned?: boolean }) {
    const sub = Object.create(SubscriptionEntity.prototype) as SubscriptionEntity;
    const names = [...PROVIDER_BILLED_FIELDS, 'Notes', 'DefaultCustomerPaymentMethodID', 'RenewalLeadDays'];
    const fields = new Map(
        names.map((n) => [
            n,
            {
                Dirty: opts.dirty.includes(n),
                Value: n === 'ProviderSubscriptionID' && opts.dirty.includes(n) ? 'sub_new' : n,
                OldValue: n === 'ProviderSubscriptionID' ? opts.loadedID : n,
            },
        ]),
    );
    Object.defineProperty(sub, 'IsSaved', { value: opts.saved });
    Object.defineProperty(sub, 'GetFieldByName', { value: (name: string) => fields.get(name) });
    if (opts.sanctioned) Object.defineProperty(sub, 'ProviderBilledChangeSanctioned', { value: () => true });

    // The generated validators are not what this is about; the gateway rule runs for real.
    const parent = Object.getPrototypeOf(SubscriptionEntity.prototype) as { Validate: () => unknown };
    const original = parent.Validate;
    parent.Validate = () => ({ Success: true, Errors: [] });
    try {
        return sub.Validate();
    } finally {
        parent.Validate = original;
    }
}

describe('SubscriptionEntity — a gateway-billed subscription changes only where the gateway is told', () => {
    it.each(PROVIDER_BILLED_FIELDS.map((f) => [f]))('refuses changing %s on Jane\'s Stripe-billed SUB-000110', (field) => {
        const result = validate({ saved: true, loadedID: 'sub_jane', dirty: [field] });
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe(field);
        // Says why and what to do instead, naming the gateway subscription.
        expect(result.Errors[0].Message).toMatch(/sub_jane/);
        expect(result.Errors[0].Message).toMatch(/Cancel subscription, which also cancels it at the gateway/);
    });

    it('names every gateway-billed field being changed', () => {
        const result = validate({ saved: true, loadedID: 'sub_jane', dirty: ['AutoRenew', 'Status'] });
        expect(result.Errors[0].Message).toMatch(/Status, AutoRenew/);
    });

    it('refuses clearing the gateway id, which would make Orders renew it as well (a double charge)', () => {
        const result = validate({ saved: true, loadedID: 'sub_jane', dirty: ['ProviderSubscriptionID', 'PaymentProviderID'] });
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Message).toMatch(/PaymentProviderID, ProviderSubscriptionID/);
    });

    it('lets the server write it once the gateway has been told (the cancel, the fresh start)', () => {
        expect(validate({ saved: true, loadedID: 'sub_jane', dirty: ['Status', 'AutoRenew', 'EndDate', 'CanceledAt'], sanctioned: true }).Success).toBe(true);
    });

    it('lets a gateway-billed subscription change what the gateway does not bill on, such as its notes or renewal card', () => {
        expect(validate({ saved: true, loadedID: 'sub_jane', dirty: ['Notes', 'DefaultCustomerPaymentMethodID', 'RenewalLeadDays'] }).Success).toBe(true);
    });

    it('lets a subscription no gateway bills change exactly as before (the team subscription invoiced through Bill.com)', () => {
        expect(validate({ saved: true, loadedID: null, dirty: ['Status', 'AutoRenew', 'ProductID', 'EndDate'] }).Success).toBe(true);
    });

    it('lets a subscription be linked: no id when loaded, the gateway id and account written now (the checkout hand-over, the importer)', () => {
        expect(validate({ saved: true, loadedID: null, dirty: ['ProviderSubscriptionID', 'PaymentProviderID', 'AutoRenew'] }).Success).toBe(true);
    });

    it('lets a new subscription be written with a gateway id', () => {
        expect(validate({ saved: false, loadedID: null, dirty: ['ProviderSubscriptionID', 'PaymentProviderID', 'Status'] }).Success).toBe(true);
    });

    it('nothing on this tier can sanction a write: the base answer is no', () => {
        const sub = Object.create(SubscriptionEntity.prototype) as { ProviderBilledChangeSanctioned(): boolean };
        expect(sub.ProviderBilledChangeSanctioned()).toBe(false);
    });
});

describe('IsProviderBilled and the refusal text', () => {
    it('a gateway bills a subscription exactly when it carries a gateway id', () => {
        expect(IsProviderBilled({ ProviderSubscriptionID: 'sub_jane' })).toBe(true);
        expect(IsProviderBilled({ ProviderSubscriptionID: null })).toBe(false);
        expect(IsProviderBilled({})).toBe(false);
    });

    it('the refusal names the id when there is one and reads without it', () => {
        expect(ProviderBilledChangeRefusal('sub_jane', 'AutoRenew')).toMatch(/bills this subscription \(sub_jane\), so AutoRenew cannot be changed/);
        expect(ProviderBilledChangeRefusal(null)).toMatch(/bills this subscription, so it cannot be changed/);
    });
});
