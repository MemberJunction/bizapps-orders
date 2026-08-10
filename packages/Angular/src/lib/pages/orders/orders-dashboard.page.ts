import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJODayBarsComponent, type MJODayBar } from '../../panels/day-bars.component';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';

import { DaysSince, FormatMoney, MJOMoneyPipe } from '../../panels/money-format';
import { MJAlertComponent, MJEmptyStateComponent, type MJAlertVariant } from '@memberjunction/ng-ui-components';
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
}

/** Something specific worth acting on, with the order it concerns. */
interface MJOAttentionItem {
    Order: mjBizAppsOrdersOrderHeaderEntity;
    /** How alarmed to be — drives the mj-alert variant directly. */
    Tone: MJAlertVariant;
    Icon: string;
    Headline: string;
    Detail: string;
}

/**
 * `mjo-orders-dashboard-page` — is today normal, and what needs a person?
 *
 * WORK QUEUES ABOVE THE TREND. What earns space on an operational dashboard is
 * what someone can act on. A chart of orders per day is interesting once a week;
 * "three drafts are sitting unfinished and four invoices are overdue" is
 * actionable now, so it comes first and it is clickable.
 *
 * EVERY FIGURE IS A CHEAP COUNT over rows the list screens already fetch. No
 * on-demand aggregate, no long-running rollup — a dashboard that takes four
 * seconds to load gets closed, and then it answers nothing.
 *
 * ## Example
 *
 * ```html
 * <mjo-orders-dashboard-page (NavigateRequested)="section.OnPageSelected($event)" />
 * ```
 */
