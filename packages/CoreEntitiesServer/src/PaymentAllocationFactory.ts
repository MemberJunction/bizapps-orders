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
 * WHAT EVERY LINE IS TAGGED WITH (issue #238)
 * Two independent sources, and they answer different questions:
 *
 *   The MATCH pins the counterparty per leg — the collector's Due To names the owner, the owner's
 *   Due From names the collector. Separating the legs today is the per-entity account itself; under
 *   a chart with one shared receivable and one shared payable it is only this tag, because
 *   accounting merges same-side lines on (account, dimension set).
 *
 *   The ORDER LINE's own tags ride onto the Cash, AR and intercompany legs alike, because booking
 *   debited AR with them. Clearing a tagged receivable with an untagged credit leaves every
 *   dimension permanently out of balance on an account that nets to zero in total.
 *
 * An order whose lines carry no tags produces exactly the entries it produced before any of this,
 * line for line — the split is by DISTINCT tag set, and one set (including the empty one) is one
 * slice.
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
import { SplitExactly } from './BundleBehavior.js';
import { SplitCashForCompany, type InstalmentCashFacts } from './PaymentScheduleBehavior.js';
import type { PaymentJEDraft, PaymentJELine, PaymentJELineDimension } from './PaymentJournalEntryFactory.js';

/** One order line's contribution, as far as allocation is concerned. */
export interface OrderLineShare {
    OrderLineID: string;
    /** The company that OWNS the line — the product's company (D6), already stamped on the line. */
    CompanyID: string;
    /** The line's gross amount. Used as the pro-rating weight. */
    Amount: number;
    /**
     * The line's `OrderLineDimension` tags — the same rows `OrderJournalEntryFactory` stamps on
     * every line of the booking entry (D31). Omitted or empty means the line carries none, which
     * is still the common case until order lines are tagged systematically.
     *
     * These ride onto the payment's Cash and AR lines because booking DEBITED AR with them: a
     * receivable tagged on the way in and cleared on the way out untagged never nets to zero for
     * any dimension, which makes the tag on the booking side useless for reconciliation.
     */
    Dimensions?: PaymentJELineDimension[];
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
    /**
     * Values pinned on the match for the DUE TO leg — in practice the Counterparty saying which
     * company sits on the other side (issue #238).
     *
     * The two legs are tagged separately because they land on DIFFERENT companies' books and name
     * each other: the collector's Due To points at the owner, the owner's Due From points back at
     * the collector. One shared list would put the wrong company on one of them.
     */
    DueToDimensions?: PaymentJELineDimension[];
    /** Values pinned on the match for the DUE FROM leg. See `DueToDimensions`. */
    DueFromDimensions?: PaymentJELineDimension[];
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
    /**
     * Every live instalment on the order, as it stood BEFORE this payment (D91). Absent or empty
     * for the orders that have no schedule, which is nearly all of them, and then every credit is
     * the single AR credit it has always been.
     */
    ScheduleRows?: InstalmentCashFacts[];
    /** `PaymentLine.OrderHeaderPaymentScheduleID` — the payer said which instalment this is for. */
    TargetPaymentScheduleID?: string | null;
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

/**
 * Spread-in helper: attach `Dimensions` only when there are some.
 *
 * An empty array would travel to accounting and read as "this line was considered and tagged with
 * nothing", which is indistinguishable in the draft from a line built before tagging existed.
 * Omitting the key keeps an untagged order's drafts identical to what they have always been.
 */
function dims(list: PaymentJELineDimension[]): { Dimensions?: PaymentJELineDimension[] } {
    return list.length > 0 ? { Dimensions: list } : {};
}

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

/** A slice of one company's share: an amount, and the dimension tags it was earned under. */
export interface DimensionSlice {
    Amount: number;
    Dimensions: PaymentJELineDimension[];
}

/** Order-insensitive identity of a dimension set, so two lines tagged alike group together. */
function dimKey(dims: PaymentJELineDimension[] | undefined): string {
    return (dims ?? [])
        .map((d) => `${key(d.DimensionID)}:${key(d.DimensionValueID)}`)
        .sort()
        .join('|');
}

/**
 * Pinned configuration wins over what the settled line happened to carry.
 *
 * Only the intercompany legs merge two sources at all. The pin is a deliberate statement about
 * THIS leg — the counterparty is a fact about the pair, not about whatever the order line was
 * tagged with — so when both name the same Dimension, the pin is the answer.
 */
function mergeDimensions(
    pinned: PaymentJELineDimension[] | undefined,
    contextual: PaymentJELineDimension[] | undefined,
): PaymentJELineDimension[] {
    const merged = [...(pinned ?? [])];
    const claimed = new Set(merged.map((d) => key(d.DimensionID)));
    for (const d of contextual ?? []) {
        if (!claimed.has(key(d.DimensionID))) merged.push(d);
    }
    return merged;
}

/** Sum slices that carry the same dimension set — used for the collector's single cash leg. */
function groupSlices(slices: DimensionSlice[]): DimensionSlice[] {
    const buckets = new Map<string, DimensionSlice>();
    for (const slice of slices) {
        const k = dimKey(slice.Dimensions);
        const existing = buckets.get(k);
        if (existing) existing.Amount = money(existing.Amount + slice.Amount);
        else buckets.set(k, { Amount: slice.Amount, Dimensions: slice.Dimensions });
    }
    return [...buckets.values()].filter((s) => s.Amount !== 0);
}

/**
 * Split one company's share across the DISTINCT dimension sets of the lines it settles.
 *
 * Pure and exported for the same reason `AllocateByCompany` is: this divides money a second time,
 * and a slip strands a cent on the wrong tag rather than the wrong company — which is harder to
 * see, because the company totals still reconcile.
 *
 * A company whose lines are all tagged alike (including all untagged) yields exactly ONE slice for
 * the whole share, so an order with no dimensions produces precisely the lines it produced before
 * this existed. Weighting is by line amount, and the largest slice absorbs the rounding residue,
 * mirroring `AllocateByCompany` — two different rules for splitting the same money would drift.
 */
export function SliceByDimensions(
    share: CompanyShare,
    orderLines: OrderLineShare[],
    targetOrderLineID?: string | null,
): DimensionSlice[] {
    const mine = targetOrderLineID
        ? orderLines.filter((l) => key(l.OrderLineID) === key(targetOrderLineID))
        : orderLines.filter((l) => key(l.CompanyID) === key(share.CompanyID));

    const buckets = new Map<string, { Dimensions: PaymentJELineDimension[]; Weight: number }>();
    for (const l of mine) {
        const k = dimKey(l.Dimensions);
        const existing = buckets.get(k);
        const weight = Math.abs(l.Amount ?? 0);
        if (existing) existing.Weight = money(existing.Weight + weight);
        else buckets.set(k, { Dimensions: [...(l.Dimensions ?? [])], Weight: weight });
    }

    const groups = [...buckets.values()];
    const weighted = groups.filter((g) => g.Weight > 0);

    // One tag set — or a targeted line, or lines that all weigh nothing — needs no second split.
    // Falling back to the first group rather than to no tags at all matters for the targeted case,
    // where a zero-amount line still carries the tags the whole allocation belongs to.
    if (weighted.length <= 1) {
        return [{ Amount: share.Amount, Dimensions: (weighted[0] ?? groups[0])?.Dimensions ?? [] }];
    }

    const weightTotal = money(weighted.reduce((s, g) => s + g.Weight, 0));
    const slices: DimensionSlice[] = weighted.map((g) => ({
        Amount: money((share.Amount * g.Weight) / weightTotal),
        Dimensions: g.Dimensions,
    }));

    const residue = money(share.Amount - money(slices.reduce((s, x) => s + x.Amount, 0)));
    if (residue !== 0) {
        let largest = 0;
        for (let i = 1; i < slices.length; i++) if (slices[i].Amount > slices[largest].Amount) largest = i;
        slices[largest].Amount = money(slices[largest].Amount + residue);
    }

    return slices.filter((s) => s.Amount !== 0);
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

        // Every share, split again by the tags of the lines it settles (issue #238). An order whose
        // lines carry no dimensions yields one slice per company, and the entries below are then
        // line for line what they were before tagging existed.
        const slicesFor = (share: CompanyShare): DimensionSlice[] =>
            SliceByDimensions(share, ctx.OrderLines, ctx.TargetOrderLineID);

        /**
         * The customer's credit, per dimension slice, divided between the receivable it settles and
         * the deposit it leaves (D91). A company with no live instalments gets its whole share on
         * AR and no deposit line at all, so an unscheduled order's entry is unchanged.
         *
         * The division is done once for the company and then spread across its slices with
         * `SplitExactly`, not decided slice by slice: the receivable is a fact about the company's
         * billing, and dimensions are a fact about which lines the cash touched. Deciding per slice
         * would let rounding move a penny between AR and Deferred.
         */
        const customerCreditLines = async (share: CompanyShare, sliceList: DimensionSlice[]): Promise<PaymentJELine[]> => {
            const split = SplitCashForCompany(
                share.Amount,
                share.CompanyID,
                ctx.ScheduleRows ?? [],
                ctx.TargetPaymentScheduleID,
            );
            const arAccount = await this._resolver.Resolve(GL_ROLE.AccountsReceivable, null, null, share.CompanyID, asOf);
            const arPieces = SplitExactly(split.Receivable, sliceList.map((sl) => sl.Amount));
            const lines: PaymentJELine[] = [];

            sliceList.forEach((slice, i) => {
                if (arPieces[i] > 0) {
                    lines.push({
                        GLAccountID: arAccount,
                        CreditAmount: arPieces[i],
                        Description: `${label} ${ctx.PaymentNumber} — clear receivable on order ${ctx.OrderNumber}`,
                        ...dims(slice.Dimensions),
                    });
                }
            });
            if (split.Deposit <= 0) return lines;

            const deferredAccount = await this._resolver.Resolve(GL_ROLE.DeferredRevenue, null, null, share.CompanyID, asOf);
            sliceList.forEach((slice, i) => {
                const deposit = money(slice.Amount - arPieces[i]);
                if (deposit > 0) {
                    lines.push({
                        GLAccountID: deferredAccount,
                        CreditAmount: deposit,
                        Description: `${label} ${ctx.PaymentNumber} — customer deposit on order ${ctx.OrderNumber}`,
                        ...dims(slice.Dimensions),
                    });
                }
            });
            return lines;
        };

        // Cash is ONE debit for the whole payment line, but it stands for every settled line —
        // including the other companies' — so it splits across all of their tag sets. Leaving it
        // bare while the credits are tagged would unbalance every dimension-filtered trial balance
        // the tags exist to produce.
        const receivingLines: PaymentJELine[] = groupSlices(shares.flatMap(slicesFor)).map((slice) => ({
            GLAccountID: cashAccount,
            DebitAmount: slice.Amount,
            Description: `${label} ${ctx.PaymentNumber} — cash for order ${ctx.OrderNumber}`,
            ...dims(slice.Dimensions),
        }));

        if (ownShare) {
            receivingLines.push(...(await customerCreditLines(ownShare, slicesFor(ownShare))));
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

            const shareSlices = slicesFor(share);

            // The collector owes the owner. The counterparty pinned on the match is what says WHO —
            // without it the company survives only as a GUID in the description, and under a chart
            // with one shared payable account two owners' credits merge into one netted line.
            for (const slice of shareSlices) {
                receivingLines.push({
                    GLAccountID: pair.DueToGLAccountID,
                    CreditAmount: slice.Amount,
                    Description: `${label} ${ctx.PaymentNumber} — due to company ${share.CompanyID} for order ${ctx.OrderNumber}`,
                    ...dims(mergeDimensions(pair.DueToDimensions, slice.Dimensions)),
                });
            }

            // …and the owner's customer receivable becomes a receivable from the collector — or, when
            // the owner is a scheduled company that has not billed this much yet, a deposit it holds.
            const lines: PaymentJELine[] = [];
            for (const slice of shareSlices) {
                lines.push({
                    GLAccountID: pair.DueFromGLAccountID,
                    DebitAmount: slice.Amount,
                    Description: `${label} ${ctx.PaymentNumber} — due from company ${receiving} for order ${ctx.OrderNumber}`,
                    ...dims(mergeDimensions(pair.DueFromDimensions, slice.Dimensions)),
                });
            }
            lines.push(...(await customerCreditLines(share, shareSlices)));
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
