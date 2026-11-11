/**
 * @fileoverview `mjo-multi-select` — a compact "pick several" dropdown for narrowing a list.
 *
 * MJ's `mj-dropdown` picks one value and `mj-filter-panel`'s multi mode renders chips, which is
 * right for three options and wrong for fourteen products. This is the piece in between: a trigger
 * that reads like a field ("Company · All", "Company · 2 of 7"), and a panel of checkboxes with a
 * count beside each, a search box once the list is long, and a Clear link. It owns no data: the
 * host passes the options and the selection and hears the new selection back.
 *
 * The options carry a count because a filter is a question about the data ("how many of these are
 * Blue Cypress?"), and answering it before the click saves the click.
 *
 * ## Example
 *
 * ```html
 * <mjo-multi-select
 *   Label="Company"
 *   Icon="fa-solid fa-building"
 *   [Options]="CompanyOptions"
 *   [Selected]="Facets.Companies"
 *   (SelectedChange)="OnCompanies($event)" />
 * ```
 *
 * @module @mj-biz-apps/orders-ng
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';

/** One choice in the panel. `Count` is how many rows carry it, shown beside the name. */
export interface MJOMultiSelectOption {
    Value: string;
    Text: string;
    Count?: number;
}

@Component({
    selector: 'mjo-multi-select',
    standalone: true,
    imports: [CommonModule, OverlayModule],
    template: `
        <button
            type="button"
            class="mjo-ms__trigger"
            [class.mjo-ms__trigger--active]="Selected.length > 0"
            [class.mjo-ms__trigger--open]="IsOpen"
            cdkOverlayOrigin
            #origin="cdkOverlayOrigin"
            (click)="Toggle()"
            [attr.aria-expanded]="IsOpen"
            [attr.aria-label]="Label + ': ' + Summary"
            aria-haspopup="listbox">
            @if (Icon) {
                <i [class]="Icon" aria-hidden="true"></i>
            }
            <span class="mjo-ms__label">{{ Label }}</span>
            <span class="mjo-ms__value">{{ Summary }}</span>
            <i class="fa-solid fa-chevron-down mjo-ms__caret" aria-hidden="true"></i>
        </button>

        <ng-template
            cdkConnectedOverlay
            [cdkConnectedOverlayOrigin]="origin"
            [cdkConnectedOverlayOpen]="IsOpen"
            [cdkConnectedOverlayPositions]="Positions"
            [cdkConnectedOverlayHasBackdrop]="true"
            cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
            (backdropClick)="Close()"
            (detach)="Close()"
            (overlayKeydown)="OnKey($event)">
            <div class="mjo-ms__panel" role="group" [attr.aria-label]="Label">
                @if (Options.length > SearchThreshold) {
                    <div class="mjo-search mjo-ms__search">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input
                            type="text"
                            [value]="Filter"
                            (input)="Filter = $any($event.target).value"
                            [placeholder]="'Find a ' + Label.toLowerCase() + '…'"
                            [attr.aria-label]="'Find a ' + Label.toLowerCase()" />
                    </div>
                }
                <div class="mjo-ms__head">
                    <span class="small muted">{{ Selected.length ? Selected.length + ' of ' + Options.length + ' selected' : 'Showing all ' + Options.length }}</span>
                    @if (Selected.length) {
                        <button type="button" class="mjo-ms__link" (click)="Clear()">Clear</button>
                    }
                </div>
                <ul class="mjo-ms__list" role="listbox" aria-multiselectable="true">
                    @for (option of FilteredOptions; track option.Value) {
                        <li role="option" [attr.aria-selected]="IsTicked(option.Value)">
                            <label class="mjo-ms__option">
                                <input type="checkbox" [checked]="IsTicked(option.Value)" (change)="Toggle(option.Value, $any($event.target).checked)" />
                                <span class="mjo-ms__text">{{ option.Text }}</span>
                                @if (option.Count != null) {
                                    <span class="mjo-ms__count" [class.mjo-ms__count--none]="option.Count === 0">{{ option.Count }}</span>
                                }
                            </label>
                        </li>
                    } @empty {
                        <li class="small muted mjo-ms__empty">Nothing matches "{{ Filter }}"</li>
                    }
                </ul>
            </div>
        </ng-template>
    `,
    styles: [
        `
            :host { display: inline-block; }
            .mjo-ms__trigger {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2);
                font: inherit;
                font-size: 13px;
                padding: 5px 10px;
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface);
                color: inherit;
                cursor: pointer;
                max-width: 280px;
            }
            .mjo-ms__trigger:hover, .mjo-ms__trigger--open { border-color: var(--mj-border-strong); }
            .mjo-ms__trigger--active { border-color: var(--mj-brand-primary); }
            .mjo-ms__trigger i { color: var(--mj-text-muted); font-size: 12px; }
            .mjo-ms__label { color: var(--mj-text-muted); }
            .mjo-ms__value {
                font-weight: var(--mj-font-medium);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .mjo-ms__trigger--active .mjo-ms__value { color: var(--mj-brand-primary); }
            .mjo-ms__caret { font-size: 10px; }

            .mjo-ms__panel {
                min-width: 260px;
                max-width: 360px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                box-shadow: var(--mj-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
                padding: var(--mj-space-2);
            }
            .mjo-ms__search { min-width: 0; margin-bottom: var(--mj-space-2); }
            .mjo-ms__head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 2px 6px 6px;
            }
            .mjo-ms__link {
                font: inherit;
                font-size: 12px;
                border: none;
                background: none;
                color: var(--mj-brand-primary);
                cursor: pointer;
                padding: 0;
            }
            .mjo-ms__list {
                list-style: none;
                margin: 0;
                padding: 0;
                max-height: 320px;
                overflow: auto;
            }
            .mjo-ms__option {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                padding: 6px;
                border-radius: var(--mj-radius-sm, 4px);
                cursor: pointer;
                font-size: 13px;
            }
            .mjo-ms__option:hover { background: var(--mj-bg-surface-sunken); }
            .mjo-ms__text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mjo-ms__count {
                font-variant-numeric: tabular-nums;
                font-size: 12px;
                color: var(--mj-text-muted);
                background: var(--mj-bg-surface-sunken);
                border-radius: 999px;
                padding: 0 7px;
            }
            .mjo-ms__count--none { opacity: 0.5; }
            .mjo-ms__empty { padding: 8px 6px; }
        `,
    ],
})
export class MJOMultiSelectComponent {
    /** The dimension being narrowed: "Company", "Product". */
    @Input() Label = '';
    @Input() Icon: string | null = null;
    @Input() Options: MJOMultiSelectOption[] = [];
    /** The ticked values. The host owns it; this component only proposes the next one. */
    @Input() Selected: ReadonlyArray<string> = [];
    /** A search box appears once there are more options than this. */
    @Input() SearchThreshold = 8;

