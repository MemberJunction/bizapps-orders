/**
 * PROGRESS_UNATTESTED (golive #279, type 2) — the nightly pass that puts a percentage-of-completion
 * line on finance's review list when nobody has attested it for too long.
 *
 * The set comes from the progress worklist, faked here at `GetProgressWorklistOperation.Build`, and
 * accounting's two operations are fakes registered under their real keys.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
    OrdersDetectUnattestedProgressInput,
    OrdersDetectUnattestedProgressOutput,
    OrdersGetProgressWorklistOutput,
    ProgressWorklistRow,
} from '@mj-biz-apps/orders-entities';
import {
    DetectUnattestedProgressOperation,
    SelectUnattestedLines,
    UnattestedDedupeKey,
    UnattestedException,
} from '../DetectUnattestedProgressOperation.js';
import { GetProgressWorklistOperation } from '../GetProgressWorklistOperation.js';

const h = {
    types: [] as Array<{ Code: string; IsActive: boolean; Configuration: Record<string, unknown> }>,
    raised: [] as Array<Array<Record<string, unknown>>>,
    existing: new Set<string>(),
    raiseRefuses: false,
};

type TypesOutput = { Success: boolean; Types: typeof h.types };
@RegisterClass(BaseRemotableOperation, 'Accounting.GetFinanceExceptionTypes')
class FakeGetFinanceExceptionTypes extends BaseRemotableOperation<{ Codes?: string[] }, TypesOutput> {
    public readonly OperationKey = 'Accounting.GetFinanceExceptionTypes';
    public override Execute(input: { Codes?: string[] }): Promise<RemoteOpResult<TypesOutput>> {
        const types = h.types.filter((t) => !input.Codes || input.Codes.includes(t.Code));
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Types: types } });
    }
}

type RaiseInput = { Exceptions: Array<Record<string, unknown>> };
type RaiseOutput = { Success: boolean; Results: Array<{ Index: number; FinanceExceptionID?: string; Created: boolean }>; Errors?: Array<{ Code: string; Message: string }> };
/** Idempotent on (type, dedupe key), as the contract says accounting's is. */
@RegisterClass(BaseRemotableOperation, 'Accounting.RaiseFinanceExceptions')
class FakeRaiseFinanceExceptions extends BaseRemotableOperation<RaiseInput, RaiseOutput> {
    public readonly OperationKey = 'Accounting.RaiseFinanceExceptions';
    public override Execute(input: RaiseInput): Promise<RemoteOpResult<RaiseOutput>> {
        if (h.raiseRefuses) {
            return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: false, Results: [], Errors: [{ Code: 'UNKNOWN_TYPE', Message: 'no such type' }] } });
        }
        h.raised.push(input.Exceptions);
        const results = input.Exceptions.map((e, i) => {
            const key = `${e.TypeCode}|${e.DedupeKey}`;
            const created = !h.existing.has(key);
            h.existing.add(key);
            return { Index: i, FinanceExceptionID: `FE-${key}`, Created: created };
        });
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Results: results } });
    }
}
void FakeGetFinanceExceptionTypes;
void FakeRaiseFinanceExceptions;

const ATTESTER = '44444444-4444-4444-8444-444444444444';
const COMPANY = '33333333-3333-4333-8333-333333333333';

function row(id: string, over: Partial<ProgressWorklistRow> = {}): ProgressWorklistRow {
    return {
        OrderLineID: id,
        OrderHeaderID: 'H',
        OrderNumber: `ORD-${id}`,
        LineNumber: 1,
        ProductName: 'Project',
        CompanyID: COMPANY,
        CompanyName: 'Seller',
        CustomerName: 'Buyer',
        LineAmount: 20000,
        LastMeasurementDate: '2026-08-01',
        LastPercentComplete: 0.4,
        RecognizedToDate: 8000,
        LastAttestedBy: 'Attester',
        LastAttestedByUserID: ATTESTER,
        OrderStatus: 'Confirmed',
        ConfirmedAt: '2026-06-01T15:00:00.000Z',
        ...over,
    };
}

