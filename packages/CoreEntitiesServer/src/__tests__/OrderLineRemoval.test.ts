/**
 * Removed order lines must actually be deleted — golive #187.
 *
 * `OrderEntityServer.Save()` opts out of MJ's standard companion-collection pass
 * (`SkipRelatedCollections`) because lines have to be expanded, priced and taxed before they can be
 * written. The replacement it supplies, `savePendingLines()`, only ever inserted and updated, so
 * `Lines.Removed` was never drained. Two failures came out of that, and both are asserted here:
 *
 *   - the LOUD one: the deleted row keeps `LineNumber = 1`, the replacement line is re-sequenced to
 *     1, and `UQ_OrderLine_OrderHeader_LineNumber` refuses the insert; and
 *   - the SILENT one: remove a line, save, add nothing — no error, and the row is still on disk.
 *
 * ORDER IS THE WHOLE FIX. Deleting after the retained lines are written would still hit the unique
 * key, so the assertion that matters most below is the one about call order, not the one about the
 * delete having happened.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

const { OrderEntityServer } = await import('../OrderEntityServer.js');
const { OrderHeaderEntity } = await import('@mj-biz-apps/orders-entities');

const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** The private surface these tests drive. */
type RemovalOrder = {
    deleteRemovedLines(): Promise<void>;
    deleteLineDependents(line: unknown): Promise<void>;
    Save(options?: unknown): Promise<boolean>;
};

type FakeLine = {
    ID: string;
    LineNumber: number;
    IsSaved: boolean;
    Delete: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    LatestResult?: { CompleteMessage: string };
    // `ExtractEntityErrorMessage` walks both on its way to a human-readable reason.
    ResultHistory?: unknown[];
    Validate?: () => { Success: boolean; Errors: unknown[] };
};

function fakeLine(lineNumber: number, log: string[], overrides: Partial<FakeLine> = {}): FakeLine {
    return {
        ID: LINE_ID,
        LineNumber: lineNumber,
        IsSaved: true,
        Delete: vi.fn(async () => {
            log.push(`delete-line:${lineNumber}`);
            return true;
        }),
        Save: vi.fn(async () => {
            log.push(`save-line:${lineNumber}`);
            return true;
        }),
        LatestResult: { CompleteMessage: '' },
        ResultHistory: [],
        Validate: () => ({ Success: true, Errors: [] }),
        ...overrides,
    };
}

/** A dependent row as `RunView` hands it back in `entity_object` mode. */
function dependentRow(label: string, log: string[], succeeds = true) {
    return {
        Delete: vi.fn(async () => {
            log.push(`delete-dependent:${label}`);
            return succeeds;
        }),
        LatestResult: { CompleteMessage: succeeds ? '' : 'row is referenced elsewhere' },
        ResultHistory: [],
        Validate: () => ({ Success: true, Errors: [] }),
    };
}

/** An order with the real prototype and only the removal seams supplied. */
function orderWith(removed: FakeLine[], items: FakeLine[] = []) {
    const instance = Object.create(OrderEntityServer.prototype) as unknown as RemovalOrder;
    Object.assign(instance, { Lines: { Removed: removed, Items: items, Dirty: true, IsLoaded: true } });
    // `ProviderToUse` and `ContextCurrentUser` are getters on BaseEntity, so they are shadowed
    // rather than assigned.
    Object.defineProperty(instance, 'ProviderToUse', { value: {}, writable: true });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' }, writable: true });
    return instance;
}

beforeEach(() => {
    mockRunView.mockReset();
    mockRunView.mockResolvedValue({ Success: true, Results: [] });
});

