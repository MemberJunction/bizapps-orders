import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** How a column's value is rendered. */
export type MJOColumnKind =
    /** Plain text. */
    | 'text'
    /** Right-aligned, tabular figures. */
    | 'money'
    /** Right-aligned integer or decimal. */
    | 'number'
    /** Formatted date. */
    | 'date'
    /** A `mj-chip`; `ChipClass` picks the variant. */
    | 'chip'
    /** Monospace — document numbers and references. */
    | 'mono';

/** One column of a worklist. */
export interface MJOColumn<TRow = Record<string, unknown>> {
    /** Property on the row, and the column's identity for sorting. */
    Key: string;
    Label: string;
    Kind?: MJOColumnKind;
    /** Fixed width, e.g. `'110px'`. Omit to let it flex. */
    Width?: string;
    /** Whether the header offers sorting. Index-limited in practice, so opt-in. */
    Sortable?: boolean;
    /** Muted second line under the value. */
    Secondary?: (row: TRow) => string | null;
    /** Chip variant class for `Kind: 'chip'`. */
    ChipClass?: (row: TRow) => string;
    /** Hide below this viewport width — the responsive drop order. */
    HideBelow?: 560 | 760 | 1000;
    /** Render the value differently from the raw property. */
    Format?: (row: TRow) => string;
}

/** A quick-filter chip above the table. */
export interface MJOPreset {
    Key: string;
    Label: string;
    /** Shown as a count pill. Omit — or pass 0 — to render no pill. */
    Count?: number | null;
    Icon?: string;
}

/**
 * `mjo-worklist-table` — the dense, filterable list idiom.
 *
 * Used by every "find and work a set" screen: all orders, all payments, the
 * overdue worklist, the fulfillment queue. Configuration-driven rather than
 * copied, so the filter behaviour, the empty state and the responsive column
 * dropping are decided once.
 *
 * ONE FILTER SYSTEM, NEVER TWO. Preset chips are the fast path and a search box
 * narrows within them. There is deliberately no second parallel set of controls
 * inside the table — two filter systems on one screen means neither is trusted,
 * and users end up unable to tell why a row is missing.
 *
 * COLUMNS DROP IN A STATED ORDER on narrow viewports rather than the table
 * scrolling sideways. A horizontally-scrolling table on a phone hides data
 * without admitting it; dropping the lowest-value columns at least tells the
 * truth about what is on screen.
 *
 * ## Example
 *
 * ```html
 * <mjo-worklist-table
 *   [Columns]="columns"
 *   [Rows]="rows"
 *   [Presets]="presets"
 *   [ActivePreset]="preset"
 *   (PresetChanged)="preset = $event"
 *   (RowClicked)="openPreview($event)" />
 * ```
 */
