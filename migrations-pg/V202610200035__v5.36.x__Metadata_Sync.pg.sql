-- =============================================================================================
-- PostgreSQL counterpart of V202610200035__v5.36.x__Metadata_Sync.sql -- BizApps Orders v5.36.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.6) on the push log the T-SQL file
--     was generated from. Each record is a DO block that calls the core or app function, in
--     whichever signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here from the T-SQL ones, block for block:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Every string value is taken verbatim from the T-SQL file: the converter rewrites T-SQL
--     inside string literals.
--   * Core calls use ${mjSchema}; this app's schema is written as the converter emits it.
-- =============================================================================================

SET standard_conforming_strings = on;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_428c4346838f UUID;
  p_ApplicationID_428c4346838f UUID;
  p_Name_428c4346838f VARCHAR(100);
  p_Value_428c4346838f TEXT;
  p_Comments_428c4346838f TEXT;
BEGIN
  p_ID_428c4346838f := 'E0E1703F-EB3F-4FE9-A5EA-B7472F433FC2';
  p_ApplicationID_428c4346838f := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_428c4346838f := 'OrderReviewTriggers';
  p_Value_428c4346838f := '';
  p_Comments_428c4346838f := 'Comma-separated order review triggers that are switched on (bc-aidp-next-golive#320 section 5): any of NoDeal, PriceVariance, ChangedAfterDealOrReview, OverThreshold, ServicePeriod. A Direct order that hits one cannot confirm until the reviewer role approves its review task. Empty switches review off, so orders confirm as before. An entry that names no trigger refuses every reviewed confirm until it is corrected.';
  p_ApplicationID_428c4346838f := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_428c4346838f THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_428c4346838f);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_428c4346838f
                  OR ("ApplicationID" = p_ApplicationID_428c4346838f AND "Name" = p_Name_428c4346838f)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_428c4346838f,
      'ApplicationID', p_ApplicationID_428c4346838f,
      'Name', p_Name_428c4346838f,
      'Value', p_Value_428c4346838f,
      'Comments', p_Comments_428c4346838f
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_428c4346838f, p_ApplicationID := p_ApplicationID_428c4346838f, p_Name := p_Name_428c4346838f, p_Value := p_Value_428c4346838f, p_Comments := p_Comments_428c4346838f);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_cff38ce51438 UUID;
  p_ApplicationID_cff38ce51438 UUID;
  p_Name_cff38ce51438 VARCHAR(100);
  p_Value_cff38ce51438 TEXT;
  p_Comments_cff38ce51438 TEXT;
BEGIN
  p_ID_cff38ce51438 := 'CFABC5D2-09D9-467D-BEFB-028F41189DAC';
  p_ApplicationID_cff38ce51438 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_cff38ce51438 := 'OrderReviewTotalThreshold';
  p_Value_cff38ce51438 := '';
  p_Comments_cff38ce51438 := 'The net order total (lines after discounts, before tax and charges) above which the OverThreshold trigger sends an order to review, for example 25000. Required when OverThreshold is listed in OrderReviewTriggers; empty or unreadable then refuses reviewed confirms.';
  p_ApplicationID_cff38ce51438 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_cff38ce51438 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_cff38ce51438);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_cff38ce51438
                  OR ("ApplicationID" = p_ApplicationID_cff38ce51438 AND "Name" = p_Name_cff38ce51438)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_cff38ce51438,
      'ApplicationID', p_ApplicationID_cff38ce51438,
      'Name', p_Name_cff38ce51438,
      'Value', p_Value_cff38ce51438,
      'Comments', p_Comments_cff38ce51438
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_cff38ce51438, p_ApplicationID := p_ApplicationID_cff38ce51438, p_Name := p_Name_cff38ce51438, p_Value := p_Value_cff38ce51438, p_Comments := p_Comments_cff38ce51438);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_c35a108d9f95 UUID;
  p_ApplicationID_c35a108d9f95 UUID;
  p_Name_c35a108d9f95 VARCHAR(100);
  p_Value_c35a108d9f95 TEXT;
  p_Comments_c35a108d9f95 TEXT;
