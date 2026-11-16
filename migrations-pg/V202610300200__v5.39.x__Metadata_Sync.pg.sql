-- =============================================================================================
-- PostgreSQL counterpart of V202610300200__v5.39.x__Metadata_Sync.sql -- BizApps Orders v5.39.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file
--     was generated from. Each record is a DO block that calls the core function, in whichever
--     signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones, block for block, as in V202610142258:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Every assignment matches the T-SQL file (strings verbatim, BIT 1/0 as TRUE/FALSE); checked
--     one by one.
--   * Core calls use ${mjSchema}.
--   * Every block was checked to parse and compile on postgres:16.
-- =============================================================================================

SET standard_conforming_strings = on;
-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_74de733d8bf3 UUID;
  p_Name_74de733d8bf3 VARCHAR(255);
  p_OperationKey_74de733d8bf3 VARCHAR(255);
  p_CategoryID_74de733d8bf3 UUID;
  p_Description_74de733d8bf3 TEXT;
  p_InputTypeName_74de733d8bf3 VARCHAR(255);
  p_InputTypeDefinition_74de733d8bf3 TEXT;
  p_InputTypeIsArray_74de733d8bf3 BOOLEAN;
  p_OutputTypeName_74de733d8bf3 VARCHAR(255);
  p_OutputTypeDefinition_74de733d8bf3 TEXT;
  p_OutputTypeIsArray_74de733d8bf3 BOOLEAN;
  p_ExecutionMode_74de733d8bf3 VARCHAR(20);
  p_RequiredScope_74de733d8bf3 VARCHAR(255);
  p_RequiresSystemUser_74de733d8bf3 BOOLEAN;
  p_GenerationType_74de733d8bf3 VARCHAR(20);
  p_Code_74de733d8bf3 TEXT;
  p_CodeApprovalStatus_74de733d8bf3 VARCHAR(20);
  p_CodeApprovedByUserID_74de733d8bf3 UUID;
  p_CodeApprovedAt_74de733d8bf3 TIMESTAMPTZ;
  p_ContractFingerprint_74de733d8bf3 VARCHAR(100);
  p_Status_74de733d8bf3 VARCHAR(20);
  p_CacheTTLSeconds_74de733d8bf3 INTEGER;
  p_TimeoutMS_74de733d8bf3 INTEGER;
  p_MaxConcurrency_74de733d8bf3 INTEGER;
  p_CodeLocked_74de733d8bf3 BOOLEAN;
  p_CodeComments_74de733d8bf3 TEXT;
  p_Libraries_74de733d8bf3 TEXT;
BEGIN
  p_ID_74de733d8bf3 := 'D5846A2A-1667-4887-910E-EC4BA6E7DE15';
  p_Name_74de733d8bf3 := 'Replace Payment Schedule';
  p_OperationKey_74de733d8bf3 := 'Orders.ReplacePaymentSchedule';
  p_CategoryID_74de733d8bf3 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305';
  p_Description_74de733d8bf3 := 'Set an order''s payment schedule to a supplied list of rows (due date, amount, description). Instalments already invoiced, paid or written off must appear in the list with the same due date and amount and are kept unchanged; a list that changes or drops one is refused. The remaining rows replace the order''s Scheduled rows, numbered by due date, and must tie to the order''s lines by the same check confirm and invoicing run. A confirmed order billed in full without a schedule cannot be given one, and a confirmed order billed by its schedule cannot have it removed. An instalment not yet invoiced that a payment names cannot be removed, re-dated or lowered below what is paid on it. The order''s status is re-read under a lock inside the transaction, so a confirm that lands in between is honoured. All or none; the same list sent twice writes nothing. Preview reports the result without writing.';
  p_InputTypeName_74de733d8bf3 := 'OrdersReplacePaymentScheduleInput';
  p_InputTypeDefinition_74de733d8bf3 := '/**
 * One instalment as the caller wants it on the order.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ReplacePaymentScheduleRow {
    /** Exactly `YYYY-MM-DD`; any other form is refused. */
    DueDate: string;
    /** A number greater than zero; rounded to the cent. */
    Amount: number;
    /** Up to 500 characters. */
    Description?: string | null;
}

/**
 * Input for `Orders.ReplacePaymentSchedule`.
 *
 * `Rows` is the whole schedule the order should have, in any order. Instalments already invoiced must
 * be in the list unchanged (same due date and amount) and keep their numbers; the operation numbers
 * the remaining rows by due date, using the numbers those instalments do not hold. An empty list
 * removes the schedule, which bills the order as one instalment.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplacePaymentScheduleInput {
    OrderHeaderID: string;
    Rows: ReplacePaymentScheduleRow[];
    /** Check and report what the schedule would be, and write nothing. */
    Preview?: boolean;
}
';
  p_InputTypeIsArray_74de733d8bf3 := FALSE;
  p_OutputTypeName_74de733d8bf3 := 'OrdersReplacePaymentScheduleOutput';
  p_OutputTypeDefinition_74de733d8bf3 := '/**
 * Why `Orders.ReplacePaymentSchedule` refused. Nothing is written on any refusal.
 *
 * - `INVALID_ORDER_ID` — `OrderHeaderID` is not a UUID.
 * - `INVALID_ROW` — a row has no valid due date, no amount above zero, or too long a description.
 * - `NOT_FOUND` / `READ_FAILED` — the order could not be found or read.
 * - `ORDER_VOIDED` — a voided order''s schedule does not change.
 * - `PER_COMPANY_SCHEDULE` — the order still bills by a schedule per product company.
 * - `INVOICED_ROW_CHANGED` — an invoiced, paid or written-off instalment is missing from the list
 *   or has a different due date or amount.
 * - `PAID_ROW_CHANGED` — a not-yet-invoiced instalment that a payment names would be removed, moved to
 *   another due date, or lowered below what is paid on it.
 * - `BILLED_WITHOUT_SCHEDULE` — the order was confirmed with no schedule and billed in full.
 * - `SCHEDULE_REQUIRED` — the order is confirmed and billed by its schedule, which cannot be removed.
 * - `TIE_FAILED` — the rows do not add up to the order''s lines.
 * - `WRITE_FAILED` — a save failed; the transaction was rolled back.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type ReplacePaymentScheduleCode =
    | ''INVALID_ORDER_ID''
    | ''INVALID_ROW''
    | ''NOT_FOUND''
    | ''READ_FAILED''
    | ''ORDER_VOIDED''
    | ''PER_COMPANY_SCHEDULE''
    | ''INVOICED_ROW_CHANGED''
    | ''PAID_ROW_CHANGED''
    | ''BILLED_WITHOUT_SCHEDULE''
    | ''SCHEDULE_REQUIRED''
    | ''TIE_FAILED''
    | ''WRITE_FAILED'';

/** One instalment of the order''s schedule after the call. */
export interface ReplacedPaymentScheduleRow {
    /** Null only on a preview, for a row that would be created. */
    OrderHeaderPaymentScheduleID: string | null;
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    Status: string;
    DocumentNumber?: string | null;
    /** True for an invoiced, paid or written-off instalment kept exactly as it was. */
    Kept: boolean;
}

/**
 * Output for `Orders.ReplacePaymentSchedule`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplacePaymentScheduleOutput {
    Success: boolean;
    Message?: string;
    /** Set on a refusal. */
    Code?: ReplacePaymentScheduleCode | null;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    /** The schedule after the call (or, on a preview, as it would be), by instalment number. */
    Rows: ReplacedPaymentScheduleRow[];
    /** Instalments already invoiced and kept unchanged. */
    Kept: number;
    /** Rows created or changed. */
    Written: number;
    /** Scheduled rows deleted. */
    Removed: number;
    /** False when the order already had this schedule and nothing was written. */
    Changed: boolean;
    WasPreview: boolean;
}
';
  p_OutputTypeIsArray_74de733d8bf3 := FALSE;
  p_ExecutionMode_74de733d8bf3 := 'Sync';
  p_RequiredScope_74de733d8bf3 := 'orders:write';
  p_RequiresSystemUser_74de733d8bf3 := FALSE;
  p_GenerationType_74de733d8bf3 := 'Manual';
  p_CodeApprovalStatus_74de733d8bf3 := 'Approved';
  p_Status_74de733d8bf3 := 'Active';
  p_CodeLocked_74de733d8bf3 := FALSE;
  p_CategoryID_74de733d8bf3 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Receivables' ORDER BY CASE WHEN "ID" = p_CategoryID_74de733d8bf3 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_74de733d8bf3);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
               WHERE "ID" = p_ID_74de733d8bf3 OR "OperationKey" = p_OperationKey_74de733d8bf3) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
      'ID', p_ID_74de733d8bf3,
      'Name', p_Name_74de733d8bf3,
      'OperationKey', p_OperationKey_74de733d8bf3,
      'CategoryID', p_CategoryID_74de733d8bf3,
      'Description', p_Description_74de733d8bf3,
      'InputTypeName', p_InputTypeName_74de733d8bf3,
      'InputTypeDefinition', p_InputTypeDefinition_74de733d8bf3,
      'InputTypeIsArray', p_InputTypeIsArray_74de733d8bf3,
      'OutputTypeName', p_OutputTypeName_74de733d8bf3,
      'OutputTypeDefinition', p_OutputTypeDefinition_74de733d8bf3,
      'OutputTypeIsArray', p_OutputTypeIsArray_74de733d8bf3,
      'ExecutionMode', p_ExecutionMode_74de733d8bf3,
      'RequiredScope', p_RequiredScope_74de733d8bf3,
      'RequiresSystemUser', p_RequiresSystemUser_74de733d8bf3,
      'GenerationType', p_GenerationType_74de733d8bf3,
      'Code', p_Code_74de733d8bf3,
      'CodeApprovalStatus', p_CodeApprovalStatus_74de733d8bf3,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_74de733d8bf3,
      'CodeApprovedAt', p_CodeApprovedAt_74de733d8bf3,
      'ContractFingerprint', p_ContractFingerprint_74de733d8bf3,
      'Status', p_Status_74de733d8bf3,
      'CacheTTLSeconds', p_CacheTTLSeconds_74de733d8bf3,
      'TimeoutMS', p_TimeoutMS_74de733d8bf3,
      'MaxConcurrency', p_MaxConcurrency_74de733d8bf3,
      'CodeLocked', p_CodeLocked_74de733d8bf3,
      'CodeComments', p_CodeComments_74de733d8bf3,
      'Libraries', p_Libraries_74de733d8bf3
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_74de733d8bf3, p_Name := p_Name_74de733d8bf3, p_OperationKey := p_OperationKey_74de733d8bf3, p_CategoryID := p_CategoryID_74de733d8bf3, p_Description := p_Description_74de733d8bf3, p_InputTypeName := p_InputTypeName_74de733d8bf3, p_InputTypeDefinition := p_InputTypeDefinition_74de733d8bf3, p_InputTypeIsArray := p_InputTypeIsArray_74de733d8bf3, p_OutputTypeName := p_OutputTypeName_74de733d8bf3, p_OutputTypeDefinition := p_OutputTypeDefinition_74de733d8bf3, p_OutputTypeIsArray := p_OutputTypeIsArray_74de733d8bf3, p_ExecutionMode := p_ExecutionMode_74de733d8bf3, p_RequiredScope := p_RequiredScope_74de733d8bf3, p_RequiresSystemUser := p_RequiresSystemUser_74de733d8bf3, p_GenerationType := p_GenerationType_74de733d8bf3, p_Code := p_Code_74de733d8bf3, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_74de733d8bf3, p_CodeApprovedByUserID := p_CodeApprovedByUserID_74de733d8bf3, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_74de733d8bf3, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_74de733d8bf3, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_74de733d8bf3, p_CacheTTLSeconds := p_CacheTTLSeconds_74de733d8bf3, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_74de733d8bf3, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_74de733d8bf3, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_74de733d8bf3, p_CodeComments := p_CodeComments_74de733d8bf3, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_74de733d8bf3, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_4bc6c477fd41 VARCHAR(255);
  p_OperationKey_4bc6c477fd41 VARCHAR(255);
  p_CategoryID_4bc6c477fd41 UUID;
  p_Description_4bc6c477fd41 TEXT;
  p_InputTypeName_4bc6c477fd41 VARCHAR(255);
  p_InputTypeDefinition_4bc6c477fd41 TEXT;
  p_InputTypeIsArray_4bc6c477fd41 BOOLEAN;
  p_OutputTypeName_4bc6c477fd41 VARCHAR(255);
  p_OutputTypeDefinition_4bc6c477fd41 TEXT;
  p_OutputTypeIsArray_4bc6c477fd41 BOOLEAN;
  p_ExecutionMode_4bc6c477fd41 VARCHAR(20);
  p_RequiredScope_4bc6c477fd41 VARCHAR(255);
  p_RequiresSystemUser_4bc6c477fd41 BOOLEAN;
  p_GenerationType_4bc6c477fd41 VARCHAR(20);
  p_Code_4bc6c477fd41 TEXT;
  p_CodeApprovalStatus_4bc6c477fd41 VARCHAR(20);
  p_CodeApprovedByUserID_4bc6c477fd41 UUID;
  p_CodeApprovedAt_4bc6c477fd41 TIMESTAMPTZ;
  p_ContractFingerprint_4bc6c477fd41 VARCHAR(100);
  p_Status_4bc6c477fd41 VARCHAR(20);
  p_CacheTTLSeconds_4bc6c477fd41 INTEGER;
  p_TimeoutMS_4bc6c477fd41 INTEGER;
  p_MaxConcurrency_4bc6c477fd41 INTEGER;
  p_CodeLocked_4bc6c477fd41 BOOLEAN;
  p_CodeComments_4bc6c477fd41 TEXT;
  p_Libraries_4bc6c477fd41 TEXT;
  p_ID_4bc6c477fd41 UUID;
BEGIN
  p_Name_4bc6c477fd41 := 'Cancel Subscription';
  p_OperationKey_4bc6c477fd41 := 'Orders.CancelSubscription';
  p_CategoryID_4bc6c477fd41 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304';
  p_Description_4bc6c477fd41 := 'Cancel a subscription: policy in, reversal out. The subscription type''s cancellation mode, refund mode and grace period decide when coverage ends, when access ends and what is refunded; the operation emits the reversal order, stamps the term and logs the lifecycle event in one transaction. Grace extends ACCESS, never revenue — storing one in place of the other silently revokes access early. When a payment gateway bills the subscription, the gateway is read first and cancelled first: the cancel is refused, with nothing changed, when the gateway cannot be read, has started a billing period Orders has not booked (its renewal on the term''s last day), does not confirm, or an open gateway alert says another gateway subscription may be billing; a cancel the gateway already completed is recorded.';
  p_InputTypeName_4bc6c477fd41 := 'CancelSubscriptionInput';
  p_InputTypeDefinition_4bc6c477fd41 := '/**
 * Input for `Orders.CancelSubscription`.
 *
 * Policy in, reversal out. The caller supplies a subscription, a date and a reason;
 * the subscription type''s cancellation mode, refund mode and grace decide the rest.
 * The mechanic underneath is a negative-quantity order line — correct double-entry
 * and terrible data entry, which is exactly why it is computed from a date and a
 * policy rather than typed.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface CancelSubscriptionInput {
    SubscriptionID: string;
    /** When the customer asked. Defaults to today. The RULES decide when coverage actually ends. */
    RequestDate?: string;
    /** Free text, stored on the lifecycle event. */
    Reason?: string;
    /**
     * When coverage ends, chosen by the person cancelling. `Immediate` ends coverage and access on
     * the request day; `EndOfTerm` ends them on the term''s last day. A chosen timing drops the type''s
     * grace. Absent, the subscription type''s cancellation mode and grace decide. Refund mode never
     * changes.
     */
    Timing?: ''Immediate'' | ''EndOfTerm'';
    /**
     * Return the decision WITHOUT writing anything — for a confirmation screen that shows
     * "you will be refunded $X, coverage ends Y" before the user commits.
     */
    Preview?: boolean;
}
';
  p_InputTypeIsArray_4bc6c477fd41 := FALSE;
  p_OutputTypeName_4bc6c477fd41 := 'CancelSubscriptionOutput';
  p_OutputTypeDefinition_4bc6c477fd41 := '/**
 * Output for `Orders.CancelSubscription`.
 *
 * `Decision` is the wire-safe projection of the engine''s decision: dates are ISO
 * strings rather than `Date`, because that is what crosses the transport anyway and
 * a contract that pretends otherwise lies to its client.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** What the subscription type''s rules decided. Present even on a preview. */
export interface CancellationDecisionResult {
    /** When coverage ends for revenue purposes. Never before the request, never after the term. */
    EffectiveDate: string;
    /** When ACCESS ends — effective date plus grace. Grace extends access, NOT revenue. */
    AccessThroughDate: string;
    /** What to give back. 0 under NoRefund, and never more than the term charged. */
    RefundAmount: number;
    /** Fraction of the term to reverse; the reversal line''s quantity is its negative. */
    ReversalFraction: number;
    /** `Canceled` when coverage is cut short, `Completed` when the term simply runs out. */
    TermStatus: ''Canceled'' | ''Completed'';
    /** Which rules produced this, in a sentence — surfaced to the user, so it names the policy. */
    Explanation: string;
}

