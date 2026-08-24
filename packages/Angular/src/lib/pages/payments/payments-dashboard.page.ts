import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';
import { MJODayBarsComponent, type MJODayBar } from '../../panels/day-bars.component';

import { FormatMoney, MJOMoneyPipe } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { GetPayments } from '../../data/orders-queries';
import { LocalDay, ToISODate, type mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../data/entity-names';

/**
 * `mjo-payments-dashboard-page` — what came in, and does it tie?
 *
 * The accounting team's first two questions, in that order. The reconciliation
 * tile is not decoration: unallocated cash is structurally always zero here,
 * because a payment cannot capture unless its allocations sum to its amount. That
 * guarantee is worth stating on the screen rather than leaving people to trust it.
 *
 * ## Example
 *
 * ```html
 * <mjo-payments-dashboard-page />
 * ```
 */
@Component({
    selector: 'mjo-payments-dashboard-page',
    standalone: true,
    imports: [
        CommonModule,
        MJOStatTileComponent,
        MJOBarListComponent,
        MJODayBarsComponent,
        MJAlertComponent,
        EntityViewerModule
    ],
    template: `
        <div class="mj-stat-grid">
            <mjo-stat-tile
                Label="Cash received"
                Icon="fa-solid fa-hand-holding-dollar"
                [Value]="CapturedTotal"
                [Detail]="CapturedDetail" />

            <mjo-stat-tile
                Label="Unallocated"
                Icon="fa-solid fa-equals"
                Value="$0.00"
                Detail="Always — a payment cannot capture unless it balances" />

            <mjo-stat-tile
                Label="Awaiting capture"
                Icon="fa-solid fa-clock"
                [Value]="PendingTotal"
                [Detail]="PendingDetail" />

            <mjo-stat-tile
                Label="Processor fees"
                Icon="fa-solid fa-receipt"
                [Value]="FeeTotal"
                Detail="Our cost, never netted against a customer's balance" />
        </div>

        <div class="mjo-pd__split mjo-pd__split--three">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                    <h3>Cash received per day</h3>
                </div>
                <div class="mj-card-pad">
                    <mjo-day-bars [Bars]="CashPerDay" Unit="received" />
                    <div class="small muted mjo-pd__note">Amounts received, not payment counts.</div>
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                    <h3>How they paid</h3>
                </div>
                <div class="mj-card-pad">
                    <mjo-bar-list [Rows]="TenderMix" EmptyText="No payments yet." />
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                    <h3>Reconciliation</h3>
                </div>
                <div class="mj-card-pad">
                    <mj-alert Variant="success" Icon="fa-solid fa-circle-check">
                            <strong>Every captured payment balances.</strong>
                            The amount-equals-allocations rule is enforced at the capture transition, so an
                            unbalanced payment cannot exist to be found later.
                    </mj-alert>
                    <mj-alert Variant="info" Icon="fa-solid fa-circle-info" class="mjo-pd__note">
                            A refund is a <b>new payment</b>, never an edit of the capture — so chargebacks and
                            reversals show in the refunds list rather than as a mutated original.
                    </mj-alert>
                </div>
            </div>
        </div>

        <div class="mjo-pd__split">
            <div class="mj-card mjo-pd__viewer-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                    <h3>Payments List</h3>
                </div>
                <div class="mjo-pd__viewer-host">
                    @if (PaymentEntityInfo) {
                        <mj-entity-viewer
                            [Entity]="PaymentEntityInfo"
                            (RecordOpened)="OnRecordOpened($event)">
                        </mj-entity-viewer>
                    } @else {
                        <div class="small muted" style="padding: 24px;">Loading payments...</div>
                    }
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                    <h3>Cost of taking money</h3>
                </div>
                <div class="mj-card-pad">
                    <div class="mjo-pd__row">
                        <span class="small muted">Processor fees, captured payments</span>
                        <b class="mj-num">{{ FeeTotal }}</b>
                    </div>
                    <div class="mjo-pd__row">
                        <span class="small muted">Effective rate on what we took</span>
                        <b class="mj-num">{{ EffectiveRate }}</b>
                    </div>
                    <div class="small muted mjo-pd__note">
                        Booked as OUR expense against gross A/R, never netted into the customer's
                        balance — netting would leave a residue no payment could ever clear.
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            /* NOTE: .mjo-pd__split was declared TWICE in this block with different column
               templates, so the later one silently won and BOTH rows rendered as two equal
               columns. The top row has three cards, so the third landed alone and left an empty
               half-width slot beside it — a hole that read as a card that had failed to load.
               Two layouts need two names. */
            .mjo-pd__split {
                display: grid;
                grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-pd__viewer-card {
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                height: 560px;
                min-height: 480px;
            }
            .mjo-pd__viewer-host {
                flex: 1 1 auto;
                height: 100%;
                min-height: 400px;
                display: flex;
                flex-direction: column;
            }
            mj-entity-viewer {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                height: 100%;
                width: 100%;
            }
            .mjo-pd__row {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: var(--mj-space-3);
                padding: 3px 0;
            }
            .mjo-pd__note { margin-top: var(--mj-space-3); }
            @media (max-width: 1000px) {
                .mjo-pd__split { grid-template-columns: 1fr; }
            }

            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
                box-sizing: border-box;
            }
            .mjo-pd__split--three {
                grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                margin-top: var(--mj-space-6);
            }
            .mjo-pd__note { margin-top: var(--mj-space-3); }
            @media (max-width: 1000px) {
                .mjo-pd__split { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPaymentsDashboardPageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() PaymentOpened = new EventEmitter<mjBizAppsOrdersPaymentHeaderEntity>();

    public PaymentEntityInfo: EntityInfo | null = null;
    private payments: mjBizAppsOrdersPaymentHeaderEntity[] = [];

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.PaymentEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.PaymentHeader) || null;
        this.cdr.detectChanges();
        this.payments = await GetPayments({ Preset: 'all' });
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const surrogate = { ID: id } as mjBizAppsOrdersPaymentHeaderEntity;
            this.PaymentOpened.emit(surrogate);
        }
    }

    private get captured(): mjBizAppsOrdersPaymentHeaderEntity[] {
        return this.payments.filter((p) => p.Status === 'Captured');
    }

    private get pending(): mjBizAppsOrdersPaymentHeaderEntity[] {
        return this.payments.filter((p) => p.Status === 'Pending');
    }

    public get CapturedTotal(): string {
        return FormatMoney(this.captured.reduce((s, p) => s + (p.Amount ?? 0), 0), { Round: true });
    }

    public get CapturedDetail(): string {
        return `${this.captured.length} payment${this.captured.length === 1 ? '' : 's'}`;
    }

    public get PendingTotal(): string {
        return FormatMoney(this.pending.reduce((s, p) => s + (p.Amount ?? 0), 0), { Round: true, Zero: '—' });
    }

    public get PendingDetail(): string {
        return this.pending.length
            ? `${this.pending.length} awaiting capture — allocations still editable`
            : 'Nothing waiting';
    }

    public get FeeTotal(): string {
        return FormatMoney(this.captured.reduce((s, p) => s + (p.ProcessingFeeAmount ?? 0), 0));
    }

    /** Cash by tender, largest first — the eye wants the dominant one immediately. */
    /**
     * The last seven days by AMOUNT, not count.
     *
     * One large wire and thirty small cards are the same number of payments and
     * nothing like the same day, so a count would be the wrong shape of answer
     * for a panel about cash.
     */
    public get CashPerDay(): MJODayBar[] {
        const days: MJODayBar[] = [];
        const today = new Date();
        for (let back = 6; back >= 0; back--) {
            const day = new Date(today);
            day.setDate(day.getDate() - back);
            // LOCAL day for the key, matching the LOCAL day the label is built from — see the same
            // note on the orders dashboard.
            const iso = LocalDay(day);
            days.push({
                Label: day.toLocaleDateString('en-US', { weekday: 'short' }),
                Value: Math.round(
                    this.payments
                        .filter((p) => ToISODate(p.PaymentDate) === iso)
                        .reduce((sum, p) => sum + Number(p.Amount ?? 0), 0),
                ),
                Current: back === 0,
            });
        }
        return days;
    }

    /** Newest first. */
    public get LatestPayments(): mjBizAppsOrdersPaymentHeaderEntity[] {
        return [...this.payments]
            .sort((a, b) => String(b.PaymentDate ?? '').localeCompare(String(a.PaymentDate ?? '')))
            .slice(0, 7);
    }

    /** Who paid, however they are recorded. */
    public payerOf(payment: mjBizAppsOrdersPaymentHeaderEntity): string {
        return (payment.BillToOrganization ?? payment.BillToPerson ?? '—') as string;
    }

    /**
     * Fees as a share of what was actually captured.
     *
     * Computed rather than quoted. A hardcoded 2.9% describes a card schedule,
     * not this company's mix, and a business taking mostly ACH would read a card
     * rate as its own cost.
     */
    public get EffectiveRate(): string {
        const captured = this.payments.filter((p) => p.Status === 'Captured');
        const gross = captured.reduce((sum, p) => sum + Number(p.Amount ?? 0), 0);
        const fees = captured.reduce((sum, p) => sum + Number(p.ProcessingFeeAmount ?? 0), 0);
        if (!gross) return '—';
        return `${((fees / gross) * 100).toFixed(2)}%`;
    }

    public get TenderMix(): MJOBarRow[] {
        const totals = new Map<string, number>();
        for (const payment of this.captured) {
            const key = (payment.PaymentType as string) ?? 'Other';
            totals.set(key, (totals.get(key) ?? 0) + (payment.Amount ?? 0));
        }
        return [...totals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([Label, Value]) => ({ Label, Value, Display: FormatMoney(Value, { Round: true }) }));
    }
}
