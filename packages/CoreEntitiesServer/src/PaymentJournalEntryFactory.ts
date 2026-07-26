/**
 * Payment-side journal entries — the PROCESSING FEE at capture (plan D18).
 *
 * WHAT THIS BOOKS, AND WHAT IT NO LONGER BOOKS
 * This class used to book the whole cash leg at capture: `Dr Cash / Dr Fee / Cr AR`. That was
 * wrong the moment an order carried a second company's product, because it credited the RECEIVING
 * company's receivable for money that company was never owed (D13, intercompany-balancing.md §1).
 *
 * The AR/Cash side moved to `PaymentAllocationFactory`, driven by `PaymentLine`, because
 * ALLOCATION is the earliest point at which the owning companies are known at all. A capture says
 * how much cash arrived; only an allocation says whose revenue it settles.
 *
 * What remains here is the part that genuinely IS a header fact:
 *
 *   Dr Processing Fee   the provider's cut
 *   Cr Cash             the provider never deposited it
 *
 * The fee is incurred when the processor takes it, against the payment as a whole — it does not
 * belong to any one order, and pro-rating it across allocations would invent a precision that the
 * underlying fact does not have. Booking it separately also keeps the customer's debt clearing for
 * the FULL amount they paid: a fee netted against AR would leave a permanent residue on their
 * balance that no payment could ever clear.
 *
 * FEES ARE OPTIONAL BY DESIGN. There is no seeded `Processing Fee` GL role — accounting ships
 * eight roles and that is not one of them. When it does not resolve, NOTHING is booked here and
 * the shortfall is reported, rather than being folded into a line that would misstate the bank
 * position.
 *
 * REVERSALS mirror — same accounts, debit and credit swapped, positive amounts (D53). Refunds and
 * chargebacks are the same entry read backwards, never a negative-amount entry.
 *
 * CONNECTS TO:
 *   ALLOCATION: PaymentAllocationFactory (./PaymentAllocationFactory.ts) — the AR/Cash side
 *   RESOLVER:   GLAccountResolver (./GLAccountResolver.ts)
 *   CALLER:     PaymentHeaderEntityServer (./PaymentHeaderEntityServer.ts)
 *   OP:         'Accounting.CreateJournalEntries' — the same op order booking uses
 */
import { GL_ROLE, type GLAccountResolver } from './GLAccountResolver.js';

/** One ledger line of the capture entry. */
export interface PaymentJELine {
    GLAccountID: string;
    DebitAmount?: number;
    CreditAmount?: number;
    Description: string;
}

export interface PaymentJEDraft {
    EffectiveDate: string;
    EntryType: string;
    Description: string;
    LinkedEntityID: string;
    LinkedRecordID: string;
    Lines: PaymentJELine[];
}

export interface PaymentCaptureContext {
    PaymentID: string;
    PaymentNumber: string;
    /** Where the cash lands — the receivable being cleared belongs to this company. */
    CompanyID: string;
    /** Gross: what the customer paid. */
    Amount: number;
    /** The provider's cut, if any. Booked separately when a Processing Fee account resolves. */
    ProcessingFeeAmount: number;
    PaymentDate: Date;
    /** True when this reverses an earlier capture — the same entry, mirrored. */
    IsReversal: boolean;
}

export interface PaymentCaptureResult {
    /**
     * The fee entry, or null when there is no fee — or when there IS one but no Processing Fee
     * account resolves. Null means "book nothing", never "book something approximate".
     */
    Draft: PaymentJEDraft | null;
    /**
     * Set when a fee was present but no Processing Fee account could be resolved. Surfaced rather
     * than swallowed: the cash line elsewhere is then gross, so the bank position is overstated by
     * this much and someone needs to know.
     */
    UnbookedFeeAmount?: number;
}

function money(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

const isoDate = (d: Date): string => new Date(d).toISOString().slice(0, 10);

/** Swap debit and credit — see D53; reversal is mirroring, never negation. */
function mirrorIf(reverse: boolean, lines: PaymentJELine[]): PaymentJELine[] {
    if (!reverse) return lines;
    return lines.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount }));
}

export class PaymentJournalEntryFactory {
    constructor(
        private readonly _resolver: GLAccountResolver,
        private readonly _paymentEntityID: string,
    ) {}

    /**
     * Build the fee entry for a payment, or null when there is nothing to book.
     *
     * Amounts are always positive; `IsReversal` decides the direction. The caller owns the
     * transaction and the write — this computes only.
     */
    public async BuildCaptureDraft(ctx: PaymentCaptureContext): Promise<PaymentCaptureResult> {
        const gross = money(Math.abs(ctx.Amount));
        if (gross <= 0) {
            throw new Error(
                `Payment ${ctx.PaymentNumber} has an amount of ${ctx.Amount}, so there is nothing to book. ` +
                    `A zero-amount payment should not reach capture.`,
            );
        }

        const fee = money(Math.abs(ctx.ProcessingFeeAmount ?? 0));
        if (fee <= 0) return { Draft: null };

        const asOf = new Date(ctx.PaymentDate);
        let feeAccount: string;
        try {
            feeAccount = await this._resolver.Resolve(GL_ROLE.ProcessingFee, null, null, ctx.CompanyID, asOf);
        } catch {
            // No Processing Fee role/account configured — see the header. Book nothing and report.
            return { Draft: null, UnbookedFeeAmount: fee };
        }

        // Payments are company-level: there is no product to walk from, so the company default is
        // both the start and the end of the resolution (D12).
        const cashAccount = await this._resolver.Resolve(GL_ROLE.Cash, null, null, ctx.CompanyID, asOf);
        const label = ctx.IsReversal ? 'Refund' : 'Payment';

        const lines: PaymentJELine[] = [
            {
                GLAccountID: feeAccount,
                DebitAmount: fee,
                Description: `${label} ${ctx.PaymentNumber} — processing fee`,
            },
            {
                // The processor kept this; it never reached the bank.
                GLAccountID: cashAccount,
                CreditAmount: fee,
                Description: `${label} ${ctx.PaymentNumber} — fee withheld from deposit`,
            },
        ];

        const finalLines = mirrorIf(ctx.IsReversal, lines);
        this.assertBalanced(finalLines, ctx);

        return {
            Draft: {
                EffectiveDate: isoDate(ctx.PaymentDate),
                // Accounting's own vocabulary — 'PaymentReceipt' and 'Refund' are two of the
                // seventeen values its CHECK constraint allows. Inventing 'PaymentCapture' was
                // rejected at the draft gate, correctly: the entry type is accounting's taxonomy to
                // define, not ours to extend from the orders side.
                EntryType: ctx.IsReversal ? 'Refund' : 'PaymentReceipt',
                Description: `${label} ${ctx.PaymentNumber} — processing fee`,
                LinkedEntityID: this._paymentEntityID,
                LinkedRecordID: ctx.PaymentID,
                Lines: finalLines,
            },
        };
    }

    /**
     * A local balance check before the draft leaves this class.
     *
     * Accounting validates too, but its rejection arrives as a batch of `MALFORMED_DRAFT` strings
     * from inside a remote operation. Failing here names the payment and the amounts.
     */
    private assertBalanced(lines: PaymentJELine[], ctx: PaymentCaptureContext): void {
        const debits = money(lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0));
        const credits = money(lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0));
        if (debits !== credits) {
            throw new Error(
                `The capture entry for payment ${ctx.PaymentNumber} does not balance: ` +
                    `debits ${debits} vs credits ${credits}. Gross ${ctx.Amount}, fee ${ctx.ProcessingFeeAmount}.`,
            );
        }
    }
}
