-- =============================================================================================
-- PostgreSQL counterpart of V202611091351__v5.44.x__Metadata_Sync.sql
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships, what is
-- held back, and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file was
--     generated from, held-back records removed as in the T-SQL file. Each record is a DO block that
--     calls the function in whichever signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones, block for block:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Core calls use ${mjSchema}; signature checks name this app's schema in lowercase, as
--     PostgreSQL stores it.
--   * Every string value is taken verbatim from the T-SQL file.
-- =============================================================================================

-- Save MJ_BizApps_Orders: Revenue Recognition Types (core SP call only)
DO $mj$
DECLARE
  p_Code_f427f9435c1f VARCHAR(40);
  p_Name_f427f9435c1f VARCHAR(200);
  p_Description_f427f9435c1f TEXT;
  p_DriverClass_f427f9435c1f VARCHAR(200);
  p_IsDeferred_f427f9435c1f BOOLEAN;
  p_RequiresServicePeriod_f427f9435c1f BOOLEAN;
  p_Sequence_f427f9435c1f INTEGER;
  p_IsActive_f427f9435c1f BOOLEAN;
  p_ScheduleBasis_f427f9435c1f VARCHAR(20);
  p_ID_f427f9435c1f UUID;
BEGIN
  p_Code_f427f9435c1f := 'PercentComplete';
  p_Name_f427f9435c1f := 'Percentage of Completion';
  p_Description_f427f9435c1f := 'Recognized by cumulative catch-up as progress is attested, not on a schedule computed at booking (plan D90). The line books to Deferred Revenue and stages no release entries; each Orders.RecordProgress observation posts LineTotalNet × percent complete minus what is already recognized, so a backward slide reverses through the same subtraction. DriverClass names the default progress method — ManualAttestation: a named person signs the percent.';
  p_DriverClass_f427f9435c1f := 'ManualAttestation';
  p_IsDeferred_f427f9435c1f := TRUE;
  p_RequiresServicePeriod_f427f9435c1f := FALSE;
  p_Sequence_f427f9435c1f := 40;
  p_IsActive_f427f9435c1f := TRUE;
  p_ScheduleBasis_f427f9435c1f := 'OnMeasurement';
  p_ID_f427f9435c1f := 'A1D4E7B0-3C62-4F85-9A17-2B3C4D5E6F04';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__mj_bizappsorders' AND p.proname = 'spUpdateRevenueRecognitionType'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM __mj_BizAppsOrders."spUpdateRevenueRecognitionType"(p_data := jsonb_build_object(
    'Code', p_Code_f427f9435c1f,
    'Name', p_Name_f427f9435c1f,
    'Description', p_Description_f427f9435c1f,
    'DriverClass', p_DriverClass_f427f9435c1f,
    'IsDeferred', p_IsDeferred_f427f9435c1f,
    'RequiresServicePeriod', p_RequiresServicePeriod_f427f9435c1f,
    'Sequence', p_Sequence_f427f9435c1f,
    'IsActive', p_IsActive_f427f9435c1f,
    'ScheduleBasis', p_ScheduleBasis_f427f9435c1f,
    'ID', p_ID_f427f9435c1f
  ));
  ELSE
    PERFORM __mj_BizAppsOrders."spUpdateRevenueRecognitionType"(p_Code := p_Code_f427f9435c1f, p_Name := p_Name_f427f9435c1f, p_Description := p_Description_f427f9435c1f, p_DriverClass := p_DriverClass_f427f9435c1f, p_IsDeferred := p_IsDeferred_f427f9435c1f, p_RequiresServicePeriod := p_RequiresServicePeriod_f427f9435c1f, p_Sequence := p_Sequence_f427f9435c1f, p_IsActive := p_IsActive_f427f9435c1f, p_ScheduleBasis := p_ScheduleBasis_f427f9435c1f, p_ID := p_ID_f427f9435c1f);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_fd80a33fd455 VARCHAR(255);
  p_OperationKey_fd80a33fd455 VARCHAR(255);
  p_CategoryID_fd80a33fd455 UUID;
  p_Description_fd80a33fd455 TEXT;
  p_InputTypeName_fd80a33fd455 VARCHAR(255);
  p_InputTypeDefinition_fd80a33fd455 TEXT;
  p_InputTypeIsArray_fd80a33fd455 BOOLEAN;
  p_OutputTypeName_fd80a33fd455 VARCHAR(255);
  p_OutputTypeDefinition_fd80a33fd455 TEXT;
  p_OutputTypeIsArray_fd80a33fd455 BOOLEAN;
  p_ExecutionMode_fd80a33fd455 VARCHAR(20);
  p_RequiredScope_fd80a33fd455 VARCHAR(255);
  p_RequiresSystemUser_fd80a33fd455 BOOLEAN;
  p_GenerationType_fd80a33fd455 VARCHAR(20);
  p_Code_fd80a33fd455 TEXT;
  p_CodeApprovalStatus_fd80a33fd455 VARCHAR(20);
  p_CodeApprovedByUserID_fd80a33fd455 UUID;
  p_CodeApprovedAt_fd80a33fd455 TIMESTAMPTZ;
  p_ContractFingerprint_fd80a33fd455 VARCHAR(100);
  p_Status_fd80a33fd455 VARCHAR(20);
  p_CacheTTLSeconds_fd80a33fd455 INTEGER;
  p_TimeoutMS_fd80a33fd455 INTEGER;
  p_MaxConcurrency_fd80a33fd455 INTEGER;
  p_CodeLocked_fd80a33fd455 BOOLEAN;
  p_CodeComments_fd80a33fd455 TEXT;
  p_Libraries_fd80a33fd455 TEXT;
  p_ID_fd80a33fd455 UUID;
BEGIN
  p_Name_fd80a33fd455 := 'Poll External Payments';
  p_OperationKey_fd80a33fd455 := 'Orders.PollExternalPayments';
  p_CategoryID_fd80a33fd455 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303';
  p_Description_fd80a33fd455 := 'Read receivable payments from each company''s external AR rail (Bill.com) since the stored watermark and capture every cleared payment exactly once through Orders.CapturePayment, fanned out to the orders its invoices belong to. Unknown statuses are held, unmatched invoices capture nothing, and reversals are flagged for a person. Poll-authoritative: Bill.com publishes no payment-received webhook.';
  p_InputTypeName_fd80a33fd455 := 'OrdersPollExternalPaymentsInput';
  p_InputTypeDefinition_fd80a33fd455 := '/**
 * Input for `Orders.PollExternalPayments`.
 *
 * Read receivable payments from every company''s external AR rail (Bill.com) since the last
 * watermark, and capture each CLEARED payment exactly once through `Orders.CapturePayment`, applied
 * to the orders its invoices belong to. Poll-authoritative: Bill.com publishes no payment-received
 * webhook (golive #148). Meant for a scheduled job through the `Orders: Poll External Payments` Action.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPollExternalPaymentsInput {
    /** Poll one provider row only. Omit for every active rail provider. */
    PaymentProviderID?: string | null;
    /** Decide everything, write nothing — no payments, no dispositions, no watermark. */
    Preview?: boolean;
    /** Cap on payments considered per provider in one pass. Default 100. The remainder is read next pass. */
    MaxCount?: number;
    /** Override the stored watermark (ISO). For a first run or a deliberate re-read; dedupe by payment id makes re-reading safe. */
    SinceWatermark?: string | null;
}
';
  p_InputTypeIsArray_fd80a33fd455 := FALSE;
  p_OutputTypeName_fd80a33fd455 := 'OrdersPollExternalPaymentsOutput';
  p_OutputTypeDefinition_fd80a33fd455 := '/**
 * Output for `Orders.PollExternalPayments`.
 *
 * One outcome per payment considered. `ATTENTION` means the pass completed but left Unmatched,
 * Refused, Reapplied or ReversalNeeded rows a person must look at. It is reported as Success true:
 * each such payment is announced once, by a notification on the pass that moved it into that state.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExternalPaymentOutcome {
    PaymentProviderID: string;
    ExternalPaymentRef: string;
    Amount: number;
    ExternalStatus: string | null;
    Disposition: ''Captured'' | ''Held'' | ''Unmatched'' | ''Refused'' | ''Ignored'' | ''Reapplied'' | ''ReversalNeeded'';
    Reason: string;
    PaymentNumber?: string | null;
    PaymentHeaderID?: string | null;
}

