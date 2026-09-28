/**
 * @fileoverview The BILLING ENTRY for one instalment: the value entry a non-scheduled order raises
 * at confirm, raised here instead — once per instalment, for that instalment's slice (D92).
 *
 *     Dr  Accounts Receivable          this instalment's share of net + tax + charges
 *         Cr  Unbilled Receivable      the part that relieves revenue already earned (rule 1)
 *         Cr  Deferred Revenue         the rest — billing that runs ahead of performance
 *         Cr  each charge and tax      its share of each
 *
 * THE DISCOUNT IS NOT HERE. It is booked once, with the revenue it reduces. See the long note at
 * its removal site below; the short version is that an entry crediting Deferred gross while the
 * recognition entry credits Sales gross double-debits Sales Discounts, and both entries balance.
 *
 * WHY THE REVENUE SIDE IS NEVER CREDITED HERE, even for an up-front line. Billing is not earning.
 * The revenue side is settled elsewhere — an up-front line credited Sales at confirm, a deferred
 * driver's staged releases credit Sales on their own dates — so crediting Sales again here would
 * recognise the same money twice.
 *
 * WHICH contra account takes the credit is rule 1 of {@link SplitContraLegs}, and it is a real
 * account, not a presentation layer: Unbilled Receivable first, up to the revenue this line has
 * earned ahead of its billing (`max(0, R − B)`), then Deferred for the rest. An earlier revision
 * let Deferred run to a debit balance and left a period-end reclass to present it; D92 keeps both
 * running totals on the line instead, so the balance sheet is right without one.
 *
 * WHY AT INVOICING RATHER THAN ON THE DUE DATE. Forward-dating or a due-date job would make AR
 * appear whether or not anyone actually billed, and the due-with-no-invoice worklist — the control
 * finance relies on — would then report on something the ledger had already assumed. Posting here
 * keeps one thing reliably true: A RECEIVABLE EXISTS BECAUSE WE BILLED SOMEONE.
 *
 * IDEMPOTENCY IS THE CALLER'S. `Orders.IssueInstalmentInvoice` returns early for a row that is
 * already `Invoiced` or `Paid` and never reaches here, so invoicing twice cannot bill twice. This
 * function books what it is asked to book. It runs inside that operation's transaction, and
 * `AccountingEngine` joins the caller's transaction rather than opening its own, so the number,
 * the stamp and the entry commit or roll back together.
 *
 * NO QUERIES HERE. The operation already reads the order, its lines and the company's sibling
 * rows; it passes them in. That keeps the read visible at the call site and this module testable
 * without a database.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersOrderHeaderPaymentScheduleEntity } from '@mj-biz-apps/orders-entities';

import { BuildGLAccountResolver, EntityIDFor, LoadAccountingEngine, SubmitJournalEntryDrafts } from './AccountingBridge.js';
import { SplitExactly } from './BundleBehavior.js';
import {
    GL_ROLE,
    IsRoleNotLinked,
    UnbilledReceivableNotLinkedError,
    type GLAccountResolver,
} from './GLAccountResolver.js';
import { SplitContraLegs } from './ContractBalance.js';
import { BuildValueEntryLines, type JELineDraft } from './OrderJournalEntryFactory.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';

/**
 * The journal entry type this entry is classified as — `InstalmentInvoice` where the target
 * database has it, `OrderBooking` where it does not.
 *
 * Billing an instalment is not the same event as confirming an order, and once confirmation stops
 * booking the whole contract a report has no other way to tell them apart, so orders seeds a
 * distinct type (`metadata/journal-entry-types`, D92).
 *
 * BUT A JSON ROW REACHES A HOST ONLY AT THE RELEASE'S `Metadata_Sync`, and accounting refuses an
 * unseeded code outright (`ENTRY_TYPE_UNKNOWN`). Naming it unconditionally would make every
 * instalment invoice fail on any database the release has not reached — including, today, every
 * developer's. So the code is used only when the row is actually present, and `OrderBooking` (what
 * this entry was classified as before the new type existed) stands in until then, with a warning
 * that says which it used and why.
 */
const INVOICE_ENTRY_TYPE = 'InstalmentInvoice';
const INVOICE_ENTRY_TYPE_FALLBACK = 'OrderBooking';

