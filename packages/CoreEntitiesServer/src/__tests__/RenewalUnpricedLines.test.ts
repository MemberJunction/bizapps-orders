/**
 * A renewal line the renewal pass priced at zero is not held by the $0-line refusal (orders#954).
 *
 * The renewal order keeps Origin `Direct`, so the shared rule reads it as hand-entered. Without the
 * server's exemption, a complimentary renewal, or one whose product is now priced at zero, fails its
 * confirm, and the renewal job rolls back and fails the same way on every later run. Once someone
 * changes the price, the line is judged like any typed line.
 *
 * `Object.create` matches the sibling order tests: it holds the server entity without metadata, with
 * the generated accessors shadowed by plain properties.
 */
import { describe, expect, it } from 'vitest';
import { OrderEntityServer } from '../OrderEntityServer.js';

interface FakeLine {
    IsSaved: boolean;
    ID: string | null;
    LineNumber: number;
    ProductID: string;
    Product: string | null;
    UnitPrice: number | null;
    ParentOrderLineID: string | null;
    ReversesOrderLineID: string | null;
    RenewsSubscriptionID: string | null;
}

function line(over: Partial<FakeLine> = {}): FakeLine {
    return {
        IsSaved: false,
        ID: null,
        LineNumber: 1,
        ProductID: 'R0000000-0000-4000-8000-000000000001',
        Product: 'Annual Membership',
        UnitPrice: 0,
        ParentOrderLineID: null,
        ReversesOrderLineID: null,
        RenewsSubscriptionID: 'S0000000-0000-4000-8000-000000000001',
        ...over,
    };
}

function order(lines: FakeLine[]): OrderEntityServer & { MarkRenewalPriced(line: unknown): void } {
    const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer & { MarkRenewalPriced(line: unknown): void };
    for (const [k, v] of Object.entries({
        Origin: 'Direct',
        Lines: { Items: lines, Count: lines.length, IsLoaded: true },
        _renewalPricedLines: new Map(),
    })) {
        Object.defineProperty(o, k, { value: v, writable: true });
    }
    return o;
}

describe('the $0-line refusal on a renewal order', () => {
    it('leaves out a line the renewal pass priced at zero', () => {
        const renewal = line();
        const o = order([renewal]);
        o.MarkRenewalPriced(renewal);
        expect(o.UnpricedLines()).toEqual([]);
        expect(o.UnpricedLinesRefusal()).toBeNull();
    });

    it('still leaves it out once saved, matched by ID on a reloaded line object', () => {
        const renewal = line({ IsSaved: true, ID: 'L0000000-0000-4000-8000-000000000001' });
        const o = order([line({ IsSaved: true, ID: 'l0000000-0000-4000-8000-000000000001' })]);
        o.MarkRenewalPriced(renewal);
        expect(o.UnpricedLines()).toEqual([]);
    });

    it('refuses the line once its price is changed to zero by hand', () => {
        const renewal = line({ UnitPrice: 120 });
        const o = order([renewal]);
        o.MarkRenewalPriced(renewal);
        renewal.UnitPrice = 0;
        expect(o.UnpricedLinesRefusal()).toMatch(/^Line 1 \(Annual Membership\) has a price of 0\./);
    });

    it('refuses a renewal line typed at zero, which the pass did not price', () => {
        expect(order([line()]).UnpricedLines()).toHaveLength(1);
    });
});
