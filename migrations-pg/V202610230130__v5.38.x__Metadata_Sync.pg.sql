-- =============================================================================================
-- PostgreSQL counterpart of V202610230130__v5.38.x__Metadata_Sync.sql -- BizApps Orders v5.38.x Metadata_Sync
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

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_9162f62aaae0 VARCHAR(255);
  p_Description_9162f62aaae0 TEXT;
  p_AutoUpdateDescription_9162f62aaae0 BOOLEAN;
  p_IsPrimaryKey_9162f62aaae0 BOOLEAN;
  p_IsUnique_9162f62aaae0 BOOLEAN;
  p_Category_9162f62aaae0 VARCHAR(255);
  p_ValueListType_9162f62aaae0 VARCHAR(20);
  p_ExtendedType_9162f62aaae0 VARCHAR(50);
  p_CodeType_9162f62aaae0 VARCHAR(50);
  p_DefaultInView_9162f62aaae0 BOOLEAN;
  p_ViewCellTemplate_9162f62aaae0 TEXT;
  p_DefaultColumnWidth_9162f62aaae0 INTEGER;
  p_AllowUpdateAPI_9162f62aaae0 BOOLEAN;
  p_AllowUpdateInView_9162f62aaae0 BOOLEAN;
  p_IncludeInUserSearchAPI_9162f62aaae0 BOOLEAN;
  p_FullTextSearchEnabled_9162f62aaae0 BOOLEAN;
  p_UserSearchParamFormatAPI_9162f62aaae0 VARCHAR(500);
  p_IncludeInGeneratedForm_9162f62aaae0 BOOLEAN;
  p_GeneratedFormSection_9162f62aaae0 VARCHAR(10);
  p_IsNameField_9162f62aaae0 BOOLEAN;
  p_RelatedEntityID_9162f62aaae0 UUID;
  p_RelatedEntityFieldName_9162f62aaae0 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_9162f62aaae0 BOOLEAN;
  p_RelatedEntityNameFieldMap_9162f62aaae0 VARCHAR(255);
  p_RelatedEntityDisplayType_9162f62aaae0 VARCHAR(20);
  p_EntityIDFieldName_9162f62aaae0 VARCHAR(100);
  p_ScopeDefault_9162f62aaae0 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_9162f62aaae0 BOOLEAN;
  p_ValuesToPackWithSchema_9162f62aaae0 VARCHAR(10);
  p_Status_9162f62aaae0 VARCHAR(25);
  p_AutoUpdateIsNameField_9162f62aaae0 BOOLEAN;
  p_AutoUpdateDefaultInView_9162f62aaae0 BOOLEAN;
  p_AutoUpdateCategory_9162f62aaae0 BOOLEAN;
  p_AutoUpdateDisplayName_9162f62aaae0 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_9162f62aaae0 BOOLEAN;
  p_Encrypt_9162f62aaae0 BOOLEAN;
  p_EncryptionKeyID_9162f62aaae0 UUID;
  p_AllowDecryptInAPI_9162f62aaae0 BOOLEAN;
  p_SendEncryptedValue_9162f62aaae0 BOOLEAN;
  p_IsSoftPrimaryKey_9162f62aaae0 BOOLEAN;
  p_IsSoftForeignKey_9162f62aaae0 BOOLEAN;
  p_RelatedEntityJoinFields_9162f62aaae0 TEXT;
  p_JSONType_9162f62aaae0 VARCHAR(255);
  p_JSONTypeIsArray_9162f62aaae0 BOOLEAN;
  p_JSONTypeDefinition_9162f62aaae0 TEXT;
  p_UserSearchPredicateAPI_9162f62aaae0 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_9162f62aaae0 BOOLEAN;
  p_AutoUpdateFullTextSearch_9162f62aaae0 BOOLEAN;
  p_AutoUpdateExtendedType_9162f62aaae0 BOOLEAN;
  p_IsComputed_9162f62aaae0 BOOLEAN;
  p_EmbeddedRecord_9162f62aaae0 TEXT;
  p_Configuration_9162f62aaae0 TEXT;
  p_ID_9162f62aaae0 UUID;
