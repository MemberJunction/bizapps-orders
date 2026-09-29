import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OrderEntityServer } from '../OrderEntityServer.js';

/**
 * WHO CONFIRMED THE ORDER is written by the booking save, from the save's context user (golive #279).
 *
 * The finance exception review refuses to let a person clear an exception raised against an order
 * they booked, so the confirmer has to be the principal the save ran as, never a value on the
 * payload. `Object.create` holds the server entity without metadata, the way the sibling tests do;
 * the fields `stampConfirmation` writes are plain stand-ins.
 */

type Stampable = {
    stampConfirmation(): void;
    ConfirmedAt: Date | null;
    ConfirmedByUserID: string | null;
};

function header(contextUser: { ID: string } | undefined, sentByCaller: string | null = null): Stampable {
    const order = Object.create(OrderEntityServer.prototype) as Stampable;
    Object.defineProperty(order, 'ContextCurrentUser', { value: contextUser, writable: true });
    Object.defineProperty(order, 'ConfirmedAt', { value: null, writable: true });
    Object.defineProperty(order, 'ConfirmedByUserID', { value: sentByCaller, writable: true });
    return order;
}

describe('the booking stamp', () => {
    it('records the context user as the confirmer, with the time', () => {
        const order = header({ ID: 'a1b2c3d4-0000-4000-8000-000000000001' });
        const before = Date.now();
        order.stampConfirmation();

        expect(order.ConfirmedByUserID).toBe('a1b2c3d4-0000-4000-8000-000000000001');
        expect(order.ConfirmedAt).toBeInstanceOf(Date);
        expect(order.ConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('overwrites a confirmer the caller sent: the payload is not trusted for this', () => {
        const order = header({ ID: 'a1b2c3d4-0000-4000-8000-000000000001' }, 'a1b2c3d4-0000-4000-8000-0000000000ff');
        order.stampConfirmation();

        expect(order.ConfirmedByUserID).toBe('a1b2c3d4-0000-4000-8000-000000000001');
    });

    it('with no context user, still books and records NULL (read as "not known")', () => {
        const order = header(undefined, 'a1b2c3d4-0000-4000-8000-0000000000ff');
        order.stampConfirmation();

        expect(order.ConfirmedAt).toBeInstanceOf(Date);
        expect(order.ConfirmedByUserID).toBeNull();
    });
});

describe('the booking walk', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'OrderEntityServer.ts'), 'utf8');

    it('stamps both columns in one place, and only there', () => {
        // A second writer of either column would let a later save rewrite who booked the order,
        // which trigger 51017 would then refuse as a rollback under INSERT-EXEC.
        expect(source.match(/this\.ConfirmedByUserID\s*=/g)).toHaveLength(1);
        expect(source.match(/this\.ConfirmedAt\s*=/g)).toHaveLength(1);
        expect(source).toMatch(/if \(booking\) \{\s*this\.stampConfirmation\(\);\s*\}/);
    });
});
