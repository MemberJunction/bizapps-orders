/**
 * orderLifecycle.test — the PURE F1 lifecycle rules: transition matrix (all 36 status pairs),
 * totals math, and the derived-field computations. Offline / no DB (tier-1).
 */
import { describe, it, expect } from 'vitest';
import {
  AllowedTransitions,
  BOOKED_STATUSES,
  isBookedStatus,
  validateTransition,
  computeLineNet,
  computeLineGross,
  computeOrderTotalGross,
  computeBalance,
  derivePaymentStatus,
  deriveDueDate,
  type OrderStatus,
} from '@mj-biz-apps/orders-engine-base';

const ALL_STATUSES: OrderStatus[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'];

describe('order lifecycle — transition matrix', () => {
  it('allows every same-status save (idempotent / non-status edits)', () => {
    for (const s of ALL_STATUSES) expect(validateTransition(s, s).Allowed).toBe(true);
  });

  it('validates all 36 ordered pairs exactly against the DAG (forward-only, skips legal, no backward)', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = from === to || AllowedTransitions[from].includes(to);
        expect(validateTransition(from, to).Allowed, `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('permits forward skips (Draft → Confirmed / Posted / Fulfilled)', () => {
    for (const to of ['Confirmed', 'Posted', 'Fulfilled'] as OrderStatus[]) {
      expect(validateTransition('Draft', to).Allowed).toBe(true);
    }
  });

  it('rejects every backward move with a reason', () => {
    const backward: Array<[OrderStatus, OrderStatus]> = [
      ['Quoted', 'Draft'], ['Confirmed', 'Quoted'], ['Posted', 'Confirmed'], ['Fulfilled', 'Posted'], ['Posted', 'Draft'],
    ];
    for (const [from, to] of backward) {
      const r = validateTransition(from, to);
      expect(r.Allowed, `${from} → ${to}`).toBe(false);
      expect(r.Reason).toMatch(/reversal order/);
    }
  });

  it('allows Voided ONLY from Draft/Quoted', () => {
    expect(validateTransition('Draft', 'Voided').Allowed).toBe(true);
    expect(validateTransition('Quoted', 'Voided').Allowed).toBe(true);
    for (const from of ['Confirmed', 'Posted', 'Fulfilled'] as OrderStatus[]) {
      expect(validateTransition(from, 'Voided').Allowed, `${from} → Voided`).toBe(false);
    }
  });

  it('treats Fulfilled and Voided as terminal (no outgoing transitions)', () => {
    expect(AllowedTransitions.Fulfilled).toEqual([]);
    expect(AllowedTransitions.Voided).toEqual([]);
  });

  it('classifies booked statuses (Confirmed/Posted/Fulfilled) vs unbooked (Draft/Quoted/Voided)', () => {
    expect(BOOKED_STATUSES).toEqual(['Confirmed', 'Posted', 'Fulfilled']);
    for (const s of ['Confirmed', 'Posted', 'Fulfilled'] as OrderStatus[]) expect(isBookedStatus(s)).toBe(true);
    for (const s of ['Draft', 'Quoted', 'Voided'] as OrderStatus[]) expect(isBookedStatus(s)).toBe(false);
  });
});

describe('order lifecycle — totals math', () => {
  it('computes net = qty × price × (1 − discount)', () => {
    expect(computeLineNet(2, 100, null)).toBe(200);
    expect(computeLineNet(2, 100, 0.1)).toBe(180);
    expect(computeLineNet(3, 33.33, 0)).toBe(99.99);
  });

  it('clamps an out-of-range discount to [0,1]', () => {
    expect(computeLineNet(1, 100, -0.5)).toBe(100); // negative → 0
    expect(computeLineNet(1, 100, 1.5)).toBe(0); // >1 → full discount
  });

  it('gross = net + tax (tax 0 in v1)', () => {
    expect(computeLineGross(180, null)).toBe(180);
    expect(computeLineGross(180, 15)).toBe(195);
  });

  it('order total gross sums line grosses (null-safe)', () => {
    expect(computeOrderTotalGross([200, 180, null, 20])).toBe(400);
    expect(computeOrderTotalGross([])).toBe(0);
  });

  it('balance = total − paid (negative = credit owed)', () => {
    expect(computeBalance(400, 150)).toBe(250);
    expect(computeBalance(400, 400)).toBe(0);
    expect(computeBalance(100, 150)).toBe(-50);
    expect(computeBalance(null, null)).toBe(0);
  });
});

describe('order lifecycle — payment status derivation', () => {
  it('Unpaid when nothing paid', () => {
    expect(derivePaymentStatus(400, 0)).toBe('Unpaid');
    expect(derivePaymentStatus(400, null)).toBe('Unpaid');
  });
  it('PartiallyPaid when 0 < paid < total', () => {
    expect(derivePaymentStatus(400, 150)).toBe('PartiallyPaid');
  });
  it('Paid when paid ≥ total (cent tolerance)', () => {
    expect(derivePaymentStatus(400, 400)).toBe('Paid');
    expect(derivePaymentStatus(400, 399.999)).toBe('Paid');
    expect(derivePaymentStatus(400, 500)).toBe('Paid');
  });
  it('never overrides an explicit WrittenOff', () => {
    expect(derivePaymentStatus(400, 0, 'WrittenOff')).toBe('WrittenOff');
    expect(derivePaymentStatus(400, 400, 'WrittenOff')).toBe('WrittenOff');
  });
});

describe('order lifecycle — DueDate derivation', () => {
  it('base date + net days (UTC, date-only)', () => {
    const base = new Date('2026-07-15T00:00:00.000Z');
    const due = deriveDueDate(base, 30);
    expect(due?.toISOString().slice(0, 10)).toBe('2026-08-14');
  });
  it('returns null when no terms (net days null) — caller keeps any manual DueDate', () => {
    expect(deriveDueDate(new Date('2026-07-15T00:00:00Z'), null)).toBeNull();
    expect(deriveDueDate(new Date('2026-07-15T00:00:00Z'), undefined)).toBeNull();
  });
  it('handles month/year rollover', () => {
    const due = deriveDueDate(new Date('2026-12-20T00:00:00Z'), 45);
    expect(due?.toISOString().slice(0, 10)).toBe('2027-02-03');
  });
});
