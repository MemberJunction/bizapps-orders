/**
 * Caller-supplied input must never reach SQL text unvalidated.
 *
 * WHY THIS MATTERS MORE THAN AN ORDINARY VALIDATION BUG. `RunView`'s `ExtraFilter`
 * is composed as SQL, and a remote operation's input is whatever the caller sent.
 * An injected `' OR 1=1 --` in a customer id does not crash anything — it WIDENS a
 * result set. The worklist still renders, the totals still add up, and it quietly
 * shows one customer another customer's receivables. A failure that looks like
 * working software is the one worth a permanent test.
 *
 * Two layers here:
 *   1. Behavioural tests of the guards themselves — they are a pure module, so
 *      they can simply be called.
 *   2. A source-level drift guard asserting every operation validates the ids it
 *      accepts. That one is textual on purpose: the defect it catches is "someone
 *      added an operation and interpolated `input.SomethingID` straight into a
 *      filter," which is visible in the source whether or not a runtime test
 *      happens to exercise the new path.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    EscapeText,
    InvalidOperationInputError,
    RequireDate,
    RequireOptionalUUID,
    RequireUUID,
    RequireUUIDs,
} from '../sql-guards.js';

const SRC = join(import.meta.dirname, '..');
const GOOD = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('sql guards', () => {
    it('accepts a UUID unchanged', () => {
        expect(RequireUUID(GOOD, 'ID')).toBe(GOOD);
    });

    it.each([
        ["' OR 1=1 --", 'the classic widening injection'],
        [`' OR '1'='1`, 'quote-balanced variant'],
        [`${GOOD}' OR '1'='1`, 'a real id with a payload appended'],
        ['not-a-uuid', 'plain garbage'],
        ['', 'empty'],
    ])('rejects %s (%s)', (bad) => {
        expect(() => RequireUUID(bad, 'BillToOrganizationID')).toThrow(InvalidOperationInputError);
    });

    it('names the offending field, so a caller can find their own bug', () => {
        expect(() => RequireUUID('nope', 'SalesRepUserID')).toThrow(/SalesRepUserID/);
    });

    it('treats an absent optional id as absent rather than invalid', () => {
        // An omitted filter is not a malformed one — these inputs are optional
        // narrowing, and rejecting undefined would break every unfiltered call.
        expect(RequireOptionalUUID(undefined, 'X')).toBeUndefined();
        expect(RequireOptionalUUID(null, 'X')).toBeNull();
        expect(RequireOptionalUUID('', 'X')).toBe('');
        expect(RequireOptionalUUID(GOOD, 'X')).toBe(GOOD);
    });

    it('still rejects a malformed optional id', () => {
        expect(() => RequireOptionalUUID("' OR 1=1 --", 'X')).toThrow(InvalidOperationInputError);
    });

    it('validates every element of an id list', () => {
        expect(RequireUUIDs([GOOD, GOOD], 'CompanyIDs')).toEqual([GOOD, GOOD]);
        // One bad element among good ones is the interesting case: an IN list is
        // a single string, so one payload contaminates the whole clause.
        expect(() => RequireUUIDs([GOOD, "' OR 1=1 --"], 'CompanyIDs')).toThrow(
            InvalidOperationInputError,
        );
        expect(RequireUUIDs(undefined, 'CompanyIDs')).toEqual([]);
    });

    it('reduces a date to its day part and rejects non-dates', () => {
        expect(RequireDate('2026-03-04T11:22:33Z', 'AsOfDate')).toBe('2026-03-04');
        expect(() => RequireDate("2026-03-04' OR '1'='1", 'AsOfDate')).toThrow(
            InvalidOperationInputError,
        );
        expect(() => RequireDate('not-a-date', 'AsOfDate')).toThrow(InvalidOperationInputError);
    });

    it('escapes free text by doubling the quote', () => {
        expect(EscapeText("O'Brien")).toBe("O''Brien");
    });
});

/** Operation source files — the ones whose input crosses a trust boundary. */
const operationFiles = readdirSync(SRC).filter(
    (f) => f.endsWith('Operation.ts') || f === 'EntitlementRead.ts',
);

describe('operation boundaries', () => {
    it('finds the operation files at all', () => {
        // Guards the guard: an empty list makes every check below vacuous.
        expect(operationFiles.length).toBeGreaterThan(5);
    });

    it.each(operationFiles)('%s validates the ids it accepts', (file) => {
        const source = readFileSync(join(SRC, file), 'utf8');
        const accepted = [...source.matchAll(/\binput[?]?\.([A-Za-z]+ID)\b/g)].map((m) => m[1]);
        // A file that hands its reversal fields to the shared factory writes them through
        // `PaymentReversalFactory`, whose every assignment is a `.Set()` — see the exemption below.
        const viaReversalFactory = source.includes('CreateReversingPayment(');

        const unique = [...new Set(accepted)].filter((field) => {
            // A value whose every use is `entity.Set('Field', input.Field)` is
            // written through the parameterised entity layer and never becomes SQL
            // text. ProviderRefundID is the real case: a gateway's own reference
            // string ("re_1AbC…"), which is not a UUID and must not be forced into
            // one. Requiring a shape it never had would reject valid refunds.
            const uses = [...source.matchAll(new RegExp(`.{0,40}\\binput[?]?\\.${field}\\b`, 'g'))];
            return !uses.every(
                (u) =>
                    u[0].includes('.Set(') ||
                    // SAME EXEMPTION, ONE FRAME FURTHER OUT. When the reversal mechanics moved into
                    // `PaymentReversalFactory` (so a bank RETURN and a deliberate refund could not
                    // drift apart), the `.Set()` moved with them — the value now reaches the entity
                    // layer as a named property of the request literal rather than at this call site.
                    // The guarantee is unchanged and still textually checkable: the factory assigns
                    // every field of that literal with `.Set()` and composes no filters at all.
                    // Deliberately narrow — it applies only in a file that calls the factory, so it
                    // cannot excuse an object literal handed to something that DOES build SQL.
                    (viaReversalFactory && new RegExp(`\\b${field}\\s*:`).test(u[0])),
            );
        });
        if (!unique.length) return;

        const unguarded = unique.filter(
            (field) => !new RegExp(`Require(Optional)?UUIDs?\\([^)]*\\b${field}\\b`).test(source),
        );
        expect(
            unguarded,
            `${file} accepts ${unguarded.join(', ')} from a caller without validating`,
        ).toEqual([]);
    });
});
