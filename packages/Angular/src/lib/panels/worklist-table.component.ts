import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJEmptyStateComponent, MJFilterChipComponent } from '@memberjunction/ng-ui-components';

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
    /** A `mjo-chip`; `ChipClass` picks the variant. */
    | 'chip'
    /** Monospace — document numbers and references. */
    | 'mono'
    /** Monospace, and a link: clicking it raises `LinkClicked` instead of selecting the row. */
    | 'link';

/**
 * A column definition.
 *
 * Generic for AUTHORING — a consumer writes `MJOColumn<MyRow>[]` and gets typed
 * `Format`/`Secondary` callbacks. It defaults to `any` because Angular cannot
 * propagate a component's generic through a template binding, so the component's
 * own inputs must stay loose; keeping the parameter here is what preserves type
 * safety at the only place it can actually be checked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface MJOColumn<TRow = any> {
    /** Property on the row, and the column's identity for sorting. */
    Key: string;
    Label: string;
    Kind?: MJOColumnKind;
    /** Fixed width, e.g. `'110px'`. Omit to let it flex. */
    Width?: string;
    /** Whether the header offers sorting. Index-limited in practice, so opt-in. */
    Sortable?: boolean;
    /** What the column sorts on, when that is not the raw property (a computed or looked-up value). */
    SortValue?: (row: TRow) => string | number | null | undefined;
    /** Muted second line under the value. */
    Secondary?: (row: TRow) => string | null;
    /** Chip variant class for `Kind: 'chip'`. */
    ChipClass?: (row: TRow) => string;
    /** Hide below this viewport width — the responsive drop order. */
    HideBelow?: 560 | 760 | 1000;
    /** Render the value differently from the raw property. */
    Format?: (row: TRow) => string;
    /** For `Kind: 'link'`: the tooltip on the link, saying what it opens. */
    LinkHint?: string;
}

/** A quick-filter chip above the table. */
export interface MJOPreset {
    Key: string;
    Label: string;
    /** Shown in brackets after the label. Omit — or pass 0 — to show none. */
    Count?: number | null;
    Icon?: string;
}

