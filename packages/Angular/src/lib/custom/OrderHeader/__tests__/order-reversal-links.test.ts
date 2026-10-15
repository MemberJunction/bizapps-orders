import { describe, expect, it } from 'vitest';
import { OrderReversalLinks, OrderReversalLinksKey } from '../order-reversal-links';

/**
 * MemberJunction/bizapps-orders#740: a reversal saved the order it reverses and showed nothing, and
 * the original listed nothing that reversed it. These pin which chips an order header offers.
 */
const ORDER = 'MJ_BizApps_Orders: Order Headers';
const keysOf = (links: { Key: string }[]) => links.map((l) => l.Key);

describe('OrderReversalLinks', () => {
    it('offers nothing for an order that reverses nothing and was never reversed', () => {
        expect(OrderReversalLinks({})).toEqual([]);
        expect(OrderReversalLinks({ ReversesOrderHeaderID: null, ReversedByOrderIDs: [] })).toEqual([]);
    });

    it('offers a Reverses chip on a reversal, pointing at the original', () => {
        const [link] = OrderReversalLinks({ ReversesOrderHeaderID: 'order-1' });
        expect(link).toMatchObject({ Key: 'reverses', EntityName: ORDER, RecordID: 'order-1', Label: 'Reverses' });
    });

    it('offers one Reversed by chip per reversal on the original, in order', () => {
        const links = OrderReversalLinks({ ReversedByOrderIDs: ['rev-1', 'rev-2'] });
        expect(keysOf(links)).toEqual(['reversed-by:rev-1', 'reversed-by:rev-2']);
        expect(links[0]).toMatchObject({ EntityName: ORDER, RecordID: 'rev-1', Label: 'Reversed by' });
    });

    it('offers both on a reversal that was itself reversed, Reverses first', () => {
        expect(keysOf(OrderReversalLinks({ ReversesOrderHeaderID: 'order-1', ReversedByOrderIDs: ['rev-2'] }))).toEqual([
            'reverses',
            'reversed-by:rev-2',
        ]);
    });

    it('treats a blank id as no record', () => {
        expect(OrderReversalLinks({ ReversesOrderHeaderID: '  ', ReversedByOrderIDs: ['', 'rev-1'] }).map((l) => l.Key)).toEqual([
            'reversed-by:rev-1',
        ]);
    });
});

describe('OrderReversalLinksKey', () => {
    const state = { ReversesOrderHeaderID: 'order-1', ReversedByOrderIDs: ['rev-1'] };

    it('holds still when nothing changed', () => {
        expect(OrderReversalLinksKey('order-2', state)).toBe(OrderReversalLinksKey('order-2', { ...state }));
    });

    it('moves with the record, the origin and the reversals', () => {
        const base = OrderReversalLinksKey('order-2', state);
        expect(OrderReversalLinksKey('order-3', state)).not.toBe(base);
        expect(OrderReversalLinksKey('order-2', { ...state, ReversesOrderHeaderID: null })).not.toBe(base);
        expect(OrderReversalLinksKey('order-2', { ...state, ReversedByOrderIDs: ['rev-1', 'rev-2'] })).not.toBe(base);
    });
});
