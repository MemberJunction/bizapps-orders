/**
 * Client-transport entitlement read. Import from `client-index.ts` only —
 * the main barrel loads *Server subclasses that throw on GraphQLDataProvider.
 *
 * `op.Execute` here marshals `ExecuteRemoteOperation` over GraphQL. Sister of
 * `entitlement-read` (in-process ClassFactory). Confirms are COMMITTED (no
 * provider transaction on this transport); Notes = ER-WIRE:<runId>. Buyer is
 * Samira, not Jordan, so a committed grant cannot poison the rolled-back ER suite.
 */
import { BaseRemotableOperation } from '@memberjunction/core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import {
    ClientWorldState,
    ResolveClientWorld,
    type ClientWorld,
} from '../client-world.js';
import { ConfirmClientOrder } from '../client-order-builder.js';

interface CheckInput {
    PersonID?: string;
    Email?: string;
    Code: string;
    AsOf?: string;
}

interface CheckOutput {
    HasAccess: boolean;
    Decision: string;
    GrantID?: string;
    ValidTo?: string;
    EvaluatedAt: string;
    CacheUntil: string;
}

interface ListOutput {
    EvaluatedAt: string;
    Items: Array<{ Code: string; HasAccess: boolean; Decision: string }>;
}

class OrdersCheckEntitlementOperation extends BaseRemotableOperation<CheckInput, CheckOutput> {
    public readonly OperationKey = 'Orders.CheckEntitlement';
}

class OrdersListEntitlementsOperation extends BaseRemotableOperation<
    { PersonID?: string; Email?: string; IncludeInactive?: boolean },
    ListOutput
> {
    public readonly OperationKey = 'Orders.ListEntitlements';
}

const WIRE_EMAIL = 'samira.qureshi@example.com';

let runId = '';
let runPersonID = '';

async function execCheck(
    ctx: IntegrationCheckContext,
    input: CheckInput,
): Promise<{ envelopeSuccess: boolean; resultCode?: string; error?: string; output?: CheckOutput }> {
    const result = await new OrdersCheckEntitlementOperation().Execute(input, {
        provider: ctx.Provider,
        user: ctx.User,
    });
    return {
        envelopeSuccess: result.Success,
        resultCode: result.ResultCode,
        error: result.ErrorMessage,
        output: result.Output,
    };
}

async function mustCheck(ctx: IntegrationCheckContext, input: CheckInput): Promise<CheckOutput> {
    const r = await execCheck(ctx, input);
    Assert(
        r.envelopeSuccess,
        `CheckEntitlement over GraphQL failed: ${r.error ?? r.resultCode ?? 'unknown'}`,
    );
    Assert(r.output != null, 'CheckEntitlement returned no payload');
    return r.output!;
}

export const WireEntitlementChecks: NamedCheck[] = [
    {
        Id: 'wire-entitlements.WE1',
        Name: 'WE1 — confirm a person grant then CheckEntitlement over GraphQL is Granted',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const world = ClientWorldState();
            const productID = world.Products['STYLE-HB'];
            Assert(!!productID, 'STYLE-HB is in the resolved world');
            const personID = world.People[WIRE_EMAIL];
            Assert(!!personID, 'Samira Qureshi is in the resolved world');

            const sale = await ConfirmClientOrder(
                ctx.User,
                {
                    CompanyID: world.Companies.BCP,
                    Notes: `ER-WIRE:${runId}`,
                    Description: 'entitlement-read wire WE1',
                    BillToPersonID: personID,
                    Lines: [{ ProductID: productID, Quantity: 1 }],
                },
                ctx.Provider,
            );
            Assert(sale.Saved, `confirm over GraphQL failed: ${sale.Message}`);
            runPersonID = personID;

            const r = await mustCheck(ctx, { PersonID: personID, Code: 'WIDGET-SUPPORT' });
            AssertEqual(r.HasAccess, true, 'HasAccess over the wire');
            AssertEqual(r.Decision, 'Granted', 'Decision is Granted over the wire');
            Assert(!!r.GrantID, 'GrantID crossed the wire');
        },
    },
    {
        Id: 'wire-entitlements.WE2',
        Name: 'WE2 — unknown email is NoGrant over GraphQL (no existence leak)',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const r = await mustCheck(ctx, {
                Email: 'nobody-we2@example.invalid',
                Code: 'WIDGET-SUPPORT',
            });
            AssertEqual(r.HasAccess, false, 'no access');
            AssertEqual(r.Decision, 'NoGrant', 'NoGrant');
            Assert(r.GrantID == null, 'no GrantID');
        },
    },
    {
        Id: 'wire-entitlements.WE3',
        Name: 'WE3 — ListEntitlements over GraphQL includes the granted code',
        RequiresMutation: true,
        Fn: async (ctx) => {
            Assert(!!runPersonID, 'WE1 must have confirmed a person grant first');
            const result = await new OrdersListEntitlementsOperation().Execute(
                { PersonID: runPersonID },
                { provider: ctx.Provider, user: ctx.User },
            );
            Assert(
                result.Success,
                `ListEntitlements over GraphQL failed: ${result.ErrorMessage ?? result.ResultCode}`,
            );
            Assert(result.Output != null, 'ListEntitlements returned no payload');
            const codes = result.Output.Items.filter((i) => i.HasAccess).map((i) => i.Code);
            Assert(codes.includes('WIDGET-SUPPORT'), `library includes WIDGET-SUPPORT, got ${codes.join(',')}`);
        },
    },
    {
        Id: 'wire-entitlements.WE4',
        Name: 'WE4 — a code the person does not hold is NoGrant over GraphQL',
        RequiresMutation: true,
        Fn: async (ctx) => {
            Assert(!!runPersonID, 'WE1 must have confirmed first');
            const r = await mustCheck(ctx, { PersonID: runPersonID, Code: 'NO_SUCH_CAPABILITY' });
            AssertEqual(r.HasAccess, false, 'unknown code is not access');
            AssertEqual(r.Decision, 'NoGrant', 'NoGrant');
        },
    },
    {
        Id: 'wire-entitlements.WE5',
        Name: 'WE5 — a far-future AsOf is an envelope failure over GraphQL',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const world = ClientWorldState();
            const personID = world.People[WIRE_EMAIL];
            const r = await execCheck(ctx, {
                PersonID: personID,
                Code: 'WIDGET-SUPPORT',
                AsOf: '2030-01-01T00:00:00.000Z',
            });
            AssertEqual(r.envelopeSuccess, false, 'future AsOf is a caller bug, not HasAccess:false');
        },
    },
];

for (const c of WireEntitlementChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('wire-entitlements', {
    Setup: async (ctx) => {
        await ResolveClientWorld(ctx);
        runId = `${Date.now().toString(36)}`;
        runPersonID = '';
        const world: ClientWorld = ClientWorldState();
        Assert(!!world.Companies.BCP, 'BCP company resolved');
    },
    Teardown: async () => {
        runPersonID = '';
    },
});
