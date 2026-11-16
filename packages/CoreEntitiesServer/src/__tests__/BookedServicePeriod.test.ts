/**
 * A booked line's service period is frozen with its money (golive #391), except for Orders' own term
 * amendments, which are sanctioned per save.
 *
 * Confirm schedules revenue recognition over `ServicePeriodStart`/`ServicePeriodEnd`. Before this,
 * Quantity and UnitPrice were refused on a booked line while the dates were accepted, so the order
 * and the ledger disagreed on when the work is delivered. Trigger 51003 holds the same rule at the
 * database; the integration check `service-period-lock.SP7`/`SP8` covers that half.
 *
 * `Object.create` matches the sibling line tests: the server entity without metadata, with the
 * generated accessors shadowed by plain properties.
 */
import { describe, expect, it } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { ORDER_LINE_MONEY_FIELDS } from '@mj-biz-apps/orders-entities';
import { OrderLineEntityServer, SanctionServicePeriodRedate } from '../OrderLineEntityServer.js';

type LineUnderTest = OrderLineEntityServer & { refuseBookedMoneyEdits(result: ValidationResult): void };

function bookedLine(dirty: string[], journalEntryID: string | null = 'je-1'): LineUnderTest {
    const line = Object.create(OrderLineEntityServer.prototype) as LineUnderTest;
    Object.defineProperty(line, 'JournalEntryID', { value: journalEntryID, writable: true });
    Object.defineProperty(line, 'FieldIsDirty', { value: (...names: string[]) => names.some((n) => dirty.includes(n)) });
    Object.defineProperty(line, 'GetFieldByName', { value: () => ({ Value: null }) });
    return line;
}

function refusal(line: LineUnderTest): string | null {
    const result = new ValidationResult();
    result.Success = true;
    line.refuseBookedMoneyEdits(result);
    return result.Success ? null : String(result.Errors[0]?.Message ?? '');
}

describe('a booked line keeps its service period', () => {
    it('lists both dates among the booked line fields', () => {
        expect(ORDER_LINE_MONEY_FIELDS).toContain('ServicePeriodStart');
        expect(ORDER_LINE_MONEY_FIELDS).toContain('ServicePeriodEnd');
    });

    it('refuses a changed end on a line that carries its booking entry', () => {
        expect(refusal(bookedLine(['ServicePeriodEnd']))).toContain('ServicePeriodEnd');
    });

    it('refuses a changed start the same way', () => {
        expect(refusal(bookedLine(['ServicePeriodStart']))).toContain('ServicePeriodStart');
    });

    it('leaves an unbooked line alone', () => {
        expect(refusal(bookedLine(['ServicePeriodStart', 'ServicePeriodEnd'], null))).toBeNull();
    });
});

describe("Orders' term amendment may move it, and only it", () => {
    it('lets a sanctioned line move both dates', () => {
        const line = bookedLine(['ServicePeriodStart', 'ServicePeriodEnd']);
        SanctionServicePeriodRedate(line);
        expect(refusal(line)).toBeNull();
    });

    it('still refuses the money on a sanctioned line', () => {
        const line = bookedLine(['ServicePeriodEnd', 'Quantity']);
        SanctionServicePeriodRedate(line);
        const message = refusal(line);
        expect(message).toContain('Quantity');
        expect(message).not.toContain('ServicePeriodEnd');
    });

    it('does not carry the sanction to another line object', () => {
        SanctionServicePeriodRedate(bookedLine(['ServicePeriodEnd']));
        expect(refusal(bookedLine(['ServicePeriodEnd']))).toContain('ServicePeriodEnd');
    });

    it('refuses to sanction an object the server subclass did not produce', () => {
        expect(() => SanctionServicePeriodRedate({} as never)).toThrow(/server's entity subclass/);
    });
});
