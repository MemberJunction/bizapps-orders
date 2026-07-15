/**
 * Unit tests for the pure order → JE drafts builder (ONE DRAFT PER COMPANY — MOD-11/F1.2).
 * No DB, no generated entities, no provider — deterministic and offline (MJ convention:
 * unit tests never touch a database).
 */
import { describe, it, expect } from 'vitest';
import {
  buildOrderJournalDrafts,
  OrderDraftError,
  type ResolvedOrderLine,
  type OrderDraftInputs,
} from '@mj-biz-apps/orders-engine-base';
import type { JournalEntryDraft } from '@mj-biz-apps/accounting-engine-base';

const CO_A = '11111111-1111-1111-1111-111111111111';
const CO_B = '22222222-2222-2222-2222-222222222222';
const CO_C = '33333333-3333-3333-3333-333333333333';
const AR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AR_C = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const SALES_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DEFREV_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SALES_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SALES_C = '99999999-9999-9999-9999-999999999999';

function line(overrides: Partial<ResolvedOrderLine> & Pick<ResolvedOrderLine, 'LineIndex'>): ResolvedOrderLine {
  return {
    Amount: 100,
    RevenueAccountID: SALES_A,
    CompanyID: CO_A,
    ...overrides,
  };
}

function inputs(lines: ResolvedOrderLine[], ar: Array<[string, string]>): OrderDraftInputs {
  return {
    Lines: lines,
    ArAccountByCompany: new Map(ar),
    Context: {
      EffectiveDate: '2026-07-06',
      EntryType: 'OrderBooking',
      OrderID: 'order-1',
      Description: 'Order ORD-1',
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const debits = (d: JournalEntryDraft) => d.Lines.filter(l => l.DebitAmount != null);
const credits = (d: JournalEntryDraft) => d.Lines.filter(l => l.CreditAmount != null);
const isBalanced = (d: JournalEntryDraft) =>
  sum(debits(d).map(l => l.DebitAmount!)) === sum(credits(d).map(l => l.CreditAmount!));

describe('buildOrderJournalDrafts — single company', () => {
  it('books a single immediate line as ONE draft: Dr AR / Cr Sales, balanced', () => {
    const ds = buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: 250 })], [[CO_A, AR_A]]));
    expect(ds).toHaveLength(1);
    const d = ds[0];
    expect(debits(d)).toEqual([{ GLAccountID: AR_A, DebitAmount: 250 }]);
    expect(credits(d)).toHaveLength(1);
    expect(credits(d)[0].GLAccountID).toBe(SALES_A);
    expect(credits(d)[0].CreditAmount).toBe(250);
    expect(isBalanced(d)).toBe(true);
  });

  it('emits Dr lines before Cr lines', () => {
    const [d] = buildOrderJournalDrafts(inputs([line({ LineIndex: 0 })], [[CO_A, AR_A]]));
    expect(d.Lines[0].DebitAmount).toBeDefined();
    expect(d.Lines[d.Lines.length - 1].CreditAmount).toBeDefined();
  });

  it('carries header context (EffectiveDate, EntryType, OrderID, Description) onto every draft', () => {
    const [d] = buildOrderJournalDrafts(inputs([line({ LineIndex: 0 })], [[CO_A, AR_A]]));
    expect(d.EffectiveDate).toBe('2026-07-06');
    expect(d.EntryType).toBe('OrderBooking');
    expect(d.OrderID).toBe('order-1');
    expect(d.Description).toBe('Order ORD-1');
  });

  it('sums multiple same-company lines into one AR debit, one credit per line', () => {
    const ds = buildOrderJournalDrafts(
      inputs(
        [
          line({ LineIndex: 0, Amount: 100 }),
          line({ LineIndex: 1, Amount: 50 }),
          line({ LineIndex: 2, Amount: 25.5 }),
        ],
        [[CO_A, AR_A]]
      )
    );
    expect(ds).toHaveLength(1);
    const d = ds[0];
    expect(debits(d)).toHaveLength(1);
    expect(debits(d)[0].DebitAmount).toBe(175.5);
    expect(credits(d)).toHaveLength(3);
    expect(sum(credits(d).map(l => l.CreditAmount!))).toBe(175.5);
  });

  it('keeps distinct revenue accounts for mixed Immediate / Deferred lines in one draft', () => {
    const [d] = buildOrderJournalDrafts(
      inputs(
        [
          line({ LineIndex: 0, Amount: 100, RevenueAccountID: SALES_A }),
          line({ LineIndex: 1, Amount: 60, RevenueAccountID: DEFREV_A }),
        ],
        [[CO_A, AR_A]]
      )
    );
    const creditAccounts = credits(d).map(l => l.GLAccountID).sort();
    expect(creditAccounts).toEqual([SALES_A, DEFREV_A].sort());
    expect(debits(d)[0].DebitAmount).toBe(160);
  });

  it('carries OrderLineID and Description onto the credit lines', () => {
    const [d] = buildOrderJournalDrafts(
      inputs([line({ LineIndex: 0, OrderLineID: 'ol-9', Description: 'Widget x2' })], [[CO_A, AR_A]])
    );
    expect(credits(d)[0].OrderLineID).toBe('ol-9');
    expect(credits(d)[0].Description).toBe('Widget x2');
  });
});

