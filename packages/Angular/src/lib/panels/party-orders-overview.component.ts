import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompositeKey, RunQuery, RunView, type IMetadataProvider, type IRunQueryProvider, type IRunViewProvider } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {
    MJCardGridComponent,
    MJCardComponent,
    MJCardActionsDirective,
    MJCardToolsDirective,
    MJCardFooterDirective,
} from '@memberjunction/ng-ui-components';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from './money-format';
import type { PartyKind } from '../form-panels/party-order-stats';

interface OrderRow {
    ID: string;
    OrderNumber: string;
    OrderDate: Date | string | null;
    Status: string;
    FulfillmentStatus?: string;
    IsOverdue?: boolean | number;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
}

interface SubRow {
    ID: string;
    SubscriptionNumber: string;
    Product: string;
    SubscriptionType: string;
    Status: string;
    StartDate: Date | string | null;
    EndDate: Date | string | null;
    AutoRenew: boolean;
}

interface MonthSpend {
    MonthOffset?: number;
    MonthLabel: string;
    MonthShort: string;
    Amount: number;
    HeightPct: number;
    IsPeak: boolean;
}

interface TimelineItem {
    Title: string;
    Subtitle: string;
    TimeAgo: string;
    Icon: string;
    Tone: 'info' | 'success' | 'warning' | 'primary';
    EntityName?: string;
    RecordID?: string;
}

