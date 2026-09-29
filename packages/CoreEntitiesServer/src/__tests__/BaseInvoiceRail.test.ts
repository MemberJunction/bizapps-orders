/**
 * The base invoice rail implements nothing, and says so in a way the resolver can detect and a
 * developer can act on. Every verb refuses PERMANENTLY (a missing implementation is not a network
 * blip the sweep should retry) and names the type code it was asked for.
 */
import { describe, it, expect } from 'vitest';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';

const rail = (): BaseInvoiceRail => {
    const r = new BaseInvoiceRail();
    r.Config = { PaymentProviderID: 'p', TypeCode: 'Nothing', CompanyID: 'c', Name: 'n', IsLiveMode: false, CompanyIntegrationID: null };
    return r;
};

describe('BaseInvoiceRail', () => {
    it('refuses every verb, permanently, naming the type', async () => {
        const r = await rail().IssueInvoice({ DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: null, Amount: 1, ExternalCustomerRef: '0cu', Lines: [], Memo: null });
        expect(r.Success).toBe(false);
        if (!r.Success) {
            expect(r.Transient).toBe(false);
            expect(r.Reason).toContain("'Nothing'");
            expect(r.Reason).toMatch(/@RegisterClass\(BaseInvoiceRail/);
        }
    });

    it('every other verb refuses the same way', async () => {
        const r = rail();
        const results = await Promise.all([
            r.EnsureCustomer({ PartyKind: 'Organization', PartyID: 'o', Name: 'Acme', Email: 'a@b.c', AddressLines: [], City: null, State: null, PostalCode: null, Country: null }),
            r.GetInvoice('00e'),
            r.CancelInvoice('00e'),
            r.FetchPaymentsSince(null),
        ]);
        for (const x of results) {
            expect(x.Success).toBe(false);
            if (!x.Success) expect(x.Transient).toBe(false);
        }
    });
});
