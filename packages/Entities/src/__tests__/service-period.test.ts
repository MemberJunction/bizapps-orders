/**
 * Service period on deferred lines (bc-aidp-next-golive#273).
 *
 * A recognition type with `RequiresServicePeriod` earns against a window. Event lines get it from
 * the event and subscription lines from the term; anything else has to be told. Confirming without
 * it must be refused up front, and a refused confirm must not leave the order reading "Confirmed".
 *
 * `OrderHeaderEntity` cannot be constructed cheaply (see order-header-default-date.test.ts), so the
 * methods under test are called on a stand-in that carries only the members they read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '../pricing/OrdersEngine.js';
import { ValidationResult } from '@memberjunction/core';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';
import { OrderLineEntity } from '../OrderLineEntity.js';

type Row = Record<string, unknown>;

function seed(data: { products?: Row[]; types?: Row[]; revRec?: Row[]; events?: Row[] }): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = data.products ?? [];
    engine._productTypes = data.types ?? [];
    engine._revenueRecognitionTypes = data.revRec ?? [];
    engine._eventProducts = data.events ?? [];
}

const CATALOG = {
    revRec: [
        { ID: 'rr-upfront', Code: 'UpFront', RequiresServicePeriod: false },
        { ID: 'rr-backend', Code: 'AllBackEnd', RequiresServicePeriod: true },
    ],
    types: [
        { ID: 't-service', Code: 'Service', ProductExtensionEntity: null },
        { ID: 't-event', Code: 'Event', ProductExtensionEntity: 'MJ_BizApps_Orders: Event Products' },
        { ID: 't-gift', Code: 'GiftCard', ProductExtensionEntity: null },
    ],
    products: [
        { ID: 'p-deliverable', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-backend' },
        { ID: 'p-upfront', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-upfront' },
        { ID: 'p-event', ProductTypeID: 't-event', RevenueRecognitionTypeID: 'rr-backend' },
        { ID: 'p-event-unloaded', ProductTypeID: 't-event', RevenueRecognitionTypeID: 'rr-backend' },
        { ID: 'p-sub', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-backend', SubscriptionTypeID: 'st-1' },
        { ID: 'p-gift', ProductTypeID: 't-gift', RevenueRecognitionTypeID: 'rr-backend' },
    ],
    events: [{ ID: 'p-event', EventStartsAt: '2026-10-14T13:00:00Z', EventEndsAt: '2026-10-16T21:00:00Z' }],
};

beforeEach(() => seed(CATALOG));
afterEach(() => {
    seed({});
    vi.restoreAllMocks();
});

describe('OrdersEngine.ServicePeriodSource', () => {
    it('names who supplies the window for each kind of product', () => {
        const e = OrdersEngine.Instance;
        expect(e.ServicePeriodSource('p-deliverable')).toBe('Line');
        expect(e.ServicePeriodSource('p-event')).toBe('Event');
        expect(e.ServicePeriodSource('p-sub')).toBe('Subscription');
        expect(e.ServicePeriodSource('p-upfront')).toBe('NotRequired');
        expect(e.ServicePeriodSource('p-gift')).toBe('NotRequired');
    });

    it('asks for the window on an event-type product that has no event record', () => {
        // Nothing can stamp it: the save reads the Event Products row, not the product type.
        expect(OrdersEngine.Instance.ServicePeriodSource('p-event-unloaded')).toBe('Line');
    });

    it('does not ask for a window when the catalog does not know the product', () => {
        expect(OrdersEngine.Instance.ServicePeriodSource('p-missing')).toBe('NotRequired');
        seed({});
        expect(OrdersEngine.Instance.ServicePeriodSource('p-deliverable')).toBe('NotRequired');
    });
});

interface LineStub {
    LineNumber: number;
    ProductID: string;
    ServicePeriodStart: Date | null;
    ServicePeriodEnd: Date | null;
}

function line(n: number, productID: string, start: Date | null = null, end: Date | null = null): LineStub {
    return { LineNumber: n, ProductID: productID, ServicePeriodStart: start, ServicePeriodEnd: end };
}

/** Just enough of an order for `ConfirmEligibility`, `LinesMissingServicePeriod` and `SaveStatus`. */
function order(lines: LineStub[], extra: Row = {}): OrderHeaderEntity {
    const stub = {
        IsSaved: true,
        Status: 'Draft',
        BillToPersonID: 'person-1',
        BillToOrganizationID: null,
        Lines: { Items: lines, Count: lines.length, IsLoaded: true },
        GetFieldByName: () => ({ OldValue: 'Draft' }),
        LatestResult: null as { CompleteMessage: string } | null,
        ...extra,
    };
    Object.setPrototypeOf(stub, OrderHeaderEntity.prototype);
    return stub as unknown as OrderHeaderEntity;
}

