/**
 * Output for `Orders.ReplayCheckoutStep`.
 *
 * Outcome says what happened:
 *   Replayed          the step ran again; Status is how it ended
 *   AlreadySucceeded  the step had already succeeded, so nothing ran
 *   Refused           the step was not run (no record, not replayable, still running, not authorized)
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplayCheckoutStepOutput {
    /** True when the step is Succeeded after the call, whether it ran now or before. */
    Success: boolean;
    Outcome: 'Replayed' | 'AlreadySucceeded' | 'Refused';
    Message?: string;
    CheckoutSessionID?: string;
    StepName?: string;
    /** The step's Status after the call: Running, Succeeded or Failed. */
    Status?: string;
    /** The step's Attempts after the call. */
    Attempts?: number;
    /** The last attempt's error, when Status is Failed. */
    LastError?: string | null;
}
