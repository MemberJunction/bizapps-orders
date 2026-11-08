-- =============================================================================================
-- PostgreSQL counterpart of V202610300700__v5.39.x__Metadata_Sync_AlertTaskRole.sql -- BizApps Orders v5.39.x
-- =============================================================================================
-- Same record, same values as the T-SQL file; written block for block from the 5.37 counterpart
-- (V202610211545__v5.37.x__Metadata_Sync.pg.sql). String values are verbatim from the T-SQL file.
-- =============================================================================================

SET standard_conforming_strings = on;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_9b5424d7102d UUID;
  p_ApplicationID_9b5424d7102d UUID;
  p_Name_9b5424d7102d VARCHAR(100);
  p_Value_9b5424d7102d TEXT;
  p_Comments_9b5424d7102d TEXT;
BEGIN
  p_ID_9b5424d7102d := '9B5424D7-102D-4F00-A569-8D8B6E92C10E';
  p_ApplicationID_9b5424d7102d := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_9b5424d7102d := 'AlertTaskRole';
  p_Value_9b5424d7102d := '';
  p_Comments_9b5424d7102d := 'The NAME of the MJ role whose active holders are assigned every alert Task Orders raises (a checkout payment not booked, a settled payment with no order, a dead-lettered outbound delivery), so the tasks app notifies a person. Empty, alerts are raised unassigned. A name that is not a role, or a role with no active holder, leaves the alert unassigned and logs why.';
  p_ApplicationID_9b5424d7102d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_9b5424d7102d THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_9b5424d7102d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_9b5424d7102d
                  OR ("ApplicationID" = p_ApplicationID_9b5424d7102d AND "Name" = p_Name_9b5424d7102d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_9b5424d7102d,
      'ApplicationID', p_ApplicationID_9b5424d7102d,
      'Name', p_Name_9b5424d7102d,
      'Value', p_Value_9b5424d7102d,
      'Comments', p_Comments_9b5424d7102d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_9b5424d7102d, p_ApplicationID := p_ApplicationID_9b5424d7102d, p_Name := p_Name_9b5424d7102d, p_Value := p_Value_9b5424d7102d, p_Comments := p_Comments_9b5424d7102d);
    END IF;
  END IF;
END $mj$;
