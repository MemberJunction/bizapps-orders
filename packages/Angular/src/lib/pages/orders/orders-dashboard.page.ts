import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJODayBarsComponent, type MJODayBar } from '../../panels/day-bars.component';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';

import { DaysSince, FormatMoney, MJOMoneyPipe } from '../../panels/money-format';
import { MJAlertComponent, MJEmptyStateComponent, MJTabNavComponent, type TabConfig, type MJAlertVariant } from '@memberjunction/ng-ui-components';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { GetOrders } from '../../data/orders-queries';
import { LocalDay, ToISODate, type mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';

/** A queue worth someone's attention, with where it leads. */
interface MJOQueue {
    Label: string;
    Note?: string;
    Count: number;
    Icon: string;
    Tone: 'neutral' | 'info' | 'warning' | 'error' | 'success' | 'violet';
    PageId: string;
    Preset?: string;
}

/** Something specific worth acting on, with the order it concerns. */
interface MJOAttentionItem {
    Order: mjBizAppsOrdersOrderHeaderEntity;
    Tone: MJAlertVariant;
    Icon: string;
    Headline: string;
    Detail: string;
}

/**
 * `mjo-orders-dashboard-page` — Option B: Tabbed Command Workspace.
 *
 * Provides a unified workspace with 3 tabs:
 * 1. Executive Overview & Action Queues
 * 2. Full-featured Orders Explorer (<mj-entity-viewer>)
 * 3. Receivables & Aging Breakdown
 */
@Component({
    selector: 'mjo-orders-dashboard-page',
    standalone: true,
    imports: [
        CommonModule,
        MJTabNavComponent,
        EntityViewerModule,
        MJAlertComponent,
        MJEmptyStateComponent,
        MJOStatTileComponent,
        MJOBarListComponent,
        MJODayBarsComponent,
        MJOMoneyPipe
    ],
    template: `
        <div class="mjo-dashboard-container">
            <div class="mjo-tab-container">
                <mj-tab-nav [Tabs]="Tabs" [ActiveKey]="ActiveTab" (TabChange)="OnTabChange($event)"></mj-tab-nav>
            </div>

            @if (ActiveTab === 'overview') {
                <div class="mj-stat-grid">
                    <mjo-stat-tile
                        Label="Open orders"
                        Icon="fa-solid fa-file-invoice-dollar"
                        [Value]="OpenCountDisplay"
                        [Detail]="OpenValueDisplay"
                        (Clicked)="OpenExplorerPreset('all')" />

                    <mjo-stat-tile
                        Label="Open balance"
                        Icon="fa-solid fa-scale-balanced"
                        [Value]="OpenBalanceDisplay"
                        Detail="Confirmed orders still carrying a balance"
                        (Clicked)="OpenExplorerPreset('unpaid')" />

                    <mjo-stat-tile
                        Label="Overdue"
                        Icon="fa-solid fa-hourglass-half"
                        Tone="alert"
                        [Value]="OverdueValueDisplay"
                        [Detail]="OverdueDetail"
                        (Clicked)="OpenExplorerPreset('overdue')" />

                    <mjo-stat-tile
                        Label="Credits held"
                        Icon="fa-solid fa-piggy-bank"
                        [Value]="CreditsDisplay"
                        Detail="Offer these before invoicing again"
                        (Clicked)="OpenExplorerPreset('credits')" />
                </div>

                <div class="mjo-dash__split">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                            <h3>Needs someone</h3>
                        </div>
                        <div class="mj-card-pad mjo-dash__queues">
                            @for (queue of Queues; track queue.Label) {
                                <a href="#" class="mjo-dash__queue" (click)="goQueue($event, queue)">
                                    <span class="mjo-dash__icon" [class]="'mjo-tone-' + queue.Tone">
                                        <i [class]="queue.Icon" aria-hidden="true"></i>
                                    </span>
                                    <span class="mjo-dash__queue-body">
                                        <span class="mjo-dash__queue-label">{{ queue.Label }}</span>
                                        @if (queue.Note) {
                                            <span class="small muted mjo-dash__queue-note">{{ queue.Note }}</span>
                                        }
                                    </span>
                                    <b class="mj-num mjo-dash__count">{{ queue.Count }}</b>
                                    <i class="fa-solid fa-chevron-right muted tiny" aria-hidden="true"></i>
                                </a>
                            } @empty {
                                <div class="small muted">Nothing is waiting. Unusual, and worth enjoying.</div>
                            }
                        </div>
                    </div>

                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-chart-simple" aria-hidden="true"></i>
                            <h3>Orders per day</h3>
                            <span class="right small muted">last 7 days</span>
                        </div>
                        <div class="mj-card-pad">
                            <mjo-day-bars [Bars]="OrdersPerDay" Unit="orders" />
                        </div>
                    </div>

                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                            <h3>Where orders are sitting</h3>
                        </div>
                        <div class="mj-card-pad">
                            <mjo-bar-list [Rows]="StatusMix" EmptyText="No orders yet." />
                        </div>
                    </div>
                </div>

                <div class="mjo-dash__split mjo-dash__split--wide">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                            <h3>Latest orders</h3>
                            <span class="right">
                                <a href="#" class="small" (click)="OpenExplorerPreset('all')">Open in Explorer →</a>
                            </span>
                        </div>
                        <div class="mj-table-wrap">
                            <table class="mj-table mj-table--compact">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Customer</th>
                                        <th>Status</th>
                                        <th class="num">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (order of LatestOrders; track order.ID) {
                                        <tr class="is-clickable" (click)="OrderOpened.emit(order)">
                                            <td><span class="mono">{{ order.OrderNumber }}</span></td>
                                            <td>{{ customerOf(order) }}</td>
                                            <td>
                                                <span class="mj-chip" [class]="statusClass(order)">
                                                    {{ order.Status }}
                                                </span>
                                            </td>
                                            <td class="num" [class.mj-money--neg]="(order.TotalGross ?? 0) < 0">
                                                {{ (order.TotalGross ?? 0) | mjoMoney }}
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="4" class="small muted">No orders yet.</td></tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                            <h3>Worth a look</h3>
                        </div>
                        <div class="mj-card-pad">
                            @for (item of WorthALook; track item.Order.ID) {
                                <mj-alert [Variant]="item.Tone" [Icon]="item.Icon" Role="note">
                                    <strong>{{ item.Headline }}</strong>
                                    {{ item.Detail }}
                                    <a href="#" class="small" (click)="openFrom($event, item.Order)">Work it →</a>
                                </mj-alert>
                            } @empty {
                                <mj-empty-state
                                    Icon="fa-solid fa-circle-check"
                                    Title="Nothing is asking for attention"
                                    Size="compact" />
                            }
                        </div>
                    </div>
                </div>
            } @else if (ActiveTab === 'explorer') {
                <div class="mjo-explorer-wrapper">
                    @if (OrderEntityInfo) {
                        <mj-entity-viewer
                            [Entity]="OrderEntityInfo"
                            [FilterText]="ExplorerFilter"
                            (RecordOpened)="OnRecordOpened($event)">
                        </mj-entity-viewer>
                    } @else {
                        <div class="small muted" style="padding: 24px;">Loading order metadata...</div>
                    }
                </div>
            } @else if (ActiveTab === 'aging') {
                <div class="mjo-aging-pane">
                    <div class="mj-stat-grid">
                        <mjo-stat-tile
                            Label="Current (0-30 days)"
                            Icon="fa-solid fa-check"
                            [Value]="AgingCurrentDisplay"
                            Detail="Due or recently invoiced" />
                        <mjo-stat-tile
                            Label="31–60 days"
                            Icon="fa-solid fa-clock"
                            Tone="default"
                            [Value]="Aging30Display"
                            Detail="First reminder interval" />
                        <mjo-stat-tile
                            Label="61–90 days"
                            Icon="fa-solid fa-triangle-exclamation"
                            Tone="alert"
                            [Value]="Aging60Display"
                            Detail="Escalated collection required" />
                        <mjo-stat-tile
                            Label="90+ days overdue"
                            Icon="fa-solid fa-circle-xmark"
                            Tone="alert"
                            [Value]="Aging90Display"
                            Detail="High risk receivables" />
                    </div>

                    <div class="mjo-dash__split mjo-dash__split--wide" style="margin-top: var(--mj-space-6);">
                        <div class="mj-card">
                            <div class="mj-card-head">
                                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                                <h3>Overdue Collections Queue</h3>
                                <span class="right">
                                    <a href="#" class="small" (click)="OpenExplorerPreset('overdue')">View all overdue in Explorer →</a>
                                </span>
                            </div>
                            <div class="mj-table-wrap">
                                <table class="mj-table mj-table--compact">
                                    <thead>
                                        <tr>
                                            <th>Order</th>
                                            <th>Customer</th>
                                            <th>Due Date</th>
                                            <th class="num">Balance Due</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (order of overdue; track order.ID) {
                                            <tr class="is-clickable" (click)="OrderOpened.emit(order)">
                                                <td><span class="mono">{{ order.OrderNumber }}</span></td>
                                                <td>{{ customerOf(order) }}</td>
                                                <td>{{ order.DueDate ? (order.DueDate | date:'mediumDate') : '—' }}</td>
                                                <td class="num" style="color: var(--mj-status-error-text); font-weight: bold;">
                                                    {{ (order.Balance ?? 0) | mjoMoney }}
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr><td colspan="4" class="small muted">No overdue orders! Everything is current.</td></tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
            }
            .mjo-dashboard-container {
                padding: var(--mj-space-6);
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-4);
                min-height: 100%;
            }
            .mjo-tab-container {
                margin-bottom: var(--mj-space-2);
            }
            .mjo-explorer-wrapper {
                flex: 1;
                min-height: 650px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
            }
            .mjo-aging-pane {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-4);
            }
            .mjo-dash__split--wide {
                grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
                margin-top: var(--mj-space-4);
            }
            .mjo-dash__split {
                display: grid;
                grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-6);
            }
            .mjo-dash__queue {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                padding: var(--mj-space-3) 0;
                border-bottom: 1px solid var(--mj-border-subtle);
                color: inherit;
                cursor: pointer;
            }
            .mjo-dash__queue:last-child {
                border-bottom: none;
            }
            .mjo-dash__queue:hover {
                text-decoration: none;
            }
            .mjo-dash__queue:hover .mjo-dash__queue-label {
                color: var(--mj-brand-primary);
            }
            .mjo-dash__icon {
                width: 32px;
                height: 32px;
                border-radius: var(--mj-radius-md);
                flex: none;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
            }
            .mjo-tone-neutral { background: var(--mj-status-neutral-bg); color: var(--mj-status-neutral-text); }
            .mjo-tone-info    { background: var(--mj-status-info-bg);    color: var(--mj-status-info-text); }
            .mjo-tone-warning { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .mjo-tone-error   { background: var(--mj-status-error-bg);   color: var(--mj-status-error-text); }
            .mjo-tone-success { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .mjo-tone-violet  { background: var(--mj-status-violet-bg);  color: var(--mj-status-violet-text); }
            .mjo-dash__queue-body { flex: 1; min-width: 0; }
            .mjo-dash__queue-label { font-weight: var(--mj-font-medium); }
            .mjo-dash__queue-note { display: block; }
            .mjo-dash__count { font-size: 16px; }

            @media (max-width: 1200px) {
                .mjo-dash__split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 1000px) {
                .mjo-dash__split,
                .mjo-dash__split--wide { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                .mjo-dashboard-container {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOOrdersDashboardPageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() NavigateRequested = new EventEmitter<string>();
    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();

    public ActiveTab = 'overview';
    public Tabs: TabConfig[] = [
        { key: 'overview', label: 'Executive Overview', icon: 'fa-solid fa-chart-pie' },
        { key: 'explorer', label: 'Orders Explorer', icon: 'fa-solid fa-table-list' },
        { key: 'aging', label: 'Receivables & Aging', icon: 'fa-solid fa-hourglass-half' }
    ];

    public OrderEntityInfo: EntityInfo | null = null;
    public ExplorerFilter: string | null = null;

    private orders: mjBizAppsOrdersOrderHeaderEntity[] = [];

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.OrderEntityInfo = md.Entities.find(e => e.Name === 'MJ_BizApps_Orders: Order Headers') || null;
        this.orders = await GetOrders({ Preset: 'all' });
        this.cdr.detectChanges();
    }

    public OnTabChange(tabKey: string): void {
        this.ActiveTab = tabKey;
        if (tabKey !== 'explorer') {
            this.ExplorerFilter = null;
        }
        this.cdr.detectChanges();
    }

    public OpenExplorerPreset(preset: string): void {
        const today = new Date().toISOString().slice(0, 10);
        switch (preset) {
            case 'overdue':
                this.ExplorerFilter = `Balance > 0 AND DueDate IS NOT NULL AND DueDate < '${today}' AND Status NOT IN ('Draft','Quoted','Voided')`;
                break;
            case 'unpaid':
                this.ExplorerFilter = `Balance > 0 AND Status NOT IN ('Draft','Quoted','Voided')`;
                break;
            case 'drafts':
                this.ExplorerFilter = `Status IN ('Draft','Quoted')`;
                break;
            case 'credits':
                this.ExplorerFilter = `Balance < 0 AND Status NOT IN ('Draft','Quoted','Voided')`;
                break;
            default:
                this.ExplorerFilter = null;
                break;
        }
        this.ActiveTab = 'explorer';
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const match = this.orders.find(o => o.ID === id);
            if (match) {
                this.OrderOpened.emit(match);
            } else {
                const surrogate = { ID: id } as mjBizAppsOrdersOrderHeaderEntity;
                this.OrderOpened.emit(surrogate);
            }
        }
    }

    public get OrdersPerDay(): MJODayBar[] {
        const days: MJODayBar[] = [];
        const today = new Date();
        for (let back = 6; back >= 0; back--) {
            const day = new Date(today);
            day.setDate(day.getDate() - back);
            const iso = LocalDay(day);
            days.push({
                Label: day.toLocaleDateString('en-US', { weekday: 'short' }),
                Value: this.orders.filter((o) => ToISODate(o.OrderDate) === iso).length,
                Current: back === 0,
            });
        }
        return days;
    }

    public get LatestOrders(): mjBizAppsOrdersOrderHeaderEntity[] {
        return [...this.orders]
            .sort((a, b) => String(b.OrderDate ?? '').localeCompare(String(a.OrderDate ?? '')))
            .slice(0, 7);
    }

    public get WorthALook(): MJOAttentionItem[] {
        const today = new Date().toISOString().slice(0, 10);
        const items: MJOAttentionItem[] = [];

        const worst = this.overdue
            .slice()
            .sort((a, b) => DaysSince(String(b.DueDate), today) - DaysSince(String(a.DueDate), today))[0];
        if (worst) {
            const days = DaysSince(String(worst.DueDate), today);
            items.push({
                Order: worst,
                Tone: 'error',
                Icon: 'fa-solid fa-hourglass-half',
                Headline: `${worst.OrderNumber} is ${days} days past due.`,
                Detail: `${FormatMoney((worst.Balance ?? 0))} from ${this.customerOf(worst)}.`,
            });
        }

        const biggestCredit = this.credits
            .slice()
            .sort((a, b) => (a.Balance ?? 0) - (b.Balance ?? 0))[0];
        if (biggestCredit) {
            items.push({
                Order: biggestCredit,
                Tone: 'info',
                Icon: 'fa-solid fa-piggy-bank',
                Headline: `${this.customerOf(biggestCredit)} is holding ${FormatMoney(Math.abs((biggestCredit.Balance ?? 0)))}.`,
                Detail: 'Spend it before invoicing them again.',
            });
        }

        return items;
    }

    public customerOf(order: mjBizAppsOrdersOrderHeaderEntity): string {
        return (order.BillToOrganization ?? order.BillToPerson ?? '—') as string;
    }

    protected statusClass(order: mjBizAppsOrdersOrderHeaderEntity): string {
        switch (order.Status) {
            case 'Posted':
            case 'Fulfilled':
                return 'mj-chip--success';
            case 'Confirmed':
                return 'mj-chip--info';
            case 'Voided':
                return 'mj-chip--outline';
            default:
                return '';
        }
    }

    protected openFrom(event: Event, order: mjBizAppsOrdersOrderHeaderEntity): void {
        event.preventDefault();
        this.OrderOpened.emit(order);
    }

    public get open(): mjBizAppsOrdersOrderHeaderEntity[] {
        return this.orders.filter((o) => !['Draft', 'Quoted', 'Voided'].includes(o.Status));
    }

    public get owing(): mjBizAppsOrdersOrderHeaderEntity[] {
        return this.open.filter((o) => (o.Balance ?? 0) > 0);
    }

    public get overdue(): mjBizAppsOrdersOrderHeaderEntity[] {
        const today = new Date().toISOString().slice(0, 10);
        return this.owing.filter((o) => o.DueDate && DaysSince(o.DueDate, today) > 0);
    }

    public get credits(): mjBizAppsOrdersOrderHeaderEntity[] {
        return this.open.filter((o) => (o.Balance ?? 0) < 0);
    }

    public get OpenCountDisplay(): string {
        return String(this.open.length);
    }

    public get OpenValueDisplay(): string {
        return `${FormatMoney(this.open.reduce((s, o) => s + (o.TotalGross ?? 0), 0), { Round: true })} of orders`;
    }

    public get OpenBalanceDisplay(): string {
        return FormatMoney(this.owing.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get OverdueValueDisplay(): string {
        return FormatMoney(this.overdue.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get OverdueDetail(): string {
        const customers = new Set(this.overdue.map((o) => o.BillToOrganization ?? o.BillToPerson)).size;
        return `${this.overdue.length} order${this.overdue.length === 1 ? '' : 's'} across ${customers} customer${customers === 1 ? '' : 's'}`;
    }

    public get CreditsDisplay(): string {
        const total = this.credits.reduce((s, o) => s + Math.abs((o.Balance ?? 0)), 0);
        return FormatMoney(total, { Zero: '—' });
    }

    public get AgingCurrentDisplay(): string {
        const today = new Date().toISOString().slice(0, 10);
        const current = this.owing.filter((o) => !o.DueDate || DaysSince(o.DueDate, today) <= 30);
        return FormatMoney(current.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get Aging30Display(): string {
        const today = new Date().toISOString().slice(0, 10);
        const b30 = this.owing.filter((o) => {
            if (!o.DueDate) return false;
            const days = DaysSince(o.DueDate, today);
            return days > 30 && days <= 60;
        });
        return FormatMoney(b30.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get Aging60Display(): string {
        const today = new Date().toISOString().slice(0, 10);
        const b60 = this.owing.filter((o) => {
            if (!o.DueDate) return false;
            const days = DaysSince(o.DueDate, today);
            return days > 60 && days <= 90;
        });
        return FormatMoney(b60.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get Aging90Display(): string {
        const today = new Date().toISOString().slice(0, 10);
        const b90 = this.owing.filter((o) => {
            if (!o.DueDate) return false;
            const days = DaysSince(o.DueDate, today);
            return days > 90;
        });
        return FormatMoney(b90.reduce((s, o) => s + (o.Balance ?? 0), 0), { Round: true });
    }

    public get Queues(): MJOQueue[] {
        const drafts = this.orders.filter((o) => o.Status === 'Draft' || o.Status === 'Quoted').length;
        const notPosted = this.orders.filter((o) => o.Status === 'Confirmed').length;

        const all: MJOQueue[] = [
            { Label: 'Drafts waiting to be finished', Count: drafts, Icon: 'fa-solid fa-pen-ruler', Tone: 'neutral', PageId: 'list', Preset: 'drafts' },
            {
                Label: 'Confirmed but not posted',
                Note: 'Normally seconds — investigate if one lingers',
                Count: notPosted,
                Icon: 'fa-solid fa-clock',
                Tone: 'info',
                PageId: 'list',
                Preset: 'all'
            },
            { Label: 'Overdue invoices', Count: this.overdue.length, Icon: 'fa-solid fa-hourglass-half', Tone: 'error', PageId: 'list', Preset: 'overdue' },
            {
                Label: 'Credits customers are holding',
                Note: 'Spendable — offer them before invoicing again',
                Count: this.credits.length,
                Icon: 'fa-solid fa-piggy-bank',
                Tone: 'success',
                PageId: 'list',
                Preset: 'credits'
            },
        ];
        return all.filter((q) => q.Count > 0);
    }

    public get StatusMix(): MJOBarRow[] {
        const counts = new Map<string, number>();
        for (const order of this.orders) {
            counts.set(order.Status, (counts.get(order.Status) ?? 0) + 1);
        }
        const order = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'];
        return order
            .filter((s) => counts.has(s))
            .map((s) => ({ Label: s, Value: counts.get(s)!, Display: String(counts.get(s)) }));
    }

    protected goQueue(event: Event, queue: MJOQueue): void {
        event.preventDefault();
        if (queue.Preset) {
            this.OpenExplorerPreset(queue.Preset);
        } else {
            this.NavigateRequested.emit(queue.PageId);
        }
    }
}
