import { describe, expect, it } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { SubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { SanctionTermAmendment, SubscriptionTermEntityServer } from '../SubscriptionTermEntityServer';

/**
 * A booked term's dates change only through an approved extension — golive #221.
 *
 * The shared entity refuses the edit on every tier. The server subclass admits it for one object the
 * amendment has sanctioned, and for no other. Driven through the real `Validate()` on an instance held
 * with `Object.create`, the house pattern for entity tests that do not stand up metadata.
 */
function term(): SubscriptionTermEntityServer {
    const t = Object.create(SubscriptionTermEntityServer.prototype) as SubscriptionTermEntityServer;
    const fields = new Map(['StartDate', 'EndDate', 'Amount'].map((n) => [n, { Dirty: n === 'EndDate', Value: n }]));
    Object.defineProperty(t, 'IsSaved', { value: true });
    Object.defineProperty(t, 'GetFieldByName', { value: (name: string) => fields.get(name) });
    return t;
}

function validate(t: SubscriptionTermEntityServer) {
    const parent = Object.getPrototypeOf(SubscriptionTermEntity.prototype) as { Validate: () => unknown };
    const original = parent.Validate;
    parent.Validate = () => ({ Success: true, Errors: [] });
    try {
        return t.Validate();
    } finally {
        parent.Validate = original;
    }
}

describe('SubscriptionTermEntityServer — the sanctioned amendment write', () => {
    it('still refuses moving a booked term\'s end date without the sanction', () => {
        expect(validate(term()).Success).toBe(false);
    });

    it('admits it for the one object the amendment sanctioned', () => {
        const sanctioned = term();
        SanctionTermAmendment(sanctioned);
        expect(validate(sanctioned).Success).toBe(true);
        expect(validate(term()).Success).toBe(false);
    });

    it('is not granted by a value set on the record: only SanctionTermAmendment grants it', () => {
        const t = term();
        (t as unknown as Record<string, unknown>).Sanctioned = true;
        expect(validate(t).Success).toBe(false);
    });

    it('refuses to sanction an object the server subclass did not produce', () => {
        const plain = Object.create(SubscriptionTermEntity.prototype) as BaseEntity;
        expect(() => SanctionTermAmendment(plain)).toThrow(/entity subclass/);
    });
});
