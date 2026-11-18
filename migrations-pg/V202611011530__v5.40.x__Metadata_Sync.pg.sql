-- =============================================================================================
-- PostgreSQL counterpart of V202611011530__v5.40.x__Metadata_Sync.sql -- BizApps Orders v5.40.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file
--     was generated from. Each record is a DO block that calls the core function, in whichever
--     signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written from the T-SQL ones, block for block, as in V202610300200__v5.39.x:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Every assignment matches the T-SQL file (strings verbatim, BIT 1/0 as TRUE/FALSE); checked
--     one by one. The converter rewrote "; with" inside Link Provider Subscription's description
--     to "WITH"; that string is restored verbatim from the T-SQL file.
--   * Core calls use ${mjSchema}.
-- =============================================================================================

SET standard_conforming_strings = on;
-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_e70e320afcba UUID;
  p_Name_e70e320afcba VARCHAR(255);
  p_OperationKey_e70e320afcba VARCHAR(255);
  p_CategoryID_e70e320afcba UUID;
  p_Description_e70e320afcba TEXT;
  p_InputTypeName_e70e320afcba VARCHAR(255);
  p_InputTypeDefinition_e70e320afcba TEXT;
  p_InputTypeIsArray_e70e320afcba BOOLEAN;
  p_OutputTypeName_e70e320afcba VARCHAR(255);
  p_OutputTypeDefinition_e70e320afcba TEXT;
  p_OutputTypeIsArray_e70e320afcba BOOLEAN;
  p_ExecutionMode_e70e320afcba VARCHAR(20);
  p_RequiredScope_e70e320afcba VARCHAR(255);
  p_RequiresSystemUser_e70e320afcba BOOLEAN;
  p_GenerationType_e70e320afcba VARCHAR(20);
  p_Code_e70e320afcba TEXT;
  p_CodeApprovalStatus_e70e320afcba VARCHAR(20);
  p_CodeApprovedByUserID_e70e320afcba UUID;
  p_CodeApprovedAt_e70e320afcba TIMESTAMPTZ;
  p_ContractFingerprint_e70e320afcba VARCHAR(100);
  p_Status_e70e320afcba VARCHAR(20);
  p_CacheTTLSeconds_e70e320afcba INTEGER;
  p_TimeoutMS_e70e320afcba INTEGER;
  p_MaxConcurrency_e70e320afcba INTEGER;
  p_CodeLocked_e70e320afcba BOOLEAN;
  p_CodeComments_e70e320afcba TEXT;
  p_Libraries_e70e320afcba TEXT;
BEGIN
  p_ID_e70e320afcba := 'D59963D2-F046-45B8-8E1D-683ACA930971';
  p_Name_e70e320afcba := 'Confirm Readiness';
  p_OperationKey_e70e320afcba := 'Orders.ConfirmReadiness';
  p_CategoryID_e70e320afcba := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B301';
  p_Description_e70e320afcba := 'The concession problems that would make confirm refuse a saved, unbooked order, one sentence each in the wording confirm refuses with: a concession awaiting approval, a line priced or discounted below its catalog price with no approved Price concession, a line whose product needs sale approval with none recorded. Read-only. Runs the same check confirm runs, over the saved order, so the order form''s list cannot disagree with the refusal. A booked or voided order returns no problems.';
  p_InputTypeName_e70e320afcba := 'ConfirmReadinessInput';
  p_InputTypeDefinition_e70e320afcba := '/**
 * Input for `Orders.ConfirmReadiness`.
 *
 * What would make confirm refuse this order on the concession gate. The order form asks this so the
 * list it shows under "Before this can be confirmed" is the rule confirm enforces, not a copy of it.
 *
 * Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ConfirmReadinessInput {
    /** A saved order. Its saved header and lines are checked, not unsaved edits in a browser. */
    OrderHeaderID: string;
}
';
  p_InputTypeIsArray_e70e320afcba := FALSE;
  p_OutputTypeName_e70e320afcba := 'ConfirmReadinessOutput';
  p_OutputTypeDefinition_e70e320afcba := '/**
 * Output of `Orders.ConfirmReadiness`.
 *
 * Empty when confirm would pass the concession gate, and for an order that is already booked or
 * voided.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ConfirmReadinessOutput {
    /**
     * One sentence per problem, in the wording confirm refuses with, e.g. "Line 1 is discounted 10%,
     * a concession worth 1000.00 with no approved Price concession recorded for it."
     */
    ConcessionProblems: string[];
}
';
  p_OutputTypeIsArray_e70e320afcba := FALSE;
  p_ExecutionMode_e70e320afcba := 'Sync';
  p_RequiredScope_e70e320afcba := 'orders:read';
  p_RequiresSystemUser_e70e320afcba := FALSE;
  p_GenerationType_e70e320afcba := 'Manual';
  p_CodeApprovalStatus_e70e320afcba := 'Approved';
  p_Status_e70e320afcba := 'Active';
  p_CodeLocked_e70e320afcba := FALSE;
  p_CategoryID_e70e320afcba := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Order Lifecycle' ORDER BY CASE WHEN "ID" = p_CategoryID_e70e320afcba THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_e70e320afcba);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
               WHERE "ID" = p_ID_e70e320afcba OR "OperationKey" = p_OperationKey_e70e320afcba) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
      'ID', p_ID_e70e320afcba,
      'Name', p_Name_e70e320afcba,
      'OperationKey', p_OperationKey_e70e320afcba,
      'CategoryID', p_CategoryID_e70e320afcba,
      'Description', p_Description_e70e320afcba,
      'InputTypeName', p_InputTypeName_e70e320afcba,
      'InputTypeDefinition', p_InputTypeDefinition_e70e320afcba,
      'InputTypeIsArray', p_InputTypeIsArray_e70e320afcba,
      'OutputTypeName', p_OutputTypeName_e70e320afcba,
      'OutputTypeDefinition', p_OutputTypeDefinition_e70e320afcba,
      'OutputTypeIsArray', p_OutputTypeIsArray_e70e320afcba,
      'ExecutionMode', p_ExecutionMode_e70e320afcba,
      'RequiredScope', p_RequiredScope_e70e320afcba,
      'RequiresSystemUser', p_RequiresSystemUser_e70e320afcba,
      'GenerationType', p_GenerationType_e70e320afcba,
      'Code', p_Code_e70e320afcba,
      'CodeApprovalStatus', p_CodeApprovalStatus_e70e320afcba,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_e70e320afcba,
      'CodeApprovedAt', p_CodeApprovedAt_e70e320afcba,
      'ContractFingerprint', p_ContractFingerprint_e70e320afcba,
      'Status', p_Status_e70e320afcba,
      'CacheTTLSeconds', p_CacheTTLSeconds_e70e320afcba,
      'TimeoutMS', p_TimeoutMS_e70e320afcba,
      'MaxConcurrency', p_MaxConcurrency_e70e320afcba,
      'CodeLocked', p_CodeLocked_e70e320afcba,
      'CodeComments', p_CodeComments_e70e320afcba,
      'Libraries', p_Libraries_e70e320afcba
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_e70e320afcba, p_Name := p_Name_e70e320afcba, p_OperationKey := p_OperationKey_e70e320afcba, p_CategoryID := p_CategoryID_e70e320afcba, p_Description := p_Description_e70e320afcba, p_InputTypeName := p_InputTypeName_e70e320afcba, p_InputTypeDefinition := p_InputTypeDefinition_e70e320afcba, p_InputTypeIsArray := p_InputTypeIsArray_e70e320afcba, p_OutputTypeName := p_OutputTypeName_e70e320afcba, p_OutputTypeDefinition := p_OutputTypeDefinition_e70e320afcba, p_OutputTypeIsArray := p_OutputTypeIsArray_e70e320afcba, p_ExecutionMode := p_ExecutionMode_e70e320afcba, p_RequiredScope := p_RequiredScope_e70e320afcba, p_RequiresSystemUser := p_RequiresSystemUser_e70e320afcba, p_GenerationType := p_GenerationType_e70e320afcba, p_Code := p_Code_e70e320afcba, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_e70e320afcba, p_CodeApprovedByUserID := p_CodeApprovedByUserID_e70e320afcba, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_e70e320afcba, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_e70e320afcba, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_e70e320afcba, p_CacheTTLSeconds := p_CacheTTLSeconds_e70e320afcba, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_e70e320afcba, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_e70e320afcba, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_e70e320afcba, p_CodeComments := p_CodeComments_e70e320afcba, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_e70e320afcba, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Actions (core SP call only)
DO $mj$
DECLARE
  p_ID_43c7b9fe16e5 UUID;
  p_CategoryID_43c7b9fe16e5 UUID;
  p_Name_43c7b9fe16e5 VARCHAR(425);
  p_Description_43c7b9fe16e5 TEXT;
  p_Type_43c7b9fe16e5 VARCHAR(20);
  p_UserPrompt_43c7b9fe16e5 TEXT;
  p_UserComments_43c7b9fe16e5 TEXT;
  p_Code_43c7b9fe16e5 TEXT;
  p_CodeComments_43c7b9fe16e5 TEXT;
  p_CodeApprovalStatus_43c7b9fe16e5 VARCHAR(20);
  p_CodeApprovalComments_43c7b9fe16e5 TEXT;
  p_CodeApprovedByUserID_43c7b9fe16e5 UUID;
  p_CodeApprovedAt_43c7b9fe16e5 TIMESTAMPTZ;
  p_CodeLocked_43c7b9fe16e5 BOOLEAN;
  p_ForceCodeGeneration_43c7b9fe16e5 BOOLEAN;
  p_RetentionPeriod_43c7b9fe16e5 INTEGER;
  p_Status_43c7b9fe16e5 VARCHAR(20);
  p_DriverClass_43c7b9fe16e5 VARCHAR(255);
  p_ParentID_43c7b9fe16e5 UUID;
  p_IconClass_43c7b9fe16e5 VARCHAR(100);
  p_DefaultCompactPromptID_43c7b9fe16e5 UUID;
  p_Config_43c7b9fe16e5 TEXT;
  p_RuntimeActionConfiguration_43c7b9fe16e5 TEXT;
  p_MaxExecutionTimeMS_43c7b9fe16e5 INTEGER;
  p_CreatedByAgentID_43c7b9fe16e5 UUID;
