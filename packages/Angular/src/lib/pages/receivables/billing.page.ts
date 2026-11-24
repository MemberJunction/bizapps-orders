import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersGetBillingWorklistOperation,
    OrdersIssueInstalmentInvoiceOperation,
    RequireUUID,
    Today,
    type BillingWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOSidePanelComponent } from '../../panels/side-panel.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistBarComponent, type MJOWorklistExport } from '../../panels/worklist-bar.component';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { IssueInvoiceBlockedReason } from './billing-issue';
import {
    BuildWorklistExport,
    AddressKey,
    AdoptCompanyChoice,
    AdoptWindow,
    COMPANY_ADDRESS_KEY,
    CUSTOM_WINDOW,
    CompaniesToAddress,
    DaysBetween,
    ExportFileName,
    FilterByCompanies,
    InDayRange,
    MatchesText,
    NextSort,
    ReadWorklistState,
    ReconcileCompanies,
    ResolveWindow,
    RestoreSort,
    RestoreWindow,
    SameChoice,
    SameWindow,
    ShownSummary,
    SortRows,
    WindowToAddress,
    WriteSharedCompanies,
    WriteWorklistState,
    type DayRange,
    type DayWindow,
    type DayWindowOption,
    type WorklistCompanyOption,
    type WorklistExportField,
    type WorklistSort,
} from './worklist-view.model';

/**
 * How far ahead the worklist can look. Every choice but the custom one also lists what is already
 * past due: an installment nobody invoiced does not stop needing an invoice because its date passed.
 */
export const BILLING_WINDOWS: ReadonlyArray<DayWindowOption> = [
    { Key: '7', Label: 'Next 7 days', FromOffset: null, ToOffset: 7 },
    { Key: '30', Label: 'Next 30 days', FromOffset: null, ToOffset: 30 },
    { Key: '60', Label: 'Next 60 days', FromOffset: null, ToOffset: 60 },
    { Key: '90', Label: 'Next 90 days', FromOffset: null, ToOffset: 90 },
    { Key: '365', Label: 'Next 12 months', FromOffset: null, ToOffset: 365 },
    { Key: 'all', Label: 'All dates', FromOffset: null, ToOffset: null },
    { Key: CUSTOM_WINDOW, Label: 'Custom dates…', FromOffset: null, ToOffset: null },
];

/** The page opens on a month: the working view for invoicing. Longer windows are a choice. */
const DEFAULT_WINDOW: DayWindow = { Key: '30', From: null, To: null };

/** What the operation is asked for when the window has no end: far enough ahead to reach every schedule. */
const ALL_DAYS = 36_500;
/** The operation lists 500 rows unless told otherwise; a window past a quarter, or one with a first day, asks for room. */
const WIDE_WINDOW_MAX_ROWS = 5_000;

const BILLING_STATE_KEY = 'mjOrders.billingWorklist.view';
/** The tab-address key for this page's window. */
const DUE_ADDRESS_KEY = 'billingDue';

const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const PAYMENT_PROVIDER_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Types';
/** Provider type codes that invoice through an external rail. Mirrors `INVOICE_RAIL_TYPE_CODES`. */
const RAIL_TYPE_CODES = ['BillCom'];

/** The quick filters, which the tiles turn on. */
type BillingPreset = 'all' | 'pastdue' | 'week';
const PRESET_LABELS: Record<BillingPreset, string> = { all: 'All', pastdue: 'Past due', week: 'Next 7 days' };

/**
 * `mjo-billing-page` — instalments due with no invoice behind them (AIDP-24, plan §6.3).
 *
 * THE CONTROL FINANCE RUNS BY HAND TODAY. A multi-year contract billed in instalments has rows due
 * in 2027 and 2029 that nobody will remember. This screen is where they surface on their own: every
 * `Scheduled` instalment of a confirmed order whose due date is inside the window, earliest first, with the act that
 * turns it into a receivable document one confirmation away.
 *
 * ONE ROW OPENS BESIDE THE LIST; SEVERAL ARE TICKED. Clicking an installment shows its facts and its
 * Issue button in a panel next to the table. Ticking rows issues them together, one confirmation
 * for the batch, each installment issued on its own so one refusal does not stop the rest.
 *
 * ISSUING IS THE IRREVERSIBLE STEP, so it asks first — through `MJConfirmService`, never
 * `window.confirm`, which throws under the Electron host. Once issued the number is frozen on the
 * row and the row leaves this list.
 *
 * THE COMPANY CHOICE IS SHARED with the other Receivables pages, and it and the window are kept in
 * the tab's address through the section (`AddressChanged` / `ApplyAddress`) and follow Back and
 * Forward. A link carries them too, but opens on the Receivables page its reader last used.
 *
 * ## Example
 *
 * ```html
 * <mjo-billing-page (OrderOpened)="open($event)" (AddressChanged)="write($event)" />
 * ```
 */
