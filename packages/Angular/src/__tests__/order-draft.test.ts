import { describe, it, expect } from 'vitest';
import {
  newOrderLine,
  parseNum,
  isOrderLineEmpty,
  lineNet,
  discountFraction,
  lineIssue,
  draftMoney,
  orderDraftIssues,
  type OrderDraftLine,
  type OrderDraftState,
} from '../lib/custom/shell/pages/order-draft';

/**
 * Tier 1 for the Order editor's pure seam (§13.1).
 *
 * These rules are what an operator feels while composing an order, and what the money strip claims.
 * Exact values matter: the strip is the number a salesperson quotes a customer.
 */

function line(over: Partial<OrderDraftLine> = {}): OrderDraftLine {
  return { ...newOrderLine('k'), ...over };
}

/** The mockup's own order: 10 × 1,200 = 12,000 and 3 × 1,033 = 3,099 → 15,099. */
function mockupDraft(over: Partial<OrderDraftState> = {}): OrderDraftState {
  return {
    Status: 'Draft',
    CustomerOrganizationID: null,
    OrderDate: '2026-07-16',
    DueDate: null,
    PaymentTermsTypeID: null,
    ExternalDocumentNumber: '',
    Description: '',
    AmountPaid: 0,
    PaymentStatus: null,
    Lines: [
      line({ Key: 'a', ProductID: 'p-membership', Quantity: '10', UnitPrice: '1200.00', DiscountPct: '0' }),
      line({ Key: 'b', ProductID: 'p-ticket', Quantity: '3', UnitPrice: '1033.00', DiscountPct: '0' }),
    ],
    ...over,
  };
}

describe('parseNum', () => {
  it('reads a plain decimal', () => {
    expect(parseNum('1200.00')).toBe(1200);
  });

  it('strips thousands separators a salesperson will paste in', () => {
    expect(parseNum('1,200.00')).toBe(1200);
  });

  it('treats blank as zero', () => {
    expect(parseNum('')).toBe(0);
  });

  it('returns NaN for a typo rather than silently pricing at zero', () => {
    expect(Number.isNaN(parseNum('12o0'))).toBe(true);
  });
});

describe('isOrderLineEmpty', () => {
  it('is true for an untouched row', () => {
    expect(isOrderLineEmpty(line())).toBe(true);
  });

  it('is false once a product is picked', () => {
    expect(isOrderLineEmpty(line({ ProductID: 'p1' }))).toBe(false);
  });
});

describe('lineNet', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineNet(line({ ProductID: 'p', Quantity: '10', UnitPrice: '1200.00', DiscountPct: '0' }))).toBe(12000);
  });

  /**
   * THE UNIT BOUNDARY (see order-draft.discountFraction). The operator types a PERCENT; the column
   * stores a FRACTION (DECIMAL(7,4), CK_OrderLine_DiscountPct 0..1) and computeLineNet multiplies by
   * (1 − DiscountPct). Passing the typed 10 straight through means 1000% off → clamped → a FREE
   * line, and a DB CHECK violation on save. These pin the conversion.
   */
  it('reads the discount column as a PERCENT: 10 means 10% off, not 1000%', () => {
    expect(lineNet(line({ ProductID: 'p', Quantity: '2', UnitPrice: '100', DiscountPct: '10' }))).toBe(180);
  });

  it('does not make a line free at a plausible discount (the 1000%-off regression)', () => {
    // Before the fix this returned 0 — the clamp turned "10% off" into "free".
    expect(lineNet(line({ ProductID: 'p', Quantity: '1', UnitPrice: '500', DiscountPct: '25' }))).toBe(375);
  });

  it('treats 100 as a full discount, not 10000%', () => {
    expect(lineNet(line({ ProductID: 'p', Quantity: '3', UnitPrice: '40', DiscountPct: '100' }))).toBe(0);
  });

  it('contributes 0 for an unparseable amount rather than NaN-poisoning the order total', () => {
    expect(lineNet(line({ ProductID: 'p', Quantity: 'oops', UnitPrice: '100' }))).toBe(0);
  });
});

