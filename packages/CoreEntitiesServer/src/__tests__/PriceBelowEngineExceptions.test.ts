/**
 * Finance exception type 4 (golive #279): a booked line priced below its engine price with no
 * approved concession is raised to accounting, and nothing about it refuses the booking.
 *
 * The accounting operations are FAKES REGISTERED UNDER THEIR REAL KEYS, so the bridge resolves them
 * through the class factory exactly as it resolves accounting's own. `RunView` and the engine price
 * are stubbed as in `ConcessionGate.test.ts`, whose evaluation this reuses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseRemotableOperation, type RemoteOpResult } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { FinanceExceptionToRaise, FinanceExceptionTypeInfo, RaiseFinanceExceptionsOutcome } from '../AccountingBridge.js';

const { mockRunView, mockStanding, mockTypes, mockRaise } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockStanding: vi.fn(),
    mockTypes: vi.fn(),
    mockRaise: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, ResolveLinePriceStanding: (...args: unknown[]) => mockStanding(...args) };
});

const { RaisePriceBelowEngineExceptions, PRICE_BELOW_ENGINE_TYPE_CODE } = await import('../PriceBelowEngineExceptions.js');

class FakeGetFinanceExceptionTypes extends BaseRemotableOperation<
    { Codes?: string[] },
    { Success: boolean; Types: FinanceExceptionTypeInfo[] }
> {
    readonly OperationKey = 'Accounting.GetFinanceExceptionTypes';
    readonly ExecutionMode = 'Sync' as const;
    override async Execute(input: { Codes?: string[] }): Promise<RemoteOpResult<{ Success: boolean; Types: FinanceExceptionTypeInfo[] }>> {
        return mockTypes(input);
    }
}

class FakeRaiseFinanceExceptions extends BaseRemotableOperation<
    { Exceptions: FinanceExceptionToRaise[] },
    RaiseFinanceExceptionsOutcome
> {
    readonly OperationKey = 'Accounting.RaiseFinanceExceptions';
    readonly ExecutionMode = 'Sync' as const;
    override async Execute(input: { Exceptions: FinanceExceptionToRaise[] }): Promise<RemoteOpResult<RaiseFinanceExceptionsOutcome>> {
        return mockRaise(input);
    }
}

MJGlobal.Instance.ClassFactory.Register(BaseRemotableOperation, FakeGetFinanceExceptionTypes, 'Accounting.GetFinanceExceptionTypes', 1000);
MJGlobal.Instance.ClassFactory.Register(BaseRemotableOperation, FakeRaiseFinanceExceptions, 'Accounting.RaiseFinanceExceptions', 1000);

const ORDER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const BUNDLE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const ORIGIN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const COMPONENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';
const REVERSAL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3306';
const COMPANY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
const provider = {} as never;
/** A rep holding the price-override authorization — the gate does not exempt them, nor does this. */
const overrideRep = { ID: 'override-rep' } as never;

type Row = Record<string, unknown>;

/** A booked line at 60 against an engine price of 100, quantity 2: a Price concession worth 80. */
const bookedLine = {
    ID: LINE_ID,
    LineNumber: 1,
    ParentOrderLineID: null as string | null,
    ReversesOrderLineID: null as string | null,
    ProductID: 'product-1',
    OrderHeaderID: ORDER_ID,
    Quantity: 2,
    UnitPrice: 60,
    ProductPriceID: null as string | null,
    PriceStated: true,
    CompanyID: COMPANY_ID,
};

/** Answers each RunView by entity: concessions, and the persisted lines. */
function database(concessions: Row[], lines: Row[]) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Order Concessions') ? concessions : lines,
    }));
}

function booking(lines: Row[]) {
    return {
        OrderHeaderID: ORDER_ID,
        OrderNumber: 'ORD-TEST-1',
        Lines: lines as never,
        BusinessDay: async () => '2026-09-28',
    };
}

function typesAnswer(types: FinanceExceptionTypeInfo[]) {
    mockTypes.mockResolvedValue({ Success: true, Output: { Success: true, Types: types } });
}

const activeType: FinanceExceptionTypeInfo = { Code: 'PRICE_BELOW_ENGINE_UNAPPROVED', IsActive: true, Configuration: {} };

function raisedDrafts(): FinanceExceptionToRaise[] {
    expect(mockRaise).toHaveBeenCalledTimes(1);
    return (mockRaise.mock.calls[0][0] as { Exceptions: FinanceExceptionToRaise[] }).Exceptions;
}

