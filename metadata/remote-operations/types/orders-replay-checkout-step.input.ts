/**
 * Input for `Orders.ReplayCheckoutStep`.
 *
 * Names one post-payment step of one checkout session, as recorded in CheckoutSessionStep.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplayCheckoutStepInput {
    /** The checkout session whose step is replayed. */
    CheckoutSessionID: string;
    /** The step to replay: 'Capture' or 'Confirm'. Only Capture is replayable today. */
    StepName: string;
}
