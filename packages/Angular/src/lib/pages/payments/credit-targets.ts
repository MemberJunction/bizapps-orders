/**
 * Which unpaid orders a credit may settle, as the Account Credit page lists them. The SAME rules the server enforces
 * (`SameCustomerRefusal` and `CreditOrderStatusRefusal` in Orders.ApplyAccountCredit): a credit belongs to whoever
 * earned it, and only a confirmed order gives or takes one. An organization's credit settles that organization's
 * orders; a person's (an order billed to a person, no organization) settles that person's own person-billed orders,
 * never an organization's order that merely names them.
 *
 * DELIBERATELY A MIRROR of the server rule, not the rule itself (docs/ui-architecture.md puts rules on the entity or a
 * remote operation): the page uses it only to LIST what the server would accept, so a person is not offered a target
 * the operation then refuses. The server decides; if the two ever disagree, the operation's refusal wins and the page
 * shows it. Pure.
 */
import { NOT_CREDITABLE_STATUSES } from '../../data/credit-statuses';

export interface CreditCustomer {
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    /** The order's commercial status, when the caller has it: only `Confirmed` gives or takes a credit. */
    Status?: string | null;
}

export { CREDITS_HELD_WHERE, NOT_CREDITABLE_STATUSES } from '../../data/credit-statuses';

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
 * person (BillToPersonID is the contact there), and a person's credit may not settle those: they are dropped. A Draft,
 * Quoted or Voided order is dropped too (the `unpaid` preset already leaves them out; this keeps the list honest for
 * any caller), and a credit held on one lists nothing.
 */
export function OwnCreditTargets<T extends CreditCustomer>(credit: CreditCustomer, orders: T[]): T[] {
    if (credit.Status != null && NOT_CREDITABLE_STATUSES.includes(credit.Status)) return [];
    const confirmed = orders.filter((o) => o.Status == null || !NOT_CREDITABLE_STATUSES.includes(o.Status));
    if (credit.BillToOrganizationID) return confirmed;
    return confirmed.filter((o) => !o.BillToOrganizationID);
}
