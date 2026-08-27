/**
 * entitlement-read — the LXP ask/answer, against a real provider (not mocked RunView).
 *
 * EN1–EN15 prove grants are *written*. These prove `Orders.CheckEntitlement` /
 * `Orders.ListEntitlements` *evaluate* them: object call via ClassFactory + Execute
 * (in-process, same as any server caller). GraphQL/API coverage is the sister
 * `wire-entitlements` bundle (client-index only).
 *
 *   ER1  after confirm, Check by PersonID and by Email is Granted
 *   ER2  unknown person and unknown email share the NoGrant shape
 *   ER3  org-only grants are invisible to a person check (v1)
 *   ER4  elapsed ValidTo is Expired even though stored Status is still Active
 *   ER5  an elapsed subscription term is Expired at Check, not a poll of Active
 *   ER6  ListEntitlements is the library; IncludeInactive=false drops expired codes
 *   ER7  a missing Code is an envelope failure, not a silent NoGrant
 */
import { BaseRemotableOperation } from '@memberjunction/core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { MJGlobal } from '@memberjunction/global';
import {
    CreateOrdersFixture,
    CreateProductPrice,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';

interface CheckEntitlementInput {
    PersonID?: string | null;
    Email?: string | null;
    Code: string;
    AsOf?: string;
}

interface CheckEntitlementOutput {
    HasAccess: boolean;
    Decision: string;
    GrantID?: string;
    ValidFrom?: string;
    ValidTo?: string;
    EvaluatedAt: string;
    CacheUntil: string;
}

interface ListEntitlementsInput {
    PersonID?: string | null;
    Email?: string | null;
    IncludeInactive?: boolean;
}

interface ListEntitlementsOutput {
    EvaluatedAt: string;
    Items: Array<{ Code: string; HasAccess: boolean; Decision: string; GrantID?: string }>;
}

async function check(
    ctx: IntegrationCheckContext,
    input: CheckEntitlementInput,
): Promise<{ envelopeSuccess: boolean; resultCode?: string; output?: CheckEntitlementOutput }> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<CheckEntitlementInput, CheckEntitlementOutput>
    >(BaseRemotableOperation, 'Orders.CheckEntitlement');
    Assert(op != null, "'Orders.CheckEntitlement' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    return {
        envelopeSuccess: result.Success,
        resultCode: result.ResultCode,
        output: result.Output,
    };
}

async function mustCheck(
    ctx: IntegrationCheckContext,
    input: CheckEntitlementInput,
): Promise<CheckEntitlementOutput> {
    const r = await check(ctx, input);
    Assert(r.envelopeSuccess, `CheckEntitlement did not execute: ${r.resultCode ?? 'unknown'}`);
    Assert(r.output != null, 'CheckEntitlement returned no payload');
    return r.output!;
}

async function listEntitlements(
    ctx: IntegrationCheckContext,
    input: ListEntitlementsInput,
): Promise<ListEntitlementsOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<ListEntitlementsInput, ListEntitlementsOutput>
    >(BaseRemotableOperation, 'Orders.ListEntitlements');
    Assert(op != null, "'Orders.ListEntitlements' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `ListEntitlements did not execute: ${result.ResultCode ?? 'unknown'}`);
    Assert(result.Output != null, 'ListEntitlements returned no payload');
    return result.Output!;
}

async function grantsForOrder(
    ctx: IntegrationCheckContext,
    orderID: string,
): Promise<Array<{ ID: string; Code: string; Status: string }>> {
    return TxQuery(
        ctx,
        `SELECT g.ID, pe.Code, g.Status
           FROM ${ORDERS_SCHEMA}.EntitlementGrant g
           JOIN ${ORDERS_SCHEMA}.ProductEntitlement pe ON pe.ID = g.ProductEntitlementID
           JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = g.OrderLineID
          WHERE ol.OrderHeaderID = '${orderID}'`,
    );
}

/** Close the window without touching Status — that is the no-sweeper case the evaluator exists for. */
async function elapseGrant(ctx: IntegrationCheckContext, grantID: string): Promise<void> {
    await TxQuery(
        ctx,
        `UPDATE ${ORDERS_SCHEMA}.EntitlementGrant
            SET ValidFrom = '2024-01-01T00:00:00.000Z',
                ValidTo   = '2024-04-01T00:00:00.000Z'
          WHERE ID = '${grantID}'`,
    );
}

const PERSON_EMAIL = 'jordan.blake@example.com';