@Component({
    selector: 'mjo-billing-page',
    standalone: true,
    imports: [CommonModule, MJButtonDirective, MJAlertComponent, MJOSidePanelComponent, MJOStatTileComponent, MJOWorklistBarComponent, MJOWorklistTableComponent],
    template: `
        <mjo-worklist-bar
            [Companies]="Companies"
            [CompanyPicks]="CompanyPicks"
            [Search]="Search"
            SearchPlaceholder="Search customer, order number or description"
            [ActiveFilter]="Preset === 'all' ? null : PresetLabel"
            [Summary]="Summary"
            [Loading]="Loading"
            [BuildExport]="BuildExport"
            [CanExport]="Rows.length > 0"
            (CompanyPicksChange)="OnCompanies($event)"
            (SearchChange)="OnSearch($event)"
            (ActiveFilterCleared)="OnPreset('all')"
            (RefreshRequested)="Refresh()">
            <label class="mjo-bl__window">
                <span class="small muted">Due</span>
                <select class="mjo-bl__select" [value]="Window.Key" (change)="OnWindow($any($event.target).value)" aria-label="Which due dates to list">
                    @for (option of Windows; track option.Key) {
                        <option [value]="option.Key" [selected]="option.Key === Window.Key">{{ option.Label }}</option>
                    }
                </select>
            </label>
            @if (IsCustomWindow) {
                <label class="mjo-bl__window">
                    <span class="small muted">From</span>
                    <input class="mjo-bl__select" type="date" [value]="Window.From ?? ''" (change)="OnCustomDay('From', $any($event.target).value)" aria-label="Earliest due date">
                </label>
                <label class="mjo-bl__window">
                    <span class="small muted">To</span>
                    <input class="mjo-bl__select" type="date" [value]="Window.To ?? ''" (change)="OnCustomDay('To', $any($event.target).value)" aria-label="Latest due date">
                </label>
            }
        </mjo-worklist-bar>

        <!-- The tiles total what the company filter, the dates and the search leave. Past due and Next 7 days are also quick filters; the figures do not change when one is on. -->
        <div class="mj-stat-grid mjo-bl__tiles">
            <mjo-stat-tile
                class="mjo-bl__tile"
                Hint="Show every installment listed"
                [Label]="TotalLabel"
                Icon="fa-solid fa-file-invoice-dollar"
                [Value]="TotalDisplay"
                [Detail]="TotalDetail"
                (Clicked)="OnPreset('all')" />

            <mjo-stat-tile
                class="mjo-bl__tile"
                [class.is-on]="Preset === 'pastdue'"
                [Pressed]="Preset === 'pastdue'"
                Hint="Show installments past their due date"
                Label="Past due, not yet invoiced"
                Icon="fa-solid fa-hourglass-half"
                [Tone]="PastDue.Count ? 'alert' : 'default'"
                [Value]="String(PastDue.Count)"
                [Detail]="PastDue.Count ? money(PastDue.Amount) + ' · issue these first' : IsCustomWindow ? 'None in these dates' : 'Nothing is late'"
                (Clicked)="OnPreset('pastdue')" />

            <mjo-stat-tile
                class="mjo-bl__tile"
                [class.is-on]="Preset === 'week'"
                [Pressed]="Preset === 'week'"
                Hint="Show installments due today or in the next 7 days"
                Label="Due in the next 7 days"
                Icon="fa-regular fa-calendar"
                [Value]="String(Week.Count)"
                [Detail]="Week.Count ? money(Week.Amount) : 'Nothing due this week'"
                (Clicked)="OnPreset('week')" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-bl__note">
                <strong>The billing worklist did not load.</strong>
                {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-bl__note">
                {{ Notice.Text }}
            </mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-bl__note">
                <strong>List truncated.</strong>
                Not every installment in these dates is shown, and the figures above cover only those that are.
            </mj-alert>
        }

        <div class="mjo-split">
            <div class="mjo-split__main">
                <div class="row mjo-bl__actions">
                    <button type="button" mjButton variant="primary" [disabled]="!CheckedIDs.length || Issuing" (click)="IssueChecked()" title="Issue an invoice for each ticked installment">
                        <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                        {{ Issuing && IssueProgress ? IssueProgress : 'Issue invoices' + (CheckedIDs.length ? ' (' + CheckedIDs.length + ')' : '') }}
                    </button>
                    <span class="small muted">
                        {{ CheckedIDs.length ? CheckedSummary : 'Select an installment to see its detail. Tick several to issue them together.' }}
                    </span>
                </div>

                <mjo-worklist-table
                    [Columns]="Columns"
                    [Rows]="Rows"
                    [Searchable]="false"
                    [Loading]="Loading"
                    [Totals]="Totals"
                    MaxHeight="calc(100vh - 330px)"
                    [SortKey]="Sort.Key"
                    [SortDescending]="Sort.Descending"
                    RowKey="OrderHeaderPaymentScheduleID"
                    [SelectedKey]="Selected?.OrderHeaderPaymentScheduleID ?? null"
                    [Selectable]="true"
                    [SelectedKeys]="CheckedIDs"
                    [SelectableRow]="CanTick"
                    [RowLabel]="TickLabel"
                    [EmptyTitle]="EmptyTitle"
                    [EmptyHint]="EmptyHint"
                    EmptyIcon="fa-solid fa-file-invoice-dollar"
                    (SelectionChanged)="CheckedIDs = $event"
                    (SortChanged)="OnSort($event)"
                    (LinkClicked)="OpenOrder($event.Row)"
                    (RowClicked)="OnRow($event)" />
            </div>

            @if (Selected; as row) {
                <div class="mjo-split__side">
                    <mjo-side-panel
                        Icon="fa-solid fa-file-invoice-dollar"
                        [Title]="row.OrderNumber + ' · installment ' + row.InstallmentNumber + ' of ' + row.InstallmentCount"
                        [Chip]="row.OrderStatus"
                        [ChipClass]="row.OrderStatus === 'Confirmed' ? 'mjo-chip--success' : 'mjo-chip--outline'"
                        (Closed)="Selected = null">
                        <div class="mjo-side-panel__amount">{{ money(row.Amount) }}</div>
                        <dl class="mjo-side-panel__facts">
                            <dt>Customer</dt>
                            <dd>{{ row.CustomerName }}</dd>
                            <dt>Order</dt>
                            <dd><button type="button" class="mjo-side-panel__link" (click)="OpenOrder(row)" title="Open the order">{{ row.OrderNumber }}</button></dd>
                            <dt>Due</dt>
                            <dd>{{ date(row.DueDate) }} · {{ dueNote(row) }}</dd>
                            <dt>Billed by</dt>
                            <dd>{{ row.CompanyName || '—' }}</dd>
                            @if (row.Description) {
                                <dt>For</dt>
                                <dd>{{ row.Description }}</dd>
                            }
                            <dt>After issuing</dt>
                            <dd>{{ RailFor(row.CompanyID) ? 'Sent automatically through ' + RailFor(row.CompanyID) : 'Not sent automatically' }}</dd>
                        </dl>
                        <div class="mjo-side-panel__actions">
                            <button type="button" mjButton variant="primary" [disabled]="Issuing || !!IssueBlockedReason" (click)="IssueSelected()">
                                <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                                {{ Issuing ? 'Issuing…' : 'Issue invoice' }}
                            </button>
                            <button type="button" mjButton variant="outline" (click)="OpenOrder(row)">
                                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open order
                            </button>
                        </div>
                        @if (IssueBlockedReason; as why) {
                            <p class="small mjo-bl__blocked mjo-side-panel__note">{{ why }}</p>
                        }
                    </mjo-side-panel>
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
                padding: var(--mj-space-6);
            }
            .mjo-bl__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-bl__tile {
                display: block;
                border-radius: var(--mj-radius-md);
                transition: box-shadow 140ms ease;
            }
            /* Ringed only while its quick filter is on. The first tile, which clears the filter, never is. */
            .mjo-bl__tile.is-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 55%, transparent); }
            .mjo-bl__note { display: block; margin-bottom: var(--mj-space-4); }
            .mjo-bl__blocked { color: var(--mj-status-warning-text); }
            .mjo-bl__window {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2);
            }
            .mjo-bl__select {
                font: inherit;
                font-size: 13px;
                padding: 4px 8px;
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface);
                color: inherit;
            }
            .mjo-bl__actions {
                align-items: center;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-3);
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
            @media (prefers-reduced-motion: reduce) {
                .mjo-bl__tile { transition: none; }
            }
        `,
    ],
})
export class MJOBillingPageComponent implements OnInit {
    /** Same NG0100 reasoning as every other imperatively-created page here: write the DOM after a load. */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();
    /** The company choice or the window changed: the section writes it to the tab's address. A null value removes the key. */
    @Output() AddressChanged = new EventEmitter<Record<string, string | null>>();

