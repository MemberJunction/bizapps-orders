/**
 * A decided concession is the record of that decision and refuses deletion — except when the draft
 * line it priced is removed, where it has to go with the line or FK_OrderConcession_OrderLine
 * refuses the line's delete (golive #222), and except one approved on the requester's own authority
 * while its order is not confirmed, which is withdrawn and recorded again when a draft changes (#306).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

type DeletableConcession = {
    Status: string;
    WithdrawWithDraftLine: boolean;
    Delete(): Promise<boolean>;
};

const AUTHORITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
const RULE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';

function concession(
    status: string,
    decidedBy: { AuthorizedBySalesAuthorityID?: string | null; SalesRuleID?: string | null } = {},
    orderStatus = 'Draft',
): DeletableConcession {
    const instance = Object.create(OrderConcessionEntityServer.prototype) as DeletableConcession & Record<string, unknown>;
    // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
    Object.defineProperty(instance, 'Status', { value: status, writable: true });
    Object.defineProperty(instance, 'AuthorizedBySalesAuthorityID', { value: decidedBy.AuthorizedBySalesAuthorityID ?? null });
    Object.defineProperty(instance, 'SalesRuleID', { value: decidedBy.SalesRuleID ?? null });
    Object.defineProperty(instance, 'OrderHeaderID', { value: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    instance.loadRow = vi.fn().mockResolvedValue({ Status: orderStatus });
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

    it('withdraws one approved on the requester\'s own authority while the order is a draft', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Approved', { AuthorizedBySalesAuthorityID: AUTHORITY_ID }).Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
    });

    it('keeps one approved on the requester\'s own authority once the order is confirmed', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Approved', { AuthorizedBySalesAuthorityID: AUTHORITY_ID }, 'Confirmed').Delete()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });

    it('keeps one an approver decided, even on a draft', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Approved', { SalesRuleID: RULE_ID }).Delete()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });
});
