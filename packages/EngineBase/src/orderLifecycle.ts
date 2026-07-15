/**
 * orderLifecycle — the PURE order-lifecycle rules: the status transition matrix, totals math, and
 * the derived-field computations (F1). Zero dependency on a provider or the DB — everything takes
 * plain values, so it is fully unit-testable offline AND usable by the browser (live totals, the
 * UI's transition-affordance gating) exactly as the server uses it.
 *
 * Lifecycle DAG (MOD-1 / MOD-7 / MOD-10): Draft → Quoted → Confirmed → Posted → Fulfilled.
 *   - FORWARD skips are legal (Draft → Confirmed, Draft → Posted, Confirmed → Fulfilled, …); the
 *     prerequisite EFFECTS are enforced regardless of the skip (MOD-10) — reaching any BOOKED state
 *     fires booking exactly once; Fulfilled requires the booked (Posted) effect to hold.
 *   - NO backward moves. Confirmed+ corrections go through a reversal order (F2), never a back-step.
 *   - Voided is reachable ONLY from Draft / Quoted (an un-booked order); Fulfilled and Voided are terminal.
 *
 * CONNECTS TO:
 *   ENTITY:  @mj-biz-apps/orders-entities (Order / OrderLine field unions — rule 2c derivation)
 *   SERVER:  OrderEntityServer (transition gate + derivations) · OrderLineEntityServer (line totals)
 *   DOC:     feature plan F1 · MASTER-PLAN-MODIFICATIONS MOD-1/7/9b/10 · UPD-3
 */
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';

/** Derived from the generated entity (rule 2c) — tracks the CHECK-constraint union forever. */
export type OrderStatus = mjBizAppsOrdersOrderEntity['Status'];
export type OrderPaymentStatus = NonNullable<mjBizAppsOrdersOrderEntity['PaymentStatus']>;

/** The BOOKED states — reaching any of these requires the order's journal entries to exist. */
export const BOOKED_STATUSES: readonly OrderStatus[] = ['Confirmed', 'Posted', 'Fulfilled'];
export function isBookedStatus(status: OrderStatus): boolean {
  return BOOKED_STATUSES.includes(status);
}

/** The legal forward DAG. Terminal states map to []. Same-status (no-op) is handled in validate. */
export const AllowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  Draft: ['Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'],
  Quoted: ['Confirmed', 'Posted', 'Fulfilled', 'Voided'],
  Confirmed: ['Posted', 'Fulfilled'],
  Posted: ['Fulfilled'],
  Fulfilled: [],
  Voided: [],
};

export interface TransitionCheck {
  Allowed: boolean;
  Reason?: string;
}

/**
 * Validate a status transition against the DAG. A same-status save is always allowed (idempotent
 * re-saves / non-status edits). Anything not in `AllowedTransitions[from]` is rejected with a
 * specific reason naming the legal set.
 */
export function validateTransition(from: OrderStatus, to: OrderStatus): TransitionCheck {
  if (from === to) return { Allowed: true };
  const allowed = AllowedTransitions[from] ?? [];
  if (allowed.includes(to)) return { Allowed: true };
  const legal = allowed.length ? allowed.join(', ') : '(none — terminal state)';
  return {
    Allowed: false,
    Reason:
      `Illegal order transition ${from} → ${to}. Legal from ${from}: ${legal}. ` +
      `Backward moves are not allowed; correct a booked order with a reversal order (F2).`,
  };
}

// ─── totals math ───────────────────────────────────────────────────────────────

/** Net line total = Quantity × UnitPrice × (1 − DiscountPct). Never negative-discounted below 0. */
export function computeLineNet(quantity: number, unitPrice: number, discountPct: number | null): number {
  const pct = clampDiscount(discountPct ?? 0);
  return round2(quantity * unitPrice * (1 - pct));
}

/** Gross line total = Net + tax (tax is 0 in v1 — S4 deferred). */
export function computeLineGross(lineNet: number, lineTax: number | null): number {
  return round2(lineNet + (lineTax ?? 0));
}

/** Order gross = Σ line gross. */
export function computeOrderTotalGross(lineGrosses: Array<number | null>): number {
  return round2(lineGrosses.reduce<number>((sum, g) => sum + (g ?? 0), 0));
}

/** Open balance = TotalGross − AmountPaid. Negative = a credit owed to the customer (credit memo). */
export function computeBalance(totalGross: number | null, amountPaid: number | null): number {
  return round2((totalGross ?? 0) - (amountPaid ?? 0));
}

/**
 * Derive the payment status from AmountPaid vs TotalGross. Returns Unpaid | PartiallyPaid | Paid.
 * NEVER overrides an explicit WrittenOff (an operator action, not a derivation). Overdue is
 * time-derived in views/UI off DueDate — deliberately NOT computed here (no cron mutates orders).
 */
export function derivePaymentStatus(
  totalGross: number | null,
  amountPaid: number | null,
  current?: OrderPaymentStatus | null,
): OrderPaymentStatus {
  if (current === 'WrittenOff') return 'WrittenOff';
  const paid = amountPaid ?? 0;
  const gross = totalGross ?? 0;
  if (paid <= 0) return 'Unpaid';
  if (paid + 0.005 >= gross) return 'Paid';
  return 'PartiallyPaid';
}

/**
 * Derive the DueDate from a base date + the payment terms' net days (F1.4). Returns null when no
 * terms apply (caller then leaves any manually-supplied DueDate untouched). Date-only (UTC).
 */
export function deriveDueDate(baseDate: Date, netDays: number | null | undefined): Date | null {
  if (netDays == null) return null;
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + netDays);
  return d;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** A discount fraction is bounded to [0, 1]; out-of-range inputs are clamped (defensive). */
function clampDiscount(pct: number): number {
  if (pct < 0) return 0;
  if (pct > 1) return 1;
  return pct;
}

/** Round to 2 decimals (currency minor units), avoiding binary-float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a single order's line grosses straight off the line entities (server convenience). */
export function orderTotalGrossFromLines(lines: Array<Pick<mjBizAppsOrdersOrderLineEntity, 'LineTotalGross'>>): number {
  return computeOrderTotalGross(lines.map(l => l.LineTotalGross));
}