/** The entry type to name on the draft, given what this database actually has seeded. */
async function resolveEntryType(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const engine = await LoadAccountingEngine(provider, user);
    if (engine.JournalEntryTypeByCode(INVOICE_ENTRY_TYPE)) return INVOICE_ENTRY_TYPE;
    console.warn(
        `Journal entry type '${INVOICE_ENTRY_TYPE}' is not seeded on this database, so instalment ` +
            `billing entries are being classified as '${INVOICE_ENTRY_TYPE_FALLBACK}'. The entries are ` +
            `correct and balanced; a report simply cannot tell a bill from a booking until the release ` +
            `that carries orders' journal-entry-types metadata has been applied.`,
    );
    return INVOICE_ENTRY_TYPE_FALLBACK;
}

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * One of the company's live schedule rows, in `InstallmentNumber` order.
 *
 * `Pick`ed from the generated entity rather than hand-declared: a hand-written interface mirroring
 * entity columns drifts from the schema silently, and picking also inherits `Status`'s real domain
 * (`'Canceled' | 'Invoiced' | ...`) instead of a bare `string`, so a typo in a status is a compile
 * error rather than a row that quietly never matches.
 */
export type InstalmentSibling = Pick<
    mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
    'ID' | 'InstallmentNumber' | 'Amount' | 'Status'
>;

/** One order line of the invoiced company, as the slice arithmetic reads it. */
export interface InstalmentLineFacts {
    ID: string;
    LineNumber: number;
    ProductName: string;
    /** Negative quantity means the line reverses; its slices mirror, as booking's do (D16). */
    Quantity: number;
    Net: number;
    Tax: number;
    Charges: number;
    Discount: number;
    Gross: number;
    /** The line's `BilledToDate` BEFORE this instalment — rule 1 reads it (D92). */
    BilledToDate: number;
    /** The line's `RecognizedToDate`. Where it exceeds billed, the excess is the contract asset. */
    RecognizedToDate: number;
    ProductID: string;
    ProductCategoryID: string | null;
    ProductTypeID: string;
    Dimensions: Array<{ DimensionID: string; DimensionValueID: string }>;
    /** Charge/tax credits for the WHOLE line; each is sliced the same way the amounts are. */
    ChargeCredits: Array<{ GLAccountID: string; Amount: number; Label: string }>;
}

/**
 * What the billing entry did: the journal entry it posted, and what it billed per line.
 *
 * The per-line amounts come back because `BilledToDate` must be advanced by the SAME statements
 * that book the entry, inside the SAME transaction — a total that can drift from the ledger it
 * summarises is worse than no total at all. The caller owns the writes; this owns the arithmetic.
 */
export interface InstalmentInvoiceResult {
    JournalEntryID: string | null;
    /** OrderLineID → what this instalment billed for it (its share of the AR debit). */
    BilledByLine: Map<string, number>;
}

/** Everything the billing entry needs, read once by the operation. */
export interface InstalmentInvoiceContext {
    OrderHeaderPaymentScheduleID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    CompanyID: string;
    InstallmentNumber: number;
    DocumentNumber: string;
    Amount: number;
    InvoicedAt: Date;
    /** Already paid against this row at the moment of invoicing — a deposit taken before billing. */
    AmountPaid: number;
    /** The company's live rows in `InstallmentNumber` order, including this one. */
    Siblings: InstalmentSibling[];
    /** The company's lines on this order. */
    Lines: InstalmentLineFacts[];
}

/** This row's index among its siblings, and the weights every slice is taken with. */
function sliceWeights(context: InstalmentInvoiceContext): { index: number; weights: number[] } {
    const weights = context.Siblings.map((s) => Math.max(0, Number(s.Amount ?? 0)));
    const index = context.Siblings.findIndex((s) => s.ID.toLowerCase() === context.OrderHeaderPaymentScheduleID.toLowerCase());
    return { index, weights };
}

/** This instalment's exact share of `total`, by the company's instalment amounts. */
const slice = (total: number, index: number, weights: number[]): number =>
    weights.length ? SplitExactly(Math.abs(total), weights)[index] : 0;