@Component({
    selector: 'mjo-orders-dashboard-page',
    standalone: true,
    imports: [CommonModule, MJAlertComponent, MJEmptyStateComponent, MJOStatTileComponent, MJOBarListComponent, MJODayBarsComponent, MJOMoneyPipe],
    template: `
        <div class="mj-stat-grid">
            <mjo-stat-tile
                Label="Open orders"
                Icon="fa-solid fa-file-invoice-dollar"
                [Value]="OpenCountDisplay"
                [Detail]="OpenValueDisplay" />

            <mjo-stat-tile
                Label="Open balance"
                Icon="fa-solid fa-scale-balanced"
                [Value]="OpenBalanceDisplay"
                Detail="Confirmed orders still carrying a balance" />

            <mjo-stat-tile
                Label="Overdue"
                Icon="fa-solid fa-hourglass-half"
                Tone="alert"
                [Value]="OverdueValueDisplay"
                [Detail]="OverdueDetail"
                (Clicked)="NavigateRequested.emit('list')" />

            <mjo-stat-tile
                Label="Credits held"
                Icon="fa-solid fa-piggy-bank"
                [Value]="CreditsDisplay"
                Detail="Offer these before invoicing again"
                (Clicked)="NavigateRequested.emit('list')" />
        </div>

        <div class="mjo-dash__split">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                    <h3>Needs someone</h3>
                </div>
                <div class="mj-card-pad mjo-dash__queues">
                    @for (queue of Queues; track queue.Label) {
                        <a href="#" class="mjo-dash__queue" (click)="go($event, queue.PageId)">
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
                        <a href="#" class="small" (click)="go($event, 'list')">All orders →</a>
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
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            /* The bottom row is two panels, not three — a table needs the width. */
            .mjo-dash__split--wide {
                grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
                margin-top: var(--mj-space-4);
            }
            .mjo-dash__split {
                display: grid;
                /* Queues, the per-day chart, and the status mix. The queues get the
                   most room because they are the only column anyone acts on. */
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
            .mjo-dash__note { margin-top: var(--mj-space-3); }

            @media (max-width: 1200px) {
                /* Three panels do not survive this width; the chart is the one
                   that reads worst when squeezed, so it wraps first. */
                .mjo-dash__split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 1000px) {
                .mjo-dash__split,
                .mjo-dash__split--wide { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOOrdersDashboardPageComponent implements OnInit {

    /**
     * Render what was just loaded.
     *
     * These pages are created imperatively by the section shell through
     * `ViewContainerRef.createComponent`. When an async load assigns across
     * Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the DOM
     * write. Nothing re-renders afterwards, so the recorded "previous" value stays
     * pre-load while the getter returns the loaded one — the mismatch then repeats
     * on every tick and the view is frozen for good. It is not a flicker: this
     * dashboard sat at "0 open orders / $0.00" against 73 real orders, reading as a
     * quiet day rather than a broken screen.
     *
     * Writing the DOM here ends it: the rendered value matches the getter from the
     * first pass on, so later verify passes agree.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    /** A tile or queue was activated. Carries the rail page id to open. */
    @Output() NavigateRequested = new EventEmitter<string>();

    /** A row was chosen. The section routes it. */
    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();

    private orders: mjBizAppsOrdersOrderHeaderEntity[] = [];

    public async ngOnInit(): Promise<void> {
        this.orders = await GetOrders({ Preset: 'all' });
        this.cdr.detectChanges();
    }

    /* ── Recent activity ────────────────────────────────────────────────── */

    /**
     * The last seven days, oldest first.
     *
     * Built from the orders ALREADY loaded rather than a grouped query. The
     * dashboard has them in hand, and a GROUP BY round trip to bucket rows this
     * screen is already holding is work with no answer attached to it.
     */
    public get OrdersPerDay(): MJODayBar[] {
        const days: MJODayBar[] = [];
        const today = new Date();
        for (let back = 6; back >= 0; back--) {
            const day = new Date(today);
            day.setDate(day.getDate() - back);
            // LOCAL day for the key, matching the LOCAL day the label is built from. `toISOString()`
            // here names tomorrow all evening east of the meridian, so the bar would say "Mon" and
            // count Tuesday's orders.
            const iso = LocalDay(day);
            days.push({
                Label: day.toLocaleDateString('en-US', { weekday: 'short' }),
                Value: this.orders.filter((o) => ToISODate(o.OrderDate) === iso).length,
                Current: back === 0,
            });
        }
        return days;
    }

    /** Newest first — what just happened, not what matters most. */
    public get LatestOrders(): mjBizAppsOrdersOrderHeaderEntity[] {
        return [...this.orders]
            .sort((a, b) => String(b.OrderDate ?? '').localeCompare(String(a.OrderDate ?? '')))
            .slice(0, 7);
    }

    /**
     * Named, specific things to act on.
     *
     * Deliberately NOT a count. "4 overdue invoices" is a number someone has to
     * go and decode; "ORD-0961 is 90 days past due, $890 from Marcus Webb" is
     * already the decision. A vague attention panel trains people to skip it, so
     * an empty one is better than a general one.
     */
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

    /** Who the order is for, however the customer is recorded. */
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

    /** Named `openFrom`, not `open` — `open` is already the set of open orders. */
    protected openFrom(event: Event, order: mjBizAppsOrdersOrderHeaderEntity): void {
        event.preventDefault();
        this.OrderOpened.emit(order);
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    private get open(): mjBizAppsOrdersOrderHeaderEntity[] {
        return this.orders.filter((o) => !['Draft', 'Quoted', 'Voided'].includes(o.Status));
    }

    private get owing(): mjBizAppsOrdersOrderHeaderEntity[] {
        return this.open.filter((o) => (o.Balance ?? 0) > 0);
    }

    private get overdue(): mjBizAppsOrdersOrderHeaderEntity[] {
        const today = new Date().toISOString().slice(0, 10);
        return this.owing.filter((o) => o.DueDate && DaysSince(o.DueDate, today) > 0);
    }

    private get credits(): mjBizAppsOrdersOrderHeaderEntity[] {
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

    /* ── Queues ─────────────────────────────────────────────────────────── */

    /** Only queues with something in them — an empty queue is not a call to action. */
    public get Queues(): MJOQueue[] {
        const drafts = this.orders.filter((o) => o.Status === 'Draft' || o.Status === 'Quoted').length;
        const notPosted = this.orders.filter((o) => o.Status === 'Confirmed').length;

        const all: MJOQueue[] = [
            { Label: 'Drafts waiting to be finished', Count: drafts, Icon: 'fa-solid fa-pen-ruler', Tone: 'neutral', PageId: 'list' },
            {
                Label: 'Confirmed but not posted',
                Note: 'Normally seconds — investigate if one lingers',
                Count: notPosted,
                Icon: 'fa-solid fa-clock',
                Tone: 'info',
                PageId: 'list',
            },
            { Label: 'Overdue invoices', Count: this.overdue.length, Icon: 'fa-solid fa-hourglass-half', Tone: 'error', PageId: 'list' },
            {
                Label: 'Credits customers are holding',
                Note: 'Spendable — offer them before invoicing again',
                Count: this.credits.length,
                Icon: 'fa-solid fa-piggy-bank',
                Tone: 'success',
                PageId: 'list',
            },
        ];
        return all.filter((q) => q.Count > 0);
    }

    /* ── Status mix ─────────────────────────────────────────────────────── */

    public get StatusMix(): MJOBarRow[] {
        const counts = new Map<string, number>();
        for (const order of this.orders) {
            counts.set(order.Status, (counts.get(order.Status) ?? 0) + 1);
        }
        // Lifecycle order, not alphabetical — the sequence is the story.
        const order = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'];
        return order
            .filter((s) => counts.has(s))
            .map((s) => ({ Label: s, Value: counts.get(s)!, Display: String(counts.get(s)) }));
    }

    protected go(event: Event, pageId: string): void {
        event.preventDefault();
        this.NavigateRequested.emit(pageId);
    }
}