export interface CancelSubscriptionOutput {
    Success: boolean;
    Message?: string;
    Decision?: CancellationDecisionResult;
    /** The term that was (or would be) cancelled. */
    SubscriptionTermID?: string;
    /**
     * Terms that start after coverage ends — a renewal already booked, say — and are (or would be)
     * cancelled and reversed with it. Empty when there are none. Present even on a preview.
     */
    LaterTerms?: CanceledLaterTermResult[];
    /** `Decision.RefundAmount` plus every later term''s refund — the whole refund the cancel gives. */
    TotalRefundAmount?: number;
    /** The reversal order, when one was needed. Absent when nothing was refunded. */
    ReversalOrderID?: string;
    ReversalOrderNumber?: string;
    /**
     * What the cancel did (or, on a preview, will do) at the payment gateway that bills the
     * subscription. Absent when no gateway bills it.
     */
    Gateway?: CancelGatewayResult;
}

/** A later term cancelled alongside the affected one. */
export interface CanceledLaterTermResult {
    SubscriptionTermID: string;
    TermNumber: number;
    Decision: CancellationDecisionResult;
}

/**
 * The payment gateway''s part of a cancel, when a gateway bills the subscription. The gateway is
 * asked before Orders writes anything; if it does not confirm, the cancel fails and nothing changes.
 */
export interface CancelGatewayResult {
    /** The gateway''s subscription id (Stripe `sub_...`). */
    ProviderSubscriptionID: string;
    /** `Now`: the gateway stops billing today. `EndOfCoverage`: it charges nothing after coverage ends. */
    When: ''Now'' | ''EndOfCoverage'';
    /** ISO instant after which the gateway charges nothing. */
    BillingEndsAt?: string;
    /** The gateway''s answer. Absent on a preview. */
    Outcome?: ''CanceledNow'' | ''EndsAtPeriodEnd'' | ''EndsAt'' | ''AlreadyEnded'' | ''AlreadyEnding'';
}
';
  p_OutputTypeIsArray_4bc6c477fd41 := FALSE;
  p_ExecutionMode_4bc6c477fd41 := 'Sync';
  p_RequiredScope_4bc6c477fd41 := 'orders:subscriptions:write';
  p_RequiresSystemUser_4bc6c477fd41 := FALSE;
  p_GenerationType_4bc6c477fd41 := 'Manual';
  p_CodeApprovalStatus_4bc6c477fd41 := 'Approved';
  p_Status_4bc6c477fd41 := 'Active';
  p_CodeLocked_4bc6c477fd41 := FALSE;
  p_ID_4bc6c477fd41 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C408';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_4bc6c477fd41,
    'OperationKey', p_OperationKey_4bc6c477fd41,
    'CategoryID', p_CategoryID_4bc6c477fd41,
    'Description', p_Description_4bc6c477fd41,
    'InputTypeName', p_InputTypeName_4bc6c477fd41,
    'InputTypeDefinition', p_InputTypeDefinition_4bc6c477fd41,
    'InputTypeIsArray', p_InputTypeIsArray_4bc6c477fd41,
    'OutputTypeName', p_OutputTypeName_4bc6c477fd41,
    'OutputTypeDefinition', p_OutputTypeDefinition_4bc6c477fd41,
    'OutputTypeIsArray', p_OutputTypeIsArray_4bc6c477fd41,
    'ExecutionMode', p_ExecutionMode_4bc6c477fd41,
    'RequiredScope', p_RequiredScope_4bc6c477fd41,
    'RequiresSystemUser', p_RequiresSystemUser_4bc6c477fd41,
    'GenerationType', p_GenerationType_4bc6c477fd41,
    'Code', p_Code_4bc6c477fd41,
    'CodeApprovalStatus', p_CodeApprovalStatus_4bc6c477fd41,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_4bc6c477fd41,
    'CodeApprovedAt', p_CodeApprovedAt_4bc6c477fd41,
    'ContractFingerprint', p_ContractFingerprint_4bc6c477fd41,
    'Status', p_Status_4bc6c477fd41,
    'CacheTTLSeconds', p_CacheTTLSeconds_4bc6c477fd41,
    'TimeoutMS', p_TimeoutMS_4bc6c477fd41,
    'MaxConcurrency', p_MaxConcurrency_4bc6c477fd41,
    'CodeLocked', p_CodeLocked_4bc6c477fd41,
    'CodeComments', p_CodeComments_4bc6c477fd41,
    'Libraries', p_Libraries_4bc6c477fd41,
    'ID', p_ID_4bc6c477fd41
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_4bc6c477fd41, p_OperationKey := p_OperationKey_4bc6c477fd41, p_CategoryID := p_CategoryID_4bc6c477fd41, p_Description := p_Description_4bc6c477fd41, p_InputTypeName := p_InputTypeName_4bc6c477fd41, p_InputTypeDefinition := p_InputTypeDefinition_4bc6c477fd41, p_InputTypeIsArray := p_InputTypeIsArray_4bc6c477fd41, p_OutputTypeName := p_OutputTypeName_4bc6c477fd41, p_OutputTypeDefinition := p_OutputTypeDefinition_4bc6c477fd41, p_OutputTypeIsArray := p_OutputTypeIsArray_4bc6c477fd41, p_ExecutionMode := p_ExecutionMode_4bc6c477fd41, p_RequiredScope := p_RequiredScope_4bc6c477fd41, p_RequiresSystemUser := p_RequiresSystemUser_4bc6c477fd41, p_GenerationType := p_GenerationType_4bc6c477fd41, p_Code := p_Code_4bc6c477fd41, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_4bc6c477fd41, p_CodeApprovedByUserID := p_CodeApprovedByUserID_4bc6c477fd41, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_4bc6c477fd41, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_4bc6c477fd41, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_4bc6c477fd41, p_CacheTTLSeconds := p_CacheTTLSeconds_4bc6c477fd41, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_4bc6c477fd41, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_4bc6c477fd41, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_4bc6c477fd41, p_CodeComments := p_CodeComments_4bc6c477fd41, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_4bc6c477fd41, p_Libraries_Clear := TRUE, p_ID := p_ID_4bc6c477fd41);
  END IF;
END $mj$;

-- Save MJ: Actions (core SP call only)
DO $mj$
DECLARE
  p_ID_b817397ac586 UUID;
  p_CategoryID_b817397ac586 UUID;
  p_Name_b817397ac586 VARCHAR(425);
  p_Description_b817397ac586 TEXT;
  p_Type_b817397ac586 VARCHAR(20);
  p_UserPrompt_b817397ac586 TEXT;
  p_UserComments_b817397ac586 TEXT;
  p_Code_b817397ac586 TEXT;
  p_CodeComments_b817397ac586 TEXT;
  p_CodeApprovalStatus_b817397ac586 VARCHAR(20);
  p_CodeApprovalComments_b817397ac586 TEXT;
  p_CodeApprovedByUserID_b817397ac586 UUID;
  p_CodeApprovedAt_b817397ac586 TIMESTAMPTZ;
  p_CodeLocked_b817397ac586 BOOLEAN;
  p_ForceCodeGeneration_b817397ac586 BOOLEAN;
  p_RetentionPeriod_b817397ac586 INTEGER;
  p_Status_b817397ac586 VARCHAR(20);
  p_DriverClass_b817397ac586 VARCHAR(255);
  p_ParentID_b817397ac586 UUID;
  p_IconClass_b817397ac586 VARCHAR(100);
  p_DefaultCompactPromptID_b817397ac586 UUID;
  p_Config_b817397ac586 TEXT;
  p_RuntimeActionConfiguration_b817397ac586 TEXT;
  p_MaxExecutionTimeMS_b817397ac586 INTEGER;
  p_CreatedByAgentID_b817397ac586 UUID;
BEGIN
  p_ID_b817397ac586 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_CategoryID_b817397ac586 := '359F5241-25D1-4949-A74F-C20CA3EECC3A';
  p_Name_b817397ac586 := 'Create Provider Subscriptions';
  p_Description_b817397ac586 := 'For accounts whose payment gateway bills renewals itself (PaymentProviderType.SupportsSubscriptionBilling and PaymentProvider.BillsSubscriptions both on): find each active auto-renewing subscription with a saved card and no gateway subscription yet, and create one at the gateway that charges nothing now and first charges at 00:00 business time on the last day of its latest term, then record the gateway''s id on the subscription so Orders'' renewal jobs skip it. A subscription whose latest term is still unpaid (a renewal order Charge Renewals has not collected yet) stays with Orders until it is paid. The gateway price''s billing period must match the term. The gateway is searched first, so a subscription an earlier run created is recorded rather than created twice. A first charge further out than the gateway accepts today is deferred to a later run. Anything a person must act on raises one open alert Task per subscription and problem; a problem only a person can clear at the gateway is not retried while its Task is open. Preview (the default) searches the gateway read-only and reports what a run would create, record or leave for a person; it creates and records nothing. Its search finds only gateway subscriptions Orders created.';
  p_Type_b817397ac586 := 'Custom';
  p_UserPrompt_b817397ac586 := 'Create the missing gateway subscriptions for subscriptions a payment gateway bills, or preview what would be created.';
  p_CodeApprovalStatus_b817397ac586 := 'Approved';
  p_CodeLocked_b817397ac586 := FALSE;
  p_ForceCodeGeneration_b817397ac586 := FALSE;
  p_Status_b817397ac586 := 'Active';
  p_DriverClass_b817397ac586 := 'Orders.CreateProviderSubscriptions';
  p_IconClass_b817397ac586 := 'fa-solid fa-arrows-rotate';
  p_CategoryID_b817397ac586 := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_b817397ac586 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_b817397ac586);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action"
               WHERE "ID" = p_ID_b817397ac586 OR "Name" = p_Name_b817397ac586) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAction'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAction"(p_data := jsonb_build_object(
      'ID', p_ID_b817397ac586,
      'CategoryID', p_CategoryID_b817397ac586,
      'Name', p_Name_b817397ac586,
      'Description', p_Description_b817397ac586,
      'Type', p_Type_b817397ac586,
      'UserPrompt', p_UserPrompt_b817397ac586,
      'UserComments', p_UserComments_b817397ac586,
      'Code', p_Code_b817397ac586,
      'CodeComments', p_CodeComments_b817397ac586,
      'CodeApprovalStatus', p_CodeApprovalStatus_b817397ac586,
      'CodeApprovalComments', p_CodeApprovalComments_b817397ac586,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_b817397ac586,
      'CodeApprovedAt', p_CodeApprovedAt_b817397ac586,
      'CodeLocked', p_CodeLocked_b817397ac586,
      'ForceCodeGeneration', p_ForceCodeGeneration_b817397ac586,
      'RetentionPeriod', p_RetentionPeriod_b817397ac586,
      'Status', p_Status_b817397ac586,
      'DriverClass', p_DriverClass_b817397ac586,
      'ParentID', p_ParentID_b817397ac586,
      'IconClass', p_IconClass_b817397ac586,
      'DefaultCompactPromptID', p_DefaultCompactPromptID_b817397ac586,
      'Config', p_Config_b817397ac586,
      'RuntimeActionConfiguration', p_RuntimeActionConfiguration_b817397ac586,
      'MaxExecutionTimeMS', p_MaxExecutionTimeMS_b817397ac586,
      'CreatedByAgentID', p_CreatedByAgentID_b817397ac586
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAction"(p_ID := p_ID_b817397ac586, p_CategoryID := p_CategoryID_b817397ac586, p_Name := p_Name_b817397ac586, p_Description := p_Description_b817397ac586, p_Type := p_Type_b817397ac586, p_UserPrompt := p_UserPrompt_b817397ac586, p_UserComments := p_UserComments_b817397ac586, p_UserComments_Clear := TRUE, p_Code := p_Code_b817397ac586, p_Code_Clear := TRUE, p_CodeComments := p_CodeComments_b817397ac586, p_CodeComments_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_b817397ac586, p_CodeApprovalComments := p_CodeApprovalComments_b817397ac586, p_CodeApprovalComments_Clear := TRUE, p_CodeApprovedByUserID := p_CodeApprovedByUserID_b817397ac586, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_b817397ac586, p_CodeApprovedAt_Clear := TRUE, p_CodeLocked := p_CodeLocked_b817397ac586, p_ForceCodeGeneration := p_ForceCodeGeneration_b817397ac586, p_RetentionPeriod := p_RetentionPeriod_b817397ac586, p_RetentionPeriod_Clear := TRUE, p_Status := p_Status_b817397ac586, p_DriverClass := p_DriverClass_b817397ac586, p_ParentID := p_ParentID_b817397ac586, p_ParentID_Clear := TRUE, p_IconClass := p_IconClass_b817397ac586, p_DefaultCompactPromptID := p_DefaultCompactPromptID_b817397ac586, p_DefaultCompactPromptID_Clear := TRUE, p_Config := p_Config_b817397ac586, p_Config_Clear := TRUE, p_RuntimeActionConfiguration := p_RuntimeActionConfiguration_b817397ac586, p_RuntimeActionConfiguration_Clear := TRUE, p_MaxExecutionTimeMS := p_MaxExecutionTimeMS_b817397ac586, p_MaxExecutionTimeMS_Clear := TRUE, p_CreatedByAgentID := p_CreatedByAgentID_b817397ac586, p_CreatedByAgentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_97c3ef61d82b UUID;
  p_ActionID_97c3ef61d82b UUID;
  p_Name_97c3ef61d82b VARCHAR(255);
  p_DefaultValue_97c3ef61d82b TEXT;
  p_Type_97c3ef61d82b CHAR(10);
  p_ValueType_97c3ef61d82b VARCHAR(30);
  p_IsArray_97c3ef61d82b BOOLEAN;
  p_Description_97c3ef61d82b TEXT;
  p_IsRequired_97c3ef61d82b BOOLEAN;
  p_MediaModality_97c3ef61d82b VARCHAR(20);
  p_LogValue_97c3ef61d82b BOOLEAN;
BEGIN
  p_ID_97c3ef61d82b := 'B0D3DECF-7B91-4AAE-96C0-E0B0796E7B44';
  p_ActionID_97c3ef61d82b := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_97c3ef61d82b := 'SubscriptionID';
  p_Type_97c3ef61d82b := 'Input';
  p_ValueType_97c3ef61d82b := 'Scalar';
  p_IsArray_97c3ef61d82b := FALSE;
  p_Description_97c3ef61d82b := 'Handle only this subscription, for a targeted retry after fixing the cause of an alert. Omit for every eligible subscription with no gateway id.';
  p_IsRequired_97c3ef61d82b := FALSE;
  p_LogValue_97c3ef61d82b := TRUE;
  p_ActionID_97c3ef61d82b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_97c3ef61d82b THEN 0 ELSE 1 END LIMIT 1), p_ActionID_97c3ef61d82b);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_97c3ef61d82b
                  OR ("Name" = p_Name_97c3ef61d82b AND "ActionID" = p_ActionID_97c3ef61d82b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_97c3ef61d82b,
      'ActionID', p_ActionID_97c3ef61d82b,
      'Name', p_Name_97c3ef61d82b,
      'DefaultValue', p_DefaultValue_97c3ef61d82b,
      'Type', p_Type_97c3ef61d82b,
      'ValueType', p_ValueType_97c3ef61d82b,
      'IsArray', p_IsArray_97c3ef61d82b,
      'Description', p_Description_97c3ef61d82b,
      'IsRequired', p_IsRequired_97c3ef61d82b,
      'MediaModality', p_MediaModality_97c3ef61d82b,
      'LogValue', p_LogValue_97c3ef61d82b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_97c3ef61d82b, p_ActionID := p_ActionID_97c3ef61d82b, p_Name := p_Name_97c3ef61d82b, p_DefaultValue := p_DefaultValue_97c3ef61d82b, p_DefaultValue_Clear := TRUE, p_Type := p_Type_97c3ef61d82b, p_ValueType := p_ValueType_97c3ef61d82b, p_IsArray := p_IsArray_97c3ef61d82b, p_Description := p_Description_97c3ef61d82b, p_IsRequired := p_IsRequired_97c3ef61d82b, p_MediaModality := p_MediaModality_97c3ef61d82b, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_97c3ef61d82b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_79eb13dc068a UUID;
  p_ActionID_79eb13dc068a UUID;
  p_Name_79eb13dc068a VARCHAR(255);
  p_DefaultValue_79eb13dc068a TEXT;
  p_Type_79eb13dc068a CHAR(10);
  p_ValueType_79eb13dc068a VARCHAR(30);
  p_IsArray_79eb13dc068a BOOLEAN;
  p_Description_79eb13dc068a TEXT;
  p_IsRequired_79eb13dc068a BOOLEAN;
  p_MediaModality_79eb13dc068a VARCHAR(20);
  p_LogValue_79eb13dc068a BOOLEAN;
BEGIN
  p_ID_79eb13dc068a := 'ECAC20AF-BA7B-4E59-81AB-6B8BDE5D7B19';
  p_ActionID_79eb13dc068a := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_79eb13dc068a := 'Preview';
  p_Type_79eb13dc068a := 'Input';
  p_ValueType_79eb13dc068a := 'Scalar';
  p_IsArray_79eb13dc068a := FALSE;
  p_Description_79eb13dc068a := 'True (the default) reports what a run WOULD do, searching the gateway read-only and writing nothing; false creates and records. A value that is neither is refused rather than guessed.';
  p_IsRequired_79eb13dc068a := FALSE;
  p_LogValue_79eb13dc068a := TRUE;
  p_ActionID_79eb13dc068a := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_79eb13dc068a THEN 0 ELSE 1 END LIMIT 1), p_ActionID_79eb13dc068a);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_79eb13dc068a
                  OR ("Name" = p_Name_79eb13dc068a AND "ActionID" = p_ActionID_79eb13dc068a)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_79eb13dc068a,
      'ActionID', p_ActionID_79eb13dc068a,
      'Name', p_Name_79eb13dc068a,
      'DefaultValue', p_DefaultValue_79eb13dc068a,
      'Type', p_Type_79eb13dc068a,
      'ValueType', p_ValueType_79eb13dc068a,
      'IsArray', p_IsArray_79eb13dc068a,
      'Description', p_Description_79eb13dc068a,
      'IsRequired', p_IsRequired_79eb13dc068a,
      'MediaModality', p_MediaModality_79eb13dc068a,
      'LogValue', p_LogValue_79eb13dc068a
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_79eb13dc068a, p_ActionID := p_ActionID_79eb13dc068a, p_Name := p_Name_79eb13dc068a, p_DefaultValue := p_DefaultValue_79eb13dc068a, p_DefaultValue_Clear := TRUE, p_Type := p_Type_79eb13dc068a, p_ValueType := p_ValueType_79eb13dc068a, p_IsArray := p_IsArray_79eb13dc068a, p_Description := p_Description_79eb13dc068a, p_IsRequired := p_IsRequired_79eb13dc068a, p_MediaModality := p_MediaModality_79eb13dc068a, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_79eb13dc068a);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_8f7fef77b204 UUID;
  p_ActionID_8f7fef77b204 UUID;
  p_Name_8f7fef77b204 VARCHAR(255);
  p_DefaultValue_8f7fef77b204 TEXT;
  p_Type_8f7fef77b204 CHAR(10);
  p_ValueType_8f7fef77b204 VARCHAR(30);
  p_IsArray_8f7fef77b204 BOOLEAN;
  p_Description_8f7fef77b204 TEXT;
  p_IsRequired_8f7fef77b204 BOOLEAN;
  p_MediaModality_8f7fef77b204 VARCHAR(20);
  p_LogValue_8f7fef77b204 BOOLEAN;