export interface OrdersPollExternalPaymentsOutput {
    Success: boolean;
    Message?: string;
    ResultCode: ''COMPLETED'' | ''PREVIEWED'' | ''ATTENTION'' | ''NO_PROVIDERS'' | ''ERROR'';
    Captured: number;
    Held: number;
    Unmatched: number;
    /** Orders.CapturePayment refused the capture (split-company order, ambiguous payer, configuration). Counts as attention. */
    Refused: number;
    /** Captured, then re-applied to different invoices in Bill.com. The cash is right; the allocation here is not. */
    Reapplied: number;
    ReversalNeeded: number;
    Ignored: number;
    Outcomes: ExternalPaymentOutcome[];
    NewWatermarks: Array<{ PaymentProviderID: string; Watermark: string | null }>;
    PreviewedOnly: boolean;
}
';
  p_OutputTypeIsArray_fd80a33fd455 := FALSE;
  p_ExecutionMode_fd80a33fd455 := 'LongRunning';
  p_RequiredScope_fd80a33fd455 := 'orders:write';
  p_RequiresSystemUser_fd80a33fd455 := FALSE;
  p_GenerationType_fd80a33fd455 := 'Manual';
  p_CodeApprovalStatus_fd80a33fd455 := 'Approved';
  p_Status_fd80a33fd455 := 'Active';
  p_CodeLocked_fd80a33fd455 := FALSE;
  p_ID_fd80a33fd455 := 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A05';
  p_ID_fd80a33fd455 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.PollExternalPayments' ORDER BY CASE WHEN "ID" = p_ID_fd80a33fd455 THEN 0 ELSE 1 END LIMIT 1), p_ID_fd80a33fd455);
  p_CategoryID_fd80a33fd455 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Payments and Credits' ORDER BY CASE WHEN "ID" = p_CategoryID_fd80a33fd455 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_fd80a33fd455);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_fd80a33fd455,
    'OperationKey', p_OperationKey_fd80a33fd455,
    'CategoryID', p_CategoryID_fd80a33fd455,
    'Description', p_Description_fd80a33fd455,
    'InputTypeName', p_InputTypeName_fd80a33fd455,
    'InputTypeDefinition', p_InputTypeDefinition_fd80a33fd455,
    'InputTypeIsArray', p_InputTypeIsArray_fd80a33fd455,
    'OutputTypeName', p_OutputTypeName_fd80a33fd455,
    'OutputTypeDefinition', p_OutputTypeDefinition_fd80a33fd455,
    'OutputTypeIsArray', p_OutputTypeIsArray_fd80a33fd455,
    'ExecutionMode', p_ExecutionMode_fd80a33fd455,
    'RequiredScope', p_RequiredScope_fd80a33fd455,
    'RequiresSystemUser', p_RequiresSystemUser_fd80a33fd455,
    'GenerationType', p_GenerationType_fd80a33fd455,
    'Code', p_Code_fd80a33fd455,
    'CodeApprovalStatus', p_CodeApprovalStatus_fd80a33fd455,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_fd80a33fd455,
    'CodeApprovedAt', p_CodeApprovedAt_fd80a33fd455,
    'ContractFingerprint', p_ContractFingerprint_fd80a33fd455,
    'Status', p_Status_fd80a33fd455,
    'CacheTTLSeconds', p_CacheTTLSeconds_fd80a33fd455,
    'TimeoutMS', p_TimeoutMS_fd80a33fd455,
    'MaxConcurrency', p_MaxConcurrency_fd80a33fd455,
    'CodeLocked', p_CodeLocked_fd80a33fd455,
    'CodeComments', p_CodeComments_fd80a33fd455,
    'Libraries', p_Libraries_fd80a33fd455,
    'ID', p_ID_fd80a33fd455
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_fd80a33fd455, p_OperationKey := p_OperationKey_fd80a33fd455, p_CategoryID := p_CategoryID_fd80a33fd455, p_Description := p_Description_fd80a33fd455, p_InputTypeName := p_InputTypeName_fd80a33fd455, p_InputTypeDefinition := p_InputTypeDefinition_fd80a33fd455, p_InputTypeIsArray := p_InputTypeIsArray_fd80a33fd455, p_OutputTypeName := p_OutputTypeName_fd80a33fd455, p_OutputTypeDefinition := p_OutputTypeDefinition_fd80a33fd455, p_OutputTypeIsArray := p_OutputTypeIsArray_fd80a33fd455, p_ExecutionMode := p_ExecutionMode_fd80a33fd455, p_RequiredScope := p_RequiredScope_fd80a33fd455, p_RequiresSystemUser := p_RequiresSystemUser_fd80a33fd455, p_GenerationType := p_GenerationType_fd80a33fd455, p_Code := p_Code_fd80a33fd455, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_fd80a33fd455, p_CodeApprovedByUserID := p_CodeApprovedByUserID_fd80a33fd455, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_fd80a33fd455, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_fd80a33fd455, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_fd80a33fd455, p_CacheTTLSeconds := p_CacheTTLSeconds_fd80a33fd455, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_fd80a33fd455, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_fd80a33fd455, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_fd80a33fd455, p_CodeComments := p_CodeComments_fd80a33fd455, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_fd80a33fd455, p_Libraries_Clear := TRUE, p_ID := p_ID_fd80a33fd455);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_24862b60a3c6 UUID;
  p_Name_24862b60a3c6 VARCHAR(255);
  p_OperationKey_24862b60a3c6 VARCHAR(255);
  p_CategoryID_24862b60a3c6 UUID;
  p_Description_24862b60a3c6 TEXT;
  p_InputTypeName_24862b60a3c6 VARCHAR(255);
  p_InputTypeDefinition_24862b60a3c6 TEXT;
  p_InputTypeIsArray_24862b60a3c6 BOOLEAN;
  p_OutputTypeName_24862b60a3c6 VARCHAR(255);
  p_OutputTypeDefinition_24862b60a3c6 TEXT;
  p_OutputTypeIsArray_24862b60a3c6 BOOLEAN;
  p_ExecutionMode_24862b60a3c6 VARCHAR(20);
  p_RequiredScope_24862b60a3c6 VARCHAR(255);
  p_RequiresSystemUser_24862b60a3c6 BOOLEAN;
  p_GenerationType_24862b60a3c6 VARCHAR(20);
  p_Code_24862b60a3c6 TEXT;
  p_CodeApprovalStatus_24862b60a3c6 VARCHAR(20);
  p_CodeApprovedByUserID_24862b60a3c6 UUID;
  p_CodeApprovedAt_24862b60a3c6 TIMESTAMPTZ;
  p_ContractFingerprint_24862b60a3c6 VARCHAR(100);
  p_Status_24862b60a3c6 VARCHAR(20);
  p_CacheTTLSeconds_24862b60a3c6 INTEGER;
  p_TimeoutMS_24862b60a3c6 INTEGER;
  p_MaxConcurrency_24862b60a3c6 INTEGER;
  p_CodeLocked_24862b60a3c6 BOOLEAN;
  p_CodeComments_24862b60a3c6 TEXT;
  p_Libraries_24862b60a3c6 TEXT;
BEGIN
  p_ID_24862b60a3c6 := '864BF4FB-4643-4B8E-8C0F-84CD8A2CF61F';
  p_Name_24862b60a3c6 := 'Explain Product GL Accounts';
  p_OperationKey_24862b60a3c6 := 'Orders.ExplainProductGLAccounts';
  p_CategoryID_24862b60a3c6 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B301';
  p_Description_24862b60a3c6 := 'For one product, company and day: which GL account each role books to (Sales, Deferred Revenue, Sales Discounts, Sales Returns and Allowances, Accounts Receivable by default) and every level the walk tried — the product, its category and the category''s parents, its product type, and the company default — with the winning level marked. A role that resolves nowhere, or whose winning account belongs to other books, carries the refusal confirm would give. Read-only. Runs the same walk confirm books through, so the product screen cannot disagree with booking.';
  p_InputTypeName_24862b60a3c6 := 'OrdersExplainProductGLAccountsInput';
  p_InputTypeDefinition_24862b60a3c6 := '/**
 * Input for `Orders.ExplainProductGLAccounts`.
 *
 * Which GL account each role books to for one product, and where in the walk (product, category
 * and its parents, product type, company) each comes from (golive#439). Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersExplainProductGLAccountsInput {
    ProductID: string;
    /** The selling company. Defaults to the product''s own company. */
    CompanyID?: string | null;
    /** The day the links are read for, `YYYY-MM-DD`. Defaults to today on the business calendar. */
    AsOf?: string;
    /**
     * The roles to explain, by accounting''s role name. Defaults to the five a product''s lines book:
     * Sales, Deferred Revenue, Sales Discounts, Sales Returns and Allowances, Accounts Receivable.
     */
    Roles?: string[];
}
';
  p_InputTypeIsArray_24862b60a3c6 := FALSE;
  p_OutputTypeName_24862b60a3c6 := 'OrdersExplainProductGLAccountsOutput';
  p_OutputTypeDefinition_24862b60a3c6 := '/**
 * Output of `Orders.ExplainProductGLAccounts`.
 *
 * One entry per role, each listing every level the walk tried, in booking order. The step and role
 * shapes carry the fields accounting''s `mj-gl-resolution-preview` renders, so a role can be handed
 * to it as it is.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExplainedGLStep {
    /** `Product`, `Category`, `ParentCategory`, `ProductType`, `Company` or `LegalEntity`. */
    Level: string;
    /** What was looked at, as a person reads it, e.g. "Category: Services". */
    Scope: string;
    /** The record whose links were read. */
    RecordID: string;
    /** The account linked at this level for the role, or null when there is none. */
    GLAccountID: string | null;
    AccountCode: string | null;
    AccountName: string | null;
    /** True for the step booking stops on: the first one with a link. */
    Won: boolean;
    /** Codes of the dimensions the link at this level requires on a journal entry line. */
    Dimensions: string[];
}

export interface ExplainedGLRole {
    Role: string;
    Steps: ExplainedGLStep[];
    /** The account booking would use. All three are null when booking would refuse. */
    ResolvedGLAccountID: string | null;
    ResolvedCode: string | null;
    ResolvedName: string | null;
    /** `NotLinked` (nothing in the walk) or `CrossCompany` (the winning account is on other books); null when it resolves. */
    Failure: string | null;
    /** Booking''s refusal, word for word; null when it resolves. */
    Message: string | null;
}

export interface OrdersExplainProductGLAccountsOutput {
    Success: boolean;
    /** Why nothing could be explained, when `Success` is false. */
    Message?: string;
    ProductID: string;
    /** The company explained for: the one asked for, else the product''s own. */
    CompanyID: string;
    /** The day the links were read for, `YYYY-MM-DD`. */
    AsOf: string;
    Roles: ExplainedGLRole[];
}
';
  p_OutputTypeIsArray_24862b60a3c6 := FALSE;
  p_ExecutionMode_24862b60a3c6 := 'Sync';
  p_RequiredScope_24862b60a3c6 := 'orders:read';
  p_RequiresSystemUser_24862b60a3c6 := FALSE;
  p_GenerationType_24862b60a3c6 := 'Manual';
  p_CodeApprovalStatus_24862b60a3c6 := 'Approved';
  p_Status_24862b60a3c6 := 'Active';
  p_CodeLocked_24862b60a3c6 := FALSE;
  p_CategoryID_24862b60a3c6 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Order Lifecycle' ORDER BY CASE WHEN "ID" = p_CategoryID_24862b60a3c6 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_24862b60a3c6);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
               WHERE "ID" = p_ID_24862b60a3c6
                  OR "OperationKey" = p_OperationKey_24862b60a3c6) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
      'ID', p_ID_24862b60a3c6,
      'Name', p_Name_24862b60a3c6,
      'OperationKey', p_OperationKey_24862b60a3c6,
      'CategoryID', p_CategoryID_24862b60a3c6,
      'Description', p_Description_24862b60a3c6,
      'InputTypeName', p_InputTypeName_24862b60a3c6,
      'InputTypeDefinition', p_InputTypeDefinition_24862b60a3c6,
      'InputTypeIsArray', p_InputTypeIsArray_24862b60a3c6,
      'OutputTypeName', p_OutputTypeName_24862b60a3c6,
      'OutputTypeDefinition', p_OutputTypeDefinition_24862b60a3c6,
      'OutputTypeIsArray', p_OutputTypeIsArray_24862b60a3c6,
      'ExecutionMode', p_ExecutionMode_24862b60a3c6,
      'RequiredScope', p_RequiredScope_24862b60a3c6,
      'RequiresSystemUser', p_RequiresSystemUser_24862b60a3c6,
      'GenerationType', p_GenerationType_24862b60a3c6,
      'Code', p_Code_24862b60a3c6,
      'CodeApprovalStatus', p_CodeApprovalStatus_24862b60a3c6,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_24862b60a3c6,
      'CodeApprovedAt', p_CodeApprovedAt_24862b60a3c6,
      'ContractFingerprint', p_ContractFingerprint_24862b60a3c6,
      'Status', p_Status_24862b60a3c6,
      'CacheTTLSeconds', p_CacheTTLSeconds_24862b60a3c6,
      'TimeoutMS', p_TimeoutMS_24862b60a3c6,
      'MaxConcurrency', p_MaxConcurrency_24862b60a3c6,
      'CodeLocked', p_CodeLocked_24862b60a3c6,
      'CodeComments', p_CodeComments_24862b60a3c6,
      'Libraries', p_Libraries_24862b60a3c6
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_24862b60a3c6, p_Name := p_Name_24862b60a3c6, p_OperationKey := p_OperationKey_24862b60a3c6, p_CategoryID := p_CategoryID_24862b60a3c6, p_Description := p_Description_24862b60a3c6, p_InputTypeName := p_InputTypeName_24862b60a3c6, p_InputTypeDefinition := p_InputTypeDefinition_24862b60a3c6, p_InputTypeIsArray := p_InputTypeIsArray_24862b60a3c6, p_OutputTypeName := p_OutputTypeName_24862b60a3c6, p_OutputTypeDefinition := p_OutputTypeDefinition_24862b60a3c6, p_OutputTypeIsArray := p_OutputTypeIsArray_24862b60a3c6, p_ExecutionMode := p_ExecutionMode_24862b60a3c6, p_RequiredScope := p_RequiredScope_24862b60a3c6, p_RequiresSystemUser := p_RequiresSystemUser_24862b60a3c6, p_GenerationType := p_GenerationType_24862b60a3c6, p_Code := p_Code_24862b60a3c6, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_24862b60a3c6, p_CodeApprovedByUserID := p_CodeApprovedByUserID_24862b60a3c6, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_24862b60a3c6, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_24862b60a3c6, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_24862b60a3c6, p_CacheTTLSeconds := p_CacheTTLSeconds_24862b60a3c6, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_24862b60a3c6, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_24862b60a3c6, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_24862b60a3c6, p_CodeComments := p_CodeComments_24862b60a3c6, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_24862b60a3c6, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_f379e2c5dae6 VARCHAR(255);
  p_OperationKey_f379e2c5dae6 VARCHAR(255);
  p_CategoryID_f379e2c5dae6 UUID;
  p_Description_f379e2c5dae6 TEXT;
  p_InputTypeName_f379e2c5dae6 VARCHAR(255);
  p_InputTypeDefinition_f379e2c5dae6 TEXT;
  p_InputTypeIsArray_f379e2c5dae6 BOOLEAN;
  p_OutputTypeName_f379e2c5dae6 VARCHAR(255);
  p_OutputTypeDefinition_f379e2c5dae6 TEXT;
  p_OutputTypeIsArray_f379e2c5dae6 BOOLEAN;
  p_ExecutionMode_f379e2c5dae6 VARCHAR(20);
  p_RequiredScope_f379e2c5dae6 VARCHAR(255);
  p_RequiresSystemUser_f379e2c5dae6 BOOLEAN;
  p_GenerationType_f379e2c5dae6 VARCHAR(20);
  p_Code_f379e2c5dae6 TEXT;
  p_CodeApprovalStatus_f379e2c5dae6 VARCHAR(20);
  p_CodeApprovedByUserID_f379e2c5dae6 UUID;
  p_CodeApprovedAt_f379e2c5dae6 TIMESTAMPTZ;
  p_ContractFingerprint_f379e2c5dae6 VARCHAR(100);
  p_Status_f379e2c5dae6 VARCHAR(20);
  p_CacheTTLSeconds_f379e2c5dae6 INTEGER;
  p_TimeoutMS_f379e2c5dae6 INTEGER;
  p_MaxConcurrency_f379e2c5dae6 INTEGER;
  p_CodeLocked_f379e2c5dae6 BOOLEAN;
  p_CodeComments_f379e2c5dae6 TEXT;
  p_Libraries_f379e2c5dae6 TEXT;
  p_ID_f379e2c5dae6 UUID;
