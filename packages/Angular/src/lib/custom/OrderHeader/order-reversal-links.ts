/**
 * @fileoverview Which reversal links an order offers from its header — the rule, without a component.
 *
 * A return, cancellation or credit memo is a NEW order whose `ReversesOrderHeaderID` names the order
 * it reverses. That link was saved and never shown (MemberJunction/bizapps-orders#740): the reversal
 * did not say which order it reverses, and the original did not list what reversed it, so a reversal
 * could be found only by order number.
 *
 * Plain functions so the rule can be pinned in a node test; drawing the chips — resolving the order
 * number, hiding a record the reader cannot open — is `bizapps-related-chips`' job.
 *
 * @module @mj-biz-apps/orders-ng
 */
import type { BizAppsRelatedLink } from '@mj-biz-apps/common-ng';
import { MJO_ENTITIES } from '../../data/entity-names';

/** What the rule needs: the order this one reverses, and the orders that reverse this one. */
export interface OrderReversalLinkState {
    /** `OrderHeader.ReversesOrderHeaderID` of the order on screen. */
    ReversesOrderHeaderID?: string | null;
    /** IDs of orders whose `ReversesOrderHeaderID` is the order on screen, oldest first. */
    ReversedByOrderIDs?: readonly string[] | null;
}

/** `true` for a value that actually names a record. */
function holds(id: string | null | undefined): id is string {
    return id != null && String(id).trim().length > 0;
}

/**
 * "Reverses" first — the one order this reversal undoes — then one "Reversed by" chip per reversal.
 * Both can apply at once: a reversal can itself be reversed.
 */
export function OrderReversalLinks(state: OrderReversalLinkState): BizAppsRelatedLink[] {
    const links: BizAppsRelatedLink[] = [];
    if (holds(state.ReversesOrderHeaderID)) {
        links.push({
            Key: 'reverses',
            EntityName: MJO_ENTITIES.OrderHeader,
            RecordID: state.ReversesOrderHeaderID,
            Label: 'Reverses',
            Icon: 'fa-solid fa-rotate-left',
        });
    }
    for (const id of state.ReversedByOrderIDs ?? []) {
        if (!holds(id)) continue;
        links.push({
            Key: `reversed-by:${id}`,
            EntityName: MJO_ENTITIES.OrderHeader,
            RecordID: id,
            Label: 'Reversed by',
            Icon: 'fa-solid fa-rotate-left',
        });
    }
    return links;
}

/**
 * A key that changes exactly when {@link OrderReversalLinks} would return something different.
 * The chip row re-reads on every new array reference, so the form rebuilds the array only when this
 * moves; the order id is in it because the form instance is reused across records.
 */
export function OrderReversalLinksKey(recordID: string | null | undefined, state: OrderReversalLinkState): string {
    return [recordID ?? '', state.ReversesOrderHeaderID ?? '', (state.ReversedByOrderIDs ?? []).join(',')].join(':');
}
