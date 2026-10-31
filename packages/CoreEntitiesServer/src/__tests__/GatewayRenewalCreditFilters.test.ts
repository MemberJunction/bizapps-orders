/**
 * GatewayRenewalCreditFor against an in-memory store whose RunView EVALUATES the ExtraFilter it is given (#989 review).
 *
 * GatewayRenewalCredit.test.ts's fake RunView answers by entity name and ignores most of the filter, so it cannot see a
 * read that pools rows it should not: the round-3 bug (every renewal's reversals read with `ReversesOrderLineID IS NOT
 * NULL`, and the FIRST PaymentSucceeded taken instead of the last) left all of its tests green. Here each read returns
 * only the rows its filter matches, with two renewal terms side by side, so a pooled read credits the wrong term.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({ tables: new Map<string, Row[]>(), filters: [] as string[] }));

/** The clause shapes this module's reads use, joined by AND: `Col='v'`, `Col = 'v'`, `Col IS [NOT] NULL`. */
function matches(row: Row, filter: string): boolean {
    return filter
        .split(/\s+AND\s+/i)
        .map((c) => c.trim())
        .filter(Boolean)
        .every((clause) => {
            const eq = /^(\w+)\s*=\s*'([^']*)'$/.exec(clause);
            if (eq) return String(row[eq[1]] ?? '').toLowerCase() === eq[2].toLowerCase();
            const nul = /^(\w+)\s+IS\s+(NOT\s+)?NULL$/i.exec(clause);
            if (nul) return nul[2] ? row[nul[1]] != null : row[nul[1]] == null;
            throw new Error(`the fake store cannot evaluate: ${clause}`);
        });
}

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => undefined,
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string }) {
                const name = p.EntityName.replace(/^.*: /, '');
                store.filters.push(`${name}: ${p.ExtraFilter ?? ''}`);
                const rows = store.tables.get(name) ?? [];
                return { Success: true, Results: rows.filter((r) => matches(r, p.ExtraFilter ?? '')).map((r) => ({ ...r })) };
            }
        },
    };
});

import type { BasePaymentProvider } from '../BasePaymentProvider.js';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GatewayRenewalCreditFor } from '../GatewayRenewalCredit.js';

const SUB = '44444444-0000-4000-8000-0000000000b1';
const L2 = '44444444-0000-4000-8000-000000000002';
const L3 = '44444444-0000-4000-8000-000000000003';
const O2 = '44444444-0000-4000-8000-0000000000a2';
const O3 = '44444444-0000-4000-8000-0000000000a3';
const T2 = '44444444-0000-4000-8000-0000000000c2';
const T3 = '44444444-0000-4000-8000-0000000000c3';

const refundedByCharge = new Map<string, number>();
const driver = {
    RetrieveCharge: async ({ ProviderChargeID }: { ProviderChargeID: string }) => ({
        Success: true,
        Charge: { AmountRefunded: refundedByCharge.get(ProviderChargeID) ?? 0 },
    }),
} as unknown as BasePaymentProvider;
const provider = {} as IMetadataProvider;
const user = {} as UserInfo;
const event = (order: string, ChargeID: string, AmountPaid = 599) => ({
    RelatedOrderHeaderID: order,
    EventType: 'PaymentSucceeded',
    EventData: JSON.stringify({ Source: 'Gateway', ChargeID, AmountPaid, Tax: 0 }),
});

beforeEach(() => {
    store.filters = [];
    refundedByCharge.clear();
    // Terms 2 and 3 of one subscription, each a gateway renewal with its own order, charge and line.
    store.tables = new Map<string, Row[]>([
        [
            'Order Lines',
            [
                { ID: L2, OrderHeaderID: O2, RenewsSubscriptionID: SUB, ReversesOrderLineID: null, LineTotalNet: 599 },
                { ID: L3, OrderHeaderID: O3, RenewsSubscriptionID: SUB, ReversesOrderLineID: null, LineTotalNet: 599 },
            ],
        ],
        [
            'Order Headers',
            [
                { ID: O2, OrderNumber: 'ORD-T2', Origin: 'ProviderPayment' },
                { ID: O3, OrderNumber: 'ORD-T3', Origin: 'ProviderPayment' },
            ],
        ],
        ['Subscription Events', [event(O2, 'ch_t2'), event(O3, 'ch_t3')]],
        [
            'Subscription Terms',
            [
                { ID: T2, OrderLineID: L2 },
                { ID: T3, OrderLineID: L3 },
            ],
        ],
        ['Order Concessions', []],
    ]);
});

describe('GatewayRenewalCreditFor reads only its OWN term (filters evaluated)', () => {
    it("term 2 already credited 599 (its own reversal); term 3's charge refunded 200: term 3 owes 200 back, not 0 — never pooled", async () => {
        store.tables.get('Order Lines')!.push({ ID: 'rev-2', OrderHeaderID: 'cr-2', ReversesOrderLineID: L2, LineTotalNet: -599 });
        refundedByCharge.set('ch_t2', 599).set('ch_t3', 200);
        const t3 = await GatewayRenewalCreditFor(L3, driver, provider, user);
        expect(t3).toMatchObject({ OrderID: O3, ChargeID: 'ch_t3', Paid: 599, Refunded: 200, Credited: 0, Outstanding: 200 });
        const t2 = await GatewayRenewalCreditFor(L2, driver, provider, user);
        expect(t2).toMatchObject({ OrderID: O2, ChargeID: 'ch_t2', Refunded: 599, Credited: 599, Outstanding: 0 });
        // The reversal read names its own line.
        expect(store.filters).toContain(`Order Lines: ReversesOrderLineID='${L3}'`);
    });
    it("each term reads the charge of ITS OWN renewal order: term 3's refund is ch_t3's, never term 2's", async () => {
        refundedByCharge.set('ch_t2', 599);
        expect(await GatewayRenewalCreditFor(L3, driver, provider, user)).toMatchObject({ ChargeID: 'ch_t3', Refunded: 0, Outstanding: 0 });
    });
    it('an order with two gateway PaymentSucceeded events reads the LAST (the charge that paid it), not the first', async () => {
        store.tables.get('Subscription Events')!.splice(1, 1, event(O3, 'ch_t3_failed_capture'), event(O3, 'ch_t3'));
        refundedByCharge.set('ch_t3_failed_capture', 0).set('ch_t3', 599);
        expect(await GatewayRenewalCreditFor(L3, driver, provider, user)).toMatchObject({ ChargeID: 'ch_t3', Refunded: 599, Outstanding: 599 });
    });
    it("a credit memo (approved price concession) on term 2 counts only for term 2", async () => {
        store.tables.set('Order Concessions', [
            { SubscriptionTermID: T2, Status: 'Approved', DeliveryForm: 'Price', NewAmount: 399, CreditMemoAmount: 200, ScheduleReduction: 0 },
        ]);
        refundedByCharge.set('ch_t2', 200).set('ch_t3', 200);
        expect(await GatewayRenewalCreditFor(L2, driver, provider, user)).toMatchObject({ Credited: 200, Outstanding: 0 });
        expect(await GatewayRenewalCreditFor(L3, driver, provider, user)).toMatchObject({ Credited: 0, Outstanding: 200 });
    });
});