BEGIN
  p_ID_43c7b9fe16e5 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_CategoryID_43c7b9fe16e5 := '359F5241-25D1-4949-A74F-C20CA3EECC3A';
  p_Name_43c7b9fe16e5 := 'Sync Provider Subscriptions';
  p_Description_43c7b9fe16e5 := 'For subscriptions a payment gateway bills (ProviderSubscriptionID set): read each one and its invoices from the gateway and bring Orders in line. Each renewal the gateway was paid for is booked as a renewal order with its payment and next term, on the subscription''s own product at the amount charged; each failed collection attempt is recorded, and access is kept to the end of the gateway''s next retry; a cancel-at-period-end set or withdrawn at the gateway turns automatic renewal off or on; a subscription the gateway ended is cancelled in Orders. Anything a person must decide raises one open alert Task per subscription and problem; nothing is fixed silently, and every run reports each difference it found and what it did. Preview (the default) reads both sides and writes nothing.';
  p_Type_43c7b9fe16e5 := 'Custom';
  p_UserPrompt_43c7b9fe16e5 := 'Bring gateway-billed subscriptions in line with the gateway, or preview the differences.';
  p_CodeApprovalStatus_43c7b9fe16e5 := 'Approved';
  p_CodeLocked_43c7b9fe16e5 := FALSE;
  p_ForceCodeGeneration_43c7b9fe16e5 := FALSE;
  p_Status_43c7b9fe16e5 := 'Active';
  p_DriverClass_43c7b9fe16e5 := 'Orders.SyncProviderSubscriptions';
  p_IconClass_43c7b9fe16e5 := 'fa-solid fa-rotate';
  p_CategoryID_43c7b9fe16e5 := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_43c7b9fe16e5 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_43c7b9fe16e5);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action"
               WHERE "ID" = p_ID_43c7b9fe16e5 OR "Name" = p_Name_43c7b9fe16e5) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAction'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAction"(p_data := jsonb_build_object(
      'ID', p_ID_43c7b9fe16e5,
      'CategoryID', p_CategoryID_43c7b9fe16e5,
      'Name', p_Name_43c7b9fe16e5,
      'Description', p_Description_43c7b9fe16e5,
      'Type', p_Type_43c7b9fe16e5,
      'UserPrompt', p_UserPrompt_43c7b9fe16e5,
      'UserComments', p_UserComments_43c7b9fe16e5,
      'Code', p_Code_43c7b9fe16e5,
      'CodeComments', p_CodeComments_43c7b9fe16e5,
      'CodeApprovalStatus', p_CodeApprovalStatus_43c7b9fe16e5,
      'CodeApprovalComments', p_CodeApprovalComments_43c7b9fe16e5,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_43c7b9fe16e5,
      'CodeApprovedAt', p_CodeApprovedAt_43c7b9fe16e5,
      'CodeLocked', p_CodeLocked_43c7b9fe16e5,
      'ForceCodeGeneration', p_ForceCodeGeneration_43c7b9fe16e5,
      'RetentionPeriod', p_RetentionPeriod_43c7b9fe16e5,
      'Status', p_Status_43c7b9fe16e5,
      'DriverClass', p_DriverClass_43c7b9fe16e5,
      'ParentID', p_ParentID_43c7b9fe16e5,
      'IconClass', p_IconClass_43c7b9fe16e5,
      'DefaultCompactPromptID', p_DefaultCompactPromptID_43c7b9fe16e5,
      'Config', p_Config_43c7b9fe16e5,
      'RuntimeActionConfiguration', p_RuntimeActionConfiguration_43c7b9fe16e5,
      'MaxExecutionTimeMS', p_MaxExecutionTimeMS_43c7b9fe16e5,
      'CreatedByAgentID', p_CreatedByAgentID_43c7b9fe16e5
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAction"(p_ID := p_ID_43c7b9fe16e5, p_CategoryID := p_CategoryID_43c7b9fe16e5, p_Name := p_Name_43c7b9fe16e5, p_Description := p_Description_43c7b9fe16e5, p_Type := p_Type_43c7b9fe16e5, p_UserPrompt := p_UserPrompt_43c7b9fe16e5, p_UserComments := p_UserComments_43c7b9fe16e5, p_UserComments_Clear := TRUE, p_Code := p_Code_43c7b9fe16e5, p_Code_Clear := TRUE, p_CodeComments := p_CodeComments_43c7b9fe16e5, p_CodeComments_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_43c7b9fe16e5, p_CodeApprovalComments := p_CodeApprovalComments_43c7b9fe16e5, p_CodeApprovalComments_Clear := TRUE, p_CodeApprovedByUserID := p_CodeApprovedByUserID_43c7b9fe16e5, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_43c7b9fe16e5, p_CodeApprovedAt_Clear := TRUE, p_CodeLocked := p_CodeLocked_43c7b9fe16e5, p_ForceCodeGeneration := p_ForceCodeGeneration_43c7b9fe16e5, p_RetentionPeriod := p_RetentionPeriod_43c7b9fe16e5, p_RetentionPeriod_Clear := TRUE, p_Status := p_Status_43c7b9fe16e5, p_DriverClass := p_DriverClass_43c7b9fe16e5, p_ParentID := p_ParentID_43c7b9fe16e5, p_ParentID_Clear := TRUE, p_IconClass := p_IconClass_43c7b9fe16e5, p_DefaultCompactPromptID := p_DefaultCompactPromptID_43c7b9fe16e5, p_DefaultCompactPromptID_Clear := TRUE, p_Config := p_Config_43c7b9fe16e5, p_Config_Clear := TRUE, p_RuntimeActionConfiguration := p_RuntimeActionConfiguration_43c7b9fe16e5, p_RuntimeActionConfiguration_Clear := TRUE, p_MaxExecutionTimeMS := p_MaxExecutionTimeMS_43c7b9fe16e5, p_MaxExecutionTimeMS_Clear := TRUE, p_CreatedByAgentID := p_CreatedByAgentID_43c7b9fe16e5, p_CreatedByAgentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Actions (core SP call only)
DO $mj$
DECLARE
  p_ID_4d1da4cfb471 UUID;
  p_CategoryID_4d1da4cfb471 UUID;
  p_Name_4d1da4cfb471 VARCHAR(425);
  p_Description_4d1da4cfb471 TEXT;
  p_Type_4d1da4cfb471 VARCHAR(20);
  p_UserPrompt_4d1da4cfb471 TEXT;
  p_UserComments_4d1da4cfb471 TEXT;
  p_Code_4d1da4cfb471 TEXT;
  p_CodeComments_4d1da4cfb471 TEXT;
  p_CodeApprovalStatus_4d1da4cfb471 VARCHAR(20);
  p_CodeApprovalComments_4d1da4cfb471 TEXT;
  p_CodeApprovedByUserID_4d1da4cfb471 UUID;
  p_CodeApprovedAt_4d1da4cfb471 TIMESTAMPTZ;
  p_CodeLocked_4d1da4cfb471 BOOLEAN;
  p_ForceCodeGeneration_4d1da4cfb471 BOOLEAN;
  p_RetentionPeriod_4d1da4cfb471 INTEGER;
  p_Status_4d1da4cfb471 VARCHAR(20);
  p_DriverClass_4d1da4cfb471 VARCHAR(255);
  p_ParentID_4d1da4cfb471 UUID;
  p_IconClass_4d1da4cfb471 VARCHAR(100);
  p_DefaultCompactPromptID_4d1da4cfb471 UUID;
  p_Config_4d1da4cfb471 TEXT;
  p_RuntimeActionConfiguration_4d1da4cfb471 TEXT;
  p_MaxExecutionTimeMS_4d1da4cfb471 INTEGER;
  p_CreatedByAgentID_4d1da4cfb471 UUID;