@Component({
    selector: 'mjo-party-orders-overview',
    standalone: true,
    imports: [
        CommonModule,
        MJCardGridComponent,
        MJCardComponent,
        MJCardToolsDirective,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mjo-overview">
            @if (Loading) {
                <div class="mjo-overview__loading">
                    <div class="mjo-overview__spinner"></div>
                    <span>Loading account overview &amp; order intelligence...</span>
                </div>
            } @else {
                <mj-card-grid [(MaximizedCardId)]="MaximizedCardId" [Columns]="2" Gap="var(--mj-space-4, 16px)">
                    
                    <!-- 1. Spend & Revenue Trajectory Chart Card -->
                    <mj-card CardId="trajectory"
                             Title="Revenue &amp; Order Trajectory"
                             Subtitle="Last 6 Months"
                             Icon="fa-solid fa-chart-area"
                             [AllowMaximize]="true">
                        
                        <div class="mjo-chart">
                            @if (SpendMonths.length > 0) {
                                <div class="mjo-chart__bars">
                                    @for (m of SpendMonths; track m.MonthShort) {
                                        <div class="mjo-chart__bar-group">
                                            <div class="mjo-chart__tooltip">
                                                {{ FormatCurrency(m.Amount) }} ({{ m.MonthLabel }})
                                            </div>
                                            <div class="mjo-chart__bar"
                                                 [class.mjo-chart__bar--highlight]="m.IsPeak"
                                                 [style.height.%]="m.HeightPct">
                                            </div>
                                            <span class="mjo-chart__label">{{ m.MonthShort }}</span>
                                        </div>
                                    }
                                </div>
                            } @else {
                                <div class="mjo-chart__empty">
                                    <i class="fa-solid fa-chart-line"></i>
                                    <span>No completed orders in the last 6 months</span>
                                </div>
                            }
                        </div>

                        <div class="mjo-chart__footer">
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Avg Order Value</span>
                                <span class="mjo-chart__metric-val">{{ FormatCurrency(AvgOrderValue) }}</span>
                            </div>
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Lifetime Value</span>
                                <span class="mjo-chart__metric-val mjo-chart__metric-val--success">{{ FormatCurrency(LifetimeValue) }}</span>
                            </div>
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Payment Terms</span>
                                <span class="mjo-chart__metric-val">Net 30 ACH</span>
                            </div>
                        </div>
                    </mj-card>

                    <!-- 2. Active Subscriptions & Licenses Deck -->
                    <mj-card CardId="subscriptions"
                             Title="Active Subscriptions &amp; Licenses"
                             Icon="fa-solid fa-rotate"
                             [AllowMaximize]="true">
                        
                        <ng-template mjCardTools>
                            <span class="mjo-badge mjo-badge--green">{{ Subscriptions.length }} Active</span>
                        </ng-template>

                        <div class="mjo-sub-list">
                            @if (Subscriptions.length > 0) {
                                @for (sub of Subscriptions; track sub.ID) {
                                    <div class="mjo-sub-item" (click)="OnSubClick(sub.ID)">
                                        <div class="mjo-sub-item__info">
                                            <h4>{{ sub.Product || sub.SubscriptionType || ('Subscription #' + sub.SubscriptionNumber) }}</h4>
                                            <p>
                                                @if (sub.EndDate) {
                                                    Renews {{ FormatDate(sub.EndDate) }} &bull;
                                                }
                                                {{ sub.SubscriptionType || 'Active Subscription' }}
                                            </p>
                                        </div>
                                        <div class="mjo-sub-item__badge">
                                            <span class="mjo-badge mjo-badge--pill">
                                                <i class="fa-solid fa-circle-check"></i>
                                                {{ sub.AutoRenew ? 'Auto-Renew' : 'Active' }}
                                            </span>
                                        </div>
                                    </div>
                                }
                            } @else {
                                <div class="mjo-empty-state" style="padding: 20px 12px;">
                                    <i class="fa-solid fa-rotate"></i>
                                    <p>No active subscriptions on file for this {{ Mode }}.</p>
                                </div>
                            }
                        </div>

                        <div class="mjo-chart__footer">
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Active Licenses</span>
                                <span class="mjo-chart__metric-val mjo-chart__metric-val--success">{{ Subscriptions.length }} Active</span>
                            </div>
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Billing Cycle</span>
                                <span class="mjo-chart__metric-val">{{ Subscriptions.length > 0 ? (Subscriptions[0].SubscriptionType || 'Annual') : '—' }}</span>
                            </div>
                            <div class="mjo-chart__metric">
                                <span class="mjo-chart__metric-label">Renewal</span>
                                <span class="mjo-chart__metric-val">{{ Subscriptions.length > 0 && Subscriptions[0].AutoRenew ? 'Auto-Renew' : 'Manual' }}</span>
                            </div>
                        </div>
                    </mj-card>

                    <!-- 3. Recent Orders & Invoices Table -->
                    <mj-card CardId="recent-orders"
                             Title="Recent Orders &amp; Invoices"
                             Icon="fa-solid fa-receipt"
                             [AllowMaximize]="true">
                        
                        <ng-template mjCardTools>
                            @if (Orders.length > 0) {
                                <span class="mjo-card__count">{{ Orders.length }} Total</span>
                            }
                        </ng-template>

                        @if (Orders.length > 0) {
                            <div class="mjo-table-wrap">
                                <table class="mjo-table">
                                    <thead>
                                        <tr>
                                            <th>Order #</th>
                                            <th>Date</th>
                                            <th>Amount</th>
                                            <th>Payment</th>
                                            <th>Status</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (ord of Orders; track ord.ID) {
                                            <tr (click)="OnOrderClick(ord.ID)">
                                                <td class="mjo-table__order-num">{{ ord.OrderNumber }}</td>
                                                <td>{{ FormatDate(ord.OrderDate) }}</td>
                                                <td class="mjo-table__amount">{{ FormatCurrency(ord.TotalGross) }}</td>
                                                <td>
                                                    <span [class]="GetPaymentBadgeClass(GetPaymentStatus(ord))">
                                                        {{ GetPaymentStatus(ord) }}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span [class]="GetStatusBadgeClass(ord.Status)">
                                                        {{ ord.Status || 'Completed' }}
                                                    </span>
                                                </td>
                                                <td class="mjo-table__action">
                                                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        } @else {
                            <div class="mjo-empty-state">
                                <i class="fa-solid fa-shopping-cart"></i>
                                <p>No orders on file yet for this {{ Mode }}.</p>
                            </div>
                        }
                    </mj-card>

                    <!-- 4. Touchpoints Timeline Feed -->
                    <mj-card CardId="touchpoints"
                             Title="Recent Touchpoints"
                             Icon="fa-solid fa-bolt-lightning"
                             [AllowMaximize]="true">
                        
                        <div class="mjo-timeline">
                            @if (Timeline.length > 0) {
                                @for (item of Timeline; track item.Title + item.TimeAgo) {
                                    <div class="mjo-timeline__item"
                                         [class.mjo-timeline__item--clickable]="!!item.EntityName && !!item.RecordID"
                                         (click)="OnTimelineItemClick(item)">
                                        <div class="mjo-timeline__icon mjo-timeline__icon--{{ item.Tone }}">
                                            <i [class]="item.Icon"></i>
                                        </div>
                                        <div class="mjo-timeline__content">
                                            <h5>{{ item.Title }}</h5>
                                            <p>{{ item.Subtitle }}</p>
                                            <span class="mjo-timeline__time">{{ item.TimeAgo }}</span>
                                        </div>
                                        @if (item.EntityName && item.RecordID) {
                                            <div class="mjo-timeline__arrow">
                                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                            </div>
                                        }
                                    </div>
                                }
                            } @else {
                                <div class="mjo-empty-state">
                                    <i class="fa-solid fa-bolt-lightning"></i>
                                    <p>No recent touchpoints recorded.</p>
                                </div>
                            }
                        </div>
                    </mj-card>

                </mj-card-grid>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
        }

        .mjo-overview {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-4, 16px);
            padding: var(--mj-space-2, 8px) 0;
        }

        .mjo-overview__loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 48px 24px;
            color: var(--mj-text-secondary);
            font-size: 13px;
        }

        .mjo-overview__spinner {
            width: 20px;
            height: 20px;
            border: 2px solid var(--mj-border-default);
            border-top-color: var(--mj-brand-primary, #38bdf8);
            border-radius: 50%;
            animation: mjo-spin 0.8s linear infinite;
        }

        @keyframes mjo-spin {
            to { transform: rotate(360deg); }
        }

        .mjo-card__count {
            font-size: 11.5px;
            font-weight: 700;
            color: var(--mj-text-muted);
            background: var(--mj-bg-surface-sunken);
            padding: 2px 8px;
            border-radius: var(--mj-radius-pill, 9999px);
        }

        /* ── Chart ── */
        .mjo-chart {
            height: 160px;
            display: flex;
            align-items: flex-end;
            position: relative;
            padding-top: 24px;
        }

        .mjo-chart__bars {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            width: 100%;
            height: 100%;
            gap: 12px;
        }

        .mjo-chart__bar-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            height: 100%;
            justify-content: flex-end;
            position: relative;
            cursor: pointer;
        }

        .mjo-chart__bar {
            width: 100%;
            max-width: 36px;
            min-height: 4px;
            border-radius: 6px 6px 0 0;
            background: linear-gradient(180deg, #38bdf8 0%, rgba(56, 189, 248, 0.35) 100%);
            transition: all 0.2s ease;
        }

        .mjo-chart__bar--highlight {
            background: linear-gradient(180deg, #10b981 0%, rgba(16, 185, 129, 0.35) 100%);
        }

        .mjo-chart__bar-group:hover .mjo-chart__bar {
            filter: brightness(1.2);
            transform: scaleY(1.04);
        }

        .mjo-chart__label {
            font-size: 11px;
            color: var(--mj-text-muted);
            font-weight: 600;
        }

        .mjo-chart__tooltip {
            position: absolute;
            top: -12px;
            background: var(--mj-bg-surface-elevated, #1e293b);
            border: 1px solid var(--mj-border-default);
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #ffffff;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10;
        }

        .mjo-chart__bar-group:hover .mjo-chart__tooltip {
            opacity: 1;
        }

        .mjo-chart__empty {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: var(--mj-text-muted);
            font-size: 12px;
        }

        .mjo-chart__footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 12px;
            border-top: 1px solid var(--mj-border-default);
            gap: 12px;
            flex-wrap: wrap;
            margin-top: auto;
        }

        .mjo-chart__metric {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .mjo-chart__metric-label {
            font-size: 10.5px;
            font-weight: 700;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .mjo-chart__metric-val {
            font-size: 14px;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
            color: var(--mj-text-primary);
        }

        .mjo-chart__metric-val--success {
            color: var(--mj-status-success, #10b981);
        }

        /* ── Subscriptions ── */
        .mjo-sub-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .mjo-sub-item {
            background: var(--mj-bg-surface-sunken, #090e17);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-md, 10px);
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .mjo-sub-item:hover {
            border-color: var(--mj-brand-primary, #38bdf8);
            transform: translateY(-1px);
        }

        .mjo-sub-item__info h4 {
            font-size: 12.5px;
            font-weight: 700;
            color: var(--mj-text-primary);
            margin: 0 0 2px 0;
        }

        .mjo-sub-item__info p {
            font-size: 11.5px;
            color: var(--mj-text-secondary);
            margin: 0;
        }

        /* ── AI Box ── */
        .mjo-ai-box {
            background: linear-gradient(135deg, color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface-card)) 0%, color-mix(in srgb, #6366f1 10%, var(--mj-bg-surface-card)) 100%);
            border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
            border-radius: var(--mj-radius-md, 10px);
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 10px;
        }

        .mjo-ai-box__header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 700;
            color: var(--mj-brand-primary, #38bdf8);
        }

        .mjo-ai-box__text {
            font-size: 11.5px;
            color: var(--mj-text-secondary);
            line-height: 1.45;
            margin: 0;
        }

        .mjo-ai-box__actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
        }

        /* ── Table ── */
        .mjo-table-wrap {
            overflow-x: auto;
        }

        .mjo-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }

        .mjo-table th {
            text-align: left;
            padding: 6px 10px;
            font-size: 10.5px;
            font-weight: 700;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            border-bottom: 1px solid var(--mj-border-default);
        }

        .mjo-table td {
            padding: 8px 10px;
            border-bottom: 1px solid var(--mj-border-subtle, var(--mj-border-default));
            color: var(--mj-text-secondary);
        }

        .mjo-table tr:hover td {
            background: var(--mj-bg-hover, rgba(255, 255, 255, 0.04));
            color: var(--mj-text-primary);
            cursor: pointer;
        }

        .mjo-table__order-num {
            font-family: var(--mj-font-mono, monospace);
            font-weight: 600;
            color: var(--mj-brand-primary, #38bdf8);
        }

        .mjo-table__amount {
            font-family: var(--mj-font-mono, monospace);
            font-weight: 700;
            color: var(--mj-text-primary);
        }

        .mjo-table__action {
            text-align: right;
            color: var(--mj-text-muted);
        }

        .mjo-table tr:hover .mjo-table__action {
            color: var(--mj-brand-primary, #38bdf8);
        }

        /* ── Timeline ── */
        .mjo-timeline {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 220px;
            overflow-y: auto;
            padding-right: 4px;
            scrollbar-width: thin;
        }

        .mjo-timeline::-webkit-scrollbar {
            width: 4px;
        }

        .mjo-timeline::-webkit-scrollbar-track {
            background: transparent;
        }

        .mjo-timeline::-webkit-scrollbar-thumb {
            background: var(--mj-border-default, #2a3852);
            border-radius: 4px;
        }

        .mjo-timeline__item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: var(--mj-radius-md, 8px);
            border: 1px solid transparent;
            transition: all 0.15s ease;
        }

        .mjo-timeline__item--clickable {
            cursor: pointer;
        }

        .mjo-timeline__item--clickable:hover {
            background: var(--mj-bg-surface-sunken, #090e17);
            border-color: var(--mj-border-default, #2a3852);
            transform: translateX(2px);
        }

        .mjo-timeline__icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-default);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11.5px;
            flex-shrink: 0;
        }

        .mjo-timeline__icon--info { color: #38bdf8; }
        .mjo-timeline__icon--success { color: #10b981; }
        .mjo-timeline__icon--warning { color: #f59e0b; }
        .mjo-timeline__icon--primary { color: #818cf8; }

        .mjo-timeline__content {
            flex: 1;
            min-width: 0;
        }

        .mjo-timeline__content h5 {
            font-size: 12px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .mjo-timeline__content p {
            font-size: 11px;
            color: var(--mj-text-secondary);
            margin: 2px 0 0 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .mjo-timeline__time {
            font-size: 10px;
            color: var(--mj-text-muted);
            display: block;
            margin-top: 1px;
        }

        .mjo-timeline__arrow {
            font-size: 10px;
            color: var(--mj-text-muted);
            opacity: 0;
            transition: opacity 0.15s ease, color 0.15s ease;
            flex-shrink: 0;
        }

        .mjo-timeline__item--clickable:hover .mjo-timeline__arrow {
            opacity: 1;
            color: var(--mj-brand-primary, #38bdf8);
        }

        /* ── Badges & Buttons ── */
        .mjo-badge {
            font-size: 10.5px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .mjo-badge--pill { border-radius: var(--mj-radius-pill, 9999px); }
        .mjo-badge--green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .mjo-badge--blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
        .mjo-badge--amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .mjo-badge--gray { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); border: 1px solid var(--mj-border-default); }

        .mjo-btn {
            border: none;
            font-family: inherit;
            font-weight: 600;
            border-radius: var(--mj-radius-sm, 6px);
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .mjo-btn--sm {
            font-size: 11px;
            padding: 4px 10px;
        }

        .mjo-btn--primary {
            background: var(--mj-brand-primary, #38bdf8);
            color: var(--mj-text-inverse, #0f172a);
        }

        .mjo-btn--ghost {
            background: transparent;
            color: var(--mj-text-muted);
        }

        .mjo-btn--ghost:hover {
            color: var(--mj-text-primary);
        }

        .mjo-empty-state {
            padding: 32px 16px;
            text-align: center;
            color: var(--mj-text-muted);
            font-size: 12px;
        }

        .mjo-empty-state i {
            font-size: 24px;
            margin-bottom: 8px;
            opacity: 0.5;
            display: block;
        }
    `]
})
export class PartyOrdersOverviewComponent implements OnInit {
    @Input({ required: true }) Mode: PartyKind = 'person';
    @Input({ required: true }) PartyID!: string;
    @Input() FormComponent?: BaseFormComponent;
    @Input() Provider?: IMetadataProvider;
    @Input() RunQueryProvider?: IRunQueryProvider;

    private navigationService = inject(NavigationService, { optional: true });
    private cdr = inject(ChangeDetectorRef);

    public Loading = true;
    public MaximizedCardId: string | null = null;
    public Orders: OrderRow[] = [];
    public Subscriptions: SubRow[] = [];
    public SpendMonths: MonthSpend[] = [];
    public AvgOrderValue = 0;
    public LifetimeValue = 0;
    public Timeline: TimelineItem[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.PartyID) {
            this.Loading = false;
            this.cdr.detectChanges();
            return;
        }
        await this.LoadOverviewData();
        this.cdr.detectChanges();
    }

    public async LoadOverviewData(): Promise<void> {
        this.Loading = true;
        this.cdr.detectChanges();

        try {
            const runQueryProvider = this.RunQueryProvider || (this.FormComponent?.RunQueryToUse as IRunQueryProvider);
            
            if (runQueryProvider) {
                const rq = new RunQuery(runQueryProvider);
                const queryResult = await rq.RunQuery({
                    QueryName: 'Party Orders Overview',
                    CategoryPath: 'Orders',
                    Parameters: {
                        PartyKind: this.Mode,
                        PartyID: this.PartyID,
                    },
                });

                if (queryResult.Success && queryResult.Results && queryResult.Results.length > 0) {
                    const row = queryResult.Results[0] as Record<string, unknown>;
                    const getField = (name: string): unknown =>
                        row[name] ?? row[name.toLowerCase()] ?? row[name.toUpperCase()];

                    this.LifetimeValue = Number(getField('LifetimeValue')) || 0;
                    this.AvgOrderValue = Number(getField('AvgOrderValue')) || 0;

                    // Parse Recent Orders JSON
                    this.Orders = this.ParseJsonArray<OrderRow>(getField('RecentOrdersJson'));

                    // Parse Active Subscriptions JSON
                    this.Subscriptions = this.ParseJsonArray<SubRow>(getField('ActiveSubscriptionsJson'));

                    // Parse Monthly Trajectory JSON
                    const trajectory = this.ParseJsonArray<MonthSpend>(getField('MonthlyTrajectoryJson'));
                    this.ProcessSpendTrajectory(trajectory);

                    // Synthesize Activity Timeline
                    this.SynthesizeTimeline();
                    return;
                }
            }

            // Fallback via RunView if query is not available
            await this.LoadViaRunView();
        } catch (e) {
            console.error('Error loading party orders overview data:', e);
            await this.LoadViaRunView();
        } finally {
            this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    private async LoadViaRunView(): Promise<void> {
        const provider = (this.Provider || this.FormComponent?.ProviderToUse) as (IMetadataProvider & IRunViewProvider) | undefined;
        if (!provider) return;

        try {
            const filterField = this.Mode === 'person' ? 'BillToPersonID' : 'BillToOrganizationID';
            const subField = this.Mode === 'person' ? 'BeneficiaryPersonID' : 'HolderOrganizationID';

            const rv = new RunView(provider);
            const [ordersRes, subsRes] = await Promise.all([
                rv.RunView<OrderRow>({
                    EntityName: MJO_ENTITIES.OrderHeader,
                    ExtraFilter: `${filterField} = '${this.PartyID}' AND Status <> 'Voided'`,
                    OrderBy: 'OrderDate DESC',
                    MaxRows: 6,
                    ResultType: 'simple',
                }),
                rv.RunView<SubRow>({
                    EntityName: MJO_ENTITIES.Subscription,
                    ExtraFilter: `${subField} = '${this.PartyID}' AND Status = 'Active'`,
                    OrderBy: 'StartDate DESC',
                    MaxRows: 4,
                    ResultType: 'simple',
                }),
            ]);

            if (ordersRes.Success && ordersRes.Results) {
                this.Orders = ordersRes.Results;
                let total = 0;
                this.Orders.forEach(o => { total += Number(o.TotalGross) || 0; });
                this.LifetimeValue = total;
                this.AvgOrderValue = this.Orders.length > 0 ? total / this.Orders.length : 0;
            }

            if (subsRes.Success && subsRes.Results) {
                this.Subscriptions = subsRes.Results;
            }

            this.ProcessSpendTrajectory([]);
            this.SynthesizeTimeline();
            this.cdr.detectChanges();
        } catch (err) {
            console.error('Error in LoadViaRunView fallback:', err);
        }
    }

    private ParseJsonArray<T>(val: unknown): T[] {
        if (!val) return [];
        if (Array.isArray(val)) return val as T[];
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? (parsed as T[]) : [];
            } catch {
                return [];
            }
        }
        return [];
    }

    private ProcessSpendTrajectory(months?: MonthSpend[]): void {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const fullNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();

        const monthBuckets: MonthSpend[] = [];
        const monthMap = new Map<string, MonthSpend>();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const item: MonthSpend = {
                MonthLabel: `${fullNames[d.getMonth()]} ${d.getFullYear()}`,
                MonthShort: monthNames[d.getMonth()],
                Amount: 0,
                HeightPct: 4,
                IsPeak: false,
            };
            monthBuckets.push(item);
            monthMap.set(key, item);
        }

        // Merge query results if present
        if (months && months.length > 0) {
            months.forEach(m => {
                const found = monthBuckets.find(b => b.MonthShort === m.MonthShort);
                if (found) {
                    found.Amount = Number(m.Amount) || 0;
                }
            });
        }

        // Aggregate orders to ensure live correctness for current and previous months
        if (this.Orders && this.Orders.length > 0) {
            this.Orders.forEach(o => {
                if (!o.OrderDate) return;
                const d = o.OrderDate instanceof Date ? o.OrderDate : new Date(o.OrderDate);
                if (isNaN(d.getTime())) return;
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const found = monthMap.get(key);
                if (found) {
                    const amt = Number(o.TotalGross) || 0;
                    if (found.Amount < amt) {
                        found.Amount = amt;
                    }
                }
            });
        }

        let maxVal = 0;
        monthBuckets.forEach(m => {
            if (m.Amount > maxVal) maxVal = m.Amount;
        });

        monthBuckets.forEach(m => {
            if (maxVal > 0 && m.Amount > 0) {
                m.HeightPct = Math.max(16, Math.round((m.Amount / maxVal) * 100));
                m.IsPeak = m.Amount === maxVal;
            } else {
                m.HeightPct = 4;
                m.IsPeak = false;
            }
        });

        this.SpendMonths = monthBuckets;
    }

    private SynthesizeTimeline(): void {
        const list: TimelineItem[] = [];

        if (this.Orders.length > 0) {
            this.Orders.forEach(ord => {
                list.push({
                    Title: `Order ${ord.OrderNumber} ${ord.Status || 'Confirmed'}`,
                    Subtitle: `${this.FormatCurrency(ord.TotalGross)} • ${this.GetPaymentStatus(ord)}`,
                    TimeAgo: this.FormatDate(ord.OrderDate),
                    Icon: 'fa-solid fa-cart-shopping',
                    Tone: 'success',
                    EntityName: MJO_ENTITIES.OrderHeader,
                    RecordID: ord.ID,
                });
            });
        }

        if (this.Subscriptions.length > 0) {
            this.Subscriptions.forEach(sub => {
                const name = sub.Product || sub.SubscriptionType || ('Subscription #' + sub.SubscriptionNumber);
                list.push({
                    Title: `Subscription Active: ${name}`,
                    Subtitle: sub.EndDate ? `Renews ${this.FormatDate(sub.EndDate)}` : 'Active Term',
                    TimeAgo: sub.StartDate ? this.FormatDate(sub.StartDate) : 'Active',
                    Icon: 'fa-solid fa-rotate',
                    Tone: 'primary',
                    EntityName: MJO_ENTITIES.Subscription,
                    RecordID: sub.ID,
                });
            });
        }

        if (list.length === 0) {
            list.push({
                Title: 'Account Provisioned',
                Subtitle: 'Customer record active and synchronized.',
                TimeAgo: 'Initial',
                Icon: 'fa-solid fa-circle-check',
                Tone: 'info',
            });
        }

        this.Timeline = list;
    }

    public OnTimelineItemClick(item: TimelineItem): void {
        if (!item.EntityName || !item.RecordID) return;
        const pk = CompositeKey.FromID(item.RecordID);
        if (this.navigationService) {
            this.navigationService.OpenEntityRecord(item.EntityName, pk);
        } else if (this.FormComponent) {
            this.FormComponent.OnFormNavigate({
                Kind: 'record',
                EntityName: item.EntityName,
                PrimaryKey: pk,
            });
        }
    }

    public OnOrderClick(orderId: string): void {
        if (!orderId) return;
        const pk = CompositeKey.FromID(orderId);
        if (this.navigationService) {
            this.navigationService.OpenEntityRecord(MJO_ENTITIES.OrderHeader, pk);
        } else if (this.FormComponent) {
            this.FormComponent.OnFormNavigate({
                Kind: 'record',
                EntityName: MJO_ENTITIES.OrderHeader,
                PrimaryKey: pk,
            });
        }
    }

    public OnSubClick(subId: string): void {
        if (!subId) return;
        const pk = CompositeKey.FromID(subId);
        if (this.navigationService) {
            this.navigationService.OpenEntityRecord(MJO_ENTITIES.Subscription, pk);
        } else if (this.FormComponent) {
            this.FormComponent.OnFormNavigate({
                Kind: 'record',
                EntityName: MJO_ENTITIES.Subscription,
                PrimaryKey: pk,
            });
        }
    }

    public OnActionClick(action: string): void {
        if (action === 'quote' && this.navigationService) {
            this.navigationService.OpenEntityRecord(MJO_ENTITIES.OrderHeader, new CompositeKey());
        }
    }

    public FormatCurrency(val: number | null | undefined): string {
        return FormatMoney(val || 0, { Round: true, Zero: '$0' });
    }

    public FormatDate(d: Date | string | null | undefined): string {
        if (!d) return '—';
        const date = d instanceof Date ? d : new Date(d);
        if (isNaN(date.getTime())) return '—';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    public GetPaymentStatus(ord: OrderRow): string {
        if (ord.IsOverdue === true || ord.IsOverdue === 1) return 'Overdue';
        const bal = ord.Balance != null ? Number(ord.Balance) : (Number(ord.TotalGross ?? 0) - Number(ord.AmountPaid ?? 0));
        const paid = Number(ord.AmountPaid ?? 0);
        const gross = Number(ord.TotalGross ?? 0);
        if (bal <= 0 && gross > 0) return 'Paid';
        if (paid > 0) return 'PartiallyPaid';
        return 'Unpaid';
    }

    public GetPaymentBadgeClass(status: string | null | undefined): string {
        switch ((status || '').toLowerCase()) {
            case 'paid': return 'mjo-badge mjo-badge--green';
            case 'partiallypaid': return 'mjo-badge mjo-badge--amber';
            case 'overdue': return 'mjo-badge mjo-badge--amber';
            default: return 'mjo-badge mjo-badge--blue';
        }
    }

    public GetStatusBadgeClass(status: string | null | undefined): string {
        switch ((status || '').toLowerCase()) {
            case 'confirmed':
            case 'fulfilled': return 'mjo-badge mjo-badge--green';
            case 'pending': return 'mjo-badge mjo-badge--blue';
            case 'cancelled': return 'mjo-badge mjo-badge--gray';
            default: return 'mjo-badge mjo-badge--blue';
        }
    }
}
