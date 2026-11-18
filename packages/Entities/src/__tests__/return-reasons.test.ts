/**
 * The shared return vocabulary. Another app books reversal orders under these spellings, so a
 * rename here is a change to what that app writes into `OrderHeader.ReversalReason`.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_TERMINATED_RETURN_REASON, RETURN_REASONS } from '../return-reasons';

describe('RETURN_REASONS', () => {
    it('keeps the goods reasons a return could always be booked under', () => {
        expect(RETURN_REASONS.slice(0, 5)).toEqual([
            'Damaged in transit',
            'Wrong item shipped',
            'Customer changed mind',
            'Duplicate order',
            'Pricing error',
        ]);
    });

    it('has reasons for an agreement or billing change, where nothing was shipped', () => {
        expect(RETURN_REASONS).toContain('Contract terminated early');
        expect(RETURN_REASONS).toContain('Customer cancellation');
        expect(RETURN_REASONS).toContain('Billing correction');
    });

    it('names the early-termination reason through one constant', () => {
        expect(CONTRACT_TERMINATED_RETURN_REASON).toBe('Contract terminated early');
        expect(RETURN_REASONS).toContain(CONTRACT_TERMINATED_RETURN_REASON);
    });

    it('has no duplicates', () => {
        expect(new Set(RETURN_REASONS).size).toBe(RETURN_REASONS.length);
    });
});