const utcDay = (instant: string) => instant.slice(0, 10);
const UNATTESTED = (config: Record<string, unknown>) => ({ Code: 'PROGRESS_UNATTESTED', IsActive: true, Configuration: config });

let worklistRows: ProgressWorklistRow[] = [];
let worklistFails = false;

function detect(asOf: string): Promise<OrdersDetectUnattestedProgressOutput> {
    const op = new DetectUnattestedProgressOperation() as unknown as {
        InternalExecute(i: OrdersDetectUnattestedProgressInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersDetectUnattestedProgressOutput>;
    };
    return op.InternalExecute({ AsOfDate: asOf }, {} as IMetadataProvider, { ID: 'job-user' } as unknown as UserInfo);
}

vi.mock('../PaymentGatedAccess.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../PaymentGatedAccess.js')>();
    return { ...actual, BusinessDay: () => Promise.resolve('2026-09-28') };
});

beforeEach(() => {
    h.types = [UNATTESTED({ MaxDaysWithoutAttestation: 35 })];
    h.raised = [];
    h.existing = new Set();
    h.raiseRefuses = false;
    worklistRows = [];
    worklistFails = false;
    vi.spyOn(GetProgressWorklistOperation.prototype, 'Build').mockImplementation(() =>
        Promise.resolve<OrdersGetProgressWorklistOutput>(
            worklistFails
                ? { Success: false, Message: 'worklist down', Rows: [], RowCount: 0, Truncated: false }
                : { Success: true, Rows: worklistRows, RowCount: worklistRows.length, Truncated: false },
        ),
    );
});

// ─── The selection rule ─────────────────────────────────────────────────────────────────────────

describe('SelectUnattestedLines', () => {
    it('takes a line last attested more than the limit before today, and leaves one exactly at it', () => {
        const rows = [row('A', { LastMeasurementDate: '2026-08-23' }), row('B', { LastMeasurementDate: '2026-08-24' })];
        const out = SelectUnattestedLines(rows, '2026-09-28', 35, utcDay);
        expect(out.map((l) => l.OrderLineID)).toEqual(['A']);
        expect(out[0].DaysWithoutAttestation).toBe(36);
    });

    it('counts a never-attested line from the day its order was booked', () => {
        const rows = [
            row('OLD', { LastMeasurementDate: null, LastPercentComplete: 0, ConfirmedAt: '2026-08-01T10:00:00.000Z' }),
            row('NEW', { LastMeasurementDate: null, LastPercentComplete: 0, ConfirmedAt: '2026-09-01T10:00:00.000Z' }),
        ];
        const out = SelectUnattestedLines(rows, '2026-09-28', 35, utcDay);
        expect(out.map((l) => l.OrderLineID)).toEqual(['OLD']);
        expect(out[0]).toMatchObject({ LastMeasurementDate: null, ConfirmedOn: '2026-08-01', DaysWithoutAttestation: 58 });
    });

    it('leaves out a complete line and a voided order', () => {
        const rows = [row('DONE', { LastPercentComplete: 1 }), row('VOID', { OrderStatus: 'Voided' })];
        expect(SelectUnattestedLines(rows, '2026-09-28', 35, utcDay)).toEqual([]);
    });

    it('carries the line value not yet recognised as the amount', () => {
        const [line] = SelectUnattestedLines([row('A', { LineAmount: 20000, RecognizedToDate: 8000.5 })], '2026-09-28', 35, utcDay);
        expect(line.UnrecognizedAmount).toBe(11999.5);
    });

    it('keys the dedupe on the line and the MONTH of the as-of day', () => {
        expect(UnattestedDedupeKey('LINE', '2026-09-01')).toBe('LINE|2026-09');
        expect(UnattestedDedupeKey('LINE', '2026-09-30')).toBe('LINE|2026-09');
        expect(UnattestedDedupeKey('LINE', '2026-10-01')).toBe('LINE|2026-10');
    });

    it('names no creator for a line never attested, and does not mark it unresolved', () => {
        const [line] = SelectUnattestedLines([row('A', { LastMeasurementDate: null, LastAttestedByUserID: null })], '2026-09-28', 35, utcDay);
        const ex = UnattestedException(line, null, '2026-09-28', 35);
        expect(ex.SourceCreatedByUserID).toBeNull();
        expect(ex.CreatorUnresolved).toBe(false);
        expect(ex.Summary).toContain('never attested since booking on 2026-06-01');
    });
});

