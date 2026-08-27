/**
 * Intercompany balancing on the payment side — the other half of D13.
 *
 * THE BUG THIS FIXES
 * Capture booked `Dr Cash / Cr AR` against the RECEIVING company and nothing else. When company A
 * collected cash settling a line owned by company B, A's receivable was credited for money A was
 * never owed, and B's receivable stayed open forever. Both books misstated, nothing reconciling
 * them, and no assertion anywhere would fail — the entry balanced perfectly. The `payment-ledger`
 * suite missed it entirely because every check used a single-company order.
 *
 * THE SHAPE (plans/archive/intercompany-balancing.md §2)
 * ONE JOURNAL ENTRY PER (PAYMENT LINE × COMPANY). This is the provenance rule booking already
 * uses — an OrderLine produces a JE that points back at the line — extended to the payment side.
 *
 *   Receiving company:  Dr Cash            the whole payment-line amount
 *                       Cr AR              its OWN share (omitted when it owns no line)
 *                       Cr Due To <other>  one line per other company, never netted
 *
 *   Each other company: Dr Due From <receiving>   its share
 *                       Cr AR                     its share
 *
 * For a single-company order this collapses to exactly the previous behaviour — one entry,
 * `Dr Cash / Cr AR`. Multi-company is the general case, not a special one.
 *
 * WHY EVERY ENTRY IS SINGLE-COMPANY: accounting derives an entry's company from its ACCOUNTS
 * (their CH-2) and D6 hard-blocks cross-company mapping, so an entry spanning companies could not
 * be booked at all. The shape is forced, not chosen.
 *
 * WHY THE DUE-TO CREDITS STAY SEPARATE: `Cr Due To B 200` and `Cr Due To C 300` are two lines, not
 * one netted `Cr Due To 500`. Aggregation is recoverable downstream; the derivation is not.
 *
 * A MISSING PAIR IS FATAL. There is no fallback account, because a guessed intercompany account
 * still balances — the misposting would be invisible until two entities' books disagree.
 *
 * CONNECTS TO:
 *   LOOKUP:   AccountingEngineBase.ResolveIntercompanyAccounts (BA-D26, bizapps-accounting)
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts)
 *   CALLER:   PaymentLineEntityServer (./PaymentLineEntityServer.ts)
 *   DOC:      plans/archive/intercompany-balancing.md
 */
import { GL_ROLE, type GLAccountResolver } from './GLAccountResolver.js';
import type { PaymentJEDraft, PaymentJELine } from './PaymentJournalEntryFactory.js';

/** One order line's contribution, as far as allocation is concerned. */
export interface OrderLineShare {
    OrderLineID: string;
    /** The company that OWNS the line — the product's company (D6), already stamped on the line. */
    CompanyID: string;
    /** The line's gross amount. Used as the pro-rating weight. */
    Amount: number;
}

/** What one company is owed out of a single payment line. */
export interface CompanyShare {
    CompanyID: string;
    Amount: number;
}

/** The intercompany account pair for an ordered company pair, or null when none is configured. */
export interface IntercompanyPair {
    DueToGLAccountID: string;
    DueFromGLAccountID: string;
}

/**
 * Looks up the pair for (source collected on behalf of target), as of a date.
 * Injected rather than imported so the allocation math is unit-testable without an engine.
 */
export type IntercompanyLookup = (
    sourceCompanyID: string,
    targetCompanyID: string,
    asOf: Date,
) => IntercompanyPair | null;

export interface PaymentLineAllocationContext {
    PaymentLineID: string;
    PaymentNumber: string;
    OrderNumber: string;
    /** What this payment line applies to the order. Always positive; `IsReversal` sets direction. */
    Amount: number;
    /** Where the cash landed. */
    ReceivingCompanyID: string;
    /** Every line on the order this payment line settles. */
    OrderLines: OrderLineShare[];
    /**
     * Set when the payment line targets ONE order line (`PaymentLine.OrderLineID`). Then the whole
     * amount belongs to that line's company and no pro-rating happens — the simpler case, not the
     * harder one, because one line means one company means no intercompany legs at all.
     */
    TargetOrderLineID?: string | null;
    PaymentDate: Date;
    /** True when un-applying (a refund or a negative allocation) — every entry mirrors. */
    IsReversal: boolean;
}

export interface PaymentAllocationResult {
    /** One draft per company. The receiving company's is always first. */
    Drafts: PaymentJEDraft[];
    /** The per-company split that produced them — surfaced for assertions and diagnostics. */
    Shares: CompanyShare[];
}

export class IntercompanyPairMissingError extends Error {
    constructor(
        public readonly SourceCompanyID: string,
        public readonly TargetCompanyID: string,
        message: string,
    ) {
        super(message);
        this.name = 'IntercompanyPairMissingError';
    }
}

