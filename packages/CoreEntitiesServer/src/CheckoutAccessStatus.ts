/**
 * @fileoverview Whether a completed checkout's access is ready (#325).
 *
 * Access can be provisioned after the confirm: a downstream system told by an outbound consumer
 * (#293) grants it when the event reaches it. Consumers that decide whether the buyer's access is
 * ready declare `GatesAccess`, and their delivery rows carry the flag. This reads those rows for the
 * checkout's order and reduces them to one state the success screen can show:
 *   - `Ready`      — every gating delivery was accepted;
 *   - `Pending`    — at least one is still being tried;
 *   - `Failed`     — at least one was dead-lettered, so access will not arrive on its own;
 *   - `NotTracked` — no consumer gates access for this order, so there is nothing to wait for.
 */
import { LogError, Metadata, RunView, UserInfo, type IRunViewProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersCheckoutSessionEntity } from '@mj-biz-apps/orders-entities';
import { OUTBOUND_DELIVERY_ENTITY } from './OutboundEvents.js';
import { RequireUUID } from './sql-guards.js';

const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';

export type CheckoutAccessState = 'Ready' | 'Pending' | 'Failed' | 'NotTracked';

export interface CheckoutAccessStatusResult {
    Success: boolean;
    ErrorMessage?: string;
    State?: CheckoutAccessState;
}

/** The one state for a set of gating delivery statuses. A failure outranks anything still pending. */
export function SummarizeAccessDeliveries(statuses: ReadonlyArray<string>): CheckoutAccessState {
    if (statuses.length === 0) return 'NotTracked';
    if (statuses.includes('DeadLettered')) return 'Failed';
    if (statuses.every((s) => s === 'Delivered')) return 'Ready';
    return 'Pending';
}

function keyMatches(stored: string | null | undefined, presented: string | null | undefined): boolean {
    const a = stored ?? '';
    const b = (presented ?? '').trim();
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * The access state of the order a checkout session confirmed. Refused unless the client key
 * matches and the session has confirmed its order.
 */
export async function GetCheckoutAccessStatus(
    sessionID: string,
    clientSessionKey: string,
    contextUser?: UserInfo
): Promise<CheckoutAccessStatusResult> {
    try {
        RequireUUID(sessionID, 'sessionId');
    } catch {
        return { Success: false, ErrorMessage: 'Checkout session not found' };
    }
    const md = new Metadata();
    const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
    if (!(await session.Load(sessionID))) {
        return { Success: false, ErrorMessage: 'Checkout session not found' };
    }
    if (!keyMatches(session.ClientSessionKey, clientSessionKey)) {
        return { Success: false, ErrorMessage: 'Checkout session key does not match' };
    }
    if (session.Status !== 'Confirmed' || !session.DraftOrderID) {
        return { Success: false, ErrorMessage: 'This checkout has not completed yet.' };
    }

    const orderID = RequireUUID(session.DraftOrderID, 'OrderHeaderID');
    const rv = new RunView(Metadata.Provider as unknown as IRunViewProvider);
    const rows = await rv.RunView<{ Status: string }>(
        {
            EntityName: OUTBOUND_DELIVERY_ENTITY,
            ExtraFilter:
                `GatesAccess = 1 AND OutboundEventID IN ` +
                `(SELECT ID FROM __mj_BizAppsOrders.OutboundEvent WHERE OrderHeaderID = '${orderID}')`,
            Fields: ['Status'],
            ResultType: 'simple',
            BypassCache: true,
        },
        contextUser
    );
    if (!rows?.Success) {
        LogError(`[CheckoutAccessStatus] could not read deliveries for order ${orderID}: ${rows?.ErrorMessage ?? 'unknown error'}`);
        return { Success: false, ErrorMessage: 'Access status is not available right now.' };
    }
    return { Success: true, State: SummarizeAccessDeliveries((rows.Results ?? []).map((r) => r.Status)) };
}
