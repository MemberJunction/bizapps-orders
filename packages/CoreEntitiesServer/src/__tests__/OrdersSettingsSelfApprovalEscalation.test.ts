/**
 * How `ConcessionSelfApprovalEscalation` is read (bc-aidp-next-golive#320): an ordered list of targets, where
 * an empty value keeps a holder of the approving role approving their own concession.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ORDERS_SETTING, OrdersSettings } from '../OrdersSettings.js';

describe('OrdersSettings.ConcessionSelfApprovalEscalation', () => {
    afterEach(() => OrdersSettings.SetOverride(ORDERS_SETTING.ConcessionSelfApprovalEscalation, undefined));

    it('reads an empty value as no escalation', () => {
        OrdersSettings.SetOverride(ORDERS_SETTING.ConcessionSelfApprovalEscalation, '  ');
        expect(OrdersSettings.ConcessionSelfApprovalEscalation).toEqual([]);
    });

    it('keeps the targets in the order given, trimmed', () => {
        OrdersSettings.SetOverride(ORDERS_SETTING.ConcessionSelfApprovalEscalation, ' CompanyCFO , Top Approver ,');
        expect(OrdersSettings.ConcessionSelfApprovalEscalation).toEqual(['CompanyCFO', 'Top Approver']);
    });
});
