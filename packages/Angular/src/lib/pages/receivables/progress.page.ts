import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersGetProgressWorklistOperation,
    OrdersRecordProgressOperation,
    Today,
    type OrdersRecordProgressOutput,
    type ProgressWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOSidePanelComponent } from '../../panels/side-panel.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistBarComponent, type MJOWorklistExport } from '../../panels/worklist-bar.component';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import {
    BuildWorklistExport,
    AddressKey,
    AdoptCompanyChoice,
    COMPANY_ADDRESS_KEY,
    CompaniesToAddress,
    ExportFileName,
    FilterByCompanies,
    MatchesText,
    NextSort,
    ReadWorklistState,
    ReconcileCompanies,
    RestoreSort,
    SameChoice,
    ShownSummary,
    SortRows,
    WriteSharedCompanies,
    WriteWorklistState,
    type WorklistCompanyOption,
    type WorklistExportField,
    type WorklistSort,
} from './worklist-view.model';

const PROGRESS_STATE_KEY = 'mjOrders.progressAttestation.view';

/** Which lines a quick filter keeps, by when they were last attested. `monthStart` is the first day of the business month. */
export function MatchesAttestationFilter(row: { LastMeasurementDate?: string | null }, filter: string, monthStart: string): boolean {
    const last = row.LastMeasurementDate ? String(row.LastMeasurementDate).slice(0, 10) : null;
    switch (filter) {
        case 'due':
            return !last || last < monthStart;
        case 'never':
            return !last;
        default:
            return true;
    }
}

/**
 * `mjo-progress-page` — the monthly progress attestation (AIDP-26, plan §9.4 version 1).
 *
 * EVERY OPEN PERCENTAGE-OF-COMPLETION LINE, ITS LAST OBSERVATION, AND A FIELD FOR THIS PERIOD'S.
 * That is the whole feature. The delivery lead picks a line, states the cumulative percent complete
 * and the period date, previews what would move, and posts it. Revenue catches up to the attested
 * percent — forwards or backwards — through `Orders.RecordProgress`; a posted observation is
 * immutable, so the confirmation is the last chance to look.
 *
 * THE LINE OPENS BESIDE THE LIST. Its facts, the two inputs, the preview and the warnings sit
 * together in a side panel, so what is about to be posted is read next to the line it is posted
 * against, not in a toolbar above every other line.
 *
 * POSTING IS THE IRREVERSIBLE STEP, so it asks first — through `MJConfirmService`, never
 * `window.confirm`, which throws under the Electron host.
 *
 * SUPERSEDE IS THE WAY BACK FROM A WRONG ONE (golive #260). A user holding the supersede
 * authorization sees a toggle that makes the next post replace the line's last observation: its
 * recognition is reversed and the new observation posts as if it had never been there. Nothing is
 * edited. The reversal lands on the replaced date, or on the first open day when finance has closed
 * that month; the new catch-up posts on the date entered. The preview and the confirm both say which
 * date the reversal got. The operation checks the grant again; the toggle only hides the action from
 * people who cannot use it.
 *
 * A DATE IN A MONTH FINANCE HAS CLOSED IS REFUSED by the operation (golive #316), on preview and
 * post, supersede included. The screen shows the refusal's message as the error notice, as it does
 * every refusal.
 *
 * A LINE AT 100% IS STILL SUPERSEDABLE, so the same users get "Show completed lines": the worklist
 * omits completed lines by default, and a mistyped 100% would otherwise leave the only screen that
 * can correct it. The tiles count open lines either way.
 *
 * A DATE AFTER TODAY, OR TWO OR MORE MONTHS BACK, WARNS. Neither is blocked, but a mistyped year is
 * the mistake that made supersede necessary, so both warnings ride the preview, the confirm and the
 * notice after posting.
 *
 * ## Example
 *
 * ```html
 * <mjo-progress-page (OrderOpened)="open($event)" (AddressChanged)="write($event)" />
 * ```
 */
