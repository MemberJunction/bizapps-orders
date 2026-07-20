import {
  computeLineNet,
  computeOrderTotalGross,
  computeBalance,
  derivePaymentStatus,
  type OrderStatus,
  type OrderPaymentStatus,
  type PriceSource,
} from '@mj-biz-apps/orders-engine-base';

/**
 * The pure state + rules behind the Order editor's line grid (§13.1).
 *
 * Extracted per the tier-1 boundary doctrine: parsing, totals and the submit rules are total,
 * synchronous functions with no Angular and no DB.
 *
 * This module deliberately owns almost NO arithmetic. The order money math already exists, tested,
 * in `@mj-biz-apps/orders-engine-base` (`computeLineNet`, `computeOrderTotalGross`,
 * `computeBalance`, `derivePaymentStatus`) and the SERVER computes the stored values with those same
 * functions. Re-deriving them here would create a second definition of "what this order costs" — the
 * one bug an order editor absolutely must not have. So this file parses text into numbers, calls the
 * shared functions, and stops.
 *
 * CONNECTS TO:
 *   PURE: @mj-biz-apps/orders-engine-base (orderLifecycle — the SAME functions the server uses)
 */

/** One editable row. Numerics stay as RAW TEXT so a half-typed "1,2" survives change detection. */
export interface OrderDraftLine {
  /** Stable identity for `@for` tracking — rows reorder/delete, so an index would misbind inputs. */
  Key: string;
  ProductID: string | null;
  Quantity: string;
  UnitPrice: string;
  DiscountPct: string;
  ServicePeriodStart: string | null;
  ServicePeriodEnd: string | null;
  /**
   * How the CURRENT UnitPrice was arrived at (B.2 / BO-D33). `DirectEntry` means the operator typed
   * over the resolved price and their entry wins — the badge flips to "overridden".
   */
  PriceSource: PriceSource;
  /** Human note for the badge, e.g. "PriceList Standard · tier 10+". */
  PriceNote: string | null;
  /** Optional free-text line memo (OrderLine.Description) — set inside the order's save transaction. */
  Description: string;
}

export interface OrderDraftState {
  /** Set once saved — the tab is then editing a REAL order, not composing a new one. */
  OrderID?: string;
  OrderNumber?: string;
  Status: OrderStatus;
  CustomerOrganizationID: string | null;
  OrderDate: string;
  DueDate: string | null;
  PaymentTermsTypeID: string | null;
  ExternalDocumentNumber: string;
  Description: string;
  /** Server-owned once the order exists; 0 for an unsaved draft. */
  AmountPaid: number;
  /**
   * The order's stored payment status, carried so a WrittenOff order is never re-derived away.
   * Null for an unsaved draft (nothing has been written off yet).
   */
  PaymentStatus: OrderPaymentStatus | null;
  Lines: OrderDraftLine[];
}

export function newOrderLine(key: string): OrderDraftLine {
  return {
    Key: key,
    ProductID: null,
    Quantity: '1',
    UnitPrice: '',
    DiscountPct: '0',
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
    PriceSource: 'DirectEntry',
    PriceNote: null,
    Description: '',
  };
}

/** Parse a numeric input. Blank → 0; a typo → NaN, which `lineIssue` reports rather than coercing. */
export function parseNum(text: string): number {
  const t = (text ?? '').trim();
  if (t === '') return 0;
  return Number(t.replace(/,/g, ''));
}

/**
 * ⚠ THE DISCOUNT UNIT BOUNDARY — the one place percent becomes fraction.
 *
 * `OrderLine.DiscountPct` is a **fraction**, not a percent: `DECIMAL(7,4)` guarded by
 * `CK_OrderLine_DiscountPct CHECK (DiscountPct >= 0 AND DiscountPct <= 1)`, and `computeLineNet`
 * multiplies by `(1 − DiscountPct)`. So the stored value for "10% off" is **0.10**.
 *
 * The UI takes a PERCENT because that is what a salesperson types (and what the approved mockup's
 * "Disc %" column says). Feeding their `10` straight through would mean 1000% off — `computeLineNet`
 * clamps it, silently making the line FREE, and the DB CHECK then rejects the save.
 *
 * Every conversion goes through this function. Nothing else in the editor may divide by 100.
 */
