/**
 * bc-aidp-next-golive#454 — cancelling a subscription, refunding a payment, moving an account credit
 * and lowering an agreed amount are finance's. Each operation refuses a caller without
 * MJ.BizApps.Orders.Order.Reverse before it reads or writes anything, and lets a record of something
 * the payment gateway already did through. No database: the provider below holds only the
 * authorization catalog, so any read past the gate would throw.
 */
import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ORDER_REVERSE_AUTH } from '@mj-biz-apps/orders-entities';
import { ReversalGate, WithGatewayRecord } from '../ReversalAuthority.js';
import { CancelSubscriptionOperation, WithGatewayEndRecorded } from '../CancelSubscriptionOperation.js';
import { RefundPaymentOperation } from '../RefundPaymentOperation.js';
import { ApplyAccountCreditOperation } from '../ApplyAccountCreditOperation.js';
import { AmendArrangementOperation } from '../AmendArrangementOperation.js';
import { OrderConcessionEntityServer } from '../OrderConcessionEntityServer.js';

const FINANCE_ROLE = 'F0000000-0000-0000-0000-000000000001';
const AD_ROLE = 'A0000000-0000-0000-0000-000000000001';
const ID = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';
const OTHER_ID = '7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';

const userWith = (roleID: string) => ({ ID: 'u1', UserRoles: [{ RoleID: roleID }] }) as unknown as UserInfo;
const finance = userWith(FINANCE_ROLE);
const accountDirector = userWith(AD_ROLE);

/** The grant, held by the Finance role only. */
const reverseAuth = {
    ID: 'R0000000-0000-0000-0000-000000000001',
    Name: ORDER_REVERSE_AUTH,
    ParentID: null,
    UserCanExecute: (u: UserInfo) => (u.UserRoles ?? []).some((r) => r.RoleID === FINANCE_ROLE),
};

/** A provider that has the catalog and nothing else: any read past the gate fails the test. */
function catalogOnly(installed = true): IMetadataProvider {
    return new Proxy({ Authorizations: installed ? [reverseAuth] : [] } as Record<string, unknown>, {
        get(target, key) {
            if (key in target || key === 'then') return target[key as string];
            throw new Error(`read past the gate: provider.${String(key)}`);
        },
    }) as unknown as IMetadataProvider;
}

type Run = (provider: IMetadataProvider, user: UserInfo) => Promise<{ Success: boolean; Message?: string }>;
const exec = (op: object, input: unknown): Run => (provider, user) =>
    (op as { InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }> }).InternalExecute(input, provider, user);

const OPERATIONS: Array<[string, RegExp, Run]> = [
    ['Orders.CancelSubscription', /^Cancelling a subscription needs/, exec(new CancelSubscriptionOperation(), { SubscriptionID: ID })],
    ['Orders.RefundPayment', /^Refunding a payment needs/, exec(new RefundPaymentOperation(), { PaymentHeaderID: ID, Amount: 10 })],
    ['Orders.ApplyAccountCredit', /^Moving an account credit to another order needs/, exec(new ApplyAccountCreditOperation(), { SourceOrderHeaderID: ID, TargetOrderHeaderID: OTHER_ID, Amount: 10 })],
    [
        'Orders.AmendArrangement (a change of amount)',
        /^Changing an agreed amount needs/,
        exec(new AmendArrangementOperation(), { SubscriptionTermID: ID, NewAmount: 50, ReasonCategory: 'Other', Reason: 'Early termination' }),
    ],
];

describe('the finance reversal gate', () => {
    it('refuses a user without the grant and lets a finance user through', () => {
        expect(ReversalGate('Refunding a payment', catalogOnly(), accountDirector)).toMatch(/Finance role/);
        expect(ReversalGate('Refunding a payment', catalogOnly(), finance)).toBeNull();
    });

    it('fails closed when the authorization is not installed', () => {
        expect(ReversalGate('Refunding a payment', catalogOnly(false), finance)).toMatch(/is not installed/);
    });

    it('lets a record of what the gateway already did through, for whoever started it', async () => {
        expect(await WithGatewayRecord(async () => ReversalGate('Refunding a payment', catalogOnly(), accountDirector))).toBeNull();
        expect(await WithGatewayEndRecorded(async () => ReversalGate('Cancelling a subscription', catalogOnly(), accountDirector))).toBeNull();
        // The scope ends with the call.
        expect(ReversalGate('Refunding a payment', catalogOnly(), accountDirector)).not.toBeNull();
    });

    describe.each(OPERATIONS)('%s', (_name, message, run) => {
        it('refuses an account director before reading anything', async () => {
            const out = await run(catalogOnly(), accountDirector);
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(message);
            expect(out.Message).toContain(ORDER_REVERSE_AUTH);
        });

        it('refuses everyone while the authorization is not installed', async () => {
            const out = await run(catalogOnly(false), finance);
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/is not installed/);
        });

        it('lets a finance user past the gate (the next step reads the provider)', async () => {
            const past = await run(catalogOnly(), finance).then(
                (out) => out.Message ?? '',
                (e: Error) => e.message,
            );
            expect(past).toMatch(/read past the gate/);
        });
    });
});

/**
 * #1060: the same amount change saved straight onto an Order Concession (the generated form, or the
 * API) is refused at recording, before the row is valued or anything is read.
 */
describe('a direct Order Concession save that lowers an agreed amount', () => {
    function recordAs(user: UserInfo, provider: IMetadataProvider, newAmount: number | null = 50) {
        const row = Object.create(OrderConcessionEntityServer.prototype) as Record<string, unknown>;
        // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
        Object.defineProperty(row, 'DeliveryForm', { value: 'Price' });
        Object.defineProperty(row, 'NewAmount', { value: newAmount });
        Object.defineProperty(row, 'Reason', { value: 'Early termination' });
        Object.defineProperty(row, 'ContextCurrentUser', { value: user });
        Object.defineProperty(row, 'ProviderToUse', { value: provider });
        return (row as unknown as { prepareNew(): Promise<string | null> }).prepareNew();
    }
    // Past the gate, recording goes on to value the row, which this bare instance cannot do; what it
    // fails on there is not the gate's refusal.
    const GATE_REFUSAL = /Changing an agreed amount needs|is not installed/;

    it('refuses an account director before reading anything', async () => {
        const refusal = await recordAs(accountDirector, catalogOnly());
        expect(refusal).toMatch(/^Changing an agreed amount needs/);
        expect(refusal).toContain(ORDER_REVERSE_AUTH);
    });

    it('refuses everyone while the authorization is not installed', async () => {
        expect(await recordAs(finance, catalogOnly(false))).toMatch(/is not installed/);
    });

    it('lets a finance user past the gate', async () => {
        const past = await recordAs(finance, catalogOnly()).then(
            (out) => out ?? '',
            (e: Error) => e.message,
        );
        expect(past).not.toMatch(GATE_REFUSAL);
    });

    it('lets a record of what the gateway already did through', async () => {
        const past = await WithGatewayRecord(() => recordAs(accountDirector, catalogOnly())).then(
            (out) => out ?? '',
            (e: Error) => e.message,
        );
        expect(past).not.toMatch(GATE_REFUSAL);
    });

    it('leaves a price concession on a draft line (no NewAmount) to its own approval routing', async () => {
        const past = await recordAs(accountDirector, catalogOnly(), null).then(
            (out) => out ?? '',
            (e: Error) => e.message,
        );
        expect(past).not.toMatch(GATE_REFUSAL);
    });
});
