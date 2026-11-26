/**
 * The REAL `OrdersSettings.RefundApprovalThreshold` getter, which turns refund approval on
 * (bc-aidp-next-golive#320 §3, #355). Pins the parse table, that an unreadable value tightens it to 0,
 * and that a missing Orders app row throws rather than reading approval as off. No database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        // No Orders application row: only an override can supply the setting.
        Metadata: class {
            get Applications() {
                return [];
            }
        },
    };
});

const { OrdersSettings } = await import('../OrdersSettings.js');

const THRESHOLD = 'RefundApprovalThreshold';

describe('OrdersSettings.RefundApprovalThreshold (real getter)', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it.each([
        ['', null],
        ['   ', null],
        ['0', 0],
        ['0.00', 0],
        ['500', 500],
        ['500.00', 500],
        ['  500  ', 500],
        ['500.5', 500.5],
        ['abc', 0],
        ['off', 0],
        ['$500', 0],
        ['1,000', 0],
        ['1e3', 0],
        ['-5', 0],
        ['NaN', 0],
    ])('reads %j as %j', (value, expected) => {
        OrdersSettings.SetOverride(THRESHOLD, value);
        expect(OrdersSettings.RefundApprovalThreshold).toBe(expected);
    });

    it('throws when the Orders application row is missing, rather than reading the check as off', () => {
        expect(() => OrdersSettings.RefundApprovalThreshold).toThrow(/Orders application \(__mj_BizAppsOrders\) is not in metadata.*RefundApprovalThreshold/);
    });
});
