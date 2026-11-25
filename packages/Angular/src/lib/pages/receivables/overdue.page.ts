import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { PresetViewRef } from '../../data/preset-view';
import {
    OrdersGetOverdueWorklistOperation,
    OverdueFilter,
    RequireUUID,
    Today,
    type OverdueWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { GetOpenInstalmentDetails } from '../../data/orders-queries';
import { GroupInstalmentsByOrder, MJOAgingBarComponent, type MJOAgingBuckets } from '../../panels/aging-bar.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { MJO_ENTITIES } from '../../data/entity-names';
import { MJO_ORDER_HEADER_GRID_STATE } from '../../data/orders-grid-state';
import { MJOWorklistBarComponent, type MJOWorklistExport } from '../../panels/worklist-bar.component';
import { CreditHeld, RestateOverdue, SumAged, type OverdueInstalment, type OverdueRow } from './overdue-page.model';
import {
    BuildWorklistExport,
    AddressKey,
    AdoptCompanyChoice,
    AdoptWindow,
    COMPANY_ADDRESS_KEY,
    CUSTOM_WINDOW,
    CompaniesToAddress,
    ExportFileName,
    FilterByCompanies,
    InDayRange,
    ReadWorklistState,
    ReconcileCompanies,
    ResolveWindow,
    RestoreWindow,
    SameChoice,
    SameWindow,
    ShownSummary,
    WindowToAddress,
    WriteSharedCompanies,
    WriteWorklistState,
    type DayWindow,
    type DayWindowOption,
    type WorklistCompanyOption,
    type WorklistExportField,
} from './worklist-view.model';

/**
 * How late the orders listed are. The three bands are the aging bar's: choosing one lists the orders
 * that have an amount that late and totals that amount, so the list, the tile and the bar's band are
 * the same money. Custom due dates go by each order's oldest invoiced, past-due installment.
 */
export const OVERDUE_WINDOWS: ReadonlyArray<DayWindowOption> = [
    { Key: 'all', Label: 'Any age', FromOffset: null, ToOffset: null },
    { Key: '1-30', Label: '1 to 30 days', FromOffset: -30, ToOffset: -1 },
    { Key: '31-60', Label: '31 to 60 days', FromOffset: -60, ToOffset: -31 },
    { Key: '61+', Label: '61 days or more', FromOffset: null, ToOffset: -61 },
    { Key: CUSTOM_WINDOW, Label: 'Custom due dates…', FromOffset: null, ToOffset: null },
];

const DEFAULT_WINDOW: DayWindow = { Key: 'all', From: null, To: null };
const OVERDUE_STATE_KEY = 'mjOrders.overdueWorklist.view';
/** The tab-address key for this page's age filter. */
const AGE_ADDRESS_KEY = 'overdueAge';

/** The aging bar's bands and the age choices are the same three ranges. */
const BUCKET_WINDOW: Partial<Record<keyof MJOAgingBuckets, string>> = { Days1To30: '1-30', Days31To60: '31-60', Days61Plus: '61+' };

/**
 * The orders the grid may list, as SQL: exactly the ones the page lists, by ID. The grid reads the
 * orders itself, and the page's rules (invoiced amounts only, company, age, credit) are worked out
 * here from the installments, so the grid is handed the result and not a second statement of them.
 * IDs are checked as UUIDs before they are written.
 */
export function OverdueGridScope(orderIDs: ReadonlyArray<string>): string {
    if (!orderIDs.length) return '1 = 0';
    return `ID IN (${orderIDs.map((id) => `'${RequireUUID(id, 'OrderHeaderID')}'`).join(',')})`;
}

/** What to do next with a row. */
interface MJONextAction {
    Icon: string;
    Text: string;
    Tone: 'success' | 'warning' | 'info' | 'error';
}

/**
 * `mjo-overdue-page` — chase what is late.
 *
 * OVERDUE MEANS INVOICED AND PAST ITS DATE, as on Customer A/R (bc-aidp-next-golive#481). The
 * operation lists an order once its next unpaid installment's date has passed, invoiced or not, and
 * reports the whole balance. This page reads the installments too and restates each order
 * (`overdue-page.model.ts`): only invoiced amounts past their own due date are counted, each aged
 * from its own date. An order whose only late installments were never invoiced is not chased; it is
 * counted on its own tile, which leads to the Billing worklist where the invoice is issued.
 *
 * THE TILES AND THE AGING BAR ARE THE FILTERS. A band of the bar shows only orders that old; the
 * credit tile shows only customers holding credit. The company filter is the one every Receivables
 * page shares. Whatever is chosen narrows the tiles, the grid and the export together. The bar keeps
 * showing every age under an age band, with the other bands dimmed: it is what the band is chosen from.
 *
 * The suggested next action is computed per row from what is actually known: whether the customer is
 * already holding credit, whether a grace period is running, how late it is. The FIRST rule is the
 * one that matters most — if they hold a credit, spend it before chasing cash, because that collects
 * without a conversation.
 *
 * DUNNING NOTIFIES A PERSON; NOTHING AUTO-CANCELS. A failed card is usually an
 * expired card rather than a lost customer, and cancelling on the system's
 * schedule loses relationships a phone call would have kept.
 *
 * ## Example
 *
 * ```html
 * <mjo-overdue-page (OrderOpened)="open($event)" (NavigateRequested)="go($event)" (AddressChanged)="write($event)" />
 * ```
 */
@Component({
    selector: 'mjo-overdue-page',
    standalone: true,
    imports: [CommonModule, EntityViewerModule, MJOAgingBarComponent, MJOStatTileComponent, MJAlertComponent, MJOWorklistBarComponent],
    template: `
        <mjo-worklist-bar
            [Companies]="Companies"
            [CompanyPicks]="CompanyPicks"
            [Searchable]="false"
            [ActiveFilter]="CreditOnly ? 'Credit available' : null"
            [Summary]="Summary"
            [Loading]="Loading"
            [BuildExport]="BuildExport"
            [CanExport]="Rows.length > 0"
            (CompanyPicksChange)="OnCompanies($event)"
            (ActiveFilterCleared)="OnCreditOnly(false)"
            (RefreshRequested)="Refresh()">
            <label class="mjo-ov__window">
                <span class="small muted">Overdue by</span>
                <select class="mjo-ov__select" [value]="Window.Key" (change)="OnWindow($any($event.target).value)" aria-label="How late the orders listed are">
                    @for (option of Windows; track option.Key) {
                        <option [value]="option.Key" [selected]="option.Key === Window.Key">{{ option.Label }}</option>
                    }
                </select>
            </label>
            @if (IsCustomWindow) {
                <label class="mjo-ov__window">
                    <span class="small muted">Due from</span>
                    <input class="mjo-ov__select" type="date" [value]="Window.From ?? ''" (change)="OnCustomDay('From', $any($event.target).value)" aria-label="Earliest due date">
                </label>
                <label class="mjo-ov__window">
                    <span class="small muted">to</span>
                    <input class="mjo-ov__select" type="date" [value]="Window.To ?? ''" (change)="OnCustomDay('To', $any($event.target).value)" aria-label="Latest due date">
                </label>
            }
        </mjo-worklist-bar>

        <div class="mj-stat-grid mjo-ov__tiles">
            <mjo-stat-tile
                class="mjo-ov__tile"
                Hint="Show every overdue order"
                Label="Past due"
                Icon="fa-solid fa-hourglass-half"
                Tone="alert"
                [Value]="TotalDisplay"
                [Detail]="TotalDetail"
                (Clicked)="OnShowAll()" />

            <mjo-stat-tile
                Label="Oldest"
                Icon="fa-solid fa-clock"
                [Value]="OldestDisplay"
                [Detail]="OldestDetail" />

            <mjo-stat-tile
                class="mjo-ov__tile"
                [class.is-on]="CreditOnly"
                [Pressed]="CreditOnly"
                Hint="Show customers who hold credit"
                Label="Credit available to apply"
                Icon="fa-solid fa-piggy-bank"
                [Value]="CreditDisplay"
                Detail="Apply before following up"
                (Clicked)="OnCreditOnly(!CreditOnly)" />

            <mjo-stat-tile
                class="mjo-ov__tile"
                Hint="Open the Billing worklist"
                Label="Late, not yet invoiced"
                Icon="fa-solid fa-file-invoice-dollar"
                [Value]="String(NeverInvoiced.length)"
                [Detail]="NeverInvoiced.length ? 'Not counted here · issue on the Billing worklist' : 'Every late installment has an invoice'"
                (Clicked)="NavigateRequested.emit('billing')" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-ov__error">
                    <strong>The worklist did not load.</strong>
                    {{ LoadError }}
            </mj-alert>
        }
        @if (InstalmentsError) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-ov__error">
                <strong>Installments could not be read.</strong>
                Each order is shown with its whole balance, from its next due date. {{ InstalmentsError }}
            </mj-alert>
        }

        <p class="mjo-note mjo-ov__error">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <strong>Reminders notify the customer.</strong>
            Nothing on this screen cancels an order or subscription.
        </p>

        <div class="mj-card mjo-ov__aging">
            <div class="mj-card-head">
                <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
                <h3>By age</h3>
                <span class="right small muted">Select an age to list the orders with an amount that late</span>
            </div>
            <div class="mj-card-pad">
                <mjo-aging-bar [Buckets]="Buckets" [Active]="ActiveBucket" EmptyText="Nothing overdue." (BucketClicked)="OnBucket($event)" />
            </div>
        </div>

        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-ov__truncated">
                    <strong>List truncated.</strong>
                    Not all overdue orders are shown, and the figures above cover only those that are.
            </mj-alert>
        }

        <div class="mjo-ov__viewer-host">
            @if (OrderEntityInfo && Ready) {
                <mj-entity-viewer
                    [Entity]="OrderEntityInfo"
                    [ViewEntity]="OverdueView"
                    [GridState]="OrderGridState"
                    (RecordOpened)="OnRecordOpened($event)">
                </mj-entity-viewer>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading overdue orders...</div>
            }
        </div>
        <div class="small muted mjo-ov__foot">Balance is each order's whole open balance. Past due, above and in the export, counts only invoiced amounts past their due date.</div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-ov__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-ov__tile {
                display: block;
                border-radius: var(--mj-radius-md);
                transition: box-shadow 140ms ease;
            }
            .mjo-ov__tile.is-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 55%, transparent); }
            .mjo-ov__error { display: block; margin-bottom: var(--mj-space-4); }
            .mjo-ov__aging { margin-bottom: var(--mj-space-4); }
            .mjo-ov__truncated { display: block; margin-bottom: var(--mj-space-4); }
            .mjo-ov__foot { margin-top: var(--mj-space-3); }
            .mjo-ov__window {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2);
            }
            .mjo-ov__select {
                font: inherit;
                font-size: 13px;
                padding: 4px 8px;
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface);
                color: inherit;
            }
            .mjo-ov__viewer-host {
                height: 600px;
                min-height: 500px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
                margin-top: var(--mj-space-4);
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
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
            @media (prefers-reduced-motion: reduce) {
                .mjo-ov__tile { transition: none; }
            }
        `,
    ],
})
export class MJOOverduePageComponent implements OnInit {

    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    /** Non-null when the worklist could not be read. Rendered instead of the aging bar. */
    public LoadError: string | null = null;
    /** Non-null when the installments could not be read, so the orders are shown as the operation returned them. */
    public InstalmentsError: string | null = null;
    @Output() OrderOpened = new EventEmitter<OverdueWorklistRow>();
    /** Go to another Receivables page, by its id in the rail. */
    @Output() NavigateRequested = new EventEmitter<string>();
    /** The company choice or the age filter changed: the section writes it to the tab's address. A null value removes the key. */
    @Output() AddressChanged = new EventEmitter<Record<string, string | null>>();

