-- =============================================================================================
-- PostgreSQL counterpart of V202611032053__v5.42.x__Metadata_Sync.sql -- BizApps Orders v5.42.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file was
--     generated from. Each record is a DO block that calls the function in whichever
--     signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones, block for block:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Core calls use ${mjSchema}.
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
  p_RequiresServicePeriod_f427f9435c1f := TRUE;
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
  p_Description_a4545d7a06ed := 'Record one attested progress observation on a percentage-of-completion order line and post the cumulative catch-up (plan D90): LineTotalNet × percent complete minus what is already recognised, as a RevenueRecognition entry Dr Deferred Revenue / Cr Sales — mirrored when the delta is negative, so a backward slide reverses through the same subtraction. A zero delta writes nothing and succeeds. Preview computes without writing. Refuses a non-POC line, an unbooked line, a percent outside 0..1, and an observation dated on or before the last posted one; a posted observation is immutable. A date after today, or two or more months before the current business month, warns and still posts. SupersedesMeasurementID, for a user holding MJ.BizApps.Orders.Progress.Supersede, replaces the line''s latest observation: its recognition is reversed on its own date, or on day 1 of the first later month with no Posted batch for the line''s company when its month has one, and the new catch-up is computed as if it had never posted and booked no earlier than that reversal date, with no row edited.';
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
    /** The period this observation governs, `YYYY-MM-DD`. Becomes the entry''s EffectiveDate. One per line per date. */
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
     * Nothing is edited: the replaced observation''s recognition is reversed — on its own date while that
     * month has no Posted batch for the line''s company, else on day 1 of the first later month without
     * one (`ReversalDate` on the output) — and this
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
     * observation''s own date while that month has no Posted batch for the line''s company; otherwise
     * day 1 of the first later month with none, so a correction never books into a closed period.
     * Null otherwise.
     */
    ReversalDate?: string | null;
    /**
     * The date this observation''s catch-up entry is booked on. `MeasurementDate` itself, except on a
     * supersede whose replaced observation''s month has a Posted batch for the line''s company: then the
     * later of `MeasurementDate` and `ReversalDate`''s first open day, so nothing new posts into the
     * closed month. The observation row keeps `MeasurementDate`. Null when there is no catch-up.
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

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_4d9e4cfb9b54 VARCHAR(255);
  p_Description_4d9e4cfb9b54 TEXT;
  p_AutoUpdateDescription_4d9e4cfb9b54 BOOLEAN;
  p_IsPrimaryKey_4d9e4cfb9b54 BOOLEAN;
  p_IsUnique_4d9e4cfb9b54 BOOLEAN;
  p_Category_4d9e4cfb9b54 VARCHAR(255);
  p_ValueListType_4d9e4cfb9b54 VARCHAR(20);
  p_ExtendedType_4d9e4cfb9b54 VARCHAR(50);
  p_CodeType_4d9e4cfb9b54 VARCHAR(50);
  p_DefaultInView_4d9e4cfb9b54 BOOLEAN;
  p_ViewCellTemplate_4d9e4cfb9b54 TEXT;
  p_DefaultColumnWidth_4d9e4cfb9b54 INTEGER;
  p_AllowUpdateAPI_4d9e4cfb9b54 BOOLEAN;
  p_AllowUpdateInView_4d9e4cfb9b54 BOOLEAN;
  p_IncludeInUserSearchAPI_4d9e4cfb9b54 BOOLEAN;
  p_FullTextSearchEnabled_4d9e4cfb9b54 BOOLEAN;
  p_UserSearchParamFormatAPI_4d9e4cfb9b54 VARCHAR(500);
  p_IncludeInGeneratedForm_4d9e4cfb9b54 BOOLEAN;
  p_GeneratedFormSection_4d9e4cfb9b54 VARCHAR(10);
  p_IsNameField_4d9e4cfb9b54 BOOLEAN;
  p_RelatedEntityID_4d9e4cfb9b54 UUID;
  p_RelatedEntityFieldName_4d9e4cfb9b54 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_4d9e4cfb9b54 BOOLEAN;
  p_RelatedEntityNameFieldMap_4d9e4cfb9b54 VARCHAR(255);
  p_RelatedEntityDisplayType_4d9e4cfb9b54 VARCHAR(20);
  p_EntityIDFieldName_4d9e4cfb9b54 VARCHAR(100);
  p_ScopeDefault_4d9e4cfb9b54 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_4d9e4cfb9b54 BOOLEAN;
  p_ValuesToPackWithSchema_4d9e4cfb9b54 VARCHAR(10);
  p_Status_4d9e4cfb9b54 VARCHAR(25);
  p_AutoUpdateIsNameField_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateDefaultInView_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateCategory_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateDisplayName_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_4d9e4cfb9b54 BOOLEAN;
  p_Encrypt_4d9e4cfb9b54 BOOLEAN;
  p_EncryptionKeyID_4d9e4cfb9b54 UUID;
  p_AllowDecryptInAPI_4d9e4cfb9b54 BOOLEAN;
  p_SendEncryptedValue_4d9e4cfb9b54 BOOLEAN;
  p_IsSoftPrimaryKey_4d9e4cfb9b54 BOOLEAN;
  p_IsSoftForeignKey_4d9e4cfb9b54 BOOLEAN;
  p_RelatedEntityJoinFields_4d9e4cfb9b54 TEXT;
  p_JSONType_4d9e4cfb9b54 VARCHAR(255);
  p_JSONTypeIsArray_4d9e4cfb9b54 BOOLEAN;
  p_JSONTypeDefinition_4d9e4cfb9b54 TEXT;
  p_UserSearchPredicateAPI_4d9e4cfb9b54 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateFullTextSearch_4d9e4cfb9b54 BOOLEAN;
  p_AutoUpdateExtendedType_4d9e4cfb9b54 BOOLEAN;
  p_IsComputed_4d9e4cfb9b54 BOOLEAN;
  p_EmbeddedRecord_4d9e4cfb9b54 TEXT;
  p_Configuration_4d9e4cfb9b54 TEXT;
  p_ID_4d9e4cfb9b54 UUID;
BEGIN
  p_DisplayName_4d9e4cfb9b54 := 'Recognized To Date Before';
  p_Description_4d9e4cfb9b54 := 'Revenue recognised on the line before this observation posted, as a magnitude: positive on a reversal (negative-quantity) line too, where the line''s own RecognizedToDate is negative. Materialised for the audit chain; agrees with the size of the sum of posted recognition entries for the line.';
  p_AutoUpdateDescription_4d9e4cfb9b54 := FALSE;
  p_IsPrimaryKey_4d9e4cfb9b54 := FALSE;
  p_IsUnique_4d9e4cfb9b54 := FALSE;
  p_Category_4d9e4cfb9b54 := 'Revenue Recognition';
  p_ValueListType_4d9e4cfb9b54 := 'None';
  p_DefaultInView_4d9e4cfb9b54 := FALSE;
  p_DefaultColumnWidth_4d9e4cfb9b54 := 150;
  p_AllowUpdateAPI_4d9e4cfb9b54 := TRUE;
  p_AllowUpdateInView_4d9e4cfb9b54 := TRUE;
  p_IncludeInUserSearchAPI_4d9e4cfb9b54 := FALSE;
  p_FullTextSearchEnabled_4d9e4cfb9b54 := FALSE;
  p_IncludeInGeneratedForm_4d9e4cfb9b54 := TRUE;
  p_GeneratedFormSection_4d9e4cfb9b54 := 'Category';
  p_IsNameField_4d9e4cfb9b54 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_4d9e4cfb9b54 := FALSE;
  p_RelatedEntityDisplayType_4d9e4cfb9b54 := 'Search';
  p_AutoUpdateRelatedEntityInfo_4d9e4cfb9b54 := TRUE;
  p_ValuesToPackWithSchema_4d9e4cfb9b54 := 'Auto';
  p_Status_4d9e4cfb9b54 := 'Active';
  p_AutoUpdateIsNameField_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateDefaultInView_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateCategory_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateDisplayName_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_4d9e4cfb9b54 := TRUE;
  p_Encrypt_4d9e4cfb9b54 := FALSE;
  p_AllowDecryptInAPI_4d9e4cfb9b54 := FALSE;
  p_SendEncryptedValue_4d9e4cfb9b54 := FALSE;
  p_IsSoftPrimaryKey_4d9e4cfb9b54 := FALSE;
  p_IsSoftForeignKey_4d9e4cfb9b54 := FALSE;
  p_JSONTypeIsArray_4d9e4cfb9b54 := FALSE;
  p_UserSearchPredicateAPI_4d9e4cfb9b54 := 'Contains';
  p_AutoUpdateUserSearchPredicate_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateFullTextSearch_4d9e4cfb9b54 := TRUE;
  p_AutoUpdateExtendedType_4d9e4cfb9b54 := TRUE;
  p_IsComputed_4d9e4cfb9b54 := FALSE;
  p_ID_4d9e4cfb9b54 := '2E4CCA34-6E40-49C5-B0E0-76518D46C996';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_4d9e4cfb9b54,
    'Description', p_Description_4d9e4cfb9b54,
    'AutoUpdateDescription', p_AutoUpdateDescription_4d9e4cfb9b54,
    'IsPrimaryKey', p_IsPrimaryKey_4d9e4cfb9b54,
    'IsUnique', p_IsUnique_4d9e4cfb9b54,
    'Category', p_Category_4d9e4cfb9b54,
    'ValueListType', p_ValueListType_4d9e4cfb9b54,
    'ExtendedType', p_ExtendedType_4d9e4cfb9b54,
    'CodeType', p_CodeType_4d9e4cfb9b54,
    'DefaultInView', p_DefaultInView_4d9e4cfb9b54,
    'ViewCellTemplate', p_ViewCellTemplate_4d9e4cfb9b54,
    'DefaultColumnWidth', p_DefaultColumnWidth_4d9e4cfb9b54,
    'AllowUpdateAPI', p_AllowUpdateAPI_4d9e4cfb9b54,
    'AllowUpdateInView', p_AllowUpdateInView_4d9e4cfb9b54,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_4d9e4cfb9b54,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_4d9e4cfb9b54,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_4d9e4cfb9b54,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_4d9e4cfb9b54,
    'GeneratedFormSection', p_GeneratedFormSection_4d9e4cfb9b54,
    'IsNameField', p_IsNameField_4d9e4cfb9b54,
    'RelatedEntityID', p_RelatedEntityID_4d9e4cfb9b54,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_4d9e4cfb9b54,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_4d9e4cfb9b54,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_4d9e4cfb9b54,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_4d9e4cfb9b54,
    'EntityIDFieldName', p_EntityIDFieldName_4d9e4cfb9b54,
    'ScopeDefault', p_ScopeDefault_4d9e4cfb9b54,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_4d9e4cfb9b54,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_4d9e4cfb9b54,
    'Status', p_Status_4d9e4cfb9b54,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_4d9e4cfb9b54,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_4d9e4cfb9b54,
    'AutoUpdateCategory', p_AutoUpdateCategory_4d9e4cfb9b54,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_4d9e4cfb9b54,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_4d9e4cfb9b54,
    'Encrypt', p_Encrypt_4d9e4cfb9b54,
    'EncryptionKeyID', p_EncryptionKeyID_4d9e4cfb9b54,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_4d9e4cfb9b54,
    'SendEncryptedValue', p_SendEncryptedValue_4d9e4cfb9b54,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_4d9e4cfb9b54,
    'IsSoftForeignKey', p_IsSoftForeignKey_4d9e4cfb9b54,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_4d9e4cfb9b54,
    'JSONType', p_JSONType_4d9e4cfb9b54,
    'JSONTypeIsArray', p_JSONTypeIsArray_4d9e4cfb9b54,
    'JSONTypeDefinition', p_JSONTypeDefinition_4d9e4cfb9b54,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_4d9e4cfb9b54,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_4d9e4cfb9b54,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_4d9e4cfb9b54,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_4d9e4cfb9b54,
    'IsComputed', p_IsComputed_4d9e4cfb9b54
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_4d9e4cfb9b54,
    'Configuration', p_Configuration_4d9e4cfb9b54,
    'ID', p_ID_4d9e4cfb9b54
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_4d9e4cfb9b54, p_Description := p_Description_4d9e4cfb9b54, p_AutoUpdateDescription := p_AutoUpdateDescription_4d9e4cfb9b54, p_IsPrimaryKey := p_IsPrimaryKey_4d9e4cfb9b54, p_IsUnique := p_IsUnique_4d9e4cfb9b54, p_Category := p_Category_4d9e4cfb9b54, p_ValueListType := p_ValueListType_4d9e4cfb9b54, p_ExtendedType := p_ExtendedType_4d9e4cfb9b54, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_4d9e4cfb9b54, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_4d9e4cfb9b54, p_ViewCellTemplate := p_ViewCellTemplate_4d9e4cfb9b54, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_4d9e4cfb9b54, p_AllowUpdateAPI := p_AllowUpdateAPI_4d9e4cfb9b54, p_AllowUpdateInView := p_AllowUpdateInView_4d9e4cfb9b54, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_4d9e4cfb9b54, p_FullTextSearchEnabled := p_FullTextSearchEnabled_4d9e4cfb9b54, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_4d9e4cfb9b54, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_4d9e4cfb9b54, p_GeneratedFormSection := p_GeneratedFormSection_4d9e4cfb9b54, p_IsNameField := p_IsNameField_4d9e4cfb9b54, p_RelatedEntityID := p_RelatedEntityID_4d9e4cfb9b54, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_4d9e4cfb9b54, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_4d9e4cfb9b54, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_4d9e4cfb9b54, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_4d9e4cfb9b54, p_EntityIDFieldName := p_EntityIDFieldName_4d9e4cfb9b54, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_4d9e4cfb9b54, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_4d9e4cfb9b54, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_4d9e4cfb9b54, p_Status := p_Status_4d9e4cfb9b54, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_4d9e4cfb9b54, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_4d9e4cfb9b54, p_AutoUpdateCategory := p_AutoUpdateCategory_4d9e4cfb9b54, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_4d9e4cfb9b54, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_4d9e4cfb9b54, p_Encrypt := p_Encrypt_4d9e4cfb9b54, p_EncryptionKeyID := p_EncryptionKeyID_4d9e4cfb9b54, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_4d9e4cfb9b54, p_SendEncryptedValue := p_SendEncryptedValue_4d9e4cfb9b54, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_4d9e4cfb9b54, p_IsSoftForeignKey := p_IsSoftForeignKey_4d9e4cfb9b54, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_4d9e4cfb9b54, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_4d9e4cfb9b54, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_4d9e4cfb9b54, p_JSONTypeDefinition := p_JSONTypeDefinition_4d9e4cfb9b54, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_4d9e4cfb9b54, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_4d9e4cfb9b54, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_4d9e4cfb9b54, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_4d9e4cfb9b54, p_IsComputed := p_IsComputed_4d9e4cfb9b54, p_EmbeddedRecord := p_EmbeddedRecord_4d9e4cfb9b54, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_4d9e4cfb9b54, p_Configuration_Clear := TRUE, p_ID := p_ID_4d9e4cfb9b54);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_51252b89b8de VARCHAR(255);
  p_Description_51252b89b8de TEXT;
  p_AutoUpdateDescription_51252b89b8de BOOLEAN;
  p_IsPrimaryKey_51252b89b8de BOOLEAN;
  p_IsUnique_51252b89b8de BOOLEAN;
  p_Category_51252b89b8de VARCHAR(255);
  p_ValueListType_51252b89b8de VARCHAR(20);
  p_ExtendedType_51252b89b8de VARCHAR(50);
  p_CodeType_51252b89b8de VARCHAR(50);
  p_DefaultInView_51252b89b8de BOOLEAN;
  p_ViewCellTemplate_51252b89b8de TEXT;
  p_DefaultColumnWidth_51252b89b8de INTEGER;
  p_AllowUpdateAPI_51252b89b8de BOOLEAN;
  p_AllowUpdateInView_51252b89b8de BOOLEAN;
  p_IncludeInUserSearchAPI_51252b89b8de BOOLEAN;
  p_FullTextSearchEnabled_51252b89b8de BOOLEAN;
  p_UserSearchParamFormatAPI_51252b89b8de VARCHAR(500);
  p_IncludeInGeneratedForm_51252b89b8de BOOLEAN;
  p_GeneratedFormSection_51252b89b8de VARCHAR(10);
  p_IsNameField_51252b89b8de BOOLEAN;
  p_RelatedEntityID_51252b89b8de UUID;
  p_RelatedEntityFieldName_51252b89b8de VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_51252b89b8de BOOLEAN;
  p_RelatedEntityNameFieldMap_51252b89b8de VARCHAR(255);
  p_RelatedEntityDisplayType_51252b89b8de VARCHAR(20);
  p_EntityIDFieldName_51252b89b8de VARCHAR(100);
  p_ScopeDefault_51252b89b8de VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_51252b89b8de BOOLEAN;
  p_ValuesToPackWithSchema_51252b89b8de VARCHAR(10);
  p_Status_51252b89b8de VARCHAR(25);
  p_AutoUpdateIsNameField_51252b89b8de BOOLEAN;
  p_AutoUpdateDefaultInView_51252b89b8de BOOLEAN;
  p_AutoUpdateCategory_51252b89b8de BOOLEAN;
  p_AutoUpdateDisplayName_51252b89b8de BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_51252b89b8de BOOLEAN;
  p_Encrypt_51252b89b8de BOOLEAN;
  p_EncryptionKeyID_51252b89b8de UUID;
  p_AllowDecryptInAPI_51252b89b8de BOOLEAN;
  p_SendEncryptedValue_51252b89b8de BOOLEAN;
  p_IsSoftPrimaryKey_51252b89b8de BOOLEAN;
  p_IsSoftForeignKey_51252b89b8de BOOLEAN;
  p_RelatedEntityJoinFields_51252b89b8de TEXT;
  p_JSONType_51252b89b8de VARCHAR(255);
  p_JSONTypeIsArray_51252b89b8de BOOLEAN;
  p_JSONTypeDefinition_51252b89b8de TEXT;
  p_UserSearchPredicateAPI_51252b89b8de VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_51252b89b8de BOOLEAN;
  p_AutoUpdateFullTextSearch_51252b89b8de BOOLEAN;
  p_AutoUpdateExtendedType_51252b89b8de BOOLEAN;
  p_IsComputed_51252b89b8de BOOLEAN;
  p_EmbeddedRecord_51252b89b8de TEXT;
  p_Configuration_51252b89b8de TEXT;
  p_ID_51252b89b8de UUID;
BEGIN
  p_DisplayName_51252b89b8de := 'Recognized To Date After';
  p_Description_51252b89b8de := 'Revenue recognised on the line after this observation posted, as a magnitude: |LineTotalNet| × PercentComplete, rounded to the cent. Positive on a reversal (negative-quantity) line too, where the line''s own RecognizedToDate is negative. At 100% it is the line amount''s size exactly.';
  p_AutoUpdateDescription_51252b89b8de := FALSE;
  p_IsPrimaryKey_51252b89b8de := FALSE;
  p_IsUnique_51252b89b8de := FALSE;
  p_Category_51252b89b8de := 'Revenue Recognition';
  p_ValueListType_51252b89b8de := 'None';
  p_DefaultInView_51252b89b8de := FALSE;
  p_DefaultColumnWidth_51252b89b8de := 150;
  p_AllowUpdateAPI_51252b89b8de := TRUE;
  p_AllowUpdateInView_51252b89b8de := TRUE;
  p_IncludeInUserSearchAPI_51252b89b8de := FALSE;
  p_FullTextSearchEnabled_51252b89b8de := FALSE;
  p_IncludeInGeneratedForm_51252b89b8de := TRUE;
  p_GeneratedFormSection_51252b89b8de := 'Category';
  p_IsNameField_51252b89b8de := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_51252b89b8de := FALSE;
  p_RelatedEntityDisplayType_51252b89b8de := 'Search';
  p_AutoUpdateRelatedEntityInfo_51252b89b8de := TRUE;
  p_ValuesToPackWithSchema_51252b89b8de := 'Auto';
  p_Status_51252b89b8de := 'Active';
  p_AutoUpdateIsNameField_51252b89b8de := TRUE;
  p_AutoUpdateDefaultInView_51252b89b8de := TRUE;
  p_AutoUpdateCategory_51252b89b8de := TRUE;
  p_AutoUpdateDisplayName_51252b89b8de := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_51252b89b8de := TRUE;
  p_Encrypt_51252b89b8de := FALSE;
  p_AllowDecryptInAPI_51252b89b8de := FALSE;
  p_SendEncryptedValue_51252b89b8de := FALSE;
  p_IsSoftPrimaryKey_51252b89b8de := FALSE;
  p_IsSoftForeignKey_51252b89b8de := FALSE;
  p_JSONTypeIsArray_51252b89b8de := FALSE;
  p_UserSearchPredicateAPI_51252b89b8de := 'Contains';
  p_AutoUpdateUserSearchPredicate_51252b89b8de := TRUE;
  p_AutoUpdateFullTextSearch_51252b89b8de := TRUE;
  p_AutoUpdateExtendedType_51252b89b8de := TRUE;
  p_IsComputed_51252b89b8de := FALSE;
  p_ID_51252b89b8de := '7A282FA0-4D4B-4DCE-8689-D579505E2886';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_51252b89b8de,
    'Description', p_Description_51252b89b8de,
    'AutoUpdateDescription', p_AutoUpdateDescription_51252b89b8de,
    'IsPrimaryKey', p_IsPrimaryKey_51252b89b8de,
    'IsUnique', p_IsUnique_51252b89b8de,
    'Category', p_Category_51252b89b8de,
    'ValueListType', p_ValueListType_51252b89b8de,
    'ExtendedType', p_ExtendedType_51252b89b8de,
    'CodeType', p_CodeType_51252b89b8de,
    'DefaultInView', p_DefaultInView_51252b89b8de,
    'ViewCellTemplate', p_ViewCellTemplate_51252b89b8de,
    'DefaultColumnWidth', p_DefaultColumnWidth_51252b89b8de,
    'AllowUpdateAPI', p_AllowUpdateAPI_51252b89b8de,
    'AllowUpdateInView', p_AllowUpdateInView_51252b89b8de,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_51252b89b8de,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_51252b89b8de,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_51252b89b8de,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_51252b89b8de,
    'GeneratedFormSection', p_GeneratedFormSection_51252b89b8de,
    'IsNameField', p_IsNameField_51252b89b8de,
    'RelatedEntityID', p_RelatedEntityID_51252b89b8de,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_51252b89b8de,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_51252b89b8de,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_51252b89b8de,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_51252b89b8de,
    'EntityIDFieldName', p_EntityIDFieldName_51252b89b8de,
    'ScopeDefault', p_ScopeDefault_51252b89b8de,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_51252b89b8de,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_51252b89b8de,
    'Status', p_Status_51252b89b8de,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_51252b89b8de,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_51252b89b8de,
    'AutoUpdateCategory', p_AutoUpdateCategory_51252b89b8de,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_51252b89b8de,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_51252b89b8de,
    'Encrypt', p_Encrypt_51252b89b8de,
    'EncryptionKeyID', p_EncryptionKeyID_51252b89b8de,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_51252b89b8de,
    'SendEncryptedValue', p_SendEncryptedValue_51252b89b8de,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_51252b89b8de,
    'IsSoftForeignKey', p_IsSoftForeignKey_51252b89b8de,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_51252b89b8de,
    'JSONType', p_JSONType_51252b89b8de,
    'JSONTypeIsArray', p_JSONTypeIsArray_51252b89b8de,
    'JSONTypeDefinition', p_JSONTypeDefinition_51252b89b8de,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_51252b89b8de,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_51252b89b8de,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_51252b89b8de,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_51252b89b8de,
    'IsComputed', p_IsComputed_51252b89b8de
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_51252b89b8de,
    'Configuration', p_Configuration_51252b89b8de,
    'ID', p_ID_51252b89b8de
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_51252b89b8de, p_Description := p_Description_51252b89b8de, p_AutoUpdateDescription := p_AutoUpdateDescription_51252b89b8de, p_IsPrimaryKey := p_IsPrimaryKey_51252b89b8de, p_IsUnique := p_IsUnique_51252b89b8de, p_Category := p_Category_51252b89b8de, p_ValueListType := p_ValueListType_51252b89b8de, p_ExtendedType := p_ExtendedType_51252b89b8de, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_51252b89b8de, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_51252b89b8de, p_ViewCellTemplate := p_ViewCellTemplate_51252b89b8de, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_51252b89b8de, p_AllowUpdateAPI := p_AllowUpdateAPI_51252b89b8de, p_AllowUpdateInView := p_AllowUpdateInView_51252b89b8de, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_51252b89b8de, p_FullTextSearchEnabled := p_FullTextSearchEnabled_51252b89b8de, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_51252b89b8de, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_51252b89b8de, p_GeneratedFormSection := p_GeneratedFormSection_51252b89b8de, p_IsNameField := p_IsNameField_51252b89b8de, p_RelatedEntityID := p_RelatedEntityID_51252b89b8de, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_51252b89b8de, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_51252b89b8de, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_51252b89b8de, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_51252b89b8de, p_EntityIDFieldName := p_EntityIDFieldName_51252b89b8de, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_51252b89b8de, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_51252b89b8de, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_51252b89b8de, p_Status := p_Status_51252b89b8de, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_51252b89b8de, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_51252b89b8de, p_AutoUpdateCategory := p_AutoUpdateCategory_51252b89b8de, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_51252b89b8de, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_51252b89b8de, p_Encrypt := p_Encrypt_51252b89b8de, p_EncryptionKeyID := p_EncryptionKeyID_51252b89b8de, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_51252b89b8de, p_SendEncryptedValue := p_SendEncryptedValue_51252b89b8de, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_51252b89b8de, p_IsSoftForeignKey := p_IsSoftForeignKey_51252b89b8de, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_51252b89b8de, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_51252b89b8de, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_51252b89b8de, p_JSONTypeDefinition := p_JSONTypeDefinition_51252b89b8de, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_51252b89b8de, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_51252b89b8de, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_51252b89b8de, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_51252b89b8de, p_IsComputed := p_IsComputed_51252b89b8de, p_EmbeddedRecord := p_EmbeddedRecord_51252b89b8de, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_51252b89b8de, p_Configuration_Clear := TRUE, p_ID := p_ID_51252b89b8de);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_159fb4bd8150 VARCHAR(255);
  p_Description_159fb4bd8150 TEXT;
  p_AutoUpdateDescription_159fb4bd8150 BOOLEAN;
  p_IsPrimaryKey_159fb4bd8150 BOOLEAN;
  p_IsUnique_159fb4bd8150 BOOLEAN;
  p_Category_159fb4bd8150 VARCHAR(255);
  p_ValueListType_159fb4bd8150 VARCHAR(20);
  p_ExtendedType_159fb4bd8150 VARCHAR(50);
  p_CodeType_159fb4bd8150 VARCHAR(50);
  p_DefaultInView_159fb4bd8150 BOOLEAN;
  p_ViewCellTemplate_159fb4bd8150 TEXT;
  p_DefaultColumnWidth_159fb4bd8150 INTEGER;
  p_AllowUpdateAPI_159fb4bd8150 BOOLEAN;
  p_AllowUpdateInView_159fb4bd8150 BOOLEAN;
  p_IncludeInUserSearchAPI_159fb4bd8150 BOOLEAN;
  p_FullTextSearchEnabled_159fb4bd8150 BOOLEAN;
  p_UserSearchParamFormatAPI_159fb4bd8150 VARCHAR(500);
  p_IncludeInGeneratedForm_159fb4bd8150 BOOLEAN;
  p_GeneratedFormSection_159fb4bd8150 VARCHAR(10);
  p_IsNameField_159fb4bd8150 BOOLEAN;
  p_RelatedEntityID_159fb4bd8150 UUID;
  p_RelatedEntityFieldName_159fb4bd8150 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_159fb4bd8150 BOOLEAN;
  p_RelatedEntityNameFieldMap_159fb4bd8150 VARCHAR(255);
  p_RelatedEntityDisplayType_159fb4bd8150 VARCHAR(20);
  p_EntityIDFieldName_159fb4bd8150 VARCHAR(100);
  p_ScopeDefault_159fb4bd8150 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_159fb4bd8150 BOOLEAN;
  p_ValuesToPackWithSchema_159fb4bd8150 VARCHAR(10);
  p_Status_159fb4bd8150 VARCHAR(25);
  p_AutoUpdateIsNameField_159fb4bd8150 BOOLEAN;
  p_AutoUpdateDefaultInView_159fb4bd8150 BOOLEAN;
  p_AutoUpdateCategory_159fb4bd8150 BOOLEAN;
  p_AutoUpdateDisplayName_159fb4bd8150 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_159fb4bd8150 BOOLEAN;
  p_Encrypt_159fb4bd8150 BOOLEAN;
  p_EncryptionKeyID_159fb4bd8150 UUID;
  p_AllowDecryptInAPI_159fb4bd8150 BOOLEAN;
  p_SendEncryptedValue_159fb4bd8150 BOOLEAN;
  p_IsSoftPrimaryKey_159fb4bd8150 BOOLEAN;
  p_IsSoftForeignKey_159fb4bd8150 BOOLEAN;
  p_RelatedEntityJoinFields_159fb4bd8150 TEXT;
  p_JSONType_159fb4bd8150 VARCHAR(255);
  p_JSONTypeIsArray_159fb4bd8150 BOOLEAN;
  p_JSONTypeDefinition_159fb4bd8150 TEXT;
  p_UserSearchPredicateAPI_159fb4bd8150 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_159fb4bd8150 BOOLEAN;
  p_AutoUpdateFullTextSearch_159fb4bd8150 BOOLEAN;
  p_AutoUpdateExtendedType_159fb4bd8150 BOOLEAN;
  p_IsComputed_159fb4bd8150 BOOLEAN;
  p_EmbeddedRecord_159fb4bd8150 TEXT;
  p_Configuration_159fb4bd8150 TEXT;
  p_ID_159fb4bd8150 UUID;
BEGIN
  p_DisplayName_159fb4bd8150 := 'Recognition Amount';
  p_Description_159fb4bd8150 := 'The delta this observation posted: After − Before, on magnitudes. NEGATIVE on a backward slide (the entry is mirrored, Dr Sales / Cr Deferred Revenue), whatever the line''s sign; on a reversal line the entry itself carries the line''s sign. Zero when the observation moved nothing, in which case no entry was written.';
  p_AutoUpdateDescription_159fb4bd8150 := FALSE;
  p_IsPrimaryKey_159fb4bd8150 := FALSE;
  p_IsUnique_159fb4bd8150 := FALSE;
  p_Category_159fb4bd8150 := 'Revenue Recognition';
  p_ValueListType_159fb4bd8150 := 'None';
  p_DefaultInView_159fb4bd8150 := FALSE;
  p_DefaultColumnWidth_159fb4bd8150 := 150;
  p_AllowUpdateAPI_159fb4bd8150 := TRUE;
  p_AllowUpdateInView_159fb4bd8150 := TRUE;
  p_IncludeInUserSearchAPI_159fb4bd8150 := FALSE;
  p_FullTextSearchEnabled_159fb4bd8150 := FALSE;
  p_IncludeInGeneratedForm_159fb4bd8150 := TRUE;
  p_GeneratedFormSection_159fb4bd8150 := 'Category';
  p_IsNameField_159fb4bd8150 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_159fb4bd8150 := FALSE;
  p_RelatedEntityDisplayType_159fb4bd8150 := 'Search';
  p_AutoUpdateRelatedEntityInfo_159fb4bd8150 := TRUE;
  p_ValuesToPackWithSchema_159fb4bd8150 := 'Auto';
  p_Status_159fb4bd8150 := 'Active';
  p_AutoUpdateIsNameField_159fb4bd8150 := TRUE;
  p_AutoUpdateDefaultInView_159fb4bd8150 := TRUE;
  p_AutoUpdateCategory_159fb4bd8150 := TRUE;
  p_AutoUpdateDisplayName_159fb4bd8150 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_159fb4bd8150 := TRUE;
  p_Encrypt_159fb4bd8150 := FALSE;
  p_AllowDecryptInAPI_159fb4bd8150 := FALSE;
  p_SendEncryptedValue_159fb4bd8150 := FALSE;
  p_IsSoftPrimaryKey_159fb4bd8150 := FALSE;
  p_IsSoftForeignKey_159fb4bd8150 := FALSE;
  p_JSONTypeIsArray_159fb4bd8150 := FALSE;
  p_UserSearchPredicateAPI_159fb4bd8150 := 'Contains';
  p_AutoUpdateUserSearchPredicate_159fb4bd8150 := TRUE;
  p_AutoUpdateFullTextSearch_159fb4bd8150 := TRUE;
  p_AutoUpdateExtendedType_159fb4bd8150 := TRUE;
  p_IsComputed_159fb4bd8150 := FALSE;
  p_ID_159fb4bd8150 := '9F902B65-2D21-4DCF-BE61-DC0904DFEFBC';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_159fb4bd8150,
    'Description', p_Description_159fb4bd8150,
    'AutoUpdateDescription', p_AutoUpdateDescription_159fb4bd8150,
    'IsPrimaryKey', p_IsPrimaryKey_159fb4bd8150,
    'IsUnique', p_IsUnique_159fb4bd8150,
    'Category', p_Category_159fb4bd8150,
    'ValueListType', p_ValueListType_159fb4bd8150,
    'ExtendedType', p_ExtendedType_159fb4bd8150,
    'CodeType', p_CodeType_159fb4bd8150,
    'DefaultInView', p_DefaultInView_159fb4bd8150,
    'ViewCellTemplate', p_ViewCellTemplate_159fb4bd8150,
    'DefaultColumnWidth', p_DefaultColumnWidth_159fb4bd8150,
    'AllowUpdateAPI', p_AllowUpdateAPI_159fb4bd8150,
    'AllowUpdateInView', p_AllowUpdateInView_159fb4bd8150,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_159fb4bd8150,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_159fb4bd8150,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_159fb4bd8150,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_159fb4bd8150,
    'GeneratedFormSection', p_GeneratedFormSection_159fb4bd8150,
    'IsNameField', p_IsNameField_159fb4bd8150,
    'RelatedEntityID', p_RelatedEntityID_159fb4bd8150,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_159fb4bd8150,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_159fb4bd8150,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_159fb4bd8150,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_159fb4bd8150,
    'EntityIDFieldName', p_EntityIDFieldName_159fb4bd8150,
    'ScopeDefault', p_ScopeDefault_159fb4bd8150,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_159fb4bd8150,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_159fb4bd8150,
    'Status', p_Status_159fb4bd8150,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_159fb4bd8150,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_159fb4bd8150,
    'AutoUpdateCategory', p_AutoUpdateCategory_159fb4bd8150,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_159fb4bd8150,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_159fb4bd8150,
    'Encrypt', p_Encrypt_159fb4bd8150,
    'EncryptionKeyID', p_EncryptionKeyID_159fb4bd8150,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_159fb4bd8150,
    'SendEncryptedValue', p_SendEncryptedValue_159fb4bd8150,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_159fb4bd8150,
    'IsSoftForeignKey', p_IsSoftForeignKey_159fb4bd8150,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_159fb4bd8150,
    'JSONType', p_JSONType_159fb4bd8150,
    'JSONTypeIsArray', p_JSONTypeIsArray_159fb4bd8150,
    'JSONTypeDefinition', p_JSONTypeDefinition_159fb4bd8150,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_159fb4bd8150,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_159fb4bd8150,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_159fb4bd8150,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_159fb4bd8150,
    'IsComputed', p_IsComputed_159fb4bd8150
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_159fb4bd8150,
    'Configuration', p_Configuration_159fb4bd8150,
    'ID', p_ID_159fb4bd8150
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_159fb4bd8150, p_Description := p_Description_159fb4bd8150, p_AutoUpdateDescription := p_AutoUpdateDescription_159fb4bd8150, p_IsPrimaryKey := p_IsPrimaryKey_159fb4bd8150, p_IsUnique := p_IsUnique_159fb4bd8150, p_Category := p_Category_159fb4bd8150, p_ValueListType := p_ValueListType_159fb4bd8150, p_ExtendedType := p_ExtendedType_159fb4bd8150, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_159fb4bd8150, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_159fb4bd8150, p_ViewCellTemplate := p_ViewCellTemplate_159fb4bd8150, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_159fb4bd8150, p_AllowUpdateAPI := p_AllowUpdateAPI_159fb4bd8150, p_AllowUpdateInView := p_AllowUpdateInView_159fb4bd8150, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_159fb4bd8150, p_FullTextSearchEnabled := p_FullTextSearchEnabled_159fb4bd8150, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_159fb4bd8150, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_159fb4bd8150, p_GeneratedFormSection := p_GeneratedFormSection_159fb4bd8150, p_IsNameField := p_IsNameField_159fb4bd8150, p_RelatedEntityID := p_RelatedEntityID_159fb4bd8150, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_159fb4bd8150, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_159fb4bd8150, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_159fb4bd8150, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_159fb4bd8150, p_EntityIDFieldName := p_EntityIDFieldName_159fb4bd8150, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_159fb4bd8150, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_159fb4bd8150, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_159fb4bd8150, p_Status := p_Status_159fb4bd8150, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_159fb4bd8150, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_159fb4bd8150, p_AutoUpdateCategory := p_AutoUpdateCategory_159fb4bd8150, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_159fb4bd8150, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_159fb4bd8150, p_Encrypt := p_Encrypt_159fb4bd8150, p_EncryptionKeyID := p_EncryptionKeyID_159fb4bd8150, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_159fb4bd8150, p_SendEncryptedValue := p_SendEncryptedValue_159fb4bd8150, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_159fb4bd8150, p_IsSoftForeignKey := p_IsSoftForeignKey_159fb4bd8150, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_159fb4bd8150, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_159fb4bd8150, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_159fb4bd8150, p_JSONTypeDefinition := p_JSONTypeDefinition_159fb4bd8150, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_159fb4bd8150, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_159fb4bd8150, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_159fb4bd8150, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_159fb4bd8150, p_IsComputed := p_IsComputed_159fb4bd8150, p_EmbeddedRecord := p_EmbeddedRecord_159fb4bd8150, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_159fb4bd8150, p_Configuration_Clear := TRUE, p_ID := p_ID_159fb4bd8150);
  END IF;
END $mj$;

-- Save MJ: User Views (core SP call only)
DO $mj$
DECLARE
  p_UserID_a55592b2028a UUID;
  p_EntityID_a55592b2028a UUID;
  p_Name_a55592b2028a VARCHAR(100);
  p_Description_a55592b2028a TEXT;
  p_CategoryID_a55592b2028a UUID;
  p_IsShared_a55592b2028a BOOLEAN;
  p_IsDefault_a55592b2028a BOOLEAN;
  p_GridState_a55592b2028a TEXT;
  p_FilterState_a55592b2028a TEXT;
  p_CustomFilterState_a55592b2028a BOOLEAN;
  p_SmartFilterEnabled_a55592b2028a BOOLEAN;
  p_SmartFilterPrompt_a55592b2028a TEXT;
  p_SmartFilterWhereClause_a55592b2028a TEXT;
  p_SmartFilterExplanation_a55592b2028a TEXT;
  p_WhereClause_a55592b2028a TEXT;
  p_CustomWhereClause_a55592b2028a BOOLEAN;
  p_SortState_a55592b2028a TEXT;
  p_Thumbnail_a55592b2028a TEXT;
  p_CardState_a55592b2028a TEXT;
  p_DisplayState_a55592b2028a TEXT;
  p_ViewTypeID_a55592b2028a UUID;
  p_ID_a55592b2028a UUID;
BEGIN
  p_UserID_a55592b2028a := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_EntityID_a55592b2028a := 'D344C546-4B63-422C-8636-64B29893F2FE';
  p_Name_a55592b2028a := 'Payment Webhook Deliveries: Not Applied';
  p_Description_a55592b2028a := 'Verified gateway webhook deliveries Orders ignored, rejected or failed to apply, and refund events whose refund Orders could not book, newest first. Event kinds Orders does not act on are left out.';
  p_IsShared_a55592b2028a := TRUE;
  p_IsDefault_a55592b2028a := TRUE;
  p_GridState_a55592b2028a := '{"sortSettings":[{"field":"LastReceivedAt","dir":"desc"}],"columnSettings":[{"Name":"LastReceivedAt","DisplayName":"Received","orderIndex":0,"width":170,"format":{"type":"date","dateFormat":"medium"}},{"Name":"Outcome","DisplayName":"Outcome","orderIndex":1,"width":120},{"Name":"ReasonCode","DisplayName":"Reason","orderIndex":2,"width":150},{"Name":"EventKind","DisplayName":"Event","orderIndex":3,"width":220},{"Name":"ProviderIntentID","DisplayName":"Gateway intent","orderIndex":4,"width":200},{"Name":"ProviderChargeID","DisplayName":"Gateway charge","orderIndex":5,"width":200},{"Name":"PaymentProvider","DisplayName":"Provider","orderIndex":6,"width":160},{"Name":"DeliveryCount","DisplayName":"Deliveries","orderIndex":7,"width":100},{"Name":"ProviderEventID","DisplayName":"Event id","orderIndex":8,"width":220}]}';
  p_FilterState_a55592b2028a := '{"logic":"and","filters":[]}';
  p_CustomFilterState_a55592b2028a := FALSE;
  p_SmartFilterEnabled_a55592b2028a := FALSE;
  p_WhereClause_a55592b2028a := '(Outcome IN (''Ignored'',''Rejected'',''Failed'') AND (ReasonCode IS NULL OR ReasonCode <> ''kind_not_handled'')) OR ReasonCode = ''refund_not_booked''';
  p_CustomWhereClause_a55592b2028a := TRUE;
  p_ID_a55592b2028a := '38883067-C971-4F93-A330-6E4BB0A8FD60';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateUserView'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateUserView"(p_data := jsonb_build_object(
    'UserID', p_UserID_a55592b2028a,
    'EntityID', p_EntityID_a55592b2028a,
    'Name', p_Name_a55592b2028a,
    'Description', p_Description_a55592b2028a,
    'CategoryID', p_CategoryID_a55592b2028a,
    'IsShared', p_IsShared_a55592b2028a,
    'IsDefault', p_IsDefault_a55592b2028a,
    'GridState', p_GridState_a55592b2028a,
    'FilterState', p_FilterState_a55592b2028a,
    'CustomFilterState', p_CustomFilterState_a55592b2028a,
    'SmartFilterEnabled', p_SmartFilterEnabled_a55592b2028a,
    'SmartFilterPrompt', p_SmartFilterPrompt_a55592b2028a,
    'SmartFilterWhereClause', p_SmartFilterWhereClause_a55592b2028a,
    'SmartFilterExplanation', p_SmartFilterExplanation_a55592b2028a,
    'WhereClause', p_WhereClause_a55592b2028a,
    'CustomWhereClause', p_CustomWhereClause_a55592b2028a,
    'SortState', p_SortState_a55592b2028a,
    'Thumbnail', p_Thumbnail_a55592b2028a,
    'CardState', p_CardState_a55592b2028a,
    'DisplayState', p_DisplayState_a55592b2028a,
    'ViewTypeID', p_ViewTypeID_a55592b2028a,
    'ID', p_ID_a55592b2028a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateUserView"(p_UserID := p_UserID_a55592b2028a, p_EntityID := p_EntityID_a55592b2028a, p_Name := p_Name_a55592b2028a, p_Description := p_Description_a55592b2028a, p_CategoryID := p_CategoryID_a55592b2028a, p_CategoryID_Clear := TRUE, p_IsShared := p_IsShared_a55592b2028a, p_IsDefault := p_IsDefault_a55592b2028a, p_GridState := p_GridState_a55592b2028a, p_FilterState := p_FilterState_a55592b2028a, p_CustomFilterState := p_CustomFilterState_a55592b2028a, p_SmartFilterEnabled := p_SmartFilterEnabled_a55592b2028a, p_SmartFilterPrompt := p_SmartFilterPrompt_a55592b2028a, p_SmartFilterPrompt_Clear := TRUE, p_SmartFilterWhereClause := p_SmartFilterWhereClause_a55592b2028a, p_SmartFilterWhereClause_Clear := TRUE, p_SmartFilterExplanation := p_SmartFilterExplanation_a55592b2028a, p_SmartFilterExplanation_Clear := TRUE, p_WhereClause := p_WhereClause_a55592b2028a, p_CustomWhereClause := p_CustomWhereClause_a55592b2028a, p_SortState := p_SortState_a55592b2028a, p_SortState_Clear := TRUE, p_Thumbnail := p_Thumbnail_a55592b2028a, p_Thumbnail_Clear := TRUE, p_CardState := p_CardState_a55592b2028a, p_CardState_Clear := TRUE, p_DisplayState := p_DisplayState_a55592b2028a, p_DisplayState_Clear := TRUE, p_ViewTypeID := p_ViewTypeID_a55592b2028a, p_ViewTypeID_Clear := TRUE, p_ID := p_ID_a55592b2028a);
  END IF;
END $mj$;


-- ===================== Other =====================

-- End of SQL Logging Session
-- Session ID: acc2e4e3-1b92-4dba-9936-c7c58dfab40d
-- Completed: 2026-11-03T20:52:33.812Z
-- Duration: 12924ms
-- Total Statements: 6