@Component({
    selector: 'mjo-progress-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective, MJAlertComponent, MJOSidePanelComponent, MJOStatTileComponent, MJOWorklistBarComponent, MJOWorklistTableComponent],
    template: `
        <mjo-worklist-bar
            [Companies]="Companies"
            [CompanyPicks]="CompanyPicks"
            [Search]="Search"
            SearchPlaceholder="Search project, customer or order number"
            [ActiveFilter]="DueOnly ? 'Not attested this month' : null"
            [Summary]="Summary"
            [Loading]="Loading"
            [BuildExport]="BuildExport"
            [CanExport]="Rows.length > 0"
            (CompanyPicksChange)="OnCompanies($event)"
            (SearchChange)="OnSearch($event)"
            (ActiveFilterCleared)="OnDueOnly(false)"
            (RefreshRequested)="Refresh()">
            @if (CanSupersede) {
                <label class="mjo-pg__toggle small">
                    <input type="checkbox" [checked]="ShowComplete" [disabled]="Busy" (change)="ToggleShowComplete()" />
                    Show completed lines
                </label>
            }
        </mjo-worklist-bar>

        <div class="mj-stat-grid mjo-pg__tiles">
            <mjo-stat-tile
                class="mjo-pg__tile"
                Hint="Show every open line"
                Label="Open project lines"
                Icon="fa-solid fa-diagram-project"
                [Value]="String(OpenRows.length)"
                Detail="Percentage of completion, below 100%"
                (Clicked)="OnDueOnly(false)" />
            <mjo-stat-tile
                class="mjo-pg__tile"
                [class.is-on]="DueOnly"
                [Pressed]="DueOnly"
                Hint="Show lines with no observation this month"
                Label="Not attested this month"
                Icon="fa-regular fa-calendar-xmark"
                [Tone]="DueCount ? 'alert' : 'default'"
                [Value]="String(DueCount)"
                [Detail]="DueCount ? NeverCount + ' never attested' : 'Every open line is attested'"
                (Clicked)="OnDueOnly(!DueOnly)" />
            <mjo-stat-tile Label="Contract value" Icon="fa-solid fa-file-signature" [Value]="money(TotalAmount, true)" Detail="Across the open lines" />
            <mjo-stat-tile Label="Recognized to date" Icon="fa-solid fa-chart-line" [Value]="money(TotalRecognized, true)" [Detail]="RemainingDetail" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-pg__note">
                <strong>The progress worklist did not load.</strong> {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-pg__note">{{ Notice.Text }}</mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-pg__note"><strong>List truncated.</strong> Not every open line is shown.</mj-alert>
        }

        <div class="mjo-split">
            <div class="mjo-split__main">
                <mjo-worklist-table
                    [Columns]="Columns"
                    [Rows]="Rows"
                    [Searchable]="false"
                    [Loading]="Loading"
                    [Totals]="Totals"
                    MaxHeight="calc(100vh - 290px)"
                    [SortKey]="Sort.Key"
                    [SortDescending]="Sort.Descending"
                    RowKey="OrderLineID"
                    [SelectedKey]="Selected?.OrderLineID ?? null"
                    [EmptyTitle]="AllRows.length ? 'Nothing matches' : 'Nothing to attest'"
                    [EmptyHint]="AllRows.length ? 'No project line matches these filters. Clear one to see more.' : 'No booked percentage-of-completion line is below 100%.'"
                    EmptyIcon="fa-solid fa-diagram-project"
                    (SortChanged)="OnSort($event)"
                    (LinkClicked)="OpenOrder($event.Row)"
                    (RowClicked)="Select($event)" />
            </div>

            @if (Selected; as row) {
                <div class="mjo-split__side">
                    <mjo-side-panel
                        Icon="fa-solid fa-diagram-project"
                        [Title]="row.OrderNumber + ' · line ' + row.LineNumber"
                        [Chip]="percent(row.LastPercentComplete) + ' complete'"
                        [ChipClass]="row.LastPercentComplete > 0 ? 'mjo-chip--success' : 'mjo-chip--outline'"
                        (Closed)="Close()">
                        <dl class="mjo-side-panel__facts">
                            <dt>Project</dt>
                            <dd>{{ row.ProductName }}</dd>
                            <dt>Customer</dt>
                            <dd>{{ row.CustomerName }}</dd>
                            <dt>Order</dt>
                            <dd><button type="button" class="mjo-side-panel__link" (click)="OpenOrder(row)" title="Open the order">{{ row.OrderNumber }}</button></dd>
                            <dt>Sold by</dt>
                            <dd>{{ row.CompanyName || '—' }}</dd>
                            <dt>Contract</dt>
                            <dd>{{ money(row.LineAmount) }}</dd>
                            <dt>Recognized</dt>
                            <dd>{{ money(row.RecognizedToDate) }} · {{ money(row.LineAmount - row.RecognizedToDate) }} still deferred</dd>
                            <dt>Last attested</dt>
                            <dd>
                                {{ row.LastMeasurementDate ? date(row.LastMeasurementDate) + ' at ' + percent(row.LastPercentComplete) : 'Never' }}
                                @if (row.LastAttestedBy) {
                                    · by {{ row.LastAttestedBy }}
                                }
                            </dd>
                        </dl>

                        <div class="mjo-pg__form">
                            <label class="mjo-pg__field">
                                <span class="small muted">Period</span>
                                <input class="mj-input" type="date" [(ngModel)]="MeasurementDate" name="measurementDate" (ngModelChange)="Draft = null" aria-label="Measurement date">
                            </label>
                            <label class="mjo-pg__field">
                                <span class="small muted">Complete to date (%)</span>
                                <input class="mj-input is-num" type="number" min="0" max="100" step="0.01" [(ngModel)]="PercentInput" name="percent" (ngModelChange)="Draft = null" aria-label="Percent complete">
                            </label>
                        </div>
                        @if (CanSupersede && row.LastMeasurementID) {
                            <label class="mjo-pg__toggle small mjo-pg__supersede">
                                <input type="checkbox" [checked]="Supersede" [disabled]="Busy" (change)="ToggleSupersede()" />
                                Replace the last observation
                            </label>
                        }

                        @if (Supersede && row.LastMeasurementDate) {
                            <div class="mjo-pg__closed" role="status">
                                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                                Replaces the {{ date(row.LastMeasurementDate) }} observation at {{ percent(row.LastPercentComplete) }}.
                                Its recognition is reversed on its own date, or on the first open day if finance has closed that month, and the new catch-up books on the date you enter; nothing is edited. Keep its date to correct the percent, or choose any date after the observation before it.
                            </div>
                        }
                        @if (Draft) {
                            <div class="mjo-pg__preview" role="status">
                                <span class="small muted">Preview</span>
                                <strong>{{ Draft.Message }}</strong>
                            </div>
                        }
                        @if (reversalNote(Draft, row); as reversalText) {
                            <div class="mjo-pg__closed" role="status">
                                <i class="fa-solid fa-calendar-day" aria-hidden="true"></i> {{ reversalText }}
                            </div>
                        }
                        @if (Draft?.FutureDateWarning; as future) {
                            <div class="mjo-pg__closed" role="status">
                                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ future }}
                            </div>
                        }
                        @if (Draft?.BackDatedWarning; as backDated) {
                            <div class="mjo-pg__closed" role="status">
                                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ backDated }}
                            </div>
                        }

                        <div class="mjo-side-panel__actions">
                            <button type="button" mjButton variant="primary" [disabled]="!CanSubmit || Busy" (click)="PostSelected()">
                                <i class="fa-solid fa-file-signature" aria-hidden="true"></i> {{ Busy ? 'Working…' : 'Attest and post' }}
                            </button>
                            <button type="button" mjButton variant="outline" [disabled]="!CanSubmit || Busy" (click)="PreviewSelected()">
                                <i class="fa-solid fa-eye" aria-hidden="true"></i> Preview
                            </button>
                        </div>
                    </mjo-side-panel>
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host { display: block; height: 100%; overflow: auto; padding: var(--mj-space-6); }
            .mjo-pg__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-pg__tile { display: block; border-radius: var(--mj-radius-md); transition: box-shadow 140ms ease; }
            .mjo-pg__tile.is-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 55%, transparent); }
            .mjo-pg__note { display: block; margin-bottom: var(--mj-space-4); }
            .mjo-pg__toggle { display: inline-flex; align-items: center; gap: var(--mj-space-2); cursor: pointer; }
            .mjo-pg__supersede { margin-bottom: var(--mj-space-3); }
            .mjo-pg__form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mj-space-3); margin-bottom: var(--mj-space-3); }
            .mjo-pg__field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .mjo-pg__field .mj-input { width: 100%; box-sizing: border-box; }
            .mjo-pg__preview {
                display: flex;
                flex-direction: column;
                gap: 2px;
                margin-bottom: var(--mj-space-3);
                padding: var(--mj-space-3);
                background: var(--mj-bg-surface-sunken);
                border-radius: var(--mj-radius-md);
                font-size: 0.9rem;
            }
            .mjo-pg__closed {
                margin-bottom: var(--mj-space-3);
                padding: var(--mj-space-3) var(--mj-space-4);
                border-left: 3px solid var(--mj-status-warning);
                background: var(--mj-status-warning-bg);
                border-radius: var(--mj-radius-sm, 4px);
                font-size: 0.9rem;
            }
            @media (max-width: 760px) { :host { padding: var(--mj-space-4); } }
            @media (prefers-reduced-motion: reduce) { .mjo-pg__tile { transition: none; } }
        `,
    ],
})
export class MJOProgressPageComponent implements OnInit {
    /** Same NG0100 reasoning as every other imperatively-created page here: write the DOM after a load. */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();
    /** The company choice changed: the section writes it to the tab's address. A null value removes the key. */
    @Output() AddressChanged = new EventEmitter<Record<string, string | null>>();

