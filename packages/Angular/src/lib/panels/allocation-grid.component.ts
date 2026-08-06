import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOMoneyPipe, FormatMoney } from './money-format';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

/** An open order a payment can be applied to. */
export interface MJOAllocatableOrder {
    ID: string;
    OrderNumber: string;
    Description?: string | null;
    CompanyID: string;
    CompanyName?: string | null;
    DueDate?: string | null;
    DaysLate?: number | null;
    Balance: number;
}

/** How much of the payment is going to each order. */
export type MJOAllocationMap = Record<string, number>;

/**
 * `mjo-allocation-grid` — say what a payment settles.
 *
 * THE UNALLOCATED FIGURE IS THE CENTRE OF THIS COMPONENT, and it is why the
 * component exists rather than a plain table. A payment's amount MUST equal the
 * sum of what it settles, so the running remainder is displayed prominently at
 * all times and capture is unavailable until it reads zero. That check happens at
 * capture rather than on every keystroke — a pending payment is a draft, exactly
 * as a draft order may have no lines yet.
 *
 * OVER-APPLYING IS LEGITIMATE, NOT AN ERROR. Applying more than an order is worth
 * drives its balance negative, and that negative balance IS the customer's credit
 * — there is no separate instrument. So the grid announces the credit it will
 * create rather than refusing the entry. Refusing would make an everyday event
 * unrecordable while the money sat in the bank.
 *
 * The component computes NOTHING about the payment beyond arithmetic on the
 * numbers handed to it: which orders are open, what they are worth, and what the
 * intercompany consequences are all come from the server.
 *
 * ## Example
 *
 * ```html
 * <mjo-allocation-grid
 *   [Orders]="openOrders"
 *   [Amount]="amount"
 *   [Allocations]="allocations"
 *   (AllocationsChanged)="allocations = $event"
 *   (AutoApplyRequested)="autoApply()" />
 * ```
 */
@Component({
    selector: 'mjo-allocation-grid',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOMoneyPipe, MJAlertComponent],
    template: `
        <div class="mj-card">
            <div class="mj-card-head">
                <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                <h3>{{ Title }}</h3>
                <span class="right">
                    <button type="button" mjButton variant="outline" size="sm" (click)="AutoApplyRequested.emit()">
                        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Auto-apply oldest first
                    </button>
                    <button type="button" mjButton variant="flat" size="sm" (click)="clearAll()">Clear</button>
                </span>
            </div>

            <table class="mj-table mj-table--compact">
                <thead>
                    <tr>
                        <th class="mjo-ag__order">Order</th>
                        <th>Memo</th>
                        <th class="mjo-ag__due">Due</th>
                        <th class="mjo-ag__co">Co.</th>
                        <th class="num mjo-ag__bal">Balance</th>
                        <th class="num mjo-ag__apply">Apply</th>
                        <th class="num mjo-ag__leaves">Leaves</th>
                    </tr>
                </thead>
                <tbody>
                    @for (order of Orders; track order.ID) {
                        <tr>
                            <td class="mono primary">{{ order.OrderNumber }}</td>
                            <td class="small">{{ order.Description ?? '—' }}</td>
                            <td>
                                {{ order.DueDate ?? '—' }}
                                @if (order.DaysLate && order.DaysLate > 0) {
                                    <div class="secondary mjo-ag__late">{{ order.DaysLate }}d late</div>
                                }
                            </td>
                            <td class="mjo-ag__co">
                                <span class="mj-chip mj-chip--outline">{{ order.CompanyName ?? '—' }}</span>
                            </td>
                            <td class="num">{{ order.Balance | mjoMoney }}</td>
                            <td class="num">
                                <input
                                    class="mj-input is-num mjo-ag__input"
                                    [value]="applied(order) || ''"
                                    placeholder="0.00"
                                    [attr.aria-label]="'Amount to apply to ' + order.OrderNumber"
                                    (change)="setAllocation(order, $any($event.target).value)">
                            </td>
                            <td class="num" [class.mj-money--credit]="leaves(order) < 0">
                                {{ leaves(order) === 0 ? 'settled' : formatLeaves(order) }}
                                @if (leaves(order) < 0) {
                                    <div class="secondary">credit</div>
                                }
                            </td>
                        </tr>
                    } @empty {
                        <tr>
                            <td colspan="7">
                                <div class="mj-empty mjo-ag__empty">
                                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                                    <div class="t">Nothing open</div>
                                    <div class="small">
                                        This customer owes nothing. Cash taken now becomes credit on whichever
                                        order it is applied to.
                                    </div>
                                </div>
                            </td>
                        </tr>
                    }
                </tbody>
            </table>

            <!-- The centre of the screen. Must reach zero to capture. -->
            <div
                class="mjo-ag__unallocated"
                [class.is-zero]="Unallocated === 0"
                [class.is-over]="Unallocated < 0"
                role="status"
                aria-live="polite">
                <div>
                    <div class="sec-label mjo-ag__unallocated-label">Unallocated</div>
                    <div class="small muted">{{ unallocatedNote }}</div>
                </div>
                <span class="spacer mjo-ag__unallocated-value">{{ Unallocated | mjoMoney }}</span>
            </div>
        </div>

        @if (overAppliedOrders.length) {
            <mj-alert Variant="success" Icon="fa-solid fa-piggy-bank" class="mjo-ag__effect">
                    <strong>This creates account credit.</strong>
                    @for (order of overAppliedOrders; track order.ID) {
                        {{ order.OrderNumber }} goes to {{ formatLeaves(order) }} —
                        {{ creditAmount(order) }} of spendable credit.
                    }
                    <div class="small mjo-ag__effect-note">
                        Legitimate and common. No separate credit record is created; the negative balance
                        <b>is</b> the credit.
                    </div>
            </mj-alert>
        }

        @if (companiesInvolved.length > 1) {
            <mj-alert Variant="warning" Icon="fa-solid fa-building-columns" class="mjo-ag__effect">
                    <strong>This allocation crosses companies.</strong>
                    Cash landed with one entity but settles receivables owned by
                    {{ companiesInvolved.join(' and ') }}.
                    <div class="small mjo-ag__effect-note">
                        The intercompany legs book <b>here, at allocation</b> — not at capture. A capture only
                        says how much cash arrived; only an allocation says whose revenue it settles.
                    </div>
            </mj-alert>
        }
    `,
    styles: [
        `
            .mjo-ag__order { width: 112px; }
            .mjo-ag__due { width: 100px; }
            .mjo-ag__co { width: 96px; }
            .mjo-ag__bal { width: 118px; }
            .mjo-ag__apply { width: 132px; }
            .mjo-ag__leaves { width: 124px; }
            .mjo-ag__input { width: 110px; }
            .mjo-ag__late {
                color: var(--mj-status-error-text);
                font-weight: var(--mj-font-semibold);
            }
            .mjo-ag__empty { padding: var(--mj-space-6); }

            .mjo-ag__unallocated {
                position: sticky;
                bottom: 0;
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                padding: var(--mj-space-3) var(--mj-space-4);
                border-top: 2px solid var(--mj-border-strong);
                background: var(--mj-bg-surface);
            }
            .mjo-ag__unallocated-label { margin: 0; }
            .mjo-ag__unallocated-value {
                font-size: 20px;
                font-weight: var(--mj-font-bold);
                font-variant-numeric: tabular-nums;
            }
            .mjo-ag__unallocated.is-zero {
                background: var(--mj-status-success-bg);
                border-top-color: var(--mj-status-success);
            }
            .mjo-ag__unallocated.is-zero .mjo-ag__unallocated-value {
                color: var(--mj-status-success-text);
            }
            .mjo-ag__unallocated.is-over {
                background: var(--mj-status-error-bg);
                border-top-color: var(--mj-status-error);
            }
            .mjo-ag__unallocated.is-over .mjo-ag__unallocated-value {
                color: var(--mj-status-error-text);
            }

            .mjo-ag__effect { margin-top: var(--mj-space-3); }
            .mjo-ag__effect-note { margin-top: 4px; }

            @media (max-width: 760px) {
                .mjo-ag__co,
                .mjo-ag__due {
                    display: none;
                }
            }
        `,
    ],
})
export class MJOAllocationGridComponent {
    @Input() Title = 'Apply it to open orders';

