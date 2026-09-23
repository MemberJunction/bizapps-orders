// See the note in price-pick.test.ts: the import graph reaches partially-compiled injectables that
// fall back to JIT, so the compiler is loaded. Nothing here bootstraps Angular.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent, type MJODiscountDraft } from '../order-lines-editor.component';

/**
 * The line discount control — golive #252.
 *
 * The defect was that no control existed at all, so these pin the decisions the new one makes
 * rather than a regression it once had: what a percentage is taken from, what counts as too much,
 * and when a request is complete enough to put on the order. Driven off the prototype with a
 * stand-in `this`, like the price-picker tests, so nothing needs Angular's DI.
 */

interface Stub {
    quantity?: number;
    unitPrice?: number;
    /** A percentage concession already on the line, as the BC conversion leaves one. */
    discountPct?: number;
    /** A discount already stamped by an earlier save. */
    discountAmount?: number;
    booked?: boolean;
    cap?: number | null;
    /** Absent means the user holds no authority at all. */
    authority?: boolean;
    draft?: Partial<MJODiscountDraft>;
}

function line(stub: Stub): mjBizAppsOrdersOrderLineEntity {
    return {
        ID: 'L1',
        Quantity: stub.quantity ?? 1,
        UnitPrice: stub.unitPrice ?? 0,
        DiscountPct: stub.discountPct ?? 0,
        DiscountAmount: stub.discountAmount ?? 0,
        JournalEntryID: stub.booked ? 'JE1' : null,
    } as unknown as mjBizAppsOrdersOrderLineEntity;
}

function component(stub: Stub): MJOOrderLinesEditorComponent {
    const instance = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    const drafts = new Map<string, MJODiscountDraft>();
    if (stub.draft) drafts.set('L1', { Mode: 'percent', Value: null, Reason: '', ...stub.draft });
    Object.assign(instance as object, {
        EditMode: true,
        DiscountAuthorityLoaded: true,
        DiscountAuthority: stub.authority === false ? null : { ID: 'SA1', MaxDiscountPct: stub.cap ?? null },
        discountDrafts: drafts,
        stagedDiscounts: new Map(),
        // The line is priced at its stated unit price; the base comes off the entity either way.
        DisplayUnit: () => stub.unitPrice ?? 0,
        PricedLine: () => undefined,
    });
    return instance;
}

describe('DiscountBase', () => {
    it('is the line gross when the line carries nothing yet', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200 };
        expect(component(stub).DiscountBase(line(stub))).toBe(1200);
    });

    it('multiplies by quantity — a discount is off the line, not off one unit', () => {
        const stub: Stub = { quantity: 3, unitPrice: 400 };
        expect(component(stub).DiscountBase(line(stub))).toBe(1200);
    });

    it('is what is LEFT once an earlier concession is on the line', () => {
        // The engine judges a second discount against the remainder, so the screen has to as well
        // or it would offer a concession the save then refuses.
        const stub: Stub = { quantity: 1, unitPrice: 1200, discountAmount: 200 };
        expect(component(stub).DiscountBase(line(stub))).toBe(1000);
    });

    it('takes a percentage concession off first, in the order the line itself applies them', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200, discountPct: 0.1 };
        expect(component(stub).DiscountBase(line(stub))).toBe(1080);
    });

    it('never goes below zero, whatever the line already carries', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200, discountAmount: 5000 };
        expect(component(stub).DiscountBase(line(stub))).toBe(0);
    });
});

describe('DraftDiscountAmount', () => {
    it('is null until something usable is typed', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200 };
        expect(component(stub).DraftDiscountAmount(line(stub))).toBeNull();
    });

    it('reads a percentage against the base', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200, draft: { Mode: 'percent', Value: 20 } };
        expect(component(stub).DraftDiscountAmount(line(stub))).toBe(240);
    });

    it('reads an amount as money', () => {
        const stub: Stub = { quantity: 1, unitPrice: 1200, draft: { Mode: 'amount', Value: 240 } };
        expect(component(stub).DraftDiscountAmount(line(stub))).toBe(240);
    });
});

describe('DiscountError', () => {
    const typed = (extra: Stub): Stub => ({ quantity: 1, unitPrice: 1200, ...extra });

    it('says nothing while nothing has been typed', () => {
        const stub = typed({});
        expect(component(stub).DiscountError(line(stub))).toBeNull();
    });

    it('refuses more than the line has left', () => {
        const stub = typed({ draft: { Mode: 'amount', Value: 1500 } });
        expect(component(stub).DiscountError(line(stub))).toMatch(/more than/i);
    });

    it('refuses a concession above the cap on the user authority', () => {
        const stub = typed({ cap: 0.1, draft: { Mode: 'percent', Value: 20 } });
        expect(component(stub).DiscountError(line(stub))).toMatch(/above the 10%/i);
    });

    it('allows one at the cap — the cap is a ceiling, not a limit to stay under', () => {
        const stub = typed({ cap: 0.1, draft: { Mode: 'percent', Value: 10 } });
        expect(component(stub).DiscountError(line(stub))).toBeNull();
    });

    it('allows any size when the authority sets no cap', () => {
        const stub = typed({ cap: null, draft: { Mode: 'percent', Value: 90 } });
        expect(component(stub).DiscountError(line(stub))).toBeNull();
    });

    it('does not report a missing reason as an error — it is stated as what is still needed', () => {
        // The reason blocks STAGING and disables Done; calling it an error would paint the field red
        // the moment an amount is typed, before the user has had a chance to write one.
        const stub = typed({ draft: { Mode: 'amount', Value: 100 } });
        expect(component(stub).DiscountError(line(stub))).toBeNull();
        expect(component(stub).NeedsDiscountReason(line(stub))).toBe(true);
    });
});

describe('who may discount', () => {
    it('offers nothing to a user with no sales authority — absence is not permission', () => {
        const stub: Stub = { authority: false };
        const instance = component(stub);
        expect(instance.CanDiscount).toBe(false);
        expect(instance.DiscountUnavailableReason).toMatch(/Sales Authority/i);
    });

    it('shows a booked line read-only, because its money is frozen', () => {
        const stub: Stub = { booked: true, quantity: 1, unitPrice: 1200 };
        const instance = component(stub);
        expect(instance.CanDiscount).toBe(true);
        expect(instance.CanDiscountLine(line(stub))).toBe(false);
    });

    it('says nothing is wrong when the control is available', () => {
        expect(component({}).DiscountUnavailableReason).toBeNull();
    });
});
