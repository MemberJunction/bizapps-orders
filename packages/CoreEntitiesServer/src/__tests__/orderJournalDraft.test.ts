/**
 * Unit tests for the pure order → JE draft builder. No DB, no generated entities, no provider —
 * deterministic and offline (MJ convention: unit tests never touch a database).
 */
import { describe, it, expect } from 'vitest';
import {
  buildOrderJournalDraft,
  OrderDraftError,
  type ResolvedOrderLine,
  type OrderDraftInputs,
} from '../orderJournalDraft.js';

const CO_A = '11111111-1111-1111-1111-111111111111';
const CO_B = '22222222-2222-2222-2222-222222222222';
const AR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SALES_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DEFREV_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SALES_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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
const debits = (d: ReturnType<typeof buildOrderJournalDraft>) =>
  d.Lines.filter(l => l.DebitAmount != null);
const credits = (d: ReturnType<typeof buildOrderJournalDraft>) =>
  d.Lines.filter(l => l.CreditAmount != null);

describe('buildOrderJournalDraft', () => {
  it('books a single immediate line as Dr AR / Cr Sales, balanced', () => {
    const d = buildOrderJournalDraft(inputs([line({ LineIndex: 0, Amount: 250 })], [[CO_A, AR_A]]));
    expect(debits(d)).toEqual([{ GLAccountID: AR_A, DebitAmount: 250 }]);
    expect(credits(d)).toHaveLength(1);
    expect(credits(d)[0].GLAccountID).toBe(SALES_A);
    expect(credits(d)[0].CreditAmount).toBe(250);
    expect(sum(debits(d).map(l => l.DebitAmount!))).toBe(sum(credits(d).map(l => l.CreditAmount!)));
  });

  it('emits Dr lines before Cr lines', () => {
    const d = buildOrderJournalDraft(inputs([line({ LineIndex: 0 })], [[CO_A, AR_A]]));
    expect(d.Lines[0].DebitAmount).toBeDefined();
    expect(d.Lines[d.Lines.length - 1].CreditAmount).toBeDefined();
  });

  it('carries header context (EffectiveDate, EntryType, OrderID, Description)', () => {
    const d = buildOrderJournalDraft(inputs([line({ LineIndex: 0 })], [[CO_A, AR_A]]));
    expect(d.EffectiveDate).toBe('2026-07-06');
    expect(d.EntryType).toBe('OrderBooking');
    expect(d.OrderID).toBe('order-1');
    expect(d.Description).toBe('Order ORD-1');
  });

  it('sums multiple same-company lines into one AR debit, one credit per line', () => {
    const d = buildOrderJournalDraft(
      inputs(
        [
          line({ LineIndex: 0, Amount: 100 }),
          line({ LineIndex: 1, Amount: 50 }),
          line({ LineIndex: 2, Amount: 25.5 }),
        ],
        [[CO_A, AR_A]]
      )
    );
    expect(debits(d)).toHaveLength(1);
    expect(debits(d)[0].DebitAmount).toBe(175.5);
    expect(credits(d)).toHaveLength(3);
    expect(sum(credits(d).map(l => l.CreditAmount!))).toBe(175.5);
  });

  it('splits AR debits per company and balances within each company (AM-4)', () => {
    const d = buildOrderJournalDraft(
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
      )
    );
    const arA = debits(d).find(l => l.GLAccountID === AR_A);
    const arB = debits(d).find(l => l.GLAccountID === AR_B);
    expect(arA?.DebitAmount).toBe(140);
    expect(arB?.DebitAmount).toBe(300);
    // Per-company balance: company A credits (100+40) == its AR debit (140); B: 300 == 300.
    const coACredits = credits(d).filter(l => l.GLAccountID === SALES_A);
    expect(sum(coACredits.map(l => l.CreditAmount!))).toBe(140);
    // Overall balance
    expect(sum(debits(d).map(l => l.DebitAmount!))).toBe(sum(credits(d).map(l => l.CreditAmount!)));
  });

  it('keeps distinct revenue accounts for mixed Immediate / Deferred lines', () => {
    const d = buildOrderJournalDraft(
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
    const d = buildOrderJournalDraft(
      inputs(
        [line({ LineIndex: 0, OrderLineID: 'ol-9', Description: 'Widget x2' })],
        [[CO_A, AR_A]]
      )
    );
    expect(credits(d)[0].OrderLineID).toBe('ol-9');
    expect(credits(d)[0].Description).toBe('Widget x2');
  });

  it('throws OrderDraftError on an order with no lines', () => {
    expect(() => buildOrderJournalDraft(inputs([], [[CO_A, AR_A]]))).toThrow(OrderDraftError);
  });

  it('throws OrderDraftError on a non-positive line amount', () => {
    expect(() => buildOrderJournalDraft(inputs([line({ LineIndex: 0, Amount: 0 })], [[CO_A, AR_A]]))).toThrow(
      OrderDraftError
    );
    expect(() => buildOrderJournalDraft(inputs([line({ LineIndex: 0, Amount: -5 })], [[CO_A, AR_A]]))).toThrow(
      OrderDraftError
    );
  });

  it('throws OrderDraftError when a company has no resolved AR account', () => {
    expect(() =>
      buildOrderJournalDraft(inputs([line({ LineIndex: 0, CompanyID: CO_B })], [[CO_A, AR_A]]))
    ).toThrow(/No Accounts Receivable account resolved for company/);
  });
});