BEGIN
  p_ID_4d1da4cfb471 := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_CategoryID_4d1da4cfb471 := '359F5241-25D1-4949-A74F-C20CA3EECC3A';
  p_Name_4d1da4cfb471 := 'Link Provider Subscription';
  p_Description_4d1da4cfb471 := 'Record that a payment gateway already bills an existing Orders subscription, after checking the gateway subscription: the account must be the subscription''s company''s and bill subscriptions; the gateway subscription must exist and not have ended, no other Orders subscription may record it, and it must not have been created by Orders for another subscription; the Orders subscription must record no gateway id and no other payment provider yet; the gateway customer''s e-mail must be the subscriber''s (a mismatch always refuses; with nothing to compare, such as no e-mail at the gateway or an organization''s subscription naming no subscriber, a person must confirm the customer with CustomerConfirmed); and the price it bills must map to the subscription''s product (unless a person confirms an older price with AllowPriceOfAnotherProduct). Then link it and sync it, booking everything the gateway charged since the subscription''s term ended. Linking cannot be undone. Preview (the default) runs every check and links nothing. Use it for an UnknownGatewaySubscription Task.';
  p_Type_4d1da4cfb471 := 'Custom';
  p_UserPrompt_4d1da4cfb471 := 'Link an existing subscription to the gateway subscription that already bills it.';
  p_CodeApprovalStatus_4d1da4cfb471 := 'Approved';
  p_CodeLocked_4d1da4cfb471 := FALSE;
  p_ForceCodeGeneration_4d1da4cfb471 := FALSE;
  p_Status_4d1da4cfb471 := 'Active';
  p_DriverClass_4d1da4cfb471 := 'Orders.LinkProviderSubscription';
  p_IconClass_4d1da4cfb471 := 'fa-solid fa-link';
  p_CategoryID_4d1da4cfb471 := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_4d1da4cfb471 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_4d1da4cfb471);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action"
               WHERE "ID" = p_ID_4d1da4cfb471 OR "Name" = p_Name_4d1da4cfb471) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAction'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAction"(p_data := jsonb_build_object(
      'ID', p_ID_4d1da4cfb471,
      'CategoryID', p_CategoryID_4d1da4cfb471,
      'Name', p_Name_4d1da4cfb471,
      'Description', p_Description_4d1da4cfb471,
      'Type', p_Type_4d1da4cfb471,
      'UserPrompt', p_UserPrompt_4d1da4cfb471,
      'UserComments', p_UserComments_4d1da4cfb471,
      'Code', p_Code_4d1da4cfb471,
      'CodeComments', p_CodeComments_4d1da4cfb471,
      'CodeApprovalStatus', p_CodeApprovalStatus_4d1da4cfb471,
      'CodeApprovalComments', p_CodeApprovalComments_4d1da4cfb471,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_4d1da4cfb471,
      'CodeApprovedAt', p_CodeApprovedAt_4d1da4cfb471,
      'CodeLocked', p_CodeLocked_4d1da4cfb471,
      'ForceCodeGeneration', p_ForceCodeGeneration_4d1da4cfb471,
      'RetentionPeriod', p_RetentionPeriod_4d1da4cfb471,
      'Status', p_Status_4d1da4cfb471,
      'DriverClass', p_DriverClass_4d1da4cfb471,
      'ParentID', p_ParentID_4d1da4cfb471,
      'IconClass', p_IconClass_4d1da4cfb471,
      'DefaultCompactPromptID', p_DefaultCompactPromptID_4d1da4cfb471,
      'Config', p_Config_4d1da4cfb471,
      'RuntimeActionConfiguration', p_RuntimeActionConfiguration_4d1da4cfb471,
      'MaxExecutionTimeMS', p_MaxExecutionTimeMS_4d1da4cfb471,
      'CreatedByAgentID', p_CreatedByAgentID_4d1da4cfb471
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAction"(p_ID := p_ID_4d1da4cfb471, p_CategoryID := p_CategoryID_4d1da4cfb471, p_Name := p_Name_4d1da4cfb471, p_Description := p_Description_4d1da4cfb471, p_Type := p_Type_4d1da4cfb471, p_UserPrompt := p_UserPrompt_4d1da4cfb471, p_UserComments := p_UserComments_4d1da4cfb471, p_UserComments_Clear := TRUE, p_Code := p_Code_4d1da4cfb471, p_Code_Clear := TRUE, p_CodeComments := p_CodeComments_4d1da4cfb471, p_CodeComments_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_4d1da4cfb471, p_CodeApprovalComments := p_CodeApprovalComments_4d1da4cfb471, p_CodeApprovalComments_Clear := TRUE, p_CodeApprovedByUserID := p_CodeApprovedByUserID_4d1da4cfb471, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_4d1da4cfb471, p_CodeApprovedAt_Clear := TRUE, p_CodeLocked := p_CodeLocked_4d1da4cfb471, p_ForceCodeGeneration := p_ForceCodeGeneration_4d1da4cfb471, p_RetentionPeriod := p_RetentionPeriod_4d1da4cfb471, p_RetentionPeriod_Clear := TRUE, p_Status := p_Status_4d1da4cfb471, p_DriverClass := p_DriverClass_4d1da4cfb471, p_ParentID := p_ParentID_4d1da4cfb471, p_ParentID_Clear := TRUE, p_IconClass := p_IconClass_4d1da4cfb471, p_DefaultCompactPromptID := p_DefaultCompactPromptID_4d1da4cfb471, p_DefaultCompactPromptID_Clear := TRUE, p_Config := p_Config_4d1da4cfb471, p_Config_Clear := TRUE, p_RuntimeActionConfiguration := p_RuntimeActionConfiguration_4d1da4cfb471, p_RuntimeActionConfiguration_Clear := TRUE, p_MaxExecutionTimeMS := p_MaxExecutionTimeMS_4d1da4cfb471, p_MaxExecutionTimeMS_Clear := TRUE, p_CreatedByAgentID := p_CreatedByAgentID_4d1da4cfb471, p_CreatedByAgentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_f3fe0701f093 UUID;
  p_ActionID_f3fe0701f093 UUID;
  p_Name_f3fe0701f093 VARCHAR(255);
  p_DefaultValue_f3fe0701f093 TEXT;
  p_Type_f3fe0701f093 CHAR(10);
  p_ValueType_f3fe0701f093 VARCHAR(30);
  p_IsArray_f3fe0701f093 BOOLEAN;
  p_Description_f3fe0701f093 TEXT;
  p_IsRequired_f3fe0701f093 BOOLEAN;
  p_MediaModality_f3fe0701f093 VARCHAR(20);
  p_LogValue_f3fe0701f093 BOOLEAN;
BEGIN
  p_ID_f3fe0701f093 := '93B25443-C2E6-46C1-8EE1-D69F8F4A1B0C';
  p_ActionID_f3fe0701f093 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_f3fe0701f093 := 'SubscriptionID';
  p_Type_f3fe0701f093 := 'Input';
  p_ValueType_f3fe0701f093 := 'Scalar';
  p_IsArray_f3fe0701f093 := FALSE;
  p_Description_f3fe0701f093 := 'Sync only this subscription (an operator''s targeted run). Omit for every gateway-billed subscription that is live, paused, or cancelled within the lookback.';
  p_IsRequired_f3fe0701f093 := FALSE;
  p_LogValue_f3fe0701f093 := TRUE;
  p_ActionID_f3fe0701f093 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_f3fe0701f093 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_f3fe0701f093);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_f3fe0701f093
                  OR ("Name" = p_Name_f3fe0701f093 AND "ActionID" = p_ActionID_f3fe0701f093)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_f3fe0701f093,
      'ActionID', p_ActionID_f3fe0701f093,
      'Name', p_Name_f3fe0701f093,
      'DefaultValue', p_DefaultValue_f3fe0701f093,
      'Type', p_Type_f3fe0701f093,
      'ValueType', p_ValueType_f3fe0701f093,
      'IsArray', p_IsArray_f3fe0701f093,
      'Description', p_Description_f3fe0701f093,
      'IsRequired', p_IsRequired_f3fe0701f093,
      'MediaModality', p_MediaModality_f3fe0701f093,
      'LogValue', p_LogValue_f3fe0701f093
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_f3fe0701f093, p_ActionID := p_ActionID_f3fe0701f093, p_Name := p_Name_f3fe0701f093, p_DefaultValue := p_DefaultValue_f3fe0701f093, p_DefaultValue_Clear := TRUE, p_Type := p_Type_f3fe0701f093, p_ValueType := p_ValueType_f3fe0701f093, p_IsArray := p_IsArray_f3fe0701f093, p_Description := p_Description_f3fe0701f093, p_IsRequired := p_IsRequired_f3fe0701f093, p_MediaModality := p_MediaModality_f3fe0701f093, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_f3fe0701f093);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_174d4f859c2b UUID;
  p_ActionID_174d4f859c2b UUID;
  p_Name_174d4f859c2b VARCHAR(255);
  p_DefaultValue_174d4f859c2b TEXT;
  p_Type_174d4f859c2b CHAR(10);
  p_ValueType_174d4f859c2b VARCHAR(30);
  p_IsArray_174d4f859c2b BOOLEAN;
  p_Description_174d4f859c2b TEXT;
  p_IsRequired_174d4f859c2b BOOLEAN;
  p_MediaModality_174d4f859c2b VARCHAR(20);
  p_LogValue_174d4f859c2b BOOLEAN;
BEGIN
  p_ID_174d4f859c2b := 'EB0EF949-4949-419A-BD3A-2D0B6078DD8E';
  p_ActionID_174d4f859c2b := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_174d4f859c2b := 'Preview';
  p_Type_174d4f859c2b := 'Input';
  p_ValueType_174d4f859c2b := 'Scalar';
  p_IsArray_174d4f859c2b := FALSE;
  p_Description_174d4f859c2b := 'True (the default) reads the gateway and Orders and reports every difference and what a run would do, writing nothing; false brings Orders in line. A value that is neither is refused rather than guessed.';
  p_IsRequired_174d4f859c2b := FALSE;
  p_LogValue_174d4f859c2b := TRUE;
  p_ActionID_174d4f859c2b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_174d4f859c2b THEN 0 ELSE 1 END LIMIT 1), p_ActionID_174d4f859c2b);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_174d4f859c2b
                  OR ("Name" = p_Name_174d4f859c2b AND "ActionID" = p_ActionID_174d4f859c2b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_174d4f859c2b,
      'ActionID', p_ActionID_174d4f859c2b,
      'Name', p_Name_174d4f859c2b,
      'DefaultValue', p_DefaultValue_174d4f859c2b,
      'Type', p_Type_174d4f859c2b,
      'ValueType', p_ValueType_174d4f859c2b,
      'IsArray', p_IsArray_174d4f859c2b,
      'Description', p_Description_174d4f859c2b,
      'IsRequired', p_IsRequired_174d4f859c2b,
      'MediaModality', p_MediaModality_174d4f859c2b,
      'LogValue', p_LogValue_174d4f859c2b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_174d4f859c2b, p_ActionID := p_ActionID_174d4f859c2b, p_Name := p_Name_174d4f859c2b, p_DefaultValue := p_DefaultValue_174d4f859c2b, p_DefaultValue_Clear := TRUE, p_Type := p_Type_174d4f859c2b, p_ValueType := p_ValueType_174d4f859c2b, p_IsArray := p_IsArray_174d4f859c2b, p_Description := p_Description_174d4f859c2b, p_IsRequired := p_IsRequired_174d4f859c2b, p_MediaModality := p_MediaModality_174d4f859c2b, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_174d4f859c2b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_dcc5514eaf19 UUID;
  p_ActionID_dcc5514eaf19 UUID;
  p_Name_dcc5514eaf19 VARCHAR(255);
  p_DefaultValue_dcc5514eaf19 TEXT;
  p_Type_dcc5514eaf19 CHAR(10);
  p_ValueType_dcc5514eaf19 VARCHAR(30);
  p_IsArray_dcc5514eaf19 BOOLEAN;
  p_Description_dcc5514eaf19 TEXT;
  p_IsRequired_dcc5514eaf19 BOOLEAN;
  p_MediaModality_dcc5514eaf19 VARCHAR(20);
  p_LogValue_dcc5514eaf19 BOOLEAN;
BEGIN
  p_ID_dcc5514eaf19 := '8FE9B210-D2E4-4343-8018-1E5AF627A389';
  p_ActionID_dcc5514eaf19 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_dcc5514eaf19 := 'Read';
  p_Type_dcc5514eaf19 := 'Output';
  p_ValueType_dcc5514eaf19 := 'Scalar';
  p_IsArray_dcc5514eaf19 := FALSE;
  p_Description_dcc5514eaf19 := 'Gateway-billed subscriptions read.';
  p_IsRequired_dcc5514eaf19 := FALSE;
  p_LogValue_dcc5514eaf19 := TRUE;
  p_ActionID_dcc5514eaf19 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_dcc5514eaf19 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_dcc5514eaf19);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_dcc5514eaf19
                  OR ("Name" = p_Name_dcc5514eaf19 AND "ActionID" = p_ActionID_dcc5514eaf19)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_dcc5514eaf19,
      'ActionID', p_ActionID_dcc5514eaf19,
      'Name', p_Name_dcc5514eaf19,
      'DefaultValue', p_DefaultValue_dcc5514eaf19,
      'Type', p_Type_dcc5514eaf19,
      'ValueType', p_ValueType_dcc5514eaf19,
      'IsArray', p_IsArray_dcc5514eaf19,
      'Description', p_Description_dcc5514eaf19,
      'IsRequired', p_IsRequired_dcc5514eaf19,
      'MediaModality', p_MediaModality_dcc5514eaf19,
      'LogValue', p_LogValue_dcc5514eaf19
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_dcc5514eaf19, p_ActionID := p_ActionID_dcc5514eaf19, p_Name := p_Name_dcc5514eaf19, p_DefaultValue := p_DefaultValue_dcc5514eaf19, p_DefaultValue_Clear := TRUE, p_Type := p_Type_dcc5514eaf19, p_ValueType := p_ValueType_dcc5514eaf19, p_IsArray := p_IsArray_dcc5514eaf19, p_Description := p_Description_dcc5514eaf19, p_IsRequired := p_IsRequired_dcc5514eaf19, p_MediaModality := p_MediaModality_dcc5514eaf19, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_dcc5514eaf19);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_54470abe98c5 UUID;
  p_ActionID_54470abe98c5 UUID;
  p_Name_54470abe98c5 VARCHAR(255);
  p_DefaultValue_54470abe98c5 TEXT;
  p_Type_54470abe98c5 CHAR(10);
  p_ValueType_54470abe98c5 VARCHAR(30);
  p_IsArray_54470abe98c5 BOOLEAN;
  p_Description_54470abe98c5 TEXT;
  p_IsRequired_54470abe98c5 BOOLEAN;
  p_MediaModality_54470abe98c5 VARCHAR(20);
  p_LogValue_54470abe98c5 BOOLEAN;
