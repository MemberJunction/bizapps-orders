import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { type DateCell } from '@mj-biz-apps/orders-entities';
import { DaysSince, FormatMoney } from './money-format';

/** Open balance split by how late it is. */
export interface MJOAgingBuckets {
    Current: number;
    Days1To30: number;
    Days31To60: number;
    Days61Plus: number;
}

/** A zeroed set of buckets, so no caller has to remember the four keys. */
export function EmptyAgingBuckets(): MJOAgingBuckets {
    return { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
}

/**
 * Which bucket a balance belongs in, as of a business day (bc-aidp-next-golive#361).
 *
 * THE AGE RULE, STATED ONCE. It was stated twice: the Customer A/R page bucketed inline, and the
 * Orders dashboard had four getters of its own whose first one swept everything up to thirty days
 * PAST DUE into a tile labelled "Current". The two screens then disagreed by the whole 1-30 band --
 * six and a half million of overdue money reported as current on one page and as late on the other.
 *
 * `Current` means NOT YET DUE, which is also why the bar's first segment is achromatic: not late is
 * not a severity. An order with no due date has no age and counts as current -- it is a question for
 * someone, but it is not a debt that has passed a date.
 *
 * @param dueDate - The day the balance is due; an entity's `Date` or an ISO string both read.
 * @param today - The business day as `YYYY-MM-DD`, normally `Today()`.
 */
export function AgingBucketOf(dueDate: DateCell, today: Date | string): keyof MJOAgingBuckets {
    const late = dueDate ? DaysSince(dueDate, today) : 0;
    if (late <= 0) return 'Current';
    if (late <= 30) return 'Days1To30';
    if (late <= 60) return 'Days31To60';
    return 'Days61Plus';
}

interface AgingSegment {
    Key: keyof MJOAgingBuckets;
    Label: string;
    Amount: number;
    Percent: number;
    ClassName: string;
    Colour: string;
}

/**
 * `mjo-aging-bar` — open balance by age, as one stacked bar plus a legend.
 *
 * THE ONLY PLACE IN THIS APP WHERE COLOUR ENCODES A VALUE, which is why the ramp
 * was chosen by running a palette validator rather than by eye. The first attempt
 * put `warning-700` next to `error-600` and measured ΔE 2.8 (deutan) / 9.9
 * (normal vision) between the 31–60 and 61+ buckets — the same colour for
 * everyone, not just colourblind readers. The shipped ramp measures ΔE 13.9 /
 * 19.8 on both the light and dark surfaces. See `mockups/PROVENANCE.md`.
 *
 * Two consequences of that validation are load-bearing here and should not be
 * "tidied away":
 *
 * - **The first step is achromatic on purpose.** "Not late" is not a severity, and
 *   giving it a hue would imply it is one.
 * - **Every segment carries its amount, and the legend repeats all four.** The
 *   amber step's contrast against the surface is below 3:1, and a visible label is
 *   what discharges that — the bar is a comparison aid, never the only way to read
 *   the number.
 *
 * ## Example
 *
 * ```html
 * <mjo-aging-bar [Buckets]="customer.Buckets" />
 * ```
 */
@Component({
    selector: 'mjo-aging-bar',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (total > 0) {
            <div class="mj-aging">
                <div
                    class="mj-aging-bar"
                    role="img"
                    [attr.aria-label]="ariaLabel">
                    @for (seg of segments; track seg.Key) {
                        <span
                            [class]="seg.ClassName"
                            [style.width.%]="seg.Percent"
                            [title]="seg.Label + ': ' + money(seg.Amount)">
                            @if (seg.Percent > 13) {
                                {{ money(seg.Amount) }}
                            }
                        </span>
                    }
                </div>

                <div class="mj-aging-legend">
                    @for (seg of allSegments; track seg.Key) {
                        <span>
                            <i [style.background]="seg.Colour" aria-hidden="true"></i>
                            {{ seg.Label }} {{ money(seg.Amount) }}
                        </span>
                    }
                </div>
            </div>
        } @else {
            <div class="small muted">{{ EmptyText }}</div>
        }
    `,
    styles: [
        `
            @media (max-width: 560px) {
                :host ::ng-deep .mj-aging-legend {
                    gap: var(--mj-space-2);
                }
                /* Amounts inside the segments become unreadable once the bar is
                   narrow; the legend still carries every number. */
                :host ::ng-deep .mj-aging-bar > span {
                    font-size: 0;
                }
            }
        `,
    ],
})
export class MJOAgingBarComponent {
    /** The four buckets. */
    @Input() Buckets: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };

    /** Shown when nothing is outstanding. */
    @Input() EmptyText = 'Nothing outstanding.';

    protected get total(): number {
        const b = this.Buckets;
        return b.Current + b.Days1To30 + b.Days31To60 + b.Days61Plus;
    }

    /** All four, for the legend — including empty ones, so the scale is stable. */
    protected get allSegments(): AgingSegment[] {
        const b = this.Buckets;
        const total = this.total || 1;
        const make = (
            Key: keyof MJOAgingBuckets,
            Label: string,
            ClassName: string,
            Colour: string,
        ): AgingSegment => ({
            Key,
            Label,
            ClassName,
            Colour,
            Amount: b[Key],
            Percent: (b[Key] / total) * 100,
        });
        return [
            make('Current', 'Current', 'b-cur', 'var(--mj-color-neutral-500)'),
            make('Days1To30', '1–30', 'b-30', 'var(--mj-color-warning-500)'),
            make('Days31To60', '31–60', 'b-60', 'var(--mj-color-error-500)'),
            // Was the literal #991b1b. Re-measured and switched to the token: the
            // step down is dE 26.6 -> 16.3 (normal) / 23.8 -> 15.5 (deuteranope),
            // still far above the ~2.3 JND, and a hardcoded hex cannot follow dark
            // mode or a rebrand the way the other three steps do. See orders-kit.css.
            make('Days61Plus', '61+', 'b-90', 'var(--mj-color-error-700)'),
        ];
    }

    /** Only the non-empty ones get a bar segment — a 0%-wide span is noise. */
    protected get segments(): AgingSegment[] {
        return this.allSegments.filter((s) => s.Amount > 0);
    }

    protected get ariaLabel(): string {
        return (
            `Open balance ${this.money(this.total)}, aged: ` +
            this.allSegments.map((s) => `${s.Label} ${this.money(s.Amount)}`).join(', ')
        );
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }
}