describe('OrderEntityServer.deleteRemovedLines', () => {
    it('deletes a removed line that reached the database', async () => {
        const log: string[] = [];
        const line = fakeLine(1, log);

        await orderWith([line]).deleteRemovedLines();

        expect(line.Delete).toHaveBeenCalledTimes(1);
    });

    it('clears the dependent rows before deleting the line itself', async () => {
        // A draft line that has been saved once already has price components pointing at it, and
        // spDeleteOrderLine is a bare DELETE — none of the thirteen foreign keys into OrderLine
        // cascades. Deleting the line first fails on FK_OLPC_OrderLine.
        const log: string[] = [];
        mockRunView.mockResolvedValue({ Success: true, Results: [dependentRow('component', log)] });

        await orderWith([fakeLine(1, log)]).deleteRemovedLines();

        expect(log.indexOf('delete-dependent:component')).toBeLessThan(log.indexOf('delete-line:1'));
    });

    it('sweeps every dependent table, child rows before their parent', async () => {
        await orderWith([fakeLine(1, [])]).deleteRemovedLines();

        const swept = mockRunView.mock.calls.map((call) => (call[0] as { EntityName: string }).EntityName);
        expect(swept).toEqual([
            'MJ_BizApps_Orders: Order Line Price Components',
            'MJ_BizApps_Orders: Order Charge Allocations',
            'MJ_BizApps_Orders: Order Adjustment Allocations',
            'MJ_BizApps_Orders: Order Adjustments',
            'MJ_BizApps_Orders: Order Line Dimensions',
        ]);
    });

    it('does no work and issues no queries when nothing was removed', async () => {
        // The hot path: every ordinary edit runs through here and must stay free.
        await orderWith([]).deleteRemovedLines();

        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('ignores a line that was added and removed without ever being saved', async () => {
        // MJ drops those from `removed` at Remove() time; this asserts we did not re-invent it,
        // and that an unsaved line can never reach a Delete() that would fail.
        const log: string[] = [];
        const unsaved = fakeLine(1, log, { IsSaved: false });

        await orderWith([unsaved]).deleteRemovedLines();

        expect(unsaved.Delete).not.toHaveBeenCalled();
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('throws with the line identified when the line delete fails', async () => {
        const line = fakeLine(4, [], {
            Delete: vi.fn().mockResolvedValue(false),
            LatestResult: { CompleteMessage: 'row is referenced by a subscription' },
        });

        await expect(orderWith([line]).deleteRemovedLines()).rejects.toThrow(/order line 4/);
    });

    it('throws naming the table when a dependent row will not delete', async () => {
        const log: string[] = [];
        mockRunView.mockResolvedValue({ Success: true, Results: [dependentRow('c', log, false)] });
        const line = fakeLine(2, log);

        await expect(orderWith([line]).deleteRemovedLines()).rejects.toThrow(
            /Order Line Price Components.*order line 2/,
        );
        // And the line itself is left alone, so the transaction rolls back with the row intact
        // rather than half-cleared.
        expect(line.Delete).not.toHaveBeenCalled();
    });

    it('refuses rather than part-clearing when a table is at the row cap', async () => {
        mockRunView.mockResolvedValue({
            Success: true,
            Results: Array.from({ length: 1000 }, () => dependentRow('c', [])),
        });

        await expect(orderWith([fakeLine(7, [])]).deleteRemovedLines()).rejects.toThrow(/refusing to delete/);
    });
});

/** Drive the real `Save()` with every seam it touches stubbed, logging the ones that matter. */
function savableOrder(removed: FakeLine[], retained: FakeLine[], log: string[]) {
    const instance = orderWith(removed, retained);
    Object.assign(instance, {
        passesStatusTransition: () => true,
        ApplyPersonPartyDefaults: vi.fn().mockResolvedValue(undefined),
        willBookOnThisSave: () => false,
        deleteLineDependents: vi.fn().mockResolvedValue(undefined),
        expandBundles: vi.fn().mockResolvedValue(undefined),
        prepareLines: vi.fn().mockResolvedValue(undefined),
        saveTaxReasons: vi.fn().mockResolvedValue(undefined),
        // Deriving a line's GL dimensions runs after the line loop and reaches for accounting's
        // vocabulary. The removal ORDER is what this file pins; the tagging is its own subject.
        stampLineDimensions: vi.fn().mockResolvedValue(undefined),
        savePriceComponents: vi.fn().mockResolvedValue(undefined),
        refreshRolledUpTotals: vi.fn(async () => {
            log.push('refresh-rollups');
        }),
        ProviderToUse: {
            BeginTransaction: vi.fn().mockResolvedValue(undefined),
            CommitTransaction: vi.fn().mockResolvedValue(undefined),
            RollbackTransaction: vi.fn().mockResolvedValue(undefined),
        },
    });
    // Both are accessors backed by the field list a real entity loads, so they are shadowed.
    Object.defineProperty(instance, 'IsSaved', { value: true });
    Object.defineProperty(instance, 'OrderNumber', { value: 'ORD-000003', writable: true });

    const headerSave = vi.spyOn(OrderHeaderEntity.prototype, 'Save').mockImplementation(async () => {
        log.push('save-header');
        return true;
    });
    return { instance, headerSave };
}

describe('OrderEntityServer.Save — removal ordering', () => {
    it('issues the deletes before any retained line is written', async () => {
        // THE assertion. `expandBundles` re-stamps LineNumber by position and the browser has
        // already done the same, so the removed row and its replacement both claim LineNumber 1.
        // Freeing the number first is the only thing that makes the insert legal.
        const log: string[] = [];
        const { instance, headerSave } = savableOrder([fakeLine(1, log)], [fakeLine(1, log)], log);

        try {
            await expect(instance.Save()).resolves.toBe(true);
        } finally {
            headerSave.mockRestore();
        }

        // The trailing refresh is the pre-existing one every successful save ends with.
        expect(log).toEqual([
            'delete-line:1',
            'refresh-rollups',
            'save-header',
            'save-line:1',
            'refresh-rollups',
        ]);
    });

    it('re-reads the header rollups after a delete, before the header is written', async () => {
        // The delete fires trg_OrderLine_RollupTotals, which recalculates the header's totals on
        // the row. Writing the header from what the client still holds would put the pre-delete
        // figures back — and on a removal that empties the order nothing is inserted afterwards to
        // fire the trigger again, so the stale total is the one that sticks. Measured live before
        // this call existed: an order with no lines and a header still reading $45.
        const log: string[] = [];
        const { instance, headerSave } = savableOrder([fakeLine(1, log)], [], log);

        try {
            await instance.Save();
        } finally {
            headerSave.mockRestore();
        }

        expect(log.indexOf('refresh-rollups')).toBeGreaterThan(log.indexOf('delete-line:1'));
        expect(log.indexOf('refresh-rollups')).toBeLessThan(log.indexOf('save-header'));
    });

    it('does not re-read the rollups when nothing was removed', async () => {
        // The hot path. An ordinary edit must not pay for a query the delete pass never made.
        const log: string[] = [];
        const { instance, headerSave } = savableOrder([], [fakeLine(1, log)], log);

        try {
            await instance.Save();
        } finally {
            headerSave.mockRestore();
        }

        // One refresh only — the unconditional one at the end of a successful save.
        expect(log.filter((entry) => entry === 'refresh-rollups')).toHaveLength(1);
        expect(log.indexOf('refresh-rollups')).toBeGreaterThan(log.indexOf('save-header'));
    });
});
