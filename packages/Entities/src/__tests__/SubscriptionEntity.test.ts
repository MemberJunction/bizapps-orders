import { describe, expect, it } from 'vitest';
import { SubscriptionEntity } from '../SubscriptionEntity';
import { IsProviderBilled, PROVIDER_BILLED_FIELDS, ProviderBilledChangeRefusal, ProviderLinkRefusal } from '../provider-billed';

/**
 * The gateway-billed columns, WRITTEN OUT rather than read from `PROVIDER_BILLED_FIELDS` (Robert, R2).
 * A test that loops over the constant cannot notice a field dropped from it: the loop just gets shorter.
 * These names are the contract; the constant is checked against them.
 */
const GATEWAY_BILLED_COLUMNS = [
    'Status',
    'AutoRenew',
    'StartDate',
    'EndDate',
    'CanceledAt',
    'ProductID',
    'SubscriptionTypeID',
    'MigratesToSubscriptionID',
    'MigratesFromSubscriptionID',
    'PaymentProviderID',
    'ProviderSubscriptionID',
] as const;

/** A server-style subclass: the one way a write is sanctioned. */
class SanctionedSubscription extends SubscriptionEntity {
    protected override ProviderBilledChangeSanctioned(): boolean {
        return true;
    }
}

/**
 * A subscription a payment gateway bills changes only where the gateway is told (E2b, bizapps-orders#972).
 *
 * Before: on Jane's Stripe-billed SUB-000110 the edit form saved AutoRenew unticked, Status Canceled, a new
 * product, or a cleared `ProviderSubscriptionID`; Stripe kept charging $599 each year, and the cleared id
 * made Spawn Renewals bill her a second time. After: every one of those is refused on every tier, unless
 * the server sanctioned the write after telling the gateway. These drive the real `Validate()` override on
 * an instance held with `Object.create`, the house pattern for entity tests that stand up no metadata.
 */
function validate(opts: {
    saved: boolean;
    loadedID: string | null;
    dirty: string[];
    sanctioned?: boolean;
    /** The gateway id this save writes, when `ProviderSubscriptionID` is dirty. Default `sub_new`. */
    newID?: string | null;
    cls?: typeof SubscriptionEntity;
}) {
    const sub = Object.create((opts.cls ?? SubscriptionEntity).prototype) as SubscriptionEntity;
    // The literal list, not the constant: a field dropped from the constant must still be dirty here.
    const names = [...new Set<string>([...GATEWAY_BILLED_COLUMNS, ...PROVIDER_BILLED_FIELDS, 'Notes', 'DefaultCustomerPaymentMethodID', 'RenewalLeadDays'])];
    const fields = new Map(
        names.map((n) => {
            const dirty = opts.dirty.includes(n);
            if (n === 'ProviderSubscriptionID') {
                const value = dirty ? (opts.newID === undefined ? 'sub_new' : opts.newID) : opts.loadedID;
                return [n, { Dirty: dirty, Value: value, OldValue: opts.loadedID }];
            }
            return [n, { Dirty: dirty, Value: dirty ? `${n}-new` : n, OldValue: n }];
        }),
    );
    Object.defineProperty(sub, 'IsSaved', { value: opts.saved });
    Object.defineProperty(sub, 'GetFieldByName', { value: (name: string) => fields.get(name) });
    Object.defineProperty(sub, 'Get', { value: (name: string) => fields.get(name)?.Value });
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
    it('the guarded list is exactly the eleven written-out columns, in order', () => {
        expect([...PROVIDER_BILLED_FIELDS]).toEqual([...GATEWAY_BILLED_COLUMNS]);
    });

    it.each(GATEWAY_BILLED_COLUMNS.map((f) => [f]))('refuses changing %s on Jane\'s Stripe-billed SUB-000110', (field) => {
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
        const result = validate({ saved: true, loadedID: 'sub_jane', dirty: ['ProviderSubscriptionID', 'PaymentProviderID'], newID: null });
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

    it('REFUSES linking a saved subscription (no id when loaded, a gateway id typed now): a typo renews it free forever, another customer\'s id cancels THEIR subscription', () => {
        // Was allowed before E2b round 2; only the sanctioned checkout hand-over may link now.
        const result = validate({ saved: true, loadedID: null, dirty: ['ProviderSubscriptionID', 'PaymentProviderID', 'AutoRenew'] });
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('ProviderSubscriptionID');
        expect(result.Errors[0].Message).toBe(ProviderLinkRefusal());
        expect(result.Errors[0].Value).toBe('sub_new');
    });

    it('refuses typing a gateway id onto Bill.com-invoiced SUB-000204 even when nothing else changes', () => {
        const result = validate({ saved: true, loadedID: null, dirty: ['ProviderSubscriptionID'], newID: 'sub_typo' });
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Message).toMatch(/recorded by Orders when it creates the gateway subscription after checkout/);
        expect(result.Errors[0].Message).toMatch(/could not be removed again/);
    });

    it('lets a sanctioned server subclass link (the checkout hand-over)', () => {
        const result = validate({ saved: true, loadedID: null, dirty: ['ProviderSubscriptionID', 'PaymentProviderID'], cls: SanctionedSubscription });
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('lets an unlinked subscription save with nothing linked, or with its id written as null', () => {
        expect(validate({ saved: true, loadedID: null, dirty: [] }).Success).toBe(true);
        expect(validate({ saved: true, loadedID: null, dirty: ['ProviderSubscriptionID'], newID: null }).Success).toBe(true);
    });

    it('lets a NEW subscription be written with a gateway id (the importer bringing over what a gateway already bills)', () => {
        const result = validate({ saved: false, loadedID: null, dirty: ['ProviderSubscriptionID', 'PaymentProviderID', 'Status'] });
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
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
        expect(ProviderBilledChangeRefusal('sub_jane')).toMatch(/Card changes, and refunds of what the gateway charged, are made at the gateway\.$/);
    });
});
