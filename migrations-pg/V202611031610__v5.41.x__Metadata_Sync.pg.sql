-- =============================================================================================
-- PostgreSQL counterpart of V202611031610__v5.41.x__Metadata_Sync.sql -- BizApps Orders v5.41.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file was
--     generated from. Each record is a DO block that calls the core function in whichever signature
--     the host has (jsonb or named parameters).
--   * The converter does not translate the lookups the T-SQL file adds to the remote
--     operation's update, so they are written here by hand from the T-SQL ones:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--   * Core calls use ${mjSchema}.
--   * Every string value matches the T-SQL file (the converter rewrote none here).
-- =============================================================================================

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_ae7c80fb5431 VARCHAR(255);
  p_OperationKey_ae7c80fb5431 VARCHAR(255);
  p_CategoryID_ae7c80fb5431 UUID;
  p_Description_ae7c80fb5431 TEXT;
  p_InputTypeName_ae7c80fb5431 VARCHAR(255);
  p_InputTypeDefinition_ae7c80fb5431 TEXT;
  p_InputTypeIsArray_ae7c80fb5431 BOOLEAN;
  p_OutputTypeName_ae7c80fb5431 VARCHAR(255);
  p_OutputTypeDefinition_ae7c80fb5431 TEXT;
  p_OutputTypeIsArray_ae7c80fb5431 BOOLEAN;
  p_ExecutionMode_ae7c80fb5431 VARCHAR(20);
  p_RequiredScope_ae7c80fb5431 VARCHAR(255);
  p_RequiresSystemUser_ae7c80fb5431 BOOLEAN;
  p_GenerationType_ae7c80fb5431 VARCHAR(20);
  p_Code_ae7c80fb5431 TEXT;
  p_CodeApprovalStatus_ae7c80fb5431 VARCHAR(20);
  p_CodeApprovedByUserID_ae7c80fb5431 UUID;
  p_CodeApprovedAt_ae7c80fb5431 TIMESTAMPTZ;
  p_ContractFingerprint_ae7c80fb5431 VARCHAR(100);
  p_Status_ae7c80fb5431 VARCHAR(20);
  p_CacheTTLSeconds_ae7c80fb5431 INTEGER;
  p_TimeoutMS_ae7c80fb5431 INTEGER;
  p_MaxConcurrency_ae7c80fb5431 INTEGER;
  p_CodeLocked_ae7c80fb5431 BOOLEAN;
  p_CodeComments_ae7c80fb5431 TEXT;
  p_Libraries_ae7c80fb5431 TEXT;
  p_ID_ae7c80fb5431 UUID;
BEGIN
  p_Name_ae7c80fb5431 := 'Spawn Renewals';
  p_OperationKey_ae7c80fb5431 := 'Orders.SpawnRenewals';
  p_CategoryID_ae7c80fb5431 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304';
  p_Description_ae7c80fb5431 := 'Place renewal orders for subscriptions whose latest term expires inside their own lead window and whose holder consented via auto-renew. Two independent idempotency guards, because an unattended job that double-spawns double-bills: the selection only finds subscriptions whose LATEST term is expiring, plus an explicit check for an order already renewing that subscription. Renewals bypass the concurrency rule — a renewal is not a second subscription.';
  p_InputTypeName_ae7c80fb5431 := 'SpawnRenewalsInput';
  p_InputTypeDefinition_ae7c80fb5431 := '/**
 * Input for `Orders.SpawnRenewals`.
 *
 * A renewal is a SCHEDULED CONTINUATION and auto-renew is the consent switch. This
 * finds subscriptions whose LATEST term expires inside their own lead window and
 * places a confirmed renewal order for each that consented.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}
';
  p_InputTypeIsArray_ae7c80fb5431 := FALSE;
  p_OutputTypeName_ae7c80fb5431 := 'SpawnRenewalsOutput';
  p_OutputTypeDefinition_ae7c80fb5431 := '/**
 * Output for `Orders.SpawnRenewals`.
 *
 * Every candidate comes back whether or not an order was placed, with the reason it
 * was skipped — an unattended job that silently does nothing is indistinguishable
 * from one that is broken.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RenewalCandidate {
    SubscriptionID: string;
    SubscriptionNumber: string;
    ProductID: string;
    /** End of the term that is expiring. */
    CurrentTermEnd: string;
    /** Lead days actually applied, after the subscription''s override of the type''s default. */
    LeadDays: number;
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription''s own, or its successor. */
    RenewalProductID?: string;
    /**
     * The renewal''s unit price before the increase. When the line that bought the expiring term bought
     * several terms (a 24-month line on a 12-month type), one term''s share of that line''s price.
     */
    BasePrice?: number;
    /** Where the base price came from: the prior term''s price, its list price, or the successor''s list. */
    BasePriceSource?: ''PriorPrice'' | ''PriorList'' | ''SuccessorList'';
    /** The increase applied, in percent: 0 when none is set or the new term crosses no anniversary. */
    IncreasePercent?: number;
    /** The level the increase was set at. */
    IncreaseSource?: ''Subscription'' | ''Product'' | ''Category'' | ''Company'' | ''None'';
    /** The renewal line''s unit price: the base plus the increase. */
    UnitPrice?: number;
    /** The renewal line''s discount, as a fraction: 0 unless the subscription carries its discount into renewals. */
    DiscountPct?: number;
    /** First day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermStart?: string;
    /** Last day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermEnd?: string;
    /**
     * Promotion codes that carried into the renewal and discounted it: codes recorded on the line that
     * bought the expiring term whose promotion has `AppliesToRenewals` set. Absent when none were presented.
     */
    RenewalPromotionCodes?: string[];
    /**
     * Codes presented on the renewal that gave no discount, each with the reason: the promotion paused,
     * expired or out of its dates, or its other rules not met. The renewal is placed without them.
     */
    UnusableRenewalPromotionCodes?: Array<{ Code: string; Reason: string }>;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}
