-- =============================================================================================
-- PostgreSQL counterpart of V202610280340__v5.39.x__Order_Trigger_Review_Task_Type.sql
-- =============================================================================================
-- Same rename-or-create as the T-SQL file; see its header for why. The create calls
-- spCreateTaskType in whichever signature the host has (jsonb or named parameters), as
-- V202610200035's counterpart does.
-- =============================================================================================

SET standard_conforming_strings = on;

DO $mj$
DECLARE
  p_ID UUID := '5BFCAA2B-F32E-4657-ABA4-D5C126211454';
  p_Name VARCHAR(100) := 'Order Trigger Review';
  p_Description TEXT := 'Review an order that hit a review trigger. Approve to let it confirm, or reject with a note saying what to correct. A change to the order after approval sends it back for review.';
  p_IconClass VARCHAR(100) := 'fa-solid fa-magnifying-glass-dollar';
  p_DefaultPriority VARCHAR(20) := 'High';
  p_Code VARCHAR(50) := 'ORDERS_ORDER_REVIEW';
  p_NoAction UUID := NULL;
BEGIN
  UPDATE __mj_BizAppsTasks."TaskType" SET "Name" = p_Name WHERE "ID" = p_ID AND "Name" <> p_Name;

  IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsTasks."TaskType" WHERE "ID" = p_ID OR "Name" = p_Name OR "Code" = p_Code) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '__mj_BizAppsTasks' AND p.proname = 'spCreateTaskType'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_data := jsonb_build_object(
      'ID', p_ID,
      'Name', p_Name,
      'Description', p_Description,
      'IconClass', p_IconClass,
      'DefaultPriority', p_DefaultPriority,
      'OnAssignActionID', p_NoAction,
      'OnCompleteActionID', p_NoAction,
      'OnOverdueActionID', p_NoAction,
      'OnPercentChangeActionID', p_NoAction,
      'IsActive', TRUE,
      'OnRejectActionID', p_NoAction,
      'OnCancelActionID', p_NoAction,
      'Code', p_Code,
      'OnCreateActionID', p_NoAction,
      'OnStatusChangeActionID', p_NoAction,
      'IsApproval', TRUE
    ));
    ELSE
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_ID := p_ID, p_Name := p_Name, p_Description := p_Description, p_IconClass := p_IconClass, p_DefaultPriority := p_DefaultPriority, p_OnAssignActionID := p_NoAction, p_OnAssignActionID_Clear := TRUE, p_OnCompleteActionID := p_NoAction, p_OnCompleteActionID_Clear := TRUE, p_OnOverdueActionID := p_NoAction, p_OnOverdueActionID_Clear := TRUE, p_OnPercentChangeActionID := p_NoAction, p_OnPercentChangeActionID_Clear := TRUE, p_IsActive := TRUE, p_OnRejectActionID := p_NoAction, p_OnRejectActionID_Clear := TRUE, p_OnCancelActionID := p_NoAction, p_OnCancelActionID_Clear := TRUE, p_Code := p_Code, p_OnCreateActionID := p_NoAction, p_OnCreateActionID_Clear := TRUE, p_OnStatusChangeActionID := p_NoAction, p_OnStatusChangeActionID_Clear := TRUE, p_IsApproval := TRUE);
    END IF;
  END IF;
END $mj$;