    public readonly String = String;

    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Busy = false;
    /** True when the caller holds the supersede authorization — from the worklist, rechecked by the operation. */
    public CanSupersede = false;
    /** When set, the next preview or post replaces the selected line's last observation. */
    public Supersede = false;
    /** When set, lines already attested at 100% are listed too — only offered to users who can supersede. */
    public ShowComplete = false;
    public Loading = false;
    /** Every line the operation returned. */
    public AllRows: ProgressWorklistRow[] = [];
    /** `AllRows` under the company filter and the search. The tiles count these. */
    public Scoped: ProgressWorklistRow[] = [];
    /** `Scoped` under the quick filter, in the sorted order. What the table lists and the export writes. */
    public Rows: ProgressWorklistRow[] = [];
    public Companies: WorklistCompanyOption[] = [];
    /** The chosen companies that are offered: what the filter shows. */
    public CompanyPicks: string[] = [];
    /** The company choice as chosen, shared across Receivables. */
    private companyChoice: string[] = [];
    public Search = '';
    /** The quick filter: only lines with no observation this month. */
    public DueOnly = false;
    /** Open lines not attested this month, and of those the ones never attested. Fields, rebuilt with the rows. */
    public DueCount = 0;
    public NeverCount = 0;
    /** The totals row. A field: a getter would hand the table a new object on every pass. */
    public Totals: Record<string, string> | null = null;
    /** The column the list is sorted on; a null key is the order the operation returned. */
    public Sort: WorklistSort = { Key: null, Descending: false };
    /** The line open in the side panel. */
    public Selected: ProgressWorklistRow | null = null;
    public MeasurementDate = Today();
    public PercentInput: number | null = null;
    /** The last preview for the current inputs; cleared whenever they change. */
    public Draft: OrdersRecordProgressOutput | null = null;
    private address: Record<string, string> = {};
    private readonly companyKey = new AddressKey(COMPANY_ADDRESS_KEY);
    /** Counts loads, so a slow answer to an earlier read cannot overwrite a later one. */
    private loadSeq = 0;
    private ready = false;