BEGIN
  p_ID_c35a108d9f95 := '6673D85A-ADA7-4ADA-AE6C-27FBD084CE0C';
  p_ApplicationID_c35a108d9f95 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_c35a108d9f95 := 'OrderReviewServiceStartMonths';
  p_Value_c35a108d9f95 := '13';
  p_Comments_c35a108d9f95 := 'The ServicePeriod trigger sends an order to review when a line''s service starts more than this many months after today. A whole number of 1 or more; anything else falls back to 13.';
  p_ApplicationID_c35a108d9f95 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_c35a108d9f95 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_c35a108d9f95);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_c35a108d9f95
                  OR ("ApplicationID" = p_ApplicationID_c35a108d9f95 AND "Name" = p_Name_c35a108d9f95)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_c35a108d9f95,
      'ApplicationID', p_ApplicationID_c35a108d9f95,
      'Name', p_Name_c35a108d9f95,
      'Value', p_Value_c35a108d9f95,
      'Comments', p_Comments_c35a108d9f95
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_c35a108d9f95, p_ApplicationID := p_ApplicationID_c35a108d9f95, p_Name := p_Name_c35a108d9f95, p_Value := p_Value_c35a108d9f95, p_Comments := p_Comments_c35a108d9f95);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_6fb51ab832ea UUID;
  p_ApplicationID_6fb51ab832ea UUID;
  p_Name_6fb51ab832ea VARCHAR(100);
  p_Value_6fb51ab832ea TEXT;
  p_Comments_6fb51ab832ea TEXT;
BEGIN
  p_ID_6fb51ab832ea := 'E243DD22-299B-4372-802D-B8B201B20D95';
  p_ApplicationID_6fb51ab832ea := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_6fb51ab832ea := 'OrderReviewLineTermMonths';
  p_Value_6fb51ab832ea := '12';
  p_Comments_6fb51ab832ea := 'The ServicePeriod trigger sends an order to review when a line''s service period covers more than this many months (a twelve-month term runs Jan 1 to Dec 31). A whole number of 1 or more; anything else falls back to 12.';
  p_ApplicationID_6fb51ab832ea := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_6fb51ab832ea THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_6fb51ab832ea);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_6fb51ab832ea
                  OR ("ApplicationID" = p_ApplicationID_6fb51ab832ea AND "Name" = p_Name_6fb51ab832ea)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_6fb51ab832ea,
      'ApplicationID', p_ApplicationID_6fb51ab832ea,
      'Name', p_Name_6fb51ab832ea,
      'Value', p_Value_6fb51ab832ea,
      'Comments', p_Comments_6fb51ab832ea
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_6fb51ab832ea, p_ApplicationID := p_ApplicationID_6fb51ab832ea, p_Name := p_Name_6fb51ab832ea, p_Value := p_Value_6fb51ab832ea, p_Comments := p_Comments_6fb51ab832ea);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_47cdb87f2d5d UUID;
  p_ApplicationID_47cdb87f2d5d UUID;
  p_Name_47cdb87f2d5d VARCHAR(100);
  p_Value_47cdb87f2d5d TEXT;
  p_Comments_47cdb87f2d5d TEXT;
BEGIN
  p_ID_47cdb87f2d5d := '88AF29A8-A9DD-4AF3-A178-D683A59EA83B';
  p_ApplicationID_47cdb87f2d5d := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_47cdb87f2d5d := 'OrderReviewerRole';
  p_Value_47cdb87f2d5d := '';
  p_Comments_47cdb87f2d5d := 'The NAME of the MJ role whose active holders review an order that hit a review trigger. Each is assigned the ORDERS_ORDER_REVIEW task through the active Person linked to their user; the order''s creator never is. Required once any trigger is switched on.';
  p_ApplicationID_47cdb87f2d5d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_47cdb87f2d5d THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_47cdb87f2d5d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_47cdb87f2d5d
                  OR ("ApplicationID" = p_ApplicationID_47cdb87f2d5d AND "Name" = p_Name_47cdb87f2d5d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_47cdb87f2d5d,
      'ApplicationID', p_ApplicationID_47cdb87f2d5d,
      'Name', p_Name_47cdb87f2d5d,
      'Value', p_Value_47cdb87f2d5d,
      'Comments', p_Comments_47cdb87f2d5d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_47cdb87f2d5d, p_ApplicationID := p_ApplicationID_47cdb87f2d5d, p_Name := p_Name_47cdb87f2d5d, p_Value := p_Value_47cdb87f2d5d, p_Comments := p_Comments_47cdb87f2d5d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_0d02c70b7e4c UUID;
  p_ApplicationID_0d02c70b7e4c UUID;
  p_Name_0d02c70b7e4c VARCHAR(100);
  p_Value_0d02c70b7e4c TEXT;
  p_Comments_0d02c70b7e4c TEXT;
BEGIN
  p_ID_0d02c70b7e4c := 'CF0D3A86-3836-42D2-AFC3-69A7CD78480B';
  p_ApplicationID_0d02c70b7e4c := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_0d02c70b7e4c := 'OrderReviewEscalationRole';
  p_Value_0d02c70b7e4c := '';
  p_Comments_0d02c70b7e4c := 'The NAME of the MJ role whose active holders review an order that a holder of OrderReviewerRole created, since nobody reviews their own order. Empty refuses such an order''s confirm.';
  p_ApplicationID_0d02c70b7e4c := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_0d02c70b7e4c THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_0d02c70b7e4c);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_0d02c70b7e4c
                  OR ("ApplicationID" = p_ApplicationID_0d02c70b7e4c AND "Name" = p_Name_0d02c70b7e4c)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_0d02c70b7e4c,
      'ApplicationID', p_ApplicationID_0d02c70b7e4c,
      'Name', p_Name_0d02c70b7e4c,
      'Value', p_Value_0d02c70b7e4c,
      'Comments', p_Comments_0d02c70b7e4c
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_0d02c70b7e4c, p_ApplicationID := p_ApplicationID_0d02c70b7e4c, p_Name := p_Name_0d02c70b7e4c, p_Value := p_Value_0d02c70b7e4c, p_Comments := p_Comments_0d02c70b7e4c);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_781d88cd4b40 UUID;
  p_ApplicationID_781d88cd4b40 UUID;
  p_Name_781d88cd4b40 VARCHAR(100);
  p_Value_781d88cd4b40 TEXT;
  p_Comments_781d88cd4b40 TEXT;
