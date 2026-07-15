/**
 * paymentJournalDraft.test — the PURE payment JE assembly (F3): capture/refund sides, fee, balance.
 */
import { describe, it, expect } from 'vitest';
import { buildPaymentJournalDraft, PaymentDraftError, type PaymentDraftInputs } from '@mj-biz-apps/orders-engine-base';

const CASH = 'cash-acct';
const AR = 'ar-acct';
const FEE = 'fee-acct';
const CUST = 'cust-org';

function base(over: Partial<PaymentDraftInputs> = {}): PaymentDraftInputs {
  return { Amount: 100, ProcessingFee: 0, CashAccountID: CASH, ArAccountID: AR, CounterpartyOrganizationID: CUST, EffectiveDate: '2026-07-15', ...over };
}
const dr = (d: ReturnType<typeof buildPaymentJournalDraft>, gl: string) => d.Lines.filter(l => l.GLAccountID === gl).reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
const cr = (d: ReturnType<typeof buildPaymentJournalDraft>, gl: string) => d.Lines.filter(l => l.GLAccountID === gl).reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
const balanced = (d: ReturnType<typeof buildPaymentJournalDraft>) =>
  d.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0) === d.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);

describe('buildPaymentJournalDraft', () => {
  it('a capture with no fee: Dr Cash / Cr A/R (customer-tagged), balanced, EntryType PaymentReceipt', () => {
    const d = buildPaymentJournalDraft(base({ Amount: 100 }));
    expect(dr(d, CASH)).toBe(100);
    expect(cr(d, AR)).toBe(100);
    expect(d.Lines.find(l => l.GLAccountID === AR)?.CounterpartyOrganizationID).toBe(CUST);
    expect(d.EntryType).toBe('PaymentReceipt');
    expect(balanced(d)).toBe(true);
  });

  it('a capture WITH a processing fee: Dr Cash(net) / Dr Fee / Cr A/R(gross), balanced', () => {
    const d = buildPaymentJournalDraft(base({ Amount: 100, ProcessingFee: 5, ProcessingFeeAccountID: FEE }));
    expect(dr(d, CASH)).toBe(95);
    expect(dr(d, FEE)).toBe(5);
    expect(cr(d, AR)).toBe(100);
    expect(balanced(d)).toBe(true);
  });

  it('a refund (negative amount): Cr Cash / Dr A/R — the mirror image, EntryType Refund', () => {
    const d = buildPaymentJournalDraft(base({ Amount: -100 }));
    expect(cr(d, CASH)).toBe(100);
    expect(dr(d, AR)).toBe(100);
    expect(d.EntryType).toBe('Refund');
    expect(balanced(d)).toBe(true);
  });

  it('throws when a fee is supplied without a fee account', () => {
    expect(() => buildPaymentJournalDraft(base({ Amount: 100, ProcessingFee: 5 }))).toThrow(PaymentDraftError);
  });
  it('throws when the fee exceeds the payment', () => {
    expect(() => buildPaymentJournalDraft(base({ Amount: 100, ProcessingFee: 150, ProcessingFeeAccountID: FEE }))).toThrow(PaymentDraftError);
  });
  it('throws on a zero amount', () => {
    expect(() => buildPaymentJournalDraft(base({ Amount: 0 }))).toThrow(PaymentDraftError);
  });
});
