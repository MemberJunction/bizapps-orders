/**
 * SeatAddition — an approved Seats concession adds its seats to the term the line bought (#686).
 *
 * A Seats concession gives quantity at no charge. Before this it was valued and acknowledged, but
 * `SubscriptionTerm.Quantity` kept the seats bought, so grants and renewals ignored the added ones.
 * Approved, the added seats now count from that moment: the term's seat count rises, the term's
 * `PerUnit` grants follow it, and the renewal, which buys the expiring term's seats, bills them at the
 * full price.
 *
 * WHEN THE TERM DOES NOT EXIST YET. A concession on a draft order's line has no term to raise. Confirm
 * counts the line's approved Seats concessions with the seats bought when it creates the term
 * (`OrderEntityServer.decideSubscriptions`), so the seats arrive either way, once.
 *
 * A LINE THAT BOUGHT NO TERM (a product that is not a subscription) keeps the old behavior: the
 * concession is recorded and valued, and nothing else changes.
 *
 * CONNECTS TO:
 *   CALLER: ./OrderConcessionEntityServer.ts (check when recorded, apply on approval)
 *   GRANTS: ./EntitlementEngine.ts (ResizeTermGrants)
 *   CHECK:  ./TermExtension.ts (RenewalAlreadyPlaced — a placed renewal was priced from the old count)
 */
import type { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ResizeTermGrants } from './EntitlementEngine.js';
import { RequireUUID } from './sql-guards.js';
import { ReadRows, RenewalAlreadyPlaced } from './TermExtension.js';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';

export interface SeatAdditionRequest {
    OrderLineID: string;
    AddedQuantity: number;
}

interface TermRow {
    ID: string;
    SubscriptionID: string;
    TermNumber: number;
    OrderLineID: string;
    Status: string;
    Quantity: number;
}

/** The term the line bought, or null when it bought none (not confirmed yet, or not a subscription). */
async function termForLine(orderLineID: string, ctx: ApprovalTaskContext): Promise<TermRow | null> {
    const rows = await ReadRows<TermRow>(ctx, {
        EntityName: SUBSCRIPTION_TERM_ENTITY,
        ExtraFilter: `OrderLineID = '${RequireUUID(orderLineID, 'OrderLineID')}'`,
        Fields: ['ID', 'SubscriptionID', 'TermNumber', 'OrderLineID', 'Status', 'Quantity'],
        ResultType: 'simple',
    });
    return rows[0] ?? null;
}

/**
 * Whether the seats can be added, checked when the concession is recorded. Null when they can,
 * including when the line has no term yet; otherwise why not.
 */
export async function CheckSeatAddition(request: SeatAdditionRequest, ctx: ApprovalTaskContext): Promise<string | null> {
    const term = await termForLine(request.OrderLineID, ctx);
    if (!term) return null;
    if (term.Status !== 'Scheduled' && term.Status !== 'Active') {
        return `Term ${term.TermNumber} is ${term.Status}; seats can be added only to a Scheduled or Active term.`;
    }
    return RenewalAlreadyPlaced(term, ctx);
}

/**
 * Add the seats to the line's term and resize its grants, in the approval's transaction. Returns the
 * term's new seat count, or null when the line has no term to raise.
 */
export async function ApplySeatAddition(request: SeatAdditionRequest, ctx: ApprovalTaskContext): Promise<number | null> {
    const added = Number(request.AddedQuantity);
    if (!Number.isInteger(added) || added <= 0) throw new Error('Enter a whole number of seats greater than zero.');

    const row = await termForLine(request.OrderLineID, ctx);
    if (!row) return null;
    const problem = await CheckSeatAddition(request, ctx);
    if (problem) throw new Error(`The seats cannot be added: ${problem}`);

    const term = await ctx.Provider.GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
    if (!(await term.Load(row.ID))) throw new Error(`Subscription term ${row.ID} was not found.`);
    const seats = Number(term.Quantity) + added;
    term.Quantity = seats;
    if (!(await term.Save())) {
        throw new Error(`The added seats could not be saved on term ${row.TermNumber}: ${term.LatestResult?.CompleteMessage}`);
    }

    const subscription = (
        await ReadRows<{ ProductID: string }>(ctx, {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(row.SubscriptionID, 'SubscriptionID')}'`,
            Fields: ['ProductID'],
            ResultType: 'simple',
        })
    )[0];
    if (!subscription) throw new Error(`The subscription of term ${row.TermNumber} was not found.`);
    await ResizeTermGrants(row.ID, subscription.ProductID, seats, ctx.Provider, ctx.User);
    return seats;
}