BEGIN
  p_ID_8f7fef77b204 := '533A7F82-1930-484F-A56B-090E01DA012D';
  p_ActionID_8f7fef77b204 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_8f7fef77b204 := 'MaxCount';
  p_Type_8f7fef77b204 := 'Input';
  p_ValueType_8f7fef77b204 := 'Scalar';
  p_IsArray_8f7fef77b204 := FALSE;
  p_Description_8f7fef77b204 := 'Cap on gateway subscriptions created in one pass, and on those a preview reports, so a preview shows what the next live pass would start with. It is not a promise of the same list: a live pass reads the gateway, which a preview does not, and the data can change in between, so a subscription can come out deferred, unpaid or needing a person instead. Those do not use the cap; the rest wait for the next pass. A value that is not a whole number of at least 1 is refused.';
  p_IsRequired_8f7fef77b204 := FALSE;
  p_LogValue_8f7fef77b204 := TRUE;
  p_ActionID_8f7fef77b204 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_8f7fef77b204 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_8f7fef77b204);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_8f7fef77b204
                  OR ("Name" = p_Name_8f7fef77b204 AND "ActionID" = p_ActionID_8f7fef77b204)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_8f7fef77b204,
      'ActionID', p_ActionID_8f7fef77b204,
      'Name', p_Name_8f7fef77b204,
      'DefaultValue', p_DefaultValue_8f7fef77b204,
      'Type', p_Type_8f7fef77b204,
      'ValueType', p_ValueType_8f7fef77b204,
      'IsArray', p_IsArray_8f7fef77b204,
      'Description', p_Description_8f7fef77b204,
      'IsRequired', p_IsRequired_8f7fef77b204,
      'MediaModality', p_MediaModality_8f7fef77b204,
      'LogValue', p_LogValue_8f7fef77b204
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_8f7fef77b204, p_ActionID := p_ActionID_8f7fef77b204, p_Name := p_Name_8f7fef77b204, p_DefaultValue := p_DefaultValue_8f7fef77b204, p_DefaultValue_Clear := TRUE, p_Type := p_Type_8f7fef77b204, p_ValueType := p_ValueType_8f7fef77b204, p_IsArray := p_IsArray_8f7fef77b204, p_Description := p_Description_8f7fef77b204, p_IsRequired := p_IsRequired_8f7fef77b204, p_MediaModality := p_MediaModality_8f7fef77b204, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_8f7fef77b204);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_1db24a7d2035 UUID;
  p_ActionID_1db24a7d2035 UUID;
  p_Name_1db24a7d2035 VARCHAR(255);
  p_DefaultValue_1db24a7d2035 TEXT;
  p_Type_1db24a7d2035 CHAR(10);
  p_ValueType_1db24a7d2035 VARCHAR(30);
  p_IsArray_1db24a7d2035 BOOLEAN;
  p_Description_1db24a7d2035 TEXT;
  p_IsRequired_1db24a7d2035 BOOLEAN;
  p_MediaModality_1db24a7d2035 VARCHAR(20);
  p_LogValue_1db24a7d2035 BOOLEAN;
BEGIN
  p_ID_1db24a7d2035 := '8009C59A-4348-4F8D-89B4-CF6BD7356D90';
  p_ActionID_1db24a7d2035 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_1db24a7d2035 := 'Linked';
  p_Type_1db24a7d2035 := 'Output';
  p_ValueType_1db24a7d2035 := 'Scalar';
  p_IsArray_1db24a7d2035 := FALSE;
  p_Description_1db24a7d2035 := 'How many subscriptions this pass recorded a gateway subscription on, created or found.';
  p_IsRequired_1db24a7d2035 := FALSE;
  p_LogValue_1db24a7d2035 := TRUE;
  p_ActionID_1db24a7d2035 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_1db24a7d2035 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_1db24a7d2035);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_1db24a7d2035
                  OR ("Name" = p_Name_1db24a7d2035 AND "ActionID" = p_ActionID_1db24a7d2035)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_1db24a7d2035,
      'ActionID', p_ActionID_1db24a7d2035,
      'Name', p_Name_1db24a7d2035,
      'DefaultValue', p_DefaultValue_1db24a7d2035,
      'Type', p_Type_1db24a7d2035,
      'ValueType', p_ValueType_1db24a7d2035,
      'IsArray', p_IsArray_1db24a7d2035,
      'Description', p_Description_1db24a7d2035,
      'IsRequired', p_IsRequired_1db24a7d2035,
      'MediaModality', p_MediaModality_1db24a7d2035,
      'LogValue', p_LogValue_1db24a7d2035
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_1db24a7d2035, p_ActionID := p_ActionID_1db24a7d2035, p_Name := p_Name_1db24a7d2035, p_DefaultValue := p_DefaultValue_1db24a7d2035, p_DefaultValue_Clear := TRUE, p_Type := p_Type_1db24a7d2035, p_ValueType := p_ValueType_1db24a7d2035, p_IsArray := p_IsArray_1db24a7d2035, p_Description := p_Description_1db24a7d2035, p_IsRequired := p_IsRequired_1db24a7d2035, p_MediaModality := p_MediaModality_1db24a7d2035, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_1db24a7d2035);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_ae8986eebea4 UUID;
  p_ActionID_ae8986eebea4 UUID;
  p_Name_ae8986eebea4 VARCHAR(255);
  p_DefaultValue_ae8986eebea4 TEXT;
  p_Type_ae8986eebea4 CHAR(10);
  p_ValueType_ae8986eebea4 VARCHAR(30);
  p_IsArray_ae8986eebea4 BOOLEAN;
  p_Description_ae8986eebea4 TEXT;
  p_IsRequired_ae8986eebea4 BOOLEAN;
  p_MediaModality_ae8986eebea4 VARCHAR(20);
  p_LogValue_ae8986eebea4 BOOLEAN;
BEGIN
  p_ID_ae8986eebea4 := '66D0DE8D-3D22-4A00-BF3D-CE66133FE537';
  p_ActionID_ae8986eebea4 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_ae8986eebea4 := 'Deferred';
  p_Type_ae8986eebea4 := 'Output';
  p_ValueType_ae8986eebea4 := 'Scalar';
  p_IsArray_ae8986eebea4 := FALSE;
  p_Description_ae8986eebea4 := 'How many could not be created yet because their first charge is further out than the gateway accepts today; a later pass creates them.';
  p_IsRequired_ae8986eebea4 := FALSE;
  p_LogValue_ae8986eebea4 := TRUE;
  p_ActionID_ae8986eebea4 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_ae8986eebea4 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_ae8986eebea4);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_ae8986eebea4
                  OR ("Name" = p_Name_ae8986eebea4 AND "ActionID" = p_ActionID_ae8986eebea4)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_ae8986eebea4,
      'ActionID', p_ActionID_ae8986eebea4,
      'Name', p_Name_ae8986eebea4,
      'DefaultValue', p_DefaultValue_ae8986eebea4,
      'Type', p_Type_ae8986eebea4,
      'ValueType', p_ValueType_ae8986eebea4,
      'IsArray', p_IsArray_ae8986eebea4,
      'Description', p_Description_ae8986eebea4,
      'IsRequired', p_IsRequired_ae8986eebea4,
      'MediaModality', p_MediaModality_ae8986eebea4,
      'LogValue', p_LogValue_ae8986eebea4
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_ae8986eebea4, p_ActionID := p_ActionID_ae8986eebea4, p_Name := p_Name_ae8986eebea4, p_DefaultValue := p_DefaultValue_ae8986eebea4, p_DefaultValue_Clear := TRUE, p_Type := p_Type_ae8986eebea4, p_ValueType := p_ValueType_ae8986eebea4, p_IsArray := p_IsArray_ae8986eebea4, p_Description := p_Description_ae8986eebea4, p_IsRequired := p_IsRequired_ae8986eebea4, p_MediaModality := p_MediaModality_ae8986eebea4, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_ae8986eebea4);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_bb58b873074d UUID;
  p_ActionID_bb58b873074d UUID;
  p_Name_bb58b873074d VARCHAR(255);
  p_DefaultValue_bb58b873074d TEXT;
  p_Type_bb58b873074d CHAR(10);
  p_ValueType_bb58b873074d VARCHAR(30);
  p_IsArray_bb58b873074d BOOLEAN;
  p_Description_bb58b873074d TEXT;
  p_IsRequired_bb58b873074d BOOLEAN;
  p_MediaModality_bb58b873074d VARCHAR(20);
  p_LogValue_bb58b873074d BOOLEAN;
BEGIN
  p_ID_bb58b873074d := '81457394-3CFD-442F-B939-E2537B6BBEA4';
  p_ActionID_bb58b873074d := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_bb58b873074d := 'Alerts';
  p_Type_bb58b873074d := 'Output';
  p_ValueType_bb58b873074d := 'Scalar';
  p_IsArray_bb58b873074d := FALSE;
  p_Description_bb58b873074d := 'How many NEW problems for a person this pass raised (no price mapped, no card, a stub account, a price whose period is not the term''s, the gateway refused or failed, the id could not be recorded). Each is an alert Task; the run fails when this is above zero.';
  p_IsRequired_bb58b873074d := FALSE;
  p_LogValue_bb58b873074d := TRUE;
  p_ActionID_bb58b873074d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_bb58b873074d THEN 0 ELSE 1 END LIMIT 1), p_ActionID_bb58b873074d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_bb58b873074d
                  OR ("Name" = p_Name_bb58b873074d AND "ActionID" = p_ActionID_bb58b873074d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_bb58b873074d,
      'ActionID', p_ActionID_bb58b873074d,
      'Name', p_Name_bb58b873074d,
      'DefaultValue', p_DefaultValue_bb58b873074d,
      'Type', p_Type_bb58b873074d,
      'ValueType', p_ValueType_bb58b873074d,
      'IsArray', p_IsArray_bb58b873074d,
      'Description', p_Description_bb58b873074d,
      'IsRequired', p_IsRequired_bb58b873074d,
      'MediaModality', p_MediaModality_bb58b873074d,
      'LogValue', p_LogValue_bb58b873074d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_bb58b873074d, p_ActionID := p_ActionID_bb58b873074d, p_Name := p_Name_bb58b873074d, p_DefaultValue := p_DefaultValue_bb58b873074d, p_DefaultValue_Clear := TRUE, p_Type := p_Type_bb58b873074d, p_ValueType := p_ValueType_bb58b873074d, p_IsArray := p_IsArray_bb58b873074d, p_Description := p_Description_bb58b873074d, p_IsRequired := p_IsRequired_bb58b873074d, p_MediaModality := p_MediaModality_bb58b873074d, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_bb58b873074d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_525117a7580e UUID;
  p_ActionID_525117a7580e UUID;
  p_Name_525117a7580e VARCHAR(255);
  p_DefaultValue_525117a7580e TEXT;
  p_Type_525117a7580e CHAR(10);
  p_ValueType_525117a7580e VARCHAR(30);
  p_IsArray_525117a7580e BOOLEAN;
  p_Description_525117a7580e TEXT;
  p_IsRequired_525117a7580e BOOLEAN;
  p_MediaModality_525117a7580e VARCHAR(20);
  p_LogValue_525117a7580e BOOLEAN;
BEGIN
  p_ID_525117a7580e := '2613DBDE-409C-403A-BDA8-E45039C0E4F2';
  p_ActionID_525117a7580e := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_525117a7580e := 'Waiting';
  p_Type_525117a7580e := 'Output';
  p_ValueType_525117a7580e := 'Scalar';
  p_IsArray_525117a7580e := FALSE;
  p_Description_525117a7580e := 'How many need a person and already have an open alert Task, so this pass raised nothing new for them. They do not fail the run; closing the Task asks the next pass to try again.';
  p_IsRequired_525117a7580e := FALSE;
  p_LogValue_525117a7580e := TRUE;
  p_ActionID_525117a7580e := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_525117a7580e THEN 0 ELSE 1 END LIMIT 1), p_ActionID_525117a7580e);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_525117a7580e
                  OR ("Name" = p_Name_525117a7580e AND "ActionID" = p_ActionID_525117a7580e)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_525117a7580e,
      'ActionID', p_ActionID_525117a7580e,
      'Name', p_Name_525117a7580e,
      'DefaultValue', p_DefaultValue_525117a7580e,
      'Type', p_Type_525117a7580e,
      'ValueType', p_ValueType_525117a7580e,
      'IsArray', p_IsArray_525117a7580e,
      'Description', p_Description_525117a7580e,
      'IsRequired', p_IsRequired_525117a7580e,
      'MediaModality', p_MediaModality_525117a7580e,
      'LogValue', p_LogValue_525117a7580e
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_525117a7580e, p_ActionID := p_ActionID_525117a7580e, p_Name := p_Name_525117a7580e, p_DefaultValue := p_DefaultValue_525117a7580e, p_DefaultValue_Clear := TRUE, p_Type := p_Type_525117a7580e, p_ValueType := p_ValueType_525117a7580e, p_IsArray := p_IsArray_525117a7580e, p_Description := p_Description_525117a7580e, p_IsRequired := p_IsRequired_525117a7580e, p_MediaModality := p_MediaModality_525117a7580e, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_525117a7580e);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_ce04b8599bb1 UUID;
  p_ActionID_ce04b8599bb1 UUID;
  p_Name_ce04b8599bb1 VARCHAR(255);
  p_DefaultValue_ce04b8599bb1 TEXT;
  p_Type_ce04b8599bb1 CHAR(10);
  p_ValueType_ce04b8599bb1 VARCHAR(30);
  p_IsArray_ce04b8599bb1 BOOLEAN;
  p_Description_ce04b8599bb1 TEXT;
  p_IsRequired_ce04b8599bb1 BOOLEAN;
  p_MediaModality_ce04b8599bb1 VARCHAR(20);
  p_LogValue_ce04b8599bb1 BOOLEAN;
