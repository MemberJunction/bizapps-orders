/**
 * Saving a captured payment with a new date (bc-aidp-next-golive#448, g448.1 A) goes through
 * `PaymentHeaderEntityServer.saveDateCorrection`: one transaction that moves the journal entries
 * booked against the payment and against each of its allocations, then saves the payment. A refusal
 * from accounting, or a failed row save, rolls the whole of it back. A person without the Finance
 * authorization is refused before anything is opened.
 *
 * No database. The payment is the real server class built with `Object.create`, carrying what the
 * save reads (IsSaved, the Status / PaymentDate fields, the provider and user). Accounting's
 * operation (`RedatePaymentJournalEntries`), the allocations read (`RunView`) and the base row save
 * (`super.Save`) are stand-ins that record the order they ran in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationInfo, UserInfo } from '@memberjunction/core';
import { PAYMENT_DATE_CHANGE_AUTH } from '@mj-biz-apps/orders-entities';

const h = vi.hoisted(() => ({
    /** Every call the save made, in order: transaction steps, the redate, the row save. */
    steps: [] as string[],
    redateCalls: [] as Array<{ Sources: unknown; Day: string; PaymentNumber: string }>,
    redateRefusal: null as string | null,
    lineIDs: [] as string[],
    runViewFilters: [] as string[],
}));

vi.mock('../AccountingBridge.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../AccountingBridge.js')>();
    return {
        ...actual,
        RedatePaymentJournalEntries: vi.fn(async (sources: unknown, day: string, paymentNumber: string) => {
            h.steps.push('redate');
            h.redateCalls.push({ Sources: sources, Day: day, PaymentNumber: paymentNumber });
            if (h.redateRefusal) throw new Error(h.redateRefusal);
            return [];
        }),
    };
});

// Only `RunView` is swapped: the save constructs it to read the payment's saved allocations.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                h.runViewFilters.push(`${params.EntityName}: ${params.ExtraFilter ?? ''}`);
                return { Success: true, Results: h.lineIDs.map((ID) => ({ ID })) };
            }
        },
    };
});

const { PaymentHeaderEntityServer } = await import('../PaymentHeaderEntityServer.js');

const PAYMENT = 'D0000000-0000-4000-8000-000000000001';
const LINE_A = 'E0000000-0000-4000-8000-00000000000A';
const LINE_B = 'E0000000-0000-4000-8000-00000000000B';
const day = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

const FINANCE = { ID: 'U-FINANCE' } as UserInfo;
const CLERK = { ID: 'U-CLERK' } as UserInfo;
const AUTHORIZATIONS = [
    { ID: 'A1', Name: PAYMENT_DATE_CHANGE_AUTH, ParentID: null, UserCanExecute: (u: UserInfo) => u.ID === FINANCE.ID },
] as unknown as AuthorizationInfo[];

/** The base row save `super.Save` reaches. Replaced per test. */
const parentProto = Object.getPrototypeOf(PaymentHeaderEntityServer.prototype) as { Save: (o?: unknown) => Promise<boolean> };
let rowSaves: number;
let rowSaveSucceeds: boolean;

