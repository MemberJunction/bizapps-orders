/**
 * @fileoverview A seam for another app to refuse an order's CONFIRM.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * Confirming is where an order stops being a proposal: journal entries are written, a subscription
 * may be created, and revenue recognition follows. Orders enforces the rules that are ITS OWN —
 * `ConfirmEligibility` wants a legal status, a bill-to party, at least one line, and a service period
 * on every line that needs one. What it cannot know is that some other app has a reason of its own to
 * say "not yet".
 *
 * The case that prompted this (bc-aidp-next-golive#323): Sales closes a deal Won, which mints an
 * order; the deal is then REOPENED, putting it back to Open. Twenty seconds later the order was
 * confirmed from the order screen and booked — a booking entry, a subscription and twelve recognition
 * entries — leaving an Open deal at 75% sitting on a booked order. Sales already refuses the reverse
 * (a deal cannot be reopened once its order has booked); nothing checked this direction.
 *
 * ── WHY A SEAM AND NOT A LOOKUP ─────────────────────────────────────────────────────────────────
 *
 * The obvious fix is for the order to look up the deal it came from. It is the wrong one, for the
 * same reasons set out in `order-line-edit-veto.ts`, and one more specific to this case: there is no
 * link to follow. `Deal.OrderID` points this way; `OrderHeader` carries no `DealID`, only an `Origin`
 * that reads `Direct` on every row. Orders would have to query `MJ_BizApps_Sales: Deals` by a foreign
 * key held on the other side — inverting a dependency chain that Sales builds ON — to answer a
 * question Sales can answer without asking anyone.
 *
 * So Orders asks, and whoever has a stake answers. Sales registers at bootstrap, as it already does
 * for {@link RegisterOrderLineEditVeto}.
 *
 * ── THIS SHIPS BEFORE ITS CALLER, ON PURPOSE ───────────────────────────────────────────────────
 *
 * Nothing registers into this on the day it merges, and it cannot be otherwise: Sales resolves
 * `@mj-biz-apps/orders-entities` from the registry, so it cannot call a function that has not been
 * published. Until something registers, {@link HostOrderConfirmVeto} returns null, the check that
 * consults it returns early, and no host behaves differently.
 *
 * A registry nothing registers into is worse than no registry if it stays that way. What stops that
 * here is bc-aidp-next-golive#323, which is not closed until the Sales side registers one.
 *
 * @module @mj-biz-apps/orders-entities
 */

import type { UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * What the vetoer is told. Deliberately small: ids and the status being left, not entities, so no
 * entity type crosses apps.
 */
export interface OrderConfirmContext {
    /** The order being confirmed. */
    OrderHeaderID: string;
    /**
     * The status it is moving FROM — read from the saved value, not the pending one, so a vetoer
     * sees where the order actually is rather than where this save wants it to go.
     */
    FromStatus: string;
    /** The vetoer reads something to answer, and on the server that read needs a user. */
    ContextUser: UserInfo | null;
}

/** Implemented by the app with a stake. One per host. */
export interface OrderConfirmVeto {
    /**
     * Null to allow. A string REFUSES, and is shown to the person who clicked Confirm, so it should
     * say what is wrong and what to do — "close the deal first", not "vetoed".
     */
    MayConfirm(context: OrderConfirmContext): Promise<string | null>;
}

const KEY = '__MJ_BizAppsOrders_OrderConfirmVeto__';

/** Registers the one veto for this process. Passing null clears it, which is what tests want. */
export function RegisterOrderConfirmVeto(veto: OrderConfirmVeto | null): void {
    GetGlobalObjectStore()[KEY] = veto;
}

/** The registered veto, or null on a host where nothing registered. */
export function HostOrderConfirmVeto(): OrderConfirmVeto | null {
    return (GetGlobalObjectStore()[KEY] as OrderConfirmVeto | null) ?? null;
}

/**
 * Asks the veto, and turns any failure into a REFUSAL rather than an allowance.
 *
 * FAILING CLOSED IS THE WHOLE POINT. A vetoer that throws has not said yes, and confirming on the
 * strength of "could not tell" is how an order books against a deal that is no longer won — the
 * exact outcome this exists to prevent, arrived at by a different route. The message names the fault
 * so it is fixed rather than worked around.
 *
 * @param fallbackMessage what to tell the user about what did NOT happen, when the vetoer throws.
 */
export async function ResolveOrderConfirmRefusal(
    veto: OrderConfirmVeto | null,
    context: OrderConfirmContext,
    fallbackMessage: string,
): Promise<string | null> {
    if (!veto) return null;
    try {
        return await veto.MayConfirm(context);
    } catch (err) {
        return (
            `${fallbackMessage} A check from another app could not be completed, so this was refused ` +
            `rather than allowed: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}
