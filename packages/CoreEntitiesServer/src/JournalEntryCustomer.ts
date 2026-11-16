/**
 * The customer named in a journal entry's description (bc-aidp-next-golive#452).
 *
 * Accounting's batch view lists each entry's description as its memo, and accounting cannot read
 * Orders tables to find the customer itself. So the entries Orders writes for an order or a payment
 * name the customer in the description, next to the order and payment numbers already there.
 *
 * The description column has no length limit (NVARCHAR(MAX)) and the lines sent to the ERP carry
 * their own netted text, so the name is written in full.
 *
 * CONNECTS TO:
 *   ORDER:   ./OrderJournalEntryFactory.ts — booking and recognition entries
 *   PAYMENT: ./PaymentAllocationFactory.ts — cash allocation entries, fed by
 *            ./PaymentLineEntityServer.ts and ./PaymentHeaderEntityServer.ts
 */

/** The billing names an order header carries (denormalized on the order view). */
export interface OrderCustomerFields {
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
}

/** The customer an order bills: its billing organization, else its billing person, else null. */
export function OrderCustomerName(order: OrderCustomerFields): string | null {
    const name = order.BillToOrganization?.trim() || order.BillToPerson?.trim();
    return name || null;
}

/** ` — <customer>` to splice into a description, or nothing when no customer is known. */
export function CustomerPart(customerName: string | null | undefined): string {
    const name = customerName?.trim();
    return name ? ` — ${name}` : '';
}