BEGIN
  p_Name_f379e2c5dae6 := 'Preview Price';
  p_OperationKey_f379e2c5dae6 := 'Orders.PreviewPrice';
  p_CategoryID_f379e2c5dae6 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B302';
  p_Description_f379e2c5dae6 := 'Resolve one product''s price through the real pricing pipeline and explain how — which list, which rule, which volume band, which resolver. Read-only. Powers the order line''s price badge and the pricing admin screen''s resolution-walk visualiser.';
  p_InputTypeName_f379e2c5dae6 := 'PreviewPriceInput';
  p_InputTypeDefinition_f379e2c5dae6 := '/**
 * Input for `Orders.PreviewPrice`.
 *
 * Resolves ONE product''s price through the real pipeline. The narrow sibling of
 * `Orders.PreviewOrder`: this answers "what does this cost", that answers "what
 * does this order come to". The pricing screen''s resolution-walk visualiser and
 * the order line''s price badge both read this.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PreviewPriceInput {
    ProductID: string;
    /** Defaults to 1 — the common "what does one cost" question. */
    Quantity?: number;
    /** Who is buying. Either may be omitted; both omitted means base pricing. */
    OrganizationID?: string | null;
    PersonID?: string | null;
    /** Defaults to now. Pass a future date to check a seasonal rate before it starts. */
    AsOf?: string;
    /** Force a specific list, ignoring the customer''s assignment — for "what if" comparisons. */
    PriceListID?: string | null;
    FeeType?: string;
    /**
     * Price the product whatever its Status and availability window. For the product form''s
     * Activate check, which asks whether a Draft product has a price before it is sold. Order
     * pricing never sets it, so a product that may not be sold still cannot be booked.
     */
    IgnoreSellability?: boolean;
}
';
  p_InputTypeIsArray_f379e2c5dae6 := FALSE;
  p_OutputTypeName_f379e2c5dae6 := 'PreviewPriceOutput';
  p_OutputTypeDefinition_f379e2c5dae6 := '/**
 * Output for `Orders.PreviewPrice`.
 *
 * `Components` is the explanation, not decoration — it is what lets a price badge
 * show the walk that produced the number instead of asserting it.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** One line of the explanation. */
export interface PreviewComponent {
    ComponentType: string;
    Label: string;
    Amount: number;
    RunningTotal: number;
}

export interface PreviewPriceOutput {
    Success: boolean;
    Message?: string;
    UnitPrice?: number;
    ExtendedAmount?: number;
    Quantity?: number;
    /** The list that applied, and how it was arrived at. */
    PriceListID?: string | null;
    PriceListName?: string | null;
    /** Which rule won, for a rule author checking their work. */
    ProductPriceID?: string | null;
    /** Which resolver answered — ''default'', or a plugin key like `Company:<id>`. */
    ResolvedBy?: string;
    Components?: PreviewComponent[];
}
';
  p_OutputTypeIsArray_f379e2c5dae6 := FALSE;
  p_ExecutionMode_f379e2c5dae6 := 'Sync';
  p_RequiredScope_f379e2c5dae6 := 'orders:read';
  p_RequiresSystemUser_f379e2c5dae6 := FALSE;
  p_GenerationType_f379e2c5dae6 := 'Manual';
  p_CodeApprovalStatus_f379e2c5dae6 := 'Approved';
  p_Status_f379e2c5dae6 := 'Active';
  p_CodeLocked_f379e2c5dae6 := FALSE;
  p_ID_f379e2c5dae6 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C405';
  p_ID_f379e2c5dae6 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.PreviewPrice' ORDER BY CASE WHEN "ID" = p_ID_f379e2c5dae6 THEN 0 ELSE 1 END LIMIT 1), p_ID_f379e2c5dae6);
  p_CategoryID_f379e2c5dae6 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Order Pricing' ORDER BY CASE WHEN "ID" = p_CategoryID_f379e2c5dae6 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_f379e2c5dae6);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_f379e2c5dae6,
    'OperationKey', p_OperationKey_f379e2c5dae6,
    'CategoryID', p_CategoryID_f379e2c5dae6,
    'Description', p_Description_f379e2c5dae6,
    'InputTypeName', p_InputTypeName_f379e2c5dae6,
    'InputTypeDefinition', p_InputTypeDefinition_f379e2c5dae6,
    'InputTypeIsArray', p_InputTypeIsArray_f379e2c5dae6,
    'OutputTypeName', p_OutputTypeName_f379e2c5dae6,
    'OutputTypeDefinition', p_OutputTypeDefinition_f379e2c5dae6,
    'OutputTypeIsArray', p_OutputTypeIsArray_f379e2c5dae6,
    'ExecutionMode', p_ExecutionMode_f379e2c5dae6,
    'RequiredScope', p_RequiredScope_f379e2c5dae6,
    'RequiresSystemUser', p_RequiresSystemUser_f379e2c5dae6,
    'GenerationType', p_GenerationType_f379e2c5dae6,
    'Code', p_Code_f379e2c5dae6,
    'CodeApprovalStatus', p_CodeApprovalStatus_f379e2c5dae6,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_f379e2c5dae6,
    'CodeApprovedAt', p_CodeApprovedAt_f379e2c5dae6,
    'ContractFingerprint', p_ContractFingerprint_f379e2c5dae6,
    'Status', p_Status_f379e2c5dae6,
    'CacheTTLSeconds', p_CacheTTLSeconds_f379e2c5dae6,
    'TimeoutMS', p_TimeoutMS_f379e2c5dae6,
    'MaxConcurrency', p_MaxConcurrency_f379e2c5dae6,
    'CodeLocked', p_CodeLocked_f379e2c5dae6,
    'CodeComments', p_CodeComments_f379e2c5dae6,
    'Libraries', p_Libraries_f379e2c5dae6,
    'ID', p_ID_f379e2c5dae6
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_f379e2c5dae6, p_OperationKey := p_OperationKey_f379e2c5dae6, p_CategoryID := p_CategoryID_f379e2c5dae6, p_Description := p_Description_f379e2c5dae6, p_InputTypeName := p_InputTypeName_f379e2c5dae6, p_InputTypeDefinition := p_InputTypeDefinition_f379e2c5dae6, p_InputTypeIsArray := p_InputTypeIsArray_f379e2c5dae6, p_OutputTypeName := p_OutputTypeName_f379e2c5dae6, p_OutputTypeDefinition := p_OutputTypeDefinition_f379e2c5dae6, p_OutputTypeIsArray := p_OutputTypeIsArray_f379e2c5dae6, p_ExecutionMode := p_ExecutionMode_f379e2c5dae6, p_RequiredScope := p_RequiredScope_f379e2c5dae6, p_RequiresSystemUser := p_RequiresSystemUser_f379e2c5dae6, p_GenerationType := p_GenerationType_f379e2c5dae6, p_Code := p_Code_f379e2c5dae6, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_f379e2c5dae6, p_CodeApprovedByUserID := p_CodeApprovedByUserID_f379e2c5dae6, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_f379e2c5dae6, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_f379e2c5dae6, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_f379e2c5dae6, p_CacheTTLSeconds := p_CacheTTLSeconds_f379e2c5dae6, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_f379e2c5dae6, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_f379e2c5dae6, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_f379e2c5dae6, p_CodeComments := p_CodeComments_f379e2c5dae6, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_f379e2c5dae6, p_Libraries_Clear := TRUE, p_ID := p_ID_f379e2c5dae6);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_a4545d7a06ed VARCHAR(255);
  p_OperationKey_a4545d7a06ed VARCHAR(255);
  p_CategoryID_a4545d7a06ed UUID;
  p_Description_a4545d7a06ed TEXT;
  p_InputTypeName_a4545d7a06ed VARCHAR(255);
  p_InputTypeDefinition_a4545d7a06ed TEXT;
  p_InputTypeIsArray_a4545d7a06ed BOOLEAN;
  p_OutputTypeName_a4545d7a06ed VARCHAR(255);
  p_OutputTypeDefinition_a4545d7a06ed TEXT;
  p_OutputTypeIsArray_a4545d7a06ed BOOLEAN;
  p_ExecutionMode_a4545d7a06ed VARCHAR(20);
  p_RequiredScope_a4545d7a06ed VARCHAR(255);
  p_RequiresSystemUser_a4545d7a06ed BOOLEAN;
  p_GenerationType_a4545d7a06ed VARCHAR(20);
  p_Code_a4545d7a06ed TEXT;
  p_CodeApprovalStatus_a4545d7a06ed VARCHAR(20);
  p_CodeApprovedByUserID_a4545d7a06ed UUID;
  p_CodeApprovedAt_a4545d7a06ed TIMESTAMPTZ;
  p_ContractFingerprint_a4545d7a06ed VARCHAR(100);
  p_Status_a4545d7a06ed VARCHAR(20);
  p_CacheTTLSeconds_a4545d7a06ed INTEGER;
  p_TimeoutMS_a4545d7a06ed INTEGER;
  p_MaxConcurrency_a4545d7a06ed INTEGER;
  p_CodeLocked_a4545d7a06ed BOOLEAN;
  p_CodeComments_a4545d7a06ed TEXT;
  p_Libraries_a4545d7a06ed TEXT;
  p_ID_a4545d7a06ed UUID;
