import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT A LINE STORES IS WHAT IT BOOKS.
 *
 * A line's derived tags are written as `OrderLineDimension` rows on save, and a person can also set
 * one tag on the line itself. The journal entry factory has always let that hand-set tag win on its
 * axis. Before this, the stored rows did not: they kept the derived value, so the ledger carried one
 * value and the line's own record of its tags another, with nothing on screen to say they differed.
 *
 * These drive the real `reconcileLineDimensions` and `stampLineDimensions` on an `Object.create`
 * instance, the way the sibling order tests hold server entities without standing up metadata.
 */

const accounting = vi.hoisted(() => ({ LoadAccountingEngine: vi.fn() }));
vi.mock('../AccountingBridge.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../AccountingBridge.js')>()),
    LoadAccountingEngine: accounting.LoadAccountingEngine,
}));

import { OrderEntityServer } from '../OrderEntityServer.js';

const LINE = 'a0000000-0000-4000-8000-000000000001';
const PRODUCT_AXIS = 'b0000000-0000-4000-8000-000000000001';
const VENTURE_AXIS = 'b0000000-0000-4000-8000-000000000002';
const DEFAULT_VALUE = 'c0000000-0000-4000-8000-000000000001';
const HAND_VALUE = 'c0000000-0000-4000-8000-000000000002';
const VENTURE_VALUE = 'c0000000-0000-4000-8000-000000000003';

interface StoredRow {
    OrderLineID: string;
    DimensionID: string;
    DimensionValueID: string;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

type Reconcile = (
    line: unknown,
    derived: Array<{ DimensionID: string; DimensionValueID: string }>,
    existing: StoredRow[],
) => Promise<void>;

function storedRow(dimensionID: string, valueID: string): StoredRow {
    return {
        OrderLineID: LINE,
        DimensionID: dimensionID,
        DimensionValueID: valueID,
        Save: vi.fn().mockResolvedValue(true),
        Delete: vi.fn().mockResolvedValue(true),
    };
}

/** An order whose provider hands out new tag rows and records each one. */
function orderRecordingInserts(inserted: StoredRow[]) {
    const order = Object.create(OrderEntityServer.prototype) as OrderEntityServer;
    Object.defineProperty(order, 'ContextCurrentUser', { value: { ID: 'user-1' }, writable: true });
    Object.defineProperty(order, 'ProviderToUse', {
        value: {
            GetEntityObject: vi.fn(async () => {
                const row = { ...storedRow('', ''), NewRecord: vi.fn() };
                inserted.push(row);
                return row;
            }),
        },
        writable: true,
    });
    return order;
}

function lineTagged(dimensionID: string | null, valueID: string | null) {
    return { ID: LINE, LineNumber: 1, DimensionID: dimensionID, DimensionValueID: valueID };
}

function reconcileOf(order: OrderEntityServer): Reconcile {
    return (OrderEntityServer.prototype as unknown as { reconcileLineDimensions: Reconcile })
        .reconcileLineDimensions.bind(order);
}

describe('reconcileLineDimensions', () => {
    it('stores the hand-set tag in place of the derived value on the same axis', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);
        const existing = [storedRow(PRODUCT_AXIS, DEFAULT_VALUE)];

        await reconcileOf(order)(
            lineTagged(PRODUCT_AXIS, HAND_VALUE),
            [{ DimensionID: PRODUCT_AXIS, DimensionValueID: DEFAULT_VALUE }],
            existing,
        );

        expect(existing[0].DimensionValueID).toBe(HAND_VALUE);
        expect(existing[0].Save).toHaveBeenCalledTimes(1);
        expect(existing[0].Delete).not.toHaveBeenCalled();
        expect(inserted).toHaveLength(0);
    });

    it('matches the axis case-insensitively, so an uppercased stored id is updated, not duplicated', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);
        const existing = [storedRow(PRODUCT_AXIS.toUpperCase(), DEFAULT_VALUE.toUpperCase())];

        await reconcileOf(order)(
            lineTagged(PRODUCT_AXIS, HAND_VALUE),
            [{ DimensionID: PRODUCT_AXIS.toUpperCase(), DimensionValueID: DEFAULT_VALUE.toUpperCase() }],
            existing,
        );

        expect(existing[0].DimensionValueID).toBe(HAND_VALUE);
        expect(inserted).toHaveLength(0);
    });

    it('leaves derived tags on other axes untouched', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);
        const venture = storedRow(VENTURE_AXIS, VENTURE_VALUE);
        const product = storedRow(PRODUCT_AXIS, DEFAULT_VALUE);

        await reconcileOf(order)(
            lineTagged(PRODUCT_AXIS, HAND_VALUE),
            [
                { DimensionID: VENTURE_AXIS, DimensionValueID: VENTURE_VALUE },
                { DimensionID: PRODUCT_AXIS, DimensionValueID: DEFAULT_VALUE },
            ],
            [venture, product],
        );

        expect(venture.Save).not.toHaveBeenCalled();
        expect(venture.Delete).not.toHaveBeenCalled();
        expect(product.DimensionValueID).toBe(HAND_VALUE);
    });

    it('stores a hand-set tag on an axis nothing derived', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);

        await reconcileOf(order)(lineTagged(PRODUCT_AXIS, HAND_VALUE), [], []);

        expect(inserted).toHaveLength(1);
        expect(inserted[0]).toMatchObject({
            OrderLineID: LINE,
            DimensionID: PRODUCT_AXIS,
            DimensionValueID: HAND_VALUE,
        });
    });

    it('puts the derived value back once the hand-set tag is cleared', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);
        const existing = [storedRow(PRODUCT_AXIS, HAND_VALUE)];

        await reconcileOf(order)(
            lineTagged(null, null),
            [{ DimensionID: PRODUCT_AXIS, DimensionValueID: DEFAULT_VALUE }],
            existing,
        );

        expect(existing[0].DimensionValueID).toBe(DEFAULT_VALUE);
        expect(existing[0].Save).toHaveBeenCalledTimes(1);
    });

    it('removes a hand-set row once cleared when nothing derives that axis', async () => {
        const inserted: StoredRow[] = [];
        const order = orderRecordingInserts(inserted);
        const existing = [storedRow(PRODUCT_AXIS, HAND_VALUE)];

        await reconcileOf(order)(lineTagged(null, null), [], existing);

        expect(existing[0].Delete).toHaveBeenCalledTimes(1);
    });
});

describe('stampLineDimensions', () => {
    it('does not touch a booked line, whose tags are what its journal entry already carries', async () => {
        accounting.LoadAccountingEngine.mockClear();
        const order = Object.create(OrderEntityServer.prototype) as OrderEntityServer;
        const stamp = (OrderEntityServer.prototype as unknown as {
            stampLineDimensions: (lines: unknown[]) => Promise<void>;
        }).stampLineDimensions.bind(order);

        await stamp([{ ...lineTagged(PRODUCT_AXIS, HAND_VALUE), JournalEntryID: 'je-1' }]);

        expect(accounting.LoadAccountingEngine).not.toHaveBeenCalled();
    });
});