/**
 * The company's Unbilled Receivable account, or a refusal when nobody has linked one.
 *
 * NOT LINKED IS FATAL here (golive #261), as it is at booking. Crediting Deferred for the whole
 * amount instead balanced and misstated no revenue, but the contract asset this line carries was
 * never relieved and only a server log said so. Only `NotLinked` becomes the explanatory refusal;
 * a cross-company link (D6) or any other failure propagates as it is. Throwing rolls the caller's
 * transaction back, so no document number or `Invoiced` stamp survives the refusal.
 */
async function resolveUnbilled(
    resolver: GLAccountResolver,
    context: InstalmentInvoiceContext,
    line: InstalmentLineFacts,
    amount: number,
    asOf: Date,
): Promise<string> {
    try {
        return await resolver.Resolve(
            GL_ROLE.UnbilledReceivable,
            line.ProductID,
            line.ProductCategoryID,
            context.CompanyID,
            asOf,
            line.ProductTypeID,
        );
    } catch (err) {
        if (!IsRoleNotLinked(err)) throw err;
        throw UnbilledReceivableNotLinkedError(
            `Order ${context.OrderNumber} line ${line.LineNumber}, instalment ${context.InstallmentNumber}`,
            context.CompanyID,
            amount,
            err,
        );
    }
}

/**
 * Book the billing entry for one instalment and return its JournalEntryID, or null when there is
 * nothing to bill (fully prepaid, or a zero instalment).
 *
 * WRITES TO THE LEDGER. Throws when accounting refuses the draft, which rolls the caller's
 * transaction — and with it the document number and the `Invoiced` stamp — back.
 */
