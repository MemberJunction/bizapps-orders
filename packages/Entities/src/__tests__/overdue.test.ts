import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { IsOverdue, OverdueFilter, OverdueSQL, OverdueViewSQL, NON_OWING_STATUSES, type OverdueFacts } from '../overdue';

/**
 * Tier 1 for the overdue rule.
 *
 * The case that matters most is the VOIDED one. Every hand-rolled copy of this predicate in the repo
 * got the money and the date right and forgot the status, so a voided order with a stale balance and
 * a past due date read as overdue — putting a customer on a collections list for money they do not
 * owe. Nothing about that failure is loud.
 *
 * The second group is the drift guard: the TS predicate and the SQL fragment are two languages
 * stating one rule, and these tests assert they still say the same thing — against the NEXT unpaid
 * due date (AIDP-24) and the BUSINESS day (#168), both of which the committed view must carry.
 */

const DAY = '2026-08-10';

function order(over: Partial<OverdueFacts> = {}): OverdueFacts {
    return { Status: 'Confirmed', Balance: 250, DueDateISO: '2026-07-01', ...over };
}

describe('IsOverdue', () => {
    it('is true for a confirmed order with a balance and a past due date', () => {
        expect(IsOverdue(order(), DAY)).toBe(true);
    });

    it('is FALSE for a voided order, however old and however large the balance', () => {
        // The clause every copy of this rule forgot.
        expect(IsOverdue(order({ Status: 'Voided', Balance: 100_000, DueDateISO: '2020-01-01' }), DAY)).toBe(false);
    });

    it('is false for anything that does not owe yet', () => {
        for (const status of NON_OWING_STATUSES) {
            expect(IsOverdue(order({ Status: status }), DAY), `${status} owes nothing`).toBe(false);
        }
    });

    it('is false when nothing is owed', () => {
        expect(IsOverdue(order({ Balance: 0 }), DAY)).toBe(false);
        expect(IsOverdue(order({ Balance: null }), DAY)).toBe(false);
    });

    it('is false for a CREDIT balance — money owed to the customer is not a debt', () => {
        expect(IsOverdue(order({ Balance: -250 }), DAY)).toBe(false);
    });

    it('is false on the due date itself — due today is not yet late', () => {
        expect(IsOverdue(order({ DueDateISO: DAY }), DAY)).toBe(false);
    });

    it('is false with no due date — a balance with no terms is a question, not a debt', () => {
        expect(IsOverdue(order({ DueDateISO: null }), DAY)).toBe(false);
    });

    it('treats an empty due date as absent rather than as the earliest possible day', () => {
        // '' < any ISO day is TRUE in JS string comparison, so an empty string would make every
        // order with a balance overdue — the loudest possible wrong answer, silently.
        expect(IsOverdue(order({ DueDateISO: '' }), DAY)).toBe(false);
    });
});

describe('the SQL and the filter say what the function says', () => {
    // Not a proof — two languages cannot share code — but every clause of the rule is asserted to
    // appear in both, so dropping one from either half fails here rather than in production.

    it('the view fragment carries all four clauses, qualified by the alias, against the business day', () => {
        const sql = OverdueSQL('g');
        expect(sql).toContain('g.Balance > 0');
        expect(sql).toContain('g.DueDate IS NOT NULL');
        expect(sql).toContain('g.DueDate < bt.Today');
        expect(sql).not.toContain('GETUTCDATE');
        expect(sql).toContain("g.Status NOT IN ('Draft','Quoted','Voided')");
    });

    it('the view reads the NEXT unpaid due date against the business day', () => {
        // The layered view computes NextDueDate in a CROSS APPLY aliased `nd`; the predicate must
        // read it there, not the header's own column, or an instalment order ages on the wrong day —
        // and it compares against `bt.Today`, not the UTC clock, or every order ages a day early
        // for the whole American evening.
        const sql = OverdueSQL('g', 'nd.NextDueDate');
        expect(sql).toContain('nd.NextDueDate IS NOT NULL');
        expect(sql).toContain('nd.NextDueDate < bt.Today');
        expect(sql).not.toContain('g.DueDate');
        expect(sql).not.toContain('GETUTCDATE');
    });

    it('the whole outer view is emitted from here, with both joins', () => {
        const view = OverdueViewSQL();
        expect(view).toContain('CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]');
        expect(view).toContain('    nd.NextDueDate,');
        expect(view).toContain(`CASE WHEN ${OverdueSQL('g', 'nd.NextDueDate')}`);
        expect(view).toContain('FROM [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g');
        expect(view).toContain('CROSS APPLY (');
        expect(view).toContain("AND s.Status IN ('Scheduled','Invoiced')");
        expect(view).toContain('CROSS JOIN [__mj_BizAppsCommon].[fnBusinessToday]() AS bt');
    });

    it('the committed migration is byte-for-byte what OverdueViewSQL emits', () => {
        // The docs said "take the predicate from OverdueSQL, never retype it" and every migration
        // retyped it anyway. This makes the emitter the source and the migration a copy.
        const dir = fileURLToPath(new URL('../../../../migrations/', import.meta.url));
        const newest = readdirSync(dir)
            .filter((f) => f.endsWith('.sql'))
            .sort()
            .filter((f) => readFileSync(dir + f, 'utf8').includes('CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]'))
            .pop();
        expect(newest, 'a migration defines vwOrderHeaders').toBeDefined();
        expect(readFileSync(dir + newest, 'utf8')).toContain(OverdueViewSQL());
    });

    it('the RunView filter carries all four clauses, against NextDueDate, with the caller-supplied day', () => {
        const filter = OverdueFilter(DAY);
        expect(filter).toContain('Balance > 0');
        expect(filter).toContain('NextDueDate IS NOT NULL');
        expect(filter).toContain(`NextDueDate < '${DAY}'`);
        expect(filter).toContain("Status NOT IN ('Draft','Quoted','Voided')");
        // Never the header column: for a scheduled order that is the wrong day.
        expect(filter).not.toMatch(/(?<!Next)DueDate/);
    });

    it('both halves exclude EVERY non-owing status, from the one list', () => {
        // If someone adds a status to NON_OWING_STATUSES, both halves must pick it up automatically.
        for (const status of NON_OWING_STATUSES) {
            expect(OverdueSQL('g')).toContain(`'${status}'`);
            expect(OverdueFilter(DAY)).toContain(`'${status}'`);
        }
    });

    it('the alias is applied to every column, so the fragment is safe in a join', () => {
        const sql = OverdueSQL('g');
        // No bare column names — an unqualified `Status` in a two-table view is ambiguous, and SQL
        // Server would reject it at create time rather than silently pick one. Cheap to assert.
        expect(sql).not.toMatch(/(?<![.\w])(Balance|DueDate|Status)\b/);
    });
});
