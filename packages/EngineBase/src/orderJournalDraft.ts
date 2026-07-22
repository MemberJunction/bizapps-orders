/**
 * orderJournalDraft — the PURE assembly of an order's balanced journal-entry drafts,
 * ONE PER COMPANY (MOD-11, 2026-07-13 — restores master §5/§7 per-company JEs).
 *
 * This module has ZERO dependency on generated entities or a live provider: it takes the
 * ALREADY-RESOLVED GL account IDs (the recognition-type → role decision and the
 * product → category → company link walk happen in OrdersEngine, which owns the accounting
 * caches) plus per-line amounts, groups the lines by their resolved company, and produces one
 * typed {@link JournalEntryDraft} per company for the `Accounting.CreateJournalEntry`
 * operation (accounting MOD-12: a JE is single-company; mixed drafts are rejected with
 * MULTI_COMPANY_DRAFT). Kept pure so it is fully unit-testable offline.
 *
 * Each company's draft:
 *   Dr  Accounts Receivable      (that company's line-amount total)
 *   Cr  Sales / Deferred Revenue (per line — the resolved revenue account)
 * Balanced by construction: the AR debit equals the exact sum of that company's credits.
 *
 * The engine merges duplicate (account + dimensions) same-side lines and orders debits before
 * credits, so this builder emits raw per-line credits without pre-merging.
 *
 * CONNECTS TO:
 *   CONTRACT: @mj-biz-apps/accounting-engine-base (JournalEntryDraft, JournalEntryLineDraft)
 *   CALLER:   OrdersEngine.buildDraftsForOrder → CreateJournalEntryOperation.Execute (per draft)
 *   DOC:      MASTER-PLAN-MODIFICATIONS MOD-11 · feature plan F1.2
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
  /** The order's customer — tagged on the AR line for AR-by-customer (vw_AROpenByCustomer). */
  CounterpartyOrganizationID?: string;
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

/**
 * One revenue line per order line, on the SIGN-correct side (F2 reversals): a normal (positive)
 * line CREDITS revenue; a reversal (negative) line DEBITS revenue by the magnitude (a JE line
 * carries exactly one side, strictly > 0 — the contract). So a Return/CreditMemo order books the
 * mirror image of the original.
 */
function buildRevenueLines(lines: ResolvedOrderLine[]): JournalEntryLineDraft[] {
  return lines.map(line => ({
    GLAccountID: line.RevenueAccountID,
    ...revenueSide(line.Amount),
    OrderLineID: line.OrderLineID,
    Description: line.Description,
  }));
}

/**
 * One AR line per company, on the SIGN-correct side: a positive company total DEBITS AR (the
 * customer owes); a negative total (a net reversal) CREDITS AR (we owe the customer — a credit
 * memo). Fails if an AR account is missing.
 */
function buildArLines(
  totalsByCompany: Map<string, number>,
  arAccountByCompany: Map<string, string>,
  counterpartyOrganizationID?: string
): JournalEntryLineDraft[] {
  const arLines: JournalEntryLineDraft[] = [];
  for (const [companyID, total] of totalsByCompany) {
    const arAccountID = arAccountByCompany.get(companyID);
    if (!arAccountID) {
      throw new OrderDraftError(
        `No Accounts Receivable account resolved for company ${companyID}; cannot book the order.`
      );
    }
    // AR mirrors revenue: positive company total → Dr AR (customer owes); negative → Cr AR (credit memo).
    arLines.push({ GLAccountID: arAccountID, ...arSide(total), CounterpartyOrganizationID: counterpartyOrganizationID });
  }
  return arLines;
}

/** Revenue side for a signed amount: Cr for a normal sale (positive), Dr for a reversal (negative). */
function revenueSide(amount: number): { DebitAmount: number } | { CreditAmount: number } {
  return amount >= 0 ? { CreditAmount: amount } : { DebitAmount: -amount };
}

/** AR side for a signed company total: Dr when the customer owes (positive), Cr for a credit memo (negative). */
function arSide(amount: number): { DebitAmount: number } | { CreditAmount: number } {
  return amount >= 0 ? { DebitAmount: amount } : { CreditAmount: -amount };
}

/** Reject empty orders and ZERO-amount lines before assembling anything. Negatives are legal (reversals). */
function assertLinesValid(lines: ResolvedOrderLine[]): void {
  if (lines.length === 0) {
    throw new OrderDraftError('Cannot book an order with no lines.');
  }
  for (const line of lines) {
    if (line.Amount === 0 || Number.isNaN(line.Amount)) {
      throw new OrderDraftError(
        `Order line ${line.LineIndex} has a zero/NaN amount (${line.Amount}); every booked line must be non-zero.`
      );
    }
  }
}

/** Group resolved lines by their (resolved) company, preserving line order within each group. */
function groupLinesByCompany(lines: ResolvedOrderLine[]): Map<string, ResolvedOrderLine[]> {
  const groups = new Map<string, ResolvedOrderLine[]>();
  for (const line of lines) {
    const existing = groups.get(line.CompanyID);
    if (existing) existing.push(line);
    else groups.set(line.CompanyID, [line]);
  }
  return groups;
}