BEGIN
  p_DisplayName_9162f62aaae0 := 'Record ID';
  p_Description_9162f62aaae0 := 'The record this default hangs off, within EntityID.';
  p_AutoUpdateDescription_9162f62aaae0 := TRUE;
  p_IsPrimaryKey_9162f62aaae0 := FALSE;
  p_IsUnique_9162f62aaae0 := FALSE;
  p_Category_9162f62aaae0 := 'Default Assignment';
  p_ValueListType_9162f62aaae0 := 'None';
  p_DefaultInView_9162f62aaae0 := TRUE;
  p_DefaultColumnWidth_9162f62aaae0 := 150;
  p_AllowUpdateAPI_9162f62aaae0 := TRUE;
  p_AllowUpdateInView_9162f62aaae0 := TRUE;
  p_IncludeInUserSearchAPI_9162f62aaae0 := FALSE;
  p_FullTextSearchEnabled_9162f62aaae0 := FALSE;
  p_IncludeInGeneratedForm_9162f62aaae0 := TRUE;
  p_GeneratedFormSection_9162f62aaae0 := 'Category';
  p_IsNameField_9162f62aaae0 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_9162f62aaae0 := FALSE;
  p_RelatedEntityDisplayType_9162f62aaae0 := 'Search';
  p_EntityIDFieldName_9162f62aaae0 := 'EntityID';
  p_AutoUpdateRelatedEntityInfo_9162f62aaae0 := TRUE;
  p_ValuesToPackWithSchema_9162f62aaae0 := 'Auto';
  p_Status_9162f62aaae0 := 'Active';
  p_AutoUpdateIsNameField_9162f62aaae0 := TRUE;
  p_AutoUpdateDefaultInView_9162f62aaae0 := TRUE;
  p_AutoUpdateCategory_9162f62aaae0 := TRUE;
  p_AutoUpdateDisplayName_9162f62aaae0 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_9162f62aaae0 := TRUE;
  p_Encrypt_9162f62aaae0 := FALSE;
  p_AllowDecryptInAPI_9162f62aaae0 := FALSE;
  p_SendEncryptedValue_9162f62aaae0 := FALSE;
  p_IsSoftPrimaryKey_9162f62aaae0 := FALSE;
  p_IsSoftForeignKey_9162f62aaae0 := FALSE;
  p_JSONTypeIsArray_9162f62aaae0 := FALSE;
  p_UserSearchPredicateAPI_9162f62aaae0 := 'Contains';
  p_AutoUpdateUserSearchPredicate_9162f62aaae0 := TRUE;
  p_AutoUpdateFullTextSearch_9162f62aaae0 := TRUE;
  p_AutoUpdateExtendedType_9162f62aaae0 := TRUE;
  p_IsComputed_9162f62aaae0 := FALSE;
  p_ID_9162f62aaae0 := '658E8609-5834-45AC-94EA-8BC22D94F703';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_9162f62aaae0,
    'Description', p_Description_9162f62aaae0,
    'AutoUpdateDescription', p_AutoUpdateDescription_9162f62aaae0,
    'IsPrimaryKey', p_IsPrimaryKey_9162f62aaae0,
    'IsUnique', p_IsUnique_9162f62aaae0,
    'Category', p_Category_9162f62aaae0,
    'ValueListType', p_ValueListType_9162f62aaae0,
    'ExtendedType', p_ExtendedType_9162f62aaae0,
    'CodeType', p_CodeType_9162f62aaae0,
    'DefaultInView', p_DefaultInView_9162f62aaae0,
    'ViewCellTemplate', p_ViewCellTemplate_9162f62aaae0,
    'DefaultColumnWidth', p_DefaultColumnWidth_9162f62aaae0,
    'AllowUpdateAPI', p_AllowUpdateAPI_9162f62aaae0,
    'AllowUpdateInView', p_AllowUpdateInView_9162f62aaae0,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_9162f62aaae0,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_9162f62aaae0,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_9162f62aaae0,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_9162f62aaae0,
    'GeneratedFormSection', p_GeneratedFormSection_9162f62aaae0,
    'IsNameField', p_IsNameField_9162f62aaae0,
    'RelatedEntityID', p_RelatedEntityID_9162f62aaae0,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_9162f62aaae0,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_9162f62aaae0,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_9162f62aaae0,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_9162f62aaae0,
    'EntityIDFieldName', p_EntityIDFieldName_9162f62aaae0,
    'ScopeDefault', p_ScopeDefault_9162f62aaae0,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_9162f62aaae0,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_9162f62aaae0,
    'Status', p_Status_9162f62aaae0,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_9162f62aaae0,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_9162f62aaae0,
    'AutoUpdateCategory', p_AutoUpdateCategory_9162f62aaae0,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_9162f62aaae0,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_9162f62aaae0,
    'Encrypt', p_Encrypt_9162f62aaae0,
    'EncryptionKeyID', p_EncryptionKeyID_9162f62aaae0,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_9162f62aaae0,
    'SendEncryptedValue', p_SendEncryptedValue_9162f62aaae0,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_9162f62aaae0,
    'IsSoftForeignKey', p_IsSoftForeignKey_9162f62aaae0,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_9162f62aaae0,
    'JSONType', p_JSONType_9162f62aaae0,
    'JSONTypeIsArray', p_JSONTypeIsArray_9162f62aaae0,
    'JSONTypeDefinition', p_JSONTypeDefinition_9162f62aaae0,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_9162f62aaae0,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_9162f62aaae0,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_9162f62aaae0,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_9162f62aaae0,
    'IsComputed', p_IsComputed_9162f62aaae0
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_9162f62aaae0,
    'Configuration', p_Configuration_9162f62aaae0,
    'ID', p_ID_9162f62aaae0
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_9162f62aaae0, p_Description := p_Description_9162f62aaae0, p_AutoUpdateDescription := p_AutoUpdateDescription_9162f62aaae0, p_IsPrimaryKey := p_IsPrimaryKey_9162f62aaae0, p_IsUnique := p_IsUnique_9162f62aaae0, p_Category := p_Category_9162f62aaae0, p_ValueListType := p_ValueListType_9162f62aaae0, p_ExtendedType := p_ExtendedType_9162f62aaae0, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_9162f62aaae0, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_9162f62aaae0, p_ViewCellTemplate := p_ViewCellTemplate_9162f62aaae0, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_9162f62aaae0, p_AllowUpdateAPI := p_AllowUpdateAPI_9162f62aaae0, p_AllowUpdateInView := p_AllowUpdateInView_9162f62aaae0, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_9162f62aaae0, p_FullTextSearchEnabled := p_FullTextSearchEnabled_9162f62aaae0, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_9162f62aaae0, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_9162f62aaae0, p_GeneratedFormSection := p_GeneratedFormSection_9162f62aaae0, p_IsNameField := p_IsNameField_9162f62aaae0, p_RelatedEntityID := p_RelatedEntityID_9162f62aaae0, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_9162f62aaae0, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_9162f62aaae0, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_9162f62aaae0, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_9162f62aaae0, p_EntityIDFieldName := p_EntityIDFieldName_9162f62aaae0, p_ScopeDefault := p_ScopeDefault_9162f62aaae0, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_9162f62aaae0, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_9162f62aaae0, p_Status := p_Status_9162f62aaae0, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_9162f62aaae0, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_9162f62aaae0, p_AutoUpdateCategory := p_AutoUpdateCategory_9162f62aaae0, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_9162f62aaae0, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_9162f62aaae0, p_Encrypt := p_Encrypt_9162f62aaae0, p_EncryptionKeyID := p_EncryptionKeyID_9162f62aaae0, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_9162f62aaae0, p_SendEncryptedValue := p_SendEncryptedValue_9162f62aaae0, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_9162f62aaae0, p_IsSoftForeignKey := p_IsSoftForeignKey_9162f62aaae0, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_9162f62aaae0, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_9162f62aaae0, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_9162f62aaae0, p_JSONTypeDefinition := p_JSONTypeDefinition_9162f62aaae0, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_9162f62aaae0, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_9162f62aaae0, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_9162f62aaae0, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_9162f62aaae0, p_IsComputed := p_IsComputed_9162f62aaae0, p_EmbeddedRecord := p_EmbeddedRecord_9162f62aaae0, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_9162f62aaae0, p_Configuration_Clear := TRUE, p_ID := p_ID_9162f62aaae0);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_0d4934fe4a41 VARCHAR(255);
  p_Description_0d4934fe4a41 TEXT;
  p_AutoUpdateDescription_0d4934fe4a41 BOOLEAN;
  p_IsPrimaryKey_0d4934fe4a41 BOOLEAN;
  p_IsUnique_0d4934fe4a41 BOOLEAN;
  p_Category_0d4934fe4a41 VARCHAR(255);
  p_ValueListType_0d4934fe4a41 VARCHAR(20);
  p_ExtendedType_0d4934fe4a41 VARCHAR(50);
  p_CodeType_0d4934fe4a41 VARCHAR(50);
  p_DefaultInView_0d4934fe4a41 BOOLEAN;
  p_ViewCellTemplate_0d4934fe4a41 TEXT;
  p_DefaultColumnWidth_0d4934fe4a41 INTEGER;
  p_AllowUpdateAPI_0d4934fe4a41 BOOLEAN;
  p_AllowUpdateInView_0d4934fe4a41 BOOLEAN;
  p_IncludeInUserSearchAPI_0d4934fe4a41 BOOLEAN;
  p_FullTextSearchEnabled_0d4934fe4a41 BOOLEAN;
  p_UserSearchParamFormatAPI_0d4934fe4a41 VARCHAR(500);
  p_IncludeInGeneratedForm_0d4934fe4a41 BOOLEAN;
  p_GeneratedFormSection_0d4934fe4a41 VARCHAR(10);
  p_IsNameField_0d4934fe4a41 BOOLEAN;
  p_RelatedEntityID_0d4934fe4a41 UUID;
  p_RelatedEntityFieldName_0d4934fe4a41 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_0d4934fe4a41 BOOLEAN;
  p_RelatedEntityNameFieldMap_0d4934fe4a41 VARCHAR(255);
  p_RelatedEntityDisplayType_0d4934fe4a41 VARCHAR(20);
  p_EntityIDFieldName_0d4934fe4a41 VARCHAR(100);
  p_ScopeDefault_0d4934fe4a41 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_0d4934fe4a41 BOOLEAN;
  p_ValuesToPackWithSchema_0d4934fe4a41 VARCHAR(10);
  p_Status_0d4934fe4a41 VARCHAR(25);
  p_AutoUpdateIsNameField_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateDefaultInView_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateCategory_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateDisplayName_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_0d4934fe4a41 BOOLEAN;
  p_Encrypt_0d4934fe4a41 BOOLEAN;
  p_EncryptionKeyID_0d4934fe4a41 UUID;
  p_AllowDecryptInAPI_0d4934fe4a41 BOOLEAN;
  p_SendEncryptedValue_0d4934fe4a41 BOOLEAN;
  p_IsSoftPrimaryKey_0d4934fe4a41 BOOLEAN;
  p_IsSoftForeignKey_0d4934fe4a41 BOOLEAN;
  p_RelatedEntityJoinFields_0d4934fe4a41 TEXT;
  p_JSONType_0d4934fe4a41 VARCHAR(255);
  p_JSONTypeIsArray_0d4934fe4a41 BOOLEAN;
  p_JSONTypeDefinition_0d4934fe4a41 TEXT;
  p_UserSearchPredicateAPI_0d4934fe4a41 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateFullTextSearch_0d4934fe4a41 BOOLEAN;
  p_AutoUpdateExtendedType_0d4934fe4a41 BOOLEAN;
  p_IsComputed_0d4934fe4a41 BOOLEAN;
  p_EmbeddedRecord_0d4934fe4a41 TEXT;
  p_Configuration_0d4934fe4a41 TEXT;
  p_ID_0d4934fe4a41 UUID;
