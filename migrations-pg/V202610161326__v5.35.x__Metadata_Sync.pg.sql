-- =============================================================================================
-- PostgreSQL counterpart of V202610161326__v5.35.x__Metadata_Sync.sql -- BizApps Orders v5.35.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) on the push log the T-SQL file
--     was generated from. Each record is a DO block that calls the core or app function, in
--     whichever signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones, block for block:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Every string value is taken verbatim from the T-SQL file: the converter rewrites T-SQL
--     inside string literals.
--   * Core calls use ${mjSchema}; this app's schema is written as the converter emits it.
-- =============================================================================================

SET standard_conforming_strings = on;

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
  p_Description_4bc6c477fd41 := 'Cancel a subscription: policy in, reversal out. The subscription type''s cancellation mode, refund mode and grace period decide when coverage ends, when access ends and what is refunded; the operation emits the reversal order, stamps the term and logs the lifecycle event in one transaction. Grace extends ACCESS, never revenue — storing one in place of the other silently revokes access early.';
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
}

/** A later term cancelled alongside the affected one. */
export interface CanceledLaterTermResult {
    SubscriptionTermID: string;
    TermNumber: number;
    Decision: CancellationDecisionResult;
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
  p_ID_4bc6c477fd41 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.CancelSubscription' ORDER BY CASE WHEN "ID" = p_ID_4bc6c477fd41 THEN 0 ELSE 1 END LIMIT 1), p_ID_4bc6c477fd41);
  p_CategoryID_4bc6c477fd41 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = p_CategoryID_4bc6c477fd41 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_4bc6c477fd41);
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


-- ===================== Other =====================

-- End of SQL Logging Session
-- Session ID: ebd937f0-7e67-4565-926c-7989a572b8d2
-- Completed: 2026-10-16T13:25:40.705Z
-- Duration: 4715ms
-- Total Statements: 1
