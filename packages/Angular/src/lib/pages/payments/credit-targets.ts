/**
 * Which unpaid orders a credit may settle, as the Account Credit page lists them. The SAME rule the server enforces
 * (`SameCustomerRefusal` in Orders.ApplyAccountCredit): a credit belongs to whoever earned it. An organization's credit
 * settles that organization's orders; a person's (an order billed to a person, no organization) settles that person's
 * own person-billed orders, never an organization's order that merely names them. Pure.
 */
export interface CreditCustomer {
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
}

/** No order: a filter that matches nothing (a UUID that is no order). */
const NO_ORDER = '00000000-0000-0000-0000-000000000000';

/**
 * The server-side filter for the orders a credit may settle: its organization, or, for a credit billed to a person
 * alone, that person. Never both (both would match either), and never neither: a credit billed to no one lists nothing
 * rather than every customer's unpaid orders.
 */
export function CreditTargetFilter(credit: CreditCustomer): { BillToOrganizationID?: string; BillToPersonID?: string; OrderHeaderID?: string } {
    if (credit.BillToOrganizationID) return { BillToOrganizationID: credit.BillToOrganizationID };
    if (credit.BillToPersonID) return { BillToPersonID: credit.BillToPersonID };
    return { OrderHeaderID: NO_ORDER };
}

/**
 * The listed orders the server would accept. The person filter also matches an organization's orders that name the
 * person (BillToPersonID is the contact there), and a person's credit may not settle those: they are dropped.
 */
export function OwnCreditTargets<T extends CreditCustomer>(credit: CreditCustomer, orders: T[]): T[] {
    if (credit.BillToOrganizationID) return orders;
    return orders.filter((o) => !o.BillToOrganizationID);
}
