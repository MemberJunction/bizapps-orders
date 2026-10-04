/**
 * PROGRESS_JUDGMENT_CALL (golive #279, type 1) — the finance exception `Orders.RecordProgress`
 * raises for an observation a second person should look at.
 *
 * The attestation always posts; a flagged one ALSO lands on accounting's review list, inside the
 * same transaction. Accounting's two operations are fakes registered under their real keys, which
 * is the only coupling orders has to them.
 *
 * The operation is driven through `InternalExecute` with its reads faked: the line, the order and
 * the rev-rec type come from stubs, the journal entry from a fake `Accounting.CreateJournalEntries`,
 * and the observation row is a plain object whose save records the order of events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    posted: [] as Array<{ ID: string; MeasurementDate: string; Status: string }>,
    events: [] as string[],
    raised: [] as Array<Array<Record<string, unknown>>>,
    typeReads: 0,
    types: [] as Array<{ Code: string; IsActive: boolean; Configuration: Record<string, unknown> }>,
    raiseRefuses: false,
    ledger: { ID: '00000000-0000-4000-8000-00000000000a', Name: 'System', Email: 'system@example.com' },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: (params: { EntityName: string }) =>
                        Promise.resolve({
                            Success: true,
                            Results: params.EntityName === 'MJ_BizApps_Orders: Order Line Progress Measurements' ? h.posted : [],
                        }),
                };
            }
        },
    };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ...actual, UserCache: { Instance: { GetSystemUser: () => h.ledger } } };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    const engine = {
        ProductByID: () => ({ ID: 'P', RevenueRecognitionTypeID: 'RT', ProductTypeID: 'PT' }),
        ProductTypeByID: () => ({ DefaultRevenueRecognitionTypeID: null }),
        RevenueRecognitionTypes: [{ ID: 'RT', ScheduleBasis: 'OnMeasurement', DriverClass: 'ManualAttestation', Code: 'POC' }],
    };
    return {
        ...actual,
        UserHasAuthorization: () => true,
        LoadOrdersEngine: () => Promise.resolve(),
        OrdersEngine: { Instance: engine },
    };
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
            BuildProgressDraft() {
                return Promise.resolve({ Lines: [] });
            }
        },
    };
});

import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { OrdersRecordProgressInput, OrdersRecordProgressOutput } from '@mj-biz-apps/orders-entities';
import { JudgmentCallReasons, ReadJudgmentCallConfig, type JudgmentCallConfig } from '../ProgressJudgmentCall.js';
import { RecordProgressOperation } from '../RecordProgressOperation.js';

// ─── Fake accounting operations, registered under the keys orders resolves ─────────────────────

@RegisterClass(BaseRemotableOperation, 'Accounting.CreateJournalEntries')
class FakeCreateJournalEntries extends BaseRemotableOperation<{ Drafts: unknown[] }, { Success: boolean; Results: Array<{ JournalEntryID: string }> }> {
    public readonly OperationKey = 'Accounting.CreateJournalEntries';
    public override Execute(): Promise<RemoteOpResult<{ Success: boolean; Results: Array<{ JournalEntryID: string }> }>> {
        h.events.push('journal');
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Results: [{ JournalEntryID: 'JE-1' }] } });
    }
}

type TypesOutput = { Success: boolean; Types: typeof h.types };
@RegisterClass(BaseRemotableOperation, 'Accounting.GetFinanceExceptionTypes')
class FakeGetFinanceExceptionTypes extends BaseRemotableOperation<{ Codes?: string[] }, TypesOutput> {
    public readonly OperationKey = 'Accounting.GetFinanceExceptionTypes';
    public override Execute(input: { Codes?: string[] }): Promise<RemoteOpResult<TypesOutput>> {
        h.typeReads++;
        const types = h.types.filter((t) => !input.Codes || input.Codes.includes(t.Code));
        return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: true, Types: types } });
    }
}

type RaiseInput = { Exceptions: Array<Record<string, unknown>> };
type RaiseOutput = { Success: boolean; Results: Array<{ Index: number; FinanceExceptionID?: string; Created: boolean }>; Errors?: Array<{ Code: string; Message: string }> };
@RegisterClass(BaseRemotableOperation, 'Accounting.RaiseFinanceExceptions')
class FakeRaiseFinanceExceptions extends BaseRemotableOperation<RaiseInput, RaiseOutput> {
    public readonly OperationKey = 'Accounting.RaiseFinanceExceptions';
    public override Execute(input: RaiseInput): Promise<RemoteOpResult<RaiseOutput>> {
        h.events.push('raise');
        if (h.raiseRefuses) {
            return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: { Success: false, Results: [], Errors: [{ Code: 'UNKNOWN_ENTITY', Message: 'no such entity' }] } });
        }
        h.raised.push(input.Exceptions);
        return Promise.resolve({
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: true, Results: input.Exceptions.map((_, i) => ({ Index: i, FinanceExceptionID: `FE-${i}`, Created: true })) },
        });
    }
}
void FakeCreateJournalEntries;
void FakeGetFinanceExceptionTypes;
void FakeRaiseFinanceExceptions;

// ─── Fixtures ───────────────────────────────────────────────────────────────────────────────────

const LINE_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const ATTESTER: UserInfo = { ID: '44444444-4444-4444-8444-444444444444', Name: 'Attester', Email: 'attester@example.com' } as unknown as UserInfo;
const OBSERVATION_ID = '55555555-5555-4555-8555-555555555555';
const PRIOR_ID = '66666666-6666-4666-8666-666666666666';

const JUDGMENT = (config: Record<string, unknown>) => ({ Code: 'PROGRESS_JUDGMENT_CALL', IsActive: true, Configuration: config });
const AGREED = { MaxSingleObservationAmount: 10000, FlagBackwardSlide: true, FlagFirstObservation: true };

function fakeProvider(recognizedToDate: number): IMetadataProvider {
    const line = {
        ID: LINE_ID,
        OrderHeaderID: ORDER_ID,
        ProductID: 'P',
        CompanyID: COMPANY_ID,
        LineNumber: 1,
        Quantity: 1,
        LineTotalNet: 20000,
        RecognizedToDate: recognizedToDate,
        LatestResult: null,
        Load: () => Promise.resolve(true),
        Save: () => {
            h.events.push('line');
            return Promise.resolve(true);
        },
    };
    const order = { ID: ORDER_ID, OrderNumber: 'ORD-TEST-1', ConfirmedAt: new Date('2026-07-01T12:00:00Z'), Load: () => Promise.resolve(true) };
    const observation = {
        ID: '',
        LatestResult: null,
        NewRecord: () => undefined,
        Save: () => {
            observation.ID = OBSERVATION_ID;
            h.events.push('observation');
            return Promise.resolve(true);
        },
    };
    return {
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

function attest(percent: number, recognizedToDate: number, preview = false): Promise<OrdersRecordProgressOutput> {
    const op = new RecordProgressOperation() as unknown as CallableOperation;
    return op.InternalExecute(
        { OrderLineID: LINE_ID, MeasurementDate: '2026-09-30', PercentComplete: percent, Preview: preview },
        fakeProvider(recognizedToDate),
        ATTESTER,
    );
}

beforeEach(() => {
    h.posted = [];
    h.events = [];
    h.raised = [];
    h.typeReads = 0;
    h.types = [JUDGMENT(AGREED)];
    h.raiseRefuses = false;
});
afterEach(() => vi.clearAllMocks());

// ─── The rule, as a pure function ───────────────────────────────────────────────────────────────

describe('JudgmentCallReasons', () => {
    const all: JudgmentCallConfig = { FlagBackwardSlide: true, FlagFirstObservation: true, MaxSingleObservationAmount: 10000 };

    it('names a backward slide alone', () => {
        expect(JudgmentCallReasons(all, { RecognitionAmount: -150, IsFirstObservation: false })).toEqual([
            'backward slide (-150.00 taken back out of revenue)',
        ]);
    });

    it('names a first observation alone', () => {
        expect(JudgmentCallReasons(all, { RecognitionAmount: 500, IsFirstObservation: true })).toEqual(['first observation on the line']);
    });

    it('names an amount over the limit alone, in either direction of travel', () => {
        expect(JudgmentCallReasons(all, { RecognitionAmount: 10000.01, IsFirstObservation: false })).toHaveLength(1);
        expect(JudgmentCallReasons({ ...all, FlagBackwardSlide: false }, { RecognitionAmount: -12000, IsFirstObservation: false })).toEqual([
            '12000.00 is above the single-observation limit of 10000.00',
        ]);
    });

    it('names all three together, in a fixed order', () => {
        const reasons = JudgmentCallReasons(all, { RecognitionAmount: -12000, IsFirstObservation: true });
        expect(reasons).toHaveLength(3);
        expect(reasons[0]).toMatch(/^backward slide/);
        expect(reasons[1]).toBe('first observation on the line');
        expect(reasons[2]).toMatch(/above the single-observation limit/);
    });

    it('raises nothing for a forward catch-up at or below the limit on a line already attested', () => {
        expect(JudgmentCallReasons(all, { RecognitionAmount: 10000, IsFirstObservation: false })).toEqual([]);
        expect(JudgmentCallReasons(all, { RecognitionAmount: 0, IsFirstObservation: false })).toEqual([]);
    });

    it('a switch that is off, or a limit that is absent, disables only that check', () => {
        const config = ReadJudgmentCallConfig({ FlagBackwardSlide: 'true', FlagFirstObservation: true });
        expect(config).toEqual({ FlagBackwardSlide: false, FlagFirstObservation: true, MaxSingleObservationAmount: null });
        expect(JudgmentCallReasons(config, { RecognitionAmount: -99999, IsFirstObservation: false })).toEqual([]);
    });
});

// ─── Through Orders.RecordProgress ──────────────────────────────────────────────────────────────

describe('Orders.RecordProgress raises PROGRESS_JUDGMENT_CALL', () => {
    it('a first observation raises one exception carrying the observation as source and dedupe key, signed by the attester', async () => {
        const res = await attest(0.3, 0); // +6000, under the limit
        expect(res.Success).toBe(true);
        expect(h.raised).toHaveLength(1);
        expect(h.raised[0]).toHaveLength(1);
        expect(h.raised[0][0]).toMatchObject({
            TypeCode: 'PROGRESS_JUDGMENT_CALL',
            SourceEntityName: 'MJ_BizApps_Orders: Order Line Progress Measurements',
            SourceRecordID: OBSERVATION_ID,
            DedupeKey: OBSERVATION_ID,
            CompanyID: COMPANY_ID,
            ExceptionDate: '2026-09-30',
            Amount: 6000,
            SourceCreatedByUserID: ATTESTER.ID,
            CreatorUnresolved: false,
        });
        expect(String(h.raised[0][0].Summary)).toContain('first observation on the line');
    });

    it('raises after the observation is written and before the transaction commits', async () => {
        await attest(0.3, 0);
        expect(h.events).toEqual(['begin', 'journal', 'observation', 'line', 'raise', 'commit']);
    });

    it('a backward slide on an attested line raises for that reason alone', async () => {
        h.posted = [{ ID: PRIOR_ID, MeasurementDate: '2026-08-31', Status: 'Posted' }];
        await attest(0.2, 6000); // -2000
        expect(h.raised).toHaveLength(1);
        expect(h.raised[0][0].Amount).toBe(-2000);
        expect(h.raised[0][0].Summary).toMatch(/: backward slide \(-2000\.00 taken back out of revenue\)\.$/);
    });

    it('an outsized forward catch-up on an attested line raises for the amount alone', async () => {
        h.posted = [{ ID: PRIOR_ID, MeasurementDate: '2026-08-31', Status: 'Posted' }];
        await attest(0.6, 0); // +12000
        expect(h.raised[0][0].Summary).toMatch(/: 12000\.00 is above the single-observation limit of 10000\.00\.$/);
    });

    it('one observation meeting all three reasons raises ONE exception naming all three', async () => {
        await attest(0.2, 16000); // -12000 on a line with no posted observation
        expect(h.raised).toHaveLength(1);
        expect(h.raised[0]).toHaveLength(1);
        const summary = String(h.raised[0][0].Summary);
        expect(summary).toContain('backward slide');
        expect(summary).toContain('first observation on the line');
        expect(summary).toContain('above the single-observation limit');
    });

    it('a forward catch-up below the limit on an attested line raises nothing, and still posts', async () => {
        h.posted = [{ ID: PRIOR_ID, MeasurementDate: '2026-08-31', Status: 'Posted' }];
        const res = await attest(0.5, 6000); // +4000
        expect(res.Success).toBe(true);
        expect(res.JournalEntryID).toBe('JE-1');
        expect(h.raised).toHaveLength(0);
        expect(h.events).not.toContain('raise');
    });

    it('a preview raises nothing and does not even read the type', async () => {
        const res = await attest(0.2, 16000, true);
        expect(res.Success).toBe(true);
        expect(res.Preview).toBe(true);
        expect(h.raised).toHaveLength(0);
        expect(h.typeReads).toBe(0);
        expect(h.events).toEqual([]);
    });

    it('an inactive or undefined type raises nothing, and the attestation posts', async () => {
        h.types = [{ ...JUDGMENT(AGREED), IsActive: false }];
        expect((await attest(0.2, 16000)).Success).toBe(true);
        h.types = [];
        expect((await attest(0.2, 16000)).Success).toBe(true);
        expect(h.raised).toHaveLength(0);
    });

    it('a raise accounting refuses fails the attestation and rolls the observation back', async () => {
        h.raiseRefuses = true;
        const res = await attest(0.3, 0);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('UNKNOWN_ENTITY');
        expect(h.events).toContain('rollback');
        expect(h.events).not.toContain('commit');
    });
});
