/**
 * Orders' two renewal jobs leave a provider-billed subscription alone (option E, E1).
 *
 * A subscription whose `ProviderSubscriptionID` is set is billed by the gateway named in its
 * `PaymentProviderID` (Stripe Billing charges it and sends the receipt). If Spawn Renewals also placed
 * a renewal order, or Charge Renewals charged the renewal card, the customer would pay twice. So both
 * selections exclude the subscription on the marker itself, `ProviderSubscriptionID IS NULL`, and on
 * nothing else: not the account's `BillsSubscriptions` switch, which only governs creating new gateway
 * subscriptions.
 *
 * These tests read the SQL each job sends, through a provider that records it, with no database.
 * Where the rule sits matters for Charge Renewals: its `settledUnbooked` branch selects without
 * `AutoRenew`, so the rule must be in the OUTER `WHERE`, not inside the `(chargeable OR settledUnbooked)`
 * group. The behaviour against real rows is the `subscription-renewal` integration bundle, SR54-SR57.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: async () => undefined,
        RenewalChargeRetryDays: [3, 7, 11],
        RenewalAccessCutoffDaysPastDue: 14,
    },
}));

import { ChargeRenewals } from '../RenewalCharging.js';
import { SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';

const MARKER = 's.ProviderSubscriptionID IS NULL';
const USER = { ID: 'user-1' } as unknown as UserInfo;

/** A provider that records every statement and returns no rows, so each job stops after selecting. */
function recordingProvider(): { provider: IMetadataProvider; sql: string[] } {
    const sql: string[] = [];
    const provider = {
        ExecuteSQL: async (q: string) => {
            sql.push(q);
            return [];
        },
    } as unknown as IMetadataProvider;
    return { provider, sql };
}

/**
 * The statement with every comment and string literal blanked to spaces, the same length so indexes line
 * up. A rule that is commented out (`AND 1=1 -- s.ProviderSubscriptionID IS NULL`) is not part of the
 * statement, and an apostrophe inside a comment (`the account's switch`) must not open a string.
 */
function codeOnly(sql: string): string {
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
function depthAt(code: string, index: number): number {
    let depth = 0;
    for (let i = 0; i < index; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;
    }
    return depth;
}

/**
 * Asserts the marker is one top-level conjunct of the WHERE that starts at `whereAt` and ends at
 * `endAt`: present outside comments, at parenthesis depth 0, joined by AND on both sides, and in a WHERE
 * with no top-level OR (which would let a row in without it). Returns where it sits.
 */
function expectTopLevelConjunct(sql: string, whereAt: string, endAt: string): number {
    const code = codeOnly(sql);
    const where = code.indexOf(whereAt);
    const end = code.indexOf(endAt, where);
    expect(where, `"${whereAt}" in the statement`).toBeGreaterThan(-1);
    expect(end, `"${endAt}" after the WHERE`).toBeGreaterThan(where);
    const at = code.indexOf(MARKER, where);
    expect(at, 'the rule outside any comment, inside this WHERE').toBeGreaterThan(where);
    expect(at).toBeLessThan(end);
    expect(depthAt(code, at), 'parenthesis depth of the rule').toBe(depthAt(code, where));
    expect(code.slice(where, at), 'joined to the conditions before it by AND').toMatch(/\bAND\s*$/);
    expect(code.slice(at + MARKER.length, end), 'followed by AND or the end of the WHERE').toMatch(/^\s*(AND\b|$)/);
    const base = depthAt(code, where);
    for (const m of code.slice(where, end).matchAll(/\bOR\b/g)) {
        expect(depthAt(code, where + m.index!), 'an OR at the top level of the WHERE').toBeGreaterThan(base);
    }
    return at;
}
/** The statement the job sent that selects from Subscription with this alias. */
function selection(sql: string[], from: RegExp): string {
    const found = sql.filter((q) => from.test(q));
    expect(found, 'exactly one selection statement').toHaveLength(1);
    return found[0];
}

describe('Spawn Renewals selection (findDue)', () => {
    async function spawnSql(): Promise<string> {
        const { provider, sql } = recordingProvider();
        const op = new SpawnRenewalsOperation() as unknown as {
            InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }>;
        };
        const out = await op.InternalExecute({ AsOfDate: '2027-10-20', Preview: true }, provider, USER);
        expect(out.Success, out.Message).toBe(true);
        return selection(sql, /FROM __mj_BizAppsOrders\.Subscription s\b/);
    }

    it('skips a subscription a gateway bills: the selection requires ProviderSubscriptionID to be NULL', async () => {
        const q = await spawnSql();
        expect(codeOnly(q)).toContain(MARKER);
    });

    it('puts the rule in the main WHERE, beside AutoRenew, not inside a subquery or an OR group', async () => {
        const q = await spawnSql();
        expect(depthAt(codeOnly(q), expectTopLevelConjunct(q, 'WHERE s.AutoRenew = 1', 'ORDER BY l.EndDate'))).toBe(0);
    });

    it('keys on the marker alone: nothing about the provider account or its switch is read', async () => {
        const q = await spawnSql();
        expect(codeOnly(q)).not.toMatch(/BillsSubscriptions|SupportsSubscriptionBilling|PaymentProvider\b/);
    });
});

describe('Charge Renewals selection (findCandidates)', () => {
    async function chargeSql(): Promise<string> {
        const { provider, sql } = recordingProvider();
        const out = await ChargeRenewals({ AsOfDate: '2027-10-20', Preview: true }, provider, USER);
        expect(out.Success, out.Message).toBe(true);
        return selection(sql, /JOIN __mj_BizAppsOrders\.Subscription s ON/);
    }

    it('skips a subscription a gateway bills: the selection requires ProviderSubscriptionID to be NULL', async () => {
        const q = await chargeSql();
        expect(codeOnly(q)).toContain(MARKER);
    });

    it('puts the rule in the OUTER WHERE, so the settled-but-unbooked branch (no AutoRenew test) is covered too', async () => {
        const q = await chargeSql();
        const code = codeOnly(q);
        const group = code.indexOf('AND ((oh.NextDueDate');
        const at = expectTopLevelConjunct(q, 'WHERE oh.Status NOT IN', 'ORDER BY oh.NextDueDate');
        expect(group).toBeGreaterThan(code.indexOf('WHERE oh.Status NOT IN'));
        // Depth 0: a sibling of the other outer conditions, so it applies to both branches of the group.
        expect(depthAt(code, at)).toBe(0);
    });

    it('keys on the marker alone: nothing about the provider account or its switch is read', async () => {
        const q = await chargeSql();
        expect(codeOnly(q)).not.toMatch(/BillsSubscriptions|SupportsSubscriptionBilling/);
    });
});