BEGIN
  p_ID_ce04b8599bb1 := '7364293C-2475-4F5A-A16F-32D0F3196A26';
  p_ActionID_ce04b8599bb1 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_ce04b8599bb1 := 'Outcomes';
  p_Type_ce04b8599bb1 := 'Output';
  p_ValueType_ce04b8599bb1 := 'Scalar';
  p_IsArray_ce04b8599bb1 := TRUE;
  p_Description_ce04b8599bb1 := 'Every subscription looked at: the subscription, the outcome code, the reason, the account, the gateway id and the first charge.';
  p_IsRequired_ce04b8599bb1 := FALSE;
  p_LogValue_ce04b8599bb1 := TRUE;
  p_ActionID_ce04b8599bb1 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_ce04b8599bb1 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_ce04b8599bb1);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_ce04b8599bb1
                  OR ("Name" = p_Name_ce04b8599bb1 AND "ActionID" = p_ActionID_ce04b8599bb1)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_ce04b8599bb1,
      'ActionID', p_ActionID_ce04b8599bb1,
      'Name', p_Name_ce04b8599bb1,
      'DefaultValue', p_DefaultValue_ce04b8599bb1,
      'Type', p_Type_ce04b8599bb1,
      'ValueType', p_ValueType_ce04b8599bb1,
      'IsArray', p_IsArray_ce04b8599bb1,
      'Description', p_Description_ce04b8599bb1,
      'IsRequired', p_IsRequired_ce04b8599bb1,
      'MediaModality', p_MediaModality_ce04b8599bb1,
      'LogValue', p_LogValue_ce04b8599bb1
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_ce04b8599bb1, p_ActionID := p_ActionID_ce04b8599bb1, p_Name := p_Name_ce04b8599bb1, p_DefaultValue := p_DefaultValue_ce04b8599bb1, p_DefaultValue_Clear := TRUE, p_Type := p_Type_ce04b8599bb1, p_ValueType := p_ValueType_ce04b8599bb1, p_IsArray := p_IsArray_ce04b8599bb1, p_Description := p_Description_ce04b8599bb1, p_IsRequired := p_IsRequired_ce04b8599bb1, p_MediaModality := p_MediaModality_ce04b8599bb1, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_ce04b8599bb1);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_5246ad342944 UUID;
  p_ActionID_5246ad342944 UUID;
  p_Name_5246ad342944 VARCHAR(255);
  p_DefaultValue_5246ad342944 TEXT;
  p_Type_5246ad342944 CHAR(10);
  p_ValueType_5246ad342944 VARCHAR(30);
  p_IsArray_5246ad342944 BOOLEAN;
  p_Description_5246ad342944 TEXT;
  p_IsRequired_5246ad342944 BOOLEAN;
  p_MediaModality_5246ad342944 VARCHAR(20);
  p_LogValue_5246ad342944 BOOLEAN;
BEGIN
  p_ID_5246ad342944 := 'F7F3D21C-97BF-4881-805E-B06D4D456D07';
  p_ActionID_5246ad342944 := '2B4D8149-15CF-4B64-9F94-0F30AE30077F';
  p_Name_5246ad342944 := 'PreviewedOnly';
  p_Type_5246ad342944 := 'Output';
  p_ValueType_5246ad342944 := 'Scalar';
  p_IsArray_5246ad342944 := FALSE;
  p_Description_5246ad342944 := 'True when this pass reported its list and created nothing. Not named Preview, so the input''s value is not overwritten.';
  p_IsRequired_5246ad342944 := FALSE;
  p_LogValue_5246ad342944 := TRUE;
  p_ActionID_5246ad342944 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Create Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_5246ad342944 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_5246ad342944);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_5246ad342944
                  OR ("Name" = p_Name_5246ad342944 AND "ActionID" = p_ActionID_5246ad342944)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_5246ad342944,
      'ActionID', p_ActionID_5246ad342944,
      'Name', p_Name_5246ad342944,
      'DefaultValue', p_DefaultValue_5246ad342944,
      'Type', p_Type_5246ad342944,
      'ValueType', p_ValueType_5246ad342944,
      'IsArray', p_IsArray_5246ad342944,
      'Description', p_Description_5246ad342944,
      'IsRequired', p_IsRequired_5246ad342944,
      'MediaModality', p_MediaModality_5246ad342944,
      'LogValue', p_LogValue_5246ad342944
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_5246ad342944, p_ActionID := p_ActionID_5246ad342944, p_Name := p_Name_5246ad342944, p_DefaultValue := p_DefaultValue_5246ad342944, p_DefaultValue_Clear := TRUE, p_Type := p_Type_5246ad342944, p_ValueType := p_ValueType_5246ad342944, p_IsArray := p_IsArray_5246ad342944, p_Description := p_Description_5246ad342944, p_IsRequired := p_IsRequired_5246ad342944, p_MediaModality := p_MediaModality_5246ad342944, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_5246ad342944);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Scheduled Jobs (core SP call only)
DO $mj$
DECLARE
  p_ID_575e0d07aeb2 UUID;
  p_JobTypeID_575e0d07aeb2 UUID;
  p_Name_575e0d07aeb2 VARCHAR(200);
  p_Description_575e0d07aeb2 TEXT;
  p_CronExpression_575e0d07aeb2 VARCHAR(120);
  p_Timezone_575e0d07aeb2 VARCHAR(64);
  p_StartAt_575e0d07aeb2 TIMESTAMPTZ;
  p_EndAt_575e0d07aeb2 TIMESTAMPTZ;
  p_Status_575e0d07aeb2 VARCHAR(20);
  p_Configuration_575e0d07aeb2 TEXT;
  p_OwnerUserID_575e0d07aeb2 UUID;
  p_LastRunAt_575e0d07aeb2 TIMESTAMPTZ;
  p_NextRunAt_575e0d07aeb2 TIMESTAMPTZ;
  p_RunCount_575e0d07aeb2 INTEGER;
  p_SuccessCount_575e0d07aeb2 INTEGER;
  p_FailureCount_575e0d07aeb2 INTEGER;
  p_NotifyOnSuccess_575e0d07aeb2 BOOLEAN;
  p_NotifyOnFailure_575e0d07aeb2 BOOLEAN;
  p_NotifyUserID_575e0d07aeb2 UUID;
  p_NotifyViaEmail_575e0d07aeb2 BOOLEAN;
  p_NotifyViaInApp_575e0d07aeb2 BOOLEAN;
  p_LockToken_575e0d07aeb2 UUID;
  p_LockedAt_575e0d07aeb2 TIMESTAMPTZ;
  p_LockedByInstance_575e0d07aeb2 VARCHAR(255);
  p_ExpectedCompletionAt_575e0d07aeb2 TIMESTAMPTZ;
  p_ConcurrencyMode_575e0d07aeb2 VARCHAR(20);
  p_RunImmediatelyIfNeverRun_575e0d07aeb2 BOOLEAN;
  p_MaxRuntimeMinutes_575e0d07aeb2 INTEGER;
  p_MissedRunPolicy_575e0d07aeb2 VARCHAR(20);
BEGIN
  p_ID_575e0d07aeb2 := '202DEE2F-2AD8-46F1-8D53-5F6EE09BC2E1';
  p_JobTypeID_575e0d07aeb2 := '3B94DD43-E961-4D85-B7F4-B6783D748766';
  p_Name_575e0d07aeb2 := 'Orders — Create Provider Subscriptions (daily)';
  p_Description_575e0d07aeb2 := 'Creates the missing gateway subscriptions for active auto-renewing subscriptions on accounts whose gateway bills renewals (BillsSubscriptions on), and records each gateway id so Orders'' renewal jobs skip it. Retries what the checkout could not do, creates terms that start later once their first charge fits, and backfills buyers from before the switch. Ships disabled, set to Preview and capped at 25 a pass: enable it, read the Outcomes on the run, then set Preview to false. REQUIRED wherever an account has BillsSubscriptions on: a host that turns the switch on must set this job Active, read one preview run, then set Preview to false. Nothing checks that it did. Until then a checkout that could not hand a subscription over (GatewayFault, NotRecorded) leaves Orders renewing it, while the gateway may bill it too.';
  p_CronExpression_575e0d07aeb2 := '0 45 2 * * *';
  p_Timezone_575e0d07aeb2 := 'UTC';
  p_Status_575e0d07aeb2 := 'Disabled';
  p_Configuration_575e0d07aeb2 := '{"ActionID":"2B4D8149-15CF-4B64-9F94-0F30AE30077F","Params":[{"ActionParamID":"ECAC20AF-BA7B-4E59-81AB-6B8BDE5D7B19","ValueType":"Static","Value":"true"},{"ActionParamID":"533A7F82-1930-484F-A56B-090E01DA012D","ValueType":"Static","Value":"25"}]}';
  p_RunCount_575e0d07aeb2 := 0;
  p_SuccessCount_575e0d07aeb2 := 0;
  p_FailureCount_575e0d07aeb2 := 0;
  p_NotifyOnSuccess_575e0d07aeb2 := FALSE;
  p_NotifyOnFailure_575e0d07aeb2 := TRUE;
  p_NotifyViaEmail_575e0d07aeb2 := FALSE;
  p_NotifyViaInApp_575e0d07aeb2 := TRUE;
  p_ConcurrencyMode_575e0d07aeb2 := 'Skip';
  p_RunImmediatelyIfNeverRun_575e0d07aeb2 := FALSE;
  p_MaxRuntimeMinutes_575e0d07aeb2 := 30;
  p_MissedRunPolicy_575e0d07aeb2 := 'RunOnce';
  IF p_JobTypeID_575e0d07aeb2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ScheduledJob"
               WHERE "ID" = p_ID_575e0d07aeb2 OR "Name" = p_Name_575e0d07aeb2) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateScheduledJob'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_data := jsonb_build_object(
      'ID', p_ID_575e0d07aeb2,
      'JobTypeID', p_JobTypeID_575e0d07aeb2,
      'Name', p_Name_575e0d07aeb2,
      'Description', p_Description_575e0d07aeb2,
      'CronExpression', p_CronExpression_575e0d07aeb2,
      'Timezone', p_Timezone_575e0d07aeb2,
      'StartAt', p_StartAt_575e0d07aeb2,
      'EndAt', p_EndAt_575e0d07aeb2,
      'Status', p_Status_575e0d07aeb2,
      'Configuration', p_Configuration_575e0d07aeb2,
      'OwnerUserID', p_OwnerUserID_575e0d07aeb2,
      'LastRunAt', p_LastRunAt_575e0d07aeb2,
      'NextRunAt', p_NextRunAt_575e0d07aeb2,
      'RunCount', p_RunCount_575e0d07aeb2,
      'SuccessCount', p_SuccessCount_575e0d07aeb2,
      'FailureCount', p_FailureCount_575e0d07aeb2,
      'NotifyOnSuccess', p_NotifyOnSuccess_575e0d07aeb2,
      'NotifyOnFailure', p_NotifyOnFailure_575e0d07aeb2,
      'NotifyUserID', p_NotifyUserID_575e0d07aeb2,
      'NotifyViaEmail', p_NotifyViaEmail_575e0d07aeb2,
      'NotifyViaInApp', p_NotifyViaInApp_575e0d07aeb2,
      'LockToken', p_LockToken_575e0d07aeb2,
      'LockedAt', p_LockedAt_575e0d07aeb2,
      'LockedByInstance', p_LockedByInstance_575e0d07aeb2,
      'ExpectedCompletionAt', p_ExpectedCompletionAt_575e0d07aeb2,
      'ConcurrencyMode', p_ConcurrencyMode_575e0d07aeb2,
      'RunImmediatelyIfNeverRun', p_RunImmediatelyIfNeverRun_575e0d07aeb2,
      'MaxRuntimeMinutes', p_MaxRuntimeMinutes_575e0d07aeb2,
      'MissedRunPolicy', p_MissedRunPolicy_575e0d07aeb2
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_ID := p_ID_575e0d07aeb2, p_JobTypeID := p_JobTypeID_575e0d07aeb2, p_Name := p_Name_575e0d07aeb2, p_Description := p_Description_575e0d07aeb2, p_CronExpression := p_CronExpression_575e0d07aeb2, p_Timezone := p_Timezone_575e0d07aeb2, p_StartAt := p_StartAt_575e0d07aeb2, p_StartAt_Clear := TRUE, p_EndAt := p_EndAt_575e0d07aeb2, p_EndAt_Clear := TRUE, p_Status := p_Status_575e0d07aeb2, p_Configuration := p_Configuration_575e0d07aeb2, p_OwnerUserID := p_OwnerUserID_575e0d07aeb2, p_OwnerUserID_Clear := TRUE, p_LastRunAt := p_LastRunAt_575e0d07aeb2, p_LastRunAt_Clear := TRUE, p_NextRunAt := p_NextRunAt_575e0d07aeb2, p_NextRunAt_Clear := TRUE, p_RunCount := p_RunCount_575e0d07aeb2, p_SuccessCount := p_SuccessCount_575e0d07aeb2, p_FailureCount := p_FailureCount_575e0d07aeb2, p_NotifyOnSuccess := p_NotifyOnSuccess_575e0d07aeb2, p_NotifyOnFailure := p_NotifyOnFailure_575e0d07aeb2, p_NotifyUserID := p_NotifyUserID_575e0d07aeb2, p_NotifyUserID_Clear := TRUE, p_NotifyViaEmail := p_NotifyViaEmail_575e0d07aeb2, p_NotifyViaInApp := p_NotifyViaInApp_575e0d07aeb2, p_LockToken := p_LockToken_575e0d07aeb2, p_LockToken_Clear := TRUE, p_LockedAt := p_LockedAt_575e0d07aeb2, p_LockedAt_Clear := TRUE, p_LockedByInstance := p_LockedByInstance_575e0d07aeb2, p_LockedByInstance_Clear := TRUE, p_ExpectedCompletionAt := p_ExpectedCompletionAt_575e0d07aeb2, p_ExpectedCompletionAt_Clear := TRUE, p_ConcurrencyMode := p_ConcurrencyMode_575e0d07aeb2, p_RunImmediatelyIfNeverRun := p_RunImmediatelyIfNeverRun_575e0d07aeb2, p_MaxRuntimeMinutes := p_MaxRuntimeMinutes_575e0d07aeb2, p_MissedRunPolicy := p_MissedRunPolicy_575e0d07aeb2);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_cb6d616b7c67 VARCHAR(255);
  p_Description_cb6d616b7c67 TEXT;
  p_AutoUpdateDescription_cb6d616b7c67 BOOLEAN;
  p_IsPrimaryKey_cb6d616b7c67 BOOLEAN;
  p_IsUnique_cb6d616b7c67 BOOLEAN;
  p_Category_cb6d616b7c67 VARCHAR(255);
  p_ValueListType_cb6d616b7c67 VARCHAR(20);
  p_ExtendedType_cb6d616b7c67 VARCHAR(50);
  p_CodeType_cb6d616b7c67 VARCHAR(50);
  p_DefaultInView_cb6d616b7c67 BOOLEAN;
  p_ViewCellTemplate_cb6d616b7c67 TEXT;
  p_DefaultColumnWidth_cb6d616b7c67 INTEGER;
  p_AllowUpdateAPI_cb6d616b7c67 BOOLEAN;
  p_AllowUpdateInView_cb6d616b7c67 BOOLEAN;
  p_IncludeInUserSearchAPI_cb6d616b7c67 BOOLEAN;
  p_FullTextSearchEnabled_cb6d616b7c67 BOOLEAN;
  p_UserSearchParamFormatAPI_cb6d616b7c67 VARCHAR(500);
  p_IncludeInGeneratedForm_cb6d616b7c67 BOOLEAN;
  p_GeneratedFormSection_cb6d616b7c67 VARCHAR(10);
  p_IsNameField_cb6d616b7c67 BOOLEAN;
  p_RelatedEntityID_cb6d616b7c67 UUID;
  p_RelatedEntityFieldName_cb6d616b7c67 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_cb6d616b7c67 BOOLEAN;
  p_RelatedEntityNameFieldMap_cb6d616b7c67 VARCHAR(255);
  p_RelatedEntityDisplayType_cb6d616b7c67 VARCHAR(20);
  p_EntityIDFieldName_cb6d616b7c67 VARCHAR(100);
  p_ScopeDefault_cb6d616b7c67 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_cb6d616b7c67 BOOLEAN;
  p_ValuesToPackWithSchema_cb6d616b7c67 VARCHAR(10);
  p_Status_cb6d616b7c67 VARCHAR(25);
  p_AutoUpdateIsNameField_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateDefaultInView_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateCategory_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateDisplayName_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_cb6d616b7c67 BOOLEAN;
  p_Encrypt_cb6d616b7c67 BOOLEAN;
  p_EncryptionKeyID_cb6d616b7c67 UUID;
  p_AllowDecryptInAPI_cb6d616b7c67 BOOLEAN;
  p_SendEncryptedValue_cb6d616b7c67 BOOLEAN;
  p_IsSoftPrimaryKey_cb6d616b7c67 BOOLEAN;
  p_IsSoftForeignKey_cb6d616b7c67 BOOLEAN;
  p_RelatedEntityJoinFields_cb6d616b7c67 TEXT;
  p_JSONType_cb6d616b7c67 VARCHAR(255);
  p_JSONTypeIsArray_cb6d616b7c67 BOOLEAN;
  p_JSONTypeDefinition_cb6d616b7c67 TEXT;
  p_UserSearchPredicateAPI_cb6d616b7c67 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateFullTextSearch_cb6d616b7c67 BOOLEAN;
  p_AutoUpdateExtendedType_cb6d616b7c67 BOOLEAN;
  p_IsComputed_cb6d616b7c67 BOOLEAN;
  p_EmbeddedRecord_cb6d616b7c67 TEXT;
  p_Configuration_cb6d616b7c67 TEXT;
  p_ID_cb6d616b7c67 UUID;
