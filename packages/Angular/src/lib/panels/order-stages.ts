/**
 * @fileoverview Order lifecycle rules — pure, no Angular.
 *
 * Separate from the stepper COMPONENT on purpose. These rules mirror what the
 * database triggers enforce, so they are the kind of logic that quietly diverges
 * from the server's view of the same question — which makes them exactly the
 * logic that should be unit-testable without a rendering environment. Importing
 * `@angular/common` into a test to check a state machine is a smell.
 *
 * It also means a non-Angular host can ask "what can this order do next?".
 *
 * @module @mj-biz-apps/orders-ng
 */

/** The fixed order stages. */
export type MJOOrderStage = 'Draft' | 'Quoted' | 'Confirmed' | 'Posted' | 'Fulfilled' | 'Voided';

/** One stage as the stepper renders it. */
export interface MJOStepperStage {
    Stage: MJOOrderStage;
    /** Whether this stage can be moved to from where the order is now. */
    Reachable: boolean;
    /**
     * Why it cannot be reached, or what reaching it does. Shown as a tooltip — a
     * disabled control that does not say why is just a dead end.
     */
    Note?: string | null;
}

/**
 * Fired before a stage change is applied. Set `Cancel = true` to stop it.
 *
 * Follows MJ's Before/After cancelable event pattern: the `Before*` event carries
 * a `Cancel` flag the listener flips, and the matching `After*` only fires on the
 * non-canceled path.
 */
export class MJOStageChangeRequestEventArgs {
    /** Set `true` to stop the move. `StageChanged` will not fire. */
    public Cancel = false;
    /** Free-form, for telemetry and debugging. */
    public CancelReason?: string;
    constructor(
        public readonly From: MJOOrderStage,
        public readonly To: MJOOrderStage,
    ) {}
}

/** The stage progression, excluding the terminal `Voided`. */
const STAGE_ORDER: MJOOrderStage[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'];

/**
 * The stage list for an order at a given status, with reachability applied and
 * every blocked stage carrying its reason.
 *
 * The rules, and why each is what it is:
 *
 * - **Forward skipping is legal.** Draft straight to Confirmed is a real thing
 *   people do; what is fixed is the ORDER of stages, not that each must be
 *   visited.
 * - **Posted is never a button.** It follows Confirmed near-instantly — it is an
 *   outcome of booking, not an action someone takes.
 * - **Fulfilled is never a button either.** It either auto-advances (nothing on
 *   the order ships) or comes from the fulfillment queue.
 * - **Nothing is reachable once confirmed.** After booking, corrections are
 *   reversing orders rather than status changes.
 * - **Voided is terminal** and reachable only from Draft or Quoted, so an order
 *   that reached it shows a single stage rather than a greyed-out progression
 *   implying it might still move.
 *
 * @param current Where the order is.
 * @param requiresFulfillment Whether any line must ship — changes only the
 *   explanation on `Fulfilled`, not its reachability.
 */
export function BuildOrderStages(
    current: MJOOrderStage,
    requiresFulfillment = false,
): MJOStepperStage[] {
    if (current === 'Voided') {
        return [
            { Stage: 'Voided', Reachable: false, Note: 'This unconfirmed order is currently voided.' },
            { Stage: 'Draft', Reachable: true, Note: 'Reopen as draft for editing.' },
            { Stage: 'Quoted', Reachable: true, Note: 'Reopen as quote.' },
        ];
    }

    const at = STAGE_ORDER.indexOf(current);

    return STAGE_ORDER.map((stage, i) => {
        if (i <= at) return { Stage: stage, Reachable: false, Note: null };

        switch (stage) {
            case 'Quoted':
                return {
                    Stage: stage,
                    Reachable: true,
                    Note: 'Optional — going straight to Confirmed is legal.',
                };
            case 'Confirmed':
                return {
                    Stage: stage,
                    Reachable: at < STAGE_ORDER.indexOf('Confirmed'),
                    Note: 'Books one journal entry per line. Fires exactly once, and is not undoable.',
                };
            case 'Posted':
                return {
                    Stage: stage,
                    Reachable: false,
                    Note: 'Reached by confirming — the entries land in the sub-ledger.',
                };
            case 'Fulfilled':
                return {
                    Stage: stage,
                    Reachable: false,
                    Note: requiresFulfillment
                        ? 'A line must ship — this advances from the fulfillment queue.'
                        : 'Auto-advances from Posted, because nothing on this order ships.',
                };
            default:
                return { Stage: stage, Reachable: false, Note: null };
        }
    });
}

/**
 * The verbs that actually apply to an order in a given state.
 *
 * Edit gating shows the state's REAL actions rather than a disabled Save: a
 * posted order offers "Create reversal", not a greyed-out edit control that
 * leaves the user guessing what they are allowed to do.
 */
export function ActionsForStage(current: MJOOrderStage): Array<{ Key: string; Label: string; Danger?: boolean }> {
    switch (current) {
        case 'Draft':
        case 'Quoted':
            return [
                { Key: 'save', Label: 'Save draft' },
                { Key: 'confirm', Label: 'Confirm order' },
                { Key: 'void', Label: 'Void', Danger: true },
            ];
        case 'Confirmed':
        case 'Posted':
        case 'Fulfilled':
            return [
                { Key: 'reverse', Label: 'Create reversal…' },
                { Key: 'payment', Label: 'Take payment' },
                { Key: 'document', Label: 'Bill' },
            ];
        case 'Voided':
            return [
                { Key: 'reopen-draft', Label: 'Reopen as draft' },
                { Key: 'reopen-quoted', Label: 'Reopen as quote' },
                { Key: 'document', Label: 'Bill' },
            ];
        default:
            return [];
    }
}
