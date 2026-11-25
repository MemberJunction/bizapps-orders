import { describe, expect, it } from 'vitest';
import { IssueInvoiceBlockedReason } from '../lib/pages/receivables/billing-issue';

/** The billing worklist offers "Issue invoice" only for a confirmed order's instalment (golive #469). */
describe('IssueInvoiceBlockedReason', () => {
    it('allows a confirmed order', () => {
        expect(IssueInvoiceBlockedReason({ OrderNumber: 'ORD-1', OrderStatus: 'Confirmed' })).toBeNull();
    });
    it('blocks a draft order and says why', () => {
        expect(IssueInvoiceBlockedReason({ OrderNumber: 'ORD-1', OrderStatus: 'Draft' })).toBe('ORD-1 is Draft. Only a confirmed order can be invoiced; confirm it first.');
    });
    it('blocks an order whose status is unknown', () => {
        expect(IssueInvoiceBlockedReason({ OrderNumber: 'ORD-1', OrderStatus: '' })).toContain('not confirmed');
    });
    it('has nothing to say with no row selected', () => {
        expect(IssueInvoiceBlockedReason(null)).toBeNull();
    });
});