beforeEach(() => {
    mockRunView.mockReset();
    mockStanding.mockReset();
    mockTypes.mockReset();
    mockRaise.mockReset();
    mockStanding.mockResolvedValue({ EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: false });
    typesAnswer([activeType]);
    mockRaise.mockImplementation(async (input: { Exceptions: FinanceExceptionToRaise[] }) => ({
        Success: true,
        Output: { Success: true, Results: input.Exceptions.map((_, i) => ({ Index: i, Created: true })) },
    }));
});

describe('RaisePriceBelowEngineExceptions — what raises', () => {
    it('raises a line booked below the engine by a rep allowed to override price', async () => {
        database([], [bookedLine]);

        const outcome = await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep);

        expect(outcome).toEqual({ Uncovered: 1, Created: 1 });
        expect(raisedDrafts()).toEqual([
            {
                TypeCode: PRICE_BELOW_ENGINE_TYPE_CODE,
                SourceEntityName: 'MJ_BizApps_Orders: Order Lines',
                SourceRecordID: LINE_ID,
                CompanyID: COMPANY_ID,
                Amount: 80,
                ExceptionDate: '2026-09-28',
                Summary: expect.stringMatching(/Line 1 of order ORD-TEST-1 .* 60\.00 .* 100\.00, a Price concession worth 80\.00; no approved/),
                DedupeKey: LINE_ID,
                SourceCreatedByUserID: 'override-rep',
                CreatorUnresolved: false,
            },
        ]);
        expect(mockTypes).toHaveBeenCalledWith({ Codes: [PRICE_BELOW_ENGINE_TYPE_CODE] });
    });

    it('raises a direct-Confirmed booking with no context user, which the gate never saw, as creator unresolved', async () => {
        // Saved straight to Confirmed: the lines exist only because this booking wrote them.
        database([], []);

        await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, null);

        const [draft] = raisedDrafts();
        expect(draft).toMatchObject({ SourceRecordID: LINE_ID, Amount: 80, SourceCreatedByUserID: null, CreatorUnresolved: true });
    });

    it('raises only the value an approved concession leaves uncovered', async () => {
        database([{ Status: 'Approved', DeliveryForm: 'Price', ReasonCategory: 'Retention', ComputedValue: 50, OrderLineID: LINE_ID }], [bookedLine]);

        await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep);

        const [draft] = raisedDrafts();
        expect(draft.Amount).toBe(30);
        expect(draft.Summary).toMatch(/an approved concession covers 50\.00 of it/);
    });

    it('treats a Pending concession as covering nothing', async () => {
        database([{ Status: 'Pending', DeliveryForm: 'Price', ReasonCategory: 'Other', ComputedValue: 80, OrderLineID: LINE_ID }], [bookedLine]);

        await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep);

        expect(raisedDrafts()[0].Amount).toBe(80);
    });

    it('counts an exception accounting already holds as not created', async () => {
        database([], [bookedLine]);
        mockRaise.mockResolvedValue({ Success: true, Output: { Success: true, Results: [{ Index: 0, Created: false }] } });

        expect(await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).toEqual({ Uncovered: 1, Created: 0 });
    });
});

describe('RaisePriceBelowEngineExceptions — what raises nothing', () => {
    it('raises nothing when an approved concession covers the line, and asks accounting nothing', async () => {
        database([{ Status: 'Approved', DeliveryForm: 'Price', ReasonCategory: 'Retention', ComputedValue: 80, OrderLineID: LINE_ID }], [bookedLine]);

        expect(await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).toEqual({ Uncovered: 0, Created: 0 });
        expect(mockTypes).not.toHaveBeenCalled();
        expect(mockRaise).not.toHaveBeenCalled();
    });

    it('raises nothing for a price above the engine', async () => {
        const above = { ...bookedLine, UnitPrice: 120 };
        database([], [above]);

        expect((await RaisePriceBelowEngineExceptions(booking([above]), provider, overrideRep)).Uncovered).toBe(0);
        expect(mockRaise).not.toHaveBeenCalled();
    });

    it('raises nothing for a named list pick', async () => {
        const pick = { ...bookedLine, ProductPriceID: 'member-price' };
        database([], [pick]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: true });

        expect((await RaisePriceBelowEngineExceptions(booking([pick]), provider, overrideRep)).Uncovered).toBe(0);
        expect(mockRaise).not.toHaveBeenCalled();
    });

    it('raises nothing for the engine price', async () => {
        database([], [bookedLine]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: 60, IsEnginePrice: true, IsNamedListPick: false });

        expect((await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).Uncovered).toBe(0);
    });

    it('excludes bundle components and reversals as the gate does, and still judges the bundle line', async () => {
        const bundle = { ...bookedLine, ID: BUNDLE_ID, LineNumber: 1 };
        const component = { ...bookedLine, ID: COMPONENT_ID, LineNumber: 2, ParentOrderLineID: BUNDLE_ID, UnitPrice: 83.33, Quantity: 1 };
        const reversal = { ...bookedLine, ID: REVERSAL_ID, LineNumber: 3, ReversesOrderLineID: ORIGIN_ID, Quantity: -1, UnitPrice: 40 };
        const lines = [bundle, component, reversal];
        database([], lines);

        await RaisePriceBelowEngineExceptions(booking(lines), provider, overrideRep);

        expect(raisedDrafts().map((d) => d.SourceRecordID)).toEqual([BUNDLE_ID]);
        expect(mockStanding).toHaveBeenCalledTimes(1);
    });
});

