/**
 * paymentJournalDraft — the PURE assembly of a payment's balanced journal-entry draft (F3).
 *
 * A payment is SINGLE-company (its ReceivingCompanyID), so this builds ONE JournalEntryDraft:
 *   capture (Amount > 0):  Dr Cash (net) / Dr Processing Fee (fee) / Cr A/R (gross)
 *   refund  (Amount < 0):  Cr Cash (net) / Cr Processing Fee (fee) / Dr A/R (gross)
 * where net = |Amount| − fee, gross = |Amount|. The A/R line carries CounterpartyOrganizationID so
 * it lands in the AR-by-customer subledger (vw_AROpenByCustomer). Balanced by construction.
 *
 * Kept pure (no provider/DB) so it is fully unit-testable offline; the server engine resolves the
 * Cash / A/R / Processing-Fee accounts (company-level GLAccountLink roles) and calls this.
 *
 * CONNECTS TO:
 *   CONTRACT: @mj-biz-apps/accounting-engine-base (JournalEntryDraft)
 *   CALLER:   PaymentEntityServer.book (@mj-biz-apps/orders-core-entities-server)
 */
import type { JournalEntryDraft, JournalEntryLineDraft } from '@mj-biz-apps/accounting-engine-base';

export interface PaymentDraftInputs {
  /** SIGNED gross amount: positive = money in (capture), negative = money out (refund/chargeback). */
  Amount: number;
  /** Processing fee (>= 0), 0 for Manual/stub v1. Requires ProcessingFeeAccountID when non-zero. */
  ProcessingFee: number;
  CashAccountID: string;
  ArAccountID: string;
  ProcessingFeeAccountID?: string;
  CounterpartyOrganizationID?: string;
  EffectiveDate: string;
  Description?: string;
}

export class PaymentDraftError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PaymentDraftError';
  }
}

/** Assemble the balanced payment JE. Throws PaymentDraftError on a structurally impossible input. */
export function buildPaymentJournalDraft(inputs: PaymentDraftInputs): JournalEntryDraft {
  const { Amount, ProcessingFee, CashAccountID, ArAccountID, ProcessingFeeAccountID } = inputs;
  if (Amount === 0 || Number.isNaN(Amount)) {
    throw new PaymentDraftError(`Payment amount must be non-zero, got ${Amount}.`);
  }
  const fee = ProcessingFee ?? 0;
  if (fee < 0) throw new PaymentDraftError(`Processing fee must be >= 0, got ${fee}.`);
  if (fee > 0 && !ProcessingFeeAccountID) {
    throw new PaymentDraftError('A processing fee was supplied but no Processing Fee account resolved.');
  }
  const gross = Math.abs(Amount);
  const net = round2(gross - fee);
  if (net < 0) throw new PaymentDraftError(`Processing fee (${fee}) exceeds the payment amount (${gross}).`);

  const lines: JournalEntryLineDraft[] = [];
  // Cash lands (Dr on a capture) net of the fee.
  if (net > 0) lines.push({ GLAccountID: CashAccountID, ...cashSide(Amount, net) });
  if (fee > 0) lines.push({ GLAccountID: ProcessingFeeAccountID!, ...cashSide(Amount, fee) }); // fee expense = same side as cash-out
  // A/R settles (Cr on a capture — the receivable is reduced) for the gross, tagged to the customer.
  lines.push({ GLAccountID: ArAccountID, ...arSettleSide(Amount, gross), CounterpartyOrganizationID: inputs.CounterpartyOrganizationID });

  return {
    EffectiveDate: inputs.EffectiveDate,
    EntryType: Amount >= 0 ? 'PaymentReceipt' : 'Refund',
    Description: inputs.Description,
    Lines: lines,
  };
}

/** Cash/fee side: Dr when money comes IN (positive payment), Cr on a refund. */
function cashSide(amount: number, v: number): { DebitAmount: number } | { CreditAmount: number } {
  return amount >= 0 ? { DebitAmount: v } : { CreditAmount: v };
}
/** A/R settlement side: Cr when a payment REDUCES the receivable (positive), Dr on a refund. */
function arSettleSide(amount: number, v: number): { DebitAmount: number } | { CreditAmount: number } {
  return amount >= 0 ? { CreditAmount: v } : { DebitAmount: v };
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
