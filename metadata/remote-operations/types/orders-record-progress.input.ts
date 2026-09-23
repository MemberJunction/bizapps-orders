/**
 * Input for `Orders.RecordProgress`.
 *
 * One attested progress observation on a percentage-of-completion order line (plan D90). The
 * percent is CUMULATIVE — "this much of the work is done" — and the operation posts the
 * difference from what is already recognised, so the same input reverses a backward slide.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRecordProgressInput {
    /** The order line being attested. Its product's revenue recognition type must be OnMeasurement. */
    OrderLineID: string;
    /** The period this observation governs, `YYYY-MM-DD`. Becomes the entry's EffectiveDate. One per line per date. */
    MeasurementDate: string;
    /** Cumulative fraction complete, 0..1 (0.7 = 70%). */
    PercentComplete: number;
    /** The progress method (a ProgressRecognitionDriver key). Defaults to the revenue recognition type's DriverClass — ManualAttestation. */
    MethodCode?: string;
    /** Optional quantitative inputs behind the percent, kept for audit. */
    MeasureNumerator?: number | null;
    MeasureDenominator?: number | null;
    /** Free text from the signer. */
    Notes?: string | null;
    /** Compute and return what WOULD post, writing nothing — for the confirmation step before finance commits. */
    Preview?: boolean;
    /**
     * SUPERSEDE: the posted observation this one replaces. It must be the line's latest observation
     * that is not already superseded, and the caller must hold `MJ.BizApps.Orders.Progress.Supersede`.
     * Nothing is edited: the replaced observation's recognition is reversed on its own date, and this
     * observation's catch-up is computed as if the replaced one had never posted. `MeasurementDate`
     * must then be after the observation before the replaced one — not after the replaced one — which
     * is what makes a mistyped future date recoverable.
     */
    SupersedesMeasurementID?: string | null;
}