BEGIN
  p_ID_54470abe98c5 := '2D363480-4C7D-40E1-8ECB-AC0CE25D6321';
  p_ActionID_54470abe98c5 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_54470abe98c5 := 'Changed';
  p_Type_54470abe98c5 := 'Output';
  p_ValueType_54470abe98c5 := 'Scalar';
  p_IsArray_54470abe98c5 := FALSE;
  p_Description_54470abe98c5 := 'Subscriptions brought in line (or, in a preview, that would be).';
  p_IsRequired_54470abe98c5 := FALSE;
  p_LogValue_54470abe98c5 := TRUE;
  p_ActionID_54470abe98c5 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_54470abe98c5 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_54470abe98c5);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_54470abe98c5
                  OR ("Name" = p_Name_54470abe98c5 AND "ActionID" = p_ActionID_54470abe98c5)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_54470abe98c5,
      'ActionID', p_ActionID_54470abe98c5,
      'Name', p_Name_54470abe98c5,
      'DefaultValue', p_DefaultValue_54470abe98c5,
      'Type', p_Type_54470abe98c5,
      'ValueType', p_ValueType_54470abe98c5,
      'IsArray', p_IsArray_54470abe98c5,
      'Description', p_Description_54470abe98c5,
      'IsRequired', p_IsRequired_54470abe98c5,
      'MediaModality', p_MediaModality_54470abe98c5,
      'LogValue', p_LogValue_54470abe98c5
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_54470abe98c5, p_ActionID := p_ActionID_54470abe98c5, p_Name := p_Name_54470abe98c5, p_DefaultValue := p_DefaultValue_54470abe98c5, p_DefaultValue_Clear := TRUE, p_Type := p_Type_54470abe98c5, p_ValueType := p_ValueType_54470abe98c5, p_IsArray := p_IsArray_54470abe98c5, p_Description := p_Description_54470abe98c5, p_IsRequired := p_IsRequired_54470abe98c5, p_MediaModality := p_MediaModality_54470abe98c5, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_54470abe98c5);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_d4a02b177ef1 UUID;
  p_ActionID_d4a02b177ef1 UUID;
  p_Name_d4a02b177ef1 VARCHAR(255);
  p_DefaultValue_d4a02b177ef1 TEXT;
  p_Type_d4a02b177ef1 CHAR(10);
  p_ValueType_d4a02b177ef1 VARCHAR(30);
  p_IsArray_d4a02b177ef1 BOOLEAN;
  p_Description_d4a02b177ef1 TEXT;
  p_IsRequired_d4a02b177ef1 BOOLEAN;
  p_MediaModality_d4a02b177ef1 VARCHAR(20);
  p_LogValue_d4a02b177ef1 BOOLEAN;
BEGIN
  p_ID_d4a02b177ef1 := 'F109E4CF-829E-4DA0-9029-A339255CADB7';
  p_ActionID_d4a02b177ef1 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_d4a02b177ef1 := 'NeedsPerson';
  p_Type_d4a02b177ef1 := 'Output';
  p_ValueType_d4a02b177ef1 := 'Scalar';
  p_IsArray_d4a02b177ef1 := FALSE;
  p_Description_d4a02b177ef1 := 'Subscriptions with nothing more to write but an open alert Task for a person.';
  p_IsRequired_d4a02b177ef1 := FALSE;
  p_LogValue_d4a02b177ef1 := TRUE;
  p_ActionID_d4a02b177ef1 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_d4a02b177ef1 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_d4a02b177ef1);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_d4a02b177ef1
                  OR ("Name" = p_Name_d4a02b177ef1 AND "ActionID" = p_ActionID_d4a02b177ef1)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_d4a02b177ef1,
      'ActionID', p_ActionID_d4a02b177ef1,
      'Name', p_Name_d4a02b177ef1,
      'DefaultValue', p_DefaultValue_d4a02b177ef1,
      'Type', p_Type_d4a02b177ef1,
      'ValueType', p_ValueType_d4a02b177ef1,
      'IsArray', p_IsArray_d4a02b177ef1,
      'Description', p_Description_d4a02b177ef1,
      'IsRequired', p_IsRequired_d4a02b177ef1,
      'MediaModality', p_MediaModality_d4a02b177ef1,
      'LogValue', p_LogValue_d4a02b177ef1
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_d4a02b177ef1, p_ActionID := p_ActionID_d4a02b177ef1, p_Name := p_Name_d4a02b177ef1, p_DefaultValue := p_DefaultValue_d4a02b177ef1, p_DefaultValue_Clear := TRUE, p_Type := p_Type_d4a02b177ef1, p_ValueType := p_ValueType_d4a02b177ef1, p_IsArray := p_IsArray_d4a02b177ef1, p_Description := p_Description_d4a02b177ef1, p_IsRequired := p_IsRequired_d4a02b177ef1, p_MediaModality := p_MediaModality_d4a02b177ef1, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_d4a02b177ef1);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_026d7ca11575 UUID;
  p_ActionID_026d7ca11575 UUID;
  p_Name_026d7ca11575 VARCHAR(255);
  p_DefaultValue_026d7ca11575 TEXT;
  p_Type_026d7ca11575 CHAR(10);
  p_ValueType_026d7ca11575 VARCHAR(30);
  p_IsArray_026d7ca11575 BOOLEAN;
  p_Description_026d7ca11575 TEXT;
  p_IsRequired_026d7ca11575 BOOLEAN;
  p_MediaModality_026d7ca11575 VARCHAR(20);
  p_LogValue_026d7ca11575 BOOLEAN;
BEGIN
  p_ID_026d7ca11575 := 'D7EACBA0-AB31-444C-A494-D2CAC7EF9AD9';
  p_ActionID_026d7ca11575 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_026d7ca11575 := 'Failed';
  p_Type_026d7ca11575 := 'Output';
  p_ValueType_026d7ca11575 := 'Scalar';
  p_IsArray_026d7ca11575 := FALSE;
  p_Description_026d7ca11575 := 'Subscriptions the run could not read or book; the next run tries again.';
  p_IsRequired_026d7ca11575 := FALSE;
  p_LogValue_026d7ca11575 := TRUE;
  p_ActionID_026d7ca11575 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_026d7ca11575 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_026d7ca11575);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_026d7ca11575
                  OR ("Name" = p_Name_026d7ca11575 AND "ActionID" = p_ActionID_026d7ca11575)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_026d7ca11575,
      'ActionID', p_ActionID_026d7ca11575,
      'Name', p_Name_026d7ca11575,
      'DefaultValue', p_DefaultValue_026d7ca11575,
      'Type', p_Type_026d7ca11575,
      'ValueType', p_ValueType_026d7ca11575,
      'IsArray', p_IsArray_026d7ca11575,
      'Description', p_Description_026d7ca11575,
      'IsRequired', p_IsRequired_026d7ca11575,
      'MediaModality', p_MediaModality_026d7ca11575,
      'LogValue', p_LogValue_026d7ca11575
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_026d7ca11575, p_ActionID := p_ActionID_026d7ca11575, p_Name := p_Name_026d7ca11575, p_DefaultValue := p_DefaultValue_026d7ca11575, p_DefaultValue_Clear := TRUE, p_Type := p_Type_026d7ca11575, p_ValueType := p_ValueType_026d7ca11575, p_IsArray := p_IsArray_026d7ca11575, p_Description := p_Description_026d7ca11575, p_IsRequired := p_IsRequired_026d7ca11575, p_MediaModality := p_MediaModality_026d7ca11575, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_026d7ca11575);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_f8abfb2a8143 UUID;
  p_ActionID_f8abfb2a8143 UUID;
  p_Name_f8abfb2a8143 VARCHAR(255);
  p_DefaultValue_f8abfb2a8143 TEXT;
  p_Type_f8abfb2a8143 CHAR(10);
  p_ValueType_f8abfb2a8143 VARCHAR(30);
  p_IsArray_f8abfb2a8143 BOOLEAN;
  p_Description_f8abfb2a8143 TEXT;
  p_IsRequired_f8abfb2a8143 BOOLEAN;
  p_MediaModality_f8abfb2a8143 VARCHAR(20);
  p_LogValue_f8abfb2a8143 BOOLEAN;
