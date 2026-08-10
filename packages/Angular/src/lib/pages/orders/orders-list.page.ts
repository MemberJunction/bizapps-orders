import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { MJOSummaryStripComponent, type MJOSummaryFigure } from '../../panels/summary-strip.component';
import { GetOrderSummary, GetOrders, type MJOOrderSummary } from '../../data/orders-queries';
import { FormatDate, FormatMoney, DaysSince } from '../../panels/money-format';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';

/**
 * `mjo-orders-list-page` — find any order, then work a filtered set.
 *
 * Preset chips are the fast path; search narrows within the active preset. There
 * is deliberately no second filter system inside the table: two of them on one
 * screen means neither gets trusted, and a user cannot tell why a row is missing.
 *
 * WHAT THE PRESETS ENCODE. Each one is a business rule, and each is a filter
 * rather than a stored flag because every one of them changes with the clock or
 * with a rollup — most obviously `overdue`, which is a balance past its due date
 * and therefore changes as time passes rather than as anything is written.
 *
 * `credits` is worth naming: a customer's credit is an order with a NEGATIVE
 * balance, not a separate instrument, so it filters here like anything else.
 *
 * ## Example
 *
 * ```html
 * <mjo-orders-list-page (OrderOpened)="openOrder($event)" />
 * ```
 */
