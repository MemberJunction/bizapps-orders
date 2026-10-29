import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { DefaultCreditTarget } from '../lib/pages/payments/account-credit.page';

/**
 * golive #379: Jeremy's return ORD-002481 defaulted its credit to ORD-002319, another company's order,
 * rather than ORD-002474, the order it reversed.
 */
const order = (ID: string, ReversesOrderHeaderID: string | null = null) =>
    ({ ID, ReversesOrderHeaderID }) as unknown as mjBizAppsOrdersOrderHeaderEntity;

describe('DefaultCreditTarget', () => {
    const other = order('AAAAAAAA-0000-4000-8000-000000002319');
    const origin = order('BBBBBBBB-0000-4000-8000-000000002474');

    it('picks the order a return reverses when it is in the list', () => {
        const credit = order('CCCCCCCC-0000-4000-8000-000000002481', origin.ID.toLowerCase());
        expect(DefaultCreditTarget(credit, [other, origin])).toBe(origin);
    });

    it('keeps the first unpaid order otherwise', () => {
        expect(DefaultCreditTarget(order('CCCCCCCC-0000-4000-8000-000000000001'), [other, origin])).toBe(other);
    });
});
