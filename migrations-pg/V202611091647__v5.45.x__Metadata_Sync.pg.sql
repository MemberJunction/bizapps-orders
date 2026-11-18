-- =============================================================================================
-- PostgreSQL counterpart of V202611091647__v5.45.x__Metadata_Sync.sql
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

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_4e8b777044e5 UUID;
  p_ApplicationID_4e8b777044e5 UUID;
  p_Name_4e8b777044e5 VARCHAR(100);
  p_Value_4e8b777044e5 TEXT;
  p_Comments_4e8b777044e5 TEXT;
BEGIN
  p_ID_4e8b777044e5 := 'B3917D3A-4865-4B8D-992B-85E2CF2122C5';
  p_ApplicationID_4e8b777044e5 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_4e8b777044e5 := 'NoDealConfirmRoles';
  p_Value_4e8b777044e5 := '';
  p_Comments_4e8b777044e5 := 'Comma-separated NAMES of the MJ roles whose holders may confirm an order that no deal created (bc-aidp-next-golive#390), for example Finance,Senior Finance (AR),CFO. A user holding any one of them may confirm. Checkout, provider-payment, reversal and renewal-only orders are exempt, and so is every order on a host where no order-to-deal link is registered. Empty switches the check off, so orders confirm as before.';
  p_ApplicationID_4e8b777044e5 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_4e8b777044e5 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_4e8b777044e5);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_4e8b777044e5
                  OR ("ApplicationID" = p_ApplicationID_4e8b777044e5 AND "Name" = p_Name_4e8b777044e5)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_4e8b777044e5,
      'ApplicationID', p_ApplicationID_4e8b777044e5,
      'Name', p_Name_4e8b777044e5,
      'Value', p_Value_4e8b777044e5,
      'Comments', p_Comments_4e8b777044e5
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_4e8b777044e5, p_ApplicationID := p_ApplicationID_4e8b777044e5, p_Name := p_Name_4e8b777044e5, p_Value := p_Value_4e8b777044e5, p_Comments := p_Comments_4e8b777044e5);
    END IF;
  END IF;
END $mj$;


-- ===================== Other =====================

-- End of SQL Logging Session
-- Session ID: aef34a64-3a77-4453-bd41-1a3b76c4c417
-- Completed: 2026-11-09T16:47:17.719Z
-- Duration: 7404ms
-- Total Statements: 1
