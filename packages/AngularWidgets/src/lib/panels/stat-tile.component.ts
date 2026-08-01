import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One bar in a labelled proportion list. */
export interface MJOBarRow {
    Label: string;
    Value: number;
    /** Pre-formatted display value. The bar never formats money itself. */
    Display?: string;
}

/**
 * `mjo-stat-tile` — one number worth looking at.
 *
 * Dashboard tiles are CHEAP COUNTS or precomputed totals, never on-demand
 * aggregates. A dashboard that takes four seconds to answer "is today normal?"
 * gets closed, and then it answers nothing at all.
 *
 * The tile deliberately has no chart. A single number with a label is the right
 * form for a headline figure — adding a sparkline to every tile makes a page of
 * decoration where the eye should be finding one or two numbers that changed.
 * Where a trend genuinely matters, use `mjo-bar-list` beside it.
 *
 * ## Example
 *
 * ```html
 * <mjo-stat-tile
 *   Label="Overdue"
 *   Icon="fa-solid fa-hourglass-half"
 *   Value="$7,270"
 *   Detail="4 orders across 3 customers"
 *   Tone="alert"
 *   (Clicked)="goToWorklist()" />
 * ```
 */
@Component({
    selector: 'mjo-stat-tile',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="mj-stat"
            [class.is-alert]="Tone === 'alert'"
            [class.mjo-stat--clickable]="Clicked.observed"
            [attr.role]="Clicked.observed ? 'button' : null"
            [attr.tabindex]="Clicked.observed ? 0 : null"
            (click)="onClick()"
            (keydown.enter)="onClick()">
            <span class="l">
                @if (Icon) {
                    <i [class]="Icon" aria-hidden="true"></i>
                }
                {{ Label }}
            </span>
            <span class="v">{{ Value }}</span>
            @if (Detail) {
                <span class="d">{{ Detail }}</span>
            }
            <ng-content></ng-content>
        </div>
    `,
    styles: [
        `
            .mjo-stat--clickable {
                cursor: pointer;
            }
            .mjo-stat--clickable:hover {
                border-color: var(--mj-brand-primary);
            }
            .mjo-stat--clickable:focus-visible {
                outline: 2px solid var(--mj-border-focus);
                outline-offset: 2px;
            }
        `,
    ],
})
export class MJOStatTileComponent {
    /** What the number is. */
    @Input() Label = '';

    /** The number, already formatted — the tile does not format money. */
    @Input() Value = '—';

    /** One line of context under it. */
    @Input() Detail: string | null = null;

    @Input() Icon: string | null = null;

    /** `alert` colours the value as a problem. Use sparingly, or it stops meaning anything. */
    @Input() Tone: 'default' | 'alert' = 'default';

    /** The tile was activated. Only rendered interactive when something listens. */
    @Output() Clicked = new EventEmitter<void>();

    protected onClick(): void {
        if (this.Clicked.observed) this.Clicked.emit();
    }
}

/**
 * `mjo-bar-list` — labelled proportions, one hue.
 *
 * For "how does this break down" — tender mix, orders by status. Every row is
 * DIRECTLY LABELLED with its value, so the bar is a comparison aid rather than
 * the only way to read the number.
 *
 * ONE HUE, deliberately. The categories are already named on each row, so
 * colouring four labelled rows four different ways would look like an encoding
 * while encoding nothing. Colour is reserved for the one place in this app where
 * it carries a value — the aging ramp.
 *
 * ## Example
 *
 * ```html
 * <mjo-bar-list [Rows]="tenderMix" />
 * ```
 */
@Component({
    selector: 'mjo-bar-list',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mjo-bars">
            @for (row of Rows; track row.Label) {
                <div class="mjo-bars__row">
                    <span class="small muted mjo-bars__label">{{ row.Label }}</span>
                    <span class="mjo-bars__track">
                        <span class="mjo-bars__fill" [style.width.%]="percent(row)"></span>
                    </span>
                    <span class="small mj-num mjo-bars__value">{{ row.Display ?? row.Value }}</span>
                </div>
            } @empty {
                <div class="small muted">{{ EmptyText }}</div>
            }
        </div>
    `,
    styles: [
        `
            .mjo-bars {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2);
            }
            .mjo-bars__row {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
            }
            .mjo-bars__label {
                width: 88px;
                flex: none;
            }
            .mjo-bars__track {
                flex: 1;
                height: 8px;
                background: var(--mj-bg-surface-sunken);
                border-radius: var(--mj-radius-full);
                overflow: hidden;
            }
            .mjo-bars__fill {
                display: block;
                height: 100%;
                background: var(--mj-brand-primary);
                border-radius: var(--mj-radius-full);
            }
            .mjo-bars__value {
                width: 82px;
                flex: none;
                text-align: right;
            }
            @media (max-width: 560px) {
                .mjo-bars__label {
                    width: 68px;
                }
                .mjo-bars__value {
                    width: 68px;
                }
            }
        `,
    ],
})
export class MJOBarListComponent {
    @Input() Rows: MJOBarRow[] = [];

    @Input() EmptyText = 'Nothing to show.';

    protected percent(row: MJOBarRow): number {
        const max = Math.max(...this.Rows.map((r) => r.Value), 1);
        return (row.Value / max) * 100;
    }
}
