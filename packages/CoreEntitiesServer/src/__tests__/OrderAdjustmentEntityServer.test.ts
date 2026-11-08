/**
 * A recorded adjustment is neither re-authorized nor deleted by hand (golive #328).
 *
 * The confirm gate sees a held manual discount only as an adjustment row with no authority and no
 * approver. Stamping either on the row, or deleting it, would hide a discount the line still gives
 * away, so a saved row's authorization and discount fields are fixed, and only an order's own save
 * deletes one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const { OrderAdjustmentEntityServer } = await import('../OrderAdjustmentEntityServer.js');

type Adjustment = InstanceType<typeof OrderAdjustmentEntityServer> & {
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

/** A row whose `dirty` fields have changed since it was read. */
function adjustment(opts: { saved?: boolean; dirty?: string[] } = {}): Adjustment {
    const row = Object.create(OrderAdjustmentEntityServer.prototype) as Adjustment;
    const dirty = new Set(opts.dirty ?? []);
    // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
    Object.defineProperty(row, 'IsSaved', { value: opts.saved ?? true });
    Object.defineProperty(row, 'Fields', { value: [] });
    Object.defineProperty(row, 'GetFieldByName', { value: (name: string) => ({ Name: name, Dirty: dirty.has(name) }) });
    row.RemovedByOrderSave = false;
    row.RegisterResultHistoryEntry = vi.fn();
    return row;
}

function refusal(row: Adjustment): string {
    return row.RegisterResultHistoryEntry.mock.calls[0]?.[0]?.Message ?? '';
}

afterEach(() => vi.restoreAllMocks());

describe('OrderAdjustmentEntityServer.Save', () => {
    it.each(['AuthorizedBySalesAuthorityID', 'ApprovedByUserID', 'ApprovedAt'])(
        'refuses a change to %s on a saved row',
        async (field) => {
            const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
            const row = adjustment({ dirty: [field] });

            expect(await row.Save()).toBe(false);
            expect(base).not.toHaveBeenCalled();
            expect(refusal(row)).toMatch(new RegExp(`authorization \\(${field}\\).*cannot be changed`));
        },
    );

    it.each(['Amount', 'OrderLineID', 'PromotionID', 'PromotionCodeID'])(
        'refuses a change to %s on a saved row',
        async (field) => {
            const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
            const row = adjustment({ dirty: [field] });

            expect(await row.Save()).toBe(false);
            expect(base).not.toHaveBeenCalled();
            expect(refusal(row)).toMatch(new RegExp(`discount \\(${field}\\) cannot be changed`));
        },
    );

    it('saves a change to a field that decides nothing, such as the reason', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);

        expect(await adjustment({ dirty: ['Reason'] }).Save()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });

    it('inserts a new row with its authorization, as the save path writes it', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const row = adjustment({ saved: false, dirty: ['Amount', 'OrderLineID', 'AuthorizedBySalesAuthorityID'] });

        expect(await row.Save()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });
});

describe('OrderAdjustmentEntityServer.Delete', () => {
    it('refuses a direct delete', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const row = adjustment();

        expect(await row.Delete()).toBe(false);
        expect(base).not.toHaveBeenCalled();
        expect(refusal(row)).toMatch(/cannot be deleted directly/);
    });

    it("deletes a row the order's own save is removing", async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const row = adjustment();
        row.RemovedByOrderSave = true;

        expect(await row.Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });
});
