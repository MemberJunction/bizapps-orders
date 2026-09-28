/**
 * The number a re-issue carries after a cancel, through the code that counts, not just the rule.
 *
 * WHY THE PURE TEST IS NOT ENOUGH. `ReissueDocumentNumber` is trivially right; the part that can be
 * wrong is WHICH prior rows count as having spent a number. Bill.com keeps an archived invoice's
 * `invoiceNumber` and refuses a duplicate (spike S4), so a row that reached the rail consumes its
 * number for ever — but a row that never reached it consumed nothing, and counting those would skip
 * a perfectly free number and hand the customer `ORD-1234-R1` for a document nobody has ever seen.
 * That distinction lives in a SQL filter, which only this kind of test can look at.
 */
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    lastFilter: '' as string,
    rows: [] as Array<{ ID: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { ExtraFilter?: string }) {
                mocks.lastFilter = params.ExtraFilter ?? '';
                return { Success: true, Results: mocks.rows };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CountRailNumbersSpent } from '../IssueExternalInvoiceOperation.js';
import { ReissueDocumentNumber } from '../InvoiceBehavior.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const COMPANY = 'bbbbbbbb-2222-4333-8444-555555555555';
const INSTALMENT = 'cccccccc-2222-4333-8444-555555555555';

const count = (unit: { OrderHeaderID: string; CompanyID: string; OrderHeaderPaymentScheduleID: string | null }) =>
    CountRailNumbersSpent(PROVIDER, unit, {} as IMetadataProvider, {} as UserInfo);

describe('counting the numbers a unit has already spent', () => {
    it('only counts rows that actually reached the rail', async () => {
        mocks.rows = [];
        await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null });
        // A send the rail refused wrote a Failed row with no reference; its number is still free.
        expect(mocks.lastFilter).toContain('ExternalInvoiceRef IS NOT NULL');
    });

    it('scopes to the billing unit, not the order', async () => {
        mocks.rows = [];
        await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null });
        expect(mocks.lastFilter).toContain(`OrderHeaderID = '${ORDER}'`);
        expect(mocks.lastFilter).toContain(`CompanyID = '${COMPANY}'`);
        // A whole-order unit is the one with no instalment — company B's rows must not raise A's suffix.
        expect(mocks.lastFilter).toContain('OrderHeaderPaymentScheduleID IS NULL');
    });

    it('names the instalment when there is one', async () => {
        mocks.rows = [];
        await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: INSTALMENT });
        expect(mocks.lastFilter).toContain(`OrderHeaderPaymentScheduleID = '${INSTALMENT}'`);
    });

    it('a cancel then a re-issue produces -R1, and a second produces -R2', async () => {
        // First send: nothing spent.
        mocks.rows = [];
        expect(ReissueDocumentNumber('ORD-1234', await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }))).toBe('ORD-1234');

        // ORD-1234 was created on the rail and then cancelled — the rail still owns that number.
        mocks.rows = [{ ID: 'first' }];
        expect(ReissueDocumentNumber('ORD-1234', await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }))).toBe('ORD-1234-R1');

        // ORD-1234-R1 was created and cancelled too.
        mocks.rows = [{ ID: 'first' }, { ID: 'second' }];
        expect(ReissueDocumentNumber('ORD-1234', await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }))).toBe('ORD-1234-R2');
    });

    it('carries the company suffix into the re-issue on a split order', async () => {
        mocks.rows = [{ ID: 'first' }];
        expect(ReissueDocumentNumber('ORD-1234-B', await count({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }))).toBe('ORD-1234-B-R1');
    });
});
