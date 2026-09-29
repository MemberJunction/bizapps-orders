/**
 * The pure half of resolving a rail: given a config, find the registered subclass or refuse with
 * instructions. The database half (`ResolveInvoiceRail`, `FindInvoiceRailForCompany`) is covered by
 * the external-invoicing integration bundle.
 */
import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';
import { BuildInvoiceRail, InvoiceRailNotConfiguredError, INVOICE_RAIL_TYPE_CODES } from '../InvoiceRailResolver.js';

@RegisterClass(BaseInvoiceRail, 'FakeRail')
class FakeRail extends BaseInvoiceRail {}
void FakeRail;

const cfg = (code: string) => ({ PaymentProviderID: 'p', TypeCode: code, CompanyID: 'c', Name: 'n', IsLiveMode: false, CompanyIntegrationID: 'ci' });

describe('BuildInvoiceRail', () => {
    it('resolves a registered subclass and attaches config, provider and user', () => {
        const provider = {} as never;
        const user = {} as never;
        const rail = BuildInvoiceRail(cfg('FakeRail'), provider, user);
        expect(rail).toBeInstanceOf(FakeRail);
        expect(rail.Config.CompanyIntegrationID).toBe('ci');
        expect(rail.Provider).toBe(provider);
        expect(rail.User).toBe(user);
    });

    it('refuses an unregistered code with registration instructions', () => {
        expect(() => BuildInvoiceRail(cfg('Nope'), {} as never, {} as never)).toThrow(InvoiceRailNotConfiguredError);
        expect(() => BuildInvoiceRail(cfg('Nope'), {} as never, {} as never)).toThrow(/@RegisterClass\(BaseInvoiceRail, 'Nope'\)/);
    });

    it('lists BillCom as a rail-capable type code', () => {
        expect(INVOICE_RAIL_TYPE_CODES).toContain('BillCom');
    });
});