BEGIN
  p_DisplayName_cb6d616b7c67 := 'Name';
  p_Description_cb6d616b7c67 := 'Display name of the product.';
  p_AutoUpdateDescription_cb6d616b7c67 := TRUE;
  p_IsPrimaryKey_cb6d616b7c67 := FALSE;
  p_IsUnique_cb6d616b7c67 := FALSE;
  p_Category_cb6d616b7c67 := 'Product Identification';
  p_ValueListType_cb6d616b7c67 := 'None';
  p_DefaultInView_cb6d616b7c67 := TRUE;
  p_DefaultColumnWidth_cb6d616b7c67 := 150;
  p_AllowUpdateAPI_cb6d616b7c67 := TRUE;
  p_AllowUpdateInView_cb6d616b7c67 := TRUE;
  p_IncludeInUserSearchAPI_cb6d616b7c67 := TRUE;
  p_FullTextSearchEnabled_cb6d616b7c67 := FALSE;
  p_IncludeInGeneratedForm_cb6d616b7c67 := TRUE;
  p_GeneratedFormSection_cb6d616b7c67 := 'Category';
  p_IsNameField_cb6d616b7c67 := TRUE;
  p_IncludeRelatedEntityNameFieldInBaseView_cb6d616b7c67 := FALSE;
  p_RelatedEntityDisplayType_cb6d616b7c67 := 'Search';
  p_AutoUpdateRelatedEntityInfo_cb6d616b7c67 := TRUE;
  p_ValuesToPackWithSchema_cb6d616b7c67 := 'Auto';
  p_Status_cb6d616b7c67 := 'Active';
  p_AutoUpdateIsNameField_cb6d616b7c67 := TRUE;
  p_AutoUpdateDefaultInView_cb6d616b7c67 := TRUE;
  p_AutoUpdateCategory_cb6d616b7c67 := TRUE;
  p_AutoUpdateDisplayName_cb6d616b7c67 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_cb6d616b7c67 := FALSE;
  p_Encrypt_cb6d616b7c67 := FALSE;
  p_AllowDecryptInAPI_cb6d616b7c67 := FALSE;
  p_SendEncryptedValue_cb6d616b7c67 := FALSE;
  p_IsSoftPrimaryKey_cb6d616b7c67 := FALSE;
  p_IsSoftForeignKey_cb6d616b7c67 := FALSE;
  p_JSONTypeIsArray_cb6d616b7c67 := FALSE;
  p_UserSearchPredicateAPI_cb6d616b7c67 := 'Contains';
  p_AutoUpdateUserSearchPredicate_cb6d616b7c67 := FALSE;
  p_AutoUpdateFullTextSearch_cb6d616b7c67 := TRUE;
  p_AutoUpdateExtendedType_cb6d616b7c67 := TRUE;
  p_IsComputed_cb6d616b7c67 := FALSE;
  p_ID_cb6d616b7c67 := '4DD24C57-19A6-4757-94F4-8FCAAA2FD612';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_cb6d616b7c67,
    'Description', p_Description_cb6d616b7c67,
    'AutoUpdateDescription', p_AutoUpdateDescription_cb6d616b7c67,
    'IsPrimaryKey', p_IsPrimaryKey_cb6d616b7c67,
    'IsUnique', p_IsUnique_cb6d616b7c67,
    'Category', p_Category_cb6d616b7c67,
    'ValueListType', p_ValueListType_cb6d616b7c67,
    'ExtendedType', p_ExtendedType_cb6d616b7c67,
    'CodeType', p_CodeType_cb6d616b7c67,
    'DefaultInView', p_DefaultInView_cb6d616b7c67,
    'ViewCellTemplate', p_ViewCellTemplate_cb6d616b7c67,
    'DefaultColumnWidth', p_DefaultColumnWidth_cb6d616b7c67,
    'AllowUpdateAPI', p_AllowUpdateAPI_cb6d616b7c67,
    'AllowUpdateInView', p_AllowUpdateInView_cb6d616b7c67,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_cb6d616b7c67,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_cb6d616b7c67,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_cb6d616b7c67,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_cb6d616b7c67,
    'GeneratedFormSection', p_GeneratedFormSection_cb6d616b7c67,
    'IsNameField', p_IsNameField_cb6d616b7c67,
    'RelatedEntityID', p_RelatedEntityID_cb6d616b7c67,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_cb6d616b7c67,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_cb6d616b7c67,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_cb6d616b7c67,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_cb6d616b7c67,
    'EntityIDFieldName', p_EntityIDFieldName_cb6d616b7c67,
    'ScopeDefault', p_ScopeDefault_cb6d616b7c67,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_cb6d616b7c67,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_cb6d616b7c67,
    'Status', p_Status_cb6d616b7c67,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_cb6d616b7c67,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_cb6d616b7c67,
    'AutoUpdateCategory', p_AutoUpdateCategory_cb6d616b7c67,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_cb6d616b7c67,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_cb6d616b7c67,
    'Encrypt', p_Encrypt_cb6d616b7c67,
    'EncryptionKeyID', p_EncryptionKeyID_cb6d616b7c67,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_cb6d616b7c67,
    'SendEncryptedValue', p_SendEncryptedValue_cb6d616b7c67,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_cb6d616b7c67,
    'IsSoftForeignKey', p_IsSoftForeignKey_cb6d616b7c67,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_cb6d616b7c67,
    'JSONType', p_JSONType_cb6d616b7c67,
    'JSONTypeIsArray', p_JSONTypeIsArray_cb6d616b7c67,
    'JSONTypeDefinition', p_JSONTypeDefinition_cb6d616b7c67,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_cb6d616b7c67,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_cb6d616b7c67,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_cb6d616b7c67,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_cb6d616b7c67,
    'IsComputed', p_IsComputed_cb6d616b7c67
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_cb6d616b7c67,
    'Configuration', p_Configuration_cb6d616b7c67,
    'ID', p_ID_cb6d616b7c67
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_cb6d616b7c67, p_Description := p_Description_cb6d616b7c67, p_AutoUpdateDescription := p_AutoUpdateDescription_cb6d616b7c67, p_IsPrimaryKey := p_IsPrimaryKey_cb6d616b7c67, p_IsUnique := p_IsUnique_cb6d616b7c67, p_Category := p_Category_cb6d616b7c67, p_ValueListType := p_ValueListType_cb6d616b7c67, p_ExtendedType := p_ExtendedType_cb6d616b7c67, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_cb6d616b7c67, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_cb6d616b7c67, p_ViewCellTemplate := p_ViewCellTemplate_cb6d616b7c67, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_cb6d616b7c67, p_AllowUpdateAPI := p_AllowUpdateAPI_cb6d616b7c67, p_AllowUpdateInView := p_AllowUpdateInView_cb6d616b7c67, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_cb6d616b7c67, p_FullTextSearchEnabled := p_FullTextSearchEnabled_cb6d616b7c67, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_cb6d616b7c67, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_cb6d616b7c67, p_GeneratedFormSection := p_GeneratedFormSection_cb6d616b7c67, p_IsNameField := p_IsNameField_cb6d616b7c67, p_RelatedEntityID := p_RelatedEntityID_cb6d616b7c67, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_cb6d616b7c67, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_cb6d616b7c67, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_cb6d616b7c67, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_cb6d616b7c67, p_EntityIDFieldName := p_EntityIDFieldName_cb6d616b7c67, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_cb6d616b7c67, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_cb6d616b7c67, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_cb6d616b7c67, p_Status := p_Status_cb6d616b7c67, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_cb6d616b7c67, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_cb6d616b7c67, p_AutoUpdateCategory := p_AutoUpdateCategory_cb6d616b7c67, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_cb6d616b7c67, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_cb6d616b7c67, p_Encrypt := p_Encrypt_cb6d616b7c67, p_EncryptionKeyID := p_EncryptionKeyID_cb6d616b7c67, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_cb6d616b7c67, p_SendEncryptedValue := p_SendEncryptedValue_cb6d616b7c67, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_cb6d616b7c67, p_IsSoftForeignKey := p_IsSoftForeignKey_cb6d616b7c67, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_cb6d616b7c67, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_cb6d616b7c67, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_cb6d616b7c67, p_JSONTypeDefinition := p_JSONTypeDefinition_cb6d616b7c67, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_cb6d616b7c67, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_cb6d616b7c67, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_cb6d616b7c67, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_cb6d616b7c67, p_IsComputed := p_IsComputed_cb6d616b7c67, p_EmbeddedRecord := p_EmbeddedRecord_cb6d616b7c67, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_cb6d616b7c67, p_Configuration_Clear := TRUE, p_ID := p_ID_cb6d616b7c67);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_54f2ca8c35bc VARCHAR(255);
  p_Description_54f2ca8c35bc TEXT;
  p_AutoUpdateDescription_54f2ca8c35bc BOOLEAN;
  p_IsPrimaryKey_54f2ca8c35bc BOOLEAN;
  p_IsUnique_54f2ca8c35bc BOOLEAN;
  p_Category_54f2ca8c35bc VARCHAR(255);
  p_ValueListType_54f2ca8c35bc VARCHAR(20);
  p_ExtendedType_54f2ca8c35bc VARCHAR(50);
  p_CodeType_54f2ca8c35bc VARCHAR(50);
  p_DefaultInView_54f2ca8c35bc BOOLEAN;
  p_ViewCellTemplate_54f2ca8c35bc TEXT;
  p_DefaultColumnWidth_54f2ca8c35bc INTEGER;
  p_AllowUpdateAPI_54f2ca8c35bc BOOLEAN;
  p_AllowUpdateInView_54f2ca8c35bc BOOLEAN;
  p_IncludeInUserSearchAPI_54f2ca8c35bc BOOLEAN;
  p_FullTextSearchEnabled_54f2ca8c35bc BOOLEAN;
  p_UserSearchParamFormatAPI_54f2ca8c35bc VARCHAR(500);
  p_IncludeInGeneratedForm_54f2ca8c35bc BOOLEAN;
  p_GeneratedFormSection_54f2ca8c35bc VARCHAR(10);
  p_IsNameField_54f2ca8c35bc BOOLEAN;
  p_RelatedEntityID_54f2ca8c35bc UUID;
  p_RelatedEntityFieldName_54f2ca8c35bc VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_54f2ca8c35bc BOOLEAN;
  p_RelatedEntityNameFieldMap_54f2ca8c35bc VARCHAR(255);
  p_RelatedEntityDisplayType_54f2ca8c35bc VARCHAR(20);
  p_EntityIDFieldName_54f2ca8c35bc VARCHAR(100);
  p_ScopeDefault_54f2ca8c35bc VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_54f2ca8c35bc BOOLEAN;
  p_ValuesToPackWithSchema_54f2ca8c35bc VARCHAR(10);
  p_Status_54f2ca8c35bc VARCHAR(25);
  p_AutoUpdateIsNameField_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateDefaultInView_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateCategory_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateDisplayName_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_54f2ca8c35bc BOOLEAN;
  p_Encrypt_54f2ca8c35bc BOOLEAN;
  p_EncryptionKeyID_54f2ca8c35bc UUID;
  p_AllowDecryptInAPI_54f2ca8c35bc BOOLEAN;
  p_SendEncryptedValue_54f2ca8c35bc BOOLEAN;
  p_IsSoftPrimaryKey_54f2ca8c35bc BOOLEAN;
  p_IsSoftForeignKey_54f2ca8c35bc BOOLEAN;
  p_RelatedEntityJoinFields_54f2ca8c35bc TEXT;
  p_JSONType_54f2ca8c35bc VARCHAR(255);
  p_JSONTypeIsArray_54f2ca8c35bc BOOLEAN;
  p_JSONTypeDefinition_54f2ca8c35bc TEXT;
  p_UserSearchPredicateAPI_54f2ca8c35bc VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateFullTextSearch_54f2ca8c35bc BOOLEAN;
  p_AutoUpdateExtendedType_54f2ca8c35bc BOOLEAN;
  p_IsComputed_54f2ca8c35bc BOOLEAN;
  p_EmbeddedRecord_54f2ca8c35bc TEXT;
  p_Configuration_54f2ca8c35bc TEXT;
  p_ID_54f2ca8c35bc UUID;
