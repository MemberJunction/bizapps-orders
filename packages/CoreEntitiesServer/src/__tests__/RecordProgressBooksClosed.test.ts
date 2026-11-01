/**
 * `Orders.RecordProgress` against finance's books-closed-through date (golive #316).
 *
 * A measurement date on or before the line's company's `BooksClosedThroughDate` is refused, on
 * preview and post, supersede included. A supersede's reversal of an observation in a closed month
 * is dated the first open day; the catch-up always posts on the date entered. The read FAILS CLOSED.
 *
 * Driven through `InternalExecute` with its reads faked, as `ProgressJudgmentCall.test.ts` does: the
 * line, order and rev-rec type come from stubs, the profile and observation reads from a stubbed
 * RunView, and each draft's amount and date are recorded where the factory would build it. Today on
 * the business calendar is 2026-10-03, the worked example on the issue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    posted: [] as Array<{ ID: string; MeasurementDate: string; Status: string; SupersedesMeasurementID: string | null; RecognitionAmount: number }>,
    /** The profile rows the read returns, or how it fails. */
    profile: [] as Array<{ BooksClosedThroughDate: unknown }> | 'fail' | 'throw',
    profileReads: [] as Array<{ EntityName: string; ExtraFilter: string; Fields: string[]; ResultType: string; BypassCache: boolean; user: unknown }>,
    drafts: [] as Array<{ Delta: number; Date: string }>,
    events: [] as string[],
    ledger: { ID: '00000000-0000-4000-8000-00000000000a', Name: 'System', Email: 'system@example.com' },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: (params: { EntityName: string; ExtraFilter: string; Fields: string[]; ResultType: string; BypassCache: boolean }, user: unknown) => {
                        if (params.EntityName === 'MJ_BizApps_Accounting: Accounting Company Profiles') {
                            h.profileReads.push({ ...params, user });
                            if (h.profile === 'throw') return Promise.reject(new Error('connection reset'));
                            if (h.profile === 'fail') return Promise.resolve({ Success: false, ErrorMessage: 'no permission on Accounting Company Profiles', Results: [] });
                            return Promise.resolve({ Success: true, Results: h.profile });
                        }
                        return Promise.resolve({
                            Success: true,
                            Results: params.EntityName === 'MJ_BizApps_Orders: Order Line Progress Measurements' ? h.posted : [],
                        });
                    },
                };
            }
        },
    };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ...actual, UserCache: { Instance: { GetSystemUser: () => h.ledger } } };
});

vi.mock('@mj-biz-apps/common-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/common-entities')>();
    return { ...actual, BusinessTimeZoneEngine: { Instance: { Config: () => Promise.resolve(), Today: () => '2026-10-03' } } };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    const engine = {
        RequireProduct: () => Promise.resolve({ ID: 'P', RevenueRecognitionTypeID: 'RT', ProductTypeID: 'PT' }),
        ProductTypeByID: () => ({ DefaultRevenueRecognitionTypeID: null }),
        RevenueRecognitionTypes: [{ ID: 'RT', ScheduleBasis: 'OnMeasurement', DriverClass: 'ManualAttestation', Code: 'POC' }],
    };
    return { ...actual, UserHasAuthorization: () => true, OrdersEngine: { Instance: engine } };
});

vi.mock('../AccountingBridge.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../AccountingBridge.js')>();
    return { ...actual, BuildGLAccountResolver: () => Promise.resolve({}), EntityIDFor: () => 'ENTITY' };
});

vi.mock('../OrderJournalEntryFactory.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../OrderJournalEntryFactory.js')>();
    return {
        ...actual,
        OrderJournalEntryFactory: class {
            BuildProgressDraft(_order: unknown, _line: unknown, delta: number, date: string) {
                h.drafts.push({ Delta: delta, Date: date });
                return Promise.resolve({ Lines: [] });
            }
        },
    };
});

import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { OrdersRecordProgressInput, OrdersRecordProgressOutput } from '@mj-biz-apps/orders-entities';
import { PROGRESS_SUPERSEDE_AUTH } from '../ProgressSupersede.js';
import { RecordProgressOperation } from '../RecordProgressOperation.js';