describe('LinesMissingServicePeriod', () => {
    it('counts only lines nothing will date', () => {
        const o = order([line(1, 'p-deliverable'), line(2, 'p-event'), line(3, 'p-sub'), line(4, 'p-upfront')]);
        expect(o.LinesMissingServicePeriod().map((l) => l.LineNumber)).toEqual([1]);
    });

    it('a line needs both ends', () => {
        const start = new Date(Date.UTC(2026, 9, 1));
        const end = new Date(Date.UTC(2026, 11, 31));
        const o = order([line(1, 'p-deliverable', start), line(2, 'p-deliverable', start, end)]);
        expect(o.LinesMissingServicePeriod().map((l) => l.LineNumber)).toEqual([1]);
    });
});

describe('ConfirmEligibility', () => {
    it('refuses, naming the line, when a deferred line has no service period', () => {
        const verdict = order([line(1, 'p-upfront'), line(2, 'p-deliverable')]).ConfirmEligibility();
        expect(verdict.Allowed).toBe(false);
        expect(verdict.Reason).toContain('Line 2');
        expect(verdict.Reason).toContain('service period');
    });

    it('allows once the dates are set', () => {
        const start = new Date(Date.UTC(2026, 9, 1));
        const end = new Date(Date.UTC(2026, 11, 31));
        expect(order([line(1, 'p-deliverable', start, end)]).ConfirmEligibility().Allowed).toBe(true);
    });

    it('does not ask for dates the save will stamp', () => {
        expect(order([line(1, 'p-event'), line(2, 'p-sub')]).ConfirmEligibility().Allowed).toBe(true);
    });
});

describe('SaveStatus', () => {
    it('puts the previous status back when the save is refused, and throws the reason', async () => {
        const o = order([], {
            Save: vi.fn(async function (this: { LatestResult: unknown }) {
                this.LatestResult = { CompleteMessage: 'AllBackEnd needs a service period' };
                return false;
            }),
        });
        await expect(o.Confirm()).rejects.toThrow('AllBackEnd needs a service period');
        expect(o.Status).toBe('Draft');
    });

    it('keeps the new status when the save succeeds', async () => {
        const o = order([], { Save: vi.fn(async () => true) });
        await o.SaveStatus('Voided', 'could not void');
        expect(o.Status).toBe('Voided');
    });
});

describe('OrderLineEntity refuses a service period that ends before it starts', () => {
    function check(start: Date | null, end: Date | null): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        const stub = { ServicePeriodStart: start, ServicePeriodEnd: end };
        (OrderLineEntity.prototype as unknown as { refuseBackwardsServicePeriod(r: ValidationResult): void })
            .refuseBackwardsServicePeriod.call(stub, result);
        return result;
    }

    it('names the end date with a plain message', () => {
        const result = check(new Date(Date.UTC(2026, 11, 31)), new Date(Date.UTC(2026, 9, 1)));
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('ServicePeriodEnd');
        expect(result.Errors[0].Message).toContain('on or after the start date');
    });

    it('accepts a one-day window and a half-filled one', () => {
        const day = new Date(Date.UTC(2026, 9, 1));
        expect(check(day, day).Success).toBe(true);
        expect(check(day, null).Success).toBe(true);
    });
});