    public OrderEntityInfo: EntityInfo | null = null;
    public readonly OrderGridState = MJO_ORDER_HEADER_GRID_STATE;
    /** Every order the operation returned. */
    public AllRows: OverdueWorklistRow[] = [];
    /** The orders with an invoiced amount past due, restated by installment. */
    public Listed: OverdueRow[] = [];
    /** `Listed` under the company filter, the age filter and the credit filter. The tiles, the grid and the export read these. */
    public Rows: OverdueRow[] = [];
    /** Orders, under the company filter, whose only late installments were never invoiced. */
    public NeverInvoiced: OverdueWorklistRow[] = [];
    private neverInvoicedAll: OverdueWorklistRow[] = [];
    public Buckets: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
    public Truncated = false;
    public Loading = false;
    public readonly Windows = OVERDUE_WINDOWS;
    public Companies: WorklistCompanyOption[] = [];
    /** The chosen companies that are offered: what the filter shows. */
    public CompanyPicks: string[] = [];
    /** The company choice as chosen, shared across Receivables. */
    private companyChoice: string[] = [];
    public Window: DayWindow = DEFAULT_WINDOW;
    /** Show only customers who hold credit. */
    public CreditOnly = false;
    /** The grid's extra filter: '' while the page lists everything the operation returned, else the listed orders by ID. */
    private gridScope = '';
    /** Bumped by Refresh, so the grid is handed a new view and reads again along with the tiles. */
    private refreshCount = 0;
    private address: Record<string, string> = {};
    private readonly companyKey = new AddressKey(COMPANY_ADDRESS_KEY);
    private readonly ageKey = new AddressKey(AGE_ADDRESS_KEY);
    /** Counts loads, so a slow answer to an earlier read cannot overwrite a later one. */
    private loadSeq = 0;
    /**
     * The first load has finished. The grid waits for it: before then the page does not know which
     * orders it lists, and a grid shown early would list the operation's orders and then drop some.
     */
    public Ready = false;