BEGIN
  p_DisplayName_0d4934fe4a41 := 'Source Record ID';
  p_Description_0d4934fe4a41 := 'Primary key of the producing record, as text. A soft reference by nature - it points at whichever table the stage used.';
  p_AutoUpdateDescription_0d4934fe4a41 := TRUE;
  p_IsPrimaryKey_0d4934fe4a41 := FALSE;
  p_IsUnique_0d4934fe4a41 := FALSE;
  p_Category_0d4934fe4a41 := 'Provenance';
  p_ValueListType_0d4934fe4a41 := 'None';
  p_DefaultInView_0d4934fe4a41 := FALSE;
  p_DefaultColumnWidth_0d4934fe4a41 := 150;
  p_AllowUpdateAPI_0d4934fe4a41 := TRUE;
  p_AllowUpdateInView_0d4934fe4a41 := TRUE;
  p_IncludeInUserSearchAPI_0d4934fe4a41 := FALSE;
  p_FullTextSearchEnabled_0d4934fe4a41 := FALSE;
  p_IncludeInGeneratedForm_0d4934fe4a41 := TRUE;
  p_GeneratedFormSection_0d4934fe4a41 := 'Category';
  p_IsNameField_0d4934fe4a41 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_0d4934fe4a41 := FALSE;
  p_RelatedEntityDisplayType_0d4934fe4a41 := 'Search';
  p_EntityIDFieldName_0d4934fe4a41 := 'SourceEntityID';
  p_AutoUpdateRelatedEntityInfo_0d4934fe4a41 := TRUE;
  p_ValuesToPackWithSchema_0d4934fe4a41 := 'Auto';
  p_Status_0d4934fe4a41 := 'Active';
  p_AutoUpdateIsNameField_0d4934fe4a41 := TRUE;
  p_AutoUpdateDefaultInView_0d4934fe4a41 := TRUE;
  p_AutoUpdateCategory_0d4934fe4a41 := TRUE;
  p_AutoUpdateDisplayName_0d4934fe4a41 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_0d4934fe4a41 := TRUE;
  p_Encrypt_0d4934fe4a41 := FALSE;
  p_AllowDecryptInAPI_0d4934fe4a41 := FALSE;
  p_SendEncryptedValue_0d4934fe4a41 := FALSE;
  p_IsSoftPrimaryKey_0d4934fe4a41 := FALSE;
  p_IsSoftForeignKey_0d4934fe4a41 := FALSE;
  p_JSONTypeIsArray_0d4934fe4a41 := FALSE;
  p_UserSearchPredicateAPI_0d4934fe4a41 := 'Contains';
  p_AutoUpdateUserSearchPredicate_0d4934fe4a41 := TRUE;
  p_AutoUpdateFullTextSearch_0d4934fe4a41 := TRUE;
  p_AutoUpdateExtendedType_0d4934fe4a41 := TRUE;
  p_IsComputed_0d4934fe4a41 := FALSE;
  p_ID_0d4934fe4a41 := '6658F164-6789-4405-A0B8-6162BC8554ED';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_0d4934fe4a41,
    'Description', p_Description_0d4934fe4a41,
    'AutoUpdateDescription', p_AutoUpdateDescription_0d4934fe4a41,
    'IsPrimaryKey', p_IsPrimaryKey_0d4934fe4a41,
    'IsUnique', p_IsUnique_0d4934fe4a41,
    'Category', p_Category_0d4934fe4a41,
    'ValueListType', p_ValueListType_0d4934fe4a41,
    'ExtendedType', p_ExtendedType_0d4934fe4a41,
    'CodeType', p_CodeType_0d4934fe4a41,
    'DefaultInView', p_DefaultInView_0d4934fe4a41,
    'ViewCellTemplate', p_ViewCellTemplate_0d4934fe4a41,
    'DefaultColumnWidth', p_DefaultColumnWidth_0d4934fe4a41,
    'AllowUpdateAPI', p_AllowUpdateAPI_0d4934fe4a41,
    'AllowUpdateInView', p_AllowUpdateInView_0d4934fe4a41,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_0d4934fe4a41,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_0d4934fe4a41,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_0d4934fe4a41,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_0d4934fe4a41,
    'GeneratedFormSection', p_GeneratedFormSection_0d4934fe4a41,
    'IsNameField', p_IsNameField_0d4934fe4a41,
    'RelatedEntityID', p_RelatedEntityID_0d4934fe4a41,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_0d4934fe4a41,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_0d4934fe4a41,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_0d4934fe4a41,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_0d4934fe4a41,
    'EntityIDFieldName', p_EntityIDFieldName_0d4934fe4a41,
    'ScopeDefault', p_ScopeDefault_0d4934fe4a41,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_0d4934fe4a41,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_0d4934fe4a41,
    'Status', p_Status_0d4934fe4a41,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_0d4934fe4a41,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_0d4934fe4a41,
    'AutoUpdateCategory', p_AutoUpdateCategory_0d4934fe4a41,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_0d4934fe4a41,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_0d4934fe4a41,
    'Encrypt', p_Encrypt_0d4934fe4a41,
    'EncryptionKeyID', p_EncryptionKeyID_0d4934fe4a41,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_0d4934fe4a41,
    'SendEncryptedValue', p_SendEncryptedValue_0d4934fe4a41,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_0d4934fe4a41,
    'IsSoftForeignKey', p_IsSoftForeignKey_0d4934fe4a41,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_0d4934fe4a41,
    'JSONType', p_JSONType_0d4934fe4a41,
    'JSONTypeIsArray', p_JSONTypeIsArray_0d4934fe4a41,
    'JSONTypeDefinition', p_JSONTypeDefinition_0d4934fe4a41,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_0d4934fe4a41,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_0d4934fe4a41,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_0d4934fe4a41,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_0d4934fe4a41,
    'IsComputed', p_IsComputed_0d4934fe4a41
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_0d4934fe4a41,
    'Configuration', p_Configuration_0d4934fe4a41,
    'ID', p_ID_0d4934fe4a41
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_0d4934fe4a41, p_Description := p_Description_0d4934fe4a41, p_AutoUpdateDescription := p_AutoUpdateDescription_0d4934fe4a41, p_IsPrimaryKey := p_IsPrimaryKey_0d4934fe4a41, p_IsUnique := p_IsUnique_0d4934fe4a41, p_Category := p_Category_0d4934fe4a41, p_ValueListType := p_ValueListType_0d4934fe4a41, p_ExtendedType := p_ExtendedType_0d4934fe4a41, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_0d4934fe4a41, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_0d4934fe4a41, p_ViewCellTemplate := p_ViewCellTemplate_0d4934fe4a41, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_0d4934fe4a41, p_AllowUpdateAPI := p_AllowUpdateAPI_0d4934fe4a41, p_AllowUpdateInView := p_AllowUpdateInView_0d4934fe4a41, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_0d4934fe4a41, p_FullTextSearchEnabled := p_FullTextSearchEnabled_0d4934fe4a41, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_0d4934fe4a41, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_0d4934fe4a41, p_GeneratedFormSection := p_GeneratedFormSection_0d4934fe4a41, p_IsNameField := p_IsNameField_0d4934fe4a41, p_RelatedEntityID := p_RelatedEntityID_0d4934fe4a41, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_0d4934fe4a41, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_0d4934fe4a41, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_0d4934fe4a41, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_0d4934fe4a41, p_EntityIDFieldName := p_EntityIDFieldName_0d4934fe4a41, p_ScopeDefault := p_ScopeDefault_0d4934fe4a41, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_0d4934fe4a41, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_0d4934fe4a41, p_Status := p_Status_0d4934fe4a41, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_0d4934fe4a41, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_0d4934fe4a41, p_AutoUpdateCategory := p_AutoUpdateCategory_0d4934fe4a41, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_0d4934fe4a41, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_0d4934fe4a41, p_Encrypt := p_Encrypt_0d4934fe4a41, p_EncryptionKeyID := p_EncryptionKeyID_0d4934fe4a41, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_0d4934fe4a41, p_SendEncryptedValue := p_SendEncryptedValue_0d4934fe4a41, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_0d4934fe4a41, p_IsSoftForeignKey := p_IsSoftForeignKey_0d4934fe4a41, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_0d4934fe4a41, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_0d4934fe4a41, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_0d4934fe4a41, p_JSONTypeDefinition := p_JSONTypeDefinition_0d4934fe4a41, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_0d4934fe4a41, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_0d4934fe4a41, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_0d4934fe4a41, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_0d4934fe4a41, p_IsComputed := p_IsComputed_0d4934fe4a41, p_EmbeddedRecord := p_EmbeddedRecord_0d4934fe4a41, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_0d4934fe4a41, p_Configuration_Clear := TRUE, p_ID := p_ID_0d4934fe4a41);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_76c17c17fd2f VARCHAR(255);
  p_Description_76c17c17fd2f TEXT;
  p_AutoUpdateDescription_76c17c17fd2f BOOLEAN;
  p_IsPrimaryKey_76c17c17fd2f BOOLEAN;
  p_IsUnique_76c17c17fd2f BOOLEAN;
  p_Category_76c17c17fd2f VARCHAR(255);
  p_ValueListType_76c17c17fd2f VARCHAR(20);
  p_ExtendedType_76c17c17fd2f VARCHAR(50);
  p_CodeType_76c17c17fd2f VARCHAR(50);
  p_DefaultInView_76c17c17fd2f BOOLEAN;
  p_ViewCellTemplate_76c17c17fd2f TEXT;
  p_DefaultColumnWidth_76c17c17fd2f INTEGER;
  p_AllowUpdateAPI_76c17c17fd2f BOOLEAN;
  p_AllowUpdateInView_76c17c17fd2f BOOLEAN;
  p_IncludeInUserSearchAPI_76c17c17fd2f BOOLEAN;
  p_FullTextSearchEnabled_76c17c17fd2f BOOLEAN;
  p_UserSearchParamFormatAPI_76c17c17fd2f VARCHAR(500);
  p_IncludeInGeneratedForm_76c17c17fd2f BOOLEAN;
  p_GeneratedFormSection_76c17c17fd2f VARCHAR(10);
  p_IsNameField_76c17c17fd2f BOOLEAN;
  p_RelatedEntityID_76c17c17fd2f UUID;
  p_RelatedEntityFieldName_76c17c17fd2f VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_76c17c17fd2f BOOLEAN;
  p_RelatedEntityNameFieldMap_76c17c17fd2f VARCHAR(255);
  p_RelatedEntityDisplayType_76c17c17fd2f VARCHAR(20);
  p_EntityIDFieldName_76c17c17fd2f VARCHAR(100);
  p_ScopeDefault_76c17c17fd2f VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_76c17c17fd2f BOOLEAN;
  p_ValuesToPackWithSchema_76c17c17fd2f VARCHAR(10);
  p_Status_76c17c17fd2f VARCHAR(25);
  p_AutoUpdateIsNameField_76c17c17fd2f BOOLEAN;
  p_AutoUpdateDefaultInView_76c17c17fd2f BOOLEAN;
  p_AutoUpdateCategory_76c17c17fd2f BOOLEAN;
  p_AutoUpdateDisplayName_76c17c17fd2f BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_76c17c17fd2f BOOLEAN;
  p_Encrypt_76c17c17fd2f BOOLEAN;
  p_EncryptionKeyID_76c17c17fd2f UUID;
  p_AllowDecryptInAPI_76c17c17fd2f BOOLEAN;
  p_SendEncryptedValue_76c17c17fd2f BOOLEAN;
  p_IsSoftPrimaryKey_76c17c17fd2f BOOLEAN;
  p_IsSoftForeignKey_76c17c17fd2f BOOLEAN;
  p_RelatedEntityJoinFields_76c17c17fd2f TEXT;
  p_JSONType_76c17c17fd2f VARCHAR(255);
  p_JSONTypeIsArray_76c17c17fd2f BOOLEAN;
  p_JSONTypeDefinition_76c17c17fd2f TEXT;
  p_UserSearchPredicateAPI_76c17c17fd2f VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_76c17c17fd2f BOOLEAN;
  p_AutoUpdateFullTextSearch_76c17c17fd2f BOOLEAN;
  p_AutoUpdateExtendedType_76c17c17fd2f BOOLEAN;
  p_IsComputed_76c17c17fd2f BOOLEAN;
  p_EmbeddedRecord_76c17c17fd2f TEXT;
  p_Configuration_76c17c17fd2f TEXT;
  p_ID_76c17c17fd2f UUID;
