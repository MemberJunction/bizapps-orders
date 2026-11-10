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
import { codeOnly, depthAt, expectTopLevelConjunct } from './selectionRule.js';

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
        expect(depthAt(codeOnly(q), expectTopLevelConjunct(q, 'WHERE s.AutoRenew = 1', 'ORDER BY l.EndDate', MARKER))).toBe(0);
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
        const at = expectTopLevelConjunct(q, 'WHERE oh.Status NOT IN', 'ORDER BY oh.NextDueDate', MARKER);
        expect(group).toBeGreaterThan(code.indexOf('WHERE oh.Status NOT IN'));
        // Depth 0: a sibling of the other outer conditions, so it applies to both branches of the group.
        expect(depthAt(code, at)).toBe(0);
    });

    it('keys on the marker alone: nothing about the provider account or its switch is read', async () => {
        const q = await chargeSql();
        expect(codeOnly(q)).not.toMatch(/BillsSubscriptions|SupportsSubscriptionBilling/);
    });
});