BEGIN
  p_Name_a4545d7a06ed := 'Record Progress';
  p_OperationKey_a4545d7a06ed := 'Orders.RecordProgress';
  p_CategoryID_a4545d7a06ed := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305';
  p_Description_a4545d7a06ed := 'Record one attested progress observation on a percentage-of-completion order line and post the cumulative catch-up (plan D90): LineTotalNet × percent complete minus what is already recognised, as a RevenueRecognition entry Dr Deferred Revenue / Cr Sales — mirrored when the delta is negative, so a backward slide reverses through the same subtraction. A zero delta writes nothing and succeeds. Preview computes without writing. Refuses a non-POC line, an unbooked line, a percent outside 0..1, and an observation dated on or before the last posted one; a posted observation is immutable. A date on or before the line''s company''s books-closed-through date (a month finance has closed) is refused, and so is any date when that date cannot be read. A date after today, or two or more months before the current business month, warns and still posts. SupersedesMeasurementID, for a user holding MJ.BizApps.Orders.Progress.Supersede, replaces the line''s latest observation: its recognition is reversed on its own date, or on the first open day when finance has closed that month, and the new catch-up is computed as if it had never posted and booked on the date entered, with no row edited.';
  p_InputTypeName_a4545d7a06ed := 'OrdersRecordProgressInput';
  p_InputTypeDefinition_a4545d7a06ed := '/**
 * Input for `Orders.RecordProgress`.
 *
 * One attested progress observation on a percentage-of-completion order line (plan D90). The
 * percent is CUMULATIVE — "this much of the work is done" — and the operation posts the
 * difference from what is already recognised, so the same input reverses a backward slide.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRecordProgressInput {
    /** The order line being attested. Its product''s revenue recognition type must be OnMeasurement. */
    OrderLineID: string;
    /**
     * The period this observation governs, `YYYY-MM-DD`. Becomes the entry''s EffectiveDate. One per line per date.
     * Refused when on or before the line''s company''s books-closed-through date (a month finance has closed).
     */
    MeasurementDate: string;
    /** Cumulative fraction complete, 0..1 (0.7 = 70%). */
    PercentComplete: number;
    /** The progress method (a ProgressRecognitionDriver key). Defaults to the revenue recognition type''s DriverClass — ManualAttestation. */
    MethodCode?: string;
    /** Optional quantitative inputs behind the percent, kept for audit. */
    MeasureNumerator?: number | null;
    MeasureDenominator?: number | null;
    /** Free text from the signer. */
    Notes?: string | null;
    /** Compute and return what WOULD post, writing nothing — for the confirmation step before finance commits. */
    Preview?: boolean;
    /**
     * SUPERSEDE: the posted observation this one replaces. It must be the line''s latest observation
     * that is not already superseded, and the caller must hold `MJ.BizApps.Orders.Progress.Supersede`.
     * Nothing is edited: the replaced observation''s recognition is reversed — on its own date, or on the
     * first open day when finance has closed that month (`ReversalDate` on the output) — and this
     * observation''s catch-up is computed as if the replaced one had never posted. `MeasurementDate`
     * must then be after the observation before the replaced one — not after the replaced one — which
     * is what makes a mistyped future date recoverable.
     */
    SupersedesMeasurementID?: string | null;
}
';
  p_InputTypeIsArray_a4545d7a06ed := FALSE;
  p_OutputTypeName_a4545d7a06ed := 'OrdersRecordProgressOutput';
  p_OutputTypeDefinition_a4545d7a06ed := '/**
 * Output for `Orders.RecordProgress`.
 *
 * The catch-up arithmetic, echoed whether or not anything was written: what was recognised
 * before, what the observation says should be recognised to date, and the delta between them.
 * A zero delta is a success that wrote nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRecordProgressOutput {
    Success: boolean;
    Message?: string;
    /** True when `Preview` was set: the numbers below are what WOULD post; nothing was written. */
    Preview: boolean;
    OrderLineID?: string;
    OrderNumber?: string;
    LineNumber?: number;
    MeasurementDate?: string;
    PercentComplete?: number;
    /** The size of the line''s LineTotalNet — the amount the percent applies to. */
    LineAmount?: number;
    /**
     * Revenue recognised on the line before this observation, as a magnitude: positive on a
     * reversal (negative-quantity) line too, whose own RecognizedToDate is negative.
     */
    RecognizedToDateBefore?: number;
    /** LineAmount × PercentComplete, to the cent. A magnitude, like RecognizedToDateBefore. */
    RecognizedToDateAfter?: number;
    /** After − Before. Negative on a backward slide; zero means no entry was written. */
    RecognitionAmount?: number;
    /** The observation row. Null on a preview. */
    OrderLineProgressMeasurementID?: string | null;
    /** The RevenueRecognition journal entry. Null on a preview and when the delta was zero. */
    JournalEntryID?: string | null;
    /**
     * Set when the measurement date is after today on the business calendar. ADVISORY ONLY — forward
     * dating is allowed with no cap. It exists because a mistyped year posts silently and only
     * surfaces when the next attestation is refused. Null when the calendar could not be read.
     */
    FutureDateWarning?: string | null;
    /**
     * Set when the measurement date is two or more months before the current month on the business
     * calendar. ADVISORY ONLY — nothing is blocked, on either the preview or the live path. The prior
     * month and earlier in the current month do not warn. Null when the calendar could not be read.
     */
    BackDatedWarning?: string | null;
    /** On a supersede: the observation replaced. Null otherwise. */
    SupersededMeasurementID?: string | null;
    /** On a supersede: the recognition taken back out (the replaced observation''s RecognitionAmount, negated). Zero otherwise. */
    ReversalAmount?: number;
    /**
     * On a supersede that reverses anything: the date the reversal is booked on. The replaced
     * observation''s own date, or the first open day when that date is on or before the line''s
     * company''s books-closed-through date, so a correction never books into a month finance has
     * closed. Null otherwise.
     */
    ReversalDate?: string | null;
    /**
     * The date this observation''s catch-up entry is booked on: always `MeasurementDate`, which is
     * refused when it is on or before the line''s company''s books-closed-through date. Null when there
     * is no catch-up.
     */
    CatchUpDate?: string | null;
    /** On a supersede: the entry that reversed the replaced observation. Null on a preview, when nothing was superseded, and when the replaced observation posted nothing. */
    ReversalJournalEntryID?: string | null;
}
';
  p_OutputTypeIsArray_a4545d7a06ed := FALSE;
  p_ExecutionMode_a4545d7a06ed := 'Sync';
  p_RequiredScope_a4545d7a06ed := 'orders:write';
  p_RequiresSystemUser_a4545d7a06ed := FALSE;
  p_GenerationType_a4545d7a06ed := 'Manual';
  p_CodeApprovalStatus_a4545d7a06ed := 'Approved';
  p_Status_a4545d7a06ed := 'Active';
  p_CodeLocked_a4545d7a06ed := FALSE;
  p_ID_a4545d7a06ed := 'A1D4E7B0-3C62-4F85-9A17-2B3C4D5E6F20';
  p_ID_a4545d7a06ed := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.RecordProgress' ORDER BY CASE WHEN "ID" = p_ID_a4545d7a06ed THEN 0 ELSE 1 END LIMIT 1), p_ID_a4545d7a06ed);
  p_CategoryID_a4545d7a06ed := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Receivables' ORDER BY CASE WHEN "ID" = p_CategoryID_a4545d7a06ed THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_a4545d7a06ed);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_a4545d7a06ed,
    'OperationKey', p_OperationKey_a4545d7a06ed,
    'CategoryID', p_CategoryID_a4545d7a06ed,
    'Description', p_Description_a4545d7a06ed,
    'InputTypeName', p_InputTypeName_a4545d7a06ed,
    'InputTypeDefinition', p_InputTypeDefinition_a4545d7a06ed,
    'InputTypeIsArray', p_InputTypeIsArray_a4545d7a06ed,
    'OutputTypeName', p_OutputTypeName_a4545d7a06ed,
    'OutputTypeDefinition', p_OutputTypeDefinition_a4545d7a06ed,
    'OutputTypeIsArray', p_OutputTypeIsArray_a4545d7a06ed,
    'ExecutionMode', p_ExecutionMode_a4545d7a06ed,
    'RequiredScope', p_RequiredScope_a4545d7a06ed,
    'RequiresSystemUser', p_RequiresSystemUser_a4545d7a06ed,
    'GenerationType', p_GenerationType_a4545d7a06ed,
    'Code', p_Code_a4545d7a06ed,
    'CodeApprovalStatus', p_CodeApprovalStatus_a4545d7a06ed,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_a4545d7a06ed,
    'CodeApprovedAt', p_CodeApprovedAt_a4545d7a06ed,
    'ContractFingerprint', p_ContractFingerprint_a4545d7a06ed,
    'Status', p_Status_a4545d7a06ed,
    'CacheTTLSeconds', p_CacheTTLSeconds_a4545d7a06ed,
    'TimeoutMS', p_TimeoutMS_a4545d7a06ed,
    'MaxConcurrency', p_MaxConcurrency_a4545d7a06ed,
    'CodeLocked', p_CodeLocked_a4545d7a06ed,
    'CodeComments', p_CodeComments_a4545d7a06ed,
    'Libraries', p_Libraries_a4545d7a06ed,
    'ID', p_ID_a4545d7a06ed
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_a4545d7a06ed, p_OperationKey := p_OperationKey_a4545d7a06ed, p_CategoryID := p_CategoryID_a4545d7a06ed, p_Description := p_Description_a4545d7a06ed, p_InputTypeName := p_InputTypeName_a4545d7a06ed, p_InputTypeDefinition := p_InputTypeDefinition_a4545d7a06ed, p_InputTypeIsArray := p_InputTypeIsArray_a4545d7a06ed, p_OutputTypeName := p_OutputTypeName_a4545d7a06ed, p_OutputTypeDefinition := p_OutputTypeDefinition_a4545d7a06ed, p_OutputTypeIsArray := p_OutputTypeIsArray_a4545d7a06ed, p_ExecutionMode := p_ExecutionMode_a4545d7a06ed, p_RequiredScope := p_RequiredScope_a4545d7a06ed, p_RequiresSystemUser := p_RequiresSystemUser_a4545d7a06ed, p_GenerationType := p_GenerationType_a4545d7a06ed, p_Code := p_Code_a4545d7a06ed, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_a4545d7a06ed, p_CodeApprovedByUserID := p_CodeApprovedByUserID_a4545d7a06ed, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_a4545d7a06ed, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_a4545d7a06ed, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_a4545d7a06ed, p_CacheTTLSeconds := p_CacheTTLSeconds_a4545d7a06ed, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_a4545d7a06ed, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_a4545d7a06ed, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_a4545d7a06ed, p_CodeComments := p_CodeComments_a4545d7a06ed, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_a4545d7a06ed, p_Libraries_Clear := TRUE, p_ID := p_ID_a4545d7a06ed);
  END IF;