    public readonly String = String;
    public readonly Windows = BILLING_WINDOWS;

    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Issuing = false;
    /** "Issuing 3 of 12…" while a batch runs. */
    public IssueProgress: string | null = null;
    public Loading = false;
    /** Every installment the operation returned that is due in the window. */
    public AllRows: BillingWorklistRow[] = [];
    /** `AllRows` under the company filter and the search. The tiles count these. */
    public Scoped: BillingWorklistRow[] = [];
    /** `Scoped` under the quick filter, in the sorted order. What the table lists and the export writes. */
    public Rows: BillingWorklistRow[] = [];
    /** The installment open in the side panel. */
    public Selected: BillingWorklistRow | null = null;
    /** The ticked installments' schedule IDs; always rows that are listed. */
    public CheckedIDs: string[] = [];
    public Companies: WorklistCompanyOption[] = [];
    /** The chosen companies that are offered: what the filter shows. */
    public CompanyPicks: string[] = [];
    /** The company choice as chosen, shared across Receivables. `CompanyPicks` is this, less any company never seen with rows. */
    private companyChoice: string[] = [];
    public Search = '';
    public Preset: BillingPreset = 'all';
    public Window: DayWindow = DEFAULT_WINDOW;
    /** The column the list is sorted on; a null key is the list's own order, earliest due first. */
    public Sort: WorklistSort = { Key: null, Descending: false };
    /** Company ID (lower-cased) -> the name of its active invoice rail. */
    private Rails = new Map<string, string>();
    public AsOf = '';
    /** The days the loaded rows cover. Kept from the load so the tiles describe what is on screen, not a choice still loading. */
    private loadedRange: DayRange = { From: null, To: null };
    private loadedWindowKey = DEFAULT_WINDOW.Key;
    /** Counts loads, so a slow answer to an earlier window cannot overwrite a later one. */
    private loadSeq = 0;
    /** The tab's address as the section last gave it. */
    private address: Record<string, string> = {};
    private readonly companyKey = new AddressKey(COMPANY_ADDRESS_KEY);
    private readonly dueKey = new AddressKey(DUE_ADDRESS_KEY);
    /** The first load has finished, so an address that arrives now is a change to follow. */
    private ready = false;

