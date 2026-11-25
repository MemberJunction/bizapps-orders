/**
 * @fileoverview `mjo-worklist-bar` — the filter row above a Receivables worklist.
 *
 * Company, the page's own controls (a date window, usually), search, how many rows are listed,
 * Refresh and Export, in that order on every worklist, so a person who has learned one screen has
 * learned them all. The bar owns no rows: the host passes the choices and hears each change, and
 * hands over a function that builds the export when it is asked for.
 *
 * The export is the rows as listed: what the filters hide is left out, and the order is the order
 * on screen.
 *
 * ## Example
 *
 * ```html
 * <mjo-worklist-bar
 *   [Companies]="Companies"
 *   [CompanyPicks]="CompanyPicks"
 *   [Search]="Search"
 *   SearchPlaceholder="Search customer or order number"
 *   [Summary]="Summary"
 *   [Loading]="Loading"
 *   [BuildExport]="BuildExport"
 *   [CanExport]="Rows.length > 0"
 *   (CompanyPicksChange)="OnCompanies($event)"
 *   (SearchChange)="OnSearch($event)"
 *   (RefreshRequested)="Refresh()">
 *   <select ...>…</select>
 * </mjo-worklist-bar>
 * ```
 *
 * @module @mj-biz-apps/orders-ng
 */
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ExportService } from '@memberjunction/ng-export-service';
import { MJButtonDirective, MJFilterChipComponent } from '@memberjunction/ng-ui-components';
import { MJOMultiSelectComponent, type MJOMultiSelectOption } from './multi-select.component';

/** One export file: its name, its columns as MJ's export service takes them, and its rows. */
export interface MJOWorklistExport {
    FileName: string;
    Columns: Array<{ name: string; displayName: string; dataType: 'string' | 'number' | 'dateonly'; numberFormat?: string }>;
    Rows: Array<Record<string, string | number | null>>;
}

@Component({
    selector: 'mjo-worklist-bar',
    standalone: true,
    imports: [CommonModule, CdkMenu, CdkMenuItem, CdkMenuTrigger, MJButtonDirective, MJFilterChipComponent, MJOMultiSelectComponent],
    template: `
        <div class="mjo-wb">
            @if (ShowCompanies) {
                <mjo-multi-select
                    Label="Company"
                    Icon="fa-solid fa-building"
                    [Options]="Companies"
                    [Selected]="CompanyPicks"
                    (SelectedChange)="CompanyPicksChange.emit($event)" />
            }
            <ng-content />
            @if (Searchable) {
                <div class="mjo-search mjo-wb__search">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <input
                        #search
                        [value]="Search"
                        (input)="SearchChange.emit(search.value)"
                        [placeholder]="SearchPlaceholder"
                        [attr.aria-label]="SearchPlaceholder" />
                </div>
            }
            @if (ActiveFilter) {
                <mj-filter-chip [Label]="ActiveFilter + ' only'" Icon="fa-solid fa-xmark" [Active]="true" (Clicked)="ActiveFilterCleared.emit()" />
            }
            <span class="small muted mjo-wb__summary" role="status">
                {{ Summary }}
                @if (ExportError) {
                    <span class="mjo-wb__error">· {{ ExportError }}</span>
                }
            </span>
            <button type="button" mjButton variant="outline" size="sm" class="mjo-wb__button" [disabled]="Loading" (click)="RefreshRequested.emit()" title="Reload this list">
                <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="Loading" aria-hidden="true"></i> Refresh
            </button>
            @if (BuildExport) {
                <button
                    type="button"
                    mjButton
                    variant="outline"
                    size="sm"
                    class="mjo-wb__button"
                    [cdkMenuTriggerFor]="exportMenu"
                    [disabled]="!CanExport || Exporting"
                    title="Export the rows listed">
                    <i class="fa-solid fa-file-export" aria-hidden="true"></i> {{ Exporting ? 'Exporting…' : 'Export' }}
                    <i class="fa-solid fa-chevron-down mjo-wb__caret" aria-hidden="true"></i>
                </button>
                <ng-template #exportMenu>
                    <div class="mjo-wb__menu" cdkMenu aria-label="Export">
                        <button type="button" class="mjo-wb__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('excel')">
                            <i class="fa-solid fa-file-excel" aria-hidden="true"></i> Excel (.xlsx)
                        </button>
                        <button type="button" class="mjo-wb__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('csv')">
                            <i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV
                        </button>
                    </div>
                </ng-template>
            }
        </div>
    `,
    styles: [
        `
            :host { display: block; }
            .mjo-wb {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                flex-wrap: wrap;
                margin-bottom: var(--mj-space-4);
            }
            .mjo-wb__search { min-width: 280px; }
            .mjo-wb__summary { margin-left: auto; white-space: nowrap; }
            .mjo-wb__error { color: var(--mj-status-error-text); white-space: normal; }
            .mjo-wb__button { flex: none; }
            .mjo-wb__caret { font-size: 10px; margin-left: 2px; }
            .mjo-wb__menu {
                min-width: 180px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                box-shadow: var(--mj-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
                padding: var(--mj-space-1, 4px);
            }
            .mjo-wb__menu-item {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                width: 100%;
                font: inherit;
                font-size: 13px;
                text-align: left;
                padding: 8px 10px;
                border: none;
                border-radius: var(--mj-radius-md);
                background: none;
                color: inherit;
                cursor: pointer;
            }
            .mjo-wb__menu-item:hover, .mjo-wb__menu-item:focus-visible { background: var(--mj-bg-surface-sunken); outline: none; }
            .mjo-wb__menu-item i { color: var(--mj-text-muted); width: 16px; }
            @media (max-width: 1000px) {
                .mjo-wb__search { min-width: 0; flex: 1 1 100%; }
                .mjo-wb__summary { margin-left: 0; }
            }
        `,
    ],
})
export class MJOWorklistBarComponent {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly exporter = inject(ExportService);

