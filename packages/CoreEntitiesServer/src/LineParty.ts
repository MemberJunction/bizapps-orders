/**
 * WHO an order line is for, when the line itself does not say (D61).
 *
 * One answer for every reader: the subscription holder, the entitlement-grant beneficiary and the
 * gift-card recipient. Each used to carry its own fallback, and they disagreed — subscriptions took
 * the order's ship-to, grants and gift cards skipped it and took the bill-to — so an order billed to
 * one party and shipped to another gave the subscription to one and its access to the other (#622).
 *
 * The order: the line's ship-to, then the order's ship-to, then the order's bill-to. Each side falls
 * back INDEPENDENTLY, so a line naming only a person (a seat bought under the customer organization)
 * keeps the header's organization.
 *
 * CONNECTS TO:
 *   CALLERS: OrderEntityServer.resolveSubscriber · EntitlementEngine · GiftCardBehavior
 *   DOC:     plans/archive/bizapps-orders-master.md D27 (beneficiary), D61 (ship-to on the line)
 */

/** The line's own ship-to. */
export interface LinePartyLineFacts {
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
}

/** The order header's ship-to and bill-to, in that order of preference. */
export interface LinePartyOrderFacts {
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
}

export interface LineParty {
    OrganizationID: string | null;
    PersonID: string | null;
}

export function ResolveLineParty(line: LinePartyLineFacts, order: LinePartyOrderFacts): LineParty {
    return {
        OrganizationID: line.ShipToOrganizationID ?? order.ShipToOrganizationID ?? order.BillToOrganizationID ?? null,
        PersonID: line.ShipToPersonID ?? order.ShipToPersonID ?? order.BillToPersonID ?? null,
    };
}
