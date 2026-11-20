/**
 * The provider-billed rule must be one top-level AND of a selection's WHERE (#948): a rule inside an OR
 * group, a subquery or a comment would let a row through without it. Shared by every reader listed in
 * `ProviderBilledSubscriptions.ts` (READERS), so the check is written once.
 */
import { expect } from 'vitest';

/**
 * The statement with every comment and string literal blanked to spaces, the same length so indexes line
 * up. A rule that is commented out (`AND 1=1 -- s.ProviderSubscriptionID IS NULL`) is not part of the
 * statement, and an apostrophe inside a comment (`the account's switch`) must not open a string.
 */
export function codeOnly(sql: string): string {
    let out = '';
    let i = 0;
    const blank = (from: number, to: number): void => {
        out += sql.slice(from, to).replace(/[^\n]/g, ' ');
        i = to;
    };
    while (i < sql.length) {
        if (sql.startsWith('--', i)) {
            const eol = sql.indexOf('\n', i);
            blank(i, eol < 0 ? sql.length : eol);
        } else if (sql.startsWith('/*', i)) {
            const end = sql.indexOf('*/', i + 2);
            blank(i, end < 0 ? sql.length : end + 2);
        } else if (sql[i] === "'") {
            // A literal runs to the next quote that is not doubled ('' is an escaped quote inside it).
            let j = i + 1;
            while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
            blank(i, Math.min(j + 1, sql.length));
        } else {
            out += sql[i++];
        }
    }
    return out;
}

/** Parenthesis depth at `index` of a statement already passed through `codeOnly`. */
export function depthAt(code: string, index: number): number {
    let depth = 0;
    for (let i = 0; i < index; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;
    }
    return depth;
}

/**
 * Asserts `marker` is one top-level conjunct of the WHERE that starts at `whereAt` and ends at
 * `endAt`: present outside comments, at parenthesis depth 0, joined by AND on both sides, and in a WHERE
 * with no top-level OR (which would let a row in without it). Returns where it sits.
 */
export function expectTopLevelConjunct(sql: string, whereAt: string, endAt: string, marker: string): number {
    const code = codeOnly(sql);
    const where = code.indexOf(whereAt);
    const end = code.indexOf(endAt, where);
    expect(where, `"${whereAt}" in the statement`).toBeGreaterThan(-1);
    expect(end, `"${endAt}" after the WHERE`).toBeGreaterThan(where);
    const at = code.indexOf(marker, where);
    expect(at, 'the rule outside any comment, inside this WHERE').toBeGreaterThan(where);
    expect(at).toBeLessThan(end);
    expect(depthAt(code, at), 'parenthesis depth of the rule').toBe(depthAt(code, where));
    expect(code.slice(where, at), 'joined to the conditions before it by AND').toMatch(/\bAND\s*$/);
    expect(code.slice(at + marker.length, end), 'followed by AND or the end of the WHERE').toMatch(/^\s*(AND\b|$)/);
    const base = depthAt(code, where);
    for (const m of code.slice(where, end).matchAll(/\bOR\b/g)) {
        expect(depthAt(code, where + m.index!), 'an OR at the top level of the WHERE').toBeGreaterThan(base);
    }
    return at;
}