interface Field { Value: unknown; OldValue: unknown; Dirty: boolean }
type Payment = InstanceType<typeof PaymentHeaderEntityServer> & {
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

/** A saved payment whose date changes from 1 November to 30 October. */
function payment(opts: { savedStatus?: string; user?: UserInfo } = {}): Payment {
    const savedStatus = opts.savedStatus ?? 'Captured';
    const fields: Record<string, Field> = {
        Status: { Value: savedStatus, OldValue: savedStatus, Dirty: false },
        PaymentDate: { Value: day('2026-10-30'), OldValue: day('2026-11-01'), Dirty: true },
    };
    const provider = {
        Authorizations: AUTHORIZATIONS,
        BeginTransaction: vi.fn(async () => void h.steps.push('begin')),
        CommitTransaction: vi.fn(async () => void h.steps.push('commit')),
        RollbackTransaction: vi.fn(async () => void h.steps.push('rollback')),
    };
    const p = Object.create(PaymentHeaderEntityServer.prototype) as Payment;
    const own = (name: string, value: unknown) => Object.defineProperty(p, name, { value, writable: true, configurable: true });
    own('IsSaved', true);
    own('ID', PAYMENT);
    own('PaymentNumber', 'PAY-000042');
    own('PaymentDate', fields.PaymentDate.Value);
    own('Status', savedStatus);
    own('Fields', []);
    own('LatestResult', null);
    own('ProviderToUse', provider);
    own('ContextCurrentUser', opts.user ?? FINANCE);
    own('GetFieldByName', (name: string) => fields[name]);
    own('RegisterResultHistoryEntry', vi.fn());
    // The ordinary (non-correction) path's own steps, so a Pending payment's save reaches the row save.
    own('deferCaptureWhenSettlementIsLate', vi.fn(async () => undefined));
    own('willBookOnThisSave', () => false);
    own('entersBookedStatus', () => false);
    own('Lines', { Dirty: false, Items: [] });
    return p;
}

/** The message the failed save left for the caller. */
const failure = (p: Payment): string | undefined =>
    (p.RegisterResultHistoryEntry.mock.calls.at(-1)?.[0] as { Message?: string } | undefined)?.Message;

beforeEach(() => {
    h.steps = [];
    h.redateCalls = [];
    h.redateRefusal = null;
    h.lineIDs = [LINE_A, LINE_B];
    h.runViewFilters = [];
    rowSaves = 0;
    rowSaveSucceeds = true;
    vi.spyOn(parentProto, 'Save').mockImplementation(async () => {
        rowSaves++;
        h.steps.push('row-save');
        return rowSaveSucceeds;
    });
});

describe('PaymentHeaderEntityServer.Save — correcting a captured payment\'s date', () => {
    it.each(['Captured', 'Refunded', 'Disputed'])(
        'a %s payment: moves its entries, then saves the row, in one transaction',
        async (status) => {
            const p = payment({ savedStatus: status });
            expect(await p.Save()).toBe(true);
            expect(h.steps).toEqual(['begin', 'redate', 'row-save', 'commit']);
        },
    );

    it("moves the payment's own entries and each saved allocation's entries to the new day", async () => {
        await payment().Save();
        expect(h.redateCalls).toEqual([
            {
                Sources: [
                    { EntityName: 'MJ_BizApps_Orders: Payment Headers', RecordIDs: [PAYMENT] },
                    { EntityName: 'MJ_BizApps_Orders: Payment Lines', RecordIDs: [LINE_A, LINE_B] },
                ],
                Day: '2026-10-30',
                PaymentNumber: 'PAY-000042',
            },
        ]);
        // The allocations are read from the database by payment, not from what the object holds.
        expect(h.runViewFilters).toEqual([`MJ_BizApps_Orders: Payment Lines: PaymentHeaderID = '${PAYMENT}'`]);
    });

    it("rolls back and keeps the old date when accounting refuses, saving nothing", async () => {
        h.redateRefusal = "Payment PAY-000042's date was not changed. Journal entry JE-0042 is Batched.";
        const p = payment();
        expect(await p.Save()).toBe(false);
        expect(h.steps).toEqual(['begin', 'redate', 'rollback']);
        expect(rowSaves).toBe(0);
        expect(failure(p)).toBe(h.redateRefusal);
    });

    it('rolls back the moved entries when the row save fails (51033 throwing, say)', async () => {
        rowSaveSucceeds = false;
        const p = payment();
        expect(await p.Save()).toBe(false);
        expect(h.steps).toEqual(['begin', 'redate', 'row-save', 'rollback']);
        expect(failure(p)).toMatch(/^Failed to save payment PAY-000042/);
    });

    it('refuses a person without the Finance authorization before opening anything, with a sentence about the payment', async () => {
        const p = payment({ user: CLERK });
        expect(await p.Save()).toBe(false);
        expect(h.steps).toEqual([]);
        expect(h.redateCalls).toEqual([]);
        expect(failure(p)).toBe(
            `Changing the date of a captured payment requires the ${PAYMENT_DATE_CHANGE_AUTH} authorization (the Finance role).`,
        );
    });

    it('leaves a Pending payment\'s date change to the ordinary save: no entries to move', async () => {
        const p = payment({ savedStatus: 'Pending' });
        expect(await p.Save()).toBe(true);
        expect(h.steps).toEqual(['row-save']);
        expect(h.redateCalls).toEqual([]);
    });
});