function money(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

const isoDate = (d: Date): string => new Date(d).toISOString().slice(0, 10);

/** SQL Server returns uppercase GUIDs, randomUUID() lowercase. */
const key = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/** Swap debit and credit — reversal is mirroring, never negation (D53). */
function mirrorIf(reverse: boolean, lines: PaymentJELine[]): PaymentJELine[] {
    if (!reverse) return lines;
    return lines.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount }));
}

/**
 * Split a payment-line amount across the companies owning the order's lines.
 *
 * Pure and exported for unit tests — this is where the money actually gets divided, and a rounding
 * slip here would show up as an unbalanced entry or a cent stranded on the wrong company's books.
 *
 * Targeting one order line short-circuits the whole thing: the amount belongs to that line's
 * company outright. Otherwise each company gets its proportional share of the order's total, and
 * **the largest share absorbs the rounding residue** so the parts always sum to the whole.
 */
export function AllocateByCompany(
    amount: number,
    orderLines: OrderLineShare[],
    targetOrderLineID?: string | null,
): CompanyShare[] {
    const total = money(Math.abs(amount));
    if (total <= 0) return [];

    if (targetOrderLineID) {
        const target = orderLines.find((l) => key(l.OrderLineID) === key(targetOrderLineID));
        if (!target) {
            throw new Error(
                `Payment line targets order line ${targetOrderLineID}, which is not on this order. ` +
                    `A targeted allocation must name a line of the order it is applied to.`,
            );
        }
        return [{ CompanyID: target.CompanyID, Amount: total }];
    }

    // Group the order's lines by owning company before pro-rating: two lines from the same company
    // are one share, and pro-rating them separately would round twice.
    const byCompany = new Map<string, { CompanyID: string; Weight: number }>();
    for (const line of orderLines) {
        const k = key(line.CompanyID);
        const existing = byCompany.get(k);
        const weight = Math.abs(line.Amount ?? 0);
        if (existing) existing.Weight = money(existing.Weight + weight);
        else byCompany.set(k, { CompanyID: line.CompanyID, Weight: weight });
    }

    const groups = [...byCompany.values()].filter((g) => g.Weight > 0);
    if (groups.length === 0) {
        throw new Error(
            `Cannot allocate ${amount}: the order has no lines with a non-zero amount, so there is no ` +
                `basis for splitting the payment across companies.`,
        );
    }
    const weightTotal = money(groups.reduce((s, g) => s + g.Weight, 0));

    const shares: CompanyShare[] = groups.map((g) => ({
        CompanyID: g.CompanyID,
        Amount: money((total * g.Weight) / weightTotal),
    }));

    // Rounding: give the residue to the LARGEST share, where a cent is least significant, rather
    // than to whichever company happens to sort first.
    const allocated = money(shares.reduce((s, x) => s + x.Amount, 0));
    const residue = money(total - allocated);
    if (residue !== 0) {
        let largest = 0;
        for (let i = 1; i < shares.length; i++) if (shares[i].Amount > shares[largest].Amount) largest = i;
        shares[largest].Amount = money(shares[largest].Amount + residue);
    }

    // A company whose proportional share rounds to zero gets no entry at all — an entry with a
    // zero amount is refused by accounting and would mean nothing anyway.
    return shares.filter((s) => s.Amount !== 0);
}

export class PaymentAllocationFactory {
    constructor(
        private readonly _resolver: GLAccountResolver,
        private readonly _intercompany: IntercompanyLookup,
        private readonly _paymentLineEntityID: string,
    ) {}