export function discountFraction(line: OrderDraftLine): number {
  const pct = parseNum(line.DiscountPct);
  return Number.isFinite(pct) ? pct / 100 : Number.NaN;
}

/** A row the operator has not touched — ignored entirely rather than reported as invalid. */
export function isOrderLineEmpty(line: OrderDraftLine): boolean {
  return !line.ProductID && parseNum(line.UnitPrice) === 0;
}

/**
 * This line's net total, via the SHARED rule (Qty × Unit × (1 − Disc)) the server also uses.
 * The discount is converted percent → fraction first (see `discountFraction`).
 */
export function lineNet(line: OrderDraftLine): number {
  const q = parseNum(line.Quantity);
  const u = parseNum(line.UnitPrice);
  const d = discountFraction(line);
  if (!Number.isFinite(q) || !Number.isFinite(u) || !Number.isFinite(d)) return 0;
  return computeLineNet(q, u, d);
}

/**
 * The order's money, for the always-visible strip.
 *
 * Tax is NOT added here: the draft has no tax figures (tax calculation is deferred — accounting
 * DEFERRALS), so gross == net and the strip must not imply a tax line it never computed.
 */
export function draftMoney(state: OrderDraftState): {
  Total: number;
  Paid: number;
  Balance: number;
  PaymentStatus: OrderPaymentStatus;
} {
  const live = state.Lines.filter((l) => !isOrderLineEmpty(l));
  const Total = computeOrderTotalGross(live.map((l) => lineNet(l)));
  const Paid = state.AmountPaid ?? 0;
  return {
    Total,
    Paid,
    Balance: computeBalance(Total, Paid),
    // Pass the CURRENT status through: derivePaymentStatus's contract is that it never overrides an
    // explicit WrittenOff (an operator action, not a derivation). Passing undefined here would make
    // the strip quietly re-label a written-off order as Unpaid.
    PaymentStatus: derivePaymentStatus(Total, Paid, state.PaymentStatus),
  };
}

/** Why this line can't be saved, or null. */
export function lineIssue(line: OrderDraftLine): string | null {
  if (isOrderLineEmpty(line)) return null;
  const q = parseNum(line.Quantity);
  const u = parseNum(line.UnitPrice);
  const d = discountFraction(line);
  if (!Number.isFinite(q) || !Number.isFinite(u) || !Number.isFinite(d)) return 'Quantity, price and discount must be numbers.';
  if (!line.ProductID) return 'Pick a product.';
  if (q <= 0) return 'Quantity must be greater than zero.';
  if (u < 0) return 'Unit price cannot be negative.';
  // 0–100 in the UI's PERCENT units — which is the DB's 0–1 fraction bound
  // (CK_OrderLine_DiscountPct) expressed in what the operator actually types.
  if (d < 0 || d > 1) return 'Discount must be between 0 and 100 percent.';
  if (line.ServicePeriodStart && line.ServicePeriodEnd && line.ServicePeriodEnd < line.ServicePeriodStart) {
    return 'The service period ends before it starts.';
  }
  return null;
}

/** Every issue blocking a save, in reading order. Empty ⇒ the draft is savable. */
export function orderDraftIssues(state: OrderDraftState): string[] {
  const issues: string[] = [];
  const live = state.Lines.filter((l) => !isOrderLineEmpty(l));

  if (!state.OrderDate) issues.push('Pick an order date.');
  if (live.length === 0) issues.push('An order needs at least one line.');

  for (const [i, l] of live.entries()) {
    const issue = lineIssue(l);
    if (issue) issues.push(`Line ${i + 1}: ${issue}`);
  }
  return issues;
}
