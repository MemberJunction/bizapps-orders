import { describe, it, expect } from 'vitest';
import {
  autoApplyOldestFirst,
  sortOldestFirst,
  totalApplied,
  unapplied,
  applicationIssues,
  remainderLabel,
  parseAmount,
  type OpenOrderRow,
} from '../lib/custom/shell/pages/payment-application';

/**
 * Tier 1 for the payment-application seam (§13.2).
 *
 * This is real money being split across real invoices — every assertion is an exact figure. The
 * mockup's own scenario ($10,000 across three orders) is the canonical case.
 */

const ORDERS: OpenOrderRow[] = [
  { OrderID: 'o-1029', OrderNumber: 'ORD-1029', DueDate: '2026-06-20', Balance: 4901 },
  { OrderID: 'o-1042', OrderNumber: 'ORD-1042', DueDate: '2026-08-01', Balance: 5099 },
  { OrderID: 'o-1051', OrderNumber: 'ORD-1051', DueDate: '2026-08-15', Balance: 3250 },
];

describe('parseAmount', () => {
  it('strips thousands separators', () => {
    expect(parseAmount('10,000.00')).toBe(10000);
  });
  it('treats blank as zero', () => {
    expect(parseAmount('')).toBe(0);
  });
  it('returns NaN for a typo', () => {
    expect(Number.isNaN(parseAmount('1o'))).toBe(true);
  });
});

describe('sortOldestFirst', () => {
  it('orders by due date, earliest first', () => {
    expect(sortOldestFirst(ORDERS).map((o) => o.OrderNumber)).toEqual(['ORD-1029', 'ORD-1042', 'ORD-1051']);
  });

  it('sorts an UNDATED order last — it cannot be shown to be overdue', () => {
    const withUndated = [{ OrderID: 'x', OrderNumber: 'ORD-9999', DueDate: null, Balance: 100 }, ...ORDERS];
    expect(sortOldestFirst(withUndated).map((o) => o.OrderNumber).at(-1)).toBe('ORD-9999');
  });
});

describe('autoApplyOldestFirst', () => {
  it("reproduces the mockup: $10,000 fills the two oldest and leaves the third at zero", () => {
    const a = autoApplyOldestFirst(10000, ORDERS);
    expect(a['o-1029']).toBe('4901.00');
    expect(a['o-1042']).toBe('5099.00');
    expect(a['o-1051']).toBe('0.00');
    expect(unapplied(10000, a)).toBe(0);
  });

  it('partially fills the order the money runs out on — never rounds it up', () => {
    const a = autoApplyOldestFirst(6000, ORDERS);
    expect(a['o-1029']).toBe('4901.00');
    expect(a['o-1042']).toBe('1099.00');
    expect(a['o-1051']).toBe('0.00');
    expect(totalApplied(a)).toBe(6000);
  });

  it('NEVER over-applies an order beyond its own balance', () => {
    const a = autoApplyOldestFirst(999999, ORDERS);
    expect(a['o-1029']).toBe('4901.00');
    expect(a['o-1042']).toBe('5099.00');
    expect(a['o-1051']).toBe('3250.00');
    // The surplus stays UNAPPLIED — it must not be forced onto the last order.
    expect(unapplied(999999, a)).toBe(986749);
  });

  it('applies nothing for a zero payment', () => {
    const a = autoApplyOldestFirst(0, ORDERS);
    expect(totalApplied(a)).toBe(0);
  });

  it('treats a negative payment as zero rather than clawing money back', () => {
    expect(totalApplied(autoApplyOldestFirst(-500, ORDERS))).toBe(0);
  });

  it('keeps cents exact across a split (no float dust)', () => {
    const orders: OpenOrderRow[] = [
      { OrderID: 'a', OrderNumber: 'A', DueDate: '2026-01-01', Balance: 0.1 },
      { OrderID: 'b', OrderNumber: 'B', DueDate: '2026-01-02', Balance: 0.2 },
    ];
    const a = autoApplyOldestFirst(0.3, orders);
    expect(totalApplied(a)).toBe(0.3);
    expect(unapplied(0.3, a)).toBe(0);
  });
});

describe('applicationIssues', () => {
  it('accepts the mockup allocation', () => {
    expect(applicationIssues(10000, ORDERS, autoApplyOldestFirst(10000, ORDERS))).toEqual([]);
  });

  it('rejects a zero payment', () => {
    expect(applicationIssues(0, ORDERS, {}).some((i) => /greater than zero/i.test(i))).toBe(true);
  });

  it('rejects applying more than an order owes (that would be a credit — a different flow)', () => {
    const bad = { 'o-1029': '9000.00', 'o-1042': '0', 'o-1051': '0' };
    expect(applicationIssues(10000, ORDERS, bad).some((i) => /exceeds its 4901.00 balance/i.test(i))).toBe(true);
  });

  it('rejects applying more than the payment itself', () => {
    const bad = { 'o-1029': '4901.00', 'o-1042': '5099.00', 'o-1051': '3250.00' };
    expect(applicationIssues(10000, ORDERS, bad).some((i) => /more than the 10000.00 payment/i.test(i))).toBe(true);
  });

  it('rejects a negative allocation', () => {
    expect(applicationIssues(100, ORDERS, { 'o-1029': '-5' }).some((i) => /negative/i.test(i))).toBe(true);
  });

  it('rejects an unparseable allocation rather than treating it as zero', () => {
    expect(applicationIssues(100, ORDERS, { 'o-1029': '5o' }).some((i) => /must be a number/i.test(i))).toBe(true);
  });
});

describe('remainderLabel', () => {
  it('claims "fully applied" only when nothing is left', () => {
    expect(remainderLabel(10000, autoApplyOldestFirst(10000, ORDERS))).toMatch(/Fully applied/);
  });

  it('reports the exact unapplied remainder', () => {
    expect(remainderLabel(10000, { 'o-1029': '4901.00' })).toBe('5099.00 unapplied');
  });

  it('reports over-application rather than pretending it is fine', () => {
    expect(remainderLabel(100, { 'o-1029': '150.00' })).toBe('Over-applied by 50.00');
  });
});
