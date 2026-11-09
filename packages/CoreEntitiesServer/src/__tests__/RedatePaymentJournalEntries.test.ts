/**
 * Changing a captured payment's date moves its journal entries through accounting's
 * `Accounting.RedatePendingJournalEntries` (bc-aidp-next-golive#448), and accounting's refusal —
 * an entry already batched — reaches the person as the reason the date did not change. The
 * operation is resolved by key, so with accounting not loaded the change fails, naming it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { RedatePaymentJournalEntries, type RedatePendingJournalEntriesOutcome } from '../AccountingBridge.js';

interface Request { EffectiveDate: string; LinkedEntity: string; LinkedRecordIDs: string[] }
type Result = { Success: boolean; ResultCode: string; Output?: RedatePendingJournalEntriesOutcome; ErrorMessage?: string };

const accounting = { calls: [] as Request[], refuse: null as string | null };

class FakeRedate extends BaseRemotableOperation<Request, RedatePendingJournalEntriesOutcome> {
    public OperationKey = 'Accounting.RedatePendingJournalEntries';
    public override async Execute(input: Request): Promise<Result> {
        accounting.calls.push(input);
        if (accounting.refuse) return { Success: false, ResultCode: 'FAILED', ErrorMessage: accounting.refuse };
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Output: {
                EffectiveDate: input.EffectiveDate,
                Changed: input.LinkedRecordIDs.map((id) => ({ JournalEntryID: `je-${id}`, EntryNumber: `JE-${id}`, PreviousEffectiveDate: '2026-11-01', EffectiveDate: input.EffectiveDate })),
                UnchangedJournalEntryIDs: [],
            },
        };
    }
}

const PAYMENT = 'd0000000-0000-4000-8000-000000000001';
const LINE = 'e0000000-0000-4000-8000-000000000001';
const provider = {} as IMetadataProvider;
const user = { ID: 'U-FINANCE' } as UserInfo;
const sources = [
    { EntityName: 'MJ_BizApps_Orders: Payment Headers', RecordIDs: [PAYMENT] },
    { EntityName: 'MJ_BizApps_Orders: Payment Lines', RecordIDs: [LINE] },
];

// Runs BEFORE the fake is registered — vitest runs a file's tests in order.
describe('with accounting not loaded', () => {
    it('throws, naming the operation, rather than changing the date with its entries left behind', async () => {
        await expect(RedatePaymentJournalEntries(sources, '2026-10-30', 'PAY-1', provider, user))
            .rejects.toThrow(/'Accounting.RedatePendingJournalEntries' operation is not registered.*change the date of payment PAY-1/);
    });
});

describe('with accounting loaded', () => {
    beforeAll(() => {
        MJGlobal.Instance.ClassFactory.Register(BaseRemotableOperation, FakeRedate, 'Accounting.RedatePendingJournalEntries');
    });

    it("moves the payment's own entries and its allocations' entries to the new day", async () => {
        accounting.calls = [];
        accounting.refuse = null;
        const outcomes = await RedatePaymentJournalEntries(sources, '2026-10-30', 'PAY-1', provider, user);
        expect(accounting.calls).toEqual([
            { EffectiveDate: '2026-10-30', LinkedEntity: 'MJ_BizApps_Orders: Payment Headers', LinkedRecordIDs: [PAYMENT] },
            { EffectiveDate: '2026-10-30', LinkedEntity: 'MJ_BizApps_Orders: Payment Lines', LinkedRecordIDs: [LINE] },
        ]);
        expect(outcomes.flatMap((o) => o.Changed.map((c) => c.EntryNumber))).toEqual([`JE-${PAYMENT}`, `JE-${LINE}`]);
    });

    it('skips a source with no records, such as a payment with no allocations', async () => {
        accounting.calls = [];
        await RedatePaymentJournalEntries([sources[0], { EntityName: 'MJ_BizApps_Orders: Payment Lines', RecordIDs: [] }], '2026-10-30', 'PAY-1', provider, user);
        expect(accounting.calls).toHaveLength(1);
    });

    it("refuses with accounting's own message once an entry is batched", async () => {
        accounting.calls = [];
        accounting.refuse = 'The entries were not re-dated. Journal entry JE-0042 is Batched: its date is fixed once it is batched.';
        await expect(RedatePaymentJournalEntries(sources, '2026-10-30', 'PAY-1', provider, user))
            .rejects.toThrow("Payment PAY-1's date was not changed. The entries were not re-dated. Journal entry JE-0042 is Batched");
        // The first refusal stops the change: nothing is asked of the allocations' entries.
        expect(accounting.calls).toHaveLength(1);
    });
});
