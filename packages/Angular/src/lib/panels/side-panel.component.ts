/**
 * @fileoverview `mjo-side-panel` — the selected row, opened beside its list.
 *
 * A worklist row carries more than its columns show, and the acts on it (issue, send, attest) read
 * better next to its facts than in a toolbar above forty other rows. This is the frame for that: a
 * card with the row's name, an optional status chip, a close button, and whatever the page puts
 * inside. `mjo-side-panel__facts` lays out label and value pairs; `mjo-side-panel__actions` is the
 * button row at the foot. The list-beside-panel layout (`mjo-split`) is in `styles/orders-kit.css`,
 * since it wraps the list whether or not a panel is open.
 *
 * Escape closes it, unless the key was pressed in a field or a menu, where it belongs to that.
 *
 * ## Example
 *
 * ```html
 * <mjo-side-panel Icon="fa-solid fa-file-invoice" [Title]="row.OrderNumber" (Closed)="Selected = null">
 *   <dl class="mjo-side-panel__facts">
 *     <dt>Customer</dt><dd>{{ row.CustomerName }}</dd>
 *   </dl>
 *   <div class="mjo-side-panel__actions">
 *     <button mjButton variant="primary">Issue invoice</button>
 *   </div>
 * </mjo-side-panel>
 * ```
 *
 * @module @mj-biz-apps/orders-ng
 */
import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'mjo-side-panel',
    standalone: true,
    imports: [CommonModule],
    // The fact and action classes style what the host projects in, which an emulated scope cannot reach.
    encapsulation: ViewEncapsulation.None,
    template: `
        <aside class="mj-card mjo-side-panel" [attr.aria-label]="Title" (keydown.escape)="onEscape($event)">
            <div class="mj-card-head">
                @if (Icon) {
                    <i [class]="Icon" aria-hidden="true"></i>
                }
                <h3>{{ Title }}</h3>
                <span class="right">
                    @if (Chip) {
                        <span class="mjo-chip" [class]="ChipClass">{{ Chip }}</span>
                    }
                    <button type="button" class="mjo-side-panel__close" (click)="Closed.emit()" title="Close" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </span>
            </div>
            <div class="mj-card-pad">
                <ng-content />
            </div>
        </aside>
    `,
    styles: [
        `
            mjo-side-panel { display: block; }
            .mjo-side-panel { position: sticky; top: 0; }
            .mjo-side-panel__close {
                border: none;
                background: none;
                color: var(--mj-text-muted);
                cursor: pointer;
                padding: 4px 6px;
                border-radius: var(--mj-radius-sm, 4px);
            }
            .mjo-side-panel__close:hover, .mjo-side-panel__close:focus-visible { background: var(--mj-bg-surface-sunken); color: var(--mj-text-primary); outline: none; }
            .mjo-side-panel__facts {
                display: grid;
                grid-template-columns: max-content 1fr;
                column-gap: var(--mj-space-4);
                row-gap: 8px;
                margin: 0 0 var(--mj-space-4);
                font-size: 13px;
            }
            .mjo-side-panel__facts dt { color: var(--mj-text-muted); }
            .mjo-side-panel__facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
            .mjo-side-panel__amount { font-size: 22px; font-weight: var(--mj-font-bold, 700); font-variant-numeric: tabular-nums; margin-bottom: var(--mj-space-3); }
            .mjo-side-panel__actions { display: flex; flex-wrap: wrap; gap: var(--mj-space-2); }
            .mjo-side-panel__note { margin: var(--mj-space-3) 0 0; }
            .mjo-side-panel__link {
                font: inherit;
                padding: 0;
                border: none;
                background: none;
                color: var(--mj-brand-primary);
                cursor: pointer;
            }
            .mjo-side-panel__link:hover, .mjo-side-panel__link:focus-visible { text-decoration: underline; outline: none; }
        `,
    ],
})
export class MJOSidePanelComponent {
    @Input() Title = '';
    @Input() Icon: string | null = null;
    /** A status chip beside the title, and its variant class. */
    @Input() Chip: string | null = null;
    @Input() ChipClass = 'mjo-chip--outline';

    @Output() Closed = new EventEmitter<void>();

    protected onEscape(event: Event): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"]')) return;
        event.stopPropagation();
        this.Closed.emit();
    }
}
