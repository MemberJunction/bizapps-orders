/**
 * A decided concession is the record of that decision and refuses deletion — except when the draft
 * line it priced is removed, where it has to go with the line or FK_OrderConcession_OrderLine
 * refuses the line's delete (golive #222).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

type DeletableConcession = {
    Status: string;
    WithdrawWithDraftLine: boolean;
    Delete(): Promise<boolean>;
};

function concession(status: string): DeletableConcession {
    const instance = Object.create(OrderConcessionEntityServer.prototype) as DeletableConcession & Record<string, unknown>;
    // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
    Object.defineProperty(instance, 'Status', { value: status, writable: true });
    Object.defineProperty(instance, 'IsSaved', { value: true });
    Object.defineProperty(instance, 'Fields', { value: [] });
    instance.WithdrawWithDraftLine = false;
    instance.RegisterResultHistoryEntry = vi.fn();
    return instance;
}

afterEach(() => vi.restoreAllMocks());

describe('OrderConcessionEntityServer.Delete', () => {
    it('refuses to delete a decided concession', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Approved').Delete()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });

    it('withdraws a Pending concession', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Pending').Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });

    it('lets a decided concession go with its removed draft line', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const row = concession('Approved');
        row.WithdrawWithDraftLine = true;

        expect(await row.Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });
});
