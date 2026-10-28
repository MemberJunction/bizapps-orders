-- =============================================================================================
-- PostgreSQL counterpart of V202610281710__v5.39.x__Metadata_Sync.sql -- BizApps Orders v5.39.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file was
--     generated from. Each record is a DO block that calls the core function in whichever signature
--     the host has (jsonb or named parameters).
--   * Core calls use ${mjSchema}.
--   * Every string value matches the T-SQL file (the converter rewrote none here).
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


-- ===================== Other =====================

