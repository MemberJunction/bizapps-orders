import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import { OrdersCancelExternalInvoiceOperation } from '@mj-biz-apps/orders-entities';
import { ExternalInvoicesPanel } from '../lib/form-panels/external-invoices.panel';
import { MJOReturnPageComponent } from '../lib/pages/orders/return.page';

/**
 * golive #379, on screen. After a full return the original order has no balance due and the return's
 * own balance is zero or negative, so neither has anything for the scheduled send to invoice: the
 * External invoicing panel must not offer Send or say "queued" on either. And once the whole order
 * has come back, the return page offers to cancel the original's Sent invoice.
 */
afterEach(() => vi.restoreAllMocks());

function panel(balance: number | null, status = 'Confirmed') {
    const p = Object.create(ExternalInvoicesPanel.prototype) as ExternalInvoicesPanel;
    Object.assign(p, { Record: { Status: status, Balance: balance }, Rows: [], Visible: true, BilledOnSchedule: false, ProviderName: 'Bill.com' });
    return p;
}

describe('External invoicing panel on a settled order', () => {
    it('offers Send, and says queued, while the order owes something', () => {
        const p = panel(3000);
        expect(p.SendShown).toBe(true);
        expect(p.Sendable).toBe(true);
        expect(p.EmptyMessage).toContain('queued');
    });

    it.each([
        ['an original its return settled', 0],
        ['a return holding credit', -3000],
    ])('offers no Send and says nothing is queued on %s', (_label, balance) => {
        const p = panel(balance);
        expect(p.SendShown).toBe(false);
        expect(p.Sendable).toBe(false);
        expect(p.EmptyMessage).not.toContain('queued');
    });
});

type ReturnPage = {
    OfferInvoiceCancel(returnNumber: string): Promise<void>;
    Notice: string | null;
    Error: string | null;
};

function returnPage(remaining: number) {
    const confirm = vi.fn().mockResolvedValue(true);
    const page = Object.create(MJOReturnPageComponent.prototype) as unknown as ReturnPage;
    Object.assign(page, {
        Origin: { ID: 'bbbbbbbb-0000-4000-8000-000000002503', OrderNumber: 'ORD-002503' },
        Lines: [{ Bought: 1, AlreadyReturned: 1 - remaining, Returning: 0 }],
        Reason: 'Pricing error',
        Notice: null,
        Error: null,
        confirm: { Confirm: confirm },
        cdr: { detectChanges: () => undefined },
    });
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
        Success: true,
        Results: [{ ID: 'cccccccc-0000-4000-8000-000000000001', DocumentNumber: 'INV-2503', Amount: 1 }],
    } as never);
    const cancel = vi
        .spyOn(OrdersCancelExternalInvoiceOperation.prototype, 'Execute')
        .mockResolvedValue({ Success: true, Output: { Success: true, Message: 'INV-2503 was archived.' } } as never);
    return { page, confirm, cancel };
}

describe('the return page offers to cancel the original’s invoice', () => {
    it('after a full return, asks, then cancels with the return’s reason', async () => {
        const { page, confirm, cancel } = returnPage(0);

        await page.OfferInvoiceCancel('ORD-002504');

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(cancel.mock.calls[0][0]).toEqual({
            ExternalInvoiceID: 'cccccccc-0000-4000-8000-000000000001',
            Reason: 'Returned in full on ORD-002504: Pricing error',
        });
        expect(page.Notice).toBe('INV-2503 was archived.');
    });

    it('does not ask after a partial return', async () => {
        const { page, confirm, cancel } = returnPage(0.5);

        await page.OfferInvoiceCancel('ORD-002504');

        expect(confirm).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
    });
});