BEGIN
  p_ID_f8abfb2a8143 := '10CE9A30-658D-4961-994C-99E2E2EC0136';
  p_ActionID_f8abfb2a8143 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_f8abfb2a8143 := 'Differences';
  p_Type_f8abfb2a8143 := 'Output';
  p_ValueType_f8abfb2a8143 := 'Scalar';
  p_IsArray_f8abfb2a8143 := FALSE;
  p_Description_f8abfb2a8143 := 'Every difference found between Orders and the gateway, counted.';
  p_IsRequired_f8abfb2a8143 := FALSE;
  p_LogValue_f8abfb2a8143 := TRUE;
  p_ActionID_f8abfb2a8143 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_f8abfb2a8143 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_f8abfb2a8143);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_f8abfb2a8143
                  OR ("Name" = p_Name_f8abfb2a8143 AND "ActionID" = p_ActionID_f8abfb2a8143)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_f8abfb2a8143,
      'ActionID', p_ActionID_f8abfb2a8143,
      'Name', p_Name_f8abfb2a8143,
      'DefaultValue', p_DefaultValue_f8abfb2a8143,
      'Type', p_Type_f8abfb2a8143,
      'ValueType', p_ValueType_f8abfb2a8143,
      'IsArray', p_IsArray_f8abfb2a8143,
      'Description', p_Description_f8abfb2a8143,
      'IsRequired', p_IsRequired_f8abfb2a8143,
      'MediaModality', p_MediaModality_f8abfb2a8143,
      'LogValue', p_LogValue_f8abfb2a8143
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_f8abfb2a8143, p_ActionID := p_ActionID_f8abfb2a8143, p_Name := p_Name_f8abfb2a8143, p_DefaultValue := p_DefaultValue_f8abfb2a8143, p_DefaultValue_Clear := TRUE, p_Type := p_Type_f8abfb2a8143, p_ValueType := p_ValueType_f8abfb2a8143, p_IsArray := p_IsArray_f8abfb2a8143, p_Description := p_Description_f8abfb2a8143, p_IsRequired := p_IsRequired_f8abfb2a8143, p_MediaModality := p_MediaModality_f8abfb2a8143, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_f8abfb2a8143);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_b2f21d11977d UUID;
  p_ActionID_b2f21d11977d UUID;
  p_Name_b2f21d11977d VARCHAR(255);
  p_DefaultValue_b2f21d11977d TEXT;
  p_Type_b2f21d11977d CHAR(10);
  p_ValueType_b2f21d11977d VARCHAR(30);
  p_IsArray_b2f21d11977d BOOLEAN;
  p_Description_b2f21d11977d TEXT;
  p_IsRequired_b2f21d11977d BOOLEAN;
  p_MediaModality_b2f21d11977d VARCHAR(20);
  p_LogValue_b2f21d11977d BOOLEAN;
BEGIN
  p_ID_b2f21d11977d := '27A9FF6D-1D08-43CE-A401-9BF765FDF74F';
  p_ActionID_b2f21d11977d := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_b2f21d11977d := 'Results';
  p_Type_b2f21d11977d := 'Output';
  p_ValueType_b2f21d11977d := 'Scalar';
  p_IsArray_b2f21d11977d := FALSE;
  p_Description_b2f21d11977d := 'Per subscription: the outcome, the differences found and what was done.';
  p_IsRequired_b2f21d11977d := FALSE;
  p_LogValue_b2f21d11977d := TRUE;
  p_ActionID_b2f21d11977d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_b2f21d11977d THEN 0 ELSE 1 END LIMIT 1), p_ActionID_b2f21d11977d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_b2f21d11977d
                  OR ("Name" = p_Name_b2f21d11977d AND "ActionID" = p_ActionID_b2f21d11977d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_b2f21d11977d,
      'ActionID', p_ActionID_b2f21d11977d,
      'Name', p_Name_b2f21d11977d,
      'DefaultValue', p_DefaultValue_b2f21d11977d,
      'Type', p_Type_b2f21d11977d,
      'ValueType', p_ValueType_b2f21d11977d,
      'IsArray', p_IsArray_b2f21d11977d,
      'Description', p_Description_b2f21d11977d,
      'IsRequired', p_IsRequired_b2f21d11977d,
      'MediaModality', p_MediaModality_b2f21d11977d,
      'LogValue', p_LogValue_b2f21d11977d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_b2f21d11977d, p_ActionID := p_ActionID_b2f21d11977d, p_Name := p_Name_b2f21d11977d, p_DefaultValue := p_DefaultValue_b2f21d11977d, p_DefaultValue_Clear := TRUE, p_Type := p_Type_b2f21d11977d, p_ValueType := p_ValueType_b2f21d11977d, p_IsArray := p_IsArray_b2f21d11977d, p_Description := p_Description_b2f21d11977d, p_IsRequired := p_IsRequired_b2f21d11977d, p_MediaModality := p_MediaModality_b2f21d11977d, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_b2f21d11977d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_e59c85b1dd65 UUID;
  p_ActionID_e59c85b1dd65 UUID;
  p_Name_e59c85b1dd65 VARCHAR(255);
  p_DefaultValue_e59c85b1dd65 TEXT;
  p_Type_e59c85b1dd65 CHAR(10);
  p_ValueType_e59c85b1dd65 VARCHAR(30);
  p_IsArray_e59c85b1dd65 BOOLEAN;
  p_Description_e59c85b1dd65 TEXT;
  p_IsRequired_e59c85b1dd65 BOOLEAN;
  p_MediaModality_e59c85b1dd65 VARCHAR(20);
  p_LogValue_e59c85b1dd65 BOOLEAN;
BEGIN
  p_ID_e59c85b1dd65 := 'C9F53790-6E83-4808-ACD5-746AA5AFD0BF';
  p_ActionID_e59c85b1dd65 := '23AB340D-13FE-4BFC-B65D-7789D0D9588D';
  p_Name_e59c85b1dd65 := 'PreviewedOnly';
  p_Type_e59c85b1dd65 := 'Output';
  p_ValueType_e59c85b1dd65 := 'Scalar';
  p_IsArray_e59c85b1dd65 := FALSE;
  p_Description_e59c85b1dd65 := 'True when the run was a preview and wrote nothing.';
  p_IsRequired_e59c85b1dd65 := FALSE;
  p_LogValue_e59c85b1dd65 := TRUE;
  p_ActionID_e59c85b1dd65 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Sync Provider Subscriptions' ORDER BY CASE WHEN "ID" = p_ActionID_e59c85b1dd65 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_e59c85b1dd65);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_e59c85b1dd65
                  OR ("Name" = p_Name_e59c85b1dd65 AND "ActionID" = p_ActionID_e59c85b1dd65)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_e59c85b1dd65,
      'ActionID', p_ActionID_e59c85b1dd65,
      'Name', p_Name_e59c85b1dd65,
      'DefaultValue', p_DefaultValue_e59c85b1dd65,
      'Type', p_Type_e59c85b1dd65,
      'ValueType', p_ValueType_e59c85b1dd65,
      'IsArray', p_IsArray_e59c85b1dd65,
      'Description', p_Description_e59c85b1dd65,
      'IsRequired', p_IsRequired_e59c85b1dd65,
      'MediaModality', p_MediaModality_e59c85b1dd65,
      'LogValue', p_LogValue_e59c85b1dd65
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_e59c85b1dd65, p_ActionID := p_ActionID_e59c85b1dd65, p_Name := p_Name_e59c85b1dd65, p_DefaultValue := p_DefaultValue_e59c85b1dd65, p_DefaultValue_Clear := TRUE, p_Type := p_Type_e59c85b1dd65, p_ValueType := p_ValueType_e59c85b1dd65, p_IsArray := p_IsArray_e59c85b1dd65, p_Description := p_Description_e59c85b1dd65, p_IsRequired := p_IsRequired_e59c85b1dd65, p_MediaModality := p_MediaModality_e59c85b1dd65, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_e59c85b1dd65);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_99d83e3df0ab UUID;
  p_ActionID_99d83e3df0ab UUID;
  p_Name_99d83e3df0ab VARCHAR(255);
  p_DefaultValue_99d83e3df0ab TEXT;
  p_Type_99d83e3df0ab CHAR(10);
  p_ValueType_99d83e3df0ab VARCHAR(30);
  p_IsArray_99d83e3df0ab BOOLEAN;
  p_Description_99d83e3df0ab TEXT;
  p_IsRequired_99d83e3df0ab BOOLEAN;
  p_MediaModality_99d83e3df0ab VARCHAR(20);
  p_LogValue_99d83e3df0ab BOOLEAN;
BEGIN
  p_ID_99d83e3df0ab := '4C381DB2-E845-4CF0-AE6E-01B75B59D970';
  p_ActionID_99d83e3df0ab := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_99d83e3df0ab := 'SubscriptionID';
  p_Type_99d83e3df0ab := 'Input';
  p_ValueType_99d83e3df0ab := 'Scalar';
  p_IsArray_99d83e3df0ab := FALSE;
  p_Description_99d83e3df0ab := 'The Orders subscription to link. It must record no gateway id yet.';
  p_IsRequired_99d83e3df0ab := TRUE;
  p_LogValue_99d83e3df0ab := TRUE;
  p_ActionID_99d83e3df0ab := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_99d83e3df0ab THEN 0 ELSE 1 END LIMIT 1), p_ActionID_99d83e3df0ab);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_99d83e3df0ab
                  OR ("Name" = p_Name_99d83e3df0ab AND "ActionID" = p_ActionID_99d83e3df0ab)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_99d83e3df0ab,
      'ActionID', p_ActionID_99d83e3df0ab,
      'Name', p_Name_99d83e3df0ab,
      'DefaultValue', p_DefaultValue_99d83e3df0ab,
      'Type', p_Type_99d83e3df0ab,
      'ValueType', p_ValueType_99d83e3df0ab,
      'IsArray', p_IsArray_99d83e3df0ab,
      'Description', p_Description_99d83e3df0ab,
      'IsRequired', p_IsRequired_99d83e3df0ab,
      'MediaModality', p_MediaModality_99d83e3df0ab,
      'LogValue', p_LogValue_99d83e3df0ab
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_99d83e3df0ab, p_ActionID := p_ActionID_99d83e3df0ab, p_Name := p_Name_99d83e3df0ab, p_DefaultValue := p_DefaultValue_99d83e3df0ab, p_DefaultValue_Clear := TRUE, p_Type := p_Type_99d83e3df0ab, p_ValueType := p_ValueType_99d83e3df0ab, p_IsArray := p_IsArray_99d83e3df0ab, p_Description := p_Description_99d83e3df0ab, p_IsRequired := p_IsRequired_99d83e3df0ab, p_MediaModality := p_MediaModality_99d83e3df0ab, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_99d83e3df0ab);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_285aab2bcdbc UUID;
  p_ActionID_285aab2bcdbc UUID;
  p_Name_285aab2bcdbc VARCHAR(255);
  p_DefaultValue_285aab2bcdbc TEXT;
  p_Type_285aab2bcdbc CHAR(10);
  p_ValueType_285aab2bcdbc VARCHAR(30);
  p_IsArray_285aab2bcdbc BOOLEAN;
  p_Description_285aab2bcdbc TEXT;
  p_IsRequired_285aab2bcdbc BOOLEAN;
  p_MediaModality_285aab2bcdbc VARCHAR(20);
  p_LogValue_285aab2bcdbc BOOLEAN;