END $mj$;

-- Save MJ: Template Categories (core SP call only)
DO $mj$
DECLARE
  p_ID_f059dc496657 UUID;
  p_Name_f059dc496657 VARCHAR(255);
  p_Description_f059dc496657 TEXT;
  p_ParentID_f059dc496657 UUID;
  p_UserID_f059dc496657 UUID;
BEGIN
  p_ID_f059dc496657 := 'FF8645EE-3681-4AD2-B1E7-1F1761EE0361';
  p_Name_f059dc496657 := 'Orders: Notifications';
  p_Description_f059dc496657 := 'Emails sent to staff through MJ notifications, such as a payment that needs review. Edited here so the wording can change without a deploy.';
  p_UserID_f059dc496657 := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateCategory"
               WHERE "ID" = p_ID_f059dc496657
                  OR ("Name" = p_Name_f059dc496657 AND "ParentID" IS NULL)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateCategory'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateCategory"(p_data := jsonb_build_object(
      'ID', p_ID_f059dc496657,
      'Name', p_Name_f059dc496657,
      'Description', p_Description_f059dc496657,
      'ParentID', p_ParentID_f059dc496657,
      'UserID', p_UserID_f059dc496657
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateCategory"(p_ID := p_ID_f059dc496657, p_Name := p_Name_f059dc496657, p_Description := p_Description_f059dc496657, p_ParentID := p_ParentID_f059dc496657, p_ParentID_Clear := TRUE, p_UserID := p_UserID_f059dc496657);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Templates (core SP call only)
DO $mj$
DECLARE
  p_ID_72733b574969 UUID;
  p_Name_72733b574969 VARCHAR(255);
  p_Description_72733b574969 TEXT;
  p_CategoryID_72733b574969 UUID;
  p_UserPrompt_72733b574969 TEXT;
  p_UserID_72733b574969 UUID;
  p_ActiveAt_72733b574969 TIMESTAMPTZ;
  p_DisabledAt_72733b574969 TIMESTAMPTZ;
  p_IsActive_72733b574969 BOOLEAN;
BEGIN
  p_ID_72733b574969 := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_72733b574969 := 'Orders: Payment Needs Review - Email';
  p_Description_72733b574969 := 'The email body of the Payment Needs Review notification: an external payment the poll moved into a state that waits for a person (unmatched, refused, re-applied on the rail, or needing reversal). The subject is the notification''s title.';
  p_CategoryID_72733b574969 := 'FF8645EE-3681-4AD2-B1E7-1F1761EE0361';
  p_UserPrompt_72733b574969 := 'Render the review notice. Variables: PaymentRef, Amount (formatted), RailName, Disposition, Why (one clause), Reason (the poll''s full reason), WhereToAct.';
  p_UserID_72733b574969 := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_IsActive_72733b574969 := TRUE;
  p_CategoryID_72733b574969 := COALESCE((SELECT "ID" FROM "${mjSchema}"."TemplateCategory" WHERE "Name" = 'Orders: Notifications' ORDER BY CASE WHEN "ID" = p_CategoryID_72733b574969 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_72733b574969);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Template"
               WHERE "ID" = p_ID_72733b574969
                  OR "Name" = p_Name_72733b574969) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplate'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplate"(p_data := jsonb_build_object(
      'ID', p_ID_72733b574969,
      'Name', p_Name_72733b574969,
      'Description', p_Description_72733b574969,
      'CategoryID', p_CategoryID_72733b574969,
      'UserPrompt', p_UserPrompt_72733b574969,
      'UserID', p_UserID_72733b574969,
      'ActiveAt', p_ActiveAt_72733b574969,
      'DisabledAt', p_DisabledAt_72733b574969,
      'IsActive', p_IsActive_72733b574969
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplate"(p_ID := p_ID_72733b574969, p_Name := p_Name_72733b574969, p_Description := p_Description_72733b574969, p_CategoryID := p_CategoryID_72733b574969, p_UserPrompt := p_UserPrompt_72733b574969, p_UserID := p_UserID_72733b574969, p_ActiveAt := p_ActiveAt_72733b574969, p_ActiveAt_Clear := TRUE, p_DisabledAt := p_DisabledAt_72733b574969, p_DisabledAt_Clear := TRUE, p_IsActive := p_IsActive_72733b574969);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Contents (core SP call only)
DO $mj$
DECLARE
  p_ID_96677cc863a7 UUID;
  p_TemplateID_96677cc863a7 UUID;
  p_TypeID_96677cc863a7 UUID;
  p_TemplateText_96677cc863a7 TEXT;
  p_Priority_96677cc863a7 INTEGER;
  p_IsActive_96677cc863a7 BOOLEAN;
BEGIN
  p_ID_96677cc863a7 := '13A63457-4873-4CC4-9E97-729A95D48510';
  p_TemplateID_96677cc863a7 := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_TypeID_96677cc863a7 := 'E8AFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_TemplateText_96677cc863a7 := '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment needs review</title>
</head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
    <tr>
      <td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 16px 0;font-size:16px;">A payment needs review.</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">{{ RailName }} payment <strong>{{ PaymentRef }}</strong> for <strong>{{ Amount }}</strong> is <strong>{{ Disposition }}</strong>: {{ Why }}.</p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#52606d;">{{ Reason }}</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;">Review it in {{ WhereToAct }}.</p>
        <p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:#52606d;">You get this once per payment, when it starts waiting or its reason changes. You can turn email for "Payment Needs Review" off in your notification preferences.</p>
      </td>
    </tr>
  </table>
</body>
</html>
';
  p_Priority_96677cc863a7 := 1;
  p_IsActive_96677cc863a7 := TRUE;
  p_TemplateID_96677cc863a7 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_96677cc863a7 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_96677cc863a7);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateContent"
               WHERE "ID" = p_ID_96677cc863a7
                  OR ("TemplateID" = p_TemplateID_96677cc863a7 AND "TypeID" = p_TypeID_96677cc863a7)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateContent'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_data := jsonb_build_object(
      'ID', p_ID_96677cc863a7,
      'TemplateID', p_TemplateID_96677cc863a7,
      'TypeID', p_TypeID_96677cc863a7,
      'TemplateText', p_TemplateText_96677cc863a7,
      'Priority', p_Priority_96677cc863a7,
      'IsActive', p_IsActive_96677cc863a7
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_ID := p_ID_96677cc863a7, p_TemplateID := p_TemplateID_96677cc863a7, p_TypeID := p_TypeID_96677cc863a7, p_TemplateText := p_TemplateText_96677cc863a7, p_Priority := p_Priority_96677cc863a7, p_IsActive := p_IsActive_96677cc863a7);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_537961b93f59 UUID;
  p_TemplateID_537961b93f59 UUID;
  p_Name_537961b93f59 VARCHAR(255);
  p_Description_537961b93f59 TEXT;
  p_Type_537961b93f59 VARCHAR(20);
  p_DefaultValue_537961b93f59 TEXT;
  p_IsRequired_537961b93f59 BOOLEAN;
  p_LinkedParameterName_537961b93f59 VARCHAR(255);
  p_LinkedParameterField_537961b93f59 VARCHAR(500);
  p_ExtraFilter_537961b93f59 TEXT;
  p_EntityID_537961b93f59 UUID;
  p_RecordID_537961b93f59 VARCHAR(2000);
  p_OrderBy_537961b93f59 TEXT;
  p_TemplateContentID_537961b93f59 UUID;
BEGIN
  p_ID_537961b93f59 := '455690c9-34d2-420f-bd09-e19195993216';
  p_TemplateID_537961b93f59 := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_537961b93f59 := 'Amount';
  p_Description_537961b93f59 := 'Template scalar parameter ''Amount''';
  p_Type_537961b93f59 := 'Scalar';
  p_IsRequired_537961b93f59 := TRUE;
  p_TemplateID_537961b93f59 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_537961b93f59 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_537961b93f59);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_537961b93f59
                  OR ("TemplateID" = p_TemplateID_537961b93f59 AND "Name" = p_Name_537961b93f59)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_537961b93f59,
      'TemplateID', p_TemplateID_537961b93f59,
      'Name', p_Name_537961b93f59,
      'Description', p_Description_537961b93f59,
      'Type', p_Type_537961b93f59,
      'DefaultValue', p_DefaultValue_537961b93f59,
      'IsRequired', p_IsRequired_537961b93f59,
      'LinkedParameterName', p_LinkedParameterName_537961b93f59,
      'LinkedParameterField', p_LinkedParameterField_537961b93f59,
      'ExtraFilter', p_ExtraFilter_537961b93f59,
      'EntityID', p_EntityID_537961b93f59,
      'RecordID', p_RecordID_537961b93f59,
      'OrderBy', p_OrderBy_537961b93f59,
      'TemplateContentID', p_TemplateContentID_537961b93f59
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_537961b93f59, p_TemplateID := p_TemplateID_537961b93f59, p_Name := p_Name_537961b93f59, p_Description := p_Description_537961b93f59, p_Type := p_Type_537961b93f59, p_DefaultValue := p_DefaultValue_537961b93f59, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_537961b93f59, p_LinkedParameterName := p_LinkedParameterName_537961b93f59, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_537961b93f59, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_537961b93f59, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_537961b93f59, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_537961b93f59, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_537961b93f59, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_537961b93f59, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_b7580a6bc5ba UUID;
  p_TemplateID_b7580a6bc5ba UUID;
  p_Name_b7580a6bc5ba VARCHAR(255);
  p_Description_b7580a6bc5ba TEXT;
  p_Type_b7580a6bc5ba VARCHAR(20);
  p_DefaultValue_b7580a6bc5ba TEXT;
  p_IsRequired_b7580a6bc5ba BOOLEAN;
  p_LinkedParameterName_b7580a6bc5ba VARCHAR(255);
  p_LinkedParameterField_b7580a6bc5ba VARCHAR(500);
  p_ExtraFilter_b7580a6bc5ba TEXT;
  p_EntityID_b7580a6bc5ba UUID;
  p_RecordID_b7580a6bc5ba VARCHAR(2000);
  p_OrderBy_b7580a6bc5ba TEXT;
  p_TemplateContentID_b7580a6bc5ba UUID;
