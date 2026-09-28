import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `Orders.DetectOverlappingSubscriptions` — finance exception type 5 (golive #279).
 *
 * The two accounting operations are FAKES registered under their contract names, which is the
 * point: orders resolves them by name through the class factory and has no other way to reach
 * accounting. `RunQuery` and `RunView` are mocked because the query's SQL is not what is under test
 * here — what the check does with the rows is.
 */

const mocks = vi.hoisted(() => ({
    queryRows: [] as unknown[],
    queryCalls: [] as Array<{ QueryName?: string; CategoryPath?: string }>,
    orderRows: [] as Array<{ ID: string; ConfirmedByUserID: string | null }>,
    orderFilters: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunQuery: class {
            RunQuery(params: { QueryName?: string; CategoryPath?: string }) {
                mocks.queryCalls.push(params);
                return Promise.resolve({ Success: true, Results: mocks.queryRows, ErrorMessage: '' });
            }
        },
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: (params: { ExtraFilter: string }) => {
                        mocks.orderFilters.push(params.ExtraFilter);
                        return Promise.resolve({ Success: true, Results: mocks.orderRows });
                    },
                };
            }
        },
    };
});

import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type {
    OrdersDetectOverlappingSubscriptionsInput,
    OrdersDetectOverlappingSubscriptionsOutput,
} from '@mj-biz-apps/orders-entities';
import {
    DetectOverlappingSubscriptionsOperation,
    type FinanceExceptionTypesInput,
    type FinanceExceptionTypesOutput,
    type OverlappingSubscriptionRow,
    type RaiseFinanceExceptionsInput,
    type RaiseFinanceExceptionsOutput,
} from '../DetectOverlappingSubscriptionsOperation.js';

// ─── Fake accounting ─────────────────────────────────────────────────────────────────────────────

const accounting = {
    types: { Success: true, Types: [] } as FinanceExceptionTypesOutput,
    typeCalls: [] as FinanceExceptionTypesInput[],
    raise: null as ((input: RaiseFinanceExceptionsInput) => RemoteOpResult<RaiseFinanceExceptionsOutput>) | null,
    raised: [] as RaiseFinanceExceptionsInput[],
};

class FakeGetFinanceExceptionTypes extends BaseRemotableOperation<FinanceExceptionTypesInput, FinanceExceptionTypesOutput> {
    public OperationKey = 'Accounting.GetFinanceExceptionTypes';
    public override async Execute(input: FinanceExceptionTypesInput): Promise<RemoteOpResult<FinanceExceptionTypesOutput>> {
        accounting.typeCalls.push(input);
        return { Success: true, ResultCode: 'SUCCESS', Output: accounting.types };
    }
}

/** Created for each row it is sent unless told otherwise — the contract's happy path. */
function createdForEach(input: RaiseFinanceExceptionsInput): RemoteOpResult<RaiseFinanceExceptionsOutput> {
    return {
        Success: true,
        ResultCode: 'SUCCESS',
        Output: { Success: true, Results: input.Exceptions.map((_, Index) => ({ Index, Created: true, FinanceExceptionID: `fe-${Index}` })) },
    };
}

