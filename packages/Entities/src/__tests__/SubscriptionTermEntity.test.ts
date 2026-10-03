import { describe, expect, it } from 'vitest';
import { SubscriptionTermEntity } from '../SubscriptionTermEntity';

/**
 * A booked term's dates and amount are fixed — golive #222.
 *
 * Nothing guarded them, so a term could be extended at no charge by moving its end date, with no
 * value recorded and no approval sought. The extension is a Duration concession instead. These drive
 * the real `Validate()` override on an instance held with `Object.create`, the house pattern for
 * entity tests that do not stand up metadata.
 */
function validate(saved: boolean, dirty: string[]) {
    const term = Object.create(SubscriptionTermEntity.prototype) as SubscriptionTermEntity;
    const fields = new Map(['StartDate', 'EndDate', 'Amount', 'Status'].map((n) => [n, { Dirty: dirty.includes(n), Value: n }]));
    Object.defineProperty(term, 'IsSaved', { value: saved });
    Object.defineProperty(term, 'GetFieldByName', { value: (name: string) => fields.get(name) });

    // The generated validators are not what this is about; the booked-term rule runs for real.
    const parent = Object.getPrototypeOf(SubscriptionTermEntity.prototype) as { Validate: () => unknown };
    const original = parent.Validate;
    parent.Validate = () => ({ Success: true, Errors: [] });
    try {
        return term.Validate();
    } finally {
        parent.Validate = original;
    }
}

describe('SubscriptionTermEntity — a booked term is fixed', () => {
    it('refuses moving a saved term\'s end date, and says how to extend it instead', () => {
        const result = validate(true, ['EndDate']);
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('EndDate');
        expect(result.Errors[0].Message).toMatch(/Duration concession/);
    });

    it('names every booked field being changed', () => {
        const result = validate(true, ['StartDate', 'Amount']);
        expect(result.Errors[0].Message).toMatch(/StartDate, Amount/);
    });

    it('lets a saved term change what is not booked, such as its status', () => {
        expect(validate(true, ['Status']).Success).toBe(true);
    });

    it('lets a new term be written with its dates — that is how confirm books one', () => {
        expect(validate(false, ['StartDate', 'EndDate', 'Amount']).Success).toBe(true);
    });
});