BEGIN
  p_DisplayName_76c17c17fd2f := 'Source Record ID';
  p_Description_76c17c17fd2f := 'Where a derived number came from, when it was derived (record). NULL for a plain attestation.';
  p_AutoUpdateDescription_76c17c17fd2f := TRUE;
  p_IsPrimaryKey_76c17c17fd2f := FALSE;
  p_IsUnique_76c17c17fd2f := FALSE;
  p_Category_76c17c17fd2f := 'Measurement';
  p_ValueListType_76c17c17fd2f := 'None';
  p_DefaultInView_76c17c17fd2f := FALSE;
  p_DefaultColumnWidth_76c17c17fd2f := 150;
  p_AllowUpdateAPI_76c17c17fd2f := TRUE;
  p_AllowUpdateInView_76c17c17fd2f := TRUE;
  p_IncludeInUserSearchAPI_76c17c17fd2f := FALSE;
  p_FullTextSearchEnabled_76c17c17fd2f := FALSE;
  p_IncludeInGeneratedForm_76c17c17fd2f := TRUE;
  p_GeneratedFormSection_76c17c17fd2f := 'Category';
  p_IsNameField_76c17c17fd2f := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_76c17c17fd2f := FALSE;
  p_RelatedEntityDisplayType_76c17c17fd2f := 'Search';
  p_EntityIDFieldName_76c17c17fd2f := 'SourceEntityID';
  p_AutoUpdateRelatedEntityInfo_76c17c17fd2f := TRUE;
  p_ValuesToPackWithSchema_76c17c17fd2f := 'Auto';
  p_Status_76c17c17fd2f := 'Active';
  p_AutoUpdateIsNameField_76c17c17fd2f := TRUE;
  p_AutoUpdateDefaultInView_76c17c17fd2f := TRUE;
  p_AutoUpdateCategory_76c17c17fd2f := TRUE;
  p_AutoUpdateDisplayName_76c17c17fd2f := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_76c17c17fd2f := TRUE;
  p_Encrypt_76c17c17fd2f := FALSE;
  p_AllowDecryptInAPI_76c17c17fd2f := FALSE;
  p_SendEncryptedValue_76c17c17fd2f := FALSE;
  p_IsSoftPrimaryKey_76c17c17fd2f := FALSE;
  p_IsSoftForeignKey_76c17c17fd2f := FALSE;
  p_JSONTypeIsArray_76c17c17fd2f := FALSE;
  p_UserSearchPredicateAPI_76c17c17fd2f := 'Contains';
  p_AutoUpdateUserSearchPredicate_76c17c17fd2f := TRUE;
  p_AutoUpdateFullTextSearch_76c17c17fd2f := TRUE;
  p_AutoUpdateExtendedType_76c17c17fd2f := TRUE;
  p_IsComputed_76c17c17fd2f := FALSE;
  p_ID_76c17c17fd2f := '618DC65B-8BD5-42CF-9410-4E5E6F4E5F92';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_76c17c17fd2f,
    'Description', p_Description_76c17c17fd2f,
    'AutoUpdateDescription', p_AutoUpdateDescription_76c17c17fd2f,
    'IsPrimaryKey', p_IsPrimaryKey_76c17c17fd2f,
    'IsUnique', p_IsUnique_76c17c17fd2f,
    'Category', p_Category_76c17c17fd2f,
    'ValueListType', p_ValueListType_76c17c17fd2f,
    'ExtendedType', p_ExtendedType_76c17c17fd2f,
    'CodeType', p_CodeType_76c17c17fd2f,
    'DefaultInView', p_DefaultInView_76c17c17fd2f,
    'ViewCellTemplate', p_ViewCellTemplate_76c17c17fd2f,
    'DefaultColumnWidth', p_DefaultColumnWidth_76c17c17fd2f,
    'AllowUpdateAPI', p_AllowUpdateAPI_76c17c17fd2f,
    'AllowUpdateInView', p_AllowUpdateInView_76c17c17fd2f,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_76c17c17fd2f,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_76c17c17fd2f,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_76c17c17fd2f,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_76c17c17fd2f,
    'GeneratedFormSection', p_GeneratedFormSection_76c17c17fd2f,
    'IsNameField', p_IsNameField_76c17c17fd2f,
    'RelatedEntityID', p_RelatedEntityID_76c17c17fd2f,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_76c17c17fd2f,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_76c17c17fd2f,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_76c17c17fd2f,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_76c17c17fd2f,
    'EntityIDFieldName', p_EntityIDFieldName_76c17c17fd2f,
    'ScopeDefault', p_ScopeDefault_76c17c17fd2f,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_76c17c17fd2f,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_76c17c17fd2f,
    'Status', p_Status_76c17c17fd2f,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_76c17c17fd2f,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_76c17c17fd2f,
    'AutoUpdateCategory', p_AutoUpdateCategory_76c17c17fd2f,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_76c17c17fd2f,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_76c17c17fd2f,
    'Encrypt', p_Encrypt_76c17c17fd2f,
    'EncryptionKeyID', p_EncryptionKeyID_76c17c17fd2f,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_76c17c17fd2f,
    'SendEncryptedValue', p_SendEncryptedValue_76c17c17fd2f,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_76c17c17fd2f,
    'IsSoftForeignKey', p_IsSoftForeignKey_76c17c17fd2f,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_76c17c17fd2f,
    'JSONType', p_JSONType_76c17c17fd2f,
    'JSONTypeIsArray', p_JSONTypeIsArray_76c17c17fd2f,
    'JSONTypeDefinition', p_JSONTypeDefinition_76c17c17fd2f,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_76c17c17fd2f,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_76c17c17fd2f,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_76c17c17fd2f,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_76c17c17fd2f,
    'IsComputed', p_IsComputed_76c17c17fd2f
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_76c17c17fd2f,
    'Configuration', p_Configuration_76c17c17fd2f,
    'ID', p_ID_76c17c17fd2f
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_76c17c17fd2f, p_Description := p_Description_76c17c17fd2f, p_AutoUpdateDescription := p_AutoUpdateDescription_76c17c17fd2f, p_IsPrimaryKey := p_IsPrimaryKey_76c17c17fd2f, p_IsUnique := p_IsUnique_76c17c17fd2f, p_Category := p_Category_76c17c17fd2f, p_ValueListType := p_ValueListType_76c17c17fd2f, p_ExtendedType := p_ExtendedType_76c17c17fd2f, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_76c17c17fd2f, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_76c17c17fd2f, p_ViewCellTemplate := p_ViewCellTemplate_76c17c17fd2f, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_76c17c17fd2f, p_AllowUpdateAPI := p_AllowUpdateAPI_76c17c17fd2f, p_AllowUpdateInView := p_AllowUpdateInView_76c17c17fd2f, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_76c17c17fd2f, p_FullTextSearchEnabled := p_FullTextSearchEnabled_76c17c17fd2f, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_76c17c17fd2f, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_76c17c17fd2f, p_GeneratedFormSection := p_GeneratedFormSection_76c17c17fd2f, p_IsNameField := p_IsNameField_76c17c17fd2f, p_RelatedEntityID := p_RelatedEntityID_76c17c17fd2f, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_76c17c17fd2f, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_76c17c17fd2f, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_76c17c17fd2f, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_76c17c17fd2f, p_EntityIDFieldName := p_EntityIDFieldName_76c17c17fd2f, p_ScopeDefault := p_ScopeDefault_76c17c17fd2f, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_76c17c17fd2f, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_76c17c17fd2f, p_Status := p_Status_76c17c17fd2f, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_76c17c17fd2f, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_76c17c17fd2f, p_AutoUpdateCategory := p_AutoUpdateCategory_76c17c17fd2f, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_76c17c17fd2f, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_76c17c17fd2f, p_Encrypt := p_Encrypt_76c17c17fd2f, p_EncryptionKeyID := p_EncryptionKeyID_76c17c17fd2f, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_76c17c17fd2f, p_SendEncryptedValue := p_SendEncryptedValue_76c17c17fd2f, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_76c17c17fd2f, p_IsSoftForeignKey := p_IsSoftForeignKey_76c17c17fd2f, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_76c17c17fd2f, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_76c17c17fd2f, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_76c17c17fd2f, p_JSONTypeDefinition := p_JSONTypeDefinition_76c17c17fd2f, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_76c17c17fd2f, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_76c17c17fd2f, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_76c17c17fd2f, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_76c17c17fd2f, p_IsComputed := p_IsComputed_76c17c17fd2f, p_EmbeddedRecord := p_EmbeddedRecord_76c17c17fd2f, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_76c17c17fd2f, p_Configuration_Clear := TRUE, p_ID := p_ID_76c17c17fd2f);
  END IF;
END $mj$;
