/**
 * Output for `Orders.PollExternalPayments`.
 *
 * One outcome per payment considered. `ATTENTION` means the pass completed but left Unmatched or
 * ReversalNeeded rows a person must look at — reported as Success false so a job that notifies only
 * on failure tells somebody.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExternalPaymentOutcome {
    PaymentProviderID: string;
    ExternalPaymentRef: string;
    Amount: number;
    ExternalStatus: string | null;
    Disposition: 'Captured' | 'Held' | 'Unmatched' | 'Refused' | 'Ignored' | 'ReversalNeeded';
    Reason: string;
    PaymentNumber?: string | null;
    PaymentHeaderID?: string | null;
}

export interface OrdersPollExternalPaymentsOutput {
    Success: boolean;
    Message?: string;
    ResultCode: 'COMPLETED' | 'PREVIEWED' | 'ATTENTION' | 'NO_PROVIDERS' | 'ERROR';
    Captured: number;
    Held: number;
    Unmatched: number;
    /** Orders.CapturePayment refused the capture (split-company order, ambiguous payer, configuration). Counts as attention. */
    Refused: number;
    ReversalNeeded: number;
    Ignored: number;
    Outcomes: ExternalPaymentOutcome[];
    NewWatermarks: Array<{ PaymentProviderID: string; Watermark: string | null }>;
    PreviewedOnly: boolean;
}