BEGIN
  p_ID_b7580a6bc5ba := '229bb2c1-c5b2-40c4-80b0-f5737983bb13';
  p_TemplateID_b7580a6bc5ba := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_b7580a6bc5ba := 'Disposition';
  p_Description_b7580a6bc5ba := 'Template scalar parameter ''Disposition''';
  p_Type_b7580a6bc5ba := 'Scalar';
  p_IsRequired_b7580a6bc5ba := TRUE;
  p_TemplateID_b7580a6bc5ba := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_b7580a6bc5ba THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_b7580a6bc5ba);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_b7580a6bc5ba
                  OR ("TemplateID" = p_TemplateID_b7580a6bc5ba AND "Name" = p_Name_b7580a6bc5ba)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_b7580a6bc5ba,
      'TemplateID', p_TemplateID_b7580a6bc5ba,
      'Name', p_Name_b7580a6bc5ba,
      'Description', p_Description_b7580a6bc5ba,
      'Type', p_Type_b7580a6bc5ba,
      'DefaultValue', p_DefaultValue_b7580a6bc5ba,
      'IsRequired', p_IsRequired_b7580a6bc5ba,
      'LinkedParameterName', p_LinkedParameterName_b7580a6bc5ba,
      'LinkedParameterField', p_LinkedParameterField_b7580a6bc5ba,
      'ExtraFilter', p_ExtraFilter_b7580a6bc5ba,
      'EntityID', p_EntityID_b7580a6bc5ba,
      'RecordID', p_RecordID_b7580a6bc5ba,
      'OrderBy', p_OrderBy_b7580a6bc5ba,
      'TemplateContentID', p_TemplateContentID_b7580a6bc5ba
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_b7580a6bc5ba, p_TemplateID := p_TemplateID_b7580a6bc5ba, p_Name := p_Name_b7580a6bc5ba, p_Description := p_Description_b7580a6bc5ba, p_Type := p_Type_b7580a6bc5ba, p_DefaultValue := p_DefaultValue_b7580a6bc5ba, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_b7580a6bc5ba, p_LinkedParameterName := p_LinkedParameterName_b7580a6bc5ba, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_b7580a6bc5ba, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_b7580a6bc5ba, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_b7580a6bc5ba, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_b7580a6bc5ba, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_b7580a6bc5ba, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_b7580a6bc5ba, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_94d69014b91d UUID;
  p_TemplateID_94d69014b91d UUID;
  p_Name_94d69014b91d VARCHAR(255);
  p_Description_94d69014b91d TEXT;
  p_Type_94d69014b91d VARCHAR(20);
  p_DefaultValue_94d69014b91d TEXT;
  p_IsRequired_94d69014b91d BOOLEAN;
  p_LinkedParameterName_94d69014b91d VARCHAR(255);
  p_LinkedParameterField_94d69014b91d VARCHAR(500);
  p_ExtraFilter_94d69014b91d TEXT;
  p_EntityID_94d69014b91d UUID;
  p_RecordID_94d69014b91d VARCHAR(2000);
  p_OrderBy_94d69014b91d TEXT;
  p_TemplateContentID_94d69014b91d UUID;
BEGIN
  p_ID_94d69014b91d := 'd50e0b1f-4118-42ce-aed8-aa355fe34b1d';
  p_TemplateID_94d69014b91d := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_94d69014b91d := 'PaymentRef';
  p_Description_94d69014b91d := 'Template scalar parameter ''PaymentRef''';
  p_Type_94d69014b91d := 'Scalar';
  p_IsRequired_94d69014b91d := TRUE;
  p_TemplateID_94d69014b91d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_94d69014b91d THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_94d69014b91d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_94d69014b91d
                  OR ("TemplateID" = p_TemplateID_94d69014b91d AND "Name" = p_Name_94d69014b91d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_94d69014b91d,
      'TemplateID', p_TemplateID_94d69014b91d,
      'Name', p_Name_94d69014b91d,
      'Description', p_Description_94d69014b91d,
      'Type', p_Type_94d69014b91d,
      'DefaultValue', p_DefaultValue_94d69014b91d,
      'IsRequired', p_IsRequired_94d69014b91d,
      'LinkedParameterName', p_LinkedParameterName_94d69014b91d,
      'LinkedParameterField', p_LinkedParameterField_94d69014b91d,
      'ExtraFilter', p_ExtraFilter_94d69014b91d,
      'EntityID', p_EntityID_94d69014b91d,
      'RecordID', p_RecordID_94d69014b91d,
      'OrderBy', p_OrderBy_94d69014b91d,
      'TemplateContentID', p_TemplateContentID_94d69014b91d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_94d69014b91d, p_TemplateID := p_TemplateID_94d69014b91d, p_Name := p_Name_94d69014b91d, p_Description := p_Description_94d69014b91d, p_Type := p_Type_94d69014b91d, p_DefaultValue := p_DefaultValue_94d69014b91d, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_94d69014b91d, p_LinkedParameterName := p_LinkedParameterName_94d69014b91d, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_94d69014b91d, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_94d69014b91d, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_94d69014b91d, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_94d69014b91d, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_94d69014b91d, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_94d69014b91d, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_d0d198a66e9c UUID;
  p_TemplateID_d0d198a66e9c UUID;
  p_Name_d0d198a66e9c VARCHAR(255);
  p_Description_d0d198a66e9c TEXT;
  p_Type_d0d198a66e9c VARCHAR(20);
  p_DefaultValue_d0d198a66e9c TEXT;
  p_IsRequired_d0d198a66e9c BOOLEAN;
  p_LinkedParameterName_d0d198a66e9c VARCHAR(255);
  p_LinkedParameterField_d0d198a66e9c VARCHAR(500);
  p_ExtraFilter_d0d198a66e9c TEXT;
  p_EntityID_d0d198a66e9c UUID;
  p_RecordID_d0d198a66e9c VARCHAR(2000);
  p_OrderBy_d0d198a66e9c TEXT;
  p_TemplateContentID_d0d198a66e9c UUID;
BEGIN
  p_ID_d0d198a66e9c := '12955998-005a-4d88-9902-70626ecef1da';
  p_TemplateID_d0d198a66e9c := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_d0d198a66e9c := 'RailName';
  p_Description_d0d198a66e9c := 'Template scalar parameter ''RailName''';
  p_Type_d0d198a66e9c := 'Scalar';
  p_IsRequired_d0d198a66e9c := TRUE;
  p_TemplateID_d0d198a66e9c := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_d0d198a66e9c THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_d0d198a66e9c);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_d0d198a66e9c
                  OR ("TemplateID" = p_TemplateID_d0d198a66e9c AND "Name" = p_Name_d0d198a66e9c)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_d0d198a66e9c,
      'TemplateID', p_TemplateID_d0d198a66e9c,
      'Name', p_Name_d0d198a66e9c,
      'Description', p_Description_d0d198a66e9c,
      'Type', p_Type_d0d198a66e9c,
      'DefaultValue', p_DefaultValue_d0d198a66e9c,
      'IsRequired', p_IsRequired_d0d198a66e9c,
      'LinkedParameterName', p_LinkedParameterName_d0d198a66e9c,
      'LinkedParameterField', p_LinkedParameterField_d0d198a66e9c,
      'ExtraFilter', p_ExtraFilter_d0d198a66e9c,
      'EntityID', p_EntityID_d0d198a66e9c,
      'RecordID', p_RecordID_d0d198a66e9c,
      'OrderBy', p_OrderBy_d0d198a66e9c,
      'TemplateContentID', p_TemplateContentID_d0d198a66e9c
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_d0d198a66e9c, p_TemplateID := p_TemplateID_d0d198a66e9c, p_Name := p_Name_d0d198a66e9c, p_Description := p_Description_d0d198a66e9c, p_Type := p_Type_d0d198a66e9c, p_DefaultValue := p_DefaultValue_d0d198a66e9c, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_d0d198a66e9c, p_LinkedParameterName := p_LinkedParameterName_d0d198a66e9c, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_d0d198a66e9c, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_d0d198a66e9c, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_d0d198a66e9c, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_d0d198a66e9c, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_d0d198a66e9c, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_d0d198a66e9c, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_ef7bdb84c065 UUID;
  p_TemplateID_ef7bdb84c065 UUID;
  p_Name_ef7bdb84c065 VARCHAR(255);
  p_Description_ef7bdb84c065 TEXT;
  p_Type_ef7bdb84c065 VARCHAR(20);
  p_DefaultValue_ef7bdb84c065 TEXT;
  p_IsRequired_ef7bdb84c065 BOOLEAN;
  p_LinkedParameterName_ef7bdb84c065 VARCHAR(255);
  p_LinkedParameterField_ef7bdb84c065 VARCHAR(500);
  p_ExtraFilter_ef7bdb84c065 TEXT;
  p_EntityID_ef7bdb84c065 UUID;
  p_RecordID_ef7bdb84c065 VARCHAR(2000);
  p_OrderBy_ef7bdb84c065 TEXT;
  p_TemplateContentID_ef7bdb84c065 UUID;
BEGIN
  p_ID_ef7bdb84c065 := 'd2ce2e4f-8b60-4f09-8c03-be2e4df73f9a';
  p_TemplateID_ef7bdb84c065 := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_ef7bdb84c065 := 'Reason';
  p_Description_ef7bdb84c065 := 'Template scalar parameter ''Reason''';
  p_Type_ef7bdb84c065 := 'Scalar';
  p_IsRequired_ef7bdb84c065 := TRUE;
  p_TemplateID_ef7bdb84c065 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_ef7bdb84c065 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_ef7bdb84c065);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_ef7bdb84c065
                  OR ("TemplateID" = p_TemplateID_ef7bdb84c065 AND "Name" = p_Name_ef7bdb84c065)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_ef7bdb84c065,
      'TemplateID', p_TemplateID_ef7bdb84c065,
      'Name', p_Name_ef7bdb84c065,
      'Description', p_Description_ef7bdb84c065,
      'Type', p_Type_ef7bdb84c065,
      'DefaultValue', p_DefaultValue_ef7bdb84c065,
      'IsRequired', p_IsRequired_ef7bdb84c065,
      'LinkedParameterName', p_LinkedParameterName_ef7bdb84c065,
      'LinkedParameterField', p_LinkedParameterField_ef7bdb84c065,
      'ExtraFilter', p_ExtraFilter_ef7bdb84c065,
      'EntityID', p_EntityID_ef7bdb84c065,
      'RecordID', p_RecordID_ef7bdb84c065,
      'OrderBy', p_OrderBy_ef7bdb84c065,
      'TemplateContentID', p_TemplateContentID_ef7bdb84c065
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_ef7bdb84c065, p_TemplateID := p_TemplateID_ef7bdb84c065, p_Name := p_Name_ef7bdb84c065, p_Description := p_Description_ef7bdb84c065, p_Type := p_Type_ef7bdb84c065, p_DefaultValue := p_DefaultValue_ef7bdb84c065, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_ef7bdb84c065, p_LinkedParameterName := p_LinkedParameterName_ef7bdb84c065, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_ef7bdb84c065, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_ef7bdb84c065, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_ef7bdb84c065, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_ef7bdb84c065, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_ef7bdb84c065, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_ef7bdb84c065, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_8efe77949370 UUID;
  p_TemplateID_8efe77949370 UUID;
  p_Name_8efe77949370 VARCHAR(255);
  p_Description_8efe77949370 TEXT;
  p_Type_8efe77949370 VARCHAR(20);
  p_DefaultValue_8efe77949370 TEXT;
  p_IsRequired_8efe77949370 BOOLEAN;
  p_LinkedParameterName_8efe77949370 VARCHAR(255);
  p_LinkedParameterField_8efe77949370 VARCHAR(500);
  p_ExtraFilter_8efe77949370 TEXT;
  p_EntityID_8efe77949370 UUID;
  p_RecordID_8efe77949370 VARCHAR(2000);
  p_OrderBy_8efe77949370 TEXT;
  p_TemplateContentID_8efe77949370 UUID;