// ─── The operation ──────────────────────────────────────────────────────────────────────────────

describe('Orders.DetectUnattestedProgress', () => {
    it('raises one exception per overdue line, against the line, dated the as-of day, signed by the last attester', async () => {
        worklistRows = [row('A'), row('B', { LastMeasurementDate: '2026-09-20' })];
        const out = await detect('2026-09-28');
        expect(out.Success).toBe(true);
        expect(out.Raised).toBe(1);
        expect(h.raised).toHaveLength(1);
        expect(h.raised[0]).toEqual([
            {
                TypeCode: 'PROGRESS_UNATTESTED',
                SourceEntityName: 'MJ_BizApps_Orders: Order Lines',
                SourceRecordID: 'A',
                CompanyID: COMPANY,
                Amount: 12000,
                ExceptionDate: '2026-09-28',
                Summary: 'Progress on order ORD-A line 1 is 58 days without attestation (last attested 2026-08-01; the limit is 35 days).',
                DedupeKey: 'A|2026-09',
                SourceCreatedByUserID: ATTESTER,
                CreatorUnresolved: false,
            },
        ]);
        expect(out.Lines[0]).toMatchObject({ OrderLineID: 'A', Created: true, FinanceExceptionID: 'FE-PROGRESS_UNATTESTED|A|2026-09' });
    });

    it('a never-attested line is raised with no creator', async () => {
        worklistRows = [row('N', { LastMeasurementDate: null, LastPercentComplete: 0, LastAttestedBy: null, LastAttestedByUserID: null })];
        await detect('2026-09-28');
        expect(h.raised[0][0]).toMatchObject({ SourceCreatedByUserID: null, CreatorUnresolved: false, DedupeKey: 'N|2026-09' });
    });

    it('a second run in the same month finds the row already raised; the next month raises again', async () => {
        worklistRows = [row('A')];
        expect((await detect('2026-09-28')).Raised).toBe(1);
        const again = await detect('2026-09-29');
        expect(again).toMatchObject({ Success: true, Raised: 0, AlreadyRaised: 1 });
        const next = await detect('2026-10-01');
        expect(next.Raised).toBe(1);
        expect(h.raised[2][0].DedupeKey).toBe('A|2026-10');
    });

    it('raises nothing and says so when the type is inactive or undefined', async () => {
        worklistRows = [row('A')];
        h.types = [{ ...UNATTESTED({ MaxDaysWithoutAttestation: 35 }), IsActive: false }];
        expect(await detect('2026-09-28')).toMatchObject({ Success: true, TypeInactive: true, Raised: 0 });
        h.types = [];
        expect(await detect('2026-09-28')).toMatchObject({ Success: true, TypeInactive: true });
        expect(h.raised).toHaveLength(0);
    });

    it('an active type with no usable threshold is a failure, not a default', async () => {
        worklistRows = [row('A')];
        h.types = [UNATTESTED({})];
        const out = await detect('2026-09-28');
        expect(out.Success).toBe(false);
        expect(out.Message).toContain('MaxDaysWithoutAttestation');
        expect(h.raised).toHaveLength(0);
    });

    it('a raise accounting refuses is reported with the lines it was raising, not swallowed', async () => {
        worklistRows = [row('A')];
        h.raiseRefuses = true;
        const out = await detect('2026-09-28');
        expect(out.Success).toBe(false);
        expect(out.Message).toContain('UNKNOWN_TYPE');
        expect(out.Lines.map((l) => l.OrderLineID)).toEqual(['A']);
    });

    it('a worklist that cannot be read is a failure', async () => {
        worklistFails = true;
        expect(await detect('2026-09-28')).toMatchObject({ Success: false, Message: 'worklist down' });
    });

    it('refuses a day that does not exist', async () => {
        const out = await detect('2026-02-30');
        expect(out.Success).toBe(false);
        expect(h.raised).toHaveLength(0);
    });
});