@Component({
    selector: 'mjo-orders-list-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent, MJOSummaryStripComponent],
    template: `
        <mjo-summary-strip [Figures]="SummaryFigures" />

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="Presets"
            [ActivePreset]="Preset"
            [Search]="Search"
            SearchPlaceholder="Order №, customer, memo, or their PO…"
            RowKey="ID"
            EmptyTitle="No orders match"
            EmptyHint="Try a different preset, or clear the search."
            [FootNote]="FootNote"
            (PresetChanged)="OnPreset($event)"
            (SearchChanged)="OnSearch($event)"
            (RowClicked)="OrderOpened.emit($any($event))" />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOOrdersListPageComponent implements OnInit {
    /**
     * Render what was just loaded.
     *
     * These pages are created imperatively by the section shell through
     * `ViewContainerRef.createComponent`. When an async load assigns across
     * Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the DOM
     * write. Nothing re-renders afterwards, so the recorded "previous" value stays
     * pre-load while the getter returns the loaded one — the mismatch then repeats
     * on every tick and the view is frozen for good. It is not a flicker: the
     * Orders dashboard sat at "0 open orders / $0.00" against 73 real orders, and
     * read as a quiet day rather than a broken screen.
     *
     * Writing the DOM here ends it: the rendered value matches the getter from the
     * first pass on, so later verify passes agree.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    /** A row was opened. The host decides whether that is a slide-in or a tab. */
    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();

    public Rows: mjBizAppsOrdersOrderHeaderEntity[] = [];
    public Preset = 'all';
    public Search = '';
    public Loading = false;

    /**
     * Presets, in the order someone reaches for them: the whole set, then the two
     * that represent money owed, then work-in-progress, then the cuts.
     */
    /** Rebuilt when the summary lands, so each chip carries its own count. */
    public Presets: MJOPreset[] = [
        { Key: 'all', Label: 'All open' },
        { Key: 'overdue', Label: 'Overdue', Icon: 'fa-solid fa-hourglass-half' },
        { Key: 'unpaid', Label: 'Unpaid' },
        { Key: 'notposted', Label: 'Confirmed, not posted' },
        { Key: 'drafts', Label: 'Drafts' },
        { Key: 'credits', Label: 'Credits', Icon: 'fa-solid fa-piggy-bank' },
    ];

    public readonly Columns: MJOColumn<mjBizAppsOrdersOrderHeaderEntity>[] = [
        {
            Key: 'OrderNumber',
            Label: 'Order',
            Kind: 'mono',
            Width: '112px',
            Sortable: true,
        },
        {
            Key: 'OrderDate',
            Label: 'Date',
            Width: '96px',
            Sortable: true,
            Format: (r) => FormatDate(r.OrderDate, { Short: true }),
            Secondary: (r) => String(r.OrderDate ?? '').slice(0, 4),
        },
        {
            Key: 'Customer',
            Label: 'Customer',
            Format: (r) => (r.BillToOrganization ?? r.BillToPerson ?? '—') as string,
            Secondary: (r) => (r.Description as string) ?? null,
        },
        {
            Key: 'Company',
            Label: 'Co.',
            Width: '90px',
            HideBelow: 1000,
        },
        {
            Key: 'Status',
            Label: 'Status',
            Kind: 'chip',
            Width: '100px',
            ChipClass: (r) =>
                r.Status === 'Posted' || r.Status === 'Fulfilled'
                    ? 'mj-chip--success'
                    : r.Status === 'Confirmed'
                      ? 'mj-chip--brand'
                      : r.Status === 'Voided'
                        ? 'mj-chip--outline'
                        : '',
        },
        {
            Key: 'PaymentStatus',
            Label: 'Payment',
            Kind: 'chip',
            Width: '100px',
            HideBelow: 760,
            Format: (r) => (r.PaymentStatus === 'PartiallyPaid' ? 'Part paid' : (r.PaymentStatus as string)),
            ChipClass: (r) =>
                r.PaymentStatus === 'Paid'
                    ? 'mj-chip--success'
                    : r.PaymentStatus === 'Overdue'
                      ? 'mj-chip--error'
                      : r.PaymentStatus === 'PartiallyPaid'
                        ? 'mj-chip--warning'
                        : '',
        },
        {
            Key: 'TotalGross',
            Label: 'Total',
            Kind: 'money',
            Width: '112px',
            Sortable: true,
            HideBelow: 560,
            Format: (r) => FormatMoney((r.TotalGross ?? 0)),
        },
        {
            Key: 'Balance',
            Label: 'Balance',
            Kind: 'money',
            Width: '116px',
            Sortable: true,
            // A negative balance is the customer's CREDIT, so it reads as an amount
            // they hold rather than a debt with a minus sign in front of it.
            Format: (r) =>
                (r.Balance ?? 0) === 0
                    ? '—'
                    : (r.Balance ?? 0) < 0
                      ? FormatMoney((r.Balance ?? 0), { Sign: 'absolute' })
                      : FormatMoney((r.Balance ?? 0)),
            Secondary: (r) => ((r.Balance ?? 0) < 0 ? 'credit' : null),
        },
        {
            Key: 'DueDate',
            Label: 'Due',
            Width: '104px',
            HideBelow: 760,
            Format: (r) => (r.DueDate ? FormatDate(r.DueDate, { Short: true }) : '—'),
            Secondary: (r) => {
                if (!r.DueDate || (r.Balance ?? 0) <= 0) return null;
                const late = DaysSince(r.DueDate, new Date().toISOString().slice(0, 10));
                return late > 0 ? `${late}d late` : null;
            },
        },
    ];

    public get FootNote(): string {
        return (
            `${this.Rows.length} order${this.Rows.length === 1 ? '' : 's'}. ` +
            'Filtering happens in the query rather than the browser, so a column that cannot be ' +
            'filtered cheaply does not advertise that it can.'
        );
    }

    public async ngOnInit(): Promise<void> {
        // The summary is read once. It describes the whole population, so it does
        // not change when a preset narrows the table — re-reading it per chip
        // would spend a round trip to produce the same four numbers.
        await Promise.all([this.load(), this.loadSummary()]);
        this.cdr.detectChanges();
    }

    /** Counts for the chips and totals for the strip. */
    private async loadSummary(): Promise<void> {
        this.Summary = await GetOrderSummary();
        this.Presets = this.Presets.map((preset) => ({
            ...preset,
            Count: this.Summary?.Counts[preset.Key] ?? null,
        }));
        this.cdr.detectChanges();
    }

    public async OnPreset(preset: string): Promise<void> {
        this.Preset = preset;
        await this.load();
        this.cdr.detectChanges();
    }

    public async OnSearch(text: string): Promise<void> {
        this.Search = text;
        await this.load();
        this.cdr.detectChanges();
    }

    /** What the strip renders, already formatted. */
    public get SummaryFigures(): MJOSummaryFigure[] {
        const summary = this.Summary;
        if (!summary) return [];
        return [
            { Label: 'Orders', Value: String(summary.Total) },
            { Label: 'Total value', Value: FormatMoney(summary.TotalValue) },
            { Label: 'Open balance', Value: FormatMoney(summary.OpenBalance) },
            {
                Label: 'Credits held',
                // Shown NEGATIVE and in the credit tone: it is money owed the other
                // way, and printing it like a debt inverts what it means.
                Value: summary.CreditsHeld ? FormatMoney(-summary.CreditsHeld) : '—',
                Tone: summary.CreditsHeld ? 'credit' : 'muted',
            },
        ];
    }

    public Summary: MJOOrderSummary | null = null;

    private async load(): Promise<void> {
        this.Loading = true;
        try {
            this.Rows = await GetOrders({
                Preset: this.Preset as never,
                Search: this.Search,
            });
        } finally {
            this.Loading = false;
        }
        this.cdr.detectChanges();
    }
}
