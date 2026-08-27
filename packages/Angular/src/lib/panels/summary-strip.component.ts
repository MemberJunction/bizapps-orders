import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One figure in a summary strip. */
export interface MJOSummaryFigure {
    /** Small uppercase caption. */
    Label: string;
    /** Already formatted — the strip does not know whether this is money, a count or a date. */
    Value: string;
    /**
     * Tone for the value. `credit` renders in the credit colour and is the reason
     * this is not just a list of strings: a credit is money owed the other way,
     * and showing it in the same ink as a debt misreports the direction.
     */
    Tone?: 'default' | 'credit' | 'muted';
}

/**
 * `mjo-summary-strip` — a row of totals above a worklist.
 *
 * WHY A STRIP RATHER THAN MORE STAT TILES. Tiles are for the numbers a person
 * navigates BY; a strip is for the numbers that describe what is currently on
 * screen. Making them look the same would invite reading the list's subtotal as
 * a business-wide figure, which is exactly the mistake that makes someone chase
 * the wrong customer.
 *
 * The figures are supplied already formatted. This component owns layout and
 * tone, not arithmetic — a panel that formats money has an opinion about
 * rounding, and there should be one of those in this app, in money-format.ts.
 *
 * ## Example
 *
 * ```html
 * <mjo-summary-strip
 *   [Figures]="[
 *     { Label: 'Orders', Value: '19' },
 *     { Label: 'Total value', Value: '$43,647.34' },
 *     { Label: 'Credits held', Value: '−$335.00', Tone: 'credit' }
 *   ]"
 *   Note="Cheap counts over the filtered set — no on-demand aggregate work." />
 * ```
 */
@Component({
    selector: 'mjo-summary-strip',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mjo-strip">
            @for (figure of Figures; track figure.Label) {
                <div class="mjo-strip__figure">
                    <div class="mjo-strip__label">{{ figure.Label }}</div>
                    <div
                        class="mjo-strip__value mj-num"
                        [class.mj-money--credit]="figure.Tone === 'credit'"
                        [class.muted]="figure.Tone === 'muted'">
                        {{ figure.Value }}
                    </div>
                </div>
            }

            @if (Note) {
                <div class="mjo-strip__note small muted">{{ Note }}</div>
            }
        </div>
    `,
    styles: [
        `
            .mjo-strip {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: var(--mj-space-3, 10px);
                padding-top: var(--mj-space-3, 10px);
                margin-top: var(--mj-space-3, 10px);
                border-top: 1px solid var(--mj-border-default);
            }
            .mjo-strip__figure {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 8px 12px;
                border-radius: var(--mj-radius-md, 8px);
                background: var(--mj-bg-surface-sunken);
                border: 1px solid var(--mj-border-default);
                transition: border-color 0.15s ease;
                min-width: 0;
            }
            .mjo-strip__figure:hover {
                border-color: var(--mj-brand-primary, #38bdf8);
            }
            .mjo-strip__label {
                font-size: 10.5px;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: var(--mj-text-muted);
            }
            .mjo-strip__value {
                font-size: 16px;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
                color: var(--mj-text-primary);
            }
            .mjo-strip__note {
                grid-column: 1 / -1;
                font-size: 11px;
                color: var(--mj-text-muted);
                margin-top: 2px;
            }
        `,
    ],
})
export class MJOSummaryStripComponent {
    /** The figures, in reading order. */
    @Input() Figures: MJOSummaryFigure[] = [];

    /** Optional trailing note, right-aligned. */
    @Input() Note: string | null = null;
}
