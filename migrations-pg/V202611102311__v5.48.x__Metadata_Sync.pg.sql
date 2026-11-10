-- =============================================================================================
-- PostgreSQL counterpart of V202611102311__v5.48.x__Metadata_Sync.sql
-- =============================================================================================
-- Same records, same values as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE: `mj sql-convert --from tsql --to postgres` (MJ CLI 6.2.1) on each block of the
-- push log, one block per run (the converter merges a multi-block log into one). Each block's
-- guard is then widened to match the T-SQL file (ID, or the natural key) and its update branch
-- removed, so every record is create-only. Core references use ${mjSchema}.
-- =============================================================================================

-- Save MJ: Authorizations (core SP call only)
DO $mj$
DECLARE
  p_ID_fb6175fbdcb3 UUID;
  p_ParentID_fb6175fbdcb3 UUID;
  p_Name_fb6175fbdcb3 VARCHAR(100);
  p_IsActive_fb6175fbdcb3 BOOLEAN;
  p_UseAuditLog_fb6175fbdcb3 BOOLEAN;
  p_Description_fb6175fbdcb3 TEXT;
BEGIN
  p_ID_fb6175fbdcb3 := 'B1743944-D373-4F8E-A5CE-0FE96F38B9D9';
  p_Name_fb6175fbdcb3 := 'MJ.BizApps.Orders.Order.Reverse';
  p_IsActive_fb6175fbdcb3 := TRUE;
  p_UseAuditLog_fb6175fbdcb3 := TRUE;
  p_Description_fb6175fbdcb3 := 'Reverse money a booked order holds: cancel a subscription (Orders.CancelSubscription, with its credit memo), refund a payment (Orders.RefundPayment), move an account credit to another order (Orders.ApplyAccountCredit), or lower an agreed amount (Orders.AmendArrangement with NewAmount). Each refuses a caller without it, before any read or write; a record of something the payment gateway already did is exempt. Held by the Finance role, and by Developer, which keeps every permission (bc-aidp-next-golive#454). A return (a reversal order booked from the Returns page) does not need it. Without this row, all four are refused.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Authorization"
                 WHERE "ID" = p_ID_fb6175fbdcb3
                    OR ("Name" = p_Name_fb6175fbdcb3)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorization'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorization"(p_data := jsonb_build_object(
    'ID', p_ID_fb6175fbdcb3,
    'ParentID', p_ParentID_fb6175fbdcb3,
    'Name', p_Name_fb6175fbdcb3,
    'IsActive', p_IsActive_fb6175fbdcb3,
    'UseAuditLog', p_UseAuditLog_fb6175fbdcb3,
    'Description', p_Description_fb6175fbdcb3
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorization"(p_ID := p_ID_fb6175fbdcb3, p_ParentID := p_ParentID_fb6175fbdcb3, p_ParentID_Clear := TRUE, p_Name := p_Name_fb6175fbdcb3, p_IsActive := p_IsActive_fb6175fbdcb3, p_UseAuditLog := p_UseAuditLog_fb6175fbdcb3, p_Description := p_Description_fb6175fbdcb3);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Authorization Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_5a07d0055a4e UUID;
  p_AuthorizationID_5a07d0055a4e UUID;
  p_RoleID_5a07d0055a4e UUID;
  p_Type_5a07d0055a4e CHAR(10);
BEGIN
  p_ID_5a07d0055a4e := '123FEF5B-7669-43A0-BDD0-0E51B0AA4C44';
  p_AuthorizationID_5a07d0055a4e := (
    SELECT
      "ID"
    FROM
      "${mjSchema}"."Authorization"
    WHERE
      LOWER("Name") = LOWER('MJ.BizApps.Orders.Order.Reverse')
  );
  p_RoleID_5a07d0055a4e := (
    SELECT
      "ID"
    FROM
      "${mjSchema}"."Role"
    WHERE
      LOWER("Name") = LOWER('Finance')
  );
  p_Type_5a07d0055a4e := 'Allow';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."AuthorizationRole"
                 WHERE "ID" = p_ID_5a07d0055a4e
                    OR ("AuthorizationID" = p_AuthorizationID_5a07d0055a4e AND "RoleID" = p_RoleID_5a07d0055a4e)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorizationRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_data := jsonb_build_object(
    'ID', p_ID_5a07d0055a4e,
    'AuthorizationID', p_AuthorizationID_5a07d0055a4e,
    'RoleID', p_RoleID_5a07d0055a4e,
    'Type', p_Type_5a07d0055a4e
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_ID := p_ID_5a07d0055a4e, p_AuthorizationID := p_AuthorizationID_5a07d0055a4e, p_RoleID := p_RoleID_5a07d0055a4e, p_Type := p_Type_5a07d0055a4e);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Authorization Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_1ea1d0332e85 UUID;
  p_AuthorizationID_1ea1d0332e85 UUID;
  p_RoleID_1ea1d0332e85 UUID;
  p_Type_1ea1d0332e85 CHAR(10);
BEGIN
  p_ID_1ea1d0332e85 := '371E0243-B1B6-4C32-8561-011DC1504328';
  p_AuthorizationID_1ea1d0332e85 := (
    SELECT
      "ID"
    FROM
      "${mjSchema}"."Authorization"
    WHERE
      LOWER("Name") = LOWER('MJ.BizApps.Orders.Order.Reverse')
  );
  p_RoleID_1ea1d0332e85 := (
    SELECT
      "ID"
    FROM
      "${mjSchema}"."Role"
    WHERE
      LOWER("Name") = LOWER('Developer')
  );
  p_Type_1ea1d0332e85 := 'Allow';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."AuthorizationRole"
                 WHERE "ID" = p_ID_1ea1d0332e85
                    OR ("AuthorizationID" = p_AuthorizationID_1ea1d0332e85 AND "RoleID" = p_RoleID_1ea1d0332e85)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorizationRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_data := jsonb_build_object(
    'ID', p_ID_1ea1d0332e85,
    'AuthorizationID', p_AuthorizationID_1ea1d0332e85,
    'RoleID', p_RoleID_1ea1d0332e85,
    'Type', p_Type_1ea1d0332e85
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_ID := p_ID_1ea1d0332e85, p_AuthorizationID := p_AuthorizationID_1ea1d0332e85, p_RoleID := p_RoleID_1ea1d0332e85, p_Type := p_Type_1ea1d0332e85);
    END IF;
  END IF;
END $mj$;
