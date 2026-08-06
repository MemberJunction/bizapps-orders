import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormatMoney } from './money-format';

/** Open balance split by how late it is. */
export interface MJOAgingBuckets {
    Current: number;
    Days1To30: number;
    Days31To60: number;
    Days61Plus: number;
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