    /** Exposed so the template can stringify without a pipe. */
    public readonly String = String;

    private readonly overdueView = new PresetViewRef();

    public get OverdueView(): MJUserViewEntityExtended | null {
        if (!this.OrderEntityInfo) return null;
        const today = Today();
        const scope = this.gridScope ?? '';
        // Keyed on the DAY as well as the entity: the filter moves at midnight and the grid must follow.
        // And on what the page lists and the refresh count, so the grid reloads when either changes.
        return this.overdueView.For(`${this.OrderEntityInfo.ID}|${today}|${scope}|${this.refreshCount ?? 0}`, () => ({
            EntityID: this.OrderEntityInfo!.ID,
            Entity: this.OrderEntityInfo!.Name,
            // ONE definition of overdue (overdue.ts), the same one the worklist operation filters by.
            WhereClause: scope ? `${OverdueFilter(today)} AND ${scope}` : OverdueFilter(today),
            ID: 'preset-overdue-worklist',
            Name: 'Overdue Collections'
        } as unknown as MJUserViewEntityExtended));
    }

    public async ngOnInit(): Promise<void> {
        const saved = ReadWorklistState(globalThis.localStorage, OVERDUE_STATE_KEY);
        if (saved) this.Window = RestoreWindow(saved.Window, OVERDUE_WINDOWS, DEFAULT_WINDOW);
        this.adoptAddress();
        const md = new Metadata();
        this.OrderEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.OrderHeader) || null;
        await this.load();
        // An address that arrived while that first load was out was kept, not followed. Follow it now.
        this.adoptAddress();
        this.applyView();
        this.Ready = true;
        this.cdr.detectChanges();
    }

    /** The tab's address, from the section: `company` is shared across Receivables, `overdueAge` is this page's age filter. */
    public ApplyAddress(params: Record<string, string>): void {
        this.address = params;
        if (!this.Ready) return;
        this.adoptAddress();
        this.applyView();
        // Back, Forward and links arrive outside any event of this page's own, so nothing else repaints it.
        this.cdr.detectChanges();
    }

    /** Shown again after another page: a payment or an invoice issued there changes what is overdue. */
    public async OnShown(): Promise<void> {
        if (!this.Ready) return;
        await this.Refresh();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const surrogate = { OrderHeaderID: id } as OverdueWorklistRow;
            this.OrderOpened.emit(surrogate);
        }
    }

    /* ── Filters ────────────────────────────────────────────────────────── */

    public OnCompanies(picks: string[]): void {
        this.companyChoice = picks;
        WriteSharedCompanies(globalThis.localStorage, picks);
        this.AddressChanged.emit(this.companyKey.Write(CompaniesToAddress(picks)));
        this.applyView();
    }

    public OnWindow(key: string): void {
        if (!OVERDUE_WINDOWS.some((o) => o.Key === key)) return;
        this.Window = { Key: key, From: null, To: null };
        // Custom is not a choice until it has a day: nothing is saved or written to the address before then.
        if (key !== CUSTOM_WINDOW) this.saveView();
        this.applyView();
    }

    public OnCustomDay(side: 'From' | 'To', day: string): void {
        this.Window = { ...this.Window, Key: CUSTOM_WINDOW, [side]: day || null };
        this.saveView();
        this.applyView();
    }

    /** A band of the aging bar lists only orders that old; the same band again lists every age. */
    public OnBucket(bucket: keyof MJOAgingBuckets): void {
        const key = BUCKET_WINDOW[bucket];
        if (!key) return;
        this.OnWindow(this.Window.Key === key ? 'all' : key);
    }

    public OnCreditOnly(on: boolean): void {
        this.CreditOnly = on;
        this.applyView();
    }

    /** The Past due tile: every age, credit or not. The company filter stays. */
    public OnShowAll(): void {
        this.CreditOnly = false;
        this.OnWindow('all');
    }

    /** Read the worklist again, and hand the grid a new view so it reads again too. */
    public async Refresh(): Promise<void> {
        this.refreshCount += 1;
        await this.load();
        this.cdr.detectChanges();
    }

    public get IsCustomWindow(): boolean {
        return this.Window.Key === CUSTOM_WINDOW;
    }

    /** The aging band the age filter is on, for the bar to mark. */
    public get ActiveBucket(): keyof MJOAgingBuckets | null {
        const match = (Object.entries(BUCKET_WINDOW) as Array<[keyof MJOAgingBuckets, string]>).find(([, key]) => key === this.Window.Key);
        return match ? match[0] : null;
    }

    /** "12 of 28 orders shown", beside the filters. */
    public get Summary(): string {
        return this.LoadError || (this.Loading && !this.AllRows.length) ? '' : ShownSummary(this.Rows.length, this.Listed.length, 'order');
    }

    /** The export's columns. It carries what the grid does not: the past-due amount, days overdue, credit held and the suggested next step. */
    private readonly exportFields: WorklistExportField<OverdueRow>[] = [
        { Name: 'OrderNumber', Label: 'Order', Value: (r) => r.OrderNumber },
        { Name: 'CustomerName', Label: 'Customer', Value: (r) => r.CustomerName },
        { Name: 'CompanyName', Label: 'Company', Value: (r) => r.CompanyName },
        { Name: 'OrderDate', Label: 'Order date', Type: 'date', Value: (r) => r.OrderDate },
        { Name: 'DueDate', Label: 'Oldest due date', Type: 'date', Value: (r) => r.DueDate },
        { Name: 'DaysOverdue', Label: 'Days overdue', Type: 'number', Value: (r) => r.DaysOverdue },
        { Name: 'PastDue', Label: 'Past due', Type: 'money', Value: (r) => r.PastDue },
        // The same three figures the aging bar totals, so the file adds up to the bar and to the tile under an age band.
        { Name: 'Days1To30', Label: 'Past due 1-30 days', Type: 'money', Value: (r) => r.Aged.Days1To30 },
        { Name: 'Days31To60', Label: 'Past due 31-60 days', Type: 'money', Value: (r) => r.Aged.Days31To60 },
        { Name: 'Days61Plus', Label: 'Past due 61+ days', Type: 'money', Value: (r) => r.Aged.Days61Plus },
        { Name: 'Balance', Label: 'Order balance', Type: 'money', Value: (r) => r.Balance },
        { Name: 'TotalGross', Label: 'Order total', Type: 'money', Value: (r) => r.TotalGross },
        { Name: 'AmountPaid', Label: 'Paid', Type: 'money', Value: (r) => r.AmountPaid },
        { Name: 'AvailableCredit', Label: 'Credit available', Type: 'money', Value: (r) => r.AvailableCredit },
        { Name: 'NextStep', Label: 'Suggested next step', Value: (r) => this.nextAction(r).Text },
        { Name: 'GraceThroughDate', Label: 'Grace period ends', Type: 'date', Value: (r) => r.GraceThroughDate },
        { Name: 'SalesRepName', Label: 'Sales rep', Value: (r) => r.SalesRepName },
        { Name: 'Description', Label: 'Description', Value: (r) => r.Description },
    ];

    /** The orders listed, most overdue first, as an export file. A field, so the bar gets the same function every pass. */
    public readonly BuildExport = (format: 'excel' | 'csv'): MJOWorklistExport => ({
        FileName: ExportFileName('overdue-worklist', this.CompanyPicks, this.Companies, Today()),
        ...BuildWorklistExport(this.exportFields, this.Rows, format),
    });

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    /** Past due across the orders listed; under an age band, the amount that is that late, which is the band's own figure. */
    public get TotalDisplay(): string {
        const band = this.ActiveBucket;
        return FormatMoney(this.Rows.reduce((s, r) => s + (band ? r.Aged[band] : r.PastDue), 0), { Round: true });
    }

    public get TotalDetail(): string {
        const customers = new Set(this.Rows.map((r) => r.CustomerName)).size;
        const counts = `${this.Rows.length} order${this.Rows.length === 1 ? '' : 's'}, ${customers} customer${customers === 1 ? '' : 's'}`;
        const band = OVERDUE_WINDOWS.find((o) => o.Key === this.Window.Key && this.ActiveBucket);
        return band ? `${band.Label} late · ${counts}` : `Invoiced and past its due date · ${counts}`;
    }

    public get OldestDisplay(): string {
        const oldest = Math.max(0, ...this.Rows.map((r) => r.DaysOverdue));
        return oldest ? `${oldest} day${oldest === 1 ? '' : 's'}` : '—';
    }

    public get OldestDetail(): string {
        const oldest = this.Rows[0];
        return oldest ? `${oldest.OrderNumber} · ${oldest.CustomerName}` : 'Nothing overdue';
    }

    public get CreditDisplay(): string {
        return FormatMoney(CreditHeld(this.Rows), { Zero: '—' });
    }

    /* ── Next action ────────────────────────────────────────────────────── */

    /**
     * What to do next, in priority order. The FIRST rule matters most: a customer
     * already holding credit can be collected from without a conversation.
     */
    private nextAction(row: OverdueWorklistRow): MJONextAction {
        if (row.AvailableCredit > 0) {
            return {
                Icon: 'fa-solid fa-piggy-bank',
                Text: `Apply ${FormatMoney(row.AvailableCredit)} credit`,
                Tone: 'success',
            };
        }
        if (row.GraceThroughDate) {
            return {
                Icon: 'fa-solid fa-hourglass-half',
                Text: `Call before grace period ends ${FormatDate(row.GraceThroughDate, { Numeric: true })}`,
                Tone: 'warning',
            };
        }
        if (row.DaysOverdue > 60) {
            return { Icon: 'fa-solid fa-phone', Text: 'Phone call', Tone: 'error' };
        }
        if (row.DaysOverdue > 30) {
            return { Icon: 'fa-regular fa-envelope', Text: 'Second reminder', Tone: 'info' };
        }
        return { Icon: 'fa-regular fa-envelope', Text: 'First reminder', Tone: 'info' };
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        // The worklist is assembled server-side: overdue is computed from the
        // clock, so there is no column a client could filter on.
        const seq = ++this.loadSeq;
        this.Loading = true;
        this.cdr.detectChanges();
        try {
            // The installments ride along so each order can be restated the way Customer A/R reads it.
            // They are context for the list, not the list: if they cannot be read, the orders still show.
            const [result, instalments] = await Promise.all([
                new OrdersGetOverdueWorklistOperation().Execute({}),
                GetOpenInstalmentDetails().then(
                    (rows) => ({ Rows: rows as OverdueInstalment[], Error: null as string | null }),
                    (err: unknown) => ({ Rows: null, Error: err instanceof Error ? err.message : String(err) }),
                ),
            ]);
            if (seq !== this.loadSeq) return;
            if (!result.Success || !result.Output) {
                // SAY SO. An empty worklist and a failed one look identical — both
                // render "Nothing overdue", which is the single most reassuring
                // sentence on the screen. Reporting a clean collections desk because
                // a server call failed is worse than reporting nothing at all.
                this.LoadError =
                    result.ErrorMessage?.trim() ||
                    'The overdue worklist could not be loaded.';
                this.AllRows = [];
                this.Listed = [];
                this.neverInvoicedAll = [];
                this.applyView();
                this.cdr.detectChanges();
                return;
            }
            this.LoadError = null;
            this.InstalmentsError = instalments.Error;
            this.AllRows = result.Output.Rows;
            this.Truncated = result.Output.Truncated;
            const book = RestateOverdue(this.AllRows, instalments.Rows ? GroupInstalmentsByOrder(instalments.Rows) : null, Today());
            this.Listed = book.Rows;
            this.neverInvoicedAll = book.NeverInvoiced;
            this.applyView();
            this.cdr.detectChanges();
        } finally {
            if (seq === this.loadSeq) this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    /** Take the company choice and the age filter from the tab's address; see the Billing worklist for the rule. */
    private adoptAddress(): void {
        const picks = AdoptCompanyChoice(this.companyKey, this.address, globalThis.localStorage);
        if (!SameChoice(picks, this.companyChoice)) this.companyChoice = picks;
        const window = AdoptWindow(this.ageKey, this.address, OVERDUE_WINDOWS, this.Window, DEFAULT_WINDOW);
        if (!SameWindow(window, this.Window)) {
            this.Window = window;
            // Saved as well, so the next visit opens on what the address last said, as it does for the company.
            WriteWorklistState(globalThis.localStorage, OVERDUE_STATE_KEY, { Window: this.Window, Sort: { Key: null, Descending: false } });
        }
    }

    /**
     * Narrow the listed orders to the chosen companies, credit and age, total the aging bar (before
     * an age band is applied, so the band stays one part of a whole), and tell the grid which orders are listed. The company filter offers every company the
     * operation returned, so one whose late installments are all uninvoiced can still be chosen.
     */
    private applyView(): void {
        const companies = ReconcileCompanies(this.AllRows, { ID: (r) => r.CompanyID, Name: (r) => r.CompanyName }, this.companyChoice);
        this.Companies = companies.Options;
        this.CompanyPicks = companies.Picks;
        const band = this.ActiveBucket;
        const scoped = FilterByCompanies(this.Listed, this.CompanyPicks, (r) => r.CompanyID).filter((r) => !this.CreditOnly || r.AvailableCredit > 0);
        // Custom due dates go by each order's oldest late installment. A band does not narrow the bar:
        // the bar is what the band is chosen from, so it keeps showing every age, with the others dimmed.
        const range = ResolveWindow(this.Window, OVERDUE_WINDOWS, Today());
        const dated = band ? scoped : scoped.filter((r) => InDayRange(r.DueDate, range));
        this.Buckets = SumAged(dated);
        // An order belongs to a band when it has an amount that late, whatever else it owes.
        this.Rows = band ? dated.filter((r) => r.Aged[band] > 0) : dated;
        this.NeverInvoiced = FilterByCompanies(this.neverInvoicedAll, this.CompanyPicks, (r) => r.CompanyID);
        // The grid lists what the operation lists unless the page lists fewer; then it is told which.
        this.gridScope = this.Rows.length === this.AllRows.length ? '' : OverdueGridScope(this.Rows.map((r) => r.OrderHeaderID));
    }

    private saveView(): void {
        WriteWorklistState(globalThis.localStorage, OVERDUE_STATE_KEY, { Window: this.Window, Sort: { Key: null, Descending: false } });
        this.AddressChanged.emit(this.ageKey.Write(SameWindow(this.Window, DEFAULT_WINDOW) ? null : WindowToAddress(this.Window)));
    }
}
