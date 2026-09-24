/**
 * The reversing lines un-apply cash from exactly where the capture put it (#234 review, item 1):
 * each keeps its original's order line and named instalment, so a refund of a named deposit
 * empties that instalment instead of landing as unnamed cash on no row.
 */
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BuildUnapplyLines, type AppliedAllocation } from '../PaymentReversalFactory.js';

const provider = {
    GetEntityObject: async () => ({ NewRecord: () => undefined }),
} as unknown as IMetadataProvider;
const user = { ID: 'user-1' } as UserInfo;

describe('BuildUnapplyLines', () => {
    it('carries the order line and the named instalment onto each negative line', async () => {
        const apps: AppliedAllocation[] = [
            { OrderHeaderID: 'o1', OrderLineID: 'ol1', OrderHeaderPaymentScheduleID: 'inst2', Amount: 150 },
            { OrderHeaderID: 'o1', OrderLineID: null, OrderHeaderPaymentScheduleID: null, Amount: 50 },
        ];
        const lines = await BuildUnapplyLines(provider, user, apps, 200);
        expect(lines.map((l) => [l.OrderHeaderID, l.OrderLineID, l.OrderHeaderPaymentScheduleID, l.Amount])).toEqual([
            ['o1', 'ol1', 'inst2', -150],
            ['o1', null, null, -50],
        ]);
    });

    it('spreads a partial refund across the original lines, remainder on the last', async () => {
        const apps: AppliedAllocation[] = [
            { OrderHeaderID: 'o1', OrderLineID: null, OrderHeaderPaymentScheduleID: 'inst1', Amount: 100 },
            { OrderHeaderID: 'o1', OrderLineID: null, OrderHeaderPaymentScheduleID: 'inst2', Amount: 200 },
        ];
        const lines = await BuildUnapplyLines(provider, user, apps, 100);
        expect(lines.map((l) => [l.OrderHeaderPaymentScheduleID, l.Amount])).toEqual([
            ['inst1', -33.33],
            ['inst2', -66.67],
        ]);
    });
});