BEGIN
  p_ID_8efe77949370 := 'a8ad7cae-1897-4380-8987-b75d33f18cb7';
  p_TemplateID_8efe77949370 := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_8efe77949370 := 'WhereToAct';
  p_Description_8efe77949370 := 'Template scalar parameter ''WhereToAct''';
  p_Type_8efe77949370 := 'Scalar';
  p_IsRequired_8efe77949370 := TRUE;
  p_TemplateID_8efe77949370 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_8efe77949370 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_8efe77949370);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_8efe77949370
                  OR ("TemplateID" = p_TemplateID_8efe77949370 AND "Name" = p_Name_8efe77949370)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_8efe77949370,
      'TemplateID', p_TemplateID_8efe77949370,
      'Name', p_Name_8efe77949370,
      'Description', p_Description_8efe77949370,
      'Type', p_Type_8efe77949370,
      'DefaultValue', p_DefaultValue_8efe77949370,
      'IsRequired', p_IsRequired_8efe77949370,
      'LinkedParameterName', p_LinkedParameterName_8efe77949370,
      'LinkedParameterField', p_LinkedParameterField_8efe77949370,
      'ExtraFilter', p_ExtraFilter_8efe77949370,
      'EntityID', p_EntityID_8efe77949370,
      'RecordID', p_RecordID_8efe77949370,
      'OrderBy', p_OrderBy_8efe77949370,
      'TemplateContentID', p_TemplateContentID_8efe77949370
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_8efe77949370, p_TemplateID := p_TemplateID_8efe77949370, p_Name := p_Name_8efe77949370, p_Description := p_Description_8efe77949370, p_Type := p_Type_8efe77949370, p_DefaultValue := p_DefaultValue_8efe77949370, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_8efe77949370, p_LinkedParameterName := p_LinkedParameterName_8efe77949370, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_8efe77949370, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_8efe77949370, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_8efe77949370, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_8efe77949370, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_8efe77949370, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_8efe77949370, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_96c0c2bdce7a UUID;
  p_TemplateID_96c0c2bdce7a UUID;
  p_Name_96c0c2bdce7a VARCHAR(255);
  p_Description_96c0c2bdce7a TEXT;
  p_Type_96c0c2bdce7a VARCHAR(20);
  p_DefaultValue_96c0c2bdce7a TEXT;
  p_IsRequired_96c0c2bdce7a BOOLEAN;
  p_LinkedParameterName_96c0c2bdce7a VARCHAR(255);
  p_LinkedParameterField_96c0c2bdce7a VARCHAR(500);
  p_ExtraFilter_96c0c2bdce7a TEXT;
  p_EntityID_96c0c2bdce7a UUID;
  p_RecordID_96c0c2bdce7a VARCHAR(2000);
  p_OrderBy_96c0c2bdce7a TEXT;
  p_TemplateContentID_96c0c2bdce7a UUID;
BEGIN
  p_ID_96c0c2bdce7a := '428849d7-ee4e-4531-8584-ef346ce8e81e';
  p_TemplateID_96c0c2bdce7a := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Name_96c0c2bdce7a := 'Why';
  p_Description_96c0c2bdce7a := 'Template scalar parameter ''Why''';
  p_Type_96c0c2bdce7a := 'Scalar';
  p_IsRequired_96c0c2bdce7a := TRUE;
  p_TemplateID_96c0c2bdce7a := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_TemplateID_96c0c2bdce7a THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_96c0c2bdce7a);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_96c0c2bdce7a
                  OR ("TemplateID" = p_TemplateID_96c0c2bdce7a AND "Name" = p_Name_96c0c2bdce7a)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_96c0c2bdce7a,
      'TemplateID', p_TemplateID_96c0c2bdce7a,
      'Name', p_Name_96c0c2bdce7a,
      'Description', p_Description_96c0c2bdce7a,
      'Type', p_Type_96c0c2bdce7a,
      'DefaultValue', p_DefaultValue_96c0c2bdce7a,
      'IsRequired', p_IsRequired_96c0c2bdce7a,
      'LinkedParameterName', p_LinkedParameterName_96c0c2bdce7a,
      'LinkedParameterField', p_LinkedParameterField_96c0c2bdce7a,
      'ExtraFilter', p_ExtraFilter_96c0c2bdce7a,
      'EntityID', p_EntityID_96c0c2bdce7a,
      'RecordID', p_RecordID_96c0c2bdce7a,
      'OrderBy', p_OrderBy_96c0c2bdce7a,
      'TemplateContentID', p_TemplateContentID_96c0c2bdce7a
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_96c0c2bdce7a, p_TemplateID := p_TemplateID_96c0c2bdce7a, p_Name := p_Name_96c0c2bdce7a, p_Description := p_Description_96c0c2bdce7a, p_Type := p_Type_96c0c2bdce7a, p_DefaultValue := p_DefaultValue_96c0c2bdce7a, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_96c0c2bdce7a, p_LinkedParameterName := p_LinkedParameterName_96c0c2bdce7a, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_96c0c2bdce7a, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_96c0c2bdce7a, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_96c0c2bdce7a, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_96c0c2bdce7a, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_96c0c2bdce7a, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_96c0c2bdce7a, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: User Notification Types (core SP call only)
DO $mj$
DECLARE
  p_ID_b9a464d96e6e UUID;
  p_Name_b9a464d96e6e VARCHAR(100);
  p_Description_b9a464d96e6e VARCHAR(500);
  p_DefaultInApp_b9a464d96e6e BOOLEAN;
  p_DefaultEmail_b9a464d96e6e BOOLEAN;
  p_DefaultSMS_b9a464d96e6e BOOLEAN;
  p_AllowUserPreference_b9a464d96e6e BOOLEAN;
  p_EmailTemplateID_b9a464d96e6e UUID;
  p_SMSTemplateID_b9a464d96e6e UUID;
  p_Icon_b9a464d96e6e VARCHAR(100);
  p_Color_b9a464d96e6e VARCHAR(50);
  p_AutoExpireDays_b9a464d96e6e INTEGER;
  p_Priority_b9a464d96e6e INTEGER;
BEGIN
  p_ID_b9a464d96e6e := '83DCA89D-9D61-4FB4-B2A6-E0940E690D0D';
  p_Name_b9a464d96e6e := 'Payment Needs Review';
  p_Description_b9a464d96e6e := 'Sent when the external payment poll leaves a payment waiting for a person: unmatched to invoices Orders issued, refused, re-applied to different invoices on the rail, or needing reversal. One notice per payment when it starts waiting or its reason changes. Act on it under Orders → Receivables → Invoicing queue → Payment exceptions.';
  p_DefaultInApp_b9a464d96e6e := TRUE;
  p_DefaultEmail_b9a464d96e6e := TRUE;
  p_DefaultSMS_b9a464d96e6e := FALSE;
  p_AllowUserPreference_b9a464d96e6e := TRUE;
  p_EmailTemplateID_b9a464d96e6e := 'F33AE820-6566-41A0-B42D-F11FEC91C1C9';
  p_Icon_b9a464d96e6e := 'fa-money-check-dollar';
  p_Color_b9a464d96e6e := '#B45309';
  p_AutoExpireDays_b9a464d96e6e := 30;
  p_Priority_b9a464d96e6e := 10;
  p_EmailTemplateID_b9a464d96e6e := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Payment Needs Review - Email' ORDER BY CASE WHEN "ID" = p_EmailTemplateID_b9a464d96e6e THEN 0 ELSE 1 END LIMIT 1), p_EmailTemplateID_b9a464d96e6e);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."UserNotificationType"
               WHERE "ID" = p_ID_b9a464d96e6e
                  OR "Name" = p_Name_b9a464d96e6e) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateUserNotificationType'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateUserNotificationType"(p_data := jsonb_build_object(
      'ID', p_ID_b9a464d96e6e,
      'Name', p_Name_b9a464d96e6e,
      'Description', p_Description_b9a464d96e6e,
      'DefaultInApp', p_DefaultInApp_b9a464d96e6e,
      'DefaultEmail', p_DefaultEmail_b9a464d96e6e,
      'DefaultSMS', p_DefaultSMS_b9a464d96e6e,
      'AllowUserPreference', p_AllowUserPreference_b9a464d96e6e,
      'EmailTemplateID', p_EmailTemplateID_b9a464d96e6e,
      'SMSTemplateID', p_SMSTemplateID_b9a464d96e6e,
      'Icon', p_Icon_b9a464d96e6e,
      'Color', p_Color_b9a464d96e6e,
      'AutoExpireDays', p_AutoExpireDays_b9a464d96e6e,
      'Priority', p_Priority_b9a464d96e6e
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateUserNotificationType"(p_ID := p_ID_b9a464d96e6e, p_Name := p_Name_b9a464d96e6e, p_Description := p_Description_b9a464d96e6e, p_DefaultInApp := p_DefaultInApp_b9a464d96e6e, p_DefaultEmail := p_DefaultEmail_b9a464d96e6e, p_DefaultSMS := p_DefaultSMS_b9a464d96e6e, p_AllowUserPreference := p_AllowUserPreference_b9a464d96e6e, p_EmailTemplateID := p_EmailTemplateID_b9a464d96e6e, p_SMSTemplateID := p_SMSTemplateID_b9a464d96e6e, p_SMSTemplateID_Clear := TRUE, p_Icon := p_Icon_b9a464d96e6e, p_Color := p_Color_b9a464d96e6e, p_AutoExpireDays := p_AutoExpireDays_b9a464d96e6e, p_Priority := p_Priority_b9a464d96e6e);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Authorizations (core SP call only)
DO $mj$
DECLARE
  p_ParentID_0dbf70d3d1f6 UUID;
  p_Name_0dbf70d3d1f6 VARCHAR(100);
  p_IsActive_0dbf70d3d1f6 BOOLEAN;
  p_UseAuditLog_0dbf70d3d1f6 BOOLEAN;
  p_Description_0dbf70d3d1f6 TEXT;
  p_ID_0dbf70d3d1f6 UUID;