BEGIN
  p_ID_285aab2bcdbc := 'DD401B15-B23D-4025-BE26-6C26157763DA';
  p_ActionID_285aab2bcdbc := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_285aab2bcdbc := 'PaymentProviderID';
  p_Type_285aab2bcdbc := 'Input';
  p_ValueType_285aab2bcdbc := 'Scalar';
  p_IsArray_285aab2bcdbc := FALSE;
  p_Description_285aab2bcdbc := 'The payment provider account whose gateway bills it.';
  p_IsRequired_285aab2bcdbc := TRUE;
  p_LogValue_285aab2bcdbc := TRUE;
  p_ActionID_285aab2bcdbc := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_285aab2bcdbc THEN 0 ELSE 1 END LIMIT 1), p_ActionID_285aab2bcdbc);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_285aab2bcdbc
                  OR ("Name" = p_Name_285aab2bcdbc AND "ActionID" = p_ActionID_285aab2bcdbc)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_285aab2bcdbc,
      'ActionID', p_ActionID_285aab2bcdbc,
      'Name', p_Name_285aab2bcdbc,
      'DefaultValue', p_DefaultValue_285aab2bcdbc,
      'Type', p_Type_285aab2bcdbc,
      'ValueType', p_ValueType_285aab2bcdbc,
      'IsArray', p_IsArray_285aab2bcdbc,
      'Description', p_Description_285aab2bcdbc,
      'IsRequired', p_IsRequired_285aab2bcdbc,
      'MediaModality', p_MediaModality_285aab2bcdbc,
      'LogValue', p_LogValue_285aab2bcdbc
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_285aab2bcdbc, p_ActionID := p_ActionID_285aab2bcdbc, p_Name := p_Name_285aab2bcdbc, p_DefaultValue := p_DefaultValue_285aab2bcdbc, p_DefaultValue_Clear := TRUE, p_Type := p_Type_285aab2bcdbc, p_ValueType := p_ValueType_285aab2bcdbc, p_IsArray := p_IsArray_285aab2bcdbc, p_Description := p_Description_285aab2bcdbc, p_IsRequired := p_IsRequired_285aab2bcdbc, p_MediaModality := p_MediaModality_285aab2bcdbc, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_285aab2bcdbc);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_1c14c88f7c40 UUID;
  p_ActionID_1c14c88f7c40 UUID;
  p_Name_1c14c88f7c40 VARCHAR(255);
  p_DefaultValue_1c14c88f7c40 TEXT;
  p_Type_1c14c88f7c40 CHAR(10);
  p_ValueType_1c14c88f7c40 VARCHAR(30);
  p_IsArray_1c14c88f7c40 BOOLEAN;
  p_Description_1c14c88f7c40 TEXT;
  p_IsRequired_1c14c88f7c40 BOOLEAN;
  p_MediaModality_1c14c88f7c40 VARCHAR(20);
  p_LogValue_1c14c88f7c40 BOOLEAN;
BEGIN
  p_ID_1c14c88f7c40 := '0452F630-F15A-47DE-A52C-929ED2D63A32';
  p_ActionID_1c14c88f7c40 := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_1c14c88f7c40 := 'ProviderSubscriptionID';
  p_Type_1c14c88f7c40 := 'Input';
  p_ValueType_1c14c88f7c40 := 'Scalar';
  p_IsArray_1c14c88f7c40 := FALSE;
  p_Description_1c14c88f7c40 := 'The gateway''s subscription id (Stripe: sub_...). Checked at the gateway before anything is written.';
  p_IsRequired_1c14c88f7c40 := TRUE;
  p_LogValue_1c14c88f7c40 := TRUE;
  p_ActionID_1c14c88f7c40 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_1c14c88f7c40 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_1c14c88f7c40);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_1c14c88f7c40
                  OR ("Name" = p_Name_1c14c88f7c40 AND "ActionID" = p_ActionID_1c14c88f7c40)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_1c14c88f7c40,
      'ActionID', p_ActionID_1c14c88f7c40,
      'Name', p_Name_1c14c88f7c40,
      'DefaultValue', p_DefaultValue_1c14c88f7c40,
      'Type', p_Type_1c14c88f7c40,
      'ValueType', p_ValueType_1c14c88f7c40,
      'IsArray', p_IsArray_1c14c88f7c40,
      'Description', p_Description_1c14c88f7c40,
      'IsRequired', p_IsRequired_1c14c88f7c40,
      'MediaModality', p_MediaModality_1c14c88f7c40,
      'LogValue', p_LogValue_1c14c88f7c40
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_1c14c88f7c40, p_ActionID := p_ActionID_1c14c88f7c40, p_Name := p_Name_1c14c88f7c40, p_DefaultValue := p_DefaultValue_1c14c88f7c40, p_DefaultValue_Clear := TRUE, p_Type := p_Type_1c14c88f7c40, p_ValueType := p_ValueType_1c14c88f7c40, p_IsArray := p_IsArray_1c14c88f7c40, p_Description := p_Description_1c14c88f7c40, p_IsRequired := p_IsRequired_1c14c88f7c40, p_MediaModality := p_MediaModality_1c14c88f7c40, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_1c14c88f7c40);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_9ee88e2fff6d UUID;
  p_ActionID_9ee88e2fff6d UUID;
  p_Name_9ee88e2fff6d VARCHAR(255);
  p_DefaultValue_9ee88e2fff6d TEXT;
  p_Type_9ee88e2fff6d CHAR(10);
  p_ValueType_9ee88e2fff6d VARCHAR(30);
  p_IsArray_9ee88e2fff6d BOOLEAN;
  p_Description_9ee88e2fff6d TEXT;
  p_IsRequired_9ee88e2fff6d BOOLEAN;
  p_MediaModality_9ee88e2fff6d VARCHAR(20);
  p_LogValue_9ee88e2fff6d BOOLEAN;
BEGIN
  p_ID_9ee88e2fff6d := '70D1D8FC-154C-4B48-ADB6-177362DB9ACB';
  p_ActionID_9ee88e2fff6d := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_9ee88e2fff6d := 'Preview';
  p_Type_9ee88e2fff6d := 'Input';
  p_ValueType_9ee88e2fff6d := 'Scalar';
  p_IsArray_9ee88e2fff6d := FALSE;
  p_Description_9ee88e2fff6d := 'True (the default) runs every check and links nothing; false links and then syncs.';
  p_IsRequired_9ee88e2fff6d := FALSE;
  p_LogValue_9ee88e2fff6d := TRUE;
  p_ActionID_9ee88e2fff6d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_9ee88e2fff6d THEN 0 ELSE 1 END LIMIT 1), p_ActionID_9ee88e2fff6d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_9ee88e2fff6d
                  OR ("Name" = p_Name_9ee88e2fff6d AND "ActionID" = p_ActionID_9ee88e2fff6d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_9ee88e2fff6d,
      'ActionID', p_ActionID_9ee88e2fff6d,
      'Name', p_Name_9ee88e2fff6d,
      'DefaultValue', p_DefaultValue_9ee88e2fff6d,
      'Type', p_Type_9ee88e2fff6d,
      'ValueType', p_ValueType_9ee88e2fff6d,
      'IsArray', p_IsArray_9ee88e2fff6d,
      'Description', p_Description_9ee88e2fff6d,
      'IsRequired', p_IsRequired_9ee88e2fff6d,
      'MediaModality', p_MediaModality_9ee88e2fff6d,
      'LogValue', p_LogValue_9ee88e2fff6d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_9ee88e2fff6d, p_ActionID := p_ActionID_9ee88e2fff6d, p_Name := p_Name_9ee88e2fff6d, p_DefaultValue := p_DefaultValue_9ee88e2fff6d, p_DefaultValue_Clear := TRUE, p_Type := p_Type_9ee88e2fff6d, p_ValueType := p_ValueType_9ee88e2fff6d, p_IsArray := p_IsArray_9ee88e2fff6d, p_Description := p_Description_9ee88e2fff6d, p_IsRequired := p_IsRequired_9ee88e2fff6d, p_MediaModality := p_MediaModality_9ee88e2fff6d, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_9ee88e2fff6d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_992c844db0a4 UUID;
  p_ActionID_992c844db0a4 UUID;
  p_Name_992c844db0a4 VARCHAR(255);
  p_DefaultValue_992c844db0a4 TEXT;
  p_Type_992c844db0a4 CHAR(10);
  p_ValueType_992c844db0a4 VARCHAR(30);
  p_IsArray_992c844db0a4 BOOLEAN;
  p_Description_992c844db0a4 TEXT;
  p_IsRequired_992c844db0a4 BOOLEAN;
  p_MediaModality_992c844db0a4 VARCHAR(20);
  p_LogValue_992c844db0a4 BOOLEAN;
BEGIN
  p_ID_992c844db0a4 := '4EEAC249-D0C1-4F39-9D22-E0C899BB03FF';
  p_ActionID_992c844db0a4 := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_992c844db0a4 := 'AllowPriceOfAnotherProduct';
  p_Type_992c844db0a4 := 'Input';
  p_ValueType_992c844db0a4 := 'Scalar';
  p_IsArray_992c844db0a4 := FALSE;
  p_Description_992c844db0a4 := 'True links although the gateway bills a price this account maps to another product, or to none: a person checked that the subscription''s product is right (an imported subscriber on an older price). False (the default) refuses such a link. A value that is neither is refused rather than guessed.';
  p_IsRequired_992c844db0a4 := FALSE;
  p_LogValue_992c844db0a4 := TRUE;
  p_ActionID_992c844db0a4 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_992c844db0a4 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_992c844db0a4);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_992c844db0a4
                  OR ("Name" = p_Name_992c844db0a4 AND "ActionID" = p_ActionID_992c844db0a4)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_992c844db0a4,
      'ActionID', p_ActionID_992c844db0a4,
      'Name', p_Name_992c844db0a4,
      'DefaultValue', p_DefaultValue_992c844db0a4,
      'Type', p_Type_992c844db0a4,
      'ValueType', p_ValueType_992c844db0a4,
      'IsArray', p_IsArray_992c844db0a4,
      'Description', p_Description_992c844db0a4,
      'IsRequired', p_IsRequired_992c844db0a4,
      'MediaModality', p_MediaModality_992c844db0a4,
      'LogValue', p_LogValue_992c844db0a4
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_992c844db0a4, p_ActionID := p_ActionID_992c844db0a4, p_Name := p_Name_992c844db0a4, p_DefaultValue := p_DefaultValue_992c844db0a4, p_DefaultValue_Clear := TRUE, p_Type := p_Type_992c844db0a4, p_ValueType := p_ValueType_992c844db0a4, p_IsArray := p_IsArray_992c844db0a4, p_Description := p_Description_992c844db0a4, p_IsRequired := p_IsRequired_992c844db0a4, p_MediaModality := p_MediaModality_992c844db0a4, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_992c844db0a4);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_85912df7252c UUID;
  p_ActionID_85912df7252c UUID;
  p_Name_85912df7252c VARCHAR(255);
  p_DefaultValue_85912df7252c TEXT;
  p_Type_85912df7252c CHAR(10);
  p_ValueType_85912df7252c VARCHAR(30);
  p_IsArray_85912df7252c BOOLEAN;
  p_Description_85912df7252c TEXT;
  p_IsRequired_85912df7252c BOOLEAN;
  p_MediaModality_85912df7252c VARCHAR(20);
  p_LogValue_85912df7252c BOOLEAN;
