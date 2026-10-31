/**
 * Which orders hold a credit, in the client's own filter strings. ONE list, read by the Account Credit page (its
 * sources and targets), the `credits` preset and the dashboard's "credits on account". Pure: no Angular, no data access.
 *
 * Only a CONFIRMED order gives or takes a credit: a Draft or Quoted order is not booked (a negative balance there is no
 * money anyone paid) and a Voided one never will be. The server enforces the same rule where credit is spent
 * (`CreditOrderStatusRefusal` in Orders.ApplyAccountCredit) and in its own lookups (`GetOverdueWorklistOperation`, the
 * `unpaid` preset): this mirrors it so the screens never offer what the server refuses.
 */
export const NOT_CREDITABLE_STATUSES: readonly string[] = ['Draft', 'Quoted', 'Voided'];

/** Orders carrying a credit: a negative balance on a confirmed order. */
export const CREDITS_HELD_WHERE = `Balance < 0 AND Status NOT IN (${NOT_CREDITABLE_STATUSES.map((s) => `'${s}'`).join(',')})`;
