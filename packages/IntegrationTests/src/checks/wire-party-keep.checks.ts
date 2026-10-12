/**
 * Client-transport checks for the kept party organization (#542). Import from `client-index.ts`
 * only — the main barrel loads *Server subclasses that throw on GraphQLDataProvider.
 *
 * A server save that replaces an order's bill-to person clears the organization when it is the
 * previous person's employer, so the new person's employer can be stamped. A writer that means to
 * keep it calls `OrderHeaderEntity.KeepPartyOrganization`, which reaches the server only as the
 * `KeptPartyOrganizations` companion in the save payload. `OrderHeaderPartyClear.test.ts` drives
 * the entity in one process; these save through MJAPI, so KP1 fails if the companion does not
 * cross the wire, and KP2 is its control (the same save without the keep).
 *
 * Each order is a Draft loaded fresh before the replacement, so the server sees the saved person
 * as the previous one. Saves are COMMITTED (no transaction on this transport); Notes =
 * KP-WIRE:<runId>, and each check deletes its order.
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import { UUIDsEqual } from '@memberjunction/global';
import { type OrderHeaderEntity, TodayAsDateValue } from '@mj-biz-apps/orders-entities';
import { ClientWorldState, ResolveClientWorld } from '../client-world.js';
import { ORDER_HEADER_ENTITY } from '../entity-names.js';

/** Riverside employee: the bill-to person the order starts with. */
const PERSON_A = 'nora.calhoun@riverside.org';
/** Summit employee: the replacement. */
const PERSON_B = 'helen.cho@summit.edu';

let runId = '';

async function loadOrder(ctx: IntegrationCheckContext, id: string): Promise<OrderHeaderEntity> {
    const order = await ctx.Provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    Assert(await order.Load(id), `load order ${id}`);
    return order;
}

/**
 * A Draft billed to person A with A's employer, saved over the wire. The organization is set here
 * rather than left to the server's employer stamp, which does not fire on a new record.
 */
async function draftForA(ctx: IntegrationCheckContext, label: string): Promise<OrderHeaderEntity> {
    const world = ClientWorldState();
    const order = await ctx.Provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    order.NewRecord();
    order.OrderType = 'Sale';
    order.OrderDate = TodayAsDateValue();
    order.Status = 'Draft';
    order.CompanyID = world.Companies.BCP;
    order.Notes = `KP-WIRE:${runId}:${label}`;
    order.BillToPersonID = world.People[PERSON_A];
    order.BillToOrganizationID = world.Organizations.RIV;
    Assert(await order.Save(), `draft save: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return loadOrder(ctx, order.ID);
}

/** Replace the bill-to person with B on a freshly loaded copy, optionally keeping the organization. */
async function replaceWithB(ctx: IntegrationCheckContext, id: string, keep: boolean): Promise<OrderHeaderEntity> {
    const order = await loadOrder(ctx, id);
    order.BillToPersonID = ClientWorldState().People[PERSON_B];
    if (keep) order.KeepPartyOrganization('BillToOrganizationID');
    Assert(await order.Save(), `replacement save: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return loadOrder(ctx, id);
}

async function removeOrder(order: OrderHeaderEntity | null): Promise<void> {
    if (!order) return;
    try {
        await order.Delete();
    } catch {
        // Left behind under its KP-WIRE Notes tag; the assertion result is what matters.
    }
}

const checks: NamedCheck[] = [
    {
        Id: 'wire-party-keep.KP1',
        Name: "KP1 — replacing the bill-to person with KeepPartyOrganization keeps the previous person's employer",
        RequiresMutation: true,
        Fn: async (ctx) => {
            const world = ClientWorldState();
            let order: OrderHeaderEntity | null = null;
            try {
                order = await draftForA(ctx, 'KP1');
                Assert(UUIDsEqual(order.BillToOrganizationID, world.Organizations.RIV), 'precondition: A\'s employer saved');
                order = await replaceWithB(ctx, order.ID, true);
                Assert(UUIDsEqual(order.BillToPersonID, world.People[PERSON_B]), 'bill-to person is B');
                Assert(
                    UUIDsEqual(order.BillToOrganizationID, world.Organizations.RIV),
                    `kept organization survives the replacement (got ${order.BillToOrganizationID ?? 'null'}); ` +
                        'the KeptPartyOrganizations companion did not reach the server save',
                );
            } finally {
                await removeOrder(order);
            }
        },
    },
    {
        Id: 'wire-party-keep.KP2',
        Name: "KP2 — replacing the bill-to person without a keep swaps in the new person's employer",
        RequiresMutation: true,
        Fn: async (ctx) => {
            const world = ClientWorldState();
            let order: OrderHeaderEntity | null = null;
            try {
                order = await draftForA(ctx, 'KP2');
                Assert(UUIDsEqual(order.BillToOrganizationID, world.Organizations.RIV), 'precondition: A\'s employer saved');
                order = await replaceWithB(ctx, order.ID, false);
                Assert(
                    UUIDsEqual(order.BillToOrganizationID, world.Organizations.SUM),
                    `bill-to organization is B's employer (got ${order.BillToOrganizationID ?? 'null'})`,
                );
            } finally {
                await removeOrder(order);
            }
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('wire-party-keep', {
    Setup: async (ctx) => {
        const world = await ResolveClientWorld(ctx);
        runId = Date.now().toString(36);
        Assert(!!world.Companies.BCP, 'BCP company resolved');
        Assert(!!world.People[PERSON_A] && !!world.People[PERSON_B], 'ORD-WORLD people resolved');
        Assert(!!world.Organizations.RIV && !!world.Organizations.SUM, 'ORD-WORLD organizations resolved');
    },
    Teardown: async () => {},
});