export async function EmitInstalmentInvoiceEntry(
    context: InstalmentInvoiceContext,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<InstalmentInvoiceResult> {
    const amount = money(context.Amount);
    if (!(amount > 0)) {
        console.warn(
            `Instalment ${context.InstallmentNumber} of order ${context.OrderNumber} has amount ` +
                `${context.Amount}; no billing entry was posted. An instalment with no positive amount ` +
                `bills nothing.`,
        );
        return { JournalEntryID: null, BilledByLine: new Map() };
    }

    const { index, weights } = sliceWeights(context);
    if (index < 0) {
        throw new Error(
            `Instalment ${context.InstallmentNumber} of order ${context.OrderNumber} was not found ` +
                `among the live rows passed for its company. The billing entry cannot be sliced.`,
        );
    }

    const resolver = await BuildGLAccountResolver(provider, user);
    const asOf = new Date(context.InvoicedAt);
    const deferredByLine = new Map<string, string>();
    const billedByLine = new Map<string, number>();
    const lines: JELineDraft[] = [];

    for (const line of context.Lines) {
        const resolve = (role: (typeof GL_ROLE)[keyof typeof GL_ROLE]): Promise<string> =>
            resolver.Resolve(role, line.ProductID, line.ProductCategoryID, context.CompanyID, asOf, line.ProductTypeID);

        const arAccount = await resolve(GL_ROLE.AccountsReceivable);
        const deferredAccount = await resolve(GL_ROLE.DeferredRevenue);
        deferredByLine.set(line.ID, deferredAccount);

        // THE DISCOUNT IS NOT BOOKED HERE — it is booked ONCE, when revenue is recognised.
        //
        // An earlier revision credited Deferred for GROSS and debited the discount slice, while the
        // recognition entry credited Sales gross and debited the discount again. Sales Discounts
        // ended at double the real discount and small credits were stranded in Unbilled and
        // Deferred. Both entries balanced, so nothing caught it (Andrew, #225 review).
        //
        // Billing is not earning, and a discount is a fact about what was EARNED. So the invoice
        // credits NET — what the customer actually owes for this instalment — and the recognition
        // entry carries `Cr Sales gross / Dr Sales Discounts / Dr Deferred-or-Unbilled net`. Passing
        // a null discount account is what makes BuildValueEntryLines credit net and emit no
        // discount line; the shared builder is otherwise identical to booking's.

        // Every amount sliced against the SAME weights, so each line's pieces sum across all
        // instalments to that line's full amount. Slicing a discount would have needed care —
        // `net + discount = gross` must hold WITHIN a slice, and three independently rounded splits
        // do not preserve it (the counter-example is in ValueEntryLines.test.ts, and booking still
        // relies on that invariant). Not booking the discount here sidesteps it entirely.
        const netPiece = slice(line.Net, index, weights);
        const built = BuildValueEntryLines(
            {
                Net: netPiece,
                Tax: slice(line.Tax, index, weights),
                Charges: slice(line.Charges, index, weights),
                // Both zero, and Gross equals Net, because this entry books no discount: with a
                // null discount account the builder credits Net and emits no contra line.
                Discount: 0,
                Gross: netPiece,
            },
            {
                AR: arAccount,
                // The revenue-side contra is split by RULE 1 below; this builds the entry with the
                // whole of it on Deferred and then moves the Unbilled share across, so the AR
                // debit and the charge credits stay exactly what booking would have produced for
                // this slice.
                Credit: deferredAccount,
                CreditLabel: 'Deferred revenue',
                Discount: null,
                ChargeCredits: line.ChargeCredits.map((c) => ({
                    ...c,
                    Amount: slice(c.Amount, index, weights),
                })),
            },
            line.ProductName,
            line.Dimensions,
        );

        // ── RULE 1 (D92): relieve the line's UNBILLED balance first, then defer the rest ──
        //
        // Where revenue has been recognised ahead of billing, the excess is already sitting in
        // Unbilled Receivable as a contract asset — service delivered that the contract did not yet
        // let us bill. Billing it now converts that asset into a receivable, so the invoice must
        // credit Unbilled down to zero BEFORE it opens any new Deferred. Crediting Deferred for the
        // whole amount would leave the contract asset standing while also deferring revenue that
        // was already earned: both balances wrong, and the entry balancing either way.
        //
        // An order billed in advance — the Blue Cypress norm — has no unbilled balance, so this is
        // a no-op and the entry stays Dr AR / Cr Deferred.
        //
        // THE TOTALS ARE SIGNED — negative on a reversal line, so an origin and its reversals net
        // to zero — but the RULE is about magnitudes: a reversal relieves the same balances in the
        // same order, just in the opposite direction. So the split is computed on absolute values
        // and the whole entry is mirrored once at the end, exactly as the factory handles amounts.
        const contraTotal = money(built.reduce((t, l) => (l.GLAccountID === deferredAccount ? t + (l.CreditAmount ?? 0) : t), 0));
        const legs = SplitContraLegs(
            Math.abs(line.BilledToDate),
            Math.abs(line.RecognizedToDate),
            Math.abs(contraTotal),
            'Invoice',
        );
        if (legs.Unbilled !== 0) {
            const unbilledAccount = await resolveUnbilled(resolver, context, line, legs.Unbilled, asOf);
            for (const l of built) {
                if (l.GLAccountID !== deferredAccount) continue;
                l.CreditAmount = legs.Deferred;
            }
            built.push({
                GLAccountID: unbilledAccount,
                CreditAmount: legs.Unbilled,
                Description: `Unbilled receivable — ${line.ProductName}`,
                Dimensions: line.Dimensions,
            });
        }

        // What this instalment BILLED of this line's revenue — its NET piece, not the AR debit.
        //
        // BilledToDate and RecognizedToDate must be on the SAME basis or the gap between them is
        // meaningless, and `RecognizedToDate` counts revenue: net, after discount, which is what
        // Sales and Deferred are credited. The AR debit is net + tax + charges, and tax and charges
        // credit their own accounts — they never touch Deferred. Advancing B by the AR debit would
        // make `B − R` overstate the deferred balance by the tax and charges on every line, so
        // rule 2 would relieve Deferred for money that was never deferred and open too little
        // Unbilled. Invisible, of course: every entry still balances.
        //
        // Signed by the line, for the same reason the totals are signed at all — a reversal must
        // subtract what its origin added.
        billedByLine.set(line.ID, line.Quantity < 0 ? money(-netPiece) : netPiece);

        // A reversal line mirrors, exactly as booking mirrors it (D16): the same accounts with the
        // sides swapped at a positive amount, never a negative debit.
        lines.push(
            ...(line.Quantity < 0
                ? built.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount }))
                : built),
        );
    }

    applyPrepayment(context, lines, deferredByLine);

    const posted = lines.filter((l) => money(l.DebitAmount ?? 0) !== 0 || money(l.CreditAmount ?? 0) !== 0);
    if (posted.length < 2) {
        console.warn(
            `Instalment ${context.InstallmentNumber} of order ${context.OrderNumber} bills nothing ` +
                `(${money(context.AmountPaid)} was already paid against it), so no journal entry was ` +
                `posted. The document number and the Invoiced stamp still stand.`,
        );
        return { JournalEntryID: null, BilledByLine: billedByLine };
    }
    assertBalanced(posted, context);

    const outcome = await SubmitJournalEntryDrafts(
        [
            {
                EffectiveDate: asOf.toISOString().slice(0, 10),
                EntryType: await resolveEntryType(provider, user),
                Description:
                    `Order ${context.OrderNumber} instalment ${context.InstallmentNumber} invoiced as ` +
                    `${context.DocumentNumber} — billing entry`,
                // D25 provenance points at the SCHEDULE ROW, where instalment identity lives (D87),
                // not at the order, which has many instalments.
                LinkedEntityID: EntityIDFor(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY),
                LinkedRecordID: context.OrderHeaderPaymentScheduleID,
                Lines: posted,
            },
        ],
        `the billing entry for instalment ${context.InstallmentNumber} of order ${context.OrderNumber}`,
        provider,
        user,
    );

    const journalEntryID = outcome.Results?.[0]?.JournalEntryID;
    if (!journalEntryID) {
        throw new Error(
            `Accounting reported success but returned no journal entry for the billing entry of ` +
                `instalment ${context.InstallmentNumber} of order ${context.OrderNumber}.`,
        );
    }
    return { JournalEntryID: journalEntryID, BilledByLine: billedByLine };
}

