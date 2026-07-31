import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';
import { MJOOrdersDataService, type MJOOrderRow } from '../../services/orders-data.service';
import { FormatMoney, DaysSince } from '../../panels/money-format';

/** A queue worth someone's attention, with where it leads. */
interface MJOQueue {
    Label: string;
    Note?: string;
    Count: number;
    Icon: string;
    Tone: 'neutral' | 'info' | 'warning' | 'error' | 'success' | 'violet';
    PageId: string;
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
    imports: [CommonModule, MJOStatTileComponent, MJOBarListComponent],
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
                    <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                    <h3>Where orders are sitting</h3>
                </div>
                <div class="mj-card-pad">
                    <mjo-bar-list [Rows]="StatusMix" EmptyText="No orders yet." />
                    <div class="small muted mjo-dash__note">
                        Directly labelled, so the bar is a comparison aid rather than the only way to read
                        the value.
                    </div>
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
            .mjo-dash__split {
                display: grid;
                grid-template-columns: 1.2fr 1fr;
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

            @media (max-width: 1000px) {
                .mjo-dash__split {
                    grid-template-columns: 1fr;
                }
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
    private readonly data = inject(MJOOrdersDataService);

    /** A tile or queue was activated. Carries the rail page id to open. */
    @Output() NavigateRequested = new EventEmitter<string>();

    private orders: MJOOrderRow[] = [];

    public async ngOnInit(): Promise<void> {
        this.orders = await this.data.GetOrders({ Preset: 'all' });
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    private get open(): MJOOrderRow[] {
        return this.orders.filter((o) => !['Draft', 'Quoted', 'Voided'].includes(o.Status));
    }

    private get owing(): MJOOrderRow[] {
        return this.open.filter((o) => o.Balance > 0);
    }

    private get overdue(): MJOOrderRow[] {
        const today = new Date().toISOString().slice(0, 10);
        return this.owing.filter((o) => o.DueDate && DaysSince(o.DueDate, today) > 0);
    }

    private get credits(): MJOOrderRow[] {
        return this.open.filter((o) => o.Balance < 0);
    }

    public get OpenCountDisplay(): string {
        return String(this.open.length);
    }

    public get OpenValueDisplay(): string {
        return `${FormatMoney(this.open.reduce((s, o) => s + o.TotalGross, 0), { Round: true })} of orders`;
    }

    public get OpenBalanceDisplay(): string {
        return FormatMoney(this.owing.reduce((s, o) => s + o.Balance, 0), { Round: true });
    }

    public get OverdueValueDisplay(): string {
        return FormatMoney(this.overdue.reduce((s, o) => s + o.Balance, 0), { Round: true });
    }

    public get OverdueDetail(): string {
        const customers = new Set(this.overdue.map((o) => o.BillToOrganization ?? o.BillToPerson)).size;
        return `${this.overdue.length} order${this.overdue.length === 1 ? '' : 's'} across ${customers} customer${customers === 1 ? '' : 's'}`;
    }

    public get CreditsDisplay(): string {
        const total = this.credits.reduce((s, o) => s + Math.abs(o.Balance), 0);
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