BEGIN
  p_DisplayName_54f2ca8c35bc := 'Name';
  p_Description_54f2ca8c35bc := 'Display name.';
  p_AutoUpdateDescription_54f2ca8c35bc := TRUE;
  p_IsPrimaryKey_54f2ca8c35bc := FALSE;
  p_IsUnique_54f2ca8c35bc := FALSE;
  p_Category_54f2ca8c35bc := 'General Information';
  p_ValueListType_54f2ca8c35bc := 'None';
  p_DefaultInView_54f2ca8c35bc := TRUE;
  p_DefaultColumnWidth_54f2ca8c35bc := 150;
  p_AllowUpdateAPI_54f2ca8c35bc := TRUE;
  p_AllowUpdateInView_54f2ca8c35bc := TRUE;
  p_IncludeInUserSearchAPI_54f2ca8c35bc := TRUE;
  p_FullTextSearchEnabled_54f2ca8c35bc := FALSE;
  p_IncludeInGeneratedForm_54f2ca8c35bc := TRUE;
  p_GeneratedFormSection_54f2ca8c35bc := 'Category';
  p_IsNameField_54f2ca8c35bc := TRUE;
  p_IncludeRelatedEntityNameFieldInBaseView_54f2ca8c35bc := FALSE;
  p_RelatedEntityDisplayType_54f2ca8c35bc := 'Search';
  p_AutoUpdateRelatedEntityInfo_54f2ca8c35bc := TRUE;
  p_ValuesToPackWithSchema_54f2ca8c35bc := 'Auto';
  p_Status_54f2ca8c35bc := 'Active';
  p_AutoUpdateIsNameField_54f2ca8c35bc := TRUE;
  p_AutoUpdateDefaultInView_54f2ca8c35bc := TRUE;
  p_AutoUpdateCategory_54f2ca8c35bc := TRUE;
  p_AutoUpdateDisplayName_54f2ca8c35bc := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_54f2ca8c35bc := FALSE;
  p_Encrypt_54f2ca8c35bc := FALSE;
  p_AllowDecryptInAPI_54f2ca8c35bc := FALSE;
  p_SendEncryptedValue_54f2ca8c35bc := FALSE;
  p_IsSoftPrimaryKey_54f2ca8c35bc := FALSE;
  p_IsSoftForeignKey_54f2ca8c35bc := FALSE;
  p_JSONTypeIsArray_54f2ca8c35bc := FALSE;
  p_UserSearchPredicateAPI_54f2ca8c35bc := 'Contains';
  p_AutoUpdateUserSearchPredicate_54f2ca8c35bc := FALSE;
  p_AutoUpdateFullTextSearch_54f2ca8c35bc := TRUE;
  p_AutoUpdateExtendedType_54f2ca8c35bc := TRUE;
  p_IsComputed_54f2ca8c35bc := FALSE;
  p_ID_54f2ca8c35bc := '523273EF-7276-4DD2-9E6C-96421AF7C6A5';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_54f2ca8c35bc,
    'Description', p_Description_54f2ca8c35bc,
    'AutoUpdateDescription', p_AutoUpdateDescription_54f2ca8c35bc,
    'IsPrimaryKey', p_IsPrimaryKey_54f2ca8c35bc,
    'IsUnique', p_IsUnique_54f2ca8c35bc,
    'Category', p_Category_54f2ca8c35bc,
    'ValueListType', p_ValueListType_54f2ca8c35bc,
    'ExtendedType', p_ExtendedType_54f2ca8c35bc,
    'CodeType', p_CodeType_54f2ca8c35bc,
    'DefaultInView', p_DefaultInView_54f2ca8c35bc,
    'ViewCellTemplate', p_ViewCellTemplate_54f2ca8c35bc,
    'DefaultColumnWidth', p_DefaultColumnWidth_54f2ca8c35bc,
    'AllowUpdateAPI', p_AllowUpdateAPI_54f2ca8c35bc,
    'AllowUpdateInView', p_AllowUpdateInView_54f2ca8c35bc,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_54f2ca8c35bc,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_54f2ca8c35bc,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_54f2ca8c35bc,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_54f2ca8c35bc,
    'GeneratedFormSection', p_GeneratedFormSection_54f2ca8c35bc,
    'IsNameField', p_IsNameField_54f2ca8c35bc,
    'RelatedEntityID', p_RelatedEntityID_54f2ca8c35bc,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_54f2ca8c35bc,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_54f2ca8c35bc,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_54f2ca8c35bc,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_54f2ca8c35bc,
    'EntityIDFieldName', p_EntityIDFieldName_54f2ca8c35bc,
    'ScopeDefault', p_ScopeDefault_54f2ca8c35bc,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_54f2ca8c35bc,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_54f2ca8c35bc,
    'Status', p_Status_54f2ca8c35bc,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_54f2ca8c35bc,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_54f2ca8c35bc,
    'AutoUpdateCategory', p_AutoUpdateCategory_54f2ca8c35bc,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_54f2ca8c35bc,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_54f2ca8c35bc,
    'Encrypt', p_Encrypt_54f2ca8c35bc,
    'EncryptionKeyID', p_EncryptionKeyID_54f2ca8c35bc,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_54f2ca8c35bc,
    'SendEncryptedValue', p_SendEncryptedValue_54f2ca8c35bc,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_54f2ca8c35bc,
    'IsSoftForeignKey', p_IsSoftForeignKey_54f2ca8c35bc,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_54f2ca8c35bc,
    'JSONType', p_JSONType_54f2ca8c35bc,
    'JSONTypeIsArray', p_JSONTypeIsArray_54f2ca8c35bc,
    'JSONTypeDefinition', p_JSONTypeDefinition_54f2ca8c35bc,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_54f2ca8c35bc,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_54f2ca8c35bc,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_54f2ca8c35bc,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_54f2ca8c35bc,
    'IsComputed', p_IsComputed_54f2ca8c35bc
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_54f2ca8c35bc,
    'Configuration', p_Configuration_54f2ca8c35bc,
    'ID', p_ID_54f2ca8c35bc
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_54f2ca8c35bc, p_Description := p_Description_54f2ca8c35bc, p_AutoUpdateDescription := p_AutoUpdateDescription_54f2ca8c35bc, p_IsPrimaryKey := p_IsPrimaryKey_54f2ca8c35bc, p_IsUnique := p_IsUnique_54f2ca8c35bc, p_Category := p_Category_54f2ca8c35bc, p_ValueListType := p_ValueListType_54f2ca8c35bc, p_ExtendedType := p_ExtendedType_54f2ca8c35bc, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_54f2ca8c35bc, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_54f2ca8c35bc, p_ViewCellTemplate := p_ViewCellTemplate_54f2ca8c35bc, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_54f2ca8c35bc, p_AllowUpdateAPI := p_AllowUpdateAPI_54f2ca8c35bc, p_AllowUpdateInView := p_AllowUpdateInView_54f2ca8c35bc, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_54f2ca8c35bc, p_FullTextSearchEnabled := p_FullTextSearchEnabled_54f2ca8c35bc, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_54f2ca8c35bc, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_54f2ca8c35bc, p_GeneratedFormSection := p_GeneratedFormSection_54f2ca8c35bc, p_IsNameField := p_IsNameField_54f2ca8c35bc, p_RelatedEntityID := p_RelatedEntityID_54f2ca8c35bc, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_54f2ca8c35bc, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_54f2ca8c35bc, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_54f2ca8c35bc, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_54f2ca8c35bc, p_EntityIDFieldName := p_EntityIDFieldName_54f2ca8c35bc, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_54f2ca8c35bc, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_54f2ca8c35bc, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_54f2ca8c35bc, p_Status := p_Status_54f2ca8c35bc, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_54f2ca8c35bc, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_54f2ca8c35bc, p_AutoUpdateCategory := p_AutoUpdateCategory_54f2ca8c35bc, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_54f2ca8c35bc, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_54f2ca8c35bc, p_Encrypt := p_Encrypt_54f2ca8c35bc, p_EncryptionKeyID := p_EncryptionKeyID_54f2ca8c35bc, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_54f2ca8c35bc, p_SendEncryptedValue := p_SendEncryptedValue_54f2ca8c35bc, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_54f2ca8c35bc, p_IsSoftForeignKey := p_IsSoftForeignKey_54f2ca8c35bc, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_54f2ca8c35bc, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_54f2ca8c35bc, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_54f2ca8c35bc, p_JSONTypeDefinition := p_JSONTypeDefinition_54f2ca8c35bc, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_54f2ca8c35bc, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_54f2ca8c35bc, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_54f2ca8c35bc, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_54f2ca8c35bc, p_IsComputed := p_IsComputed_54f2ca8c35bc, p_EmbeddedRecord := p_EmbeddedRecord_54f2ca8c35bc, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_54f2ca8c35bc, p_Configuration_Clear := TRUE, p_ID := p_ID_54f2ca8c35bc);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_7ae6df8c9ec6 VARCHAR(255);
  p_Description_7ae6df8c9ec6 TEXT;
  p_AutoUpdateDescription_7ae6df8c9ec6 BOOLEAN;
  p_IsPrimaryKey_7ae6df8c9ec6 BOOLEAN;
  p_IsUnique_7ae6df8c9ec6 BOOLEAN;
  p_Category_7ae6df8c9ec6 VARCHAR(255);
  p_ValueListType_7ae6df8c9ec6 VARCHAR(20);
  p_ExtendedType_7ae6df8c9ec6 VARCHAR(50);
  p_CodeType_7ae6df8c9ec6 VARCHAR(50);
  p_DefaultInView_7ae6df8c9ec6 BOOLEAN;
  p_ViewCellTemplate_7ae6df8c9ec6 TEXT;
  p_DefaultColumnWidth_7ae6df8c9ec6 INTEGER;
  p_AllowUpdateAPI_7ae6df8c9ec6 BOOLEAN;
  p_AllowUpdateInView_7ae6df8c9ec6 BOOLEAN;
  p_IncludeInUserSearchAPI_7ae6df8c9ec6 BOOLEAN;
  p_FullTextSearchEnabled_7ae6df8c9ec6 BOOLEAN;
  p_UserSearchParamFormatAPI_7ae6df8c9ec6 VARCHAR(500);
  p_IncludeInGeneratedForm_7ae6df8c9ec6 BOOLEAN;
  p_GeneratedFormSection_7ae6df8c9ec6 VARCHAR(10);
  p_IsNameField_7ae6df8c9ec6 BOOLEAN;
  p_RelatedEntityID_7ae6df8c9ec6 UUID;
  p_RelatedEntityFieldName_7ae6df8c9ec6 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_7ae6df8c9ec6 BOOLEAN;
  p_RelatedEntityNameFieldMap_7ae6df8c9ec6 VARCHAR(255);
  p_RelatedEntityDisplayType_7ae6df8c9ec6 VARCHAR(20);
  p_EntityIDFieldName_7ae6df8c9ec6 VARCHAR(100);
  p_ScopeDefault_7ae6df8c9ec6 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_7ae6df8c9ec6 BOOLEAN;
  p_ValuesToPackWithSchema_7ae6df8c9ec6 VARCHAR(10);
  p_Status_7ae6df8c9ec6 VARCHAR(25);
  p_AutoUpdateIsNameField_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateDefaultInView_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateCategory_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateDisplayName_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_7ae6df8c9ec6 BOOLEAN;
  p_Encrypt_7ae6df8c9ec6 BOOLEAN;
  p_EncryptionKeyID_7ae6df8c9ec6 UUID;
  p_AllowDecryptInAPI_7ae6df8c9ec6 BOOLEAN;
  p_SendEncryptedValue_7ae6df8c9ec6 BOOLEAN;
  p_IsSoftPrimaryKey_7ae6df8c9ec6 BOOLEAN;
  p_IsSoftForeignKey_7ae6df8c9ec6 BOOLEAN;
  p_RelatedEntityJoinFields_7ae6df8c9ec6 TEXT;
  p_JSONType_7ae6df8c9ec6 VARCHAR(255);
  p_JSONTypeIsArray_7ae6df8c9ec6 BOOLEAN;
  p_JSONTypeDefinition_7ae6df8c9ec6 TEXT;
  p_UserSearchPredicateAPI_7ae6df8c9ec6 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateFullTextSearch_7ae6df8c9ec6 BOOLEAN;
  p_AutoUpdateExtendedType_7ae6df8c9ec6 BOOLEAN;
  p_IsComputed_7ae6df8c9ec6 BOOLEAN;
  p_EmbeddedRecord_7ae6df8c9ec6 TEXT;
  p_Configuration_7ae6df8c9ec6 TEXT;
  p_ID_7ae6df8c9ec6 UUID;
BEGIN
  p_DisplayName_7ae6df8c9ec6 := 'Name';
  p_Description_7ae6df8c9ec6 := 'Display name of the entitlement.';
  p_AutoUpdateDescription_7ae6df8c9ec6 := TRUE;
  p_IsPrimaryKey_7ae6df8c9ec6 := FALSE;
  p_IsUnique_7ae6df8c9ec6 := FALSE;
  p_Category_7ae6df8c9ec6 := 'Entitlement Configuration';
  p_ValueListType_7ae6df8c9ec6 := 'None';
  p_DefaultInView_7ae6df8c9ec6 := TRUE;
  p_DefaultColumnWidth_7ae6df8c9ec6 := 150;
  p_AllowUpdateAPI_7ae6df8c9ec6 := TRUE;
  p_AllowUpdateInView_7ae6df8c9ec6 := TRUE;
  p_IncludeInUserSearchAPI_7ae6df8c9ec6 := TRUE;
  p_FullTextSearchEnabled_7ae6df8c9ec6 := FALSE;
  p_IncludeInGeneratedForm_7ae6df8c9ec6 := TRUE;
  p_GeneratedFormSection_7ae6df8c9ec6 := 'Category';
  p_IsNameField_7ae6df8c9ec6 := TRUE;
  p_IncludeRelatedEntityNameFieldInBaseView_7ae6df8c9ec6 := FALSE;
  p_RelatedEntityDisplayType_7ae6df8c9ec6 := 'Search';
  p_AutoUpdateRelatedEntityInfo_7ae6df8c9ec6 := TRUE;
  p_ValuesToPackWithSchema_7ae6df8c9ec6 := 'Auto';
  p_Status_7ae6df8c9ec6 := 'Active';
  p_AutoUpdateIsNameField_7ae6df8c9ec6 := TRUE;
  p_AutoUpdateDefaultInView_7ae6df8c9ec6 := TRUE;
  p_AutoUpdateCategory_7ae6df8c9ec6 := TRUE;
  p_AutoUpdateDisplayName_7ae6df8c9ec6 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_7ae6df8c9ec6 := FALSE;
  p_Encrypt_7ae6df8c9ec6 := FALSE;
  p_AllowDecryptInAPI_7ae6df8c9ec6 := FALSE;
  p_SendEncryptedValue_7ae6df8c9ec6 := FALSE;
  p_IsSoftPrimaryKey_7ae6df8c9ec6 := FALSE;
  p_IsSoftForeignKey_7ae6df8c9ec6 := FALSE;
  p_JSONTypeIsArray_7ae6df8c9ec6 := FALSE;
  p_UserSearchPredicateAPI_7ae6df8c9ec6 := 'Contains';
  p_AutoUpdateUserSearchPredicate_7ae6df8c9ec6 := FALSE;
  p_AutoUpdateFullTextSearch_7ae6df8c9ec6 := TRUE;
  p_AutoUpdateExtendedType_7ae6df8c9ec6 := TRUE;
  p_IsComputed_7ae6df8c9ec6 := FALSE;
  p_ID_7ae6df8c9ec6 := 'FD900F32-C82E-4502-A4C1-C70F4C442232';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_7ae6df8c9ec6,
    'Description', p_Description_7ae6df8c9ec6,
    'AutoUpdateDescription', p_AutoUpdateDescription_7ae6df8c9ec6,
    'IsPrimaryKey', p_IsPrimaryKey_7ae6df8c9ec6,
    'IsUnique', p_IsUnique_7ae6df8c9ec6,
    'Category', p_Category_7ae6df8c9ec6,
    'ValueListType', p_ValueListType_7ae6df8c9ec6,
    'ExtendedType', p_ExtendedType_7ae6df8c9ec6,
    'CodeType', p_CodeType_7ae6df8c9ec6,
    'DefaultInView', p_DefaultInView_7ae6df8c9ec6,
    'ViewCellTemplate', p_ViewCellTemplate_7ae6df8c9ec6,
    'DefaultColumnWidth', p_DefaultColumnWidth_7ae6df8c9ec6,
    'AllowUpdateAPI', p_AllowUpdateAPI_7ae6df8c9ec6,
    'AllowUpdateInView', p_AllowUpdateInView_7ae6df8c9ec6,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_7ae6df8c9ec6,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_7ae6df8c9ec6,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_7ae6df8c9ec6,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_7ae6df8c9ec6,
    'GeneratedFormSection', p_GeneratedFormSection_7ae6df8c9ec6,
    'IsNameField', p_IsNameField_7ae6df8c9ec6,
    'RelatedEntityID', p_RelatedEntityID_7ae6df8c9ec6,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_7ae6df8c9ec6,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_7ae6df8c9ec6,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_7ae6df8c9ec6,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_7ae6df8c9ec6,
    'EntityIDFieldName', p_EntityIDFieldName_7ae6df8c9ec6,
    'ScopeDefault', p_ScopeDefault_7ae6df8c9ec6,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_7ae6df8c9ec6,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_7ae6df8c9ec6,
    'Status', p_Status_7ae6df8c9ec6,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_7ae6df8c9ec6,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_7ae6df8c9ec6,
    'AutoUpdateCategory', p_AutoUpdateCategory_7ae6df8c9ec6,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_7ae6df8c9ec6,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_7ae6df8c9ec6,
    'Encrypt', p_Encrypt_7ae6df8c9ec6,
    'EncryptionKeyID', p_EncryptionKeyID_7ae6df8c9ec6,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_7ae6df8c9ec6,
    'SendEncryptedValue', p_SendEncryptedValue_7ae6df8c9ec6,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_7ae6df8c9ec6,
    'IsSoftForeignKey', p_IsSoftForeignKey_7ae6df8c9ec6,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_7ae6df8c9ec6,
    'JSONType', p_JSONType_7ae6df8c9ec6,
    'JSONTypeIsArray', p_JSONTypeIsArray_7ae6df8c9ec6,
    'JSONTypeDefinition', p_JSONTypeDefinition_7ae6df8c9ec6,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_7ae6df8c9ec6,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_7ae6df8c9ec6,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_7ae6df8c9ec6,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_7ae6df8c9ec6,
    'IsComputed', p_IsComputed_7ae6df8c9ec6
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_7ae6df8c9ec6,
    'Configuration', p_Configuration_7ae6df8c9ec6,
    'ID', p_ID_7ae6df8c9ec6
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_7ae6df8c9ec6, p_Description := p_Description_7ae6df8c9ec6, p_AutoUpdateDescription := p_AutoUpdateDescription_7ae6df8c9ec6, p_IsPrimaryKey := p_IsPrimaryKey_7ae6df8c9ec6, p_IsUnique := p_IsUnique_7ae6df8c9ec6, p_Category := p_Category_7ae6df8c9ec6, p_ValueListType := p_ValueListType_7ae6df8c9ec6, p_ExtendedType := p_ExtendedType_7ae6df8c9ec6, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_7ae6df8c9ec6, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_7ae6df8c9ec6, p_ViewCellTemplate := p_ViewCellTemplate_7ae6df8c9ec6, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_7ae6df8c9ec6, p_AllowUpdateAPI := p_AllowUpdateAPI_7ae6df8c9ec6, p_AllowUpdateInView := p_AllowUpdateInView_7ae6df8c9ec6, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_7ae6df8c9ec6, p_FullTextSearchEnabled := p_FullTextSearchEnabled_7ae6df8c9ec6, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_7ae6df8c9ec6, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_7ae6df8c9ec6, p_GeneratedFormSection := p_GeneratedFormSection_7ae6df8c9ec6, p_IsNameField := p_IsNameField_7ae6df8c9ec6, p_RelatedEntityID := p_RelatedEntityID_7ae6df8c9ec6, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_7ae6df8c9ec6, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_7ae6df8c9ec6, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_7ae6df8c9ec6, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_7ae6df8c9ec6, p_EntityIDFieldName := p_EntityIDFieldName_7ae6df8c9ec6, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_7ae6df8c9ec6, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_7ae6df8c9ec6, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_7ae6df8c9ec6, p_Status := p_Status_7ae6df8c9ec6, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_7ae6df8c9ec6, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_7ae6df8c9ec6, p_AutoUpdateCategory := p_AutoUpdateCategory_7ae6df8c9ec6, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_7ae6df8c9ec6, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_7ae6df8c9ec6, p_Encrypt := p_Encrypt_7ae6df8c9ec6, p_EncryptionKeyID := p_EncryptionKeyID_7ae6df8c9ec6, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_7ae6df8c9ec6, p_SendEncryptedValue := p_SendEncryptedValue_7ae6df8c9ec6, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_7ae6df8c9ec6, p_IsSoftForeignKey := p_IsSoftForeignKey_7ae6df8c9ec6, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_7ae6df8c9ec6, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_7ae6df8c9ec6, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_7ae6df8c9ec6, p_JSONTypeDefinition := p_JSONTypeDefinition_7ae6df8c9ec6, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_7ae6df8c9ec6, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_7ae6df8c9ec6, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_7ae6df8c9ec6, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_7ae6df8c9ec6, p_IsComputed := p_IsComputed_7ae6df8c9ec6, p_EmbeddedRecord := p_EmbeddedRecord_7ae6df8c9ec6, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_7ae6df8c9ec6, p_Configuration_Clear := TRUE, p_ID := p_ID_7ae6df8c9ec6);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_bd0dd4a3670a VARCHAR(255);
  p_Description_bd0dd4a3670a TEXT;
  p_AutoUpdateDescription_bd0dd4a3670a BOOLEAN;
  p_IsPrimaryKey_bd0dd4a3670a BOOLEAN;
  p_IsUnique_bd0dd4a3670a BOOLEAN;
  p_Category_bd0dd4a3670a VARCHAR(255);
  p_ValueListType_bd0dd4a3670a VARCHAR(20);
  p_ExtendedType_bd0dd4a3670a VARCHAR(50);
  p_CodeType_bd0dd4a3670a VARCHAR(50);
  p_DefaultInView_bd0dd4a3670a BOOLEAN;
  p_ViewCellTemplate_bd0dd4a3670a TEXT;
  p_DefaultColumnWidth_bd0dd4a3670a INTEGER;
  p_AllowUpdateAPI_bd0dd4a3670a BOOLEAN;
  p_AllowUpdateInView_bd0dd4a3670a BOOLEAN;
  p_IncludeInUserSearchAPI_bd0dd4a3670a BOOLEAN;
  p_FullTextSearchEnabled_bd0dd4a3670a BOOLEAN;
  p_UserSearchParamFormatAPI_bd0dd4a3670a VARCHAR(500);
  p_IncludeInGeneratedForm_bd0dd4a3670a BOOLEAN;
  p_GeneratedFormSection_bd0dd4a3670a VARCHAR(10);
  p_IsNameField_bd0dd4a3670a BOOLEAN;
  p_RelatedEntityID_bd0dd4a3670a UUID;
  p_RelatedEntityFieldName_bd0dd4a3670a VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_bd0dd4a3670a BOOLEAN;
  p_RelatedEntityNameFieldMap_bd0dd4a3670a VARCHAR(255);
  p_RelatedEntityDisplayType_bd0dd4a3670a VARCHAR(20);
  p_EntityIDFieldName_bd0dd4a3670a VARCHAR(100);
  p_ScopeDefault_bd0dd4a3670a VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_bd0dd4a3670a BOOLEAN;
  p_ValuesToPackWithSchema_bd0dd4a3670a VARCHAR(10);
  p_Status_bd0dd4a3670a VARCHAR(25);
  p_AutoUpdateIsNameField_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateDefaultInView_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateCategory_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateDisplayName_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_bd0dd4a3670a BOOLEAN;
  p_Encrypt_bd0dd4a3670a BOOLEAN;
  p_EncryptionKeyID_bd0dd4a3670a UUID;
  p_AllowDecryptInAPI_bd0dd4a3670a BOOLEAN;
  p_SendEncryptedValue_bd0dd4a3670a BOOLEAN;
  p_IsSoftPrimaryKey_bd0dd4a3670a BOOLEAN;
  p_IsSoftForeignKey_bd0dd4a3670a BOOLEAN;
  p_RelatedEntityJoinFields_bd0dd4a3670a TEXT;
  p_JSONType_bd0dd4a3670a VARCHAR(255);
  p_JSONTypeIsArray_bd0dd4a3670a BOOLEAN;
  p_JSONTypeDefinition_bd0dd4a3670a TEXT;
  p_UserSearchPredicateAPI_bd0dd4a3670a VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateFullTextSearch_bd0dd4a3670a BOOLEAN;
  p_AutoUpdateExtendedType_bd0dd4a3670a BOOLEAN;
  p_IsComputed_bd0dd4a3670a BOOLEAN;
  p_EmbeddedRecord_bd0dd4a3670a TEXT;
  p_Configuration_bd0dd4a3670a TEXT;
  p_ID_bd0dd4a3670a UUID;