export const EntitlementReadChecks: NamedCheck[] = [
    {
        Id: 'entitlement-read.ER1',
        Name: 'ER1: after confirm, Check by PersonID and Email is Granted',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.WidgetA, 100);
                const order = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToPersonID: f.Customers.PersonID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
                });
                Assert(order.Saved, `confirm failed: ${order.Message}`);

                const byId = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'WIDGET-SUPPORT',
                });
                AssertEqual(byId.HasAccess, true, 'PersonID check is Granted');
                AssertEqual(byId.Decision, 'Granted', 'Decision is Granted');
                Assert(byId.GrantID != null && byId.GrantID.length > 0, 'GrantID is an audit handle');

                const byEmail = await mustCheck(ctx, { Email: PERSON_EMAIL, Code: 'WIDGET-SUPPORT' });
                AssertEqual(byEmail.HasAccess, true, 'email convenience resolves the same person');
                AssertEqual(byEmail.Decision, 'Granted', 'email check is Granted');
                AssertEqual(byEmail.GrantID, byId.GrantID, 'same winning grant');
            }),
    },
    {
        Id: 'entitlement-read.ER2',
        Name: 'ER2: unknown person and unknown email share the NoGrant shape',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const unknownPerson = await mustCheck(ctx, {
                    PersonID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                    Code: 'WIDGET-SUPPORT',
                });
                const unknownEmail = await mustCheck(ctx, {
                    Email: 'nobody-er2@example.invalid',
                    Code: 'WIDGET-SUPPORT',
                });
                for (const r of [unknownPerson, unknownEmail]) {
                    AssertEqual(r.HasAccess, false, 'no access');
                    AssertEqual(r.Decision, 'NoGrant', 'NoGrant — no existence leak');
                    Assert(r.GrantID == null, 'no GrantID');
                }
            }),
    },
    {
        Id: 'entitlement-read.ER3',
        Name: 'ER3: an org-only grant is invisible to a person Check (v1)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.WidgetA, 100);
                const order = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
                });
                Assert(order.Saved, `confirm failed: ${order.Message}`);

                const r = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'WIDGET-SUPPORT',
                });
                AssertEqual(r.HasAccess, false, 'v1 does not inherit org grants');
                AssertEqual(r.Decision, 'NoGrant', 'org-only looks like no grant');
            }),
    },
    {
        Id: 'entitlement-read.ER4',
        Name: 'ER4: elapsed ValidTo is Expired even though stored Status is still Active',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.WidgetA, 100);
                const sale = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToPersonID: f.Customers.PersonID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
                });
                Assert(sale.Saved, `sale failed: ${sale.Message}`);

                const grants = await grantsForOrder(ctx, sale.Order.ID as string);
                const forum = grants.find((g) => g.Code === 'WIDGET-FORUM');
                Assert(forum != null, 'WidgetA wrote the 90-day forum grant');
                AssertEqual(forum!.Status, 'Active', 'stored Status is still Active — nothing swept it');

                await elapseGrant(ctx, forum!.ID);

                const after = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'WIDGET-FORUM',
                });
                AssertEqual(after.HasAccess, false, 'window closed — no access');
                AssertEqual(after.Decision, 'Expired', 'evaluator, not a poll of Status');

                const still = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'WIDGET-SUPPORT',
                });
                AssertEqual(still.Decision, 'Granted', 'the perpetual sibling is unaffected');
            }),
    },
    {
        Id: 'entitlement-read.ER5',
        Name: 'ER5: an elapsed subscription term is Expired at Check, not a poll of Active',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const sale = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    BillToPersonID: f.Customers.PersonID,
                    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
                });
                Assert(sale.Saved, `confirm failed: ${sale.Message}`);

                const before = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'SUB-SEATS',
                });
                AssertEqual(before.Decision, 'Granted', 'had access on the current term');

                const grants = await grantsForOrder(ctx, sale.Order.ID as string);
                const seats = grants.find((g) => g.Code === 'SUB-SEATS');
                Assert(seats != null, 'SubRolling wrote the seat grant');
                AssertEqual(seats!.Status, 'Active', 'stored Status is still Active');

                await elapseGrant(ctx, seats!.ID);

                const after = await mustCheck(ctx, {
                    PersonID: f.Customers.PersonID,
                    Code: 'SUB-SEATS',
                });
                AssertEqual(after.HasAccess, false, 'term window closed — no access');
                AssertEqual(
                    after.Decision,
                    'Expired',
                    'elapsed ValidTo is Expired even though Status is still Active',
                );
            }),
    },
    {
        Id: 'entitlement-read.ER6',
        Name: 'ER6: ListEntitlements is the library; IncludeInactive=false drops expired codes',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.WidgetA, 100);
                const sale = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToPersonID: f.Customers.PersonID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
                });
                Assert(sale.Saved, `sale failed: ${sale.Message}`);

                const library = await listEntitlements(ctx, { PersonID: f.Customers.PersonID });
                const byCode = new Map(library.Items.map((i) => [i.Code, i]));
                Assert(byCode.has('WIDGET-SUPPORT') && byCode.has('WIDGET-FORUM'), 'library has both WidgetA codes');
                AssertEqual(byCode.get('WIDGET-SUPPORT')!.Decision, 'Granted', 'support is in force');
                AssertEqual(byCode.get('WIDGET-FORUM')!.Decision, 'Granted', 'forum is in force');

                const grants = await grantsForOrder(ctx, sale.Order.ID as string);
                const forum = grants.find((g) => g.Code === 'WIDGET-FORUM');
                Assert(forum != null, 'forum grant exists to elapse');
                await elapseGrant(ctx, forum!.ID);

                const withInactive = await listEntitlements(ctx, { PersonID: f.Customers.PersonID });
                const expired = withInactive.Items.find((i) => i.Code === 'WIDGET-FORUM');
                Assert(expired != null, 'default list still names the expired code');
                AssertEqual(expired!.HasAccess, false, 'forum has no access');
                AssertEqual(expired!.Decision, 'Expired', 'Decision is Expired');

                const activeOnly = await listEntitlements(ctx, {
                    PersonID: f.Customers.PersonID,
                    IncludeInactive: false,
                });
                Assert(
                    !activeOnly.Items.some((i) => i.Code === 'WIDGET-FORUM'),
                    'IncludeInactive=false drops the expired code',
                );
                Assert(
                    activeOnly.Items.some((i) => i.Code === 'WIDGET-SUPPORT' && i.HasAccess),
                    'the perpetual sibling remains',
                );
            }),
    },
    {
        Id: 'entitlement-read.ER7',
        Name: 'ER7: a missing Code is an envelope failure, not a silent NoGrant',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const r = await check(ctx, { PersonID: f.Customers.PersonID, Code: '' });
                AssertEqual(r.envelopeSuccess, false, 'caller bug is loud');
                Assert(r.output == null, 'no payload on a boundary failure');
            }),
    },
];

for (const c of EntitlementReadChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entitlement-read', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
