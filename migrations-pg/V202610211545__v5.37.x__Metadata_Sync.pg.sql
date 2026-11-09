-- =============================================================================================
-- PostgreSQL counterpart of V202610211545__v5.37.x__Metadata_Sync.sql -- BizApps Orders v5.37.x Metadata_Sync
-- =============================================================================================
-- Same record, same values as the T-SQL file; written block for block from the 5.36 counterpart
-- (V202610200035__v5.36.x__Metadata_Sync.pg.sql), whose header explains the lookup and guard
-- translation. String values are verbatim from the T-SQL file.
-- =============================================================================================

SET standard_conforming_strings = on;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_5c169a560698 UUID;
  p_ApplicationID_5c169a560698 UUID;
  p_Name_5c169a560698 VARCHAR(100);
  p_Value_5c169a560698 TEXT;
  p_Comments_5c169a560698 TEXT;
BEGIN
  p_ID_5c169a560698 := '5C169A56-0698-49DA-A2FC-C8D1DF64FFA3';
  p_ApplicationID_5c169a560698 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_5c169a560698 := 'ConcessionSelfApprovalEscalation';
  p_Value_5c169a560698 := '';
  p_Comments_5c169a560698 := 'Who decides a concession requested by a holder of its ConcessionLimit rule''s role, who would otherwise approve their own (bc-aidp-next-golive#320). Comma-separated targets, tried in order: CompanyCFO (the order company''s ApprovalCFOUserID in its Accounting Company Profile) or the NAME of an MJ role (its active holders). The first target that names an active user other than the requester is assigned the approval task, and only those users can decide it; the requester never is. When no target names anyone else, the concession is refused. Empty keeps the previous behavior: the requester''s own concession is approved on save.';
  p_ApplicationID_5c169a560698 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_5c169a560698 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_5c169a560698);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_5c169a560698
                  OR ("ApplicationID" = p_ApplicationID_5c169a560698 AND "Name" = p_Name_5c169a560698)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_5c169a560698,
      'ApplicationID', p_ApplicationID_5c169a560698,
      'Name', p_Name_5c169a560698,
      'Value', p_Value_5c169a560698,
      'Comments', p_Comments_5c169a560698
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_5c169a560698, p_ApplicationID := p_ApplicationID_5c169a560698, p_Name := p_Name_5c169a560698, p_Value := p_Value_5c169a560698, p_Comments := p_Comments_5c169a560698);
    END IF;
  END IF;
END $mj$;
