import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrdersRefundPaymentOperation } from '@mj-biz-apps/orders-entities';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** One order the original payment settled, and what a refund does to it. */
interface MJOUnapplication {
    OrderNumber: string;
    OriginalAmount: number;
    Share: number;
    UnappliedAmount: number;
    BalanceAfter: number;
}

/**
 * `mjo-refund-page` — give money back.
 *
 * A REFUND IS A NEW PAYMENT, NEVER AN EDIT. The original capture happened, it has
 * a journal entry, and rewriting it would destroy the audit trail of money that
 * actually moved. So the reversal carries its own instrument snapshot and its own
 * negative allocation lines.
 *
 * IT UN-APPLIES PROPORTIONALLY. A payment split across three orders refunds across
 * the same three, in the same ratio — choosing which order to claw back from would
 * be re-making a decision the original payment already made, and making it
 * differently.
 *
 * THE PROCESSING FEE IS NOT REVERSED. The processor kept its cut; reversing it
 * would claim money back from them that never returns.
 *
 * ## Example
 *
 * ```html
 * <mjo-refund-page [PaymentID]="id" (Refunded)="close()" />
 * ```
 */
@Component({
    selector: 'mjo-refund-page',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, FormsModule, MJOStatedValueComponent, MJOMoneyPipe],
    template: `
        <p class="mjo-note mjo-rf__note">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <strong>A refund is a new payment, never an edit of the capture.</strong>
                The original happened and has an entry; rewriting it would destroy the trail of money that
                actually moved. The reversal mirrors it — same accounts, sides swapped.
        </p>

        <div class="mjo-rf__split">
            <div class="mjo-rf__left">
                <div class="mj-card">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                        <h3>Refunding against</h3>
                    </div>
                    <div class="mj-card-pad">
                        <mjo-stated-value Label="Payment">{{ PaymentNumber ?? '—' }}</mjo-stated-value>
                        <mjo-stated-value Label="Captured">{{ OriginalAmount | mjoMoney }}</mjo-stated-value>
                        <mjo-stated-value Label="Processing fee" From="not reversed">
                            {{ Fee | mjoMoney: { Zero: '—' } }}
                        </mjo-stated-value>
                        <mjo-stated-value Label="Already refunded">
                            {{ AlreadyRefunded | mjoMoney: { Zero: '— none' } }}
                        </mjo-stated-value>
                        <mjo-stated-value Label="Refundable now">
                            <b>{{ Refundable | mjoMoney }}</b>
                        </mjo-stated-value>

                        <div class="small muted mjo-rf__hint">
                            The processor kept its {{ Fee | mjoMoney }} cut, so the refund does not give it
                            back. Reversing it would claim money from the processor that never returns.
                        </div>
                    </div>
                </div>

                <div class="mj-card mjo-rf__amount">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i>
                        <h3>How much</h3>
                    </div>
                    <div class="mj-card-pad">
                        <label class="mj-field">
                            <label>Refund amount</label>
                            <input
                                class="mj-input is-num"
                                [value]="Amount"
                                (change)="SetAmount($any($event.target).value)"
                                aria-label="Refund amount">
                            <div class="hint">
                                Never more than {{ Refundable | mjoMoney }} remains refundable. Partial refunds
                                accumulate against that cap.
                            </div>
                        </label>

                        <label class="mj-field">
                            <label>Reason</label>
                            <input class="mj-input" [(ngModel)]="Reason" name="reason"
                                   placeholder="Why is this being refunded?">
                        </label>
                    </div>
                </div>
            </div>

            <div class="mjo-rf__right">
                <div class="mj-card">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-arrows-split-up-and-left" aria-hidden="true"></i>
                        <h3>How it un-applies</h3>
                        <span class="right small muted">proportional to the original allocation</span>
                    </div>
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th class="num">Originally</th>
                                <th class="num">Share</th>
                                <th class="num">Un-applies</th>
                                <th class="num">New balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (row of Unapplications; track row.OrderNumber) {
                                <tr>
                                    <td class="mono">{{ row.OrderNumber }}</td>
                                    <td class="num">{{ row.OriginalAmount | mjoMoney }}</td>
                                    <td class="num muted">{{ (row.Share * 100).toFixed(1) }}%</td>
                                    <td class="num strong mj-money--neg">−{{ row.UnappliedAmount | mjoMoney: { Sign: 'absolute' } }}</td>
                                    <td class="num">
                                        {{ row.BalanceAfter | mjoMoney }}
                                        @if (row.BalanceAfter > 0) {
                                            <div class="secondary">becomes due again</div>
                                        }
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="5" class="small muted mjo-rf__pad">Nothing to un-apply.</td></tr>
                            }
                        </tbody>
                    </table>
                    <div class="mj-card-pad mjo-rf__foot">
                        <div class="small muted">
                            A payment split across three orders refunds across the same three, in the same
                            ratio. Choosing which one to claw back from would be re-making a decision the
                            original payment already made.
                        </div>
                    </div>
                </div>

                <!-- Amber, but not a warning: it reassures about invariants the SERVER enforces
                     rather than cautioning about the action in front of you. A permanent warning
                     colour on a screen that moves money spends the alarm on the wrong thing. -->
                <p class="mjo-note mjo-rf__note">
                    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                    <strong>Guards.</strong>
                    A refund cannot exceed what remains after earlier refunds, and a captured
                    payment is never edited — the refund is a NEW payment that reverses it. Both
                    rules are enforced server-side, so a stale screen cannot talk its way past
                    them.
                </p>

                <p class="mjo-note mjo-rf__note">
                    <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
                    <strong>Mirrored entry.</strong>
                        Cash is credited and A/R debited — the capture's entry with the directions
                        swapped. The processing fee is NOT reversed unless the provider actually
                        returned it, because our cost was incurred whether or not the customer kept
                        the goods.
                </p>

                <div class="mjo-rf__actions">
                    <button
                        type="button"
                        mjButton variant="primary"
                        [disabled]="!CanRefund || Busy"
                        (click)="Refund()">
                        <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
                        {{ Busy ? 'Issuing…' : 'Issue refund' }}
                    </button>
                    @if (Error) {
                        <span class="small mjo-rf__error">{{ Error }}</span>
                    }
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-rf__note { margin-bottom: var(--mj-space-4); }
            .mjo-rf__split { display: flex; gap: var(--mj-space-4); align-items: flex-start; }
            .mjo-rf__left { flex: 0 0 360px; min-width: 0; }
            .mjo-rf__right { flex: 1; min-width: 0; }
            .mjo-rf__amount { margin-top: var(--mj-space-4); }
            .mjo-rf__hint { margin-top: var(--mj-space-3); }
            .mjo-rf__pad { padding: var(--mj-space-4); }
            .mjo-rf__foot { border-top: 1px solid var(--mj-border-default); }
            .mjo-rf__actions {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                margin-top: var(--mj-space-4);
            }
            .mjo-rf__error { color: var(--mj-status-error-text); }

            @media (max-width: 1100px) {
                .mjo-rf__split { flex-direction: column; }
                .mjo-rf__left, .mjo-rf__right { flex: 1 1 auto; width: 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJORefundPageComponent implements OnInit {

    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);
    /** The captured payment being reversed. */
    @Input() PaymentID: string | null = null;

    @Input() PaymentNumber: string | null = null;
    @Input() OriginalAmount = 0;
    @Input() Fee = 0;
    @Input() AlreadyRefunded = 0;

    /** How the original was applied — drives the proportional un-application. */
    @Input() OriginalAllocations: Array<{ OrderNumber: string; Amount: number; Balance: number }> = [];

    /** A refund was issued. */
    @Output() Refunded = new EventEmitter<string>();

    public Amount = 0;
    public Reason = '';
    public Busy = false;
    public Error: string | null = null;

    public ngOnInit(): void {
        // Default to a full refund of whatever remains — the common case.
        this.Amount = this.Refundable;
    }

    public get Refundable(): number {
        return Math.round((this.OriginalAmount - this.AlreadyRefunded) * 100) / 100;
    }

    public get CanRefund(): boolean {
        return this.Amount > 0 && this.Amount <= this.Refundable;
    }

    /**
     * The proportional split, computed for DISPLAY only. The server does this
     * again authoritatively — showing it here is about letting someone see the
     * consequence before committing, not about deciding it.
     */
    public get Unapplications(): MJOUnapplication[] {
        if (!this.OriginalAmount) return [];
        const ratio = this.Amount / this.OriginalAmount;
        return this.OriginalAllocations.map((allocation) => {
            const share = allocation.Amount / this.OriginalAmount;
            const unapplied = Math.round(this.Amount * share * 100) / 100;
            return {
                OrderNumber: allocation.OrderNumber,
                OriginalAmount: allocation.Amount,
                Share: share,
                UnappliedAmount: unapplied,
                BalanceAfter: Math.round((allocation.Balance + unapplied) * 100) / 100,
            };
        }).filter(() => ratio > 0);
    }

    public SetAmount(raw: string): void {
        const parsed = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ''));
        const next = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
        // Clamp rather than letting an over-cap value sit in the field looking
        // acceptable until the server refuses it.
        this.Amount = Math.min(next, this.Refundable);
    }

    public async Refund(): Promise<void> {
        if (!this.CanRefund || !this.PaymentID) return;
        this.Busy = true;
        this.Error = null;
        try {
            const op = new OrdersRefundPaymentOperation();
            const result = await op.Execute({
                PaymentHeaderID: this.PaymentID,
                Amount: this.Amount,
                Reason: this.Reason,
            });
            if (result.Success && result.Output?.Success) {
                this.Refunded.emit(result.Output.RefundPaymentNumber ?? '');
            } else {
                this.Error = result.Output?.Message ?? result.ErrorMessage ?? 'The refund could not be issued.';
            }
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
        }
        this.cdr.detectChanges();
    }

}