    /**
     * Build every journal entry a single payment line causes.
     *
     * The caller owns the transaction and the write; this computes only.
     */
    public async BuildAllocationDrafts(ctx: PaymentLineAllocationContext): Promise<PaymentAllocationResult> {
        const total = money(Math.abs(ctx.Amount));
        if (total <= 0) {
            throw new Error(
                `Payment line on ${ctx.PaymentNumber} has an amount of ${ctx.Amount}, so there is nothing ` +
                    `to allocate. A zero-amount allocation should not reach booking.`,
            );
        }

        const shares = AllocateByCompany(total, ctx.OrderLines, ctx.TargetOrderLineID);
        const asOf = new Date(ctx.PaymentDate);
        const receiving = ctx.ReceivingCompanyID;
        const label = ctx.IsReversal ? 'Refund' : 'Payment';

        const ownShare = shares.find((s) => key(s.CompanyID) === key(receiving));
        const otherShares = shares.filter((s) => key(s.CompanyID) !== key(receiving));

        // ── The receiving company's entry ────────────────────────────────────
        // Payments are company-level: there is no product to walk from, so the company default is
        // both the start and the end of resolution (D12).
        const cashAccount = await this._resolver.Resolve(GL_ROLE.Cash, null, null, receiving, asOf);
        const receivingLines: PaymentJELine[] = [
            {
                GLAccountID: cashAccount,
                DebitAmount: total,
                Description: `${label} ${ctx.PaymentNumber} — cash for order ${ctx.OrderNumber}`,
            },
        ];

        if (ownShare) {
            const arAccount = await this._resolver.Resolve(GL_ROLE.AccountsReceivable, null, null, receiving, asOf);
            receivingLines.push({
                GLAccountID: arAccount,
                CreditAmount: ownShare.Amount,
                Description: `${label} ${ctx.PaymentNumber} — clear receivable on order ${ctx.OrderNumber}`,
            });
        }
        // No `else` and no error: a shared-services entity collecting purely on others' behalf owns
        // no line, so it has no receivable to clear. Its entry is Dr Cash / Cr Due To …, which is
        // correct and must be supported rather than treated as a malformed allocation.

        const drafts: PaymentJEDraft[] = [];
        const otherDrafts: PaymentJEDraft[] = [];

        for (const share of otherShares) {
            const pair = this._intercompany(receiving, share.CompanyID, asOf);
            if (!pair) {
                throw new IntercompanyPairMissingError(
                    receiving,
                    share.CompanyID,
                    `Payment ${ctx.PaymentNumber} applies ${share.Amount} of company ${share.CompanyID}'s ` +
                        `revenue to cash collected by company ${receiving}, but no active ` +
                        `IntercompanyAccountMatch is configured for that direction as of ` +
                        `${isoDate(asOf)}. Booking is refused rather than defaulted: a guessed ` +
                        `intercompany account would still balance, so the misposting would not surface ` +
                        `until the two companies' books disagreed. Configure the pair ` +
                        `(Source=${receiving}, Target=${share.CompanyID}) and retry.`,
                );
            }

            // The collector owes the owner.
            receivingLines.push({
                GLAccountID: pair.DueToGLAccountID,
                CreditAmount: share.Amount,
                Description: `${label} ${ctx.PaymentNumber} — due to company ${share.CompanyID} for order ${ctx.OrderNumber}`,
            });

            // …and the owner's customer receivable becomes a receivable from the collector.
            const otherAR = await this._resolver.Resolve(
                GL_ROLE.AccountsReceivable,
                null,
                null,
                share.CompanyID,
                asOf,
            );
            const lines: PaymentJELine[] = [
                {
                    GLAccountID: pair.DueFromGLAccountID,
                    DebitAmount: share.Amount,
                    Description: `${label} ${ctx.PaymentNumber} — due from company ${receiving} for order ${ctx.OrderNumber}`,
                },
                {
                    GLAccountID: otherAR,
                    CreditAmount: share.Amount,
                    Description: `${label} ${ctx.PaymentNumber} — clear receivable on order ${ctx.OrderNumber}`,
                },
            ];
            otherDrafts.push(this.toDraft(ctx, mirrorIf(ctx.IsReversal, lines), share.CompanyID));
        }

        drafts.push(this.toDraft(ctx, mirrorIf(ctx.IsReversal, receivingLines), receiving));
        drafts.push(...otherDrafts);

        for (const draft of drafts) this.assertBalanced(draft, ctx);
        return { Drafts: drafts, Shares: shares };
    }

    private toDraft(ctx: PaymentLineAllocationContext, lines: PaymentJELine[], companyID: string): PaymentJEDraft {
        return {
            EffectiveDate: isoDate(ctx.PaymentDate),
            // Accounting's own vocabulary, not ours to extend (D-ENTRYTYPE).
            EntryType: ctx.IsReversal ? 'Refund' : 'PaymentReceipt',
            Description: `${ctx.IsReversal ? 'Refund' : 'Payment'} ${ctx.PaymentNumber} — order ${ctx.OrderNumber} (company ${companyID})`,
            // D25 provenance: the PAYMENT LINE is the causal record, so an auditor can walk from
            // any of these entries back to the one allocation that produced them.
            LinkedEntityID: this._paymentLineEntityID,
            LinkedRecordID: ctx.PaymentLineID,
            Lines: lines,
        };
    }

    /**
     * Balance each entry before it leaves this class.
     *
     * Accounting validates too, but its rejection arrives as `MALFORMED_DRAFT` strings from inside
     * a remote operation. Failing here names the payment, the order and the amounts.
     */
    private assertBalanced(draft: PaymentJEDraft, ctx: PaymentLineAllocationContext): void {
        const debits = money(draft.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0));
        const credits = money(draft.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0));
        if (debits !== credits) {
            throw new Error(
                `An allocation entry for payment ${ctx.PaymentNumber} on order ${ctx.OrderNumber} does not ` +
                    `balance: debits ${debits} vs credits ${credits}. Amount ${ctx.Amount}.`,
            );
        }
    }
}