/**
 * A worklist row. Loosely typed because Angular cannot propagate a component's
 * generic through a template binding — the type safety that matters lives on
 * {@link MJOColumn}, where the callbacks are actually authored.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MJORow = any;

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
 * TICKING IS SEPARATE FROM CLICKING. With `Selectable` on, each row gains a
 * checkbox and the header a tick-all for the rows on screen; ticking changes
 * `SelectedKeys` and emits `SelectionChanged`, and never fires `RowClicked`, so
 * a page can keep a side panel on the clicked row while a batch builds up. The
 * host owns the set: a preset change narrows what is on screen, not what is
 * ticked, and `SelectableRow` lets it say which rows may be ticked at all.
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
    imports: [CommonModule, MJFilterChipComponent, MJEmptyStateComponent],
    template: `
        @if (Presets.length || Searchable) {
            <div class="mjo-wl__toolbar">
                @if (Searchable) {
                    <div class="mjo-search">
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
                            <!-- A zero count is left off, as before: "(0)" on a preset reads as an error. -->
                            <mj-filter-chip
                                [Label]="preset.Label"
                                [Icon]="preset.Icon ?? null"
                                [Count]="preset.Count || null"
                                [Active]="preset.Key === ActivePreset"
                                (Clicked)="PresetChanged.emit(preset.Key)" />
                        }
                    </div>
                }
            </div>
        }

        <div class="mj-table-wrap" [style.max-height]="MaxHeight">
            <table class="mj-table" [attr.aria-busy]="Loading ? 'true' : null">
                <thead>
                    <tr>
                        @if (Selectable) {
                            <th class="mjo-wl__tick">
                                <input
                                    type="checkbox"
                                    [checked]="allVisibleSelected()"
                                    [indeterminate]="someVisibleSelected()"
                                    [disabled]="!selectableRows().length"
                                    (change)="toggleAll($any($event.target).checked)"
                                    aria-label="Select every row shown">
                            </th>
                        }
                        @for (column of Columns; track column.Key) {
                            <th
                                [class.num]="column.Kind === 'money' || column.Kind === 'number'"
                                [class]="hideClass(column)"
                                [style.width]="column.Width"
                                [attr.aria-sort]="column.Sortable ? sortState(column) : null">
                                @if (column.Sortable) {
                                    <span
                                        class="sortable mjo-wl__sort"
                                        [class.is-sorted]="SortKey === column.Key"
                                        role="button"
                                        tabindex="0"
                                        [attr.title]="'Sort by ' + column.Label.toLowerCase()"
                                        (click)="SortChanged.emit(column.Key)"
                                        (keydown.enter)="SortChanged.emit(column.Key)"
                                        (keydown.space)="$event.preventDefault(); SortChanged.emit(column.Key)">
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
                    @if (Loading && !Rows.length) {
                        <!-- Placeholder rows while the first read is out: an empty state here would say "nothing", which is not known yet. -->
                        @for (bone of skeleton; track bone) {
                            <tr class="mjo-wl__bone-row" aria-hidden="true">
                                @if (Selectable) {
                                    <td class="mjo-wl__tick"></td>
                                }
                                @for (column of Columns; track column.Key) {
                                    <td [class]="hideClass(column)"><span class="mjo-wl__bone" [style.width.%]="40 + ((bone * 17 + $index * 29) % 50)"></span></td>
                                }
                            </tr>
                        }
                    }
                    @for (row of Rows; track trackRow($index, row)) {
                        <tr
                            [class.is-clickable]="RowClicked.observed"
                            [class.is-selected]="isSelected(row)"
                            [attr.tabindex]="RowClicked.observed ? rowTabIndex(row, $index) : null"
                            [attr.aria-current]="isSelected(row) ? 'true' : null"
                            (keydown)="onRowKey($event, row)"
                            (click)="onRowClick(row)">
                            @if (Selectable) {
                                <td class="mjo-wl__tick" (click)="$event.stopPropagation()">
                                    @if (canSelect(row)) {
                                        <input
                                            type="checkbox"
                                            [checked]="isTicked(row)"
                                            (change)="toggle(row, $any($event.target).checked)"
                                            [attr.aria-label]="rowLabel(row)">
                                    }
                                </td>
                            }
                            @for (column of Columns; track column.Key) {
                                <td
                                    [class.num]="column.Kind === 'money' || column.Kind === 'number'"
                                    [class.mono]="column.Kind === 'mono' || column.Kind === 'link'"
                                    [class]="hideClass(column)">
                                    @if (column.Kind === 'chip') {
                                        <span class="mjo-chip" [class]="column.ChipClass?.(row) ?? ''">
                                            {{ display(row, column) }}
                                        </span>
                                    } @else if (column.Kind === 'link' && LinkClicked.observed) {
                                        <button
                                            type="button"
                                            class="mjo-wl__link"
                                            [attr.title]="column.LinkHint ?? null"
                                            (click)="$event.stopPropagation(); LinkClicked.emit({ Row: row, Key: column.Key })">
                                            {{ display(row, column) }}
                                        </button>
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
                        <tr [hidden]="Loading">
                            <td [attr.colspan]="Columns.length + (Selectable ? 1 : 0)">
                                <mj-empty-state
                                    Size="compact"
                                    [Icon]="EmptyIcon"
                                    [Title]="EmptyTitle"
                                    [Message]="EmptyHint" />
                            </td>
                        </tr>
                    }
                </tbody>
                @if (Totals && Rows.length) {
                    <tfoot>
                        <tr class="mjo-wl__total">
                            @if (Selectable) {
                                <td class="mjo-wl__tick"></td>
                            }
                            @for (column of Columns; track column.Key) {
                                <td [class.num]="column.Kind === 'money' || column.Kind === 'number'" [class]="hideClass(column)">{{ Totals[column.Key] || '' }}</td>
                            }
                        </tr>
                    </tfoot>
                }
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
            .mjo-wl__note {
                margin-top: var(--mj-space-3);
            }
            .mjo-wl__tick {
                width: 36px;
                text-align: center;
            }
            .mjo-wl__sort {
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
            }
            .mjo-wl__sort:hover i, .mjo-wl__sort.is-sorted i { opacity: 1; }
            .mjo-wl__sort.is-sorted { color: var(--mj-text-primary); }
            .mjo-wl__sort:focus-visible {
                outline: 2px solid var(--mj-brand-primary);
                outline-offset: 2px;
                border-radius: 2px;
            }
            .mjo-wl__link {
                /* The cell is already monospace; the link takes its face from it. */
                font: inherit;
                padding: 0;
                border: none;
                background: none;
                color: var(--mj-brand-primary);
                cursor: pointer;
            }
            .mjo-wl__link:hover, .mjo-wl__link:focus-visible { text-decoration: underline; outline: none; }
            tr[tabindex]:focus-visible { outline: 2px solid var(--mj-brand-primary); outline-offset: -2px; }
            /* The totals stay in view at the foot of a list that scrolls inside its frame, as the header does at its top. */
            .mjo-wl__total td {
                position: sticky;
                bottom: 0;
                z-index: 1;
                padding: var(--mj-space-3);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-top: 2px solid var(--mj-border-strong);
                font-weight: var(--mj-font-semibold);
                white-space: nowrap;
            }
            .mjo-wl__total td.num { text-align: right; font-variant-numeric: tabular-nums; }
            .mjo-wl__bone {
                display: inline-block;
                height: 10px;
                border-radius: 5px;
                background: var(--mj-bg-surface-sunken);
                animation: mjo-wl-pulse 1.2s ease-in-out infinite;
            }
            @keyframes mjo-wl-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.45; }
            }
            @media (prefers-reduced-motion: reduce) {
                .mjo-wl__bone { animation: none; }
            }
            .mjo-wl__tick input {
                cursor: pointer;
                margin: 0;
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
export class MJOWorklistTableComponent implements OnChanges {
    /** Column definitions, left to right. */
    @Input() Columns: MJOColumn[] = [];

    /** The rows to render, already filtered and sorted by the host: this table orders nothing itself. */
    @Input() Rows: MJORow[] = [];

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

    /** Show a checkbox per row and a tick-all in the header. */
    @Input() Selectable = false;

    /** The ticked rows' keys. Owned by the host; the table only proposes changes through `SelectionChanged`. */
    @Input() SelectedKeys: ReadonlyArray<string> = [];

    /** Which rows may be ticked. Omit for every row. A row this refuses shows no checkbox. */
    @Input() SelectableRow: ((row: MJORow) => boolean) | null = null;

    /**
     * What a row's checkbox is called to assistive technology, in words a person would use (a number
     * and a name). Omit to label it with the row's key, which is only readable when the key is one.
     */
    @Input() RowLabel: ((row: MJORow) => string) | null = null;

    @Input() EmptyTitle = 'Nothing matches';
    @Input() EmptyHint = 'Try a different filter, or clear the search.';
    @Input() EmptyIcon = 'fa-solid fa-magnifying-glass';

    /** Muted line under the table — where a stated caveat belongs. */
    @Input() FootNote: string | null = null;

    /** A read is running. With no rows yet, placeholder rows are shown in place of the empty state. */
    @Input() Loading = false;

    /**
     * A totals row at the foot, keyed by column: `{ CustomerName: '12 installments', Amount: '$4,200.00' }`.
     * The host works the figures out, since it knows which rows they cover. Omit for no totals row.
     */
    @Input() Totals: Record<string, string> | null = null;

    /**
     * The tallest the list may grow before it scrolls inside its own frame, as a CSS length. With one
     * set, the column headings and the totals stay in view while the rows scroll. Omit to let the list
     * grow with its rows.
     */
    @Input() MaxHeight: string | null = null;

    @Output() PresetChanged = new EventEmitter<string>();
    @Output() SearchChanged = new EventEmitter<string>();
    @Output() SortChanged = new EventEmitter<string>();
    @Output() RowClicked = new EventEmitter<MJORow>();
    /** A `Kind: 'link'` cell was clicked: the row, and which column. The row is not selected by it. */
    @Output() LinkClicked = new EventEmitter<{ Row: MJORow; Key: string }>();

    /** Placeholder rows for the first load. */
    protected readonly skeleton = [0, 1, 2, 3, 4, 5];

    /** The full set of ticked keys after a change — never a delta, so the host cannot drift from the table. */
    @Output() SelectionChanged = new EventEmitter<string[]>();

    protected trackRow(index: number, row: MJORow): unknown {
        return row[this.RowKey] ?? index;
    }

    protected isSelected(row: MJORow): boolean {
        return this.SelectedKey != null && String(row[this.RowKey]) === this.SelectedKey;
    }

    protected onRowClick(row: MJORow): void {
        if (this.RowClicked.observed) this.RowClicked.emit(row);
    }

    /** Whether the open row is among the rows listed. Worked out when the inputs change, not once per row per pass. */
    private openRowListed = false;

    public ngOnChanges(): void {
        this.openRowListed = this.SelectedKey != null && this.Rows.some((row) => this.isSelected(row));
    }

    /**
     * The ROWS are one tab stop, not one each: the open row, or the first when none is open, with the
     * arrow keys moving between them. A row's own controls (its checkbox, its link) are still reached
     * by Tab, as controls are.
     */
    protected rowTabIndex(row: MJORow, index: number): number {
        if (this.openRowListed) return this.isSelected(row) ? 0 : -1;
        return index === 0 ? 0 : -1;
    }

    /**
     * Keys on a focused row: Enter or Space selects it, the arrows move to the row above or below.
     * A key pressed inside a control in the row (its checkbox, its link) belongs to that control.
     */
    protected onRowKey(event: Event, row: MJORow): void {
        if (event.target !== event.currentTarget) return;
        const key = (event as KeyboardEvent).key;
        const element = event.currentTarget as HTMLElement;
        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            this.onRowClick(row);
        } else if (key === 'ArrowDown' || key === 'ArrowUp') {
            const next = (key === 'ArrowDown' ? element.nextElementSibling : element.previousElementSibling) as HTMLElement | null;
            if (next?.hasAttribute('tabindex')) {
                event.preventDefault();
                next.focus();
            }
        }
    }

    protected keyOf(row: MJORow): string {
        return String(row[this.RowKey]);
    }

    protected rowLabel(row: MJORow): string {
        return this.RowLabel ? this.RowLabel(row) : `Select ${row[this.RowKey] ?? ''}`;
    }

    protected canSelect(row: MJORow): boolean {
        return this.SelectableRow ? this.SelectableRow(row) : true;
    }

    protected isTicked(row: MJORow): boolean {
        return this.SelectedKeys.includes(this.keyOf(row));
    }

    /** The rows on screen that may be ticked. */
    protected selectableRows(): MJORow[] {
        return this.Rows.filter((row) => this.canSelect(row));
    }

    protected allVisibleSelected(): boolean {
        const rows = this.selectableRows();
        return rows.length > 0 && rows.every((row) => this.isTicked(row));
    }

    protected someVisibleSelected(): boolean {
        const rows = this.selectableRows();
        return rows.some((row) => this.isTicked(row)) && !rows.every((row) => this.isTicked(row));
    }

    protected toggle(row: MJORow, ticked: boolean): void {
        const key = this.keyOf(row);
        const next = new Set(this.SelectedKeys);
        if (ticked) next.add(key);
        else next.delete(key);
        this.SelectionChanged.emit([...next]);
    }

    /**
     * Tick or untick every selectable row ON SCREEN. Rows a preset has hidden keep their state: a
     * tick-all that silently cleared ticks the user could not see would be a surprise either way.
     */
    protected toggleAll(ticked: boolean): void {
        const visible = this.selectableRows().map((row) => this.keyOf(row));
        const next = new Set(this.SelectedKeys);
        for (const key of visible) {
            if (ticked) next.add(key);
            else next.delete(key);
        }
        this.SelectionChanged.emit([...next]);
    }

    /** A sortable header's `aria-sort`: which way it is sorted, or that it is not. */
    protected sortState(column: MJOColumn): 'ascending' | 'descending' | 'none' {
        if (this.SortKey !== column.Key) return 'none';
        return this.SortDescending ? 'descending' : 'ascending';
    }

    protected hideClass(column: MJOColumn): string {
        return column.HideBelow ? `mjo-hide-${column.HideBelow}` : '';
    }

    /** A column's rendered value — its formatter if it has one, else the raw property. */
    protected display(row: MJORow, column: MJOColumn): string {
        if (column.Format) return column.Format(row);
        const value = row[column.Key];
        return value === null || value === undefined ? '—' : String(value);
    }
}