BEGIN
  p_ID_85912df7252c := 'D376D73B-627D-4A5E-B0B2-458CA985BCAE';
  p_ActionID_85912df7252c := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_85912df7252c := 'CustomerConfirmed';
  p_Type_85912df7252c := 'Input';
  p_ValueType_85912df7252c := 'Scalar';
  p_IsArray_85912df7252c := FALSE;
  p_Description_85912df7252c := 'True when a person checked at the gateway that it bills this subscription''s customer, for a link with nothing to compare (no e-mail at the gateway, or no subscriber e-mail, as for most organization-held subscriptions). It never overrides an e-mail mismatch. False (the default) refuses such a link. A value that is neither is refused rather than guessed.';
  p_IsRequired_85912df7252c := FALSE;
  p_LogValue_85912df7252c := TRUE;
  p_ActionID_85912df7252c := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_85912df7252c THEN 0 ELSE 1 END LIMIT 1), p_ActionID_85912df7252c);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_85912df7252c
                  OR ("Name" = p_Name_85912df7252c AND "ActionID" = p_ActionID_85912df7252c)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_85912df7252c,
      'ActionID', p_ActionID_85912df7252c,
      'Name', p_Name_85912df7252c,
      'DefaultValue', p_DefaultValue_85912df7252c,
      'Type', p_Type_85912df7252c,
      'ValueType', p_ValueType_85912df7252c,
      'IsArray', p_IsArray_85912df7252c,
      'Description', p_Description_85912df7252c,
      'IsRequired', p_IsRequired_85912df7252c,
      'MediaModality', p_MediaModality_85912df7252c,
      'LogValue', p_LogValue_85912df7252c
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_85912df7252c, p_ActionID := p_ActionID_85912df7252c, p_Name := p_Name_85912df7252c, p_DefaultValue := p_DefaultValue_85912df7252c, p_DefaultValue_Clear := TRUE, p_Type := p_Type_85912df7252c, p_ValueType := p_ValueType_85912df7252c, p_IsArray := p_IsArray_85912df7252c, p_Description := p_Description_85912df7252c, p_IsRequired := p_IsRequired_85912df7252c, p_MediaModality := p_MediaModality_85912df7252c, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_85912df7252c);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_b5c5798b706e UUID;
  p_ActionID_b5c5798b706e UUID;
  p_Name_b5c5798b706e VARCHAR(255);
  p_DefaultValue_b5c5798b706e TEXT;
  p_Type_b5c5798b706e CHAR(10);
  p_ValueType_b5c5798b706e VARCHAR(30);
  p_IsArray_b5c5798b706e BOOLEAN;
  p_Description_b5c5798b706e TEXT;
  p_IsRequired_b5c5798b706e BOOLEAN;
  p_MediaModality_b5c5798b706e VARCHAR(20);
  p_LogValue_b5c5798b706e BOOLEAN;
BEGIN
  p_ID_b5c5798b706e := '6F6C3508-3C51-4BFD-8891-5DCAAFDDD1FF';
  p_ActionID_b5c5798b706e := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_b5c5798b706e := 'Code';
  p_Type_b5c5798b706e := 'Output';
  p_ValueType_b5c5798b706e := 'Scalar';
  p_IsArray_b5c5798b706e := FALSE;
  p_Description_b5c5798b706e := 'Linked, WouldLink, or why it was refused (SubscriptionNotFound, AlreadyLinked, ProviderCannotBill, NotAtGateway, EndedAtGateway, LinkedElsewhere, EmailMismatch, LinkFailed, BadInput).';
  p_IsRequired_b5c5798b706e := FALSE;
  p_LogValue_b5c5798b706e := TRUE;
  p_ActionID_b5c5798b706e := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_b5c5798b706e THEN 0 ELSE 1 END LIMIT 1), p_ActionID_b5c5798b706e);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_b5c5798b706e
                  OR ("Name" = p_Name_b5c5798b706e AND "ActionID" = p_ActionID_b5c5798b706e)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_b5c5798b706e,
      'ActionID', p_ActionID_b5c5798b706e,
      'Name', p_Name_b5c5798b706e,
      'DefaultValue', p_DefaultValue_b5c5798b706e,
      'Type', p_Type_b5c5798b706e,
      'ValueType', p_ValueType_b5c5798b706e,
      'IsArray', p_IsArray_b5c5798b706e,
      'Description', p_Description_b5c5798b706e,
      'IsRequired', p_IsRequired_b5c5798b706e,
      'MediaModality', p_MediaModality_b5c5798b706e,
      'LogValue', p_LogValue_b5c5798b706e
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_b5c5798b706e, p_ActionID := p_ActionID_b5c5798b706e, p_Name := p_Name_b5c5798b706e, p_DefaultValue := p_DefaultValue_b5c5798b706e, p_DefaultValue_Clear := TRUE, p_Type := p_Type_b5c5798b706e, p_ValueType := p_ValueType_b5c5798b706e, p_IsArray := p_IsArray_b5c5798b706e, p_Description := p_Description_b5c5798b706e, p_IsRequired := p_IsRequired_b5c5798b706e, p_MediaModality := p_MediaModality_b5c5798b706e, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_b5c5798b706e);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_67ceb4a45a34 UUID;
  p_ActionID_67ceb4a45a34 UUID;
  p_Name_67ceb4a45a34 VARCHAR(255);
  p_DefaultValue_67ceb4a45a34 TEXT;
  p_Type_67ceb4a45a34 CHAR(10);
  p_ValueType_67ceb4a45a34 VARCHAR(30);
  p_IsArray_67ceb4a45a34 BOOLEAN;
  p_Description_67ceb4a45a34 TEXT;
  p_IsRequired_67ceb4a45a34 BOOLEAN;
  p_MediaModality_67ceb4a45a34 VARCHAR(20);
  p_LogValue_67ceb4a45a34 BOOLEAN;
BEGIN
  p_ID_67ceb4a45a34 := 'FBFA2D44-1E54-46DF-811C-624CCB309D32';
  p_ActionID_67ceb4a45a34 := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_67ceb4a45a34 := 'Sync';
  p_Type_67ceb4a45a34 := 'Output';
  p_ValueType_67ceb4a45a34 := 'Scalar';
  p_IsArray_67ceb4a45a34 := FALSE;
  p_Description_67ceb4a45a34 := 'The sync that followed the link: what was booked.';
  p_IsRequired_67ceb4a45a34 := FALSE;
  p_LogValue_67ceb4a45a34 := TRUE;
  p_ActionID_67ceb4a45a34 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_67ceb4a45a34 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_67ceb4a45a34);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_67ceb4a45a34
                  OR ("Name" = p_Name_67ceb4a45a34 AND "ActionID" = p_ActionID_67ceb4a45a34)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_67ceb4a45a34,
      'ActionID', p_ActionID_67ceb4a45a34,
      'Name', p_Name_67ceb4a45a34,
      'DefaultValue', p_DefaultValue_67ceb4a45a34,
      'Type', p_Type_67ceb4a45a34,
      'ValueType', p_ValueType_67ceb4a45a34,
      'IsArray', p_IsArray_67ceb4a45a34,
      'Description', p_Description_67ceb4a45a34,
      'IsRequired', p_IsRequired_67ceb4a45a34,
      'MediaModality', p_MediaModality_67ceb4a45a34,
      'LogValue', p_LogValue_67ceb4a45a34
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_67ceb4a45a34, p_ActionID := p_ActionID_67ceb4a45a34, p_Name := p_Name_67ceb4a45a34, p_DefaultValue := p_DefaultValue_67ceb4a45a34, p_DefaultValue_Clear := TRUE, p_Type := p_Type_67ceb4a45a34, p_ValueType := p_ValueType_67ceb4a45a34, p_IsArray := p_IsArray_67ceb4a45a34, p_Description := p_Description_67ceb4a45a34, p_IsRequired := p_IsRequired_67ceb4a45a34, p_MediaModality := p_MediaModality_67ceb4a45a34, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_67ceb4a45a34);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_5d1f41df513f UUID;
  p_ActionID_5d1f41df513f UUID;
  p_Name_5d1f41df513f VARCHAR(255);
  p_DefaultValue_5d1f41df513f TEXT;
  p_Type_5d1f41df513f CHAR(10);
  p_ValueType_5d1f41df513f VARCHAR(30);
  p_IsArray_5d1f41df513f BOOLEAN;
  p_Description_5d1f41df513f TEXT;
  p_IsRequired_5d1f41df513f BOOLEAN;
  p_MediaModality_5d1f41df513f VARCHAR(20);
  p_LogValue_5d1f41df513f BOOLEAN;