    /** Open orders, oldest first. */
    @Input() Orders: MJOAllocatableOrder[] = [];

    /** The payment's amount — what the allocations must sum to. */
    @Input() Amount = 0;

    /** Order ID → amount applied. */
    @Input() Allocations: MJOAllocationMap = {};

    /** The map changed. The host owns the state; this component never mutates it in place. */
    @Output() AllocationsChanged = new EventEmitter<MJOAllocationMap>();

    /** The user asked for oldest-first auto-apply. The host decides the strategy. */
    @Output() AutoApplyRequested = new EventEmitter<void>();

    /** What is not yet applied. Must be zero to capture. */
    public get Unallocated(): number {
        const applied = Object.values(this.Allocations).reduce((s, v) => s + v, 0);
        return this.round(this.Amount - applied);
    }

    /** Whether the host's capture button should be live. */
    public get IsBalanced(): boolean {
        return this.Unallocated === 0;
    }

    protected get unallocatedNote(): string {
        if (this.Unallocated === 0) return 'Balanced — ready to capture.';
        if (this.Unallocated > 0) {
            return `${FormatMoney(this.Unallocated)} of this payment is not yet applied to anything.`;
        }
        return `Applied ${FormatMoney(-this.Unallocated)} more than was received — reduce an allocation.`;
    }

    protected get overAppliedOrders(): MJOAllocatableOrder[] {
        return this.Orders.filter((o) => this.applied(o) > o.Balance);
    }

    protected get companiesInvolved(): string[] {
        const names = this.Orders.filter((o) => this.applied(o) > 0).map(
            (o) => o.CompanyName ?? o.CompanyID,
        );
        return [...new Set(names)];
    }

    protected applied(order: MJOAllocatableOrder): number {
        return this.Allocations[order.ID] ?? 0;
    }

    protected leaves(order: MJOAllocatableOrder): number {
        return this.round(order.Balance - this.applied(order));
    }

    protected formatLeaves(order: MJOAllocatableOrder): string {
        return FormatMoney(this.leaves(order));
    }

    protected creditAmount(order: MJOAllocatableOrder): string {
        return FormatMoney(this.applied(order) - order.Balance);
    }

    protected setAllocation(order: MJOAllocatableOrder, raw: string): void {
        const parsed = Number.parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
        const next = { ...this.Allocations };
        if (!Number.isFinite(parsed) || parsed <= 0) delete next[order.ID];
        else next[order.ID] = this.round(parsed);
        this.AllocationsChanged.emit(next);
    }

    protected clearAll(): void {
        this.AllocationsChanged.emit({});
    }

    private round(value: number): number {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }
}