    @Output() SelectedChange = new EventEmitter<string[]>();

    public IsOpen = false;
    public Filter = '';

    public readonly Positions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
    ];

    /** "All", the one name when one is ticked, else "2 of 7". */
    public get Summary(): string {
        if (!this.Selected.length) return 'All';
        if (this.Selected.length === 1) {
            const only = this.Options.find((o) => o.Value === this.Selected[0]);
            if (only) return only.Text;
        }
        return `${this.Selected.length} of ${this.Options.length}`;
    }

    public get FilteredOptions(): MJOMultiSelectOption[] {
        const needle = this.Filter.trim().toLowerCase();
        return needle ? this.Options.filter((o) => o.Text.toLowerCase().includes(needle)) : this.Options;
    }

    public IsTicked(value: string): boolean {
        return this.Selected.includes(value);
    }

    /** Toggle one value; or, with one argument, open/close the panel. */
    public Toggle(value?: string, ticked?: boolean): void {
        if (value === undefined) {
            this.IsOpen = !this.IsOpen;
            if (!this.IsOpen) this.Filter = '';
            return;
        }
        const on = ticked ?? !this.IsTicked(value);
        const next = on ? [...this.Selected.filter((v) => v !== value), value] : this.Selected.filter((v) => v !== value);
        this.SelectedChange.emit(next);
    }

    public Clear(): void {
        if (this.Selected.length) this.SelectedChange.emit([]);
    }

    public Close(): void {
        this.IsOpen = false;
        this.Filter = '';
    }

    public OnKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.Close();
        }
    }
}