    /** Whether the page filters by company. The filter is then always shown, reading "All" when nothing is chosen, even with one company or none to offer. */
    @Input() ShowCompanies = true;
    /** The companies offered: the ones with rows on the page. */
    @Input() Companies: MJOMultiSelectOption[] = [];
    /** The chosen companies. Owned by the host. */
    @Input() CompanyPicks: ReadonlyArray<string> = [];

    @Input() Searchable = true;
    /** Current search text, controlled by the host. */
    @Input() Search = '';
    @Input() SearchPlaceholder = 'Search…';

    /** The quick filter that is on, by name ("Past due"), shown as a chip that clears it. Null when none is. */
    @Input() ActiveFilter: string | null = null;
    @Output() ActiveFilterCleared = new EventEmitter<void>();

    /** How many rows are listed, in words: "12 of 40 installments shown". */
    @Input() Summary = '';
    /** A reload is running: the Refresh button spins and waits. */
    @Input() Loading = false;

    /** Builds the export of the rows listed. Omit to offer no export. */
    @Input() BuildExport: ((format: 'excel' | 'csv') => MJOWorklistExport) | null = null;
    /** Whether there is anything to export. */
    @Input() CanExport = true;

    @Output() CompanyPicksChange = new EventEmitter<string[]>();
    @Output() SearchChange = new EventEmitter<string>();
    @Output() RefreshRequested = new EventEmitter<void>();

    public Exporting = false;
    /** Why the last export failed, shown beside the row count until the next one. */
    public ExportError: string | null = null;

    public async Export(format: 'excel' | 'csv'): Promise<void> {
        if (!this.BuildExport || !this.CanExport || this.Exporting) return;
        this.Exporting = true;
        this.ExportError = null;
        this.cdr.detectChanges();
        try {
            const file = this.BuildExport(format);
            // The lower-case name: it is the one every ng-export-service since 6.1 exposes (6.2 adds a capitalised alias).
            const outcome = await this.exporter.exportAndDownload(file.Rows, { format, fileName: file.FileName, columns: file.Columns, includeHeaders: true });
            if (!outcome.success) this.ExportError = `The export failed: ${outcome.error ?? 'unknown error'}`;
        } catch (err) {
            this.ExportError = `The export failed: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            this.Exporting = false;
            this.cdr.detectChanges();
        }
    }
}
