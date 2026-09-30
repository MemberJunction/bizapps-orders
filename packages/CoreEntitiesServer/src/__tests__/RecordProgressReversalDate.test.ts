/**
 * Where `Orders.RecordProgress` books a supersede's reversal, and what a failed batch read means.
 *
 * The two batch reads share one query and differ in one thing: the closed-period WARNING fails open
 * (a hint must not block an attestation), and the reversal DATE fails closed (guessing "open" would
 * book into a period finance has closed). Both are asserted here against a stubbed batch read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Posting dates of the Posted batches the stub returns, filtered the way the query filters. */
    posted: [] as string[],
    /** When set, the read reports failure with this message. */
    fail: null as string | null,
    /** When set, the read throws. */
    throws: false,
    filters: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        static FromMetadataProvider() {
            return new StubRunView();
        }
        async RunView(params: { ExtraFilter: string }) {
            mocks.filters.push(params.ExtraFilter);
            if (mocks.throws) throw new Error('connection reset');
            if (mocks.fail) return { Success: false, ErrorMessage: mocks.fail, Results: [] };
            const from = /PostingDate >= '(\d{4}-\d{2}-\d{2})'/.exec(params.ExtraFilter)?.[1] ?? '0000-00-00';
            const to = /DATEADD\(month, 1, '(\d{4}-\d{2})-01'\)/.exec(params.ExtraFilter)?.[1];
            const rows = mocks.posted
                .filter((d) => d >= from && (!to || d.slice(0, 7) <= to))
                .sort()
                .map((d, i) => ({ JournalEntryBatchNumber: `B${i + 1}`, PostingDate: d }));
            return { Success: true, Results: rows };
        }
    }
    return { ...actual, RunView: StubRunView };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RecordProgressOperation } from '../RecordProgressOperation.js';

const COMPANY = '11111111-2222-4333-8444-555555555555';

interface Internals {
    reversalDate(line: { CompanyID: string | null }, replacedDate: string, p: IMetadataProvider, u: UserInfo): Promise<{ Date: string } | { Refusal: string }>;
    closedPeriodWarning(line: { CompanyID: string | null }, date: string, p: IMetadataProvider, u: UserInfo): Promise<string | null>;
}
const op = new RecordProgressOperation() as unknown as Internals;
const line = { CompanyID: COMPANY };
const provider = {} as IMetadataProvider;
const user = {} as UserInfo;

beforeEach(() => {
    mocks.posted = [];
    mocks.fail = null;
    mocks.throws = false;
    mocks.filters = [];
});

describe('reversal date', () => {
    it('stays on the replaced date while that month has no posted batch', async () => {
        mocks.posted = ['2026-07-31'];
        expect(await op.reversalDate(line, '2026-08-31', provider, user)).toEqual({ Date: '2026-08-31' });
    });

    it('moves to day 1 of the first later month with no posted batch', async () => {
        mocks.posted = ['2026-08-31', '2026-09-30', '2026-11-30'];
        expect(await op.reversalDate(line, '2026-08-31', provider, user)).toEqual({ Date: '2026-10-01' });
    });

    it("reads the line's company, Posted only, from the replaced month on", async () => {
        await op.reversalDate(line, '2026-08-31', provider, user);
        expect(mocks.filters[0]).toContain(`CompanyID = '${COMPANY}'`);
        expect(mocks.filters[0]).toContain(`Status = 'Posted'`);
        expect(mocks.filters[0]).toContain(`PostingDate >= '2026-08-01'`);
        expect(mocks.filters[0]).not.toContain('DATEADD');
    });

    it('refuses when the read reports failure', async () => {
        mocks.fail = 'no permission on Journal Entry Batches';
        const out = await op.reversalDate(line, '2026-08-31', provider, user);
        expect(out).toHaveProperty('Refusal');
        expect((out as { Refusal: string }).Refusal).toMatch(/no permission on Journal Entry Batches/);
        expect((out as { Refusal: string }).Refusal).toMatch(/nothing was superseded/);
    });

    it('refuses when the read throws', async () => {
        mocks.throws = true;
        expect(await op.reversalDate(line, '2026-08-31', provider, user)).toHaveProperty('Refusal');
    });

    it('a line with no company has nothing to test against and keeps the replaced date', async () => {
        mocks.throws = true;
        expect(await op.reversalDate({ CompanyID: null }, '2026-08-31', provider, user)).toEqual({ Date: '2026-08-31' });
    });
});

describe('closed-period warning, on the same query', () => {
    it('names the batch when the month is posted', async () => {
        mocks.posted = ['2026-08-31'];
        expect(await op.closedPeriodWarning(line, '2026-08-31', provider, user)).toMatch(/batch B1/);
    });

    it('is bounded to the one month', async () => {
        mocks.posted = ['2026-09-30'];
        expect(await op.closedPeriodWarning(line, '2026-08-31', provider, user)).toBeNull();
    });

    it('still fails open', async () => {
        mocks.fail = 'accounting is not installed';
        expect(await op.closedPeriodWarning(line, '2026-08-31', provider, user)).toBeNull();
        mocks.fail = null;
        mocks.throws = true;
        expect(await op.closedPeriodWarning(line, '2026-08-31', provider, user)).toBeNull();
    });
});
