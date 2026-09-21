-- =============================================================================================
-- BizApps Orders v5.13.x -- payment-schedule metadata (AIDP-24 / golive #239)
-- =============================================================================================
-- Ships the declarative metadata this feature adds under metadata/, so it reaches a host:
--   * MJ: Remote Operations  -- Orders.GetBillingWorklist, Orders.IssueInstalmentInvoice
--   * MJ: Action Params      -- PaymentScheduleID on Orders.GenerateInvoice
--
-- WHY THIS FILE EXISTS. metadata/ is a dev-time source the install engine never reads; a remote
-- operation with no row in MJ: Remote Operations cannot be executed on any host but the
-- developer's own, and scripts/check-release-seed-coverage.mjs blocks the release until every
-- metadata primary key appears in a migration. Same shape and same reasoning as
-- V202609041700__v5.7.0__PriceOverride_Authorizations_Metadata_Sync.sql.
--
-- The two remote-operation blocks are the exact statements `mj sync push` emitted for these rows
-- (metadata/sql_logging, 2026-09-19), with `[__mj]` -> `[${mjSchema}]` and an ID-or-OperationKey
-- guard so the file is a no-op on a host that already has the row under any ID. The category ID
-- is the literal `Receivables` category this app's v5.3.x Metadata_Sync created. If the build
-- engineer's consolidated release Metadata_Sync carries these rows too, both are idempotent.
-- =============================================================================================

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_7fbac177 UNIQUEIDENTIFIER,
@Name_7fbac177 NVARCHAR(255),
@OperationKey_7fbac177 NVARCHAR(255),
@CategoryID_7fbac177 UNIQUEIDENTIFIER,
@Description_7fbac177 NVARCHAR(MAX),
@InputTypeName_7fbac177 NVARCHAR(255),
@InputTypeDefinition_7fbac177 NVARCHAR(MAX),
@InputTypeIsArray_7fbac177 BIT,
@OutputTypeName_7fbac177 NVARCHAR(255),
@OutputTypeDefinition_7fbac177 NVARCHAR(MAX),
@OutputTypeIsArray_7fbac177 BIT,
@ExecutionMode_7fbac177 NVARCHAR(20),
@RequiredScope_7fbac177 NVARCHAR(255),
@RequiresSystemUser_7fbac177 BIT,
@GenerationType_7fbac177 NVARCHAR(20),
@Code_7fbac177 NVARCHAR(MAX),
@CodeApprovalStatus_7fbac177 NVARCHAR(20),
@CodeApprovedByUserID_7fbac177 UNIQUEIDENTIFIER,
@CodeApprovedAt_7fbac177 DATETIMEOFFSET,
@ContractFingerprint_7fbac177 NVARCHAR(100),
@Status_7fbac177 NVARCHAR(20),
@CacheTTLSeconds_7fbac177 INT,
@TimeoutMS_7fbac177 INT,
@MaxConcurrency_7fbac177 INT,
@CodeLocked_7fbac177 BIT,
@CodeComments_7fbac177 NVARCHAR(MAX),
@Libraries_7fbac177 NVARCHAR(MAX)
SET
  @ID_7fbac177 = 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C430'
SET
  @Name_7fbac177 = N'Get Billing Worklist'
SET
  @OperationKey_7fbac177 = N'Orders.GetBillingWorklist'
SET
  @CategoryID_7fbac177 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305'
SET
  @Description_7fbac177 = N'The due-with-no-invoice control: every Scheduled instalment whose due date falls inside the billing window, earliest first. An instalment that has entered its window and has no invoice behind it must surface on its own — no tracker, no diary note, nobody remembering in December 2028. Computed at read time from the schedule rows because the window moves with the calendar, not with a write.'
SET
  @InputTypeName_7fbac177 = N'OrdersGetBillingWorklistInput'
SET
  @InputTypeDefinition_7fbac177 = N'/**
 * Input for `Orders.GetBillingWorklist`.
 *
 * The due-with-no-invoice control: instalments still `Scheduled` whose due date falls inside
 * the billing window. Computed at read time from the schedule rows, because "inside the window"
 * moves with the calendar rather than with a write — the same reason the overdue worklist is an
 * operation and not a stored flag.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetBillingWorklistInput {
    /** Treat this as "today", `YYYY-MM-DD`. Defaults to today. */
    AsOfDate?: string;
    /** How far ahead to look, in days. Defaults to 30. Zero means "due today or earlier". */
    WindowDays?: number;
    /** Restrict to instalments billed by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
}
'
SET
  @InputTypeIsArray_7fbac177 = 0
SET
  @OutputTypeName_7fbac177 = N'OrdersGetBillingWorklistOutput'
SET
  @OutputTypeDefinition_7fbac177 = N'/**
 * Output for `Orders.GetBillingWorklist`.
 *
 * One row per `Scheduled` instalment due inside the window, earliest first — the order a
 * person should issue them in. Each row carries enough to decide and to act (the schedule row
 * id is what `Orders.IssueInstalmentInvoice` takes) without a second round trip.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface BillingWorklistRow {
    OrderHeaderPaymentScheduleID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    /** 1-based, within the order and company. */
    InstallmentNumber: number;
    /** How many non-cancelled instalments the order has for this company. */
    InstallmentCount: number;
    DueDate: string;
    /** Negative once past due. */
    DaysUntilDue: number;
    Amount: number;
    CompanyID: string;
    CompanyName: string;
    /** Whichever party the order bills — organization wins, else the person. */
    CustomerName: string;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    Description?: string | null;
    /** The order''s status. A Draft order''s instalments are listed but cannot be issued. */
    OrderStatus: string;
}

export interface OrdersGetBillingWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: BillingWorklistRow[];
    /** Sum of Amount over the returned rows. */
    TotalDue: number;
    RowCount: number;
    /** True when `MaxCount` clipped the result. */
    Truncated: boolean;
    /** The window the rows were selected in, echoed so the UI can say what it is showing. */
    AsOfDate: string;
    WindowEnd: string;
}
'
SET
  @OutputTypeIsArray_7fbac177 = 0