/**
 * CASH TAKEN BEFORE THE BILL RAISES NO RECEIVABLE.
 *
 * A deposit already posted `Dr Cash / Cr Deferred Revenue` — it never touched AR, because there was
 * nothing to relieve. So the amount already paid against this row must come off BOTH sides of the
 * billing entry: the AR debit that would otherwise claim money we already hold, and the Deferred
 * credit that would otherwise count the same obligation twice.
 *
 * Reduced pro-rata across the lines by `SplitExactly`, so the two sides stay equal and the entry
 * balances by construction. Where a line's Deferred credit would go negative the sign flips to a
 * debit, which is the same account running the other way rather than an illegal negative credit.
 */
function applyPrepayment(
    context: InstalmentInvoiceContext,
    lines: JELineDraft[],
    deferredByLine: Map<string, string>,
): void {
    const prepaid = money(context.AmountPaid);
    if (!(prepaid > 0)) return;

    const arLines = lines.filter((l) => (l.DebitAmount ?? 0) > 0 && l.Description?.startsWith('AR — '));
    const deferredAccounts = new Set(deferredByLine.values());
    const creditLines = lines.filter((l) => (l.CreditAmount ?? 0) > 0 && deferredAccounts.has(l.GLAccountID));

    reduce(arLines, prepaid, 'DebitAmount');
    reduce(creditLines, prepaid, 'CreditAmount');
}

/** Take `total` off `field` across `lines`, pro-rata, flipping the side if one would go negative. */
function reduce(lines: JELineDraft[], total: number, field: 'DebitAmount' | 'CreditAmount'): void {
    if (!lines.length) return;
    const other = field === 'DebitAmount' ? 'CreditAmount' : 'DebitAmount';
    const shares = SplitExactly(total, lines.map((l) => Number(l[field] ?? 0)));
    lines.forEach((l, i) => {
        const after = money(Number(l[field] ?? 0) - shares[i]);
        if (after >= 0) {
            l[field] = after;
        } else {
            l[field] = 0;
            l[other] = money(Number(l[other] ?? 0) + Math.abs(after));
        }
    });
}

/** The entry must balance before it is sent, with a message naming the instalment rather than a trigger. */
function assertBalanced(lines: JELineDraft[], context: InstalmentInvoiceContext): void {
    const debits = money(lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0));
    const credits = money(lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0));
    if (debits !== credits) {
        throw new Error(
            `The billing entry for instalment ${context.InstallmentNumber} of order ` +
                `${context.OrderNumber} does not balance: debits ${debits} vs credits ${credits}. ` +
                `Nothing was booked.`,
        );
    }
}