/**
 * Assemble the balanced order-booking drafts — ONE PER COMPANY (MOD-11). Each draft's debit
 * (that company's AR, for the company total) precedes its credits (revenue, per line) — the
 * engine re-orders and merges anyway, but emitting Dr-first keeps drafts readable. Group order
 * follows first appearance in the line list (stable for tests). Throws {@link OrderDraftError}
 * for structurally impossible inputs.
 */
export function buildOrderJournalDrafts(inputs: OrderDraftInputs): JournalEntryDraft[] {
  const { Lines, ArAccountByCompany, Context } = inputs;
  assertLinesValid(Lines);
  const drafts: JournalEntryDraft[] = [];
  for (const [, companyLines] of groupLinesByCompany(Lines)) {
    const totalsByCompany = sumAmountByCompany(companyLines);
    const arLines = buildArLines(totalsByCompany, ArAccountByCompany, Context.CounterpartyOrganizationID);
    const revenueLines = buildRevenueLines(companyLines);
    drafts.push({
      EffectiveDate: Context.EffectiveDate,
      EntryType: Context.EntryType,
      OrderID: Context.OrderID,
      Description: Context.Description,
      Lines: [...arLines, ...revenueLines],
    });
  }
  return drafts;
}

// ─── per-line JE assembly (MOD-15, Amith 2026-07-21) ─────────────────────────────
// The per-COMPANY builder above is the MOD-11 model, retired by MOD-15. Below is the per-LINE
// model: every order line books its OWN single-company journal entry. Kept in this pure module so
// it stays offline-unit-testable, exactly like the per-company builder.

/**
 * One order line, fully resolved for its own single-company JE (MOD-15). All amounts are SIGNED —
 * negative on reversal (Return / CreditMemo) lines, which book the mirror image.
 */
export interface ResolvedLineForJE {
  /** 0-based index into the order's lines (error messages / traceability). */
  LineIndex: number;
  /** The originating OrderLine — the JE it produces is stamped back onto `OrderLine.JournalEntryID`. */
  OrderLineID: string;
  /** Signed gross = Qty × UnitPrice (list, before discount). */
  Gross: number;
  /** Signed net = gross − discount (what AR is debited). */
  Net: number;
  /** Signed trade discount = gross − net (0 when none). */
  Discount: number;
  /** The line company's Accounts Receivable account (Dr, net). */
  ArAccountID: string;
  /** The resolved revenue account — Sales, or Deferred Revenue for a Deferred product (Cr). */
  RevenueAccountID: string;
  /** Contra-revenue "Sales Discounts" account; `null`/absent ⇒ net the discount into revenue (no contra line). */
  SalesDiscountsAccountID?: string | null;
  /** The line's single company (from the resolved accounts) — every line JE is single-company by construction. */
  CompanyID: string;
  Description?: string;
}

/**
 * Assemble ONE line's single-company journal entry (Amith's contra model, worked example
 * $30 gross / $5 discount → Dr AR 25 · Cr Sales 30 · Dr Sales-Discounts 5):
 *   Dr  Accounts Receivable   (net)
 *   Cr  Revenue               (GROSS when a contra applies, else NET)
 *   Dr  Sales Discounts       (discount)  — ONLY when a contra account is linked AND discount ≠ 0;
 *                                           otherwise the discount is netted into revenue.
 * Reversal (negative) lines flip every side together (mirror image). Balanced by construction:
 * Dr AR + Dr Discounts == Cr Revenue. Throws {@link OrderDraftError} on a zero/NaN net.
 */
export function buildLineJournalEntryDraft(line: ResolvedLineForJE, context: OrderJournalContext): JournalEntryDraft {
  if (line.Net === 0 || Number.isNaN(line.Net)) {
    throw new OrderDraftError(
      `Order line ${line.LineIndex} has a zero/NaN net amount (${line.Net}); every booked line must be non-zero.`
    );
  }
  const useContra = !!line.SalesDiscountsAccountID && Math.abs(line.Discount) > 0;
  const lines: JournalEntryLineDraft[] = [
    // Dr/Cr AR for the NET the customer owes (arSide flips to Cr on a reversal).
    { GLAccountID: line.ArAccountID, ...arSide(line.Net), CounterpartyOrganizationID: context.CounterpartyOrganizationID },
    // Cr/Dr revenue — GROSS when the discount books to its own contra, else NET.
    {
      GLAccountID: line.RevenueAccountID,
      ...revenueSide(useContra ? line.Gross : line.Net),
      OrderLineID: line.OrderLineID,
      Description: line.Description,
    },
  ];
  if (useContra) {
    // Sales Discounts is a debit-natured contra (same sign rule as AR): Dr on a normal sale.
    lines.push({ GLAccountID: line.SalesDiscountsAccountID!, ...arSide(line.Discount), OrderLineID: line.OrderLineID });
  }
  return {
    EffectiveDate: context.EffectiveDate,
    EntryType: context.EntryType,
    OrderID: context.OrderID,
    Description: context.Description,
    Lines: lines,
  };
}