SET
  @ExecutionMode_7fbac177 = N'Sync'
SET
  @RequiredScope_7fbac177 = N'orders:read'
SET
  @RequiresSystemUser_7fbac177 = 0
SET
  @GenerationType_7fbac177 = N'Manual'
SET
  @CodeApprovalStatus_7fbac177 = N'Approved'
SET
  @Status_7fbac177 = N'Active'
SET
  @CodeLocked_7fbac177 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_7fbac177
                  OR ([OperationKey] = @OperationKey_7fbac177)
              )
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_7fbac177,
  @Name = @Name_7fbac177,
  @OperationKey = @OperationKey_7fbac177,
  @CategoryID = @CategoryID_7fbac177,
  @Description = @Description_7fbac177,
  @InputTypeName = @InputTypeName_7fbac177,
  @InputTypeDefinition = @InputTypeDefinition_7fbac177,
  @InputTypeIsArray = @InputTypeIsArray_7fbac177,
  @OutputTypeName = @OutputTypeName_7fbac177,
  @OutputTypeDefinition = @OutputTypeDefinition_7fbac177,
  @OutputTypeIsArray = @OutputTypeIsArray_7fbac177,
  @ExecutionMode = @ExecutionMode_7fbac177,
  @RequiredScope = @RequiredScope_7fbac177,
  @RequiresSystemUser = @RequiresSystemUser_7fbac177,
  @GenerationType = @GenerationType_7fbac177,
  @Code = @Code_7fbac177,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_7fbac177,
  @CodeApprovedByUserID = @CodeApprovedByUserID_7fbac177,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_7fbac177,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_7fbac177,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_7fbac177,
  @CacheTTLSeconds = @CacheTTLSeconds_7fbac177,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_7fbac177,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_7fbac177,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_7fbac177,
  @CodeComments = @CodeComments_7fbac177,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_7fbac177,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_c09b026d UNIQUEIDENTIFIER,
