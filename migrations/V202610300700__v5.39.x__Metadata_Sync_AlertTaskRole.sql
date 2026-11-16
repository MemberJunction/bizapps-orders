-- =============================================================================================
-- BizApps Orders v5.39.x -- Metadata_Sync, second part: the AlertTaskRole setting
-- =============================================================================================
-- Ships the one metadata row #987 added after V202610300200__v5.39.x__Metadata_Sync was cut: the
-- AlertTaskRole Orders setting. Same shape, guard and transforms as V202610211545__v5.37.x: the
-- block below is the one `mj sync push --dir metadata --ci` emits for an ApplicationSetting, with
-- this row's values taken verbatim from metadata/application-settings/.orders-settings.json.
--
-- CREATED:
--   * Setting AlertTaskRole, created empty: alert Tasks stay unassigned, as before.
--
-- The Application resolves on the host by Name. Created only when no setting has its ID or its
-- Name for this app. Idempotent.
-- =============================================================================================
-- Save MJ: Application Settings (core SP call only)
DECLARE @ID_9b5424d7102d UNIQUEIDENTIFIER,
@ApplicationID_9b5424d7102d UNIQUEIDENTIFIER,
@Name_9b5424d7102d NVARCHAR(100),
@Value_9b5424d7102d NVARCHAR(MAX),
@Comments_9b5424d7102d NVARCHAR(MAX)
SET
  @ID_9b5424d7102d = '9B5424D7-102D-4F00-A569-8D8B6E92C10E'
SET
  @ApplicationID_9b5424d7102d = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'
SET
  @Name_9b5424d7102d = N'AlertTaskRole'
SET
  @Value_9b5424d7102d = N''
SET
  @Comments_9b5424d7102d = N'The NAME of the MJ role whose active holders are assigned every alert Task Orders raises (a checkout payment not booked, a settled payment with no order, a dead-lettered outbound delivery), so the tasks app notifies a person. Empty, alerts are raised unassigned. A name that is not a role, or a role with no active holder, leaves the alert unassigned and logs why.'
SELECT TOP 1 @ApplicationID_9b5424d7102d = [ID] FROM [${mjSchema}].[Application] WHERE [Name] = N'__mj_BizAppsOrders' ORDER BY CASE WHEN [ID] = @ApplicationID_9b5424d7102d THEN 0 ELSE 1 END
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ApplicationSetting]
               WHERE [ID] = @ID_9b5424d7102d
                  OR ([ApplicationID] = @ApplicationID_9b5424d7102d AND [Name] = @Name_9b5424d7102d))
EXEC [${mjSchema}].spCreateApplicationSetting @ID = @ID_9b5424d7102d,
  @ApplicationID = @ApplicationID_9b5424d7102d,
  @Name = @Name_9b5424d7102d,
  @Value = @Value_9b5424d7102d,
  @Comments = @Comments_9b5424d7102d;

GO