';
  p_OutputTypeIsArray_ae7c80fb5431 := FALSE;
  p_ExecutionMode_ae7c80fb5431 := 'LongRunning';
  p_RequiredScope_ae7c80fb5431 := 'orders:subscriptions:write';
  p_RequiresSystemUser_ae7c80fb5431 := FALSE;
  p_GenerationType_ae7c80fb5431 := 'Manual';
  p_CodeApprovalStatus_ae7c80fb5431 := 'Approved';
  p_Status_ae7c80fb5431 := 'Active';
  p_CodeLocked_ae7c80fb5431 := FALSE;
  p_ID_ae7c80fb5431 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C409';
  p_ID_ae7c80fb5431 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.SpawnRenewals' ORDER BY CASE WHEN "ID" = p_ID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1), p_ID_ae7c80fb5431);
  p_CategoryID_ae7c80fb5431 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = p_CategoryID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_ae7c80fb5431);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_ae7c80fb5431,
    'OperationKey', p_OperationKey_ae7c80fb5431,
    'CategoryID', p_CategoryID_ae7c80fb5431,
    'Description', p_Description_ae7c80fb5431,
    'InputTypeName', p_InputTypeName_ae7c80fb5431,
    'InputTypeDefinition', p_InputTypeDefinition_ae7c80fb5431,
    'InputTypeIsArray', p_InputTypeIsArray_ae7c80fb5431,
    'OutputTypeName', p_OutputTypeName_ae7c80fb5431,
    'OutputTypeDefinition', p_OutputTypeDefinition_ae7c80fb5431,
    'OutputTypeIsArray', p_OutputTypeIsArray_ae7c80fb5431,
    'ExecutionMode', p_ExecutionMode_ae7c80fb5431,
    'RequiredScope', p_RequiredScope_ae7c80fb5431,
    'RequiresSystemUser', p_RequiresSystemUser_ae7c80fb5431,
    'GenerationType', p_GenerationType_ae7c80fb5431,
    'Code', p_Code_ae7c80fb5431,
    'CodeApprovalStatus', p_CodeApprovalStatus_ae7c80fb5431,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_ae7c80fb5431,
    'CodeApprovedAt', p_CodeApprovedAt_ae7c80fb5431,
    'ContractFingerprint', p_ContractFingerprint_ae7c80fb5431,
    'Status', p_Status_ae7c80fb5431,
    'CacheTTLSeconds', p_CacheTTLSeconds_ae7c80fb5431,
    'TimeoutMS', p_TimeoutMS_ae7c80fb5431,
    'MaxConcurrency', p_MaxConcurrency_ae7c80fb5431,
    'CodeLocked', p_CodeLocked_ae7c80fb5431,
    'CodeComments', p_CodeComments_ae7c80fb5431,
    'Libraries', p_Libraries_ae7c80fb5431,
    'ID', p_ID_ae7c80fb5431
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_ae7c80fb5431, p_OperationKey := p_OperationKey_ae7c80fb5431, p_CategoryID := p_CategoryID_ae7c80fb5431, p_Description := p_Description_ae7c80fb5431, p_InputTypeName := p_InputTypeName_ae7c80fb5431, p_InputTypeDefinition := p_InputTypeDefinition_ae7c80fb5431, p_InputTypeIsArray := p_InputTypeIsArray_ae7c80fb5431, p_OutputTypeName := p_OutputTypeName_ae7c80fb5431, p_OutputTypeDefinition := p_OutputTypeDefinition_ae7c80fb5431, p_OutputTypeIsArray := p_OutputTypeIsArray_ae7c80fb5431, p_ExecutionMode := p_ExecutionMode_ae7c80fb5431, p_RequiredScope := p_RequiredScope_ae7c80fb5431, p_RequiresSystemUser := p_RequiresSystemUser_ae7c80fb5431, p_GenerationType := p_GenerationType_ae7c80fb5431, p_Code := p_Code_ae7c80fb5431, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_ae7c80fb5431, p_CodeApprovedByUserID := p_CodeApprovedByUserID_ae7c80fb5431, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_ae7c80fb5431, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_ae7c80fb5431, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_ae7c80fb5431, p_CacheTTLSeconds := p_CacheTTLSeconds_ae7c80fb5431, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_ae7c80fb5431, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_ae7c80fb5431, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_ae7c80fb5431, p_CodeComments := p_CodeComments_ae7c80fb5431, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_ae7c80fb5431, p_Libraries_Clear := TRUE, p_ID := p_ID_ae7c80fb5431);
  END IF;
END $mj$;


-- ===================== Other =====================

-- End of SQL Logging Session
-- Session ID: 8e8db1fe-17d6-4d47-9969-e59e3559d024
-- Completed: 2026-11-03T16:10:17.500Z
-- Duration: 20983ms
-- Total Statements: 1
