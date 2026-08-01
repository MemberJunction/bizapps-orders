import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOMoneyPipe } from './money-format';

/** One row of the ladder. */
export interface MJOLadderRow {
    Label: string;
    Amount: number;
    /** Indented sub-row — a promotion under Discounts, a layer under Tax. */
    IsSub?: boolean;
    /** Renders in the credit colour. Discounts and promotions use this. */
    IsCredit?: boolean;
    /** The final, heavier row. */
    IsTotal?: boolean;
    /** Muted right-hand annotation, e.g. "6.25% on $385.00". */
    Detail?: string | null;
    /**
     * The rule that produced this number, revealed on demand.
     *
     * A bare number is never acceptable in this app: every derived figure carries
     * its provenance, because the engine's whole value is the computation and
     * hiding it makes the app feel arbitrary.
     */
    Why?: string | null;
    /** Rendered greyed with an em-dash amount — an offered-not-applied promotion. */
    IsInactive?: boolean;
}

/**
 * `mjo-decomposition-ladder` — how an order's total was arrived at.
 *
 * The centrepiece of order entry. It shows the engine's own decomposition in the
 * engine's own order — list → promotions → net → charges → tax layers → gross —
 * with every row expandable to the rule behind it.
 *
 * IT COMPUTES NOTHING. Rows are handed in from `Orders.PreviewOrder`. A ladder
 * that did its own arithmetic would be a second implementation of the pricing
 * rules living next to the engine, and the two would eventually disagree — as a
 * balanced journal entry for the wrong amount, which nothing downstream catches.
 *
 * `Stale` is why this component exists rather than a plain list: a server round
 * trip means there is a moment where the numbers on screen are no longer the
 * numbers for the draft in hand, and showing stale money as though it were
 * current is exactly the failure the design is against.
 *
 * ## Example
 *
 * ```html
 * <mjo-decomposition-ladder
 *   [Rows]="ladderRows"
 *   [Stale]="draft.IsPreviewStale"
 *   [Footnote]="'Subtotal 1,600 − discounts 40 + charges 25 + tax 36.57 = 1,621.57'" />
 * ```
 */
@Component({
    selector: 'mjo-decomposition-ladder',
    standalone: true,
    imports: [CommonModule, MJOMoneyPipe],
    template: `
        <div class="mj-ladder" [class.mjo-ladder--stale]="Stale" [attr.aria-busy]="Stale">
            @for (row of Rows; track $index) {
                <div
                    class="mj-ladder-row"
                    [class.is-sub]="row.IsSub"
                    [class.is-discount]="row.IsCredit"
                    [class.is-total]="row.IsTotal">
                    <span class="label">
                        {{ row.Label }}
                        @if (row.Detail) {
                            <span class="muted">{{ row.Detail }}</span>
                        }
                        @if (row.Why) {
                            <button
                                type="button"
                                class="mj-why"
                                [attr.aria-expanded]="expanded.has($index)"
                                [attr.aria-label]="'Why is ' + row.Label + ' this amount?'"
                                (click)="toggle($index)">
                                <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                            </button>
                        }
                    </span>
                    <span class="amt" [class.muted]="row.IsInactive">
                        @if (row.IsInactive) {
                            —
                        } @else {
                            {{ row.IsCredit ? '−' : '' }}{{ row.Amount | mjoMoney: { Sign: 'absolute' } }}
                        }
                    </span>
                </div>

                @if (row.Why && expanded.has($index)) {
                    <div class="mj-why-body" [innerHTML]="row.Why"></div>
                }
            }

            @if (Footnote) {
                <div class="mj-ladder-note">
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    <span>{{ Footnote }}</span>
                </div>
            }

            @if (!Rows.length) {
                <div class="small muted mjo-ladder__empty">{{ EmptyText }}</div>
            }
        </div>
    `,
    styles: [
        `
            /* Recomputing: dim without collapsing, so the layout does not jump and
               the previous figures stay legible as context. Announcing aria-busy
               is what tells a screen reader the numbers are in flight. */
            .mjo-ladder--stale {
                opacity: 0.55;
                transition: opacity 0.12s ease;
            }
            .mjo-ladder__empty {
                padding: var(--mj-space-4) 0;
            }
            @media (max-width: 720px) {
                :host ::ng-deep .mj-ladder-row .muted {
                    display: block;
                }
            }
        `,
    ],
})
export class MJODecompositionLadderComponent {
    /** The rows, in engine order. */
    @Input() Rows: MJOLadderRow[] = [];

    /**
     * The draft has changed since these numbers were computed. Dims the ladder
     * and marks it busy rather than showing figures that no longer apply.
     */
    @Input() Stale = false;

    /** The arithmetic restated in one line, under the total. */
    @Input() Footnote: string | null = null;

    /** Shown when there is nothing to decompose yet. */
    @Input() EmptyText = 'Add a line to see what this order comes to.';

    protected readonly expanded = new Set<number>();

    protected toggle(index: number): void {
        if (this.expanded.has(index)) this.expanded.delete(index);
        else this.expanded.add(index);
    }
}