// ─── Fake accounting operations, registered under the keys orders resolves ─────────────────────

type JEOutput = { Success: boolean; Results: Array<{ JournalEntryID: string }> };
@RegisterClass(BaseRemotableOperation, 'Accounting.CreateJournalEntries')
class FakeCreateJournalEntries extends BaseRemotableOperation<{ Drafts: unknown[] }, JEOutput> {
    public readonly OperationKey = 'Accounting.CreateJournalEntries';
    public override Execute(): Promise<RemoteOpResult<JEOutput>> {
        h.events.push('journal');
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Results: [{ JournalEntryID: `JE-${h.events.length}` }] } });
    }
}

type TypesOutput = { Success: boolean; Types: unknown[] };
@RegisterClass(BaseRemotableOperation, 'Accounting.GetFinanceExceptionTypes')
class FakeGetFinanceExceptionTypes extends BaseRemotableOperation<{ Codes?: string[] }, TypesOutput> {
    public readonly OperationKey = 'Accounting.GetFinanceExceptionTypes';
    public override Execute(): Promise<RemoteOpResult<TypesOutput>> {
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Types: [] } });
    }
}
void FakeCreateJournalEntries;
void FakeGetFinanceExceptionTypes;

// ─── Fixtures: the worked example ───────────────────────────────────────────────────────────────

const LINE_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const ATTESTER: UserInfo = { ID: '44444444-4444-4444-8444-444444444444', Name: 'Supervisor', Email: 'supervisor@example.com' } as unknown as UserInfo;
const JULY_ID = '55555555-5555-4555-8555-555555555555';
const AUGUST_ID = '66666666-6666-4666-8666-666666666666';
const CLOSED = 'This month has already been closed by finance. Please contact them to proceed.';

/** 40% on 7/31, then 65% on 8/31, on a $100,000 line: $65,000 recognised. */
const ATTESTED = [
    { ID: JULY_ID, MeasurementDate: '2026-07-31', Status: 'Posted', SupersedesMeasurementID: null, RecognitionAmount: 40000 },
    { ID: AUGUST_ID, MeasurementDate: '2026-08-31', Status: 'Posted', SupersedesMeasurementID: null, RecognitionAmount: 25000 },
];

function fakeProvider(companyID: string | null, recognizedToDate: number): IMetadataProvider {
    const line = {
        ID: LINE_ID,
        OrderHeaderID: ORDER_ID,
        ProductID: 'P',
        CompanyID: companyID,
        LineNumber: 1,
        Quantity: 1,
        LineTotalNet: 100000,
        RecognizedToDate: recognizedToDate,
        LatestResult: null,
        Load: () => Promise.resolve(true),
        Save: () => Promise.resolve(true),
    };
    const order = { ID: ORDER_ID, OrderNumber: 'ORD-TEST-1', ConfirmedAt: new Date('2026-07-01T12:00:00Z'), Load: () => Promise.resolve(true) };
    const observation = {
        ID: '',
        LatestResult: null,
        NewRecord: () => undefined,
        Save: () => {
            observation.ID = '77777777-7777-4777-8777-777777777777';
            h.events.push('observation');
            return Promise.resolve(true);
        },
    };
    return {
        Authorizations: [{ Name: PROGRESS_SUPERSEDE_AUTH }],
        GetEntityObject: (name: string) =>
            Promise.resolve(name === 'MJ_BizApps_Orders: Order Lines' ? line : name === 'MJ_BizApps_Orders: Order Headers' ? order : observation),
        BeginTransaction: () => {
            h.events.push('begin');
            return Promise.resolve();
        },
        CommitTransaction: () => {
            h.events.push('commit');
            return Promise.resolve();
        },
        RollbackTransaction: () => {
            h.events.push('rollback');
            return Promise.resolve();
        },
    } as unknown as IMetadataProvider;
}

