-- =============================================================================================
-- PostgreSQL counterpart of V202611061325__v5.43.x__Metadata_Sync.sql -- BizApps Orders v5.43.x Metadata_Sync
-- =============================================================================================
-- Same record, same values as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file was
--     generated from. The record is a DO block that calls the function in whichever signature the
--     host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guard the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Core calls use ${mjSchema}.
--   * Every value is taken verbatim from the T-SQL file.
-- =============================================================================================

-- Save MJ: Authorization Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_73e70029b44b UUID;
  p_AuthorizationID_73e70029b44b UUID;
  p_RoleID_73e70029b44b UUID;
  p_Type_73e70029b44b CHAR(10);
BEGIN
  p_ID_73e70029b44b := '814B84CD-0785-483C-8A27-EE60A60CC7DE';
  p_AuthorizationID_73e70029b44b := 'A308824E-A9D1-45CD-8490-FE28B6284E3B';
  p_RoleID_73e70029b44b := '76ABD76E-3FCE-474B-84B8-18F5188E2AB9';
  p_Type_73e70029b44b := 'Allow';
  p_AuthorizationID_73e70029b44b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Authorization" WHERE "Name" = 'MJ.BizApps.Orders.Price.OverrideAny' ORDER BY CASE WHEN "ID" = p_AuthorizationID_73e70029b44b THEN 0 ELSE 1 END LIMIT 1), p_AuthorizationID_73e70029b44b);
  p_RoleID_73e70029b44b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Finance' ORDER BY CASE WHEN "ID" = p_RoleID_73e70029b44b THEN 0 ELSE 1 END LIMIT 1), p_RoleID_73e70029b44b);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."AuthorizationRole"
               WHERE "ID" = p_ID_73e70029b44b
                  OR ("AuthorizationID" = p_AuthorizationID_73e70029b44b AND "RoleID" = p_RoleID_73e70029b44b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorizationRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_data := jsonb_build_object(
      'ID', p_ID_73e70029b44b,
      'AuthorizationID', p_AuthorizationID_73e70029b44b,
      'RoleID', p_RoleID_73e70029b44b,
      'Type', p_Type_73e70029b44b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_ID := p_ID_73e70029b44b, p_AuthorizationID := p_AuthorizationID_73e70029b44b, p_RoleID := p_RoleID_73e70029b44b, p_Type := p_Type_73e70029b44b);
    END IF;
  END IF;
END $mj$;
