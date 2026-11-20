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
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
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

describe('the toolbar Confirm button', () => {
    it('gives the concession problems as its disabled reason', () => {
        const instance = form(record(), [PROBLEM, 'A second.']);
        expect(instance.ConfirmDisabledReason(instance.record)).toBe(`${PROBLEM} A second.`);
    });

    it('gives the browser reason before the concession problems', () => {
        const rec = record({ ConfirmEligibility: () => ({ Allowed: false, Reason: 'Need a line.' }) });
        const instance = form(rec, [PROBLEM]);
        expect(instance.ConfirmDisabledReason(instance.record)).toBe('Need a line.');
    });

    it('is on when nothing blocks', () => {
        const instance = form(record(), []);
        expect(instance.ConfirmDisabledReason(instance.record)).toBe(false);
    });
});

describe('record events', () => {
    type Handler = (event: { type: string }) => void;
    type Watched = { watchRecordForReadiness(): void; loadInstalments(): Promise<void> };

    function watched(): { instance: BizAppsOrderHeaderFormComponent; fire: Handler } {
        let handler: Handler = () => undefined;
        const rec = {
            ...record(),
            RegisterEventHandler: (h: Handler) => {
                handler = h;
                return { unsubscribe: () => undefined };
            },
        };
        const instance = form(rec as unknown as FakeRecord);
        (instance as unknown as Watched).watchRecordForReadiness();
        return { instance, fire: (event) => handler(event) };
    }

    it('re-asks readiness and re-reads the schedule after a save', () => {
        const { instance, fire } = watched();
        const readiness = vi.spyOn(instance, 'RefreshConfirmReadiness').mockResolvedValue();
        const instalments = vi.spyOn(instance as unknown as Watched, 'loadInstalments').mockResolvedValue();
        fire({ type: 'save' });
        expect(readiness).toHaveBeenCalledTimes(1);
        expect(instalments).toHaveBeenCalledTimes(1);
    });

    it('re-asks readiness on a reload, leaving the schedule to RefreshRecord', () => {
        const { instance, fire } = watched();
        const readiness = vi.spyOn(instance, 'RefreshConfirmReadiness').mockResolvedValue();
        const instalments = vi.spyOn(instance as unknown as Watched, 'loadInstalments').mockResolvedValue();
        fire({ type: 'load_complete' });
        expect(readiness).toHaveBeenCalledTimes(1);
        expect(instalments).not.toHaveBeenCalled();
    });

    it('ignores other events', () => {
        const { instance, fire } = watched();
        const readiness = vi.spyOn(instance, 'RefreshConfirmReadiness').mockResolvedValue();
        fire({ type: 'delete' });
        expect(readiness).not.toHaveBeenCalled();
    });
});

describe('RefreshRecord', () => {
    it('re-reads the payment schedule after a successful refresh', async () => {
        vi.spyOn(BaseFormComponent.prototype, 'RefreshRecord').mockResolvedValue(true);
        const rows = [{ ID: 'r1' }];
        const instance = form({ ...record(), LoadPaymentSchedule: async () => rows } as unknown as FakeRecord);
        await expect(instance.RefreshRecord()).resolves.toBe(true);
        expect(instance.Instalments).toEqual(rows);
    });

    it('leaves the schedule alone when the refresh fails', async () => {
        vi.spyOn(BaseFormComponent.prototype, 'RefreshRecord').mockResolvedValue(false);
        const load = vi.fn(async () => []);
        const instance = form({ ...record(), LoadPaymentSchedule: load } as unknown as FakeRecord);
        await instance.RefreshRecord();
        expect(load).not.toHaveBeenCalled();
    });
});