    public readonly Columns: MJOColumn<ProgressWorklistRow>[] = [
        { Key: 'OrderNumber', Label: 'Order', Kind: 'link', LinkHint: 'Open the order', Width: '130px', Sortable: true, Secondary: (r) => `line ${r.LineNumber}` },
        { Key: 'ProductName', Label: 'Project', Sortable: true },
        { Key: 'CustomerName', Label: 'Customer', HideBelow: 760, Sortable: true },
        { Key: 'CompanyName', Label: 'Sold by', HideBelow: 1000, Sortable: true },
        { Key: 'LineAmount', Label: 'Contract', Kind: 'money', Width: '120px', Sortable: true, Format: (r) => FormatMoney(r.LineAmount) },
        { Key: 'LastMeasurementDate', Label: 'Last attested', Kind: 'date', Width: '130px', Sortable: true, Format: (r) => (r.LastMeasurementDate ? this.date(r.LastMeasurementDate) : 'Never'), Secondary: (r) => (r.LastAttestedBy ? `by ${r.LastAttestedBy}` : null) },
        { Key: 'LastPercentComplete', Label: 'Complete', Kind: 'chip', Width: '110px', Sortable: true, Format: (r) => this.percent(r.LastPercentComplete), ChipClass: (r) => (r.LastPercentComplete > 0 ? 'mjo-chip--success' : 'mjo-chip--outline') },
        { Key: 'RecognizedToDate', Label: 'Recognized', Kind: 'money', Width: '130px', HideBelow: 560, Sortable: true, Format: (r) => FormatMoney(r.RecognizedToDate) },
    ];

