/**
 * orderJournalDraft — the PURE assembly of an order's balanced journal-entry draft.
 *
 * This module has ZERO dependency on generated entities or a live provider: it takes the
 * ALREADY-RESOLVED GL account IDs (the recognition-type → role decision and the
 * product → category → company link walk happen in OrdersEngine, which owns the accounting
 * caches) plus per-line amounts, and produces the typed {@link JournalEntryDraft} the
 * `Accounting.CreateJournalEntry` operation consumes. Kept pure so it is fully unit-testable
 * offline (mirrors accounting's pure pipeline.ts).
 *
 * The booking, for an order of Immediate + Deferred lines across one or more companies:
 *   Dr  Accounts Receivable   (per company — the sum of that company's line amounts)
 *   Cr  Sales / Deferred Revenue (per line — the resolved revenue account)
 * Balanced overall AND within each company (AM-4) by construction: each company's AR debit
 * equals the exact sum of that company's revenue credits.
 *
 * The engine merges duplicate (account + dimensions) same-side lines and orders debits before
 * credits (S8), so this builder emits raw per-line credits without pre-merging.
 *
 * CONNECTS TO:
 *   CONTRACT: @mj-biz-apps/accounting-engine-base (JournalEntryDraft, JournalEntryLineDraft)
 *   CALLER:   OrdersEngine.buildDraftForOrder → CreateJournalEntryOperation.Execute
 *   DOC:      repos/apps/bizapps-orders/plans/2026-07-02-engine-meeting-amendment.md §4
 */
import type { JournalEntryDraft, JournalEntryLineDraft } from '@mj-biz-apps/accounting-engine-base';

/** One order line after account resolution — everything the draft needs, nothing it doesn't. */
export interface ResolvedOrderLine {
  /** 0-based index into the originating order's lines (for error messages / traceability). */
  LineIndex: number;
  /** Soft lineage ref to the originating OrderLine (nullable FK on JournalEntryLine). */
  OrderLineID?: string;
  /** Quantity * UnitPrice — must be strictly > 0. */
  Amount: number;
  /** The resolved revenue GL account (Sales for Immediate, Deferred Revenue for Deferred). */
  RevenueAccountID: string;
  /** The revenue account's company — drives per-company AR + the per-company balance (AM-4). */
  CompanyID: string;
  /** Optional line description carried onto the JE credit line. */
  Description?: string;
}

/** Header-level context for the order-booking journal entry. */
export interface OrderJournalContext {
  /** ISO date the entry takes effect (the order date). */
  EffectiveDate: string;
  /** Derived from the contract (which derives from the accounting entity — rule 2c). */
  EntryType: JournalEntryDraft['EntryType'];
  /** Soft lineage ref back to the originating order. */
  OrderID?: string;
  Description?: string;
}

export interface OrderDraftInputs {
  Lines: ResolvedOrderLine[];
  /** companyID → resolved AR GLAccountID (the company's default Accounts Receivable account). */
  ArAccountByCompany: Map<string, string>;
  Context: OrderJournalContext;
}

/**
 * Thrown for a PROGRAMMER-level assembly error (empty order, non-positive amount, or a company
 * with no resolved AR account). These indicate the resolution step upstream failed to do its
 * job — they are not user-facing validation (the engine surfaces typed JEValidationErrors for
 * that). Callers catch this and reservoir the failure rather than let it vanish.
 */
export class OrderDraftError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OrderDraftError';
  }
}

/** Sum each company's line amounts → the amount its AR account is debited. */
function sumAmountByCompany(lines: ResolvedOrderLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.CompanyID, (totals.get(line.CompanyID) ?? 0) + line.Amount);
  }
  return totals;
}

/** One credit line per order line, to its resolved revenue account. */
function buildCreditLines(lines: ResolvedOrderLine[]): JournalEntryLineDraft[] {
  return lines.map(line => ({
    GLAccountID: line.RevenueAccountID,
    CreditAmount: line.Amount,
    OrderLineID: line.OrderLineID,
    Description: line.Description,
  }));
}

/** One AR debit line per company, for that company's total. Fails if an AR account is missing. */
function buildDebitLines(
  totalsByCompany: Map<string, number>,
  arAccountByCompany: Map<string, string>
): JournalEntryLineDraft[] {
  const debits: JournalEntryLineDraft[] = [];
  for (const [companyID, total] of totalsByCompany) {
    const arAccountID = arAccountByCompany.get(companyID);
    if (!arAccountID) {
      throw new OrderDraftError(
        `No Accounts Receivable account resolved for company ${companyID}; cannot book the order.`
      );
    }
    debits.push({ GLAccountID: arAccountID, DebitAmount: total });
  }
  return debits;
}

/** Reject empty orders and non-positive line amounts before assembling anything. */
function assertLinesValid(lines: ResolvedOrderLine[]): void {
  if (lines.length === 0) {
    throw new OrderDraftError('Cannot book an order with no lines.');
  }
  for (const line of lines) {
    if (!(line.Amount > 0)) {
      throw new OrderDraftError(
        `Order line ${line.LineIndex} has a non-positive amount (${line.Amount}); every booked line must be > 0.`
      );
    }
  }
}

/**
 * Assemble the balanced order-booking draft. Debits (AR, per company) precede credits (revenue,
 * per line) — the engine re-orders and merges anyway, but emitting Dr-first keeps the draft
 * readable. Throws {@link OrderDraftError} for structurally impossible inputs.
 */
export function buildOrderJournalDraft(inputs: OrderDraftInputs): JournalEntryDraft {
  const { Lines, ArAccountByCompany, Context } = inputs;
  assertLinesValid(Lines);
  const totalsByCompany = sumAmountByCompany(Lines);
  const debitLines = buildDebitLines(totalsByCompany, ArAccountByCompany);
  const creditLines = buildCreditLines(Lines);
  return {
    EffectiveDate: Context.EffectiveDate,
    EntryType: Context.EntryType,
    OrderID: Context.OrderID,
    Description: Context.Description,
    Lines: [...debitLines, ...creditLines],
  };
}
