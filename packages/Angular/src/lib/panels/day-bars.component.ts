import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormatCompact, FormatMoney } from './money-format';

/** One column of the chart. */
export interface MJODayBar {
    /** Axis label under the bar — short, because seven of them share the width. */
    Label: string;
    Value: number;
    /** Emphasised. Used for today, which is the only column still changing. */
    Current?: boolean;
}

/**
 * `mjo-day-bars` — a few days of counts, as magnitudes to compare.
 *
 * BARS, NOT A LINE. Seven discrete days are quantities to compare against each
 * other, not a continuous quantity to trace. A line implies the values between
 * Tuesday and Wednesday mean something, and they do not.
 *
 * ONE HUE. The days are the categories, so colouring them differently would
 * encode nothing — it would look like information and carry none. Today is
 * emphasised with the same hue at full strength rather than a second colour,
 * because "not finished yet" is a state of one series, not a second series.
 *
 * NO LEGEND. A legend is for telling two series apart; there is one here, and the
 * heading already names it.
 *
 * Every bar carries its own label and a hover title, so the value is readable
 * without a y-axis — for seven columns an axis costs more space than it repays.
 *
 * ## Example
 *
 * ```html
 * <mjo-day-bars
 *   [Bars]="[{ Label: 'Mon', Value: 4 }, { Label: 'Tue', Value: 7, Current: true }]"
 *   Unit="orders" />
 * ```
 */
@Component({
    selector: 'mjo-day-bars',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mjo-days" role="img" [attr.aria-label]="AriaLabel">
            @for (bar of Bars; track bar.Label) {
                <div class="mjo-days__col" [title]="bar.Label + ': ' + money(bar.Value) + ' ' + Unit">
                    <span class="mjo-days__value tiny" [class.is-zero]="!bar.Value">
                        {{ compact(bar.Value) }}
                    </span>
                    <span class="mjo-days__track">
                        <span
                            class="mjo-days__bar"
                            [class.is-current]="bar.Current"
                            [class.is-zero]="!bar.Value"
                            [style.height.%]="heightOf(bar)"></span>
                    </span>
                    <span class="mjo-days__label tiny muted">{{ bar.Label }}</span>
                </div>
            }
        </div>

        @if (!Bars.length) {
            <div class="small muted">No orders in this window.</div>
        }
    `,
    styles: [
        `
            .mjo-days {
                display: flex;
                align-items: flex-end;
                gap: 4px;
                height: 112px;
                /* An axis. Without it the bars float in an empty box and the chart reads as
                   unfinished rather than as a low week. */
                border-bottom: 1px solid var(--mj-border-default);
                padding-bottom: var(--mj-space-1);
            }
            .mjo-days__col {
                flex: 1;
                min-width: 0;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                gap: 3px;
            }
            /* The bar scales against the TRACK, not the column. Putting the value
               label inside the column's own height would have made every bar
               shorter by the height of its label, so the tallest bar could never
               reach 100% and the axis would lie about the maximum. */
            .mjo-days__track {
                flex: 1;
                width: 100%;
                min-height: 0;
                display: flex;
                align-items: flex-end;
            }
            /* A bar shows RELATIVE size only; without this the chart says which day
               was biggest but never how big. Exact figures stay on hover and in the
               aria-label, so the abbreviation costs nothing. */
            .mjo-days__value {
                font-variant-numeric: tabular-nums;
                font-weight: var(--mj-font-semibold);
                color: var(--mj-text-secondary);
                line-height: 1;
                white-space: nowrap;
            }
            .mjo-days__value.is-zero { color: var(--mj-text-disabled); font-weight: var(--mj-font-medium); }
            .mjo-days__bar {
                display: block;
                width: 100%;
                /* Rounded at the data end only, anchored flat to the baseline —
                   rounding the base would lift the bar off the zero line. */
                border-radius: 4px 4px 0 0;
                background: color-mix(in srgb, var(--mj-brand-primary) 42%, transparent);
            }
            .mjo-days__bar.is-current { background: var(--mj-brand-primary); }
            /* A day with no orders still has to READ as a day with no orders. At 84px tall the
               1.5% floor is barely a pixel, so six empty days looked like a rendering failure
               with one lone block rather than a quiet week. Give zero its own muted tick. */
            .mjo-days__bar.is-zero {
                background: var(--mj-border-default);
                min-height: 3px;
            }
            .mjo-days__label { line-height: 1; }
        `,
    ],
})
export class MJODayBarsComponent {
    /** Columns, oldest first. */
    @Input() Bars: MJODayBar[] = [];

    /** What a value counts, for the hover title. */
    @Input() Unit = '';

    /**
     * The chart read aloud.
     *
     * `role="img"` hides the bars from assistive technology, so without this the
     * panel would be silent. Every value is stated rather than summarised — seven
     * numbers is short enough to read, and "trending up" is an interpretation the
     * reader should be allowed to make themselves.
     */
    protected get AriaLabel(): string {
        if (!this.Bars.length) return 'No orders in this window.';
        const parts = this.Bars.map((b) => `${b.Label} ${FormatMoney(b.Value)}`).join(', ');
        return `${this.Unit || 'Values'} by day: ${parts}.`;
    }

    /** The exact figure, for the hover title and the screen-reader summary. */
    protected money(value: number): string {
        return FormatMoney(value);
    }

    /** The abbreviated figure that fits above a narrow column. */
    protected compact(value: number): string {
        return FormatCompact(value);
    }

    /**
     * Bar height as a percentage of the tallest.
     *
     * A zero keeps a hairline rather than vanishing: an empty day is a fact worth
     * seeing, and a missing bar reads as missing data instead of as no orders.
     */
    protected heightOf(bar: MJODayBar): number {
        const max = Math.max(...this.Bars.map((b) => b.Value), 1);
        return Math.max((bar.Value / max) * 100, 1.5);
    }
}
