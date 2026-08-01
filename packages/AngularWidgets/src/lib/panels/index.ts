/**
 * @fileoverview The Orders panel library — the shared vocabulary every screen is
 * assembled from.
 *
 * Two rules hold across all of it:
 *
 * 1. **Nothing here computes money.** Every derived figure arrives from an
 *    `Orders.*` operation. A component that did its own arithmetic would be a
 *    second implementation of the engine's rules, and the two would eventually
 *    disagree — as a *balanced* journal entry for the wrong amount, which nothing
 *    downstream can catch.
 * 2. **Colours and metrics come from `orders-kit.css`**, the canonical stylesheet
 *    the approved mockups also read. That is what makes the shipped UI and the
 *    mockups the same design rather than two designs kept in sync by discipline.
 *    A host app must load that stylesheet once, globally.
 *
 * Pure logic — formatting, lifecycle rules — lives in plain `.ts` files with no
 * Angular runtime import, so it is unit-testable without a rendering environment.
 *
 * @module @mj-biz-apps/orders-ng
 */

/* Pure — no Angular runtime. */
export * from './money-format';
export * from './order-stages';

/* Components. */
export * from './money-strip.component';
export * from './decomposition-ladder.component';
export * from './status-stepper.component';
export * from './chips.component';
export * from './aging-bar.component';
export * from './journal-entry-preview.component';

import { MJOMoneyStripComponent } from './money-strip.component';
import { MJODecompositionLadderComponent } from './decomposition-ladder.component';
import { MJOStatusStepperComponent } from './status-stepper.component';
import { MJOAgingBarComponent } from './aging-bar.component';
import { MJOJournalEntryPreviewComponent } from './journal-entry-preview.component';
import { MJO_CHIP_COMPONENTS } from './chips.component';
import { MJO_FORMAT_PIPES } from './money-format';

/**
 * Every panel and pipe, for a screen's `imports` array.
 *
 * ```typescript
 * @Component({ standalone: true, imports: [CommonModule, ...MJO_PANELS] })
 * ```
 *
 * Convenient rather than compulsory — importing only what a screen uses keeps its
 * dependency list honest, which matters more on the small screens than the large.
 */
export const MJO_PANELS = [
    MJOMoneyStripComponent,
    MJODecompositionLadderComponent,
    MJOStatusStepperComponent,
    MJOAgingBarComponent,
    MJOJournalEntryPreviewComponent,
    ...MJO_CHIP_COMPONENTS,
    ...MJO_FORMAT_PIPES,
] as const;