    /** Past-due and next-7-days figures for the tiles. Fields, rebuilt with the rows. */
    public PastDue = { Count: 0, Amount: 0 };
    public Week = { Count: 0, Amount: 0 };
    /** The totals row. A field: a getter would hand the table a new object on every pass. */
    public Totals: Record<string, string> | null = null;

    public readonly Columns: MJOColumn<BillingWorklistRow>[] = [
        { Key: 'DueDate', Label: 'Due', Kind: 'date', Width: '120px', Sortable: true, Format: (r) => this.date(r.DueDate), Secondary: (r) => this.dueNote(r) },
        { Key: 'OrderNumber', Label: 'Order', Kind: 'link', LinkHint: 'Open the order', Width: '130px', Sortable: true, Secondary: (r) => `${r.InstallmentNumber} of ${r.InstallmentCount}` },
        { Key: 'CustomerName', Label: 'Customer', Sortable: true },
        { Key: 'CompanyName', Label: 'Billed by', HideBelow: 1000, Sortable: true },
        { Key: 'Description', Label: 'For', HideBelow: 760, Sortable: true },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Sortable: true, Format: (r) => FormatMoney(r.Amount) },
        { Key: 'OrderStatus', Label: 'Order status', Kind: 'chip', Width: '130px', HideBelow: 560, Sortable: true, ChipClass: (r) => (r.OrderStatus === 'Confirmed' ? 'mjo-chip--success' : 'mjo-chip--outline') },
        {
            // Issuing an instalment freezes its number; for a company on a rail it ALSO queues an
            // external invoice, which is the part nobody could see from this screen.
            Key: 'CompanyID',
            Label: 'Sent through',
            Width: '150px',
            HideBelow: 1000,
            Sortable: true,
            SortValue: (r) => this.RailFor(r.CompanyID),
            Format: (r) => this.RailFor(r.CompanyID) ?? '—',
            Secondary: (r) => (this.RailFor(r.CompanyID) ? 'automatically, after issuing' : null),
        },
    ];

    /** Only an installment that can be issued can be ticked. A field, so the table gets the same function every pass. */
    public readonly CanTick = (row: BillingWorklistRow): boolean => IssueInvoiceBlockedReason(row) === null;
    public readonly TickLabel = (row: BillingWorklistRow): string => `Select ${row.OrderNumber} installment ${row.InstallmentNumber} for ${row.CustomerName}`;

    /** The export's columns: one value a cell, so nothing a spreadsheet filters on is folded into another. */
    private readonly exportFields: WorklistExportField<BillingWorklistRow>[] = [
        { Name: 'DueDate', Label: 'Due date', Type: 'date', Value: (r) => r.DueDate },
        { Name: 'DaysUntilDue', Label: 'Days until due', Type: 'number', Value: (r) => r.DaysUntilDue },
        { Name: 'OrderNumber', Label: 'Order', Value: (r) => r.OrderNumber },
        { Name: 'InstallmentNumber', Label: 'Installment', Type: 'number', Value: (r) => r.InstallmentNumber },
        { Name: 'InstallmentCount', Label: 'Installments on order', Type: 'number', Value: (r) => r.InstallmentCount },
        { Name: 'CustomerName', Label: 'Customer', Value: (r) => r.CustomerName },
        { Name: 'CompanyName', Label: 'Billed by', Value: (r) => r.CompanyName },
        { Name: 'Description', Label: 'For', Value: (r) => r.Description },
        { Name: 'Amount', Label: 'Amount', Type: 'money', Value: (r) => r.Amount },
        { Name: 'OrderStatus', Label: 'Order status', Value: (r) => r.OrderStatus },
        { Name: 'SentThrough', Label: 'Sent through', Value: (r) => this.RailFor(r.CompanyID) },
    ];

    /** The rows listed, as an export file. A field, so the bar is handed the same function every pass. */
    public readonly BuildExport = (format: 'excel' | 'csv'): MJOWorklistExport => ({
        FileName: ExportFileName('billing-worklist', this.CompanyPicks, this.Companies, this.AsOf || null),
        ...BuildWorklistExport(this.exportFields, this.Rows, format),
    });

    public async ngOnInit(): Promise<void> {
        const saved = ReadWorklistState(globalThis.localStorage, BILLING_STATE_KEY);
        if (saved) {
            this.Window = RestoreWindow(saved.Window, BILLING_WINDOWS, DEFAULT_WINDOW);
            this.Sort = RestoreSort(saved.Sort, this.Columns);
        }
        this.adoptAddress();
        await this.load();
        // An address that arrived while that first load was out was kept, not followed. Follow it now.
        if (this.adoptAddress()) await this.load();
        else this.applyView();
        this.ready = true;
        this.cdr.detectChanges();
    }

    /**
     * The tab's address, from the section: when the page is shown, and on Back, Forward or a link.
     * `company` is the company choice every Receivables page shares; `billingDue` is this page's window.
     */
    public ApplyAddress(params: Record<string, string>): void {
        this.address = params;
        if (!this.ready) return;
        const windowChanged = this.adoptAddress();
        if (windowChanged) void this.reload();
        else this.applyView();
        // Back, Forward and links arrive outside any event of this page's own, so nothing else repaints it.
        this.cdr.detectChanges();
    }

    /** Shown again after another page: an installment issued or an order confirmed there changes this list. */
    public async OnShown(): Promise<void> {
        if (!this.ready) return;
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get TotalDisplay(): string {
        return FormatMoney(this.Scoped.reduce((s, r) => s + r.Amount, 0), { Round: true });
    }

    public get TotalDetail(): string {
        const orders = new Set(this.Scoped.map((r) => r.OrderHeaderID)).size;
        return `${this.Scoped.length} installment${this.Scoped.length === 1 ? '' : 's'} across ${orders} order${orders === 1 ? '' : 's'}`;
    }

    /** The first tile's heading, which names the window the total is for. */
    public get TotalLabel(): string {
        const option = BILLING_WINDOWS.find((o) => o.Key === this.loadedWindowKey);
        if (this.loadedWindowKey === CUSTOM_WINDOW) return `To invoice, ${this.rangeText}`;
        if (!option || option.ToOffset == null) return 'To invoice, all dates';
        return `To invoice in the ${option.Label.toLowerCase()}`;
    }

    private get rangeText(): string {
        const { From, To } = this.loadedRange;
        if (!From && !To) return 'all dates';
        if (!From) return `through ${this.date(To)}`;
        if (!To) return `from ${this.date(From)}`;
        return `${this.date(From)} to ${this.date(To)}`;
    }

    public get PresetLabel(): string {
        return PRESET_LABELS[this.Preset];
    }

    public get IsCustomWindow(): boolean {
        return this.Window.Key === CUSTOM_WINDOW;
    }

    /** "12 of 40 installments shown", beside the filters. */
    public get Summary(): string {
        return this.LoadError || (this.Loading && !this.AllRows.length) ? '' : ShownSummary(this.Rows.length, this.AllRows.length, 'installment');
    }

    /** What is ticked, in words, beside the Issue invoices button. */
    public get CheckedSummary(): string {
        const ticked = this.checkedRows();
        return `${ticked.length} ticked · ${FormatMoney(ticked.reduce((s, r) => s + r.Amount, 0))}`;
    }

    private get filtered(): boolean {
        return this.Rows.length < this.AllRows.length;
    }

    public get EmptyTitle(): string {
        return this.AllRows.length && this.filtered ? 'Nothing matches' : 'Nothing to invoice';
    }

    public get EmptyHint(): string {
        return this.AllRows.length && this.filtered ? 'No installment matches these filters. Clear one to see more.' : 'No scheduled installment is due in these dates.';
    }

    /** The rail a company invoices through, or null. Read from seeded metadata once per load. */
    public RailFor(companyID: string): string | null {
        return this.Rails.get((companyID ?? '').toLowerCase()) ?? null;
    }

    /* ── Filters ────────────────────────────────────────────────────────── */

    /** A tile turns its quick filter on; the same tile again, the first tile, or the chip's ✕ turns it off. */
    public OnPreset(preset: BillingPreset): void {
        this.Preset = this.Preset === preset ? 'all' : preset;
        this.applyView();
    }

    public OnCompanies(picks: string[]): void {
        this.companyChoice = picks;
        WriteSharedCompanies(globalThis.localStorage, picks);
        this.AddressChanged.emit(this.companyKey.Write(CompaniesToAddress(picks)));
        this.applyView();
    }

    public OnSearch(text: string): void {
        this.Search = text;
        this.applyView();
    }

    public OnSort(key: string): void {
        this.Sort = NextSort(this.Sort, key, this.Columns);
        WriteWorklistState(globalThis.localStorage, BILLING_STATE_KEY, { Window: this.Window, Sort: this.Sort });
        this.applyView();
    }

    /** A new window is a new question for the server, so it reloads. Custom waits for a day to be entered. */
    public async OnWindow(key: string): Promise<void> {
        if (!BILLING_WINDOWS.some((o) => o.Key === key) || key === this.Window.Key) return;
        this.Window = { Key: key, From: null, To: null };
        if (key === CUSTOM_WINDOW) return;
        this.saveView();
        await this.load();
        this.cdr.detectChanges();
    }

    public async OnCustomDay(side: 'From' | 'To', day: string): Promise<void> {
        this.Window = { ...this.Window, Key: CUSTOM_WINDOW, [side]: day || null };
        this.saveView();
        await this.load();
        this.cdr.detectChanges();
    }

    public async Refresh(): Promise<void> {
        this.Notice = null;
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Rows ───────────────────────────────────────────────────────────── */

    /** Clicking a row opens it beside the list; clicking the open row closes it. */
    public OnRow(row: BillingWorklistRow): void {
        this.Selected = this.Selected?.OrderHeaderPaymentScheduleID === row.OrderHeaderPaymentScheduleID ? null : row;
    }

    public OpenOrder(row: BillingWorklistRow): void {
        this.OrderOpened.emit({ ID: row.OrderHeaderID });
    }

    /** Why the open instalment cannot be issued, or null when it can. */
    public get IssueBlockedReason(): string | null {
        return IssueInvoiceBlockedReason(this.Selected);
    }

    /* ── Issuing ────────────────────────────────────────────────────────── */

    public async IssueSelected(): Promise<void> {
        const row = this.Selected;
        if (!row || this.Issuing || this.IssueBlockedReason) return;
        const proceed = await this.confirm.Confirm({
            title: `Issue installment ${row.InstallmentNumber} of ${row.InstallmentCount}?`,
            message: `${row.OrderNumber} · ${row.CustomerName} · ${FormatMoney(row.Amount)} due ${this.date(row.DueDate)}.`,
            detail: 'The invoice number is frozen on the installment and cannot be changed afterwards. Corrections go through a credit memo.',
            type: 'warning',
            confirmText: 'Issue invoice',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        this.Issuing = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const outcome = await this.issue(row);
            this.Notice = outcome.Ok ? { Tone: 'success', Text: outcome.Text } : { Tone: 'error', Text: outcome.Text };
            if (!outcome.Ok) return;
            this.Selected = null;
            await this.load();
        } finally {
            this.Issuing = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Issue every ticked installment, after one confirmation for the batch. Each is issued on its
     * own, in the order listed, so one the server refuses does not stop the rest; the notice says how
     * many were issued and names each that was not, with the server's reason.
     */
    public async IssueChecked(): Promise<void> {
        const rows = this.checkedRows();
        if (!rows.length || this.Issuing) return;
        const total = rows.reduce((s, r) => s + r.Amount, 0);
        const orders = new Set(rows.map((r) => r.OrderHeaderID)).size;
        const onRail = rows.filter((r) => this.RailFor(r.CompanyID)).length;
        const proceed = await this.confirm.Confirm({
            title: `Issue ${rows.length} invoice${rows.length === 1 ? '' : 's'}?`,
            message: `${FormatMoney(total)} across ${orders} order${orders === 1 ? '' : 's'}.`,
            detail:
                'Each invoice number is frozen on its installment and cannot be changed afterwards. Corrections go through a credit memo.' +
                (onRail ? ` ${onRail} of them ${onRail === 1 ? 'is' : 'are'} then sent to the customer automatically.` : ''),
            type: 'warning',
            confirmText: rows.length === 1 ? 'Issue invoice' : `Issue ${rows.length} invoices`,
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        this.Issuing = true;
        this.Notice = null;
        const failures: string[] = [];
        let issued = 0;
        try {
            for (const [index, row] of rows.entries()) {
                this.IssueProgress = `Issuing ${index + 1} of ${rows.length}…`;
                this.cdr.detectChanges();
                const outcome = await this.issue(row);
                if (outcome.Ok) issued += 1;
                else failures.push(`${row.OrderNumber} installment ${row.InstallmentNumber}: ${outcome.Text}`);
            }
            this.CheckedIDs = [];
            this.Notice = failures.length
                ? { Tone: issued ? 'warning' : 'error', Text: `${issued} of ${rows.length} issued. Not issued: ${failures.join(' ')}` }
                : { Tone: 'success', Text: `${issued} invoice${issued === 1 ? '' : 's'} issued.` };
            await this.load();
        } finally {
            this.Issuing = false;
            this.IssueProgress = null;
            this.cdr.detectChanges();
        }
    }

    /** Issue one installment. Never throws: a failure comes back as text to show. */
    private async issue(row: BillingWorklistRow): Promise<{ Ok: boolean; Text: string }> {
        try {
            const result = await new OrdersIssueInstalmentInvoiceOperation().Execute({ OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                return { Ok: false, Text: output?.Message?.trim() || result.ErrorMessage?.trim() || 'The installment could not be issued.' };
            }
            return { Ok: true, Text: output.Message ?? `Issued as ${output.DocumentNumber}.` };
        } catch (err) {
            return { Ok: false, Text: err instanceof Error ? err.message : String(err) };
        }
    }

    private checkedRows(): BillingWorklistRow[] {
        const ticked = new Set(this.CheckedIDs);
        return this.Rows.filter((r) => ticked.has(r.OrderHeaderPaymentScheduleID) && this.CanTick(r));
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async reload(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    private async load(): Promise<void> {
        const seq = ++this.loadSeq;
        const windowKey = this.Window.Key;
        // The operation lists everything due on or before the window's last day, as of the business
        // day. A custom window's first day is applied here, to the rows it returns.
        const today = Today();
        const range = ResolveWindow(this.Window, BILLING_WINDOWS, today);
        const windowDays = range.To ? Math.max(0, DaysBetween(today, range.To)) : ALL_DAYS;
        this.Loading = true;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersGetBillingWorklistOperation().Execute({
                WindowDays: windowDays,
                // The operation fills its cap from the earliest due date. A long window needs room, and so
                // does a range with a first day: without it the cap can fill with rows before that day.
                ...(windowDays > 90 || range.From ? { MaxCount: WIDE_WINDOW_MAX_ROWS } : {}),
            });
            if (seq !== this.loadSeq) return;
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                // SAY SO. An empty worklist and a failed one look identical, and "nothing to invoice" is
                // the most reassuring sentence on the screen.
                this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The billing worklist could not be loaded.';
                this.AllRows = [];
                this.applyView();
                this.cdr.detectChanges();
                return;
            }
            this.LoadError = null;
            // The operation lists everything due on or before the last day asked for, and never fewer
            // than today's: a custom range that ends in the past, or starts after the earliest row, is
            // cut to its two days here, so the list, the tiles, the count and the export all cover the
            // dates the first tile names and nothing outside them can be ticked.
            this.AllRows = output.Rows.filter((r) => InDayRange(r.DueDate, range));
            this.Truncated = output.Truncated;
            this.AsOf = output.AsOfDate;
            this.loadedRange = range;
            this.loadedWindowKey = windowKey;
            await this.loadRails();
            if (seq !== this.loadSeq) return;
            this.applyView();
            this.cdr.detectChanges();
        } finally {
            if (seq === this.loadSeq) this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Active invoice rails by company. Two small reads of seeded metadata rather than a per-row call,
     * and a failure leaves the column empty rather than failing the page — it is context, not the work.
     */
    private async loadRails(): Promise<void> {
        this.Rails = new Map();
        try {
            const rv = new RunView();
            const codes = RAIL_TYPE_CODES.map((c) => `'${c}'`).join(',');
            const types = await rv.RunView<{ ID: string }>({ EntityName: PAYMENT_PROVIDER_TYPE_ENTITY, ExtraFilter: `Code IN (${codes})`, Fields: ['ID'], ResultType: 'simple' });
            const typeIDs = (types.Results ?? []).map((t) => `'${RequireUUID(t.ID, 'PaymentProviderTypeID')}'`);
            if (!typeIDs.length) return;
            const providers = await rv.RunView<{ CompanyID: string; Name: string }>({
                EntityName: PAYMENT_PROVIDER_ENTITY,
                ExtraFilter: `IsActive = 1 AND PaymentProviderTypeID IN (${typeIDs.join(',')})`,
                Fields: ['CompanyID', 'Name'],
                ResultType: 'simple',
            });
            for (const p of providers.Results ?? []) this.Rails.set((p.CompanyID ?? '').toLowerCase(), p.Name);
        } catch {
            // Context only. An order still bills the same way whether or not this column renders.
        }
    }

    /**
     * Take the company choice and the window from the tab's address (`AdoptCompanyChoice`,
     * `AdoptWindow`): what the address states wins, a key that was there and is gone means "none"
     * or the default, and what was saved applies only where the address has never said anything.
     *
     * @returns Whether the window changed, which needs a reload.
     */
    private adoptAddress(): boolean {
        const picks = AdoptCompanyChoice(this.companyKey, this.address, globalThis.localStorage);
        if (!SameChoice(picks, this.companyChoice)) this.companyChoice = picks;
        const window = AdoptWindow(this.dueKey, this.address, BILLING_WINDOWS, this.Window, DEFAULT_WINDOW);
        if (SameWindow(window, this.Window)) return false;
        this.Window = window;
        // Saved as well, so the next visit opens on what the address last said, as it does for the company.
        WriteWorklistState(globalThis.localStorage, BILLING_STATE_KEY, { Window: this.Window, Sort: this.Sort });
        return true;
    }

    /**
     * Rebuild what is listed from what was loaded: company and search narrow the rows the tiles
     * count; the quick filter and the sort then decide what the table shows. An open
     * or ticked installment the filters hide is let go, so nothing is issued that is not on screen.
     */
    private applyView(): void {
        const companies = ReconcileCompanies(this.AllRows, { ID: (r) => r.CompanyID, Name: (r) => r.CompanyName }, this.companyChoice);
        this.Companies = companies.Options;
        this.CompanyPicks = companies.Picks;
        this.Scoped = FilterByCompanies(this.AllRows, this.CompanyPicks, (r) => r.CompanyID).filter((r) => MatchesText([r.CustomerName, r.OrderNumber, r.Description], this.Search));
        const pastDue = this.Scoped.filter((r) => r.DaysUntilDue < 0);
        const week = this.Scoped.filter((r) => r.DaysUntilDue >= 0 && r.DaysUntilDue <= 7);
        const sum = (rows: BillingWorklistRow[]): number => rows.reduce((s, r) => s + r.Amount, 0);
        this.PastDue = { Count: pastDue.length, Amount: sum(pastDue) };
        this.Week = { Count: week.length, Amount: sum(week) };
        const shown = this.Preset === 'pastdue' ? pastDue : this.Preset === 'week' ? week : this.Scoped;
        this.Rows = SortRows(shown, this.Columns, this.Sort);
        this.Totals = { DueDate: 'Total', CustomerName: `${this.Rows.length} installment${this.Rows.length === 1 ? '' : 's'}`, Amount: FormatMoney(sum(this.Rows)) };
        const listed = new Set(this.Rows.map((r) => r.OrderHeaderPaymentScheduleID));
        this.CheckedIDs = this.CheckedIDs.filter((id) => listed.has(id));
        if (this.Selected) {
            const key = this.Selected.OrderHeaderPaymentScheduleID;
            this.Selected = this.Rows.find((r) => r.OrderHeaderPaymentScheduleID === key) ?? null;
        }
    }

    private saveView(): void {
        WriteWorklistState(globalThis.localStorage, BILLING_STATE_KEY, { Window: this.Window, Sort: this.Sort });
        this.AddressChanged.emit(this.dueKey.Write(SameWindow(this.Window, DEFAULT_WINDOW) ? null : WindowToAddress(this.Window)));
    }

    /* ── Display helpers ────────────────────────────────────────────────── */

    protected dueNote(row: BillingWorklistRow): string {
        if (row.DaysUntilDue < 0) return `${-row.DaysUntilDue} day${row.DaysUntilDue === -1 ? '' : 's'} past due`;
        if (row.DaysUntilDue === 0) return 'due today';
        return `in ${row.DaysUntilDue} day${row.DaysUntilDue === 1 ? '' : 's'}`;
    }

    /** Every date on the page reads MM/DD/YYYY, as on Customer A/R. */
    protected date(value: string | null | undefined): string {
        return value ? FormatDate(value, { Numeric: true }) : '—';
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }
}
