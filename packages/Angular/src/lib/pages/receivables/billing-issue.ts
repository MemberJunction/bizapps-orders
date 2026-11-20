/**
 * Whether the billing worklist may offer "Issue invoice" for an instalment (golive #469).
 *
 * A MIRROR of the server rule, not the rule itself: `Orders.IssueInstalmentInvoice` refuses an
 * instalment whose order is not Confirmed, because an unbooked order has no receivable to invoice.
 * `Orders.GetBillingWorklist` already leaves such rows off; this keeps the button honest if one
 * arrives anyway (an order un-confirmed after the list loaded, an older server). The server decides;
 * if the two ever disagree, its refusal is what the page shows. Pure.
 */
export function IssueInvoiceBlockedReason(row: { OrderNumber: string; OrderStatus: string } | null | undefined): string | null {
    if (!row) return null;
    if (row.OrderStatus === 'Confirmed') return null;
    return `${row.OrderNumber} is ${row.OrderStatus || 'not confirmed'}. Only a confirmed order can be invoiced; confirm it first.`;
}
