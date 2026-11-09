/**
 * `OrderEntityServer.PreviewConcessionProblems` (golive #340) asks the concession gate exactly what
 * confirm asks it, so the order form's list and confirm's refusal cannot disagree.
 *
 * `Object.create` matches the sibling order tests: it holds the server entity without standing up
 * metadata, with the generated accessors shadowed by plain properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ConcessionGate.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ConcessionGate.js')>()),
    FindUnapprovedConcessions: vi.fn(async () => [] as string[]),
}));

import { OrderEntityServer } from '../OrderEntityServer.js';
import { FindUnapprovedConcessions } from '../ConcessionGate.js';

type GateHooks = { passesConcessionGate(): Promise<boolean> };

const ORDER_ID = 'B0000000-0000-4000-8000-000000000001';
const CLAUSES = [
    'line 1 is discounted 10%, a concession worth 1000.00 with no approved Price concession recorded for it',
    'a price concession worth 50.00 (goodwill) is awaiting approval',
];

function savedLine() {
    return {
        IsSaved: true,
        ID: 'L0000000-0000-4000-8000-000000000001',
        LineNumber: 1,
        ParentOrderLineID: null,
        ReversesOrderLineID: null,
        ProductID: 'R0000000-0000-4000-8000-000000000001',
        Quantity: 1,
        UnitPrice: 9000,
        ProductPriceID: null,
        DiscountPct: 0.1,
        RenewsSubscriptionID: null,
        IsRollupParent: false,
        GetFieldByName: () => ({ Dirty: false }),
    };
}

function order(opts: { user?: { ID: string } | null; linesLoaded?: boolean } = {}) {
    const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer & GateHooks;
    const failures: Error[] = [];
    const lines = {
        Items: [] as ReturnType<typeof savedLine>[],
        IsLoaded: opts.linesLoaded ?? true,
        Load: vi.fn(async () => {
            lines.Items = [savedLine()];
            lines.IsLoaded = true;
        }),
    };
    if (lines.IsLoaded) lines.Items = [savedLine()];
    for (const [k, v] of Object.entries({
        IsSaved: true,
        ID: ORDER_ID,
        OrderNumber: 'ORD-1',
        ContextCurrentUser: opts.user === undefined ? { ID: 'user-1' } : opts.user,
        ProviderToUse: {},
        Lines: lines,
        _renewalPricedLines: new Map(),
    })) {
        Object.defineProperty(o, k, { value: v, writable: true });
    }
    Object.defineProperty(o, 'pendingLineNet', { value: () => 8100 });
    Object.defineProperty(o, 'RegisterResultHistoryEntry', { value: (entry: Error) => failures.push(entry) });
    Object.defineProperty(o, 'buildFailureResult', { value: (err: Error) => err });
    return { o, failures, lines };
}

afterEach(() => vi.clearAllMocks());

describe('PreviewConcessionProblems', () => {
    it('returns the clauses confirm refuses with, and the refusal carries the same clauses', async () => {
        vi.mocked(FindUnapprovedConcessions).mockResolvedValue(CLAUSES);
        const preview = order();
        expect(await preview.o.PreviewConcessionProblems()).toEqual(CLAUSES);

        const confirm = order();
        expect(await confirm.o.passesConcessionGate()).toBe(false);
        expect(confirm.failures[0].message).toContain(CLAUSES.join('; '));
    });

    it('asks the gate the same question confirm asks: the saved order, its lines, line prices included', async () => {
        const { o } = order();
        await o.PreviewConcessionProblems();
        await o.passesConcessionGate();
        const [previewCall, confirmCall] = vi.mocked(FindUnapprovedConcessions).mock.calls;
        expect(previewCall).toEqual(confirmCall);
        expect(previewCall[0]).toBe(ORDER_ID);
        expect(previewCall[2]).toBe(true);
        expect(previewCall[1]).toHaveLength(1);
        expect(previewCall[1][0]).toMatchObject({ LineNumber: 1, DiscountPct: 0.1, PriceStated: true, LineTotalNet: 8100 });
    });

    it('loads the saved lines first when they are not in memory', async () => {
        const { o, lines } = order({ linesLoaded: false });
        await o.PreviewConcessionProblems();
        expect(lines.Load).toHaveBeenCalledTimes(1);
        expect(vi.mocked(FindUnapprovedConcessions).mock.calls[0][1]).toHaveLength(1);
    });

    it('reports nothing without a context user, as the gate passes without one', async () => {
        vi.mocked(FindUnapprovedConcessions).mockResolvedValue(CLAUSES);
        const { o } = order({ user: null });
        expect(await o.PreviewConcessionProblems()).toEqual([]);
        expect(FindUnapprovedConcessions).not.toHaveBeenCalled();
    });
});