BEGIN
  p_DisplayName_bd0dd4a3670a := 'Company';
  p_AutoUpdateDescription_bd0dd4a3670a := TRUE;
  p_IsPrimaryKey_bd0dd4a3670a := FALSE;
  p_IsUnique_bd0dd4a3670a := FALSE;
  p_ValueListType_bd0dd4a3670a := 'None';
  p_DefaultInView_bd0dd4a3670a := TRUE;
  p_DefaultColumnWidth_bd0dd4a3670a := 150;
  p_AllowUpdateAPI_bd0dd4a3670a := FALSE;
  p_AllowUpdateInView_bd0dd4a3670a := TRUE;
  p_IncludeInUserSearchAPI_bd0dd4a3670a := FALSE;
  p_FullTextSearchEnabled_bd0dd4a3670a := FALSE;
  p_IncludeInGeneratedForm_bd0dd4a3670a := TRUE;
  p_GeneratedFormSection_bd0dd4a3670a := 'Details';
  p_IsNameField_bd0dd4a3670a := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_bd0dd4a3670a := FALSE;
  p_RelatedEntityDisplayType_bd0dd4a3670a := 'Search';
  p_AutoUpdateRelatedEntityInfo_bd0dd4a3670a := TRUE;
  p_ValuesToPackWithSchema_bd0dd4a3670a := 'Auto';
  p_Status_bd0dd4a3670a := 'Active';
  p_AutoUpdateIsNameField_bd0dd4a3670a := TRUE;
  p_AutoUpdateDefaultInView_bd0dd4a3670a := TRUE;
  p_AutoUpdateCategory_bd0dd4a3670a := TRUE;
  p_AutoUpdateDisplayName_bd0dd4a3670a := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_bd0dd4a3670a := TRUE;
  p_Encrypt_bd0dd4a3670a := FALSE;
  p_AllowDecryptInAPI_bd0dd4a3670a := FALSE;
  p_SendEncryptedValue_bd0dd4a3670a := FALSE;
  p_IsSoftPrimaryKey_bd0dd4a3670a := FALSE;
  p_IsSoftForeignKey_bd0dd4a3670a := FALSE;
  p_JSONTypeIsArray_bd0dd4a3670a := FALSE;
  p_UserSearchPredicateAPI_bd0dd4a3670a := 'Contains';
  p_AutoUpdateUserSearchPredicate_bd0dd4a3670a := TRUE;
  p_AutoUpdateFullTextSearch_bd0dd4a3670a := TRUE;
  p_AutoUpdateExtendedType_bd0dd4a3670a := TRUE;
  p_IsComputed_bd0dd4a3670a := FALSE;
  p_ID_bd0dd4a3670a := 'B5F1E9F6-E643-4B45-A3C7-316CB9ABEB3D';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_bd0dd4a3670a,
    'Description', p_Description_bd0dd4a3670a,
    'AutoUpdateDescription', p_AutoUpdateDescription_bd0dd4a3670a,
    'IsPrimaryKey', p_IsPrimaryKey_bd0dd4a3670a,
    'IsUnique', p_IsUnique_bd0dd4a3670a,
    'Category', p_Category_bd0dd4a3670a,
    'ValueListType', p_ValueListType_bd0dd4a3670a,
    'ExtendedType', p_ExtendedType_bd0dd4a3670a,
    'CodeType', p_CodeType_bd0dd4a3670a,
    'DefaultInView', p_DefaultInView_bd0dd4a3670a,
    'ViewCellTemplate', p_ViewCellTemplate_bd0dd4a3670a,
    'DefaultColumnWidth', p_DefaultColumnWidth_bd0dd4a3670a,
    'AllowUpdateAPI', p_AllowUpdateAPI_bd0dd4a3670a,
    'AllowUpdateInView', p_AllowUpdateInView_bd0dd4a3670a,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_bd0dd4a3670a,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_bd0dd4a3670a,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_bd0dd4a3670a,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_bd0dd4a3670a,
    'GeneratedFormSection', p_GeneratedFormSection_bd0dd4a3670a,
    'IsNameField', p_IsNameField_bd0dd4a3670a,
    'RelatedEntityID', p_RelatedEntityID_bd0dd4a3670a,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_bd0dd4a3670a,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_bd0dd4a3670a,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_bd0dd4a3670a,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_bd0dd4a3670a,
    'EntityIDFieldName', p_EntityIDFieldName_bd0dd4a3670a,
    'ScopeDefault', p_ScopeDefault_bd0dd4a3670a,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_bd0dd4a3670a,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_bd0dd4a3670a,
    'Status', p_Status_bd0dd4a3670a,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_bd0dd4a3670a,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_bd0dd4a3670a,
    'AutoUpdateCategory', p_AutoUpdateCategory_bd0dd4a3670a,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_bd0dd4a3670a,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_bd0dd4a3670a,
    'Encrypt', p_Encrypt_bd0dd4a3670a,
    'EncryptionKeyID', p_EncryptionKeyID_bd0dd4a3670a,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_bd0dd4a3670a,
    'SendEncryptedValue', p_SendEncryptedValue_bd0dd4a3670a,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_bd0dd4a3670a,
    'IsSoftForeignKey', p_IsSoftForeignKey_bd0dd4a3670a,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_bd0dd4a3670a,
    'JSONType', p_JSONType_bd0dd4a3670a,
    'JSONTypeIsArray', p_JSONTypeIsArray_bd0dd4a3670a,
    'JSONTypeDefinition', p_JSONTypeDefinition_bd0dd4a3670a,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_bd0dd4a3670a,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_bd0dd4a3670a,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_bd0dd4a3670a,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_bd0dd4a3670a,
    'IsComputed', p_IsComputed_bd0dd4a3670a
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_bd0dd4a3670a,
    'Configuration', p_Configuration_bd0dd4a3670a,
    'ID', p_ID_bd0dd4a3670a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_bd0dd4a3670a, p_Description := p_Description_bd0dd4a3670a, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_bd0dd4a3670a, p_IsPrimaryKey := p_IsPrimaryKey_bd0dd4a3670a, p_IsUnique := p_IsUnique_bd0dd4a3670a, p_Category := p_Category_bd0dd4a3670a, p_Category_Clear := TRUE, p_ValueListType := p_ValueListType_bd0dd4a3670a, p_ExtendedType := p_ExtendedType_bd0dd4a3670a, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_bd0dd4a3670a, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_bd0dd4a3670a, p_ViewCellTemplate := p_ViewCellTemplate_bd0dd4a3670a, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_bd0dd4a3670a, p_AllowUpdateAPI := p_AllowUpdateAPI_bd0dd4a3670a, p_AllowUpdateInView := p_AllowUpdateInView_bd0dd4a3670a, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_bd0dd4a3670a, p_FullTextSearchEnabled := p_FullTextSearchEnabled_bd0dd4a3670a, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_bd0dd4a3670a, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_bd0dd4a3670a, p_GeneratedFormSection := p_GeneratedFormSection_bd0dd4a3670a, p_IsNameField := p_IsNameField_bd0dd4a3670a, p_RelatedEntityID := p_RelatedEntityID_bd0dd4a3670a, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_bd0dd4a3670a, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_bd0dd4a3670a, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_bd0dd4a3670a, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_bd0dd4a3670a, p_EntityIDFieldName := p_EntityIDFieldName_bd0dd4a3670a, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_bd0dd4a3670a, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_bd0dd4a3670a, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_bd0dd4a3670a, p_Status := p_Status_bd0dd4a3670a, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_bd0dd4a3670a, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_bd0dd4a3670a, p_AutoUpdateCategory := p_AutoUpdateCategory_bd0dd4a3670a, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_bd0dd4a3670a, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_bd0dd4a3670a, p_Encrypt := p_Encrypt_bd0dd4a3670a, p_EncryptionKeyID := p_EncryptionKeyID_bd0dd4a3670a, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_bd0dd4a3670a, p_SendEncryptedValue := p_SendEncryptedValue_bd0dd4a3670a, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_bd0dd4a3670a, p_IsSoftForeignKey := p_IsSoftForeignKey_bd0dd4a3670a, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_bd0dd4a3670a, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_bd0dd4a3670a, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_bd0dd4a3670a, p_JSONTypeDefinition := p_JSONTypeDefinition_bd0dd4a3670a, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_bd0dd4a3670a, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_bd0dd4a3670a, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_bd0dd4a3670a, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_bd0dd4a3670a, p_IsComputed := p_IsComputed_bd0dd4a3670a, p_EmbeddedRecord := p_EmbeddedRecord_bd0dd4a3670a, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_bd0dd4a3670a, p_Configuration_Clear := TRUE, p_ID := p_ID_bd0dd4a3670a);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_d6b796a7c835 VARCHAR(255);
  p_Description_d6b796a7c835 TEXT;
  p_AutoUpdateDescription_d6b796a7c835 BOOLEAN;
  p_IsPrimaryKey_d6b796a7c835 BOOLEAN;
  p_IsUnique_d6b796a7c835 BOOLEAN;
  p_Category_d6b796a7c835 VARCHAR(255);
  p_ValueListType_d6b796a7c835 VARCHAR(20);
  p_ExtendedType_d6b796a7c835 VARCHAR(50);
  p_CodeType_d6b796a7c835 VARCHAR(50);
  p_DefaultInView_d6b796a7c835 BOOLEAN;
  p_ViewCellTemplate_d6b796a7c835 TEXT;
  p_DefaultColumnWidth_d6b796a7c835 INTEGER;
  p_AllowUpdateAPI_d6b796a7c835 BOOLEAN;
  p_AllowUpdateInView_d6b796a7c835 BOOLEAN;
  p_IncludeInUserSearchAPI_d6b796a7c835 BOOLEAN;
  p_FullTextSearchEnabled_d6b796a7c835 BOOLEAN;
  p_UserSearchParamFormatAPI_d6b796a7c835 VARCHAR(500);
  p_IncludeInGeneratedForm_d6b796a7c835 BOOLEAN;
  p_GeneratedFormSection_d6b796a7c835 VARCHAR(10);
  p_IsNameField_d6b796a7c835 BOOLEAN;
  p_RelatedEntityID_d6b796a7c835 UUID;
  p_RelatedEntityFieldName_d6b796a7c835 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835 BOOLEAN;
  p_RelatedEntityNameFieldMap_d6b796a7c835 VARCHAR(255);
  p_RelatedEntityDisplayType_d6b796a7c835 VARCHAR(20);
  p_EntityIDFieldName_d6b796a7c835 VARCHAR(100);
  p_ScopeDefault_d6b796a7c835 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_d6b796a7c835 BOOLEAN;
  p_ValuesToPackWithSchema_d6b796a7c835 VARCHAR(10);
  p_Status_d6b796a7c835 VARCHAR(25);
  p_AutoUpdateIsNameField_d6b796a7c835 BOOLEAN;
  p_AutoUpdateDefaultInView_d6b796a7c835 BOOLEAN;
  p_AutoUpdateCategory_d6b796a7c835 BOOLEAN;
  p_AutoUpdateDisplayName_d6b796a7c835 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835 BOOLEAN;
  p_Encrypt_d6b796a7c835 BOOLEAN;
  p_EncryptionKeyID_d6b796a7c835 UUID;
  p_AllowDecryptInAPI_d6b796a7c835 BOOLEAN;
  p_SendEncryptedValue_d6b796a7c835 BOOLEAN;
  p_IsSoftPrimaryKey_d6b796a7c835 BOOLEAN;
  p_IsSoftForeignKey_d6b796a7c835 BOOLEAN;
  p_RelatedEntityJoinFields_d6b796a7c835 TEXT;
  p_JSONType_d6b796a7c835 VARCHAR(255);
  p_JSONTypeIsArray_d6b796a7c835 BOOLEAN;
  p_JSONTypeDefinition_d6b796a7c835 TEXT;
  p_UserSearchPredicateAPI_d6b796a7c835 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_d6b796a7c835 BOOLEAN;
  p_AutoUpdateFullTextSearch_d6b796a7c835 BOOLEAN;
  p_AutoUpdateExtendedType_d6b796a7c835 BOOLEAN;
  p_IsComputed_d6b796a7c835 BOOLEAN;
  p_EmbeddedRecord_d6b796a7c835 TEXT;
  p_Configuration_d6b796a7c835 TEXT;
  p_ID_d6b796a7c835 UUID;