describe('RaisePriceBelowEngineExceptions — configuration and failure', () => {
    it('skips when the type is inactive', async () => {
        database([], [bookedLine]);
        typesAnswer([{ ...activeType, IsActive: false }]);

        const outcome = await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep);

        expect(outcome).toEqual({ Uncovered: 1, Created: 0, SkippedReason: 'the type is missing or inactive' });
        expect(mockRaise).not.toHaveBeenCalled();
    });

    it('skips when the type is not configured', async () => {
        database([], [bookedLine]);
        typesAnswer([]);

        expect((await RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).SkippedReason).toBe(
            'the type is missing or inactive',
        );
        expect(mockRaise).not.toHaveBeenCalled();
    });

    it('throws when accounting refuses the raise, so the booking rolls back', async () => {
        database([], [bookedLine]);
        mockRaise.mockResolvedValue({
            Success: true,
            Output: { Success: false, Results: [], Errors: [{ Index: 0, Code: 'ENTITY_UNKNOWN', Message: 'no such entity' }] },
        });

        await expect(RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).rejects.toThrow(
            /Raising the below-engine price exceptions for the booking of order ORD-TEST-1 failed\. #0 ENTITY_UNKNOWN: no such entity/,
        );
    });

    it('throws when the raise does not execute', async () => {
        database([], [bookedLine]);
        mockRaise.mockResolvedValue({ Success: false, ErrorMessage: 'forbidden' });

        await expect(RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).rejects.toThrow(
            /did not execute for the below-engine price exceptions for the booking of order ORD-TEST-1: forbidden/,
        );
    });

    it('throws when the types cannot be read', async () => {
        database([], [bookedLine]);
        mockTypes.mockResolvedValue({ Success: false, ResultCode: 'UNKNOWN_OPERATION' });

        await expect(RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).rejects.toThrow(
            /GetFinanceExceptionTypes did not execute: UNKNOWN_OPERATION/,
        );
    });

    it.each([
        ['Accounting.GetFinanceExceptionTypes', 0],
        ['Accounting.RaiseFinanceExceptions', 1],
    ] as const)('throws the not-registered message when %s is unregistered', async (key, callIndex) => {
        database([], [bookedLine]);
        // Resolve the real factory against a key nothing registers, so the test exercises its actual
        // fallback — a hollow base instance with Resolved false — rather than a stubbed null.
        const factory = MJGlobal.Instance.ClassFactory;
        const real = factory.TryCreateInstance.bind(factory);
        let calls = 0;
        const spy = vi.spyOn(factory, 'TryCreateInstance').mockImplementation(((base: unknown, k?: string | null) => {
            const unregistered = calls++ === callIndex;
            const res = real(base, unregistered ? `${k}.NotRegistered` : k);
            if (unregistered) {
                expect(res.Resolved).toBe(false);
                expect(res.Instance).not.toBeNull();
            }
            return res;
        }) as typeof factory.TryCreateInstance);
        try {
            await expect(RaisePriceBelowEngineExceptions(booking([bookedLine]), provider, overrideRep)).rejects.toThrow(
                new RegExp(`The '${key.replace('.', '\\.')}' operation is not registered`),
            );
            expect(mockRaise).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });
});

describe('OrderEntityServer booking walk', () => {
    // The booking save cannot be constructed in a unit test; hold its ordering by source instead.
    const source = readFileSync(fileURLToPath(new URL('../OrderEntityServer.ts', import.meta.url)), 'utf8');

    it('raises inside the booking transaction, after the lines are written and before commit', () => {
        const begin = source.indexOf('await dbProvider.BeginTransaction();');
        const writeLines = source.indexOf('await this.persistPreparedLines(options, decisions);\n            }\n\n            // THE PRICE');
        const raise = source.indexOf('await this.raisePriceBelowEngineExceptions(lines);');
        const commit = source.indexOf('await dbProvider.CommitTransaction();');
        expect(begin).toBeGreaterThan(-1);
        expect(writeLines).toBeGreaterThan(begin);
        expect(raise).toBeGreaterThan(writeLines);
        expect(commit).toBeGreaterThan(raise);
    });
});
