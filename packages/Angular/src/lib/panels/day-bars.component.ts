import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
                <div class="mjo-days__col" [title]="bar.Label + ': ' + bar.Value + ' ' + Unit">
                    <span
                        class="mjo-days__bar"
                        [class.is-current]="bar.Current"
                        [style.height.%]="heightOf(bar)"></span>
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
                height: 84px;
            }
            .mjo-days__col {
                flex: 1;
                min-width: 0;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                gap: 4px;
            }
            .mjo-days__bar {
                display: block;
                width: 100%;
                /* Rounded at the data end only, anchored flat to the baseline —
                   rounding the base would lift the bar off the zero line. */
                border-radius: 4px 4px 0 0;
                background: color-mix(in srgb, var(--mj-brand-primary) 42%, transparent);
            }
            .mjo-days__bar.is-current { background: var(--mj-brand-primary); }
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
        const parts = this.Bars.map((b) => `${b.Label} ${b.Value}`).join(', ');
        return `${this.Unit || 'Values'} by day: ${parts}.`;
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