BEGIN
  p_ID_5d1f41df513f := '2DAAA611-BEF1-4268-8A55-7E93C7DFDB4E';
  p_ActionID_5d1f41df513f := '1168470A-1E46-4DB5-9298-FF2AC103D292';
  p_Name_5d1f41df513f := 'PreviewedOnly';
  p_Type_5d1f41df513f := 'Output';
  p_ValueType_5d1f41df513f := 'Scalar';
  p_IsArray_5d1f41df513f := FALSE;
  p_Description_5d1f41df513f := 'True when nothing was linked.';
  p_IsRequired_5d1f41df513f := FALSE;
  p_LogValue_5d1f41df513f := TRUE;
  p_ActionID_5d1f41df513f := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Link Provider Subscription' ORDER BY CASE WHEN "ID" = p_ActionID_5d1f41df513f THEN 0 ELSE 1 END LIMIT 1), p_ActionID_5d1f41df513f);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_5d1f41df513f
                  OR ("Name" = p_Name_5d1f41df513f AND "ActionID" = p_ActionID_5d1f41df513f)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_5d1f41df513f,
      'ActionID', p_ActionID_5d1f41df513f,
      'Name', p_Name_5d1f41df513f,
      'DefaultValue', p_DefaultValue_5d1f41df513f,
      'Type', p_Type_5d1f41df513f,
      'ValueType', p_ValueType_5d1f41df513f,
      'IsArray', p_IsArray_5d1f41df513f,
      'Description', p_Description_5d1f41df513f,
      'IsRequired', p_IsRequired_5d1f41df513f,
      'MediaModality', p_MediaModality_5d1f41df513f,
      'LogValue', p_LogValue_5d1f41df513f
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_5d1f41df513f, p_ActionID := p_ActionID_5d1f41df513f, p_Name := p_Name_5d1f41df513f, p_DefaultValue := p_DefaultValue_5d1f41df513f, p_DefaultValue_Clear := TRUE, p_Type := p_Type_5d1f41df513f, p_ValueType := p_ValueType_5d1f41df513f, p_IsArray := p_IsArray_5d1f41df513f, p_Description := p_Description_5d1f41df513f, p_IsRequired := p_IsRequired_5d1f41df513f, p_MediaModality := p_MediaModality_5d1f41df513f, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_5d1f41df513f);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Scheduled Jobs (core SP call only)
DO $mj$
DECLARE
  p_ID_939383ab2511 UUID;
  p_JobTypeID_939383ab2511 UUID;
  p_Name_939383ab2511 VARCHAR(200);
  p_Description_939383ab2511 TEXT;
  p_CronExpression_939383ab2511 VARCHAR(120);
  p_Timezone_939383ab2511 VARCHAR(64);
  p_StartAt_939383ab2511 TIMESTAMPTZ;
  p_EndAt_939383ab2511 TIMESTAMPTZ;
  p_Status_939383ab2511 VARCHAR(20);
  p_Configuration_939383ab2511 TEXT;
  p_OwnerUserID_939383ab2511 UUID;
  p_LastRunAt_939383ab2511 TIMESTAMPTZ;
  p_NextRunAt_939383ab2511 TIMESTAMPTZ;
  p_RunCount_939383ab2511 INTEGER;
  p_SuccessCount_939383ab2511 INTEGER;
  p_FailureCount_939383ab2511 INTEGER;
  p_NotifyOnSuccess_939383ab2511 BOOLEAN;
  p_NotifyOnFailure_939383ab2511 BOOLEAN;
  p_NotifyUserID_939383ab2511 UUID;
  p_NotifyViaEmail_939383ab2511 BOOLEAN;
  p_NotifyViaInApp_939383ab2511 BOOLEAN;
  p_LockToken_939383ab2511 UUID;
  p_LockedAt_939383ab2511 TIMESTAMPTZ;
  p_LockedByInstance_939383ab2511 VARCHAR(255);
  p_ExpectedCompletionAt_939383ab2511 TIMESTAMPTZ;
  p_ConcurrencyMode_939383ab2511 VARCHAR(20);
  p_RunImmediatelyIfNeverRun_939383ab2511 BOOLEAN;
  p_MaxRuntimeMinutes_939383ab2511 INTEGER;
  p_MissedRunPolicy_939383ab2511 VARCHAR(20);
BEGIN
  p_ID_939383ab2511 := '911AEAB6-65D7-463C-B9F4-755B2C80C7F7';
  p_JobTypeID_939383ab2511 := '3B94DD43-E961-4D85-B7F4-B6783D748766';
  p_Name_939383ab2511 := 'Orders — Sync Provider Subscriptions (nightly)';
  p_Description_939383ab2511 := 'Reads every gateway-billed subscription from the payment gateway and brings Orders in line: books the renewals the gateway was paid for, records failed attempts and keeps access while the gateway retries, follows cancels made at the gateway, and raises one alert Task for anything a person must decide. Reports every difference it found and what it did. Ships disabled and set to Preview: enable it, read one preview run''s Results, then set Preview to false. Required wherever a gateway bills subscriptions: it catches a missed webhook within a day.';
  p_CronExpression_939383ab2511 := '0 30 4 * * *';
  p_Timezone_939383ab2511 := 'UTC';
  p_Status_939383ab2511 := 'Disabled';
  p_Configuration_939383ab2511 := '{"ActionID":"23AB340D-13FE-4BFC-B65D-7789D0D9588D","Params":[{"ActionParamID":"EB0EF949-4949-419A-BD3A-2D0B6078DD8E","ValueType":"Static","Value":"true"}]}';
  p_RunCount_939383ab2511 := 0;
  p_SuccessCount_939383ab2511 := 0;
  p_FailureCount_939383ab2511 := 0;
  p_NotifyOnSuccess_939383ab2511 := FALSE;
  p_NotifyOnFailure_939383ab2511 := TRUE;
  p_NotifyViaEmail_939383ab2511 := FALSE;
  p_NotifyViaInApp_939383ab2511 := TRUE;
  p_ConcurrencyMode_939383ab2511 := 'Skip';
  p_RunImmediatelyIfNeverRun_939383ab2511 := FALSE;
  p_MaxRuntimeMinutes_939383ab2511 := 60;
  p_MissedRunPolicy_939383ab2511 := 'RunOnce';
  IF p_JobTypeID_939383ab2511 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ScheduledJob"
               WHERE "ID" = p_ID_939383ab2511 OR "Name" = p_Name_939383ab2511) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateScheduledJob'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_data := jsonb_build_object(
      'ID', p_ID_939383ab2511,
      'JobTypeID', p_JobTypeID_939383ab2511,
      'Name', p_Name_939383ab2511,
      'Description', p_Description_939383ab2511,
      'CronExpression', p_CronExpression_939383ab2511,
      'Timezone', p_Timezone_939383ab2511,
      'StartAt', p_StartAt_939383ab2511,
      'EndAt', p_EndAt_939383ab2511,
      'Status', p_Status_939383ab2511,
      'Configuration', p_Configuration_939383ab2511,
      'OwnerUserID', p_OwnerUserID_939383ab2511,
      'LastRunAt', p_LastRunAt_939383ab2511,
      'NextRunAt', p_NextRunAt_939383ab2511,
      'RunCount', p_RunCount_939383ab2511,
      'SuccessCount', p_SuccessCount_939383ab2511,
      'FailureCount', p_FailureCount_939383ab2511,
      'NotifyOnSuccess', p_NotifyOnSuccess_939383ab2511,
      'NotifyOnFailure', p_NotifyOnFailure_939383ab2511,
      'NotifyUserID', p_NotifyUserID_939383ab2511,
      'NotifyViaEmail', p_NotifyViaEmail_939383ab2511,
      'NotifyViaInApp', p_NotifyViaInApp_939383ab2511,
      'LockToken', p_LockToken_939383ab2511,
      'LockedAt', p_LockedAt_939383ab2511,
      'LockedByInstance', p_LockedByInstance_939383ab2511,
      'ExpectedCompletionAt', p_ExpectedCompletionAt_939383ab2511,
      'ConcurrencyMode', p_ConcurrencyMode_939383ab2511,
      'RunImmediatelyIfNeverRun', p_RunImmediatelyIfNeverRun_939383ab2511,
      'MaxRuntimeMinutes', p_MaxRuntimeMinutes_939383ab2511,
      'MissedRunPolicy', p_MissedRunPolicy_939383ab2511
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_ID := p_ID_939383ab2511, p_JobTypeID := p_JobTypeID_939383ab2511, p_Name := p_Name_939383ab2511, p_Description := p_Description_939383ab2511, p_CronExpression := p_CronExpression_939383ab2511, p_Timezone := p_Timezone_939383ab2511, p_StartAt := p_StartAt_939383ab2511, p_StartAt_Clear := TRUE, p_EndAt := p_EndAt_939383ab2511, p_EndAt_Clear := TRUE, p_Status := p_Status_939383ab2511, p_Configuration := p_Configuration_939383ab2511, p_OwnerUserID := p_OwnerUserID_939383ab2511, p_OwnerUserID_Clear := TRUE, p_LastRunAt := p_LastRunAt_939383ab2511, p_LastRunAt_Clear := TRUE, p_NextRunAt := p_NextRunAt_939383ab2511, p_NextRunAt_Clear := TRUE, p_RunCount := p_RunCount_939383ab2511, p_SuccessCount := p_SuccessCount_939383ab2511, p_FailureCount := p_FailureCount_939383ab2511, p_NotifyOnSuccess := p_NotifyOnSuccess_939383ab2511, p_NotifyOnFailure := p_NotifyOnFailure_939383ab2511, p_NotifyUserID := p_NotifyUserID_939383ab2511, p_NotifyUserID_Clear := TRUE, p_NotifyViaEmail := p_NotifyViaEmail_939383ab2511, p_NotifyViaInApp := p_NotifyViaInApp_939383ab2511, p_LockToken := p_LockToken_939383ab2511, p_LockToken_Clear := TRUE, p_LockedAt := p_LockedAt_939383ab2511, p_LockedAt_Clear := TRUE, p_LockedByInstance := p_LockedByInstance_939383ab2511, p_LockedByInstance_Clear := TRUE, p_ExpectedCompletionAt := p_ExpectedCompletionAt_939383ab2511, p_ExpectedCompletionAt_Clear := TRUE, p_ConcurrencyMode := p_ConcurrencyMode_939383ab2511, p_RunImmediatelyIfNeverRun := p_RunImmediatelyIfNeverRun_939383ab2511, p_MaxRuntimeMinutes := p_MaxRuntimeMinutes_939383ab2511, p_MissedRunPolicy := p_MissedRunPolicy_939383ab2511);
    END IF;
  END IF;
END $mj$;


-- ===================== Other =====================