BEGIN
  p_ID_781d88cd4b40 := 'AC8E2930-5EEB-4490-986A-37E7C1B30FD8';
  p_ApplicationID_781d88cd4b40 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_781d88cd4b40 := 'RefundApprovalThreshold';
  p_Value_781d88cd4b40 := '';
  p_Comments_781d88cd4b40 := 'The amount at or below which a refund may be issued by a holder of the RefundApproverRole role (bc-aidp-next-golive#320). Above it, only the receiving company''s approver (ApprovalCFOUserID on its Accounting Company Profile) may issue the refund. The amount compared is what the payment''s refunds come to with the new one, so a refund cannot be split to pass. It is counted per payment, not per order: an order settled by three 400 payments under a 500 threshold can be fully refunded, 1200, by a role holder taking one payment at a time. The company approver may always refund; a deactivated approver counts as none. A refund the payment gateway already made, booked by the system user, is exempt. Empty, the default, switches the check off. A value that is not a number of 0 or more is read as 0, so every refund needs the company approver.';
  p_ApplicationID_781d88cd4b40 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_781d88cd4b40 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_781d88cd4b40);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_781d88cd4b40
                  OR ("ApplicationID" = p_ApplicationID_781d88cd4b40 AND "Name" = p_Name_781d88cd4b40)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_781d88cd4b40,
      'ApplicationID', p_ApplicationID_781d88cd4b40,
      'Name', p_Name_781d88cd4b40,
      'Value', p_Value_781d88cd4b40,
      'Comments', p_Comments_781d88cd4b40
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_781d88cd4b40, p_ApplicationID := p_ApplicationID_781d88cd4b40, p_Name := p_Name_781d88cd4b40, p_Value := p_Value_781d88cd4b40, p_Comments := p_Comments_781d88cd4b40);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_8317e35cda86 UUID;
  p_ApplicationID_8317e35cda86 UUID;
  p_Name_8317e35cda86 VARCHAR(100);
  p_Value_8317e35cda86 TEXT;
  p_Comments_8317e35cda86 TEXT;
BEGIN
  p_ID_8317e35cda86 := '495299D2-D154-4F0B-9C9B-A4A3D7CDE526';
  p_ApplicationID_8317e35cda86 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_8317e35cda86 := 'RefundApproverRole';
  p_Value_8317e35cda86 := '';
  p_Comments_8317e35cda86 := 'The NAME of the MJ role whose holders may issue a refund at or below RefundApprovalThreshold (bc-aidp-next-golive#320). Empty, only the receiving company''s approver may refund while the threshold is set. A name that is not a role refuses every refund that needs it, with a message naming this setting.';
  p_ApplicationID_8317e35cda86 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_8317e35cda86 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_8317e35cda86);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_8317e35cda86
                  OR ("ApplicationID" = p_ApplicationID_8317e35cda86 AND "Name" = p_Name_8317e35cda86)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_8317e35cda86,
      'ApplicationID', p_ApplicationID_8317e35cda86,
      'Name', p_Name_8317e35cda86,
      'Value', p_Value_8317e35cda86,
      'Comments', p_Comments_8317e35cda86
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_8317e35cda86, p_ApplicationID := p_ApplicationID_8317e35cda86, p_Name := p_Name_8317e35cda86, p_Value := p_Value_8317e35cda86, p_Comments := p_Comments_8317e35cda86);
    END IF;
  END IF;
END $mj$;