@Name_c09b026d NVARCHAR(255),
@OperationKey_c09b026d NVARCHAR(255),
@CategoryID_c09b026d UNIQUEIDENTIFIER,
@Description_c09b026d NVARCHAR(MAX),
@InputTypeName_c09b026d NVARCHAR(255),
@InputTypeDefinition_c09b026d NVARCHAR(MAX),
@InputTypeIsArray_c09b026d BIT,
@OutputTypeName_c09b026d NVARCHAR(255),
@OutputTypeDefinition_c09b026d NVARCHAR(MAX),
@OutputTypeIsArray_c09b026d BIT,
@ExecutionMode_c09b026d NVARCHAR(20),
@RequiredScope_c09b026d NVARCHAR(255),
@RequiresSystemUser_c09b026d BIT,
@GenerationType_c09b026d NVARCHAR(20),
@Code_c09b026d NVARCHAR(MAX),
@CodeApprovalStatus_c09b026d NVARCHAR(20),
@CodeApprovedByUserID_c09b026d UNIQUEIDENTIFIER,
@CodeApprovedAt_c09b026d DATETIMEOFFSET,
@ContractFingerprint_c09b026d NVARCHAR(100),
@Status_c09b026d NVARCHAR(20),
@CacheTTLSeconds_c09b026d INT,
@TimeoutMS_c09b026d INT,
@MaxConcurrency_c09b026d INT,
@CodeLocked_c09b026d BIT,
@CodeComments_c09b026d NVARCHAR(MAX),
@Libraries_c09b026d NVARCHAR(MAX)
SET
  @ID_c09b026d = 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C431'
SET
  @Name_c09b026d = N'Issue Instalment Invoice'
SET
  @OperationKey_c09b026d = N'Orders.IssueInstalmentInvoice'
SET
  @CategoryID_c09b026d = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305'
SET
  @Description_c09b026d = N'Issue one Scheduled instalment: freeze its document number (D87), stamp InvoicedAt and who did it, and advance it to Invoiced. Refuses when the order is not Confirmed or its schedule does not tie to the order''s lines. Idempotent — issuing an instalment already Invoiced returns its number and changes nothing. Calls the AR reclass seam (Unbilled -> AR), which is a documented no-op until AIDP-25 fills it.'
SET
  @InputTypeName_c09b026d = N'OrdersIssueInstalmentInvoiceInput'
SET
  @InputTypeDefinition_c09b026d = N'/**
 * Input for `Orders.IssueInstalmentInvoice`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersIssueInstalmentInvoiceInput {
    /** The `Scheduled` instalment to issue. */
    OrderHeaderPaymentScheduleID: string;
}
'
SET
  @InputTypeIsArray_c09b026d = 0
SET
  @OutputTypeName_c09b026d = N'OrdersIssueInstalmentInvoiceOutput'
SET
  @OutputTypeDefinition_c09b026d = N'/**
 * Output for `Orders.IssueInstalmentInvoice`.
 *
 * Issuing freezes the document number on the row, stamps InvoicedAt and who did it, and
 * advances the row to Invoiced. It is idempotent: issuing an instalment that is already
 * Invoiced returns its existing number with `AlreadyInvoiced: true` and changes nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersIssueInstalmentInvoiceOutput {
    Success: boolean;
    Message?: string;
    OrderHeaderPaymentScheduleID?: string | null;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    InstallmentNumber?: number | null;
    /** The frozen invoice number, e.g. `ORD-1234-2`. */
    DocumentNumber?: string | null;
    InvoicedAt?: string | null;
    Amount?: number | null;
    DueDate?: string | null;
    /** True when the row was already Invoiced and this call changed nothing. */
    AlreadyInvoiced: boolean;
    /**
     * The AR reclass journal entry (Unbilled -> AR). Null until AIDP-25 (#240) fills the
     * `EmitInstalmentReclassEntry` seam; the number, the stamp and the status advance regardless.
     */
    JournalEntryID?: string | null;
}
'
SET
  @OutputTypeIsArray_c09b026d = 0
