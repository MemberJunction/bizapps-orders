/**
 * The order form's "Before this can be confirmed" list carries the concession problems the server's
 * confirm gate reports (golive #340), and Confirm stays off while any remain.
 */
import '@angular/compiler';
import '../public-api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersConfirmReadinessOperation } from '@mj-biz-apps/orders-entities';
import {
    BizAppsOrderHeaderFormComponent,
    ConfirmBlockerList,
} from '../lib/custom/OrderHeader/order-header-form.component';

const here = import.meta.dirname;
const PROBLEM = 'Line 1 is discounted 10%, a concession worth 1000.00 with no approved Price concession recorded for it.';

type FakeRecord = {
    ID: string;
    IsSaved: boolean;
    Status: string;
    IsBookedOrder: boolean;
    InitialPaymentTypeID: string | null;
    ConfirmEligibility: () => { Allowed: boolean; Reason?: string };
};

function record(over: Partial<FakeRecord> = {}): FakeRecord {
    return {
        ID: 'aaaaaaaa-2222-4333-8444-555555555555',
        IsSaved: true,
        Status: 'Draft',
        IsBookedOrder: false,
        InitialPaymentTypeID: null,
        ConfirmEligibility: () => ({ Allowed: true }),
        ...over,
    };
}

function form(rec: FakeRecord | null, problems: string[] = []): BizAppsOrderHeaderFormComponent {
    const instance = Object.create(BizAppsOrderHeaderFormComponent.prototype) as BizAppsOrderHeaderFormComponent;
    Object.assign(instance, {
        record: rec,
        PaymentTypes: [],
        ConcessionProblems: problems,
        ConcessionCheckError: null,
        readinessSeq: 0,
        cdr: { detectChanges: () => undefined },
    });
    return instance;
}

afterEach(() => vi.restoreAllMocks());

describe('ConfirmBlockerList', () => {
    it('lists the browser reason first, then each concession problem', () => {
        expect(ConfirmBlockerList('Need a bill-to party.', [PROBLEM, 'A second.'])).toEqual([
            'Need a bill-to party.',
            PROBLEM,
            'A second.',
        ]);
    });

    it('is empty when nothing blocks', () => {
        expect(ConfirmBlockerList(null, [])).toEqual([]);
    });
});

describe('the confirm banner and button', () => {
    it('shows the banner and holds Confirm on concession problems alone', () => {
        const instance = form(record(), [PROBLEM]);
        expect(instance.ConfirmBlockedReason).toBeNull();
        expect(instance.ConcessionBlockers).toEqual([PROBLEM]);
        expect(instance.ConfirmBlocked).toBe(true);
        expect(instance.ShowConfirm).toBe(false);
    });

    it('offers Confirm once the problems are gone', () => {
        const instance = form(record(), []);
        expect(instance.ConfirmBlocked).toBe(false);
        expect(instance.ShowConfirm).toBe(true);
    });

    it('keeps the browser reason alongside the concession problems', () => {
        const instance = form(record({ ConfirmEligibility: () => ({ Allowed: false, Reason: 'Need a line.' }) }), [PROBLEM]);
        expect(ConfirmBlockerList(instance.ConfirmBlockedReason, instance.ConcessionBlockers)).toEqual(['Need a line.', PROBLEM]);
    });

    it.each(['Confirmed', 'Voided'])('lists no concession problems on a %s order', (status) => {
        const instance = form(record({ Status: status, IsBookedOrder: status === 'Confirmed' }), [PROBLEM]);
        expect(instance.ConcessionBlockers).toEqual([]);
    });

    it('lists each problem in the banner, in the same pill as the other blockers', () => {
        const html = readFileSync(join(here, '../lib/custom/OrderHeader/order-header-form.component.html'), 'utf8');
        expect(html).toContain('@if (ConfirmBlocked) {');
        expect(html).toMatch(/@for \(problem of ConcessionBlockers; track \$index\) \{\s*<span class="mjo-oh-todo__hint">\{\{ problem \}\}<\/span>/);
    });
});

describe('RefreshConfirmReadiness', () => {
    it('asks the server for a saved draft and keeps its answer', async () => {
        const execute = vi
            .spyOn(OrdersConfirmReadinessOperation.prototype, 'Execute')
            .mockResolvedValue({ Success: true, Output: { ConcessionProblems: [PROBLEM] } } as never);
        const instance = form(record());
        await instance.RefreshConfirmReadiness();
        expect(execute).toHaveBeenCalledWith({ OrderHeaderID: 'aaaaaaaa-2222-4333-8444-555555555555' });
        expect(instance.ConcessionProblems).toEqual([PROBLEM]);
        expect(instance.ShowConfirm).toBe(false);
    });

    it('does not ask for an unsaved or booked order, and clears what it had', async () => {
        const execute = vi.spyOn(OrdersConfirmReadinessOperation.prototype, 'Execute');
        for (const rec of [record({ IsSaved: false }), record({ Status: 'Confirmed', IsBookedOrder: true })]) {
            const instance = form(rec, [PROBLEM]);
            await instance.RefreshConfirmReadiness();
            expect(instance.ConcessionProblems).toEqual([]);
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('keeps the latest answer when an earlier call finishes last', async () => {
        let releaseFirst: (v: unknown) => void = () => undefined;
        vi.spyOn(OrdersConfirmReadinessOperation.prototype, 'Execute')
            .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)) as never)
            .mockResolvedValueOnce({ Success: true, Output: { ConcessionProblems: [] } } as never);
        const instance = form(record());
        const first = instance.RefreshConfirmReadiness();
        await instance.RefreshConfirmReadiness();
        releaseFirst({ Success: true, Output: { ConcessionProblems: [PROBLEM] } });
        await first;
        expect(instance.ConcessionProblems).toEqual([]);
    });

    it('says the check failed and leaves Confirm to the server when the call fails', async () => {
        vi.spyOn(OrdersConfirmReadinessOperation.prototype, 'Execute').mockResolvedValue({
            Success: false,
            ErrorMessage: 'network down',
        } as never);
        const instance = form(record());
        await instance.RefreshConfirmReadiness();
        expect(instance.ConcessionProblems).toEqual([]);
        expect(instance.ConcessionCheckError).toMatch(/could not be checked \(network down\)/);
        expect(instance.ShowConfirm).toBe(true);
    });
});