class FakeRaiseFinanceExceptions extends BaseRemotableOperation<RaiseFinanceExceptionsInput, RaiseFinanceExceptionsOutput> {
    public OperationKey = 'Accounting.RaiseFinanceExceptions';
    public override async Execute(input: RaiseFinanceExceptionsInput): Promise<RemoteOpResult<RaiseFinanceExceptionsOutput>> {
        accounting.raised.push(input);
        return (accounting.raise ?? createdForEach)(input);
    }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────────

const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const USER_A = 'a0000000-0000-4000-8000-00000000000a';
const ORDER_CONFIRMED = 'b0000000-0000-4000-8000-000000000001';
const ORDER_BEFORE_COLUMN = 'b0000000-0000-4000-8000-000000000002';

function pair(n: number, overrides: Partial<OverlappingSubscriptionRow> = {}): OverlappingSubscriptionRow {
    return {
        CompanyID: COMPANY,
        MatchBasis: 'SameProduct',
        OverlapStart: new Date('2026-01-01T00:00:00Z'),
        OverlapEnd: new Date('2026-06-30T00:00:00Z'),
        EarlierSubscriptionID: `e0000000-0000-4000-8000-00000000000${n}`,
        EarlierSubscriptionNumber: `SUB-E${n}`,
        LaterSubscriptionID: `f0000000-0000-4000-8000-00000000000${n}`,
        LaterSubscriptionNumber: `SUB-L${n}`,
        LaterOrderHeaderID: ORDER_CONFIRMED,
        LaterOverlappingTermsAmount: 120,
        ...overrides,
    };
}

const activeType = (configuration: Record<string, unknown>): FinanceExceptionTypesOutput => ({
    Success: true,
    Types: [{ Code: 'OVERLAPPING_SUBSCRIPTION', IsActive: true, Configuration: configuration }],
});

interface CallableOperation {
    InternalExecute(
        input: OrdersDetectOverlappingSubscriptionsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersDetectOverlappingSubscriptionsOutput>;
}

const detect = (input: OrdersDetectOverlappingSubscriptionsInput = { AsOfDate: '2026-09-28' }) =>
    (new DetectOverlappingSubscriptionsOperation() as unknown as CallableOperation).InternalExecute(
        input,
        {} as unknown as IMetadataProvider,
        { ID: 'job-user' } as unknown as UserInfo,
    );

beforeEach(() => {
    mocks.queryRows = [];
    mocks.queryCalls = [];
    mocks.orderRows = [];
    mocks.orderFilters = [];
    accounting.types = { Success: true, Types: [] };
    accounting.typeCalls = [];
    accounting.raise = null;
    accounting.raised = [];
});

// Runs BEFORE the fakes are registered — vitest runs a file's tests in order.
describe('with accounting not loaded', () => {
    it('throws rather than routing to an operation nobody registered', async () => {
        await expect(detect()).rejects.toThrow(/Accounting\.GetFinanceExceptionTypes' operation is not registered/);
    });
});

describe('with accounting loaded', () => {
    beforeAll(() => {
        MJGlobal.Instance.ClassFactory.Register(BaseRemotableOperation, FakeGetFinanceExceptionTypes, 'Accounting.GetFinanceExceptionTypes');
        MJGlobal.Instance.ClassFactory.Register(BaseRemotableOperation, FakeRaiseFinanceExceptions, 'Accounting.RaiseFinanceExceptions');
    });

    it('raises one exception per pair, shaped by the type 5 contract row', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [
            pair(1),
            pair(2, { LaterOrderHeaderID: ORDER_BEFORE_COLUMN, LaterOverlappingTermsAmount: null }),
            pair(3, { LaterOrderHeaderID: null }),
        ];
        mocks.orderRows = [
            { ID: ORDER_CONFIRMED, ConfirmedByUserID: USER_A },
            { ID: ORDER_BEFORE_COLUMN, ConfirmedByUserID: null },
        ];

        const out = await detect();

        expect(accounting.typeCalls).toEqual([{ Codes: ['OVERLAPPING_SUBSCRIPTION'] }]);
        expect(mocks.queryCalls).toEqual([{ QueryName: 'Overlapping Subscriptions', CategoryPath: 'Orders' }]);
        expect(out).toMatchObject({ Success: true, TypeActive: true, ExceptionDate: '2026-09-28', PairsFound: 3, PairsConsidered: 3, Created: 3, Errors: [] });

        const [confirmed, beforeColumn, noOrder] = accounting.raised[0].Exceptions;
        expect(confirmed).toMatchObject({
            TypeCode: 'OVERLAPPING_SUBSCRIPTION',
            SourceEntityName: 'MJ_BizApps_Orders: Subscriptions',
            SourceRecordID: pair(1).LaterSubscriptionID,
            CompanyID: COMPANY,
            Amount: 120,
            ExceptionDate: '2026-09-28',
            DedupeKey: `${pair(1).EarlierSubscriptionID}|${pair(1).LaterSubscriptionID}`,
            SourceCreatedByUserID: USER_A,
            CreatorUnresolved: false,
        });
        expect(confirmed.Summary).toContain('SUB-L1');
        expect(confirmed.Summary).toContain('SUB-E1');
        expect(confirmed.Summary).toContain('2026-01-01 to 2026-06-30');
        // Confirmed before the column existed: no creator restriction, never unresolved, because a
        // booked order's confirmer cannot be filled in later and the row could never be cleared.
        expect(beforeColumn).toMatchObject({ SourceCreatedByUserID: null, CreatorUnresolved: false, Amount: null });
        // No order behind the later subscription at all: the same.
        expect(noOrder).toMatchObject({ SourceCreatedByUserID: null, CreatorUnresolved: false });
    });

    it('matches the confirmer whatever the case of the order id', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [pair(1, { LaterOrderHeaderID: ORDER_CONFIRMED.toUpperCase() })];
        mocks.orderRows = [{ ID: ORDER_CONFIRMED, ConfirmedByUserID: USER_A }];

        await detect();

        expect(accounting.raised[0].Exceptions[0]).toMatchObject({ SourceCreatedByUserID: USER_A, CreatorUnresolved: false });
    });

    it('leaves out SameCategory pairs when the type says IncludeSameCategory is false', async () => {
        accounting.types = activeType({ IncludeSameCategory: false });
        mocks.queryRows = [pair(1), pair(2, { MatchBasis: 'SameCategory' })];

        const out = await detect();

        expect(out).toMatchObject({ PairsFound: 2, PairsConsidered: 1, Created: 1 });
        expect(accounting.raised[0].Exceptions.map((e) => e.SourceRecordID)).toEqual([pair(1).LaterSubscriptionID]);
    });

    it('keeps SameCategory pairs when IncludeSameCategory is true', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [pair(1), pair(2, { MatchBasis: 'SameCategory' })];

        const out = await detect();

        expect(out).toMatchObject({ PairsConsidered: 2, Created: 2 });
        expect(accounting.raised[0].Exceptions[1].Summary).toContain('same category');
    });