SET
  @ExecutionMode_c09b026d = N'Sync'
SET
  @RequiredScope_c09b026d = N'orders:write'
SET
  @RequiresSystemUser_c09b026d = 0
SET
  @GenerationType_c09b026d = N'Manual'
SET
  @CodeApprovalStatus_c09b026d = N'Approved'
SET
  @Status_c09b026d = N'Active'
SET
  @CodeLocked_c09b026d = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_c09b026d
                  OR ([OperationKey] = @OperationKey_c09b026d)
              )
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_c09b026d,
  @Name = @Name_c09b026d,
  @OperationKey = @OperationKey_c09b026d,
  @CategoryID = @CategoryID_c09b026d,
  @Description = @Description_c09b026d,
  @InputTypeName = @InputTypeName_c09b026d,
  @InputTypeDefinition = @InputTypeDefinition_c09b026d,
  @InputTypeIsArray = @InputTypeIsArray_c09b026d,
  @OutputTypeName = @OutputTypeName_c09b026d,
  @OutputTypeDefinition = @OutputTypeDefinition_c09b026d,
  @OutputTypeIsArray = @OutputTypeIsArray_c09b026d,
  @ExecutionMode = @ExecutionMode_c09b026d,
  @RequiredScope = @RequiredScope_c09b026d,
  @RequiresSystemUser = @RequiresSystemUser_c09b026d,
  @GenerationType = @GenerationType_c09b026d,
  @Code = @Code_c09b026d,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_c09b026d,
  @CodeApprovedByUserID = @CodeApprovedByUserID_c09b026d,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_c09b026d,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_c09b026d,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_c09b026d,
  @CacheTTLSeconds = @CacheTTLSeconds_c09b026d,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_c09b026d,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_c09b026d,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_c09b026d,
  @CodeComments = @CodeComments_c09b026d,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_c09b026d,
  @Libraries_Clear = 1;

GO

-- Save MJ: Action Params (core SP call only) -- PaymentScheduleID on Orders.GenerateInvoice
DECLARE @ID_ps1 UNIQUEIDENTIFIER,
@ActionID_ps1 UNIQUEIDENTIFIER,
@Name_ps1 NVARCHAR(255),
@DefaultValue_ps1 NVARCHAR(MAX),
@Type_ps1 NCHAR(10),
@ValueType_ps1 NVARCHAR(30),
@IsArray_ps1 BIT,
@Description_ps1 NVARCHAR(MAX),
@IsRequired_ps1 BIT,
@MediaModality_ps1 NVARCHAR(20),
@LogValue_ps1 BIT
SET
  @ID_ps1 = 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C432'
SET
  @ActionID_ps1 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.GenerateInvoice')
SET
  @Name_ps1 = N'PaymentScheduleID'
SET
  @Type_ps1 = N'Input'
SET
  @ValueType_ps1 = N'Scalar'
SET
  @IsArray_ps1 = 0
SET
  @Description_ps1 = N'Render ONE instalment of the order''s payment schedule: that row''s frozen document number, due date and balance, for its company only. Omit for the whole order, which is the implicit single instalment every order without a schedule bills.'
SET
  @IsRequired_ps1 = 0
SET
  @LogValue_ps1 = 1
IF @ActionID_ps1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_ps1
                  OR ([Name] = @Name_ps1 AND [ActionID] = @ActionID_ps1)
              )
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_ps1,
  @ActionID = @ActionID_ps1,
  @Name = @Name_ps1,
  @DefaultValue = @DefaultValue_ps1,
  @DefaultValue_Clear = 1,
  @Type = @Type_ps1,
  @ValueType = @ValueType_ps1,
  @IsArray = @IsArray_ps1,
  @Description = @Description_ps1,
  @IsRequired = @IsRequired_ps1,
  @MediaModality = @MediaModality_ps1,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_ps1;
GO
