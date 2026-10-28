/**
 * How the order's save hands itself to order review (bc-aidp-next-golive#320 §5): which saves ask, and
 * what the review is told changed. The review's own decisions are `OrderReview.test.ts`'s subject.
 *
 * `Object.create` matches the sibling order tests: it holds the server entity without standing up
 * metadata, with the generated accessors shadowed by plain properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../OrderReview.js', () => ({
    CheckOrderReviewOnChange: vi.fn(async () => null),
    CheckNoDealConfirm: vi.fn(async () => null),
    CheckOrderReviewAtConfirm: vi.fn(async () => null),
}));

import { OrderEntityServer } from '../OrderEntityServer.js';
import { CheckNoDealConfirm, CheckOrderReviewAtConfirm, CheckOrderReviewOnChange } from '../OrderReview.js';
import { OriginWriteRefusal, SetSystemOrderOrigin } from '../SystemOrderOrigin.js';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';

type ReviewHooks = {
    passesOrderReviewOnChange(): Promise<boolean>;
    passesOrderReviewGate(): Promise<boolean>;
    passesOriginGuard(): boolean;
    MarkRenewalPriced(line: unknown): void;
};

interface FakeLine {
    IsSaved: boolean;
    ID: string | null;
    LineNumber: number;
    ParentOrderLineID: string | null;
    ReversesOrderLineID: string | null;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ProductPriceID: string | null;
    DiscountPct: number;
    RenewsSubscriptionID: string | null;
    IsRollupParent: boolean;
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
    GetFieldByName(name: string): { Dirty: boolean } | undefined;
}

function line(over: Partial<FakeLine> & { dirty?: string[] } = {}): FakeLine {
    const { dirty = [], ...rest } = over;
    return {
        IsSaved: true,
        ID: 'L0000000-0000-4000-8000-000000000001',
        LineNumber: 1,
        ParentOrderLineID: null,
        ReversesOrderLineID: null,
        ProductID: 'R0000000-0000-4000-8000-000000000001',
        Quantity: 1,
        UnitPrice: 100,
        ProductPriceID: null,
        DiscountPct: 0,
        RenewsSubscriptionID: null,
        IsRollupParent: false,
        ServicePeriodStart: '2027-01-01',
        ServicePeriodEnd: '2027-12-31',
        GetFieldByName: (name: string) => ({ Dirty: dirty.includes(name) }),
        ...rest,
    };
}

function order(opts: {
    saved?: boolean;
    savedStatus?: string;
    headerDirty?: string[];
    lines?: FakeLine[];
    removed?: FakeLine[];
    user?: { ID: string } | null;
    origin?: string;
    storedOrigin?: string | null;
}): OrderEntityServer & ReviewHooks {
    const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer & ReviewHooks;
    const failures: Error[] = [];
    for (const [k, v] of Object.entries({
        IsSaved: opts.saved ?? true,
        ID: 'B0000000-0000-4000-8000-000000000001',
        OrderNumber: 'ORD-1',
        Status: opts.savedStatus ?? 'Draft',
        Origin: opts.origin ?? 'Direct',
        ReversesOrderHeaderID: null,
        ContextCurrentUser: opts.user === undefined ? { ID: 'user-1' } : opts.user,
        ProviderToUse: {},
        Lines: { Items: opts.lines ?? [line()], Removed: opts.removed ?? [] },
        _renewalPricedLines: new Map(),
        failures,
    })) {
        Object.defineProperty(o, k, { value: v, writable: true });
    }
    Object.defineProperty(o, 'GetFieldByName', {
        value: (name: string) =>
            name === 'Status'
                ? { Dirty: false, OldValue: opts.savedStatus ?? 'Draft' }
                : name === 'Origin'
                  ? { Dirty: (opts.origin ?? 'Direct') !== (opts.storedOrigin ?? 'Direct'), OldValue: opts.storedOrigin === undefined ? 'Direct' : opts.storedOrigin }
                  : { Dirty: (opts.headerDirty ?? []).includes(name) },
    });
    Object.defineProperty(o, 'pendingLineNet', { value: () => 0 });
    Object.defineProperty(o, 'RegisterResultHistoryEntry', { value: (entry: Error) => failures.push(entry) });
    Object.defineProperty(o, 'buildFailureResult', { value: (err: Error) => err });
    return o;
}

afterEach(() => vi.clearAllMocks());

describe('the change hook', () => {
    it('tells the review which header fields and line fields changed, and lines added or removed', async () => {
        const o = order({
            headerDirty: ['BillToOrganizationID', 'Notes'],
            lines: [line({ dirty: ['UnitPrice', 'Description'] }), line({ IsSaved: false, ID: null, LineNumber: 2 }), line({ IsSaved: false, ID: null, ParentOrderLineID: 'x' })],
            removed: [line({ LineNumber: 3 })],
        });
        expect(await o.passesOrderReviewOnChange()).toBe(true);
        const [input, change] = vi.mocked(CheckOrderReviewOnChange).mock.calls[0];
        expect(change).toEqual({
            HeaderFieldsChanged: ['BillToOrganizationID'],
            LinesChanged: [{ LineNumber: 1, Fields: ['UnitPrice'], RenewsSubscriptionID: null }],
            LinesAdded: 1,
            LinesRemoved: 1,
        });
        expect(input).toMatchObject({ OrderHeaderID: 'B0000000-0000-4000-8000-000000000001', OrderNumber: 'ORD-1', Origin: 'Direct' });
        expect(input.Lines[0]).toMatchObject({ ServicePeriodStart: '2027-01-01', ServicePeriodEnd: '2027-12-31', RenewalPriceEdited: false });
    });

    it('does not ask when nothing reviewed changed', async () => {
        expect(await order({ headerDirty: ['Notes'] }).passesOrderReviewOnChange()).toBe(true);
        expect(CheckOrderReviewOnChange).not.toHaveBeenCalled();
    });

    it('does not ask for a new order, a confirmed one, or a save with no user', async () => {
        const changed = { headerDirty: ['CompanyID'] };
        await order({ ...changed, saved: false }).passesOrderReviewOnChange();
        await order({ ...changed, savedStatus: 'Confirmed' }).passesOrderReviewOnChange();
        await order({ ...changed, user: null }).passesOrderReviewOnChange();
        expect(CheckOrderReviewOnChange).not.toHaveBeenCalled();
    });

    it('does not count a renewal line still at the price the renewal pass wrote as an edit', async () => {
        const renewal = line({ RenewsSubscriptionID: 'sub-1', dirty: ['UnitPrice'] });
        const o = order({ lines: [renewal] });
        o.MarkRenewalPriced(renewal);
        expect(await o.passesOrderReviewOnChange()).toBe(true);
        expect(CheckOrderReviewOnChange).not.toHaveBeenCalled();
    });

    it('refuses the save with the review\'s reason', async () => {
        vi.mocked(CheckOrderReviewOnChange).mockResolvedValueOnce('Order ORD-1 was not saved: no reviewer.');
        const o = order({ headerDirty: ['CompanyID'] });
        expect(await o.passesOrderReviewOnChange()).toBe(false);
        expect((o as unknown as { failures: Error[] }).failures[0].message).toBe('Order ORD-1 was not saved: no reviewer.');
    });
});

describe('the confirm gate', () => {
    it('lets the confirm through when the review has nothing to say', async () => {
        expect(await order({}).passesOrderReviewGate()).toBe(true);
        expect(CheckOrderReviewAtConfirm).toHaveBeenCalledTimes(1);
    });

    it('refuses with the review\'s reason', async () => {
        vi.mocked(CheckOrderReviewAtConfirm).mockResolvedValueOnce('Order ORD-1 needs a review before it can be confirmed.');
        const o = order({});
        expect(await o.passesOrderReviewGate()).toBe(false);
        expect((o as unknown as { failures: Error[] }).failures[0].message).toMatch(/needs a review/);
    });

    it('marks a renewal line whose carried-forward price was changed in this object', async () => {
        const renewal = line({ RenewsSubscriptionID: 'sub-1' });
        const o = order({ lines: [renewal] });
        o.MarkRenewalPriced(renewal);
        renewal.UnitPrice = 80;
        await o.passesOrderReviewGate();
        expect(vi.mocked(CheckOrderReviewAtConfirm).mock.calls[0][0].Lines[0].RenewalPriceEdited).toBe(true);
    });

    it('is not consulted on a save with no user', async () => {
        expect(await order({ user: null }).passesOrderReviewGate()).toBe(true);
        expect(CheckOrderReviewAtConfirm).not.toHaveBeenCalled();
    });
});

/** The order's own Save, with everything around the review stubbed, so these tests fail if the hooks are unwired. */
function savable(o: OrderEntityServer & ReviewHooks, booking: boolean): { partyDefaults: ReturnType<typeof vi.fn> } {
    const partyDefaults = vi.fn().mockResolvedValue(undefined);
    Object.assign(o, {
        passesStatusTransition: () => true,
        ApplySavePartyDefaults: partyDefaults,
        willBookOnThisSave: () => booking,
        passesConcessionGate: vi.fn().mockResolvedValue(true),
    });
    return { partyDefaults };
}
const failuresOf = (o: unknown) => (o as { failures: Error[] }).failures.map((f) => f.message);

