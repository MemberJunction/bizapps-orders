/**
 * @fileoverview A seam for another app to refuse an order-line edit.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * An order line can be reached from more than one place. Orders knows the rules that are ITS OWN —
 * a booked order takes corrections through reversal orders, not through edits — and enforces those
 * itself. What it cannot know is that some other app has a reason of its own to freeze a line.
 *
 * The case that prompted this (bc-aidp-next-golive#206 item 1): Sales closes a deal, the deal locks,
 * and the deal's terms are frozen because a contract was derived from them. The order's lines are
 * exactly what that contract was derived from — so editing one after the close falsifies the same
 * provenance the deal lock protects. A tester added a line to a Won deal through the "What's being
 * sold" grid and it saved, because the deal's lock only runs when the DEAL is saved.
 *
 * ── WHY A SEAM AND NOT A LOOKUP ─────────────────────────────────────────────────────────────────
 *
 * The obvious fix is for the order line to look up the deal. It is the wrong one: this package does
 * not depend on Sales, and Sales depends on IT. Reaching for `MJ_BizApps_Sales: Deals` here would
 * invert the dependency chain and bake one consuming app's concept into the app every other consumer
 * builds on. The next app with a reason to freeze a line would then need its own special case in
 * here, and the one after that.
 *
 * So Orders asks a question and someone else answers it. Sales registers the answer at bootstrap,
 * the same way this ecosystem already registers transports and engines.
 *
 * ── NOTHING REGISTERS INTO THIS YET, AND THAT IS THE POINT OF MERGING IT ────────────────────────
 *
 * An earlier version of this comment said the seam "lands together with the Sales side that fills
 * it". It does not, and saying so would have been the only untrue sentence in the file: no Sales PR
 * calls `RegisterOrderLineEditVeto`, because Sales resolves `orders-entities` from npm and cannot
 * call a function that has not shipped.
 *
 * So this merges first, inert, on purpose. `HostOrderLineEditVeto()` returns null on every host until
 * something registers, the checks that consult it return early, and nothing changes for anyone. The
 * alternative — holding it until its caller exists — cannot work, because its caller cannot be
 * written until this is published.
 *
 * A registry nothing registers into is still worse than no registry if it is left that way. The
 * thing that stops that here is bc-aidp-next-golive#206 item 1, which is not closed until the Sales
 * side registers one.
 *
 * @module @mj-biz-apps/orders-entities
 */

import type { UserInfo } from '@memberjunction/core';

/** What is being attempted, so a vetoer can allow some edits and refuse others. */
export type OrderLineEditKind = 'create' | 'update' | 'delete';

/** What the vetoer is told. Deliberately small: ids, not entities, so no entity type crosses apps. */
export interface OrderLineEditContext {
    /** The line's parent order. Always present — a line without one cannot be saved. */
    OrderHeaderID: string;
    /** The line itself. Null on a create, which has no id yet. */
    OrderLineID: string | null;
    Kind: OrderLineEditKind;
    /**
     * Who is attempting the edit, for the vetoer's own lookup.
     *
     * A vetoer has to read something to answer — Sales reads the deal behind the order — and on the
     * server `RunView` needs a user to do that under row-level security. Without this the vetoer's
     * only options are to query as nobody or to reach for a system user and skip RLS entirely.
     *
     * It matters more here than it usually would, because this seam FAILS CLOSED: a vetoer that
     * throws is treated as a refusal. A vetoer that throws for want of a user would refuse every line
     * edit on every order, not only the ones a deal has any claim on.
     *
     * Null when the caller genuinely has none — the browser path, where the provider supplies it.
     */
    ContextUser: UserInfo | null;
}

/**
 * Refuses an order-line edit, or allows it.
 *
 * @returns a message explaining the refusal, or null to allow. The message is shown to whoever
 *          attempted the edit, so it should say what is blocking and what to do about it — a bare
 *          "not permitted" sends someone hunting through the wrong app.
 *
 * Throwing is NOT a refusal. A vetoer that cannot reach what it needs should say so by throwing, and
 * the caller turns that into a refusal naming the fault, because silently allowing an edit the vetoer
 * could not judge is how a frozen record ends up edited.
 */
export interface OrderLineEditVeto {
    MayEdit(context: OrderLineEditContext): Promise<string | null>;
}

let hostVeto: OrderLineEditVeto | null = null;

/**
 * Register the veto for this host. Pass null to clear it.
 *
 * Last-call-wins and idempotent, matching the other registries in this ecosystem: a host that boots
 * twice in one process must not end up with two, and there is no sensible way to merge them.
 */
export function RegisterOrderLineEditVeto(veto: OrderLineEditVeto | null): void {
    hostVeto = veto;
}

/** The registered veto, or null on a host where nothing freezes lines from outside Orders. */
export function HostOrderLineEditVeto(): OrderLineEditVeto | null {
    return hostVeto;
}

/**
 * Ask the registered veto, and turn every outcome into one answer: a refusal message, or null.
 *
 * ONE PLACE, because the save path and the delete path both need it and a second copy of the
 * try/catch below is a second chance to get the failure case backwards.
 *
 * THE FAILURE CASE IS THE POINT. A vetoer that throws has not said yes. Letting the exception
 * escape would surface as an unhandled error on a grid; swallowing it and allowing the edit would
 * let a frozen line change because the thing guarding it was briefly unreachable. Neither is
 * acceptable, so a throw becomes a refusal that names the fault and says nothing was applied.
 *
 * @param whenFailed appended to a thrown vetoer's message, so the caller can say what did NOT happen
 *                   -- "the edit was not applied" reads differently from "nothing was deleted".
 */
export async function ResolveOrderLineEditRefusal(
    veto: OrderLineEditVeto | null,
    context: OrderLineEditContext,
    whenFailed: string,
): Promise<string | null> {
    if (!veto) return null;
    try {
        return await veto.MayEdit(context);
    } catch (err) {
        return (
            `This line could not be checked against the rules that may freeze it: ` +
            `${err instanceof Error ? err.message : String(err)}. ${whenFailed}`
        );
    }
}