-- Save MJ_BizApps_Tasks: Task Types (core SP call only)
DO $mj$
DECLARE
  p_ID_c84fb1d99de3 UUID;
  p_Name_c84fb1d99de3 VARCHAR(100);
  p_Description_c84fb1d99de3 TEXT;
  p_IconClass_c84fb1d99de3 VARCHAR(100);
  p_DefaultPriority_c84fb1d99de3 VARCHAR(20);
  p_OnAssignActionID_c84fb1d99de3 UUID;
  p_OnCompleteActionID_c84fb1d99de3 UUID;
  p_OnOverdueActionID_c84fb1d99de3 UUID;
  p_OnPercentChangeActionID_c84fb1d99de3 UUID;
  p_IsActive_c84fb1d99de3 BOOLEAN;
  p_OnRejectActionID_c84fb1d99de3 UUID;
  p_OnCancelActionID_c84fb1d99de3 UUID;
  p_Code_c84fb1d99de3 VARCHAR(50);
  p_OnCreateActionID_c84fb1d99de3 UUID;
  p_OnStatusChangeActionID_c84fb1d99de3 UUID;
  p_IsApproval_c84fb1d99de3 BOOLEAN;
BEGIN
  p_ID_c84fb1d99de3 := '5BFCAA2B-F32E-4657-ABA4-D5C126211454';
  p_Name_c84fb1d99de3 := 'Order Review';
  p_Description_c84fb1d99de3 := 'Review an order that hit a review trigger. Approve to let it confirm, or reject with a note saying what to correct. A change to the order after approval sends it back for review.';
  p_IconClass_c84fb1d99de3 := 'fa-solid fa-magnifying-glass-dollar';
  p_DefaultPriority_c84fb1d99de3 := 'High';
  p_IsActive_c84fb1d99de3 := TRUE;
  p_Code_c84fb1d99de3 := 'ORDERS_ORDER_REVIEW';
  p_IsApproval_c84fb1d99de3 := TRUE;
  IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsTasks."TaskType" WHERE "ID" = p_ID_c84fb1d99de3 OR "Name" = p_Name_c84fb1d99de3) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '__mj_BizAppsTasks' AND p.proname = 'spCreateTaskType'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_data := jsonb_build_object(
      'ID', p_ID_c84fb1d99de3,
      'Name', p_Name_c84fb1d99de3,
      'Description', p_Description_c84fb1d99de3,
      'IconClass', p_IconClass_c84fb1d99de3,
      'DefaultPriority', p_DefaultPriority_c84fb1d99de3,
      'OnAssignActionID', p_OnAssignActionID_c84fb1d99de3,
      'OnCompleteActionID', p_OnCompleteActionID_c84fb1d99de3,
      'OnOverdueActionID', p_OnOverdueActionID_c84fb1d99de3,
      'OnPercentChangeActionID', p_OnPercentChangeActionID_c84fb1d99de3,
      'IsActive', p_IsActive_c84fb1d99de3,
      'OnRejectActionID', p_OnRejectActionID_c84fb1d99de3,
      'OnCancelActionID', p_OnCancelActionID_c84fb1d99de3,
      'Code', p_Code_c84fb1d99de3,
      'OnCreateActionID', p_OnCreateActionID_c84fb1d99de3,
      'OnStatusChangeActionID', p_OnStatusChangeActionID_c84fb1d99de3,
      'IsApproval', p_IsApproval_c84fb1d99de3
    ));
    ELSE
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_ID := p_ID_c84fb1d99de3, p_Name := p_Name_c84fb1d99de3, p_Description := p_Description_c84fb1d99de3, p_IconClass := p_IconClass_c84fb1d99de3, p_DefaultPriority := p_DefaultPriority_c84fb1d99de3, p_OnAssignActionID := p_OnAssignActionID_c84fb1d99de3, p_OnAssignActionID_Clear := TRUE, p_OnCompleteActionID := p_OnCompleteActionID_c84fb1d99de3, p_OnCompleteActionID_Clear := TRUE, p_OnOverdueActionID := p_OnOverdueActionID_c84fb1d99de3, p_OnOverdueActionID_Clear := TRUE, p_OnPercentChangeActionID := p_OnPercentChangeActionID_c84fb1d99de3, p_OnPercentChangeActionID_Clear := TRUE, p_IsActive := p_IsActive_c84fb1d99de3, p_OnRejectActionID := p_OnRejectActionID_c84fb1d99de3, p_OnRejectActionID_Clear := TRUE, p_OnCancelActionID := p_OnCancelActionID_c84fb1d99de3, p_OnCancelActionID_Clear := TRUE, p_Code := p_Code_c84fb1d99de3, p_OnCreateActionID := p_OnCreateActionID_c84fb1d99de3, p_OnCreateActionID_Clear := TRUE, p_OnStatusChangeActionID := p_OnStatusChangeActionID_c84fb1d99de3, p_OnStatusChangeActionID_Clear := TRUE, p_IsApproval := p_IsApproval_c84fb1d99de3);
    END IF;
  END IF;
END $mj$;
