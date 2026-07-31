import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOMoneyPipe } from './money-format';

/** An order's payment state, as the header's trigger-maintained column reports it. */
export type MJOPaymentStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Overdue' | 'WrittenOff';

/**
 * `mjo-money-strip` — total, paid, balance and payment state, in one row.
 *
 * The most-repeated component in the app: it heads the order editor, the list
 * preview, the document and the customer A/R panel, so the same three numbers
 * always sit in the same order and a user learns to read them once.
 *
 * A NEGATIVE BALANCE IS NOT AN ERROR. It is the customer's credit — over-paying
 * an order is legitimate and there is no separate credit instrument — so the
 * strip labels it "Credit" and colours it as good news rather than rendering a
 * red minus and implying something went wrong.
 *
 * Rollups are trigger-maintained from the lines and payments, never authored, so
 * this component only ever displays. It emits a click instead of navigating,
 * because a shared component that routed would only fit the one screen that
 * taught it where to go.
 *
 * Requires `orders-kit.css` (loaded once by the host app) — the classes here are
 * the same ones the approved mockups use, which is what keeps the two identical.
 *
 * ## Example
 *
 * ```html
 * <mjo-money-strip
 *   [Total]="order.TotalGross"
 *   [Paid]="order.AmountPaid"
 *   [Balance]="order.Balance"
 *   [PaymentStatus]="order.PaymentStatus"
 *   Note="Rollups are maintained by trigger from the lines — never authored."
 *   (BalanceClicked)="openPayments()" />
 * ```
 */
@Component({
    selector: 'mjo-money-strip',
    standalone: true,
    imports: [CommonModule, MJOMoneyPipe],
    template: `
        <div class="mj-money-strip" [class.mjo-money-strip--compact]="Compact">
            <div>
                <span class="l">{{ TotalLabel }}</span>
                <span class="v">{{ Total | mjoMoney }}</span>
            </div>

            @if (ShowPaid) {
                <div>
                    <span class="l">Paid</span>
                    <span class="v" [class.mj-money--muted]="!Paid">{{ Paid | mjoMoney: { Zero: '—' } }}</span>
                </div>
            }

            <div
                [class.mjo-clickable]="BalanceClicked.observed"
                (click)="onBalanceClick()">
                <span class="l">{{ IsCredit ? 'Credit' : 'Balance' }}</span>
                <span class="v" [class.mj-money--credit]="IsCredit">
                    {{ IsCredit ? (Balance | mjoMoney: { Sign: 'absolute' }) : (Balance | mjoMoney) }}
                </span>
            </div>

            @if (ShowStatus) {
                <div>
                    <span class="mj-chip" [class]="statusChipClass">{{ statusLabel }}</span>
                    @if (Note) {
                        <span class="small muted mjo-money-strip__note">{{ Note }}</span>
                    }
                </div>
            }
        </div>
    `,
    styles: [
        `
            /* Layout only — every colour and metric comes from orders-kit.css so
               this cannot drift from the approved design. */
            .mjo-clickable {
                cursor: pointer;
            }
            .mjo-clickable:hover {
                background: var(--mj-bg-surface-hover);
            }
            .mjo-money-strip__note {
                margin-left: var(--mj-space-2);
            }
            /* Basic responsive: below the two-column breakpoint the four cells
               stack into two, which keeps each number on one line instead of
               letting the amounts wrap mid-figure. Full optimisation is a later
               phase; this is the floor. */
            @media (max-width: 720px) {
                :host ::ng-deep .mj-money-strip {
                    grid-template-columns: 1fr 1fr;
                }
                :host ::ng-deep .mj-money-strip > div:nth-child(-n + 2) {
                    border-bottom: 1px solid var(--mj-border-default);
                }
                .mjo-money-strip__note {
                    display: none;
                }
            }
        `,
    ],
})
export class MJOMoneyStripComponent {
    /** The order's gross. */
    @Input() Total: number | null = null;

    /** How much has been applied. */
    @Input() Paid: number | null = null;

    /** Gross less applied. Negative means the customer holds a credit. */
    @Input() Balance: number | null = null;

    /** Drives the chip. Omit to hide it. */
    @Input() PaymentStatus: MJOPaymentStatus | null = null;

    /** Override the first cell's label — the document says "Total", A/R says "Open". */
    @Input() TotalLabel = 'Total';

    /** Hide the paid cell where it adds nothing, e.g. on a fresh draft. */
    @Input() ShowPaid = true;

    /** Hide the status cell. */
    @Input() ShowStatus = true;

    /** Denser padding, for a slide-in or a table preview. */
    @Input() Compact = false;

    /** Optional muted note beside the chip. Hidden on narrow viewports. */
    @Input() Note: string | null = null;

    /**
     * The balance cell was clicked. Only rendered as clickable when something is
     * listening, so the affordance never lies about being interactive.
     */
    @Output() BalanceClicked = new EventEmitter<void>();

    /** True when the customer holds a credit rather than owing anything. */
    public get IsCredit(): boolean {
        return (this.Balance ?? 0) < 0;
    }

    protected get statusLabel(): string {
        // The stored value is PascalCase with no space; "Part paid" fits the chip
        // where "PartiallyPaid" would wrap.
        return this.PaymentStatus === 'PartiallyPaid' ? 'Part paid' : (this.PaymentStatus ?? '');
    }

    protected get statusChipClass(): string {
        switch (this.PaymentStatus) {
            case 'Paid':
                return 'mj-chip--success';
            case 'PartiallyPaid':
                return 'mj-chip--warning';
            case 'Overdue':
                return 'mj-chip--error';
            case 'WrittenOff':
                return 'mj-chip--outline';
            default:
                return '';
        }
    }

    protected onBalanceClick(): void {
        if (this.BalanceClicked.observed) this.BalanceClicked.emit();
    }
}