    private readonly exportFields: WorklistExportField<ProgressWorklistRow>[] = [
        { Name: 'OrderNumber', Label: 'Order', Value: (r) => r.OrderNumber },
        { Name: 'LineNumber', Label: 'Line', Type: 'number', Value: (r) => r.LineNumber },
        { Name: 'ProductName', Label: 'Project', Value: (r) => r.ProductName },
        { Name: 'CustomerName', Label: 'Customer', Value: (r) => r.CustomerName },
        { Name: 'CompanyName', Label: 'Sold by', Value: (r) => r.CompanyName },
        { Name: 'LineAmount', Label: 'Contract', Type: 'money', Value: (r) => r.LineAmount },
        { Name: 'LastMeasurementDate', Label: 'Last attested', Type: 'date', Value: (r) => r.LastMeasurementDate },
        { Name: 'LastAttestedBy', Label: 'Attested by', Value: (r) => r.LastAttestedBy },
        { Name: 'PercentComplete', Label: 'Complete (%)', Type: 'number', Value: (r) => Math.round(r.LastPercentComplete * 10000) / 100 },
        { Name: 'RecognizedToDate', Label: 'Recognized', Type: 'money', Value: (r) => r.RecognizedToDate },
        { Name: 'StillDeferred', Label: 'Still deferred', Type: 'money', Value: (r) => Math.round((r.LineAmount - r.RecognizedToDate) * 100) / 100 },
        { Name: 'ServicePeriodStart', Label: 'Service starts', Type: 'date', Value: (r) => r.ServicePeriodStart },
        { Name: 'ServicePeriodEnd', Label: 'Service ends', Type: 'date', Value: (r) => r.ServicePeriodEnd },
    ];

    /** The lines listed, as an export file. A field, so the bar is handed the same function every pass. */
    public readonly BuildExport = (format: 'excel' | 'csv'): MJOWorklistExport => ({
        FileName: ExportFileName('progress-attestation', this.CompanyPicks, this.Companies, Today()),
        ...BuildWorklistExport(this.exportFields, this.Rows, format),
    });

    public async ngOnInit(): Promise<void> {
        const saved = ReadWorklistState(globalThis.localStorage, PROGRESS_STATE_KEY);
        if (saved) this.Sort = RestoreSort(saved.Sort, this.Columns);
        this.adoptAddress();
        await this.load();
        // An address that arrived while that first load was out was kept, not followed. Follow it now.
        this.adoptAddress();
        this.applyView();
        this.ready = true;
        this.cdr.detectChanges();
    }