describe('Save (PR #912 review: the hooks are driven through Save, not only called directly)', () => {
    it('refuses the save on the change hook\'s refusal, before filling anything in', async () => {
        vi.mocked(CheckOrderReviewOnChange).mockResolvedValueOnce('Order ORD-1 was not saved: no reviewer.');
        const o = order({ headerDirty: ['CompanyID'] });
        const { partyDefaults } = savable(o, false);
        expect(await o.Save()).toBe(false);
        expect(CheckOrderReviewOnChange).toHaveBeenCalledTimes(1);
        expect(partyDefaults).not.toHaveBeenCalled();
        expect(failuresOf(o)).toEqual(['Order ORD-1 was not saved: no reviewer.']);
    });

    it('refuses a booking save on the confirm gate\'s refusal', async () => {
        vi.mocked(CheckOrderReviewAtConfirm).mockResolvedValueOnce('Order ORD-1 cannot be confirmed until its review is approved.');
        const o = order({ savedStatus: 'Draft' });
        savable(o, true);
        expect(await o.Save()).toBe(false);
        expect(CheckOrderReviewAtConfirm).toHaveBeenCalledTimes(1);
        expect(failuresOf(o)).toEqual(['Order ORD-1 cannot be confirmed until its review is approved.']);
    });

    it('refuses a booking save on the no-deal gate\'s refusal, before the review is asked (golive #390)', async () => {
        vi.mocked(CheckNoDealConfirm).mockResolvedValueOnce('Order ORD-1 was not confirmed. Only Finance can confirm an order that has no deal.');
        const o = order({ savedStatus: 'Draft' });
        savable(o, true);
        expect(await o.Save()).toBe(false);
        expect(CheckOrderReviewAtConfirm).not.toHaveBeenCalled();
        expect(failuresOf(o)).toEqual(['Order ORD-1 was not confirmed. Only Finance can confirm an order that has no deal.']);
    });

    it('refuses a save that writes Origin itself, before order review is asked anything (required 2)', async () => {
        const o = order({ origin: 'Widget', storedOrigin: 'Direct', headerDirty: ['CompanyID'] });
        savable(o, true);
        expect(await o.Save()).toBe(false);
        expect(failuresOf(o)[0]).toMatch(/Origin cannot be changed from 'Direct' to 'Widget'/);
        expect(CheckOrderReviewOnChange).not.toHaveBeenCalled();
        expect(CheckOrderReviewAtConfirm).not.toHaveBeenCalled();
    });

    it('refuses a new order created claiming a system Origin', async () => {
        const o = order({ saved: false, origin: 'ProviderPayment' });
        savable(o, true);
        expect(await o.Save()).toBe(false);
        expect(failuresOf(o)[0]).toMatch(/cannot be created with Origin 'ProviderPayment'/);
    });

    it('lets a system process set the Origin it writes', () => {
        const o = order({ saved: false });
        SetSystemOrderOrigin(o as unknown as OrderHeaderEntity, 'Widget');
        expect(o.Origin).toBe('Widget');
        expect(o.passesOriginGuard()).toBe(true);
        expect(order({ saved: false, origin: 'Widget' }).passesOriginGuard()).toBe(false);
    });
});