    it.each([
        ['missing', { Success: true, Types: [] }],
        ['inactive', { Success: true, Types: [{ Code: 'OVERLAPPING_SUBSCRIPTION', IsActive: false, Configuration: { IncludeSameCategory: true } }] }],
    ] as Array<[string, FinanceExceptionTypesOutput]>)('skips when the type is %s: no query, no raise, not a failure', async (_label, types) => {
        accounting.types = types;
        mocks.queryRows = [pair(1)];

        const out = await detect();

        expect(out).toMatchObject({ Success: true, TypeActive: false, PairsFound: 0, Created: 0 });
        expect(mocks.queryCalls).toHaveLength(0);
        expect(accounting.raised).toHaveLength(0);
    });

    it.each([[{}], [{ IncludeSameCategory: 'yes' }]])('refuses a configuration without a boolean IncludeSameCategory (%j) rather than defaulting', async (configuration) => {
        accounting.types = activeType(configuration);
        mocks.queryRows = [pair(1)];

        const out = await detect();

        expect(out.Success).toBe(false);
        expect(out.Errors[0].Code).toBe('INVALID_CONFIGURATION');
        expect(accounting.raised).toHaveLength(0);
    });

    it('counts a pair accounting already had as AlreadyRaised, not Created', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [pair(1), pair(2)];
        accounting.raise = () => ({
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: true, Results: [{ Index: 0, Created: true }, { Index: 1, Created: false, FinanceExceptionID: 'existing' }] },
        });

        const out = await detect();

        expect(out).toMatchObject({ Success: true, Created: 1, AlreadyRaised: 1 });
    });

    it('reports a refused raise as a failure naming every unraised pair', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [pair(1), pair(2)];
        accounting.raise = () => ({
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: false, Results: [], Errors: [{ Index: 1, Code: 'UNKNOWN_ENTITY', Message: 'no such entity' }] },
        });

        const out = await detect();

        expect(out.Success).toBe(false);
        expect(out.Created).toBe(0);
        expect(out.Errors.map((e) => e.DedupeKey)).toEqual([
            `${pair(1).EarlierSubscriptionID}|${pair(1).LaterSubscriptionID}`,
            `${pair(2).EarlierSubscriptionID}|${pair(2).LaterSubscriptionID}`,
        ]);
        expect(out.Errors[1]).toMatchObject({ Code: 'UNKNOWN_ENTITY', Message: 'no such entity' });
        expect(out.Message).toContain('2 error(s)');
    });

    it('reports an envelope failure the same way', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = [pair(1)];
        accounting.raise = () => ({ Success: false, ResultCode: 'FORBIDDEN', ErrorMessage: 'not allowed' });

        const out = await detect();

        expect(out.Success).toBe(false);
        expect(out.Errors[0]).toMatchObject({ Code: 'RAISE_FAILED' });
        expect(out.Errors[0].Message).toContain('not allowed');
    });

    it('keeps raising later batches after one is refused', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });
        mocks.queryRows = Array.from({ length: 150 }, (_, i) =>
            pair(1, { EarlierSubscriptionID: `e-${i}`, LaterSubscriptionID: `f-${i}`, LaterOrderHeaderID: null }),
        );
        let call = 0;
        accounting.raise = (input) =>
            call++ === 0
                ? { Success: true, ResultCode: 'SUCCESS', Output: { Success: false, Results: [], Errors: [{ Code: 'BOOM', Message: 'refused' }] } }
                : createdForEach(input);

        const out = await detect();

        expect(accounting.raised.map((r) => r.Exceptions.length)).toEqual([100, 50]);
        expect(out).toMatchObject({ Success: false, Created: 50 });
        expect(out.Errors).toHaveLength(100);
    });

    it('raises nothing, successfully, when there are no overlaps', async () => {
        accounting.types = activeType({ IncludeSameCategory: true });

        const out = await detect();

        expect(out).toMatchObject({ Success: true, TypeActive: true, PairsFound: 0, Created: 0 });
        expect(accounting.raised).toHaveLength(0);
    });

    it('refuses an AsOfDate that is not a day', async () => {
        await expect(detect({ AsOfDate: '2026-02-30' })).rejects.toThrow(/AsOfDate/);
    });
});
