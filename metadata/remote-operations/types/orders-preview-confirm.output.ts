/**
 * Output for `Orders.PreviewConfirm` — everything the confirm pre-flight renders.
 *
 * `CanConfirm` is the single question the button reads. It is false when any
 * blocker is present, and a blocker names the rule that failed and where to fix
 * it. Approvals are NOT blockers: a discount over the rep's authority escalates,
 * so it appears in `Approvals` while `CanConfirm` stays true.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPreviewConfirmOutput {
    Success: boolean;
    Message?: string;
    /** The button's authority. False iff `Blockers` is non-empty. */
    CanConfirm: boolean;
    Totals?: OrderTotalsResult;
    /** One per line, grouped by company for display. Each carries its own balanced check. */
    JournalEntries: JournalEntryPreview[];
    /** Whether each company's entry balances, and the count — the summary chip. */
    EntryCount: number;
    CompanyCount: number;
    AllBalanced: boolean;
    /** Extend vs create, with the proration note when a partial period scaled a quantity. */
    SubscriptionDecisions: SubscriptionDecisionPreview[];
    /** Grants that would issue, with resolved timing / quantity / validity policy. */
    EntitlementGrants: EntitlementGrantPreview[];
    /** Sales rules that would escalate. Present does NOT mean blocked. */
    Approvals: ApprovalRequirementPreview[];
    /** Lines that will hold the order at Posted because they must ship. */
    FulfillmentHolds?: Array<{ LineNumber: number; ProductName: string; Quantity: number }>;
    /** Set when the order carries an initial-payment intent that would capture. */
    InitialPayment?: {
        PaymentTypeName: string;
        Amount: number;
        ProcessingFeeAmount?: number | null;
        InstrumentSummary?: string | null;
    };
    /** Why the confirm cannot proceed. Empty when `CanConfirm` is true. */
    Blockers: BlockerResult[];
}