describe('OriginWriteRefusal', () => {
    const facts = { IsSaved: true, Origin: 'Direct', StoredOrigin: 'Direct', MarkedBySystem: false };

    it('lets a new order be Direct or unset, and an Origin that does not change', () => {
        expect(OriginWriteRefusal({ ...facts, IsSaved: false, StoredOrigin: null })).toBeNull();
        expect(OriginWriteRefusal({ ...facts, IsSaved: false, Origin: null, StoredOrigin: null })).toBeNull();
        expect(OriginWriteRefusal(facts)).toBeNull();
        expect(OriginWriteRefusal({ ...facts, Origin: 'Widget', StoredOrigin: 'Widget' })).toBeNull();
    });

    it('refuses any other write unless a system process made it', () => {
        expect(OriginWriteRefusal({ ...facts, IsSaved: false, Origin: 'x', StoredOrigin: null })).toMatch(/cannot be created with Origin 'x'/);
        expect(OriginWriteRefusal({ ...facts, Origin: 'Widget' })).toMatch(/cannot be changed/);
        expect(OriginWriteRefusal({ ...facts, Origin: 'Direct', StoredOrigin: 'Widget' })).toMatch(/cannot be changed/);
        expect(OriginWriteRefusal({ ...facts, Origin: 'Widget', MarkedBySystem: true })).toBeNull();
    });
});
