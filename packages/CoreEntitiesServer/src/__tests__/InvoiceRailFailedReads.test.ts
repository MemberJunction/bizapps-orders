/**
 * A failed read on the invoice rail path stops the send instead of reading as "nothing found" (#901).
 * Each read here, answered from an empty table, would change what gets invoiced.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class FailingRunView {
            static FromMetadataProvider() {
                return new FailingRunView();
            }
            async RunView() {
                return { Success: false, ErrorMessage: 'permission denied', Results: [] };
            }
        },
    };
});

import {
    CountRailNumbersSpent,
    IssueOneUnit,
    LoadExternalInvoiceByID,
    LoadLegacySplitInvoice,
    PaidOnBillingUnit,
} from '../IssueExternalInvoiceOperation.js';
import { FindInvoiceRailProviderID } from '../InvoiceRailResolver.js';

const ORDER = '11111111-1111-1111-1111-111111111111';
const COMPANY = '22222222-2222-2222-2222-222222222222';
const PROVIDER = '33333333-3333-3333-3333-333333333333';
const provider = { EntityByName: () => ({}) } as never;
const user = {} as never;
const unit = { OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null };

describe('failed reads on the invoice rail path (#901)', () => {
    it('CountRailNumbersSpent throws rather than reporting no numbers spent', async () => {
        await expect(CountRailNumbersSpent(PROVIDER, unit, provider, user)).rejects.toThrow(/rail numbers.*permission denied/);
    });

    it('PaidOnBillingUnit throws rather than reporting nothing paid', async () => {
        await expect(PaidOnBillingUnit(ORDER, null, provider, user)).rejects.toThrow(/payments.*permission denied/);
    });

    it('LoadLegacySplitInvoice throws rather than reporting no split invoice', async () => {
        await expect(LoadLegacySplitInvoice(ORDER, COMPANY, provider, user)).rejects.toThrow(/earlier invoices.*permission denied/);
    });

    it('LoadExternalInvoiceByID throws rather than reporting the row missing', async () => {
        await expect(LoadExternalInvoiceByID(PROVIDER, provider, user)).rejects.toThrow(/permission denied/);
    });

    it('IssueOneUnit throws rather than refusing as "No order with ID"', async () => {
        await expect(IssueOneUnit(unit, { Preview: true, AllowReissue: false }, provider, user)).rejects.toThrow(/Could not read order/);
    });

    it('FindInvoiceRailProviderID throws rather than reporting no rail', async () => {
        await expect(FindInvoiceRailProviderID(COMPANY, provider, user)).rejects.toThrow(/permission denied/);
    });
});