BEGIN
  p_DisplayName_d6b796a7c835 := 'Is Active';
  p_Description_d6b796a7c835 := 'Only an active program approves a concession. Deactivate a program rather than deleting it: approved concessions keep naming it.';
  p_AutoUpdateDescription_d6b796a7c835 := TRUE;
  p_IsPrimaryKey_d6b796a7c835 := FALSE;
  p_IsUnique_d6b796a7c835 := FALSE;
  p_Category_d6b796a7c835 := 'Program Details';
  p_ValueListType_d6b796a7c835 := 'None';
  p_DefaultInView_d6b796a7c835 := TRUE;
  p_DefaultColumnWidth_d6b796a7c835 := 150;
  p_AllowUpdateAPI_d6b796a7c835 := TRUE;
  p_AllowUpdateInView_d6b796a7c835 := TRUE;
  p_IncludeInUserSearchAPI_d6b796a7c835 := FALSE;
  p_FullTextSearchEnabled_d6b796a7c835 := FALSE;
  p_IncludeInGeneratedForm_d6b796a7c835 := TRUE;
  p_GeneratedFormSection_d6b796a7c835 := 'Category';
  p_IsNameField_d6b796a7c835 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835 := FALSE;
  p_RelatedEntityDisplayType_d6b796a7c835 := 'Search';
  p_AutoUpdateRelatedEntityInfo_d6b796a7c835 := TRUE;
  p_ValuesToPackWithSchema_d6b796a7c835 := 'Auto';
  p_Status_d6b796a7c835 := 'Active';
  p_AutoUpdateIsNameField_d6b796a7c835 := TRUE;
  p_AutoUpdateDefaultInView_d6b796a7c835 := TRUE;
  p_AutoUpdateCategory_d6b796a7c835 := TRUE;
  p_AutoUpdateDisplayName_d6b796a7c835 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835 := TRUE;
  p_Encrypt_d6b796a7c835 := FALSE;
  p_AllowDecryptInAPI_d6b796a7c835 := FALSE;
  p_SendEncryptedValue_d6b796a7c835 := FALSE;
  p_IsSoftPrimaryKey_d6b796a7c835 := FALSE;
  p_IsSoftForeignKey_d6b796a7c835 := FALSE;
  p_JSONTypeIsArray_d6b796a7c835 := FALSE;
  p_UserSearchPredicateAPI_d6b796a7c835 := 'Contains';
  p_AutoUpdateUserSearchPredicate_d6b796a7c835 := TRUE;
  p_AutoUpdateFullTextSearch_d6b796a7c835 := TRUE;
  p_AutoUpdateExtendedType_d6b796a7c835 := TRUE;
  p_IsComputed_d6b796a7c835 := FALSE;
  p_ID_d6b796a7c835 := 'E6646651-5BDA-4CC6-B646-370FAA915786';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_d6b796a7c835,
    'Description', p_Description_d6b796a7c835,
    'AutoUpdateDescription', p_AutoUpdateDescription_d6b796a7c835,
    'IsPrimaryKey', p_IsPrimaryKey_d6b796a7c835,
    'IsUnique', p_IsUnique_d6b796a7c835,
    'Category', p_Category_d6b796a7c835,
    'ValueListType', p_ValueListType_d6b796a7c835,
    'ExtendedType', p_ExtendedType_d6b796a7c835,
    'CodeType', p_CodeType_d6b796a7c835,
    'DefaultInView', p_DefaultInView_d6b796a7c835,
    'ViewCellTemplate', p_ViewCellTemplate_d6b796a7c835,
    'DefaultColumnWidth', p_DefaultColumnWidth_d6b796a7c835,
    'AllowUpdateAPI', p_AllowUpdateAPI_d6b796a7c835,
    'AllowUpdateInView', p_AllowUpdateInView_d6b796a7c835,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_d6b796a7c835,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_d6b796a7c835,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_d6b796a7c835,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_d6b796a7c835,
    'GeneratedFormSection', p_GeneratedFormSection_d6b796a7c835,
    'IsNameField', p_IsNameField_d6b796a7c835,
    'RelatedEntityID', p_RelatedEntityID_d6b796a7c835,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_d6b796a7c835,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_d6b796a7c835,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_d6b796a7c835,
    'EntityIDFieldName', p_EntityIDFieldName_d6b796a7c835,
    'ScopeDefault', p_ScopeDefault_d6b796a7c835,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_d6b796a7c835,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_d6b796a7c835,
    'Status', p_Status_d6b796a7c835,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_d6b796a7c835,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_d6b796a7c835,
    'AutoUpdateCategory', p_AutoUpdateCategory_d6b796a7c835,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_d6b796a7c835,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835,
    'Encrypt', p_Encrypt_d6b796a7c835,
    'EncryptionKeyID', p_EncryptionKeyID_d6b796a7c835,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_d6b796a7c835,
    'SendEncryptedValue', p_SendEncryptedValue_d6b796a7c835,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_d6b796a7c835,
    'IsSoftForeignKey', p_IsSoftForeignKey_d6b796a7c835,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_d6b796a7c835,
    'JSONType', p_JSONType_d6b796a7c835,
    'JSONTypeIsArray', p_JSONTypeIsArray_d6b796a7c835,
    'JSONTypeDefinition', p_JSONTypeDefinition_d6b796a7c835,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_d6b796a7c835,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_d6b796a7c835,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_d6b796a7c835,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_d6b796a7c835,
    'IsComputed', p_IsComputed_d6b796a7c835
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_d6b796a7c835,
    'Configuration', p_Configuration_d6b796a7c835,
    'ID', p_ID_d6b796a7c835
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_d6b796a7c835, p_Description := p_Description_d6b796a7c835, p_AutoUpdateDescription := p_AutoUpdateDescription_d6b796a7c835, p_IsPrimaryKey := p_IsPrimaryKey_d6b796a7c835, p_IsUnique := p_IsUnique_d6b796a7c835, p_Category := p_Category_d6b796a7c835, p_ValueListType := p_ValueListType_d6b796a7c835, p_ExtendedType := p_ExtendedType_d6b796a7c835, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_d6b796a7c835, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_d6b796a7c835, p_ViewCellTemplate := p_ViewCellTemplate_d6b796a7c835, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_d6b796a7c835, p_AllowUpdateAPI := p_AllowUpdateAPI_d6b796a7c835, p_AllowUpdateInView := p_AllowUpdateInView_d6b796a7c835, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_d6b796a7c835, p_FullTextSearchEnabled := p_FullTextSearchEnabled_d6b796a7c835, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_d6b796a7c835, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_d6b796a7c835, p_GeneratedFormSection := p_GeneratedFormSection_d6b796a7c835, p_IsNameField := p_IsNameField_d6b796a7c835, p_RelatedEntityID := p_RelatedEntityID_d6b796a7c835, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_d6b796a7c835, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_d6b796a7c835, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_d6b796a7c835, p_EntityIDFieldName := p_EntityIDFieldName_d6b796a7c835, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_d6b796a7c835, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_d6b796a7c835, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_d6b796a7c835, p_Status := p_Status_d6b796a7c835, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_d6b796a7c835, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_d6b796a7c835, p_AutoUpdateCategory := p_AutoUpdateCategory_d6b796a7c835, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_d6b796a7c835, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835, p_Encrypt := p_Encrypt_d6b796a7c835, p_EncryptionKeyID := p_EncryptionKeyID_d6b796a7c835, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_d6b796a7c835, p_SendEncryptedValue := p_SendEncryptedValue_d6b796a7c835, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_d6b796a7c835, p_IsSoftForeignKey := p_IsSoftForeignKey_d6b796a7c835, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_d6b796a7c835, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_d6b796a7c835, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_d6b796a7c835, p_JSONTypeDefinition := p_JSONTypeDefinition_d6b796a7c835, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_d6b796a7c835, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_d6b796a7c835, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_d6b796a7c835, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_d6b796a7c835, p_IsComputed := p_IsComputed_d6b796a7c835, p_EmbeddedRecord := p_EmbeddedRecord_d6b796a7c835, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_d6b796a7c835, p_Configuration_Clear := TRUE, p_ID := p_ID_d6b796a7c835);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_693cbf5ee0c8 VARCHAR(255);
  p_Description_693cbf5ee0c8 TEXT;
  p_AutoUpdateDescription_693cbf5ee0c8 BOOLEAN;
  p_IsPrimaryKey_693cbf5ee0c8 BOOLEAN;
  p_IsUnique_693cbf5ee0c8 BOOLEAN;
  p_Category_693cbf5ee0c8 VARCHAR(255);
  p_ValueListType_693cbf5ee0c8 VARCHAR(20);
  p_ExtendedType_693cbf5ee0c8 VARCHAR(50);
  p_CodeType_693cbf5ee0c8 VARCHAR(50);
  p_DefaultInView_693cbf5ee0c8 BOOLEAN;
  p_ViewCellTemplate_693cbf5ee0c8 TEXT;
  p_DefaultColumnWidth_693cbf5ee0c8 INTEGER;
  p_AllowUpdateAPI_693cbf5ee0c8 BOOLEAN;
  p_AllowUpdateInView_693cbf5ee0c8 BOOLEAN;
  p_IncludeInUserSearchAPI_693cbf5ee0c8 BOOLEAN;
  p_FullTextSearchEnabled_693cbf5ee0c8 BOOLEAN;
  p_UserSearchParamFormatAPI_693cbf5ee0c8 VARCHAR(500);
  p_IncludeInGeneratedForm_693cbf5ee0c8 BOOLEAN;
  p_GeneratedFormSection_693cbf5ee0c8 VARCHAR(10);
  p_IsNameField_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityID_693cbf5ee0c8 UUID;
  p_RelatedEntityFieldName_693cbf5ee0c8 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityNameFieldMap_693cbf5ee0c8 VARCHAR(255);
  p_RelatedEntityDisplayType_693cbf5ee0c8 VARCHAR(20);
  p_EntityIDFieldName_693cbf5ee0c8 VARCHAR(100);
  p_ScopeDefault_693cbf5ee0c8 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8 BOOLEAN;
  p_ValuesToPackWithSchema_693cbf5ee0c8 VARCHAR(10);
  p_Status_693cbf5ee0c8 VARCHAR(25);
  p_AutoUpdateIsNameField_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateDefaultInView_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateCategory_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateDisplayName_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8 BOOLEAN;
  p_Encrypt_693cbf5ee0c8 BOOLEAN;
  p_EncryptionKeyID_693cbf5ee0c8 UUID;
  p_AllowDecryptInAPI_693cbf5ee0c8 BOOLEAN;
  p_SendEncryptedValue_693cbf5ee0c8 BOOLEAN;
  p_IsSoftPrimaryKey_693cbf5ee0c8 BOOLEAN;
  p_IsSoftForeignKey_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityJoinFields_693cbf5ee0c8 TEXT;
  p_JSONType_693cbf5ee0c8 VARCHAR(255);
  p_JSONTypeIsArray_693cbf5ee0c8 BOOLEAN;
  p_JSONTypeDefinition_693cbf5ee0c8 TEXT;
  p_UserSearchPredicateAPI_693cbf5ee0c8 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateFullTextSearch_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateExtendedType_693cbf5ee0c8 BOOLEAN;
  p_IsComputed_693cbf5ee0c8 BOOLEAN;
  p_EmbeddedRecord_693cbf5ee0c8 TEXT;
  p_Configuration_693cbf5ee0c8 TEXT;
  p_ID_693cbf5ee0c8 UUID;
BEGIN
  p_DisplayName_693cbf5ee0c8 := 'Description';
  p_Description_693cbf5ee0c8 := 'The program''s terms as the customer was told them.';
  p_AutoUpdateDescription_693cbf5ee0c8 := TRUE;
  p_IsPrimaryKey_693cbf5ee0c8 := FALSE;
  p_IsUnique_693cbf5ee0c8 := FALSE;
  p_Category_693cbf5ee0c8 := 'Program Details';
  p_ValueListType_693cbf5ee0c8 := 'None';
  p_DefaultInView_693cbf5ee0c8 := FALSE;
  p_DefaultColumnWidth_693cbf5ee0c8 := 150;
  p_AllowUpdateAPI_693cbf5ee0c8 := TRUE;
  p_AllowUpdateInView_693cbf5ee0c8 := TRUE;
  p_IncludeInUserSearchAPI_693cbf5ee0c8 := FALSE;
  p_FullTextSearchEnabled_693cbf5ee0c8 := FALSE;
  p_IncludeInGeneratedForm_693cbf5ee0c8 := TRUE;
  p_GeneratedFormSection_693cbf5ee0c8 := 'Category';
  p_IsNameField_693cbf5ee0c8 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8 := FALSE;
  p_RelatedEntityDisplayType_693cbf5ee0c8 := 'Search';
  p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8 := TRUE;
  p_ValuesToPackWithSchema_693cbf5ee0c8 := 'Auto';
  p_Status_693cbf5ee0c8 := 'Active';
  p_AutoUpdateIsNameField_693cbf5ee0c8 := TRUE;
  p_AutoUpdateDefaultInView_693cbf5ee0c8 := TRUE;
  p_AutoUpdateCategory_693cbf5ee0c8 := TRUE;
  p_AutoUpdateDisplayName_693cbf5ee0c8 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8 := TRUE;
  p_Encrypt_693cbf5ee0c8 := FALSE;
  p_AllowDecryptInAPI_693cbf5ee0c8 := FALSE;
  p_SendEncryptedValue_693cbf5ee0c8 := FALSE;
  p_IsSoftPrimaryKey_693cbf5ee0c8 := FALSE;
  p_IsSoftForeignKey_693cbf5ee0c8 := FALSE;
  p_JSONTypeIsArray_693cbf5ee0c8 := FALSE;
  p_UserSearchPredicateAPI_693cbf5ee0c8 := 'Contains';
  p_AutoUpdateUserSearchPredicate_693cbf5ee0c8 := TRUE;
  p_AutoUpdateFullTextSearch_693cbf5ee0c8 := TRUE;
  p_AutoUpdateExtendedType_693cbf5ee0c8 := TRUE;
  p_IsComputed_693cbf5ee0c8 := FALSE;
  p_ID_693cbf5ee0c8 := '3D0C49F4-DCB0-490E-B2A5-C326DC49BD56';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_693cbf5ee0c8,
    'Description', p_Description_693cbf5ee0c8,
    'AutoUpdateDescription', p_AutoUpdateDescription_693cbf5ee0c8,
    'IsPrimaryKey', p_IsPrimaryKey_693cbf5ee0c8,
    'IsUnique', p_IsUnique_693cbf5ee0c8,
    'Category', p_Category_693cbf5ee0c8,
    'ValueListType', p_ValueListType_693cbf5ee0c8,
    'ExtendedType', p_ExtendedType_693cbf5ee0c8,
    'CodeType', p_CodeType_693cbf5ee0c8,
    'DefaultInView', p_DefaultInView_693cbf5ee0c8,
    'ViewCellTemplate', p_ViewCellTemplate_693cbf5ee0c8,
    'DefaultColumnWidth', p_DefaultColumnWidth_693cbf5ee0c8,
    'AllowUpdateAPI', p_AllowUpdateAPI_693cbf5ee0c8,
    'AllowUpdateInView', p_AllowUpdateInView_693cbf5ee0c8,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_693cbf5ee0c8,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_693cbf5ee0c8,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_693cbf5ee0c8,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_693cbf5ee0c8,
    'GeneratedFormSection', p_GeneratedFormSection_693cbf5ee0c8,
    'IsNameField', p_IsNameField_693cbf5ee0c8,
    'RelatedEntityID', p_RelatedEntityID_693cbf5ee0c8,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_693cbf5ee0c8,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_693cbf5ee0c8,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_693cbf5ee0c8,
    'EntityIDFieldName', p_EntityIDFieldName_693cbf5ee0c8,
    'ScopeDefault', p_ScopeDefault_693cbf5ee0c8,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_693cbf5ee0c8,
    'Status', p_Status_693cbf5ee0c8,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_693cbf5ee0c8,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_693cbf5ee0c8,
    'AutoUpdateCategory', p_AutoUpdateCategory_693cbf5ee0c8,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_693cbf5ee0c8,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8,
    'Encrypt', p_Encrypt_693cbf5ee0c8,
    'EncryptionKeyID', p_EncryptionKeyID_693cbf5ee0c8,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_693cbf5ee0c8,
    'SendEncryptedValue', p_SendEncryptedValue_693cbf5ee0c8,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_693cbf5ee0c8,
    'IsSoftForeignKey', p_IsSoftForeignKey_693cbf5ee0c8,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_693cbf5ee0c8,
    'JSONType', p_JSONType_693cbf5ee0c8,
    'JSONTypeIsArray', p_JSONTypeIsArray_693cbf5ee0c8,
    'JSONTypeDefinition', p_JSONTypeDefinition_693cbf5ee0c8,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_693cbf5ee0c8,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_693cbf5ee0c8,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_693cbf5ee0c8,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_693cbf5ee0c8,
    'IsComputed', p_IsComputed_693cbf5ee0c8
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_693cbf5ee0c8,
    'Configuration', p_Configuration_693cbf5ee0c8,
    'ID', p_ID_693cbf5ee0c8
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_693cbf5ee0c8, p_Description := p_Description_693cbf5ee0c8, p_AutoUpdateDescription := p_AutoUpdateDescription_693cbf5ee0c8, p_IsPrimaryKey := p_IsPrimaryKey_693cbf5ee0c8, p_IsUnique := p_IsUnique_693cbf5ee0c8, p_Category := p_Category_693cbf5ee0c8, p_ValueListType := p_ValueListType_693cbf5ee0c8, p_ExtendedType := p_ExtendedType_693cbf5ee0c8, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_693cbf5ee0c8, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_693cbf5ee0c8, p_ViewCellTemplate := p_ViewCellTemplate_693cbf5ee0c8, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_693cbf5ee0c8, p_AllowUpdateAPI := p_AllowUpdateAPI_693cbf5ee0c8, p_AllowUpdateInView := p_AllowUpdateInView_693cbf5ee0c8, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_693cbf5ee0c8, p_FullTextSearchEnabled := p_FullTextSearchEnabled_693cbf5ee0c8, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_693cbf5ee0c8, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_693cbf5ee0c8, p_GeneratedFormSection := p_GeneratedFormSection_693cbf5ee0c8, p_IsNameField := p_IsNameField_693cbf5ee0c8, p_RelatedEntityID := p_RelatedEntityID_693cbf5ee0c8, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_693cbf5ee0c8, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_693cbf5ee0c8, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_693cbf5ee0c8, p_EntityIDFieldName := p_EntityIDFieldName_693cbf5ee0c8, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_693cbf5ee0c8, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_693cbf5ee0c8, p_Status := p_Status_693cbf5ee0c8, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_693cbf5ee0c8, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_693cbf5ee0c8, p_AutoUpdateCategory := p_AutoUpdateCategory_693cbf5ee0c8, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_693cbf5ee0c8, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8, p_Encrypt := p_Encrypt_693cbf5ee0c8, p_EncryptionKeyID := p_EncryptionKeyID_693cbf5ee0c8, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_693cbf5ee0c8, p_SendEncryptedValue := p_SendEncryptedValue_693cbf5ee0c8, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_693cbf5ee0c8, p_IsSoftForeignKey := p_IsSoftForeignKey_693cbf5ee0c8, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_693cbf5ee0c8, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_693cbf5ee0c8, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_693cbf5ee0c8, p_JSONTypeDefinition := p_JSONTypeDefinition_693cbf5ee0c8, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_693cbf5ee0c8, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_693cbf5ee0c8, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_693cbf5ee0c8, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_693cbf5ee0c8, p_IsComputed := p_IsComputed_693cbf5ee0c8, p_EmbeddedRecord := p_EmbeddedRecord_693cbf5ee0c8, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_693cbf5ee0c8, p_Configuration_Clear := TRUE, p_ID := p_ID_693cbf5ee0c8);
  END IF;
END $mj$;