BEGIN
  p_Name_0dbf70d3d1f6 := 'MJ.BizApps.Orders.Progress.Supersede';
  p_IsActive_0dbf70d3d1f6 := TRUE;
  p_UseAuditLog_0dbf70d3d1f6 := TRUE;
  p_Description_0dbf70d3d1f6 := 'Replace the latest posted progress observation on a percentage-of-completion line. Orders.RecordProgress writes a new observation that names the one it replaces, reverses the replaced observation''s recognition (on its own date, or on the first open day when finance has closed that month), and posts the new catch-up on the date entered, which may not be in a month finance has closed. Nothing is edited; the replaced row stays Posted and immutable. Held by the Orders Revenue Supervisor role, on top of MJ.BizApps.Orders.Progress.Attest, which every attestation needs. Without this row, supersede is refused.';
  p_ID_0dbf70d3d1f6 := '6CF663E9-4180-42F4-BBAE-18C1BC598E5C';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateAuthorization'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateAuthorization"(p_data := jsonb_build_object(
    'ParentID', p_ParentID_0dbf70d3d1f6,
    'Name', p_Name_0dbf70d3d1f6,
    'IsActive', p_IsActive_0dbf70d3d1f6,
    'UseAuditLog', p_UseAuditLog_0dbf70d3d1f6,
    'Description', p_Description_0dbf70d3d1f6,
    'ID', p_ID_0dbf70d3d1f6
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateAuthorization"(p_ParentID := p_ParentID_0dbf70d3d1f6, p_ParentID_Clear := TRUE, p_Name := p_Name_0dbf70d3d1f6, p_IsActive := p_IsActive_0dbf70d3d1f6, p_UseAuditLog := p_UseAuditLog_0dbf70d3d1f6, p_Description := p_Description_0dbf70d3d1f6, p_ID := p_ID_0dbf70d3d1f6);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_f558192208cb VARCHAR(255);
  p_Description_f558192208cb TEXT;
  p_AutoUpdateDescription_f558192208cb BOOLEAN;
  p_IsPrimaryKey_f558192208cb BOOLEAN;
  p_IsUnique_f558192208cb BOOLEAN;
  p_Category_f558192208cb VARCHAR(255);
  p_ValueListType_f558192208cb VARCHAR(20);
  p_ExtendedType_f558192208cb VARCHAR(50);
  p_CodeType_f558192208cb VARCHAR(50);
  p_DefaultInView_f558192208cb BOOLEAN;
  p_ViewCellTemplate_f558192208cb TEXT;
  p_DefaultColumnWidth_f558192208cb INTEGER;
  p_AllowUpdateAPI_f558192208cb BOOLEAN;
  p_AllowUpdateInView_f558192208cb BOOLEAN;
  p_IncludeInUserSearchAPI_f558192208cb BOOLEAN;
  p_FullTextSearchEnabled_f558192208cb BOOLEAN;
  p_UserSearchParamFormatAPI_f558192208cb VARCHAR(500);
  p_IncludeInGeneratedForm_f558192208cb BOOLEAN;
  p_GeneratedFormSection_f558192208cb VARCHAR(10);
  p_IsNameField_f558192208cb BOOLEAN;
  p_RelatedEntityID_f558192208cb UUID;
  p_RelatedEntityFieldName_f558192208cb VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_f558192208cb BOOLEAN;
  p_RelatedEntityNameFieldMap_f558192208cb VARCHAR(255);
  p_RelatedEntityDisplayType_f558192208cb VARCHAR(20);
  p_EntityIDFieldName_f558192208cb VARCHAR(100);
  p_ScopeDefault_f558192208cb VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_f558192208cb BOOLEAN;
  p_ValuesToPackWithSchema_f558192208cb VARCHAR(10);
  p_Status_f558192208cb VARCHAR(25);
  p_AutoUpdateIsNameField_f558192208cb BOOLEAN;
  p_AutoUpdateDefaultInView_f558192208cb BOOLEAN;
  p_AutoUpdateCategory_f558192208cb BOOLEAN;
  p_AutoUpdateDisplayName_f558192208cb BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_f558192208cb BOOLEAN;
  p_Encrypt_f558192208cb BOOLEAN;
  p_EncryptionKeyID_f558192208cb UUID;
  p_AllowDecryptInAPI_f558192208cb BOOLEAN;
  p_SendEncryptedValue_f558192208cb BOOLEAN;
  p_IsSoftPrimaryKey_f558192208cb BOOLEAN;
  p_IsSoftForeignKey_f558192208cb BOOLEAN;
  p_RelatedEntityJoinFields_f558192208cb TEXT;
  p_JSONType_f558192208cb VARCHAR(255);
  p_JSONTypeIsArray_f558192208cb BOOLEAN;
  p_JSONTypeDefinition_f558192208cb TEXT;
  p_UserSearchPredicateAPI_f558192208cb VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_f558192208cb BOOLEAN;
  p_AutoUpdateFullTextSearch_f558192208cb BOOLEAN;
  p_AutoUpdateExtendedType_f558192208cb BOOLEAN;
  p_IsComputed_f558192208cb BOOLEAN;
  p_EmbeddedRecord_f558192208cb TEXT;
  p_Configuration_f558192208cb TEXT;
  p_ID_f558192208cb UUID;
BEGIN
  p_DisplayName_f558192208cb := 'Is Sellable New';
  p_AutoUpdateDescription_f558192208cb := TRUE;
  p_IsPrimaryKey_f558192208cb := FALSE;
  p_IsUnique_f558192208cb := FALSE;
  p_Category_f558192208cb := 'Product Details';
  p_ValueListType_f558192208cb := 'None';
  p_DefaultInView_f558192208cb := FALSE;
  p_DefaultColumnWidth_f558192208cb := 150;
  p_AllowUpdateAPI_f558192208cb := TRUE;
  p_AllowUpdateInView_f558192208cb := TRUE;
  p_IncludeInUserSearchAPI_f558192208cb := FALSE;
  p_FullTextSearchEnabled_f558192208cb := FALSE;
  p_IncludeInGeneratedForm_f558192208cb := TRUE;
  p_GeneratedFormSection_f558192208cb := 'Category';
  p_IsNameField_f558192208cb := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_f558192208cb := TRUE;
  p_RelatedEntityDisplayType_f558192208cb := 'Search';
  p_AutoUpdateRelatedEntityInfo_f558192208cb := TRUE;
  p_ValuesToPackWithSchema_f558192208cb := 'Auto';
  p_Status_f558192208cb := 'Active';
  p_AutoUpdateIsNameField_f558192208cb := TRUE;
  p_AutoUpdateDefaultInView_f558192208cb := TRUE;
  p_AutoUpdateCategory_f558192208cb := TRUE;
  p_AutoUpdateDisplayName_f558192208cb := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_f558192208cb := TRUE;
  p_Encrypt_f558192208cb := FALSE;
  p_AllowDecryptInAPI_f558192208cb := FALSE;
  p_SendEncryptedValue_f558192208cb := FALSE;
  p_IsSoftPrimaryKey_f558192208cb := FALSE;
  p_IsSoftForeignKey_f558192208cb := FALSE;
  p_JSONTypeIsArray_f558192208cb := FALSE;
  p_UserSearchPredicateAPI_f558192208cb := 'Contains';
  p_AutoUpdateUserSearchPredicate_f558192208cb := TRUE;
  p_AutoUpdateFullTextSearch_f558192208cb := TRUE;
  p_AutoUpdateExtendedType_f558192208cb := TRUE;
  p_IsComputed_f558192208cb := FALSE;
  p_ID_f558192208cb := '1ABF1396-A79F-4D48-B605-2B42224F1CC2';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_f558192208cb,
    'Description', p_Description_f558192208cb,
    'AutoUpdateDescription', p_AutoUpdateDescription_f558192208cb,
    'IsPrimaryKey', p_IsPrimaryKey_f558192208cb,
    'IsUnique', p_IsUnique_f558192208cb,
    'Category', p_Category_f558192208cb,
    'ValueListType', p_ValueListType_f558192208cb,
    'ExtendedType', p_ExtendedType_f558192208cb,
    'CodeType', p_CodeType_f558192208cb,
    'DefaultInView', p_DefaultInView_f558192208cb,
    'ViewCellTemplate', p_ViewCellTemplate_f558192208cb,
    'DefaultColumnWidth', p_DefaultColumnWidth_f558192208cb,
    'AllowUpdateAPI', p_AllowUpdateAPI_f558192208cb,
    'AllowUpdateInView', p_AllowUpdateInView_f558192208cb,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_f558192208cb,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_f558192208cb,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_f558192208cb,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_f558192208cb,
    'GeneratedFormSection', p_GeneratedFormSection_f558192208cb,
    'IsNameField', p_IsNameField_f558192208cb,
    'RelatedEntityID', p_RelatedEntityID_f558192208cb,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_f558192208cb,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_f558192208cb,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_f558192208cb,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_f558192208cb,
    'EntityIDFieldName', p_EntityIDFieldName_f558192208cb,
    'ScopeDefault', p_ScopeDefault_f558192208cb,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_f558192208cb,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_f558192208cb,
    'Status', p_Status_f558192208cb,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_f558192208cb,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_f558192208cb,
    'AutoUpdateCategory', p_AutoUpdateCategory_f558192208cb,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_f558192208cb,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_f558192208cb,
    'Encrypt', p_Encrypt_f558192208cb,
    'EncryptionKeyID', p_EncryptionKeyID_f558192208cb,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_f558192208cb,
    'SendEncryptedValue', p_SendEncryptedValue_f558192208cb,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_f558192208cb,
    'IsSoftForeignKey', p_IsSoftForeignKey_f558192208cb,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_f558192208cb,
    'JSONType', p_JSONType_f558192208cb,
    'JSONTypeIsArray', p_JSONTypeIsArray_f558192208cb,
    'JSONTypeDefinition', p_JSONTypeDefinition_f558192208cb,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_f558192208cb,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_f558192208cb,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_f558192208cb,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_f558192208cb,
    'IsComputed', p_IsComputed_f558192208cb
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_f558192208cb,
    'Configuration', p_Configuration_f558192208cb,
    'ID', p_ID_f558192208cb
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_f558192208cb, p_Description := p_Description_f558192208cb, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_f558192208cb, p_IsPrimaryKey := p_IsPrimaryKey_f558192208cb, p_IsUnique := p_IsUnique_f558192208cb, p_Category := p_Category_f558192208cb, p_ValueListType := p_ValueListType_f558192208cb, p_ExtendedType := p_ExtendedType_f558192208cb, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_f558192208cb, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_f558192208cb, p_ViewCellTemplate := p_ViewCellTemplate_f558192208cb, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_f558192208cb, p_AllowUpdateAPI := p_AllowUpdateAPI_f558192208cb, p_AllowUpdateInView := p_AllowUpdateInView_f558192208cb, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_f558192208cb, p_FullTextSearchEnabled := p_FullTextSearchEnabled_f558192208cb, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_f558192208cb, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_f558192208cb, p_GeneratedFormSection := p_GeneratedFormSection_f558192208cb, p_IsNameField := p_IsNameField_f558192208cb, p_RelatedEntityID := p_RelatedEntityID_f558192208cb, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_f558192208cb, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_f558192208cb, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_f558192208cb, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_f558192208cb, p_EntityIDFieldName := p_EntityIDFieldName_f558192208cb, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_f558192208cb, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_f558192208cb, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_f558192208cb, p_Status := p_Status_f558192208cb, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_f558192208cb, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_f558192208cb, p_AutoUpdateCategory := p_AutoUpdateCategory_f558192208cb, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_f558192208cb, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_f558192208cb, p_Encrypt := p_Encrypt_f558192208cb, p_EncryptionKeyID := p_EncryptionKeyID_f558192208cb, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_f558192208cb, p_SendEncryptedValue := p_SendEncryptedValue_f558192208cb, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_f558192208cb, p_IsSoftForeignKey := p_IsSoftForeignKey_f558192208cb, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_f558192208cb, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_f558192208cb, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_f558192208cb, p_JSONTypeDefinition := p_JSONTypeDefinition_f558192208cb, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_f558192208cb, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_f558192208cb, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_f558192208cb, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_f558192208cb, p_IsComputed := p_IsComputed_f558192208cb, p_EmbeddedRecord := p_EmbeddedRecord_f558192208cb, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_f558192208cb, p_Configuration_Clear := TRUE, p_ID := p_ID_f558192208cb);
  END IF;
END $mj$;
