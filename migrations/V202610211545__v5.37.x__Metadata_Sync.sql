-- =============================================================================================
-- BizApps Orders v5.37.x -- Metadata_Sync (one per release)
-- =============================================================================================
-- Ships the one metadata row added since 5.36: the ConcessionSelfApprovalEscalation Orders setting
-- (#913, bc-aidp-next-golive#320). Same shape, guard and transforms as V202610200035__v5.36.x: the
-- block below is the one `mj sync push --dir metadata --ci` emits for an ApplicationSetting, with
-- this row's values taken verbatim from metadata/application-settings/.orders-settings.json.
--
-- CREATED:
--   * Setting ConcessionSelfApprovalEscalation, created empty, which keeps the previous behavior.
--
-- The Application resolves on the host by Name. Created only when no setting has its ID or its
-- Name for this app. Idempotent.
-- =============================================================================================
-- Save MJ: Application Settings (core SP call only)
DECLARE @ID_5c169a560698 UNIQUEIDENTIFIER,
@ApplicationID_5c169a560698 UNIQUEIDENTIFIER,
@Name_5c169a560698 NVARCHAR(100),
@Value_5c169a560698 NVARCHAR(MAX),
@Comments_5c169a560698 NVARCHAR(MAX)
SET
  @ID_5c169a560698 = '5C169A56-0698-49DA-A2FC-C8D1DF64FFA3'
SET
  @ApplicationID_5c169a560698 = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'
SET
  @Name_5c169a560698 = N'ConcessionSelfApprovalEscalation'
SET
  @Value_5c169a560698 = N''
SET
  @Comments_5c169a560698 = N'Who decides a concession requested by a holder of its ConcessionLimit rule''s role, who would otherwise approve their own (bc-aidp-next-golive#320). Comma-separated targets, tried in order: CompanyCFO (the order company''s ApprovalCFOUserID in its Accounting Company Profile) or the NAME of an MJ role (its active holders). The first target that names an active user other than the requester is assigned the approval task, and only those users can decide it; the requester never is. When no target names anyone else, the concession is refused. Empty keeps the previous behavior: the requester''s own concession is approved on save.'
SELECT TOP 1 @ApplicationID_5c169a560698 = [ID] FROM [${mjSchema}].[Application] WHERE [Name] = N'__mj_BizAppsOrders' ORDER BY CASE WHEN [ID] = @ApplicationID_5c169a560698 THEN 0 ELSE 1 END
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ApplicationSetting]
               WHERE [ID] = @ID_5c169a560698
                  OR ([ApplicationID] = @ApplicationID_5c169a560698 AND [Name] = @Name_5c169a560698))
EXEC [${mjSchema}].spCreateApplicationSetting @ID = @ID_5c169a560698,
  @ApplicationID = @ApplicationID_5c169a560698,
  @Name = @Name_5c169a560698,
  @Value = @Value_5c169a560698,
  @Comments = @Comments_5c169a560698;

GO
