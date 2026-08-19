import { describe, expect, it } from 'vitest';
import { BookedMoneyEditMessage, type BookedMoneyEditFacts } from '../booked-money.js';

const clean: BookedMoneyEditFacts = {
    NewLineCount: 0,
    RemovedLineCount: 0,
    DirtyLineMoneyFields: [],
    ChargesChanged: false,
    AdjustmentsChanged: false,
    DirtyHeaderMoneyFields: [],
};

describe('BookedMoneyEditMessage', () => {
    it('is silent when nothing money-related changed', () => {
        expect(BookedMoneyEditMessage(clean)).toBeNull();
    });

    it('refuses adding a line', () => {
        const message = BookedMoneyEditMessage({ ...clean, NewLineCount: 1 });
        expect(message).toContain('add a line');
        expect(message).toContain('booked');
    });

    it('refuses quantity / price edits on existing lines', () => {
        const message = BookedMoneyEditMessage({
            ...clean,
            DirtyLineMoneyFields: ['Quantity', 'UnitPrice'],
        });
        expect(message).toContain('Quantity');
        expect(message).toContain('UnitPrice');
    });

    it('refuses charges and the initial tender together', () => {
        const message = BookedMoneyEditMessage({
            ...clean,
            ChargesChanged: true,
            DirtyHeaderMoneyFields: ['InitialPaymentAmount'],
        });
        expect(message).toContain('charges');
        expect(message).toContain('InitialPaymentAmount');
    });
});
