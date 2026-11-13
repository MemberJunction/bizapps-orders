/**
 * Where the price being renewed began reaches the pricer (golive #478).
 *
 * The annual increase is measured from the earliest term the expiring term's order line bought.
 * `RenewalSubjectRow.LineFirstTermStartDate` carries that day, and a selection that left it out would
 * price as before the fix with nothing failing: null reads as the term's own start. So these tests
 * read the SQL each selection sends, through a provider that records it, with no database. The rule
 * itself is tested in orders-entities (`renewal-price.test.ts`).
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

import { GetRenewalWorklistOperation } from '../GetRenewalWorklistOperation.js';
import { LineFirstTermStartSql } from '../RenewalPricing.js';
import { SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const ID_A = '11111111-1111-4111-8111-111111111111';
const squash = (sql: string): string => sql.replace(/\s+/g, ' ');

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

type Spawn = { InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }> };

describe('LineFirstTermStartSql', () => {
    it('is the earliest start among the same subscription\u2019s terms on the same order line', () => {
        expect(LineFirstTermStartSql('l')).toBe(
            '(SELECT MIN(ft.StartDate) FROM __mj_BizAppsOrders.SubscriptionTerm ft ' +
                'WHERE ft.SubscriptionID = l.SubscriptionID AND ft.OrderLineID = l.OrderLineID)',
        );
    });

    it('refuses anything that is not a plain alias', () => {
        expect(() => LineFirstTermStartSql('l; DROP TABLE x')).toThrow(/plain SQL table alias/);
        expect(() => LineFirstTermStartSql('')).toThrow(/plain SQL table alias/);
    });
});

describe('the renewal selections read where the price began', () => {
    const COLUMN = `${LineFirstTermStartSql('l')} AS LineFirstTermStartDate`;

    it('Spawn Renewals, scheduled selection (findDue)', async () => {
        const { provider, sql } = recordingProvider();
        const out = await (new SpawnRenewalsOperation() as unknown as Spawn).InternalExecute({ AsOfDate: '2027-10-20', Preview: true }, provider, USER);
        expect(out.Success, out.Message).toBe(true);
        const selections = sql.filter((q) => /FROM __mj_BizAppsOrders\.Subscription s\b/.test(q));
        expect(selections).toHaveLength(1);
        expect(squash(selections[0])).toContain(COLUMN);
    });

    it('Spawn Renewals, subscriptions a person named (findSelected)', async () => {
        const { provider, sql } = recordingProvider();
        await (new SpawnRenewalsOperation() as unknown as Spawn).InternalExecute({ SubscriptionIDs: [ID_A], Preview: true }, provider, USER);
        const selections = sql.filter((q) => /FROM __mj_BizAppsOrders\.Subscription s\b/.test(q));
        expect(selections).toHaveLength(1);
        expect(squash(selections[0])).toContain(COLUMN);
    });

    it('Renewals page worklist (findSubjects), for the latest term', async () => {
        const { provider, sql } = recordingProvider();
        const op = new GetRenewalWorklistOperation() as unknown as {
            findSubjects(p: IMetadataProvider, asOf: string, from: string, to: string, companies: string[], top: number): Promise<unknown[]>;
        };
        await op.findSubjects(provider, '2026-11-13', '2026-10-14', '2027-02-11', [], 10);
        expect(sql).toHaveLength(1);
        expect(squash(sql[0])).toContain(`${LineFirstTermStartSql('l')} AS LatestLineFirstTermStart`);
    });
});
