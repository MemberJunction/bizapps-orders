/**
 * The pure rules behind the Payment-entry application panel (§13.2 / §4's Jeremy workflow).
 *
 * Extracted per the tier-1 boundary doctrine: allocating money across open orders is exactly the
 * kind of arithmetic that must be tested with exact values, not eyeballed in a browser.
 *
 * The same panel serves apply-credit mode (D.5) — a credit is a negative-balance order applied the
 * same way — so nothing here assumes the money is a "payment".
 */

/** An open order a payment can be applied to. */
export interface OpenOrderRow {
  OrderID: string;
  OrderNumber: string;
  DueDate: string | null;
  Balance: number;
}

/** What the operator has chosen to put against each order. Raw text — the input's own value. */
export type Allocations = Record<string, string>;

/** Round to cents. Money math must never carry binary-float dust into a saved row. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseAmount(text: string): number {
  const t = (text ?? '').trim();
  if (t === '') return 0;
  return Number(t.replace(/,/g, ''));
}

/**
 * Oldest-first auto-apply: walk the orders by due date and consume the payment until it runs out.
 *
 * "Oldest" = earliest DUE date (what the money is most overdue against), not earliest order date.
 * An order with no due date sorts LAST: we cannot claim it is overdue, so it must not jump ahead of
 * one that demonstrably is.
 *
 * Never over-applies: each order takes at most its own balance, and the total never exceeds the
 * payment. A leftover is returned to the caller as unapplied rather than forced onto the last order.
 */
export function autoApplyOldestFirst(payment: number, orders: OpenOrderRow[]): Allocations {
  const allocations: Allocations = {};
  let remaining = round2(Math.max(0, payment));

  for (const order of sortOldestFirst(orders)) {
    if (remaining <= 0) {
      allocations[order.OrderID] = '0.00';
      continue;
    }
    const take = round2(Math.min(remaining, Math.max(0, order.Balance)));
    allocations[order.OrderID] = take.toFixed(2);
    remaining = round2(remaining - take);
  }
  return allocations;
}

/** Earliest due date first; undated orders last (see autoApplyOldestFirst). */
export function sortOldestFirst(orders: OpenOrderRow[]): OpenOrderRow[] {
  return [...orders].sort((a, b) => {
    if (a.DueDate && b.DueDate) return a.DueDate.localeCompare(b.DueDate);
    if (a.DueDate) return -1;
    if (b.DueDate) return 1;
    return a.OrderNumber.localeCompare(b.OrderNumber);
  });
}

export function totalApplied(allocations: Allocations): number {
  return round2(
    Object.values(allocations).reduce((sum, text) => {
      const n = parseAmount(text);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0),
  );
}

/** What is left of the payment after the current allocations. Negative ⇒ over-applied. */
export function unapplied(payment: number, allocations: Allocations): number {
  return round2(payment - totalApplied(allocations));
}

/** Why this allocation can't be recorded, or null. */
export function applicationIssues(payment: number, orders: OpenOrderRow[], allocations: Allocations): string[] {
  const issues: string[] = [];

  if (!Number.isFinite(payment)) return ['The payment amount must be a number.'];
  if (payment <= 0) issues.push('The payment amount must be greater than zero.');

  for (const order of orders) {
    const applied = parseAmount(allocations[order.OrderID] ?? '');
    if (!Number.isFinite(applied)) {
      issues.push(`${order.OrderNumber}: the amount to apply must be a number.`);
      continue;
    }
    if (applied < 0) issues.push(`${order.OrderNumber}: cannot apply a negative amount.`);
    // Over-applying an order would leave it with a negative balance — that is a CREDIT, which is a
    // different flow (D.5), not something to fall into by typo.
    if (applied > order.Balance + 0.005) {
      issues.push(`${order.OrderNumber}: applying ${applied.toFixed(2)} exceeds its ${order.Balance.toFixed(2)} balance.`);
    }
  }

  if (unapplied(payment, allocations) < -0.005) {
    issues.push(`Applied ${totalApplied(allocations).toFixed(2)} is more than the ${payment.toFixed(2)} payment.`);
  }
  return issues;
}

/** The remainder chip's wording — "fully applied" is a claim, so it is made only when exactly true. */
export function remainderLabel(payment: number, allocations: Allocations): string {
  const left = unapplied(payment, allocations);
  if (Math.abs(left) < 0.005) return 'Fully applied — 0.00 unapplied';
  if (left > 0) return `${left.toFixed(2)} unapplied`;
  return `Over-applied by ${Math.abs(left).toFixed(2)}`;
}