describe('buildOrderJournalDrafts — per-company split (MOD-11)', () => {
  const twoCompanyInputs = () =>
    inputs(
      [
        line({ LineIndex: 0, Amount: 100, CompanyID: CO_A, RevenueAccountID: SALES_A }),
        line({ LineIndex: 1, Amount: 300, CompanyID: CO_B, RevenueAccountID: SALES_B }),
        line({ LineIndex: 2, Amount: 40, CompanyID: CO_A, RevenueAccountID: SALES_A }),
      ],
      [
        [CO_A, AR_A],
        [CO_B, AR_B],
      ]
    );

  it('emits ONE draft PER company — each single-company and balanced', () => {
    const ds = buildOrderJournalDrafts(twoCompanyInputs());
    expect(ds).toHaveLength(2);
    for (const d of ds) expect(isBalanced(d)).toBe(true);
    const draftA = ds.find(d => debits(d)[0].GLAccountID === AR_A)!;
    const draftB = ds.find(d => debits(d)[0].GLAccountID === AR_B)!;
    expect(draftA.Lines.every(l => l.GLAccountID === AR_A || l.GLAccountID === SALES_A)).toBe(true);
    expect(draftB.Lines.every(l => l.GLAccountID === AR_B || l.GLAccountID === SALES_B)).toBe(true);
  });

  it("each company's AR debit equals exactly that company's credit total", () => {
    const ds = buildOrderJournalDrafts(twoCompanyInputs());
    const draftA = ds.find(d => debits(d)[0].GLAccountID === AR_A)!;
    const draftB = ds.find(d => debits(d)[0].GLAccountID === AR_B)!;
    expect(debits(draftA)[0].DebitAmount).toBe(140);
    expect(credits(draftA)).toHaveLength(2);
    expect(sum(credits(draftA).map(l => l.CreditAmount!))).toBe(140);
    expect(debits(draftB)[0].DebitAmount).toBe(300);
    expect(credits(draftB)).toHaveLength(1);
  });

  it('draft order follows first appearance of each company in the line list (stable)', () => {
    const ds = buildOrderJournalDrafts(twoCompanyInputs());
    expect(debits(ds[0])[0].GLAccountID).toBe(AR_A); // CO_A appears first (line 0)
    expect(debits(ds[1])[0].GLAccountID).toBe(AR_B);
  });

  it('three companies → three drafts, all header context identical', () => {
    const ds = buildOrderJournalDrafts(
      inputs(
        [
          line({ LineIndex: 0, Amount: 10, CompanyID: CO_A, RevenueAccountID: SALES_A }),
          line({ LineIndex: 1, Amount: 20, CompanyID: CO_B, RevenueAccountID: SALES_B }),
          line({ LineIndex: 2, Amount: 30, CompanyID: CO_C, RevenueAccountID: SALES_C }),
        ],
        [
          [CO_A, AR_A],
          [CO_B, AR_B],
          [CO_C, AR_C],
        ]
      )
    );
    expect(ds).toHaveLength(3);
    for (const d of ds) {
      expect(d.OrderID).toBe('order-1');
      expect(d.EntryType).toBe('OrderBooking');
      expect(isBalanced(d)).toBe(true);
    }
  });

  it('interleaved company lines still group correctly (A,B,A,B)', () => {
    const ds = buildOrderJournalDrafts(
      inputs(
        [
          line({ LineIndex: 0, Amount: 1, CompanyID: CO_A }),
          line({ LineIndex: 1, Amount: 2, CompanyID: CO_B, RevenueAccountID: SALES_B }),
          line({ LineIndex: 2, Amount: 3, CompanyID: CO_A }),
          line({ LineIndex: 3, Amount: 4, CompanyID: CO_B, RevenueAccountID: SALES_B }),
        ],
        [
          [CO_A, AR_A],
          [CO_B, AR_B],
        ]
      )
    );
    expect(ds).toHaveLength(2);
    expect(debits(ds[0])[0].DebitAmount).toBe(4); // A: 1+3
    expect(debits(ds[1])[0].DebitAmount).toBe(6); // B: 2+4
  });
});