    /** The tab's address, from the section: `company` is the company choice every Receivables page shares. */
    public ApplyAddress(params: Record<string, string>): void {
        this.address = params;
        if (!this.ready) return;
        this.adoptAddress();
        this.applyView();
        // Back, Forward and links arrive outside any event of this page's own, so nothing else repaints it.
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    /** The lines still below 100% — what the tiles describe, whether or not completed lines are shown. */
    public get OpenRows(): ProgressWorklistRow[] {
        return this.Scoped.filter((r) => r.LastPercentComplete < 1);
    }

    /** "3 of 12 lines shown", beside the filters. */
    public get Summary(): string {
        return this.LoadError || (this.Loading && !this.AllRows.length) ? '' : ShownSummary(this.Rows.length, this.AllRows.length, 'line');
    }

    public get TotalAmount(): number {
        return this.OpenRows.reduce((s, r) => s + r.LineAmount, 0);
    }

    public get TotalRecognized(): number {
        return this.OpenRows.reduce((s, r) => s + r.RecognizedToDate, 0);
    }

    public get RemainingDetail(): string {
        return `${FormatMoney(this.TotalAmount - this.TotalRecognized, { Round: true })} still deferred`;
    }

    public get CanSubmit(): boolean {
        const p = Number(this.PercentInput);
        return !!this.Selected && !!this.MeasurementDate && this.PercentInput !== null && Number.isFinite(p) && p >= 0 && p <= 100;
    }

    /* ── Filters ────────────────────────────────────────────────────────── */

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

    public OnDueOnly(on: boolean): void {
        this.DueOnly = on;
        this.applyView();
    }

    public OnSort(key: string): void {
        this.Sort = NextSort(this.Sort, key, this.Columns);
        WriteWorklistState(globalThis.localStorage, PROGRESS_STATE_KEY, { Window: null, Sort: this.Sort });
        this.applyView();
    }

    public async Refresh(): Promise<void> {
        this.Notice = null;
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    /** Clicking a line opens it beside the list with its last percent ready to change; clicking the open line closes it. */
    public Select(row: ProgressWorklistRow): void {
        if (this.Selected?.OrderLineID === row.OrderLineID) {
            this.Close();
            return;
        }
        this.Selected = row;
        this.PercentInput = Math.round(row.LastPercentComplete * 10000) / 100;
        this.Supersede = false;
        this.Draft = null;
        this.Notice = null;
    }

    public Close(): void {
        this.Selected = null;
        this.Supersede = false;
        this.Draft = null;
    }

    public async ToggleShowComplete(): Promise<void> {
        this.ShowComplete = !this.ShowComplete;
        this.Close();
        await this.load();
        this.cdr.detectChanges();
    }

    public ToggleSupersede(): void {
        this.Supersede = !this.Supersede;
        this.Draft = null;
    }

    public OpenOrder(row: ProgressWorklistRow): void {
        this.OrderOpened.emit({ ID: row.OrderHeaderID });
    }

    public async PreviewSelected(): Promise<void> {
        const output = await this.record(true);
        if (output) this.Draft = output;
        this.cdr.detectChanges();
    }

    public async PostSelected(): Promise<void> {
        const row = this.Selected;
        if (!row) return;
        const draft = this.Draft ?? (await this.record(true));
        if (!draft) return;
        const superseding = this.Supersede && row.LastMeasurementDate ? `, replacing the ${this.date(row.LastMeasurementDate)} observation` : '';
        const warnings = [this.reversalNote(draft, row), draft.FutureDateWarning, draft.BackDatedWarning].filter((w): w is string => !!w);
        const proceed = await this.confirm.Confirm({
            title: `Attest ${row.OrderNumber} line ${row.LineNumber} at ${this.percent(Number(this.PercentInput) / 100)}${superseding}?`,
            message: draft.Message ?? '',
            // THE WARNING RIDES THE CONFIRM, not just the panel beside the table. It is advisory —
            // an unusual date is not blocked — so the one place it has to be unmissable is the
            // moment before the entry is written, which is exactly where this dialog sits.
            detail:
                `Signed by you, dated ${this.date(this.MeasurementDate)}. A posted observation cannot be changed; a correction is a new observation in a later period` +
                (this.CanSupersede ? ', or a replacement of this one.' : '.') +
                warnings.map((w) => `\n\n${w}`).join(''),
            type: 'warning',
            confirmText: 'Attest and post',
            cancelText: 'Not yet',
        });
        if (!proceed) return;
        const output = await this.record(false);
        if (!output) return;
        const after = [output.FutureDateWarning, output.BackDatedWarning].filter((w): w is string => !!w);
        this.Notice = after.length
            ? { Tone: 'warning', Text: `${output.Message ?? 'Posted.'} ${after.join(' ')}` }
            : { Tone: 'success', Text: output.Message ?? 'Posted.' };
        this.Close();
        await this.load();
        this.cdr.detectChanges();
    }

    /**
     * Where a supersede's reversal is booked, in words — or null when nothing is reversed. Said
     * whichever date it got, with the reason when it is not the replaced observation's own date.
     */
    public reversalNote(draft: OrdersRecordProgressOutput | null, row: { LastMeasurementDate?: string | null }): string | null {
        if (!draft?.ReversalDate || !draft.ReversalAmount) return null;
        const replaced = row.LastMeasurementDate ? row.LastMeasurementDate.slice(0, 10) : null;
        const amount = this.money(Math.abs(draft.ReversalAmount));
        const on = this.date(draft.ReversalDate);
        return !replaced || replaced === draft.ReversalDate
            ? `The ${amount} reversal is dated ${on}, the replaced observation's own date.`
            : `The ${amount} reversal is dated ${on}: finance has closed the ${this.date(replaced)} observation's month, ` +
                  `so the reversal books on the first open day.`;
    }

    /** One call shape for both buttons. Returns null (and shows why) when the operation refused. */
    private async record(preview: boolean): Promise<OrdersRecordProgressOutput | null> {
        if (!this.Selected || !this.CanSubmit) return null;
        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersRecordProgressOperation().Execute({
                OrderLineID: this.Selected.OrderLineID,
                MeasurementDate: this.MeasurementDate,
                PercentComplete: Number(this.PercentInput) / 100,
                Preview: preview,
                SupersedesMeasurementID: this.Supersede ? this.Selected.LastMeasurementID ?? null : null,
            });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                this.Notice = { Tone: 'error', Text: output?.Message?.trim() || result.ErrorMessage?.trim() || 'The observation could not be recorded.' };
                return null;
            }
            return output;
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        const seq = ++this.loadSeq;
        this.Loading = true;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersGetProgressWorklistOperation().Execute({ IncludeComplete: this.ShowComplete });
            if (seq !== this.loadSeq) return;
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                // SAY SO. An empty worklist and a failed one look identical, and "nothing to attest" is
                // the most reassuring sentence on the screen.
                this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The progress worklist could not be loaded.';
                this.AllRows = [];
                this.applyView();
                this.cdr.detectChanges();
                return;
            }
            this.LoadError = null;
            this.AllRows = output.Rows;
            this.Truncated = output.Truncated;
            this.CanSupersede = output.CanSupersede;
            this.applyView();
            this.cdr.detectChanges();
        } finally {
            if (seq === this.loadSeq) this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    /** Take the company choice from the tab's address; see the Billing worklist for the rule. */
    private adoptAddress(): void {
        const picks = AdoptCompanyChoice(this.companyKey, this.address, globalThis.localStorage);
        if (!SameChoice(picks, this.companyChoice)) this.companyChoice = picks;
    }

    /**
     * Rebuild what is listed from what was loaded: company and search narrow the lines the tiles
     * count; the quick filter and the sort then decide what the table shows. An open line the
     * filters hide is closed with its draft, so nothing is attested against a row that is not on screen.
     */
    private applyView(): void {
        const companies = ReconcileCompanies(this.AllRows, { ID: (r) => r.CompanyID, Name: (r) => r.CompanyName }, this.companyChoice);
        this.Companies = companies.Options;
        this.CompanyPicks = companies.Picks;
        this.Scoped = FilterByCompanies(this.AllRows, this.CompanyPicks, (r) => r.CompanyID).filter((r) =>
            MatchesText([r.ProductName, r.CustomerName, r.OrderNumber], this.Search),
        );
        const monthStart = `${Today().slice(0, 7)}-01`;
        const open = this.Scoped.filter((r) => r.LastPercentComplete < 1);
        this.DueCount = open.filter((r) => MatchesAttestationFilter(r, 'due', monthStart)).length;
        this.NeverCount = open.filter((r) => MatchesAttestationFilter(r, 'never', monthStart)).length;
        const shown = this.DueOnly ? this.Scoped.filter((r) => r.LastPercentComplete < 1 && MatchesAttestationFilter(r, 'due', monthStart)) : this.Scoped;
        this.Rows = SortRows(shown, this.Columns, this.Sort);
        this.Totals = {
            OrderNumber: 'Total',
            ProductName: `${this.Rows.length} line${this.Rows.length === 1 ? '' : 's'}`,
            LineAmount: FormatMoney(this.Rows.reduce((s, r) => s + r.LineAmount, 0)),
            RecognizedToDate: FormatMoney(this.Rows.reduce((s, r) => s + r.RecognizedToDate, 0)),
        };
        if (this.Selected) {
            const key = this.Selected.OrderLineID;
            const still = this.Rows.find((r) => r.OrderLineID === key) ?? null;
            if (still) this.Selected = still;
            else this.Close();
        }
    }

    /* ── Display helpers ────────────────────────────────────────────────── */

    /** Every date on the page reads MM/DD/YYYY, as on Customer A/R. */
    protected date(value: string | null | undefined): string {
        return value ? FormatDate(value, { Numeric: true }) : '—';
    }

    protected money(value: number, round = false): string {
        return FormatMoney(value, { Round: round });
    }

    protected percent(fraction: number): string {
        return `${(Math.round(fraction * 10000) / 100).toString()}%`;
    }
}
