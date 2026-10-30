import { describe, expect, it } from 'vitest';
import { FormatInstantDate } from '../../../panels/money-format';
import { InstalmentARLabel, NoScheduleARNote } from '../order-payment-schedule';

describe('NoScheduleARNote', () => {
    it('says AR was raised in full for a confirmed order', () => {
        expect(NoScheduleARNote(true)).toContain('was raised to AR when the order was confirmed');
    });

    it('says confirming will raise AR in full for an unconfirmed order', () => {
        expect(NoScheduleARNote(false)).toContain('confirming raises the full order value to AR');
    });
});

describe('InstalmentARLabel', () => {
    const invoicedAt = new Date('2026-10-02T15:00:00Z');

    it('dates an invoiced instalment by its invoice', () => {
        expect(InstalmentARLabel({ Status: 'Invoiced', InvoicedAt: invoicedAt, JournalEntryID: 'je-1' })).toBe(
            `Raised ${FormatInstantDate(invoicedAt)}`,
        );
    });

    it('keeps the AR date once the instalment is paid', () => {
        expect(InstalmentARLabel({ Status: 'Paid', InvoicedAt: invoicedAt, JournalEntryID: 'je-1' })).toBe(
            `Raised ${FormatInstantDate(invoicedAt)}`,
        );
    });

    it('says a scheduled instalment raises AR when it is invoiced', () => {
        expect(InstalmentARLabel({ Status: 'Scheduled', InvoicedAt: null, JournalEntryID: null })).toBe('When invoiced');
    });

    it('says an instalment canceled before invoicing raises none', () => {
        expect(InstalmentARLabel({ Status: 'Canceled', InvoicedAt: null, JournalEntryID: null })).toBe('Not raised');
    });

    it('still reports AR raised for an instalment canceled after invoicing', () => {
        expect(InstalmentARLabel({ Status: 'Canceled', InvoicedAt: invoicedAt, JournalEntryID: 'je-1' })).toBe(
            `Raised ${FormatInstantDate(invoicedAt)}`,
        );
    });
});