describe('buildOrderJournalDrafts — reversals (signed amounts, F2)', () => {
  it('books a full reversal as the MIRROR image: Cr AR / Dr revenue, balanced', () => {
    const [d] = buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: -250 })], [[CO_A, AR_A]]));
    expect(credits(d)).toEqual([{ GLAccountID: AR_A, CreditAmount: 250 }]); // AR credited — we owe the customer
    expect(debits(d)).toHaveLength(1);
    expect(debits(d)[0].GLAccountID).toBe(SALES_A);
    expect(debits(d)[0].DebitAmount).toBe(250); // revenue debited — reversed
    expect(isBalanced(d)).toBe(true);
  });

  it('a partial reversal (mixed +/- lines) nets correctly and balances', () => {
    const [d] = buildOrderJournalDrafts(inputs([
      line({ LineIndex: 0, Amount: 100, RevenueAccountID: SALES_A }),
      line({ LineIndex: 1, Amount: -30, RevenueAccountID: SALES_A }),
    ], [[CO_A, AR_A]]));
    expect(debits(d).find(l => l.GLAccountID === AR_A)?.DebitAmount).toBe(70); // net 70 owed → Dr AR
    expect(credits(d).find(l => l.GLAccountID === SALES_A)?.CreditAmount).toBe(100);
    expect(debits(d).find(l => l.GLAccountID === SALES_A)?.DebitAmount).toBe(30);
    expect(isBalanced(d)).toBe(true);
  });

  it('a reversal and its original NET TO ZERO across the pair (per account)', () => {
    const [orig] = buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: 250 })], [[CO_A, AR_A]]));
    const [rev] = buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: -250 })], [[CO_A, AR_A]]));
    const net = (gl: string) =>
      sum([orig, rev].flatMap(d => d.Lines.filter(l => l.GLAccountID === gl).map(l => (l.DebitAmount ?? 0) - (l.CreditAmount ?? 0))));
    expect(net(AR_A)).toBe(0);
    expect(net(SALES_A)).toBe(0);
  });
});

describe('buildOrderJournalDrafts — structural errors', () => {
  it('throws OrderDraftError on an order with no lines', () => {
    expect(() => buildOrderJournalDrafts(inputs([], [[CO_A, AR_A]]))).toThrow(OrderDraftError);
  });

  it('throws OrderDraftError on a ZERO line amount (a negative amount is legal — reversals, F2)', () => {
    expect(() => buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: 0 })], [[CO_A, AR_A]]))).toThrow(
      OrderDraftError
    );
    // negative is NOT an error anymore — it books the mirror image (asserted in the reversals suite).
    expect(() => buildOrderJournalDrafts(inputs([line({ LineIndex: 0, Amount: -5 })], [[CO_A, AR_A]]))).not.toThrow();
  });

  it('throws OrderDraftError when ANY company lacks a resolved AR account (even mid-split)', () => {
    expect(() =>
      buildOrderJournalDrafts(inputs([line({ LineIndex: 0, CompanyID: CO_B })], [[CO_A, AR_A]]))
    ).toThrow(/No Accounts Receivable account resolved for company/);
    // combination: first company resolvable, second not — the whole build must fail (all-or-nothing)
    expect(() =>
      buildOrderJournalDrafts(
        inputs(
          [
            line({ LineIndex: 0, CompanyID: CO_A }),
            line({ LineIndex: 1, CompanyID: CO_B, RevenueAccountID: SALES_B }),
          ],
          [[CO_A, AR_A]]
        )
      )
    ).toThrow(OrderDraftError);
  });
});
