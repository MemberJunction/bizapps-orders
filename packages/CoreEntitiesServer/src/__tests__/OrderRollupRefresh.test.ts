import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OrderEntityServer } from '../OrderEntityServer.js';
import type { ResolvedOrderRollups } from '../OrderRollupBehavior.js';

const here = import.meta.dirname;

/**
 * The plumbing half of issue bc-aidp-next-golive#186. `MergeOrderRollups` decides WHICH values win;
 * `refreshRolledUpTotals` is what puts them back on the entity, and how it does that is
 * load-bearing twice over:
 *
 *  - the fields are reset before being written, because a rollup column may be read-only at the
 *    metadata layer and the EntityField setter silently drops writes to those; and
 *  - they are written as PRISTINE values, because a figure the database computed must not come
 *    back looking like an unsaved user edit that the next validation pass can reject.
 */
type RefreshableOrder = {
    refreshRolledUpTotals(): Promise<void>;
    readBalanceFromRow(): Promise<ResolvedOrderRollups>;
    GetFieldByName(name: string): { ResetNeverSetFlag(): void } | undefined;
    SetMany(
        object: object,
        ignoreNonExistentFields?: boolean,
        replaceOldValues?: boolean,
        ignoreActiveStatusAssertions?: boolean,
    ): void;
};

const bookedRollups: ResolvedOrderRollups = {
    TotalGross: 895,
    AmountPaid: 0,
    Balance: 895,
    FulfillmentStatus: 'NotApplicable',
};

/** An order object with the real prototype, and the two seams it touches stubbed. */
function stubbedOrder(row: ResolvedOrderRollups = bookedRollups) {
    const instance = Object.create(OrderEntityServer.prototype) as unknown as RefreshableOrder;
    const resets: string[] = [];
    const setMany = vi.fn();

    instance.readBalanceFromRow = vi.fn().mockResolvedValue(row);
    instance.GetFieldByName = (name: string) => ({
        ResetNeverSetFlag: () => {
            resets.push(name);
        },
    });
    instance.SetMany = setMany;

    return { instance, resets, setMany };
}

describe('OrderEntityServer.refreshRolledUpTotals', () => {
    it('writes the row values onto the entity', async () => {
        const { instance, setMany } = stubbedOrder();

        await instance.refreshRolledUpTotals();

        expect(setMany).toHaveBeenCalledTimes(1);
        expect(setMany.mock.calls[0][0]).toEqual(bookedRollups);
    });

    it('lands them as pristine state, not as a pending edit', async () => {
        const { instance, setMany } = stubbedOrder();

        await instance.refreshRolledUpTotals();

        // SetMany(object, ignoreNonExistentFields, replaceOldValues, ignoreActiveStatusAssertions)
        expect(setMany.mock.calls[0][2]).toBe(true);
    });

    it('clears the never-set latch on every rollup field first', async () => {
        const { instance, resets } = stubbedOrder();

        await instance.refreshRolledUpTotals();

        expect(resets).toEqual(['TotalGross', 'AmountPaid', 'Balance', 'FulfillmentStatus']);
    });

    it('resets before writing, or the writes are dropped', async () => {
        const order: string[] = [];
        const instance = Object.create(OrderEntityServer.prototype) as unknown as RefreshableOrder;
        instance.readBalanceFromRow = vi.fn().mockResolvedValue(bookedRollups);
        instance.GetFieldByName = () => ({ ResetNeverSetFlag: () => order.push('reset') });
        instance.SetMany = () => order.push('set');

        await instance.refreshRolledUpTotals();

        expect(order[order.length - 1]).toBe('set');
        expect(order.filter((step) => step === 'reset')).toHaveLength(4);
    });
});

describe('OrderEntityServer.Save', () => {
    const source = readFileSync(join(here, '../OrderEntityServer.ts'), 'utf8');

    it('refreshes the rollups on both paths that reach the database', () => {
        // The full path writes lines and payments and then has to ask what they came to. The
        // header-only shortcut refreshes for the opposite reason: it is the update that used to
        // carry a client's stale NULL to spUpdateOrderHeader and erase the stored total.
        expect(source.match(/await this\.refreshRolledUpTotals\(\)/g)).toHaveLength(2);
    });

    it('refreshes before the transaction commits, so a rollback takes it with it', () => {
        const refresh = source.lastIndexOf('await this.refreshRolledUpTotals()');
        const commit = source.indexOf('await dbProvider.CommitTransaction()');
        expect(refresh).toBeGreaterThan(0);
        expect(refresh).toBeLessThan(commit);
    });
});
