/**
 * Payment-side journal entries — the cash leg (plan D18).
 *
 * WHY THIS EXISTS
 * Confirming an order books `Dr AR / Cr Revenue`. Until this, the money arriving booked NOTHING: the
 * rollup fields moved (`AmountPaid`, `Balance`, `PaymentStatus` — D41) but the general ledger never
 * saw the cash. The sub-ledger said paid while the GL still carried the receivable, permanently, and
 * nothing reconciled the two. This closes that.
 *
 * THE ENTRY (D18)
 *   Dr Cash              net of fees      — what actually landed in the bank
 *   Dr Processing Fee    fee, when any    — the provider's cut, expensed on capture
 *   Cr Accounts Receivable  gross         — the receivable is relieved in FULL
 *
 * The gross/net split is the point: the customer's debt is cleared for the whole amount they paid,
 * and the fee is our cost, not a discount to them. A fee booked against AR would leave a permanent
 * residue on the customer's balance that no payment could ever clear.
 *
 * FEES ARE OPTIONAL BY DESIGN. There is no seeded `Processing Fee` GL role — accounting ships eight
 * roles and that is not one of them. So a fee is only booked when the role resolves; otherwise the
 * whole gross goes to Cash and `ProcessingFeeAmount` is reported as unbooked rather than silently
 * folded into the cash line, which would misstate the bank position.
 *
 * REVERSALS mirror — same accounts, debit and credit swapped, positive amounts (D53). Refunds and
 * chargebacks are the same entry read backwards, never a negative-amount entry.
 *
 * CONNECTS TO:
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts)
 *   CALLER:   PaymentHeaderEntityServer (./PaymentHeaderEntityServer.ts)
 *   OP:       'Accounting.CreateJournalEntries' — the same op order booking uses
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
    Draft: PaymentJEDraft;
    /**
     * Set when a fee was present but no Processing Fee account could be resolved, so the gross went
     * to Cash. Surfaced rather than swallowed: the entry still balances, but the bank line is
     * overstated by this much and someone needs to know.
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
     * Build the capture entry for a payment.
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

        const asOf = new Date(ctx.PaymentDate);
        // Payments are company-level: there is no product to walk from, so the company default is
        // both the start and the end of the resolution (D12).
        const cashAccount = await this._resolver.Resolve(GL_ROLE.Cash, null, null, ctx.CompanyID, asOf);
        const arAccount = await this._resolver.Resolve(
            GL_ROLE.AccountsReceivable,
            null,
            null,
            ctx.CompanyID,
            asOf,
        );

        const fee = money(Math.abs(ctx.ProcessingFeeAmount ?? 0));
        let feeAccount: string | null = null;
        if (fee > 0) {
            try {
                feeAccount = await this._resolver.Resolve(GL_ROLE.ProcessingFee, null, null, ctx.CompanyID, asOf);
            } catch {
                // No Processing Fee role/account configured — see the header. The gross goes to Cash
                // and the shortfall is reported.
                feeAccount = null;
            }
        }

        const netToCash = feeAccount ? money(gross - fee) : gross;
        const label = ctx.IsReversal ? 'Refund' : 'Payment';

        const lines: PaymentJELine[] = [
            {
                GLAccountID: cashAccount,
                DebitAmount: netToCash,
                Description: `${label} ${ctx.PaymentNumber} — cash`,
            },
        ];
        if (feeAccount) {
            lines.push({
                GLAccountID: feeAccount,
                DebitAmount: fee,
                Description: `${label} ${ctx.PaymentNumber} — processing fee`,
            });
        }
        lines.push({
            // GROSS, always. The customer's debt clears for what they paid; the fee is our cost.
            GLAccountID: arAccount,
            CreditAmount: gross,
            Description: `${label} ${ctx.PaymentNumber} — clear receivable`,
        });

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
                Description: `${label} ${ctx.PaymentNumber}`,
                LinkedEntityID: this._paymentEntityID,
                LinkedRecordID: ctx.PaymentID,
                Lines: finalLines,
            },
            UnbookedFeeAmount: fee > 0 && !feeAccount ? fee : undefined,
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