interface CallableOperation {
    InternalExecute(input: OrdersRecordProgressInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersRecordProgressOutput>;
}

interface Attest {
    date: string;
    percent: number;
    preview?: boolean;
    supersedes?: string;
    companyID?: string | null;
    recognizedToDate?: number;
}

function attest({ date, percent, preview = false, supersedes, companyID = COMPANY_ID, recognizedToDate = 0 }: Attest): Promise<OrdersRecordProgressOutput> {
    const op = new RecordProgressOperation() as unknown as CallableOperation;
    return op.InternalExecute(
        { OrderLineID: LINE_ID, MeasurementDate: date, PercentComplete: percent, Preview: preview, SupersedesMeasurementID: supersedes ?? null },
        fakeProvider(companyID, recognizedToDate),
        ATTESTER,
    );
}

/** The 8/31 observation superseded at 55%. */
const supersedeAugust = (date: string, preview = false) => attest({ date, percent: 0.55, preview, supersedes: AUGUST_ID, recognizedToDate: 65000 });

beforeEach(() => {
    h.posted = [];
    h.profile = [{ BooksClosedThroughDate: '2026-08-31' }];
    h.profileReads = [];
    h.drafts = [];
    h.events = [];
});
afterEach(() => vi.clearAllMocks());

// ─── The block ──────────────────────────────────────────────────────────────────────────────────

describe('a measurement date in a month finance has closed', () => {
    it.each([true, false])('is refused with the agreed message (preview %s), and nothing is written', async (preview) => {
        const res = await attest({ date: '2026-08-31', percent: 0.3, preview });
        expect(res.Success).toBe(false);
        expect(res.Preview).toBe(preview);
        expect(res.Message).toBe(CLOSED);
        expect(h.drafts).toEqual([]);
        expect(h.events).toEqual([]);
    });

    it('is refused for any earlier day too', async () => {
        expect((await attest({ date: '2026-03-15', percent: 0.3 })).Message).toBe(CLOSED);
    });

    it.each([true, false])('is refused on a supersede (preview %s), the replaced date included', async (preview) => {
        h.posted = ATTESTED;
        const res = await supersedeAugust('2026-08-31', preview);
        expect(res.Success).toBe(false);
        expect(res.Message).toBe(CLOSED);
        expect(h.drafts).toEqual([]);
        expect(h.events).toEqual([]);
    });

    it('reads a DATE column that arrives as a Date', async () => {
        h.profile = [{ BooksClosedThroughDate: new Date('2026-08-31T00:00:00Z') }];
        expect((await attest({ date: '2026-08-31', percent: 0.3 })).Message).toBe(CLOSED);
        expect((await attest({ date: '2026-09-01', percent: 0.3 })).Success).toBe(true);
    });
});

describe('a measurement date after the books-closed-through date', () => {
    it.each(['2026-09-30', '2026-10-02'])('%s saves with no message', async (date) => {
        const res = await attest({ date, percent: 0.3 });
        expect(res.Success).toBe(true);
        expect(res.FutureDateWarning).toBeNull();
        expect(res.BackDatedWarning).toBeNull();
        expect(res.CatchUpDate).toBe(date);
        expect(h.drafts).toEqual([{ Delta: 30000, Date: date }]);
    });

    it.each(['2026-10-31', '2027-08-31'])('%s saves with the future-date warning', async (date) => {
        const res = await attest({ date, percent: 0.3, preview: true });
        expect(res.Success).toBe(true);
        expect(res.FutureDateWarning).toMatch(/after today/);
        expect(res.BackDatedWarning).toBeNull();
    });
});

describe('nothing is closed', () => {
    it('with a NULL date: 8/31 saves with the back-dated warning instead', async () => {
        h.profile = [{ BooksClosedThroughDate: null }];
        const res = await attest({ date: '2026-08-31', percent: 0.3 });
        expect(res.Success).toBe(true);
        expect(res.BackDatedWarning).toMatch(/two or more months before/);
    });

    it('with no profile row', async () => {
        h.profile = [];
        expect((await attest({ date: '2026-08-31', percent: 0.3 })).Success).toBe(true);
    });

    it('on a line with no company, which is not read at all', async () => {
        h.profile = 'throw';
        expect((await attest({ date: '2026-08-31', percent: 0.3, companyID: null })).Success).toBe(true);
        expect(h.profileReads).toEqual([]);
    });
});

// ─── The read ───────────────────────────────────────────────────────────────────────────────────

describe('reading the books-closed-through date', () => {
    it("reads the line's company's profile once, by ID, uncached, as the ledger user", async () => {
        h.posted = ATTESTED;
        await supersedeAugust('2026-09-30');
        expect(h.profileReads).toHaveLength(1);
        expect(h.profileReads[0]).toMatchObject({
            ExtraFilter: `ID = '${COMPANY_ID}'`,
            Fields: ['BooksClosedThroughDate'],
            ResultType: 'simple',
            BypassCache: true,
            user: h.ledger,
        });
    });

    it.each([
        ['reports failure', 'fail' as const, /no permission on Accounting Company Profiles/],
        ['throws', 'throw' as const, /connection reset/],
    ])('refuses when the read %s, on preview and post', async (_, how, cause) => {
        h.profile = how;
        for (const preview of [true, false]) {
            const res = await attest({ date: '2026-09-30', percent: 0.3, preview });
            expect(res.Success).toBe(false);
            expect(res.Message).toMatch(/nothing was recorded/);
            expect(res.Message).toMatch(cause);
        }
        expect(h.drafts).toEqual([]);
        expect(h.events).toEqual([]);
    });
});

// ─── Where a supersede's entries land ───────────────────────────────────────────────────────────

describe('a supersede', () => {
    it('worked example: the closed 8/31 reversal moves to 9/1 and the catch-up posts on the date entered', async () => {
        h.posted = ATTESTED;
        const res = await supersedeAugust('2026-09-30');
        expect(res.Success).toBe(true);
        expect(res.ReversalAmount).toBe(-25000);
        expect(res.ReversalDate).toBe('2026-09-01');
        expect(res.RecognizedToDateBefore).toBe(40000);
        expect(res.RecognitionAmount).toBe(15000);
        expect(res.CatchUpDate).toBe('2026-09-30');
        expect(h.drafts).toEqual([
            { Delta: -25000, Date: '2026-09-01' },
            { Delta: 15000, Date: '2026-09-30' },
        ]);
        expect(res.Message).toContain('25000.00 did come back out of revenue on 2026-09-01');
        expect(res.Message).toMatch(/moved from 2026-08-31: finance has closed the books through 2026-08-31/);
        expect(res.Message).not.toMatch(/posted batch/);
        expect(h.events).toEqual(['begin', 'journal', 'journal', 'observation', 'commit']);
    });

    it('the preview says the same', async () => {
        h.posted = ATTESTED;
        const res = await supersedeAugust('2026-09-30', true);
        expect(res.ReversalDate).toBe('2026-09-01');
        expect(res.CatchUpDate).toBe('2026-09-30');
        expect(res.Message).toMatch(/would come back out of revenue on 2026-09-01 \(moved from 2026-08-31/);
        expect(h.events).toEqual([]);
    });

    it("reverses on the replaced observation's own date when its month is open", async () => {
        h.posted = ATTESTED;
        h.profile = [{ BooksClosedThroughDate: '2026-07-31' }];
        const res = await supersedeAugust('2026-08-31', true);
        expect(res.Success).toBe(true);
        expect(res.ReversalDate).toBe('2026-08-31');
        expect(res.CatchUpDate).toBe('2026-08-31');
        expect(res.Message).not.toMatch(/moved from/);
        expect(h.drafts).toEqual([
            { Delta: -25000, Date: '2026-08-31' },
            { Delta: 15000, Date: '2026-08-31' },
        ]);
    });

    it('reverses on its own date when nothing is closed', async () => {
        h.posted = ATTESTED;
        h.profile = [];
        const res = await supersedeAugust('2026-09-30', true);
        expect(res.ReversalDate).toBe('2026-08-31');
        expect(res.CatchUpDate).toBe('2026-09-30');
    });

    it('has no catch-up date when the replacement recognises nothing further', async () => {
        h.posted = ATTESTED;
        const res = await attest({ date: '2026-09-30', percent: 0.4, preview: true, supersedes: AUGUST_ID, recognizedToDate: 65000 });
        expect(res.RecognitionAmount).toBe(0);
        expect(res.CatchUpDate).toBeNull();
        expect(res.ReversalDate).toBe('2026-09-01');
    });
});
