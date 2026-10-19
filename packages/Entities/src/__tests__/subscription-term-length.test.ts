/**
 * Term ends and stated lengths, shared by confirm and the order screen (bc-aidp-next-golive#338).
 *
 * The order screen says before confirm what confirm will do with a subscription line's stated end:
 * the end the type would compute, the end an extension keeps, and whether the length goes to finance
 * review. These pin that arithmetic; the server's `SubscriptionBehavior` tests pin that confirm uses it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrdersEngine } from '../pricing/OrdersEngine.js';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';
import {
    DefaultTermEnd,
    DefaultTermStart,
    DescribeStatedTermLength,
    KeptStatedEnd,
    StatedTermLengthOf,
    TypeTermMonths,
    type TermLengthRules,
} from '../subscription-term-length.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

const annual: TermLengthRules = { StartMode: 'Immediate', DefaultTermMonths: 12, BillingCadence: 'Annual' };
const anchored: TermLengthRules = {
    StartMode: 'CalendarAnchored',
    AnchorMonth: 1,
    AnchorDay: 1,
    PartialPeriodMode: 'Prorate',
    DefaultTermMonths: 12,
    BillingCadence: 'Annual',
};

describe('DefaultTermStart / DefaultTermEnd', () => {
    it('runs one term from the start', () => {
        expect(day(DefaultTermEnd(annual, d('2026-11-01'), false))).toBe('2027-10-31');
    });

    it('ends a calendar-anchored first term the day before the next anchor, and a continuing one a term later', () => {
        expect(day(DefaultTermEnd(anchored, d('2026-07-15'), false))).toBe('2026-12-31');
        expect(day(DefaultTermEnd(anchored, d('2027-01-01'), true))).toBe('2027-12-31');
    });

    it('takes the term length from the billing cadence when the type states none', () => {
        expect(TypeTermMonths({ StartMode: 'Immediate', BillingCadence: 'Quarterly' })).toBe(3);
    });

    it('moves a deferred start by its days', () => {
        expect(day(DefaultTermStart({ ...annual, StartMode: 'Deferred', DeferredStartDays: 14 }, d('2026-11-01')))).toBe('2026-11-15');
    });
});

describe('KeptStatedEnd', () => {
    it('keeps whole months whole from the new start', () => {
        expect(day(KeptStatedEnd(d('2026-11-01'), d('2027-04-30'), d('2027-03-01')))).toBe('2027-08-31');
    });

    it('keeps the day count of a period that is not whole months', () => {
        expect(day(KeptStatedEnd(d('2026-11-01'), d('2026-11-20'), d('2026-12-05')))).toBe('2026-12-24');
    });

    it('gives the stated end when the start did not move, and nothing for an end before the start', () => {
        expect(day(KeptStatedEnd(d('2026-11-01'), d('2027-11-30'), d('2026-11-01')))).toBe('2027-11-30');
        expect(KeptStatedEnd(d('2026-11-01'), d('2026-10-01'), d('2027-01-01'))).toBeNull();
    });
});

describe('StatedTermLengthOf', () => {
    it('reports a 13-month line on a 12-month type', () => {
        const length = StatedTermLengthOf(annual, d('2026-11-01'), d('2027-11-30'), d('2026-10-20'));
        expect(length).toMatchObject({ Months: 13, TypeMonths: 12 });
    });

    it('measures from the order date when the line states no start', () => {
        expect(StatedTermLengthOf(annual, null, d('2027-04-30'), d('2026-11-01'))?.Months).toBe(6);
    });

    it('reports nothing for a stated end a term long, the computed end, an end before the start, or no end', () => {
        expect(StatedTermLengthOf(annual, d('2026-11-01'), d('2027-10-31'), d('2026-11-01'))).toBeNull();
        expect(StatedTermLengthOf(anchored, d('2026-07-15'), d('2026-12-31'), d('2026-07-15'))).toBeNull();
        expect(StatedTermLengthOf(annual, d('2026-11-01'), d('2026-10-01'), d('2026-11-01'))).toBeNull();
        expect(StatedTermLengthOf(annual, d('2026-11-01'), null, d('2026-11-01'))).toBeNull();
    });
});

describe('DescribeStatedTermLength', () => {
    it('names the line, its length, the type term and the review', () => {
        expect(DescribeStatedTermLength({ LineNumber: 1, Product: 'Annual Membership' }, { Months: 13, TypeMonths: 12 })).toBe(
            "Line 1 (Annual Membership) covers 13 months; its subscription type's term is 12 months. Confirm keeps the stated length.",
        );
    });
});

describe('OrderHeaderEntity.StatedTermLengthNotes', () => {
    type Row = Record<string, unknown>;

    function seed(products: Row[], subscriptionTypes: Row[]): void {
        const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
        engine._products = products;
        engine._productTypes = [{ ID: 'pt-membership', DefaultSubscriptionTypeID: 'st-annual' }];
        engine._subscriptionTypes = subscriptionTypes;
    }

    beforeEach(() =>
        seed(
            [
                { ID: 'p-member', Name: 'Annual Membership', SubscriptionTypeID: 'st-annual' },
                { ID: 'p-inherits', Name: 'Chapter Membership', ProductTypeID: 'pt-membership', SubscriptionTypeID: null },
                { ID: 'p-book', Name: 'Field Guide', SubscriptionTypeID: null },
            ],
            [{ ID: 'st-annual', ...annual }],
        ),
    );
    afterEach(() => seed([], []));

    function order(lines: Row[], status = 'Draft'): OrderHeaderEntity {
        const stub = { Status: status, OrderDate: d('2026-10-20'), Lines: { Items: lines } };
        Object.setPrototypeOf(stub, OrderHeaderEntity.prototype);
        return stub as unknown as OrderHeaderEntity;
    }

    const line = (n: number, productID: string, start: string | null, end: string | null): Row => ({
        LineNumber: n,
        ProductID: productID,
        Product: null,
        ReversesOrderLineID: null,
        ServicePeriodStart: start ? d(start) : null,
        ServicePeriodEnd: end ? d(end) : null,
    });

    it('notes each subscription line whose stated length is not its type term, including a type taken from the product type', () => {
        const o = order([
            line(1, 'p-member', '2026-11-01', '2027-11-30'),
            line(2, 'p-member', '2026-11-01', '2027-10-31'),
            line(3, 'p-book', '2026-11-01', '2027-11-30'),
            line(4, 'p-inherits', '2026-11-01', '2027-04-30'),
        ]);
        expect(o.StatedTermLengthNotes()).toEqual([
            "Line 1 (Annual Membership) covers 13 months; its subscription type's term is 12 months. Confirm keeps the stated length.",
            "Line 4 (Chapter Membership) covers 6 months; its subscription type's term is 12 months. Confirm keeps the stated length.",
        ]);
    });

    it('says nothing once the order is booked', () => {
        expect(order([line(1, 'p-member', '2026-11-01', '2027-11-30')], 'Confirmed').StatedTermLengthNotes()).toEqual([]);
    });
});
