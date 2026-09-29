/**
 * The suffix letter a split order's document carries, per company.
 *
 * WHY THIS HAS ITS OWN FILE. Getting it wrong is invisible in every single-company test and expensive
 * in production: order ORD-1234 selling for two companies numbered BOTH invoices ORD-1234-A. Where the
 * two companies use separate Bill.com organisations the customer received two documents with the same
 * number; where they share one, the second was refused as a duplicate and that company's money was
 * never billed at all. The cause was a case fold — the list keeps the database's uppercase ids and the
 * lookup searched for a lower-cased one, so every miss silently became position 0.
 */
import { describe, expect, it } from 'vitest';
import { companySuffixIndex } from '../IssueExternalInvoiceOperation.js';
import { DocumentNumber } from '../InvoiceBehavior.js';

// As SQL Server returns them.
const A = '00000000-0000-0000-0000-0000000000AA';
const B = '00000000-0000-0000-0000-0000000000BB';
const C = '00000000-0000-0000-0000-0000000000CC';

describe('companySuffixIndex', () => {
    it('finds each company regardless of the casing it is asked about', () => {
        expect(companySuffixIndex([A, B], A)).toBe(0);
        expect(companySuffixIndex([A, B], B)).toBe(1);
        expect(companySuffixIndex([A, B], A.toLowerCase())).toBe(0);
        expect(companySuffixIndex([A, B], B.toLowerCase())).toBe(1);
    });

    it('agrees with the document builder, which sorts the ids as the database returns them', () => {
        // Whatever order the lines arrived in, the suffix follows the sorted position.
        expect(companySuffixIndex([B, A, C], C)).toBe(2);
        expect(companySuffixIndex([C, B, A], A)).toBe(0);
    });

    it('gives a split order two DIFFERENT numbers — the whole point', () => {
        const total = 2;
        const first = DocumentNumber('ORD-1234', companySuffixIndex([A, B], A.toLowerCase()), total);
        const second = DocumentNumber('ORD-1234', companySuffixIndex([A, B], B.toLowerCase()), total);
        expect(first).toBe('ORD-1234-A');
        expect(second).toBe('ORD-1234-B');
        expect(first).not.toBe(second);
    });

    it('leaves a single-company order with the bare order number', () => {
        expect(DocumentNumber('ORD-1234', companySuffixIndex([A], A.toLowerCase()), 1)).toBe('ORD-1234');
    });

    it('refuses rather than silently numbering an unknown company as the first', () => {
        // The old code did `Math.max(0, indexOf(...))`, which is exactly how every company became -A.
        expect(() => companySuffixIndex([A, B], C)).toThrow(/does not appear/i);
    });

    it('tolerates a miss on a single-company order, where the suffix is unused anyway', () => {
        expect(companySuffixIndex([A], C)).toBe(0);
    });
});