describe('discountFraction', () => {
  it('converts the typed percent to the stored fraction the DB CHECK allows', () => {
    expect(discountFraction(line({ DiscountPct: '10' }))).toBeCloseTo(0.1, 10);
    expect(discountFraction(line({ DiscountPct: '0' }))).toBe(0);
    expect(discountFraction(line({ DiscountPct: '100' }))).toBe(1);
  });

  it('propagates a typo as NaN rather than pricing at full', () => {
    expect(Number.isNaN(discountFraction(line({ DiscountPct: '1o' })))).toBe(true);
  });
});

describe('draftMoney', () => {
  it("foots the mockup's order to 15,099", () => {
    const m = draftMoney(mockupDraft());
    expect(m.Total).toBe(15099);
    expect(m.Paid).toBe(0);
    expect(m.Balance).toBe(15099);
    expect(m.PaymentStatus).toBe('Unpaid');
  });

  it('ignores empty rows so a trailing blank line does not change the quote', () => {
    const d = mockupDraft();
    d.Lines.push(line({ Key: 'blank' }));
    expect(draftMoney(d).Total).toBe(15099);
  });

  it('nets the balance down against a part payment and says PartiallyPaid', () => {
    const m = draftMoney(mockupDraft({ AmountPaid: 5000 }));
    expect(m.Balance).toBe(10099);
    expect(m.PaymentStatus).toBe('PartiallyPaid');
  });

  it('reports Paid once the balance is settled', () => {
    const m = draftMoney(mockupDraft({ AmountPaid: 15099 }));
    expect(m.Balance).toBe(0);
    expect(m.PaymentStatus).toBe('Paid');
  });

  it('NEVER re-derives an explicit WrittenOff away — it is an operator action, not a derivation', () => {
    // The regression this pins: passing no current status would relabel this order "Unpaid".
    const m = draftMoney(mockupDraft({ AmountPaid: 0, PaymentStatus: 'WrittenOff' }));
    expect(m.PaymentStatus).toBe('WrittenOff');
  });
});

describe('lineIssue', () => {
  it('passes a well-formed line', () => {
    expect(lineIssue(line({ ProductID: 'p', Quantity: '1', UnitPrice: '10' }))).toBeNull();
  });

  it('ignores an untouched row', () => {
    expect(lineIssue(line())).toBeNull();
  });

  it('requires a product', () => {
    expect(lineIssue(line({ Quantity: '1', UnitPrice: '10' }))).toMatch(/product/i);
  });

  it('rejects a zero or negative quantity', () => {
    expect(lineIssue(line({ ProductID: 'p', Quantity: '0', UnitPrice: '10' }))).toMatch(/greater than zero/i);
  });

  it('rejects a negative unit price', () => {
    expect(lineIssue(line({ ProductID: 'p', Quantity: '1', UnitPrice: '-5' }))).toMatch(/negative/i);
  });

  it('rejects a discount outside 0–100', () => {
    expect(lineIssue(line({ ProductID: 'p', Quantity: '1', UnitPrice: '10', DiscountPct: '150' }))).toMatch(/between 0 and 100/i);
  });

  it('rejects a service period that ends before it starts', () => {
    const l = line({ ProductID: 'p', Quantity: '1', UnitPrice: '10', ServicePeriodStart: '2027-01-01', ServicePeriodEnd: '2026-01-01' });
    expect(lineIssue(l)).toMatch(/ends before it starts/i);
  });
});

describe('orderDraftIssues', () => {
  it('accepts the mockup order', () => {
    expect(orderDraftIssues(mockupDraft())).toEqual([]);
  });

  it('requires at least one line', () => {
    const d = mockupDraft({ Lines: [line({ Key: 'blank' })] });
    expect(orderDraftIssues(d).some((i) => /at least one line/i.test(i))).toBe(true);
  });

  it('requires an order date', () => {
    expect(orderDraftIssues(mockupDraft({ OrderDate: '' })).some((i) => /order date/i.test(i))).toBe(true);
  });

  it('numbers issues by LIVE line, so a blank row above does not shift the label', () => {
    const d = mockupDraft({
      Lines: [line({ Key: 'blank' }), line({ Key: 'a', ProductID: 'p', Quantity: '0', UnitPrice: '10' })],
    });
    expect(orderDraftIssues(d).some((i) => i.startsWith('Line 1:'))).toBe(true);
  });
});
