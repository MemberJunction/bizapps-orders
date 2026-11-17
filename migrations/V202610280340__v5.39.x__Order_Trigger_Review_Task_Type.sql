-- =============================================================================================
-- BizApps Orders v5.39.x -- the order review task type, named apart from sales' Order Review
-- =============================================================================================
-- V202610200035 (5.36.x Metadata_Sync) creates task type ORDERS_ORDER_REVIEW as 'Order Review'
-- only when no task type has its ID or Name. bizapps-sales seeds its won-deal type ORDER_REVIEW
-- under that same Name, and UQ_TaskType_Name allows one, so two kinds of host exist:
--
--   * orders 5.36+ installed first: the row exists by ID as 'Order Review', and sales'
--     V202608251930 cannot install over it. The row is renamed.
--   * sales installed first (AIDP Next): the row was skipped, and every order that hits a review
--     trigger is refused for want of its task type. The row is created.
--
-- The release Metadata_Sync cannot do the second: built on a database where the row exists, it
-- emits only spUpdateTaskType, which updates nothing on a host without the row. The values match
-- metadata/task-types/.orders-task-types.json. Idempotent.
-- =============================================================================================
DECLARE @ID UNIQUEIDENTIFIER = '5BFCAA2B-F32E-4657-ABA4-D5C126211454',
@Name NVARCHAR(100) = N'Order Trigger Review',
@Description NVARCHAR(MAX) = N'Review an order that hit a review trigger. Approve to let it confirm, or reject with a note saying what to correct. A change to the order after approval sends it back for review.',
@IconClass NVARCHAR(100) = N'fa-solid fa-magnifying-glass-dollar',
@DefaultPriority NVARCHAR(20) = N'High',
@Code NVARCHAR(50) = N'ORDERS_ORDER_REVIEW',
@NoAction UNIQUEIDENTIFIER = NULL;

UPDATE [__mj_BizAppsTasks].[TaskType] SET [Name] = @Name WHERE [ID] = @ID AND [Name] <> @Name;

IF NOT EXISTS (SELECT 1 FROM [__mj_BizAppsTasks].[TaskType] WHERE [ID] = @ID OR [Name] = @Name OR [Code] = @Code)
EXEC [__mj_BizAppsTasks].spCreateTaskType @ID = @ID,
  @Name = @Name,
  @Description = @Description,
  @IconClass = @IconClass,
  @DefaultPriority = @DefaultPriority,
  @OnAssignActionID = @NoAction,
  @OnAssignActionID_Clear = 1,
  @OnCompleteActionID = @NoAction,
  @OnCompleteActionID_Clear = 1,
  @OnOverdueActionID = @NoAction,
  @OnOverdueActionID_Clear = 1,
  @OnPercentChangeActionID = @NoAction,
  @OnPercentChangeActionID_Clear = 1,
  @IsActive = 1,
  @OnRejectActionID = @NoAction,
  @OnRejectActionID_Clear = 1,
  @OnCancelActionID = @NoAction,
  @OnCancelActionID_Clear = 1,
  @Code = @Code,
  @OnCreateActionID = @NoAction,
  @OnCreateActionID_Clear = 1,
  @OnStatusChangeActionID = @NoAction,
  @OnStatusChangeActionID_Clear = 1,
  @IsApproval = 1;