@Component({
    selector: 'mjo-worklist-table',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (Presets.length || Searchable) {
            <div class="mjo-wl__toolbar">
                @if (Searchable) {
                    <div class="mj-search">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input
                            [value]="Search"
                            (input)="SearchChanged.emit($any($event.target).value)"
                            [placeholder]="SearchPlaceholder"
                            [attr.aria-label]="SearchPlaceholder">
                    </div>
                }

                @if (Presets.length) {
                    <div class="row wrap mjo-wl__presets" role="group" aria-label="Quick filters">
                        @for (preset of Presets; track preset.Key) {
                            <button
                                type="button"
                                class="mj-filter-chip"
                                [class.is-active]="preset.Key === ActivePreset"
                                [attr.aria-pressed]="preset.Key === ActivePreset"
                                (click)="PresetChanged.emit(preset.Key)">
                                @if (preset.Icon) {
                                    <i [class]="preset.Icon" aria-hidden="true"></i>
                                }
                                {{ preset.Label }}
                                @if (preset.Count) {
                                    <span class="count">{{ preset.Count }}</span>
                                }
                            </button>
                        }
                    </div>
                }
            </div>
        }

        <div class="mj-table-wrap">
            <table class="mj-table">
                <thead>
                    <tr>
                        @for (column of Columns; track column.Key) {
                            <th
                                [class.num]="column.Kind === 'money' || column.Kind === 'number'"
                                [class]="hideClass(column)"
                                [style.width]="column.Width">
                                @if (column.Sortable) {
                                    <span class="sortable" (click)="SortChanged.emit(column.Key)">
                                        {{ column.Label }}
                                        <i
                                            class="fa-solid"
                                            [class.fa-sort]="SortKey !== column.Key"
                                            [class.fa-sort-down]="SortKey === column.Key && SortDescending"
                                            [class.fa-sort-up]="SortKey === column.Key && !SortDescending"
                                            aria-hidden="true"></i>
                                    </span>
                                } @else {
                                    {{ column.Label }}
                                }
                            </th>
                        }
                    </tr>
                </thead>

                <tbody>
                    @for (row of Rows; track trackRow($index, row)) {
                        <tr
                            [class.is-clickable]="RowClicked.observed"
                            [class.is-selected]="isSelected(row)"
                            (click)="onRowClick(row)">
                            @for (column of Columns; track column.Key) {
                                <td
                                    [class.num]="column.Kind === 'money' || column.Kind === 'number'"
                                    [class.mono]="column.Kind === 'mono'"
                                    [class]="hideClass(column)">
                                    @if (column.Kind === 'chip') {
                                        <span class="mj-chip" [class]="column.ChipClass?.(row) ?? ''">
                                            {{ display(row, column) }}
                                        </span>
                                    } @else {
                                        {{ display(row, column) }}
                                    }
                                    @if (column.Secondary?.(row); as secondary) {
                                        <div class="secondary">{{ secondary }}</div>
                                    }
                                </td>
                            }
                        </tr>
                    } @empty {
                        <tr>
                            <td [attr.colspan]="Columns.length">
                                <div class="mj-empty mjo-wl__empty">
                                    <i [class]="EmptyIcon" aria-hidden="true"></i>
                                    <div class="t">{{ EmptyTitle }}</div>
                                    <div class="small">{{ EmptyHint }}</div>
                                </div>
                            </td>
                        </tr>
                    }
                </tbody>
            </table>
        </div>

        @if (FootNote) {
            <div class="small muted mjo-wl__note">{{ FootNote }}</div>
        }
    `,
    styles: [
        `
            .mjo-wl__toolbar {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                flex-wrap: wrap;
                margin-bottom: var(--mj-space-4);
            }
            .mjo-wl__presets {
                gap: 6px;
            }
            .mjo-wl__empty {
                padding: var(--mj-space-8);
            }
            .mjo-wl__note {
                margin-top: var(--mj-space-3);
            }

            /* Columns drop in a stated order rather than the table scrolling
               sideways and hiding data without admitting it. */
            @media (max-width: 1000px) {
                .mjo-hide-1000 { display: none; }
            }
            @media (max-width: 760px) {
                .mjo-hide-760 { display: none; }
            }
            @media (max-width: 560px) {
                .mjo-hide-560 { display: none; }
            }
        `,
    ],
})
export class MJOWorklistTableComponent<TRow extends Record<string, unknown> = Record<string, unknown>> {
    /** Column definitions, left to right. */
    @Input() Columns: MJOColumn<TRow>[] = [];

    /** The rows to render. Filtering and sorting happen in the query, not here. */
    @Input() Rows: TRow[] = [];

    /** Quick-filter chips. */
    @Input() Presets: MJOPreset[] = [];

    /** Which preset is active. */
    @Input() ActivePreset: string | null = null;

    /** Show the search box. */
    @Input() Searchable = true;

    /** Current search text — controlled by the host. */
    @Input() Search = '';

    @Input() SearchPlaceholder = 'Search…';

    /** Column key currently sorted by. */
    @Input() SortKey: string | null = null;

    @Input() SortDescending = true;

    /** Property naming a row's identity, for selection and tracking. */
    @Input() RowKey = 'ID';

    /** The selected row's key, if the host tracks one. */
    @Input() SelectedKey: string | null = null;

    @Input() EmptyTitle = 'Nothing matches';
    @Input() EmptyHint = 'Try a different filter, or clear the search.';
    @Input() EmptyIcon = 'fa-solid fa-magnifying-glass';

    /** Muted line under the table — where a stated caveat belongs. */
    @Input() FootNote: string | null = null;

    @Output() PresetChanged = new EventEmitter<string>();
    @Output() SearchChanged = new EventEmitter<string>();
    @Output() SortChanged = new EventEmitter<string>();
    @Output() RowClicked = new EventEmitter<TRow>();

    protected trackRow(index: number, row: TRow): unknown {
        return row[this.RowKey] ?? index;
    }

    protected isSelected(row: TRow): boolean {
        return this.SelectedKey != null && String(row[this.RowKey]) === this.SelectedKey;
    }

    protected onRowClick(row: TRow): void {
        if (this.RowClicked.observed) this.RowClicked.emit(row);
    }

    protected hideClass(column: MJOColumn<TRow>): string {
        return column.HideBelow ? `mjo-hide-${column.HideBelow}` : '';
    }

    /** A column's rendered value — its formatter if it has one, else the raw property. */
    protected display(row: TRow, column: MJOColumn<TRow>): string {
        if (column.Format) return column.Format(row);
        const value = row[column.Key];
        return value === null || value === undefined ? '—' : String(value);
    }
}
