import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    BuildOrderStages,
    MJOStageChangeRequestEventArgs,
    type MJOOrderStage,
    type MJOStepperStage,
} from './order-stages';

/* The lifecycle rules live in `order-stages.ts` — pure and testable without a
   rendering environment. Re-exported so a consumer importing the stepper gets
   them without a second import path. */
export { BuildOrderStages, MJOStageChangeRequestEventArgs };
export type { MJOOrderStage, MJOStepperStage };

/**
 * `mjo-status-stepper` — where an order is in its lifecycle, and where it can go.
 *
 * The stage ORDER is fixed and skipping FORWARD is legal: Draft straight to
 * Confirmed is a real thing people do. What is never legal is reaching a stage
 * without its prerequisites' effects, so `Posted` cannot be clicked from `Draft`.
 * Rather than hiding illegal moves, the stepper shows them disabled WITH THE
 * REASON, because "why can't I do that?" is the question a hidden control leaves
 * unanswered.
 *
 * Requesting a stage is CANCELABLE. Confirming books journal entries and is not
 * undoable, so a host can intercept and put a pre-flight review in front of it —
 * which is exactly what the order editor does.
 *
 * ## Example
 *
 * ```html
 * <mjo-status-stepper
 *   [Current]="order.Status"
 *   [Stages]="stages"
 *   (BeforeStageChange)="onBeforeStageChange($event)"
 *   (StageChanged)="applyStage($event)" />
 * ```
 *
 * ```typescript
 * onBeforeStageChange(e: MJOStageChangeRequestEventArgs): void {
 *   if (e.To === 'Confirmed') {
 *     e.Cancel = true;          // review first; the pre-flight confirms for real
 *     this.openPreflight();
 *   }
 * }
 * ```
 */
@Component({
    selector: 'mjo-status-stepper',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mj-stepper" role="group" [attr.aria-label]="'Order stage: ' + Current">
            @for (stage of Stages; track stage.Stage; let last = $last) {
                <button
                    type="button"
                    class="step"
                    [class.is-done]="indexOf(stage.Stage) < currentIndex"
                    [class.is-current]="stage.Stage === Current"
                    [class.is-blocked]="!stage.Reachable && stage.Stage !== Current"
                    [disabled]="!canRequest(stage)"
                    [attr.aria-current]="stage.Stage === Current ? 'step' : null"
                    [title]="stage.Note ?? ''"
                    (click)="request(stage)">
                    @if (indexOf(stage.Stage) < currentIndex) {
                        <i class="fa-solid fa-check" aria-hidden="true"></i>
                    }
                    {{ stage.Stage }}
                </button>

                @if (!last) {
                    <span class="sep" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>
                }
            }
        </div>
    `,
    styles: [
        `
            .mj-stepper .step {
                font-family: inherit;
            }
            .mj-stepper .step[disabled] {
                pointer-events: none;
            }
            /* Basic responsive: the stepper already wraps, but on a narrow screen
               the chevrons waste the width that the labels need. */
            @media (max-width: 560px) {
                .mj-stepper .sep {
                    display: none;
                }
            }
        `,
    ],
})
export class MJOStatusStepperComponent {
    /** Where the order is now. */
    @Input() Current: MJOOrderStage = 'Draft';

    /** The stages to render, in order. */
    @Input() Stages: MJOStepperStage[] = [];

    /** Display only — no stage is clickable. Used on read-only surfaces. */
    @Input() ReadOnly = false;

    /**
     * Fired BEFORE a stage change is applied. Set `Cancel = true` to stop it —
     * `StageChanged` then does not fire.
     */
    @Output() BeforeStageChange = new EventEmitter<MJOStageChangeRequestEventArgs>();

    /** Fired after a non-canceled request. Carries the requested stage. */
    @Output() StageChanged = new EventEmitter<MJOOrderStage>();

    protected get currentIndex(): number {
        return this.indexOf(this.Current);
    }

    protected indexOf(stage: MJOOrderStage): number {
        return this.Stages.findIndex((s) => s.Stage === stage);
    }

    protected canRequest(stage: MJOStepperStage): boolean {
        if (this.ReadOnly) return false;
        if (stage.Stage === this.Current) return false;
        return stage.Reachable;
    }

    protected request(stage: MJOStepperStage): void {
        if (!this.canRequest(stage)) return;
        const args = new MJOStageChangeRequestEventArgs(this.Current, stage.Stage);
        this.BeforeStageChange.emit(args);
        if (args.Cancel) return;
        this.StageChanged.emit(stage.Stage);
    }
}
