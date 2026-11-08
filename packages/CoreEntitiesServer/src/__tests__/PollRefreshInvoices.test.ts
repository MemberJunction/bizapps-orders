/**
 * The refresh after a capture writes each BILL invoice's status and due amount to its own row (#580).
 *
 * The rows come from an unordered query that leaves out invoices no longer `Sent`. Pairing them with
 * the payment's refs by position put one invoice's figures on another's row; these cases hand the
 * rows back in a different order from the refs, and with one ref missing, and check every write.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Row ID → fields each updateExternalInvoice call wrote. */
    writes: [] as Array<{ id: string; fields: Record<string, unknown> }>,
}));

vi.mock('../IssueExternalInvoiceOperation.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../IssueExternalInvoiceOperation.js')>();
    return {
        ...actual,
        updateExternalInvoice: async (_provider: unknown, _user: unknown, id: string, fields: Record<string, unknown>) => {
            mocks.writes.push({ id, fields });
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { BaseInvoiceRail } from '../BaseInvoiceRail.js';
import type { ExternalInvoiceRow } from '../IssueExternalInvoiceOperation.js';
import { refreshInvoices } from '../PollExternalPaymentsOperation.js';

/** The rail's view of each invoice, by ref. */
const railInvoices: Record<string, { DueAmount: number; Status: string }> = {
    'inv-a': { DueAmount: 0, Status: 'PAID_IN_FULL' },
    'inv-b': { DueAmount: 40, Status: 'PARTIALLY_PAID' },
    'inv-c': { DueAmount: 0, Status: 'PAID_IN_FULL' },
};

const fakeRail = {
    GetInvoice: async (ref: string) => ({ Success: true, Value: railInvoices[ref] ?? null }),
} as unknown as BaseInvoiceRail;

const row = (id: string, ref: string | null) => ({ ID: id, ExternalInvoiceRef: ref }) as unknown as ExternalInvoiceRow;

const run = (rows: ExternalInvoiceRow[]) => refreshInvoices(fakeRail, rows, {} as IMetadataProvider, {} as UserInfo);

const written = () => Object.fromEntries(mocks.writes.map((w) => [w.id, [w.fields.ExternalStatus, w.fields.ExternalDueAmount]]));

describe('refreshInvoices', () => {
    beforeEach(() => {
        mocks.writes = [];
    });

    it('writes each row from its own ref when the rows come back in another order', async () => {
        // The payment lists inv-a then inv-b; the query returned row B first.
        await run([row('row-b', 'inv-b'), row('row-a', 'inv-a')]);
        expect(written()).toEqual({
            'row-a': ['PAID_IN_FULL', 0],
            'row-b': ['PARTIALLY_PAID', 40],
        });
    });

    it('does not shift later rows when a ref has no Sent row', async () => {
        // The payment covers inv-a, inv-b and inv-c; inv-a's row is no longer Sent, so it is not loaded.
        await run([row('row-b', 'inv-b'), row('row-c', 'inv-c')]);
        expect(written()).toEqual({
            'row-b': ['PARTIALLY_PAID', 40],
            'row-c': ['PAID_IN_FULL', 0],
        });
    });

    it('skips a row with no ref', async () => {
        await run([row('row-x', null), row('row-a', 'inv-a')]);
        expect(written()).toEqual({ 'row-a': ['PAID_IN_FULL', 0] });
    });
});
