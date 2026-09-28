-- =============================================================================================
-- BizApps Orders v5.20.x -- Bill.com integration metadata (golive #146 / #147 / #148 / #242)
-- =============================================================================================
-- Ships the declarative metadata this feature adds under metadata/, so it reaches a host:
--   * Payment Provider Types -- BillCom, the type a PaymentProvider row is created against
--   * MJ: Remote Operations  -- the six Orders.*ExternalInvoice* / *ExternalPayments* operations
--   * MJ: Actions            -- the two scheduler adapters, with their 22 params
--   * MJ: Scheduled Jobs     -- the half-hourly send and the hourly poll
--
-- WHY THIS FILE EXISTS. metadata/ is a dev-time source the install engine never reads
-- (`mj app install` runs migrations and nothing else), so a remote operation with no row in
-- MJ: Remote Operations cannot be executed on any host but the developer's own, an Action with
-- no row is a DriverClass the scheduler never dispatches, and a PaymentProvider row cannot be
-- created at all without its type. scripts/check-release-seed-coverage.mjs blocks the release
-- until every metadata primary key appears in a migration. Same shape and same reasoning as
-- V202609211300__v5.13.0__PaymentSchedule_Metadata_Sync.sql, which PR #220 shipped for the same
-- reason one release earlier.
--
-- HOW IT WAS GENERATED. These are the exact statements `mj sync push` emitted for these rows
-- against a database that did not yet have them (2026-09-27), so every one is an spCreate and
-- none is an spUpdate -- an update would overwrite host state, and the release generator refuses
-- them. `[__mj]` became `[${mjSchema}]` and `[__mj_BizAppsOrders]` became
-- `[${flyway:defaultSchema}]`; nothing else in the payloads was edited.
--
-- IDEMPOTENT, AND DELIBERATELY WIDER THAN THE ID. Each create is guarded on the primary key OR
-- the row's natural key -- Code for the provider type, OperationKey for an operation, DriverClass
-- for an Action, (Name, ActionID) for a param, Name for a job -- so a host that already has the
-- row under a different ID is left alone rather than given a duplicate. Two consequences follow
-- from that, both intentional:
--   * An ActionParam resolves its parent by DriverClass rather than trusting the literal ActionID,
--     because the Action guard may have left an existing row under another ID in place; the param
--     is skipped entirely if no such Action exists.
--   * A ScheduledJob resolves the 'Action' job type by name (falling back to MJ's seeded ID) and
--     is skipped if it cannot be found, rather than failing the migration on an FK.
--
-- BOTH JOBS SHIP Disabled AND IN Preview. Installing this file turns nothing on. Somebody enables
-- the job, reads one preview run, and only then sets Preview to false -- which is the whole reason
-- the webhook route checks the job's own state before it polls.
--
-- If the build engineer's consolidated release Metadata_Sync carries these rows too, both are
-- idempotent and the order they run in does not matter.
-- =============================================================================================

-- Save MJ_BizApps_Orders: Payment Provider Types (core SP call only)
DECLARE @ID_eb82694b UNIQUEIDENTIFIER,
@Code_eb82694b NVARCHAR(40),
@Name_eb82694b NVARCHAR(200),
@Description_eb82694b NVARCHAR(MAX),
@DriverClass_eb82694b NVARCHAR(200),
@SupportsTokenization_eb82694b BIT,
@SupportsRefund_eb82694b BIT,
@SupportsWebhooks_eb82694b BIT,
@Sequence_eb82694b INT,
@IsActive_eb82694b BIT
SET
  @ID_eb82694b = '8B4C2E10-5D93-4A6F-B7C8-1E2F3A4B5C06'
SET
  @Code_eb82694b = N'BillCom'
SET
  @Name_eb82694b = N'Bill.com'
SET
  @Description_eb82694b = N'Bill.com accounts receivable. Invoices are created in Bill.com when a billing unit becomes invoiceable; cleared receivable payments are polled and captured once. Not a checkout rail — no intents, no card capture, no refunds through this type.'
SET
  @DriverClass_eb82694b = N'BillComPaymentProvider'
SET
  @SupportsTokenization_eb82694b = 0
SET
  @SupportsRefund_eb82694b = 0
SET
  @SupportsWebhooks_eb82694b = 0
SET
  @Sequence_eb82694b = 50
SET
  @IsActive_eb82694b = 1
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[PaymentProviderType]
               WHERE [ID] = @ID_eb82694b OR [Code] = @Code_eb82694b)
EXEC [${flyway:defaultSchema}].spCreatePaymentProviderType @ID = @ID_eb82694b,
  @Code = @Code_eb82694b,
  @Name = @Name_eb82694b,
  @Description = @Description_eb82694b,
  @DriverClass = @DriverClass_eb82694b,
  @SupportsTokenization = @SupportsTokenization_eb82694b,
  @SupportsRefund = @SupportsRefund_eb82694b,
  @SupportsWebhooks = @SupportsWebhooks_eb82694b,
  @Sequence = @Sequence_eb82694b,
  @IsActive = @IsActive_eb82694b;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_c3e473cb UNIQUEIDENTIFIER,
@Name_c3e473cb NVARCHAR(255),
@OperationKey_c3e473cb NVARCHAR(255),
@CategoryID_c3e473cb UNIQUEIDENTIFIER,
@Description_c3e473cb NVARCHAR(MAX),
@InputTypeName_c3e473cb NVARCHAR(255),
@InputTypeDefinition_c3e473cb NVARCHAR(MAX),
@InputTypeIsArray_c3e473cb BIT,
@OutputTypeName_c3e473cb NVARCHAR(255),
@OutputTypeDefinition_c3e473cb NVARCHAR(MAX),
@OutputTypeIsArray_c3e473cb BIT,
@ExecutionMode_c3e473cb NVARCHAR(20),
@RequiredScope_c3e473cb NVARCHAR(255),
@RequiresSystemUser_c3e473cb BIT,
@GenerationType_c3e473cb NVARCHAR(20),
@Code_c3e473cb NVARCHAR(MAX),
@CodeApprovalStatus_c3e473cb NVARCHAR(20),
@CodeApprovedByUserID_c3e473cb UNIQUEIDENTIFIER,
@CodeApprovedAt_c3e473cb DATETIMEOFFSET,
@ContractFingerprint_c3e473cb NVARCHAR(100),
@Status_c3e473cb NVARCHAR(20),
@CacheTTLSeconds_c3e473cb INT,
@TimeoutMS_c3e473cb INT,
@MaxConcurrency_c3e473cb INT,
@CodeLocked_c3e473cb BIT,
@CodeComments_c3e473cb NVARCHAR(MAX),
@Libraries_c3e473cb NVARCHAR(MAX)
SET
  @ID_c3e473cb = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A02'
SET
  @Name_c3e473cb = N'Cancel External Invoice'
SET
  @OperationKey_c3e473cb = N'Orders.CancelExternalInvoice'
SET
  @CategoryID_c3e473cb = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_c3e473cb = N'Withdraw an unpaid invoice from the external rail (Bill.com archives it). Blocked when any payment is applied to the unit here or visible on the rail. No accounting event; the unit reads as unsent again and can be re-issued deliberately.'
SET
  @InputTypeName_c3e473cb = N'OrdersCancelExternalInvoiceInput'
SET
  @InputTypeDefinition_c3e473cb = N'/**
 * Input for `Orders.CancelExternalInvoice`.
 *
 * Withdraw an UNPAID invoice from the external rail (Bill.com archives it). Blocked when any payment
 * has been applied to the unit here, or when the rail shows money applied that has not been polled
 * yet — a paid invoice follows the refund path, not this one (golive #147).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCancelExternalInvoiceInput {
    /** The Sent ExternalInvoice row to withdraw. */
    ExternalInvoiceID: string;
    /** Why, in the person''s words. Recorded on the row. */
    Reason: string;
}
'
SET
  @InputTypeIsArray_c3e473cb = 0
SET
  @OutputTypeName_c3e473cb = N'OrdersCancelExternalInvoiceOutput'
SET
  @OutputTypeDefinition_c3e473cb = N'/**
 * Output for `Orders.CancelExternalInvoice`.
 *
 * Cancellation is an invoice-lifecycle act, not an accounting event: no journal entry, no change to
 * the order or the instalment. The instalment''s SentAt returns to NULL so it reads as unsent again.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersCancelExternalInvoiceResultCode =
    | ''CANCELED''
    | ''NOT_SENT''
    | ''HAS_PAYMENT''
    | ''PAYMENT_PENDING_ON_RAIL''
    | ''RAIL_REFUSED''
    | ''ERROR'';

export interface OrdersCancelExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersCancelExternalInvoiceResultCode;
    ExternalInvoiceID?: string | null;
    CanceledAt?: string | null;
}
'
SET
  @OutputTypeIsArray_c3e473cb = 0
SET
  @ExecutionMode_c3e473cb = N'Sync'
SET
  @RequiredScope_c3e473cb = N'orders:write'
SET
  @RequiresSystemUser_c3e473cb = 0
SET
  @GenerationType_c3e473cb = N'Manual'
SET
  @CodeApprovalStatus_c3e473cb = N'Approved'
SET
  @Status_c3e473cb = N'Active'
SET
  @CodeLocked_c3e473cb = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_c3e473cb OR [OperationKey] = @OperationKey_c3e473cb)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_c3e473cb,
  @Name = @Name_c3e473cb,
  @OperationKey = @OperationKey_c3e473cb,
  @CategoryID = @CategoryID_c3e473cb,
  @Description = @Description_c3e473cb,
  @InputTypeName = @InputTypeName_c3e473cb,
  @InputTypeDefinition = @InputTypeDefinition_c3e473cb,
  @InputTypeIsArray = @InputTypeIsArray_c3e473cb,
  @OutputTypeName = @OutputTypeName_c3e473cb,
  @OutputTypeDefinition = @OutputTypeDefinition_c3e473cb,
  @OutputTypeIsArray = @OutputTypeIsArray_c3e473cb,
  @ExecutionMode = @ExecutionMode_c3e473cb,
  @RequiredScope = @RequiredScope_c3e473cb,
  @RequiresSystemUser = @RequiresSystemUser_c3e473cb,
  @GenerationType = @GenerationType_c3e473cb,
  @Code = @Code_c3e473cb,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_c3e473cb,
  @CodeApprovedByUserID = @CodeApprovedByUserID_c3e473cb,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_c3e473cb,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_c3e473cb,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_c3e473cb,
  @CacheTTLSeconds = @CacheTTLSeconds_c3e473cb,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_c3e473cb,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_c3e473cb,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_c3e473cb,
  @CodeComments = @CodeComments_c3e473cb,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_c3e473cb,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_8b4dd6aa UNIQUEIDENTIFIER,
@Name_8b4dd6aa NVARCHAR(255),
@OperationKey_8b4dd6aa NVARCHAR(255),
@CategoryID_8b4dd6aa UNIQUEIDENTIFIER,
@Description_8b4dd6aa NVARCHAR(MAX),
@InputTypeName_8b4dd6aa NVARCHAR(255),
@InputTypeDefinition_8b4dd6aa NVARCHAR(MAX),
@InputTypeIsArray_8b4dd6aa BIT,
@OutputTypeName_8b4dd6aa NVARCHAR(255),
@OutputTypeDefinition_8b4dd6aa NVARCHAR(MAX),
@OutputTypeIsArray_8b4dd6aa BIT,
@ExecutionMode_8b4dd6aa NVARCHAR(20),
@RequiredScope_8b4dd6aa NVARCHAR(255),
@RequiresSystemUser_8b4dd6aa BIT,
@GenerationType_8b4dd6aa NVARCHAR(20),
@Code_8b4dd6aa NVARCHAR(MAX),
@CodeApprovalStatus_8b4dd6aa NVARCHAR(20),
@CodeApprovedByUserID_8b4dd6aa UNIQUEIDENTIFIER,
@CodeApprovedAt_8b4dd6aa DATETIMEOFFSET,
@ContractFingerprint_8b4dd6aa NVARCHAR(100),
@Status_8b4dd6aa NVARCHAR(20),
@CacheTTLSeconds_8b4dd6aa INT,
@TimeoutMS_8b4dd6aa INT,
@MaxConcurrency_8b4dd6aa INT,
@CodeLocked_8b4dd6aa BIT,
@CodeComments_8b4dd6aa NVARCHAR(MAX),
@Libraries_8b4dd6aa NVARCHAR(MAX)
SET
  @ID_8b4dd6aa = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A03'
SET
  @Name_8b4dd6aa = N'Get External Invoicing Worklist'
SET
  @OperationKey_8b4dd6aa = N'Orders.GetExternalInvoicingWorklist'
SET
  @CategoryID_8b4dd6aa = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305'
SET
  @Description_8b4dd6aa = N'Billing units that are invoiceable on a company''s external rail and unsent — Confirmed schedule-less orders with a balance and no rail history, Invoiced instalments with SentAt NULL — plus failed and in-flight sends on request. Companies without an active rail never appear.'
SET
  @InputTypeName_8b4dd6aa = N'OrdersGetExternalInvoicingWorklistInput'
SET
  @InputTypeDefinition_8b4dd6aa = N'/**
 * Input for `Orders.GetExternalInvoicingWorklist`.
 *
 * Every billing unit that is invoiceable on a company''s external rail and has not been sent — a
 * Confirmed schedule-less order with a balance and no rail history, or an Invoiced instalment with
 * SentAt NULL — plus, on request, the units whose last send failed. Companies without an active rail
 * never appear.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetExternalInvoicingWorklistInput {
    /** Restrict to these selling companies. Omit for every company with an active rail. */
    CompanyIDs?: string[];
    /** Cap on rows. Default 200. Truncation is reported, never silent. */
    MaxCount?: number;
    /** Also list units whose last send failed (State ''Failed'') and stuck sends (State ''InFlight''). */
    IncludeFailed?: boolean;
}
'
SET
  @InputTypeIsArray_8b4dd6aa = 0
SET
  @OutputTypeName_8b4dd6aa = N'OrdersGetExternalInvoicingWorklistOutput'
SET
  @OutputTypeDefinition_8b4dd6aa = N'/**
 * Output for `Orders.GetExternalInvoicingWorklist`.
 *
 * Each row carries enough to decide and to act — the unit key is what `Orders.IssueExternalInvoice`
 * takes — without a second round trip.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExternalInvoicingWorklistRow {
    OrderHeaderID: string;
    OrderNumber: string;
    CompanyID: string;
    CompanyName: string;
    /** Null for an order billed as a whole. */
    OrderHeaderPaymentScheduleID: string | null;
    InstallmentNumber: number | null;
    /** The number the rail invoice will carry. */
    DocumentNumber: string;
    Amount: number;
    DueDate: string | null;
    CustomerName: string;
    /** Unsent: never attempted. Failed: last send refused. InFlight: a Sending row with no rail reference. */
    State: ''Unsent'' | ''Failed'' | ''InFlight'';
    /** The ExternalInvoice row behind a Failed or InFlight state. */
    ExternalInvoiceID: string | null;
    LastError: string | null;
    /** When the unit became invoiceable (ConfirmedAt or InvoicedAt), ISO. */
    SinceAt: string | null;
}

export interface OrdersGetExternalInvoicingWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: ExternalInvoicingWorklistRow[];
    RowCount: number;
    /** True when MaxCount clipped the result. */
    Truncated: boolean;
}
'
SET
  @OutputTypeIsArray_8b4dd6aa = 0
SET
  @ExecutionMode_8b4dd6aa = N'Sync'
SET
  @RequiredScope_8b4dd6aa = N'orders:read'
SET
  @RequiresSystemUser_8b4dd6aa = 0
SET
  @GenerationType_8b4dd6aa = N'Manual'
SET
  @CodeApprovalStatus_8b4dd6aa = N'Approved'
SET
  @Status_8b4dd6aa = N'Active'
SET
  @CodeLocked_8b4dd6aa = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_8b4dd6aa OR [OperationKey] = @OperationKey_8b4dd6aa)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_8b4dd6aa,
  @Name = @Name_8b4dd6aa,
  @OperationKey = @OperationKey_8b4dd6aa,
  @CategoryID = @CategoryID_8b4dd6aa,
  @Description = @Description_8b4dd6aa,
  @InputTypeName = @InputTypeName_8b4dd6aa,
  @InputTypeDefinition = @InputTypeDefinition_8b4dd6aa,
  @InputTypeIsArray = @InputTypeIsArray_8b4dd6aa,
  @OutputTypeName = @OutputTypeName_8b4dd6aa,
  @OutputTypeDefinition = @OutputTypeDefinition_8b4dd6aa,
  @OutputTypeIsArray = @OutputTypeIsArray_8b4dd6aa,
  @ExecutionMode = @ExecutionMode_8b4dd6aa,
  @RequiredScope = @RequiredScope_8b4dd6aa,
  @RequiresSystemUser = @RequiresSystemUser_8b4dd6aa,
  @GenerationType = @GenerationType_8b4dd6aa,
  @Code = @Code_8b4dd6aa,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_8b4dd6aa,
  @CodeApprovedByUserID = @CodeApprovedByUserID_8b4dd6aa,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_8b4dd6aa,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_8b4dd6aa,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_8b4dd6aa,
  @CacheTTLSeconds = @CacheTTLSeconds_8b4dd6aa,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_8b4dd6aa,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_8b4dd6aa,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_8b4dd6aa,
  @CodeComments = @CodeComments_8b4dd6aa,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_8b4dd6aa,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_c0a0f740 UNIQUEIDENTIFIER,
@Name_c0a0f740 NVARCHAR(255),
@OperationKey_c0a0f740 NVARCHAR(255),
@CategoryID_c0a0f740 UNIQUEIDENTIFIER,
@Description_c0a0f740 NVARCHAR(MAX),
@InputTypeName_c0a0f740 NVARCHAR(255),
@InputTypeDefinition_c0a0f740 NVARCHAR(MAX),
@InputTypeIsArray_c0a0f740 BIT,
@OutputTypeName_c0a0f740 NVARCHAR(255),
@OutputTypeDefinition_c0a0f740 NVARCHAR(MAX),
@OutputTypeIsArray_c0a0f740 BIT,
@ExecutionMode_c0a0f740 NVARCHAR(20),
@RequiredScope_c0a0f740 NVARCHAR(255),
@RequiresSystemUser_c0a0f740 BIT,
@GenerationType_c0a0f740 NVARCHAR(20),
@Code_c0a0f740 NVARCHAR(MAX),
@CodeApprovalStatus_c0a0f740 NVARCHAR(20),
@CodeApprovedByUserID_c0a0f740 UNIQUEIDENTIFIER,
@CodeApprovedAt_c0a0f740 DATETIMEOFFSET,
@ContractFingerprint_c0a0f740 NVARCHAR(100),
@Status_c0a0f740 NVARCHAR(20),
@CacheTTLSeconds_c0a0f740 INT,
@TimeoutMS_c0a0f740 INT,
@MaxConcurrency_c0a0f740 INT,
@CodeLocked_c0a0f740 BIT,
@CodeComments_c0a0f740 NVARCHAR(MAX),
@Libraries_c0a0f740 NVARCHAR(MAX)
SET
  @ID_c0a0f740 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A05'
SET
  @Name_c0a0f740 = N'Poll External Payments'
SET
  @OperationKey_c0a0f740 = N'Orders.PollExternalPayments'
SET
  @CategoryID_c0a0f740 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_c0a0f740 = N'Read receivable payments from each company''s external AR rail (Bill.com) since the stored watermark and capture every cleared payment exactly once through Orders.CapturePayment, fanned out to the orders its invoices belong to. Unknown statuses are held, unmatched invoices capture nothing, and reversals are flagged for a person. Poll-authoritative: Bill.com publishes no payment-received webhook.'
SET
  @InputTypeName_c0a0f740 = N'OrdersPollExternalPaymentsInput'
SET
  @InputTypeDefinition_c0a0f740 = N'/**
 * Input for `Orders.PollExternalPayments`.
 *
 * Read receivable payments from every company''s external AR rail (Bill.com) since the last
 * watermark, and capture each CLEARED payment exactly once through `Orders.CapturePayment`, applied
 * to the orders its invoices belong to. Poll-authoritative: Bill.com publishes no payment-received
 * webhook (golive #148). Meant for a scheduled job through the `Orders: Poll External Payments` Action.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPollExternalPaymentsInput {
    /** Poll one provider row only. Omit for every active rail provider. */
    PaymentProviderID?: string | null;
    /** Decide everything, write nothing — no payments, no dispositions, no watermark. */
    Preview?: boolean;
    /** Cap on payments considered per provider in one pass. Default 100. The remainder is read next pass. */
    MaxCount?: number;
    /** Override the stored watermark (ISO). For a first run or a deliberate re-read; dedupe by payment id makes re-reading safe. */
    SinceWatermark?: string | null;
}
'
SET
  @InputTypeIsArray_c0a0f740 = 0
SET
  @OutputTypeName_c0a0f740 = N'OrdersPollExternalPaymentsOutput'
SET
  @OutputTypeDefinition_c0a0f740 = N'/**
 * Output for `Orders.PollExternalPayments`.
 *
 * One outcome per payment considered. `ATTENTION` means the pass completed but left Unmatched or
 * ReversalNeeded rows a person must look at — reported as Success false so a job that notifies only
 * on failure tells somebody.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExternalPaymentOutcome {
    PaymentProviderID: string;
    ExternalPaymentRef: string;
    Amount: number;
    ExternalStatus: string | null;
    Disposition: ''Captured'' | ''Held'' | ''Unmatched'' | ''Refused'' | ''Ignored'' | ''Reapplied'' | ''ReversalNeeded'';
    Reason: string;
    PaymentNumber?: string | null;
    PaymentHeaderID?: string | null;
}

export interface OrdersPollExternalPaymentsOutput {
    Success: boolean;
    Message?: string;
    ResultCode: ''COMPLETED'' | ''PREVIEWED'' | ''ATTENTION'' | ''NO_PROVIDERS'' | ''ERROR'';
    Captured: number;
    Held: number;
    Unmatched: number;
    /** Orders.CapturePayment refused the capture (split-company order, ambiguous payer, configuration). Counts as attention. */
    Refused: number;
    /** Captured, then re-applied to different invoices in Bill.com. The cash is right; the allocation here is not. */
    Reapplied: number;
    ReversalNeeded: number;
    Ignored: number;
    Outcomes: ExternalPaymentOutcome[];
    NewWatermarks: Array<{ PaymentProviderID: string; Watermark: string | null }>;
    PreviewedOnly: boolean;
}
'
SET
  @OutputTypeIsArray_c0a0f740 = 0
SET
  @ExecutionMode_c0a0f740 = N'LongRunning'
SET
  @RequiredScope_c0a0f740 = N'orders:write'
SET
  @RequiresSystemUser_c0a0f740 = 0
SET
  @GenerationType_c0a0f740 = N'Manual'
SET
  @CodeApprovalStatus_c0a0f740 = N'Approved'
SET
  @Status_c0a0f740 = N'Active'
SET
  @CodeLocked_c0a0f740 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_c0a0f740 OR [OperationKey] = @OperationKey_c0a0f740)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_c0a0f740,
  @Name = @Name_c0a0f740,
  @OperationKey = @OperationKey_c0a0f740,
  @CategoryID = @CategoryID_c0a0f740,
  @Description = @Description_c0a0f740,
  @InputTypeName = @InputTypeName_c0a0f740,
  @InputTypeDefinition = @InputTypeDefinition_c0a0f740,
  @InputTypeIsArray = @InputTypeIsArray_c0a0f740,
  @OutputTypeName = @OutputTypeName_c0a0f740,
  @OutputTypeDefinition = @OutputTypeDefinition_c0a0f740,
  @OutputTypeIsArray = @OutputTypeIsArray_c0a0f740,
  @ExecutionMode = @ExecutionMode_c0a0f740,
  @RequiredScope = @RequiredScope_c0a0f740,
  @RequiresSystemUser = @RequiresSystemUser_c0a0f740,
  @GenerationType = @GenerationType_c0a0f740,
  @Code = @Code_c0a0f740,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_c0a0f740,
  @CodeApprovedByUserID = @CodeApprovedByUserID_c0a0f740,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_c0a0f740,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_c0a0f740,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_c0a0f740,
  @CacheTTLSeconds = @CacheTTLSeconds_c0a0f740,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_c0a0f740,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_c0a0f740,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_c0a0f740,
  @CodeComments = @CodeComments_c0a0f740,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_c0a0f740,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_b075abfd UNIQUEIDENTIFIER,
@Name_b075abfd NVARCHAR(255),
@OperationKey_b075abfd NVARCHAR(255),
@CategoryID_b075abfd UNIQUEIDENTIFIER,
@Description_b075abfd NVARCHAR(MAX),
@InputTypeName_b075abfd NVARCHAR(255),
@InputTypeDefinition_b075abfd NVARCHAR(MAX),
@InputTypeIsArray_b075abfd BIT,
@OutputTypeName_b075abfd NVARCHAR(255),
@OutputTypeDefinition_b075abfd NVARCHAR(MAX),
@OutputTypeIsArray_b075abfd BIT,
@ExecutionMode_b075abfd NVARCHAR(20),
@RequiredScope_b075abfd NVARCHAR(255),
@RequiresSystemUser_b075abfd BIT,
@GenerationType_b075abfd NVARCHAR(20),
@Code_b075abfd NVARCHAR(MAX),
@CodeApprovalStatus_b075abfd NVARCHAR(20),
@CodeApprovedByUserID_b075abfd UNIQUEIDENTIFIER,
@CodeApprovedAt_b075abfd DATETIMEOFFSET,
@ContractFingerprint_b075abfd NVARCHAR(100),
@Status_b075abfd NVARCHAR(20),
@CacheTTLSeconds_b075abfd INT,
@TimeoutMS_b075abfd INT,
@MaxConcurrency_b075abfd INT,
@CodeLocked_b075abfd BIT,
@CodeComments_b075abfd NVARCHAR(MAX),
@Libraries_b075abfd NVARCHAR(MAX)
SET
  @ID_b075abfd = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A01'
SET
  @Name_b075abfd = N'Issue External Invoice'
SET
  @OperationKey_b075abfd = N'Orders.IssueExternalInvoice'
SET
  @CategoryID_b075abfd = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_b075abfd = N'Create one billing unit''s invoice on the company''s external AR rail (Bill.com): a Confirmed order billed as a whole, per selling company, or one Invoiced instalment. Idempotent per unit — a unit already on the rail returns its existing reference. Records the rail''s invoice id on ExternalInvoice (authoritative) and on the instalment row; never touches Balance, PaymentStatus or the ledger.'
SET
  @InputTypeName_b075abfd = N'OrdersIssueExternalInvoiceInput'
SET
  @InputTypeDefinition_b075abfd = N'/**
 * Input for `Orders.IssueExternalInvoice`.
 *
 * One BILLING UNIT → one invoice on the company''s external AR rail (Bill.com). A unit is an order
 * billed as a whole for one selling company, or one Invoiced instalment of an order billed on a
 * schedule. The operation is idempotent per unit: a second call for a unit that is already on the
 * rail returns the existing reference and changes nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersIssueExternalInvoiceInput {
    /** The order the unit bills. */
    OrderHeaderID: string;
    /**
     * The selling company of the document. Optional when the order sells for exactly one company or
     * when an instalment is named (the instalment carries its company). Required for a schedule-less
     * order that sells for several companies.
     */
    CompanyID?: string | null;
    /** The Invoiced instalment to send, for an order billed on a schedule. Omit for an order billed as a whole. */
    OrderHeaderPaymentScheduleID?: string | null;
    /** Build and return the payload without contacting the rail or writing anything. */
    Preview?: boolean;
    /**
     * Send a unit whose previous rail invoice was cancelled or whose send failed permanently.
     * Re-issuing is a deliberate human act (design D-B7); the sweep never sets this for a cancelled unit.
     */
    AllowReissue?: boolean;
}
'
SET
  @InputTypeIsArray_b075abfd = 0
SET
  @OutputTypeName_b075abfd = N'OrdersIssueExternalInvoiceOutput'
SET
  @OutputTypeDefinition_b075abfd = N'/**
 * Output for `Orders.IssueExternalInvoice`.
 *
 * `ResultCode` says what happened in a word the UI and the sweep can branch on; `Message` says it in
 * a sentence a person can act on. Issuance never changes the order''s Balance or PaymentStatus and
 * books no journal entry — payment is a separate event (golive #146).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersIssueExternalInvoiceResultCode =
    | ''SENT''
    | ''ALREADY_SENT''
    | ''PREVIEWED''
    | ''NO_RAIL''
    | ''IN_FLIGHT''
    | ''HAS_HISTORY''
    | ''NOT_CONFIRMED''
    | ''NAME_THE_INSTALMENT''
    | ''NAME_THE_COMPANY''
    | ''INSTALMENT_NOT_INVOICED''
    | ''NO_CUSTOMER_EMAIL''
    | ''TIE_FAILED''
    | ''PART_PAID''
    | ''NOT_INVOICEABLE''
    | ''RAIL_REFUSED''
    /** The rail call did not complete; the invoice may or may not exist there. The claim is kept. */
    | ''UNCERTAIN''
    | ''ERROR'';

export interface OrdersIssueExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersIssueExternalInvoiceResultCode;
    /** The ExternalInvoice row (Sent, Failed, or the pre-existing Sent row on ALREADY_SENT). */
    ExternalInvoiceID?: string | null;
    /** The rail''s invoice id (Bill.com `00e…`). */
    ExternalInvoiceRef?: string | null;
    /** The rail''s customer id the invoice was issued to (Bill.com `0cu…`). */
    ExternalCustomerRef?: string | null;
    /** Our frozen document number, which is the rail''s invoice number. */
    DocumentNumber?: string | null;
    Amount?: number | null;
    DueDate?: string | null;
    SentAt?: string | null;
    /** On PREVIEWED: what would have been sent. */
    Payload?: unknown;
}
'
SET
  @OutputTypeIsArray_b075abfd = 0
SET
  @ExecutionMode_b075abfd = N'Sync'
SET
  @RequiredScope_b075abfd = N'orders:write'
SET
  @RequiresSystemUser_b075abfd = 0
SET
  @GenerationType_b075abfd = N'Manual'
SET
  @CodeApprovalStatus_b075abfd = N'Approved'
SET
  @Status_b075abfd = N'Active'
SET
  @CodeLocked_b075abfd = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_b075abfd OR [OperationKey] = @OperationKey_b075abfd)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_b075abfd,
  @Name = @Name_b075abfd,
  @OperationKey = @OperationKey_b075abfd,
  @CategoryID = @CategoryID_b075abfd,
  @Description = @Description_b075abfd,
  @InputTypeName = @InputTypeName_b075abfd,
  @InputTypeDefinition = @InputTypeDefinition_b075abfd,
  @InputTypeIsArray = @InputTypeIsArray_b075abfd,
  @OutputTypeName = @OutputTypeName_b075abfd,
  @OutputTypeDefinition = @OutputTypeDefinition_b075abfd,
  @OutputTypeIsArray = @OutputTypeIsArray_b075abfd,
  @ExecutionMode = @ExecutionMode_b075abfd,
  @RequiredScope = @RequiredScope_b075abfd,
  @RequiresSystemUser = @RequiresSystemUser_b075abfd,
  @GenerationType = @GenerationType_b075abfd,
  @Code = @Code_b075abfd,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_b075abfd,
  @CodeApprovedByUserID = @CodeApprovedByUserID_b075abfd,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_b075abfd,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_b075abfd,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_b075abfd,
  @CacheTTLSeconds = @CacheTTLSeconds_b075abfd,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_b075abfd,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_b075abfd,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_b075abfd,
  @CodeComments = @CodeComments_b075abfd,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_b075abfd,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_6f0f6c03 UNIQUEIDENTIFIER,
@Name_6f0f6c03 NVARCHAR(255),
@OperationKey_6f0f6c03 NVARCHAR(255),
@CategoryID_6f0f6c03 UNIQUEIDENTIFIER,
@Description_6f0f6c03 NVARCHAR(MAX),
@InputTypeName_6f0f6c03 NVARCHAR(255),
@InputTypeDefinition_6f0f6c03 NVARCHAR(MAX),
@InputTypeIsArray_6f0f6c03 BIT,
@OutputTypeName_6f0f6c03 NVARCHAR(255),
@OutputTypeDefinition_6f0f6c03 NVARCHAR(MAX),
@OutputTypeIsArray_6f0f6c03 BIT,
@ExecutionMode_6f0f6c03 NVARCHAR(20),
@RequiredScope_6f0f6c03 NVARCHAR(255),
@RequiresSystemUser_6f0f6c03 BIT,
@GenerationType_6f0f6c03 NVARCHAR(20),
@Code_6f0f6c03 NVARCHAR(MAX),
@CodeApprovalStatus_6f0f6c03 NVARCHAR(20),
@CodeApprovedByUserID_6f0f6c03 UNIQUEIDENTIFIER,
@CodeApprovedAt_6f0f6c03 DATETIMEOFFSET,
@ContractFingerprint_6f0f6c03 NVARCHAR(100),
@Status_6f0f6c03 NVARCHAR(20),
@CacheTTLSeconds_6f0f6c03 INT,
@TimeoutMS_6f0f6c03 INT,
@MaxConcurrency_6f0f6c03 INT,
@CodeLocked_6f0f6c03 BIT,
@CodeComments_6f0f6c03 NVARCHAR(MAX),
@Libraries_6f0f6c03 NVARCHAR(MAX)
SET
  @ID_6f0f6c03 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A04'
SET
  @Name_6f0f6c03 = N'Send External Invoices'
SET
  @OperationKey_6f0f6c03 = N'Orders.SendExternalInvoices'
SET
  @CategoryID_6f0f6c03 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_6f0f6c03 = N'The sweep: work the external invoicing worklist through Orders.IssueExternalInvoice, capped by MaxCount, with Preview listing what would be sent. Retries transient failures; never re-issues a cancelled unit. The scheduled caller for Bill.com invoicing.'
SET
  @InputTypeName_6f0f6c03 = N'OrdersSendExternalInvoicesInput'
SET
  @InputTypeDefinition_6f0f6c03 = N'/**
 * Input for `Orders.SendExternalInvoices`.
 *
 * The sweep: read the external invoicing worklist and send each unit through
 * `Orders.IssueExternalInvoice`. Meant for a scheduled job (through the `Orders: Send External
 * Invoices` Action) and for the Bill.com queue page''s "Run now". Never re-issues a cancelled unit —
 * that is a person''s act (design D-B7).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersSendExternalInvoicesInput {
    /** Restrict to these selling companies. Omit for every company with an active rail. */
    CompanyIDs?: string[];
    /**
     * Cap on units sent in one pass, and on the units a preview lists. The first-run safety valve:
     * a mis-configuration invoices this many customers, not the book. Default 25.
     */
    MaxCount?: number;
    /** List what WOULD be sent and send nothing. */
    Preview?: boolean;
    /** Also retry units whose last send failed for a transient reason (timeout, 5xx, session). Default true. */
    RetryTransientFailures?: boolean;
}
'
SET
  @InputTypeIsArray_6f0f6c03 = 0
SET
  @OutputTypeName_6f0f6c03 = N'OrdersSendExternalInvoicesOutput'
SET
  @OutputTypeDefinition_6f0f6c03 = N'/**
 * Output for `Orders.SendExternalInvoices`.
 *
 * `Results` lists every unit the pass considered with its outcome, so a preview run''s list is the
 * deliverable a person confirms before the job goes live, and a live run''s failures are named.
 * A live pass that left a unit unsent reports Success false.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SendExternalInvoicesResult {
    OrderNumber: string;
    DocumentNumber: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
    Amount: number;
    ResultCode: string;
    Message?: string;
    ExternalInvoiceRef?: string | null;
}

export interface OrdersSendExternalInvoicesOutput {
    Success: boolean;
    Message?: string;
    Sent: number;
    Failed: number;
    /** Units in the worklist beyond MaxCount, or skipped as permanent failures. Not lost — still due next pass. */
    Skipped: number;
    PreviewedOnly: boolean;
    Results: SendExternalInvoicesResult[];
}
'
SET
  @OutputTypeIsArray_6f0f6c03 = 0
SET
  @ExecutionMode_6f0f6c03 = N'LongRunning'
SET
  @RequiredScope_6f0f6c03 = N'orders:write'
SET
  @RequiresSystemUser_6f0f6c03 = 0
SET
  @GenerationType_6f0f6c03 = N'Manual'
SET
  @CodeApprovalStatus_6f0f6c03 = N'Approved'
SET
  @Status_6f0f6c03 = N'Active'
SET
  @CodeLocked_6f0f6c03 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_6f0f6c03 OR [OperationKey] = @OperationKey_6f0f6c03)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_6f0f6c03,
  @Name = @Name_6f0f6c03,
  @OperationKey = @OperationKey_6f0f6c03,
  @CategoryID = @CategoryID_6f0f6c03,
  @Description = @Description_6f0f6c03,
  @InputTypeName = @InputTypeName_6f0f6c03,
  @InputTypeDefinition = @InputTypeDefinition_6f0f6c03,
  @InputTypeIsArray = @InputTypeIsArray_6f0f6c03,
  @OutputTypeName = @OutputTypeName_6f0f6c03,
  @OutputTypeDefinition = @OutputTypeDefinition_6f0f6c03,
  @OutputTypeIsArray = @OutputTypeIsArray_6f0f6c03,
  @ExecutionMode = @ExecutionMode_6f0f6c03,
  @RequiredScope = @RequiredScope_6f0f6c03,
  @RequiresSystemUser = @RequiresSystemUser_6f0f6c03,
  @GenerationType = @GenerationType_6f0f6c03,
  @Code = @Code_6f0f6c03,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_6f0f6c03,
  @CodeApprovedByUserID = @CodeApprovedByUserID_6f0f6c03,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_6f0f6c03,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_6f0f6c03,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_6f0f6c03,
  @CacheTTLSeconds = @CacheTTLSeconds_6f0f6c03,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_6f0f6c03,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_6f0f6c03,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_6f0f6c03,
  @CodeComments = @CodeComments_6f0f6c03,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_6f0f6c03,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_ace4b44e UNIQUEIDENTIFIER,
@Name_ace4b44e NVARCHAR(255),
@OperationKey_ace4b44e NVARCHAR(255),
@CategoryID_ace4b44e UNIQUEIDENTIFIER,
@Description_ace4b44e NVARCHAR(MAX),
@InputTypeName_ace4b44e NVARCHAR(255),
@InputTypeDefinition_ace4b44e NVARCHAR(MAX),
@InputTypeIsArray_ace4b44e BIT,
@OutputTypeName_ace4b44e NVARCHAR(255),
@OutputTypeDefinition_ace4b44e NVARCHAR(MAX),
@OutputTypeIsArray_ace4b44e BIT,
@ExecutionMode_ace4b44e NVARCHAR(20),
@RequiredScope_ace4b44e NVARCHAR(255),
@RequiresSystemUser_ace4b44e BIT,
@GenerationType_ace4b44e NVARCHAR(20),
@Code_ace4b44e NVARCHAR(MAX),
@CodeApprovalStatus_ace4b44e NVARCHAR(20),
@CodeApprovedByUserID_ace4b44e UNIQUEIDENTIFIER,
@CodeApprovedAt_ace4b44e DATETIMEOFFSET,
@ContractFingerprint_ace4b44e NVARCHAR(100),
@Status_ace4b44e NVARCHAR(20),
@CacheTTLSeconds_ace4b44e INT,
@TimeoutMS_ace4b44e INT,
@MaxConcurrency_ace4b44e INT,
@CodeLocked_ace4b44e BIT,
@CodeComments_ace4b44e NVARCHAR(MAX),
@Libraries_ace4b44e NVARCHAR(MAX)
SET
  @ID_ace4b44e = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A06'
SET
  @Name_ace4b44e = N'Adopt External Invoice'
SET
  @OperationKey_ace4b44e = N'Orders.AdoptExternalInvoice'
SET
  @CategoryID_ace4b44e = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_ace4b44e = N'Attaches an invoice the rail already holds to a unit whose send was never confirmed. A timed-out send leaves the unit claimed on purpose — the rail may or may not have committed the invoice, and retrying blindly is how one billing unit becomes two invoices in a customer''s inbox. This is the half of the answer where the invoice IS there; re-issuing with AllowReissue is the half where it is not. Reads the invoice back and refuses if its total does not tie to the unit.'
SET
  @InputTypeName_ace4b44e = N'OrdersAdoptExternalInvoiceInput'
SET
  @InputTypeDefinition_ace4b44e = N'/**
 * Input for `Orders.AdoptExternalInvoice`.
 *
 * Attach an invoice the rail ALREADY HOLDS to a unit whose send was never confirmed.
 *
 * WHY THIS EXISTS. A send that times out leaves the unit claimed (`Sending`) on purpose: the rail may
 * or may not have committed the invoice, and retrying blindly is how one billing unit becomes two
 * invoices in a customer''s inbox. Resolving that is a person''s job, and it has two answers. If the
 * rail has nothing, they re-issue with `AllowReissue`. If the rail HAS the invoice, they bring its
 * reference here — which, until this operation existed, could only be done by editing the row by hand.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersAdoptExternalInvoiceInput {
    /** The claimed (`Sending`) ExternalInvoice row to resolve. */
    ExternalInvoiceID: string;
    /** The rail''s own invoice id — Bill.com `00e…` — that this unit''s send actually produced. */
    ExternalInvoiceRef: string;
    /** Report what would happen and write nothing. */
    Preview?: boolean;
}
'
SET
  @InputTypeIsArray_ace4b44e = 0
SET
  @OutputTypeName_ace4b44e = N'OrdersAdoptExternalInvoiceOutput'
SET
  @OutputTypeDefinition_ace4b44e = N'/**
 * Output for `Orders.AdoptExternalInvoice`.
 *
 * `TIE_FAILED` is the important refusal: the reference the person supplied points at an invoice whose
 * total is not this unit''s amount, so adopting it would tie our receivable to the customer''s document
 * for a different figure. Refused rather than recorded.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersAdoptExternalInvoiceResultCode =
    | ''ADOPTED''
    | ''PREVIEWED''
    | ''NOT_CLAIMED''
    | ''NOT_FOUND_ON_RAIL''
    | ''TIE_FAILED''
    | ''ALREADY_ADOPTED''
    | ''ERROR'';

export interface OrdersAdoptExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersAdoptExternalInvoiceResultCode;
    ExternalInvoiceID?: string | null;
    ExternalInvoiceRef?: string | null;
    DocumentNumber?: string | null;
    /** What the rail says this invoice totals, when it could be read. */
    ExternalTotal?: number | null;
    /** What the unit is worth here. The two must agree to the cent. */
    Amount?: number | null;
}
'
SET
  @OutputTypeIsArray_ace4b44e = 0
SET
  @ExecutionMode_ace4b44e = N'Sync'
SET
  @RequiredScope_ace4b44e = N'orders:write'
SET
  @RequiresSystemUser_ace4b44e = 0
SET
  @GenerationType_ace4b44e = N'Manual'
SET
  @CodeApprovalStatus_ace4b44e = N'Approved'
SET
  @Status_ace4b44e = N'Active'
SET
  @CodeLocked_ace4b44e = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_ace4b44e OR [OperationKey] = @OperationKey_ace4b44e)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_ace4b44e,
  @Name = @Name_ace4b44e,
  @OperationKey = @OperationKey_ace4b44e,
  @CategoryID = @CategoryID_ace4b44e,
  @Description = @Description_ace4b44e,
  @InputTypeName = @InputTypeName_ace4b44e,
  @InputTypeDefinition = @InputTypeDefinition_ace4b44e,
  @InputTypeIsArray = @InputTypeIsArray_ace4b44e,
  @OutputTypeName = @OutputTypeName_ace4b44e,
  @OutputTypeDefinition = @OutputTypeDefinition_ace4b44e,
  @OutputTypeIsArray = @OutputTypeIsArray_ace4b44e,
  @ExecutionMode = @ExecutionMode_ace4b44e,
  @RequiredScope = @RequiredScope_ace4b44e,
  @RequiresSystemUser = @RequiresSystemUser_ace4b44e,
  @GenerationType = @GenerationType_ace4b44e,
  @Code = @Code_ace4b44e,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_ace4b44e,
  @CodeApprovedByUserID = @CodeApprovedByUserID_ace4b44e,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_ace4b44e,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_ace4b44e,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_ace4b44e,
  @CacheTTLSeconds = @CacheTTLSeconds_ace4b44e,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_ace4b44e,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_ace4b44e,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_ace4b44e,
  @CodeComments = @CodeComments_ace4b44e,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_ace4b44e,
  @Libraries_Clear = 1;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @ID_5686cf7f UNIQUEIDENTIFIER,
@CategoryID_5686cf7f UNIQUEIDENTIFIER,
@Name_5686cf7f NVARCHAR(425),
@Description_5686cf7f NVARCHAR(MAX),
@Type_5686cf7f NVARCHAR(20),
@UserPrompt_5686cf7f NVARCHAR(MAX),
@UserComments_5686cf7f NVARCHAR(MAX),
@Code_5686cf7f NVARCHAR(MAX),
@CodeComments_5686cf7f NVARCHAR(MAX),
@CodeApprovalStatus_5686cf7f NVARCHAR(20),
@CodeApprovalComments_5686cf7f NVARCHAR(MAX),
@CodeApprovedByUserID_5686cf7f UNIQUEIDENTIFIER,
@CodeApprovedAt_5686cf7f DATETIMEOFFSET,
@CodeLocked_5686cf7f BIT,
@ForceCodeGeneration_5686cf7f BIT,
@RetentionPeriod_5686cf7f INT,
@Status_5686cf7f NVARCHAR(20),
@DriverClass_5686cf7f NVARCHAR(255),
@ParentID_5686cf7f UNIQUEIDENTIFIER,
@IconClass_5686cf7f NVARCHAR(100),
@DefaultCompactPromptID_5686cf7f UNIQUEIDENTIFIER,
@Config_5686cf7f NVARCHAR(MAX),
@RuntimeActionConfiguration_5686cf7f NVARCHAR(MAX),
@MaxExecutionTimeMS_5686cf7f INT,
@CreatedByAgentID_5686cf7f UNIQUEIDENTIFIER
SET
  @ID_5686cf7f = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01'
SET
  @CategoryID_5686cf7f = '359F5241-25D1-4949-A74F-C20CA3EECC3A'
SET
  @Name_5686cf7f = N'Send External Invoices'
SET
  @Description_5686cf7f = N'Work the external invoicing worklist: every billing unit that is invoiceable on its company''s Bill.com rail and not yet sent is created there through Orders.IssueExternalInvoice. Runs the Orders.SendExternalInvoices operation, which carries the selection, the idempotency guard and the tie check — this Action only reads parameters and reports the result. Preview lists what would be sent and sends nothing.'
SET
  @Type_5686cf7f = N'Custom'
SET
  @UserPrompt_5686cf7f = N'Send the invoices that are due to Bill.com, or preview what would be sent.'
SET
  @CodeApprovalStatus_5686cf7f = N'Approved'
SET
  @CodeLocked_5686cf7f = 0
SET
  @ForceCodeGeneration_5686cf7f = 0
SET
  @Status_5686cf7f = N'Active'
SET
  @DriverClass_5686cf7f = N'Orders.SendExternalInvoices'
SET
  @IconClass_5686cf7f = N'fa-solid fa-file-invoice-dollar'
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action]
               WHERE [ID] = @ID_5686cf7f OR [DriverClass] = @DriverClass_5686cf7f)
EXEC [${mjSchema}].spCreateAction @ID = @ID_5686cf7f,
  @CategoryID = @CategoryID_5686cf7f,
  @Name = @Name_5686cf7f,
  @Description = @Description_5686cf7f,
  @Type = @Type_5686cf7f,
  @UserPrompt = @UserPrompt_5686cf7f,
  @UserComments = @UserComments_5686cf7f,
  @UserComments_Clear = 1,
  @Code = @Code_5686cf7f,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_5686cf7f,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_5686cf7f,
  @CodeApprovalComments = @CodeApprovalComments_5686cf7f,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_5686cf7f,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_5686cf7f,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_5686cf7f,
  @ForceCodeGeneration = @ForceCodeGeneration_5686cf7f,
  @RetentionPeriod = @RetentionPeriod_5686cf7f,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_5686cf7f,
  @DriverClass = @DriverClass_5686cf7f,
  @ParentID = @ParentID_5686cf7f,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_5686cf7f,
  @DefaultCompactPromptID = @DefaultCompactPromptID_5686cf7f,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_5686cf7f,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_5686cf7f,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_5686cf7f,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_5686cf7f,
  @CreatedByAgentID_Clear = 1;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @ID_1625e4f7 UNIQUEIDENTIFIER,
@CategoryID_1625e4f7 UNIQUEIDENTIFIER,
@Name_1625e4f7 NVARCHAR(425),
@Description_1625e4f7 NVARCHAR(MAX),
@Type_1625e4f7 NVARCHAR(20),
@UserPrompt_1625e4f7 NVARCHAR(MAX),
@UserComments_1625e4f7 NVARCHAR(MAX),
@Code_1625e4f7 NVARCHAR(MAX),
@CodeComments_1625e4f7 NVARCHAR(MAX),
@CodeApprovalStatus_1625e4f7 NVARCHAR(20),
@CodeApprovalComments_1625e4f7 NVARCHAR(MAX),
@CodeApprovedByUserID_1625e4f7 UNIQUEIDENTIFIER,
@CodeApprovedAt_1625e4f7 DATETIMEOFFSET,
@CodeLocked_1625e4f7 BIT,
@ForceCodeGeneration_1625e4f7 BIT,
@RetentionPeriod_1625e4f7 INT,
@Status_1625e4f7 NVARCHAR(20),
@DriverClass_1625e4f7 NVARCHAR(255),
@ParentID_1625e4f7 UNIQUEIDENTIFIER,
@IconClass_1625e4f7 NVARCHAR(100),
@DefaultCompactPromptID_1625e4f7 UNIQUEIDENTIFIER,
@Config_1625e4f7 NVARCHAR(MAX),
@RuntimeActionConfiguration_1625e4f7 NVARCHAR(MAX),
@MaxExecutionTimeMS_1625e4f7 INT,
@CreatedByAgentID_1625e4f7 UNIQUEIDENTIFIER
SET
  @ID_1625e4f7 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11'
SET
  @CategoryID_1625e4f7 = '359F5241-25D1-4949-A74F-C20CA3EECC3A'
SET
  @Name_1625e4f7 = N'Poll External Payments'
SET
  @Description_1625e4f7 = N'Read receivable payments from each company''s Bill.com rail since the stored watermark and capture every cleared payment exactly once through Orders.CapturePayment, applied to the orders its invoices belong to. Runs the Orders.PollExternalPayments operation — this Action only reads parameters and reports the result. Preview decides everything and writes nothing. A pass that leaves unmatched or reversed payments for a person reports failure so the job notifies.'
SET
  @Type_1625e4f7 = N'Custom'
SET
  @UserPrompt_1625e4f7 = N'Poll Bill.com for cleared customer payments and record them, or preview what would be recorded.'
SET
  @CodeApprovalStatus_1625e4f7 = N'Approved'
SET
  @CodeLocked_1625e4f7 = 0
SET
  @ForceCodeGeneration_1625e4f7 = 0
SET
  @Status_1625e4f7 = N'Active'
SET
  @DriverClass_1625e4f7 = N'Orders.PollExternalPayments'
SET
  @IconClass_1625e4f7 = N'fa-solid fa-money-bill-transfer'
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action]
               WHERE [ID] = @ID_1625e4f7 OR [DriverClass] = @DriverClass_1625e4f7)
EXEC [${mjSchema}].spCreateAction @ID = @ID_1625e4f7,
  @CategoryID = @CategoryID_1625e4f7,
  @Name = @Name_1625e4f7,
  @Description = @Description_1625e4f7,
  @Type = @Type_1625e4f7,
  @UserPrompt = @UserPrompt_1625e4f7,
  @UserComments = @UserComments_1625e4f7,
  @UserComments_Clear = 1,
  @Code = @Code_1625e4f7,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_1625e4f7,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_1625e4f7,
  @CodeApprovalComments = @CodeApprovalComments_1625e4f7,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_1625e4f7,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_1625e4f7,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_1625e4f7,
  @ForceCodeGeneration = @ForceCodeGeneration_1625e4f7,
  @RetentionPeriod = @RetentionPeriod_1625e4f7,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_1625e4f7,
  @DriverClass = @DriverClass_1625e4f7,
  @ParentID = @ParentID_1625e4f7,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_1625e4f7,
  @DefaultCompactPromptID = @DefaultCompactPromptID_1625e4f7,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_1625e4f7,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_1625e4f7,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_1625e4f7,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_1625e4f7,
  @CreatedByAgentID_Clear = 1;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_55ff137c UNIQUEIDENTIFIER,
@ActionID_55ff137c UNIQUEIDENTIFIER,
@Name_55ff137c NVARCHAR(255),
@DefaultValue_55ff137c NVARCHAR(MAX),
@Type_55ff137c NCHAR(10),
@ValueType_55ff137c NVARCHAR(30),
@IsArray_55ff137c BIT,
@Description_55ff137c NVARCHAR(MAX),
@IsRequired_55ff137c BIT,
@MediaModality_55ff137c NVARCHAR(20),
@LogValue_55ff137c BIT
SET
  @ID_55ff137c = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B02'
SET
  @ActionID_55ff137c = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_55ff137c = N'CompanyIDs'
SET
  @Type_55ff137c = N'Input'
SET
  @ValueType_55ff137c = N'Scalar'
SET
  @IsArray_55ff137c = 0
SET
  @Description_55ff137c = N'Restrict the sweep to these selling companies (comma-separated IDs). Omit for every company with an active Bill.com provider row. A value that is not a list of IDs is refused.'
SET
  @IsRequired_55ff137c = 0
SET
  @LogValue_55ff137c = 1
IF @ActionID_55ff137c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_55ff137c OR ([Name] = @Name_55ff137c AND [ActionID] = @ActionID_55ff137c))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_55ff137c,
  @ActionID = @ActionID_55ff137c,
  @Name = @Name_55ff137c,
  @DefaultValue = @DefaultValue_55ff137c,
  @DefaultValue_Clear = 1,
  @Type = @Type_55ff137c,
  @ValueType = @ValueType_55ff137c,
  @IsArray = @IsArray_55ff137c,
  @Description = @Description_55ff137c,
  @IsRequired = @IsRequired_55ff137c,
  @MediaModality = @MediaModality_55ff137c,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_55ff137c;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_aa9907f2 UNIQUEIDENTIFIER,
@ActionID_aa9907f2 UNIQUEIDENTIFIER,
@Name_aa9907f2 NVARCHAR(255),
@DefaultValue_aa9907f2 NVARCHAR(MAX),
@Type_aa9907f2 NCHAR(10),
@ValueType_aa9907f2 NVARCHAR(30),
@IsArray_aa9907f2 BIT,
@Description_aa9907f2 NVARCHAR(MAX),
@IsRequired_aa9907f2 BIT,
@MediaModality_aa9907f2 NVARCHAR(20),
@LogValue_aa9907f2 BIT
SET
  @ID_aa9907f2 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B03'
SET
  @ActionID_aa9907f2 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_aa9907f2 = N'MaxCount'
SET
  @Type_aa9907f2 = N'Input'
SET
  @ValueType_aa9907f2 = N'Scalar'
SET
  @IsArray_aa9907f2 = 0
SET
  @Description_aa9907f2 = N'Cap on units sent in one pass, and on the units a preview lists, so the list confirmed at the go-live gate is the pass that follows it. The first-run safety valve: a mis-configuration invoices this many customers, not the book. Default 25. A value that is not a whole number of at least 1 is refused, never dropped: a dropped cap is no cap.'
SET
  @IsRequired_aa9907f2 = 0
SET
  @LogValue_aa9907f2 = 1
IF @ActionID_aa9907f2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_aa9907f2 OR ([Name] = @Name_aa9907f2 AND [ActionID] = @ActionID_aa9907f2))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_aa9907f2,
  @ActionID = @ActionID_aa9907f2,
  @Name = @Name_aa9907f2,
  @DefaultValue = @DefaultValue_aa9907f2,
  @DefaultValue_Clear = 1,
  @Type = @Type_aa9907f2,
  @ValueType = @ValueType_aa9907f2,
  @IsArray = @IsArray_aa9907f2,
  @Description = @Description_aa9907f2,
  @IsRequired = @IsRequired_aa9907f2,
  @MediaModality = @MediaModality_aa9907f2,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_aa9907f2;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_9ebe676f UNIQUEIDENTIFIER,
@ActionID_9ebe676f UNIQUEIDENTIFIER,
@Name_9ebe676f NVARCHAR(255),
@DefaultValue_9ebe676f NVARCHAR(MAX),
@Type_9ebe676f NCHAR(10),
@ValueType_9ebe676f NVARCHAR(30),
@IsArray_9ebe676f BIT,
@Description_9ebe676f NVARCHAR(MAX),
@IsRequired_9ebe676f BIT,
@MediaModality_9ebe676f NVARCHAR(20),
@LogValue_9ebe676f BIT
SET
  @ID_9ebe676f = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04'
SET
  @ActionID_9ebe676f = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_9ebe676f = N'Preview'
SET
  @Type_9ebe676f = N'Input'
SET
  @ValueType_9ebe676f = N'Scalar'
SET
  @IsArray_9ebe676f = 0
SET
  @Description_9ebe676f = N'True lists what WOULD be sent and sends nothing; false (the default) sends. A value that is neither is refused rather than guessed — the wrong guess sends customers invoices. A scheduler stores params as text, so "false" arrives as a string and is read as false, not as a truthy value.'
SET
  @IsRequired_9ebe676f = 0
SET
  @LogValue_9ebe676f = 1
IF @ActionID_9ebe676f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_9ebe676f OR ([Name] = @Name_9ebe676f AND [ActionID] = @ActionID_9ebe676f))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_9ebe676f,
  @ActionID = @ActionID_9ebe676f,
  @Name = @Name_9ebe676f,
  @DefaultValue = @DefaultValue_9ebe676f,
  @DefaultValue_Clear = 1,
  @Type = @Type_9ebe676f,
  @ValueType = @ValueType_9ebe676f,
  @IsArray = @IsArray_9ebe676f,
  @Description = @Description_9ebe676f,
  @IsRequired = @IsRequired_9ebe676f,
  @MediaModality = @MediaModality_9ebe676f,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_9ebe676f;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_ab221ccf UNIQUEIDENTIFIER,
@ActionID_ab221ccf UNIQUEIDENTIFIER,
@Name_ab221ccf NVARCHAR(255),
@DefaultValue_ab221ccf NVARCHAR(MAX),
@Type_ab221ccf NCHAR(10),
@ValueType_ab221ccf NVARCHAR(30),
@IsArray_ab221ccf BIT,
@Description_ab221ccf NVARCHAR(MAX),
@IsRequired_ab221ccf BIT,
@MediaModality_ab221ccf NVARCHAR(20),
@LogValue_ab221ccf BIT
SET
  @ID_ab221ccf = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B05'
SET
  @ActionID_ab221ccf = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_ab221ccf = N'RetryTransientFailures'
SET
  @Type_ab221ccf = N'Input'
SET
  @ValueType_ab221ccf = N'Scalar'
SET
  @IsArray_ab221ccf = 0
SET
  @Description_ab221ccf = N'True (the default) also retries units whose last send failed for a transient reason — a timeout, a 5xx, a lost session. Permanent failures (a customer with no email) are never retried; they wait in the Bill.com queue for a person.'
SET
  @IsRequired_ab221ccf = 0
SET
  @LogValue_ab221ccf = 1
IF @ActionID_ab221ccf IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_ab221ccf OR ([Name] = @Name_ab221ccf AND [ActionID] = @ActionID_ab221ccf))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_ab221ccf,
  @ActionID = @ActionID_ab221ccf,
  @Name = @Name_ab221ccf,
  @DefaultValue = @DefaultValue_ab221ccf,
  @DefaultValue_Clear = 1,
  @Type = @Type_ab221ccf,
  @ValueType = @ValueType_ab221ccf,
  @IsArray = @IsArray_ab221ccf,
  @Description = @Description_ab221ccf,
  @IsRequired = @IsRequired_ab221ccf,
  @MediaModality = @MediaModality_ab221ccf,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_ab221ccf;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_8405de26 UNIQUEIDENTIFIER,
@ActionID_8405de26 UNIQUEIDENTIFIER,
@Name_8405de26 NVARCHAR(255),
@DefaultValue_8405de26 NVARCHAR(MAX),
@Type_8405de26 NCHAR(10),
@ValueType_8405de26 NVARCHAR(30),
@IsArray_8405de26 BIT,
@Description_8405de26 NVARCHAR(MAX),
@IsRequired_8405de26 BIT,
@MediaModality_8405de26 NVARCHAR(20),
@LogValue_8405de26 BIT
SET
  @ID_8405de26 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B06'
SET
  @ActionID_8405de26 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_8405de26 = N'Sent'
SET
  @Type_8405de26 = N'Output'
SET
  @ValueType_8405de26 = N'Scalar'
SET
  @IsArray_8405de26 = 0
SET
  @Description_8405de26 = N'Units created on the rail this pass (or that would be, on a preview).'
SET
  @IsRequired_8405de26 = 0
SET
  @LogValue_8405de26 = 1
IF @ActionID_8405de26 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_8405de26 OR ([Name] = @Name_8405de26 AND [ActionID] = @ActionID_8405de26))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_8405de26,
  @ActionID = @ActionID_8405de26,
  @Name = @Name_8405de26,
  @DefaultValue = @DefaultValue_8405de26,
  @DefaultValue_Clear = 1,
  @Type = @Type_8405de26,
  @ValueType = @ValueType_8405de26,
  @IsArray = @IsArray_8405de26,
  @Description = @Description_8405de26,
  @IsRequired = @IsRequired_8405de26,
  @MediaModality = @MediaModality_8405de26,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_8405de26;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_71d84406 UNIQUEIDENTIFIER,
@ActionID_71d84406 UNIQUEIDENTIFIER,
@Name_71d84406 NVARCHAR(255),
@DefaultValue_71d84406 NVARCHAR(MAX),
@Type_71d84406 NCHAR(10),
@ValueType_71d84406 NVARCHAR(30),
@IsArray_71d84406 BIT,
@Description_71d84406 NVARCHAR(MAX),
@IsRequired_71d84406 BIT,
@MediaModality_71d84406 NVARCHAR(20),
@LogValue_71d84406 BIT
SET
  @ID_71d84406 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B07'
SET
  @ActionID_71d84406 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_71d84406 = N'Failed'
SET
  @Type_71d84406 = N'Output'
SET
  @ValueType_71d84406 = N'Scalar'
SET
  @IsArray_71d84406 = 0
SET
  @Description_71d84406 = N'Units the rail or the tie check refused; each reason is on Results.'
SET
  @IsRequired_71d84406 = 0
SET
  @LogValue_71d84406 = 1
IF @ActionID_71d84406 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_71d84406 OR ([Name] = @Name_71d84406 AND [ActionID] = @ActionID_71d84406))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_71d84406,
  @ActionID = @ActionID_71d84406,
  @Name = @Name_71d84406,
  @DefaultValue = @DefaultValue_71d84406,
  @DefaultValue_Clear = 1,
  @Type = @Type_71d84406,
  @ValueType = @ValueType_71d84406,
  @IsArray = @IsArray_71d84406,
  @Description = @Description_71d84406,
  @IsRequired = @IsRequired_71d84406,
  @MediaModality = @MediaModality_71d84406,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_71d84406;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_73a4ca2d UNIQUEIDENTIFIER,
@ActionID_73a4ca2d UNIQUEIDENTIFIER,
@Name_73a4ca2d NVARCHAR(255),
@DefaultValue_73a4ca2d NVARCHAR(MAX),
@Type_73a4ca2d NCHAR(10),
@ValueType_73a4ca2d NVARCHAR(30),
@IsArray_73a4ca2d BIT,
@Description_73a4ca2d NVARCHAR(MAX),
@IsRequired_73a4ca2d BIT,
@MediaModality_73a4ca2d NVARCHAR(20),
@LogValue_73a4ca2d BIT
SET
  @ID_73a4ca2d = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B08'
SET
  @ActionID_73a4ca2d = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_73a4ca2d = N'Skipped'
SET
  @Type_73a4ca2d = N'Output'
SET
  @ValueType_73a4ca2d = N'Scalar'
SET
  @IsArray_73a4ca2d = 0
SET
  @Description_73a4ca2d = N'Units beyond MaxCount, in flight, or permanent failures. Not lost — still due next pass or waiting for a person.'
SET
  @IsRequired_73a4ca2d = 0
SET
  @LogValue_73a4ca2d = 1
IF @ActionID_73a4ca2d IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_73a4ca2d OR ([Name] = @Name_73a4ca2d AND [ActionID] = @ActionID_73a4ca2d))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_73a4ca2d,
  @ActionID = @ActionID_73a4ca2d,
  @Name = @Name_73a4ca2d,
  @DefaultValue = @DefaultValue_73a4ca2d,
  @DefaultValue_Clear = 1,
  @Type = @Type_73a4ca2d,
  @ValueType = @ValueType_73a4ca2d,
  @IsArray = @IsArray_73a4ca2d,
  @Description = @Description_73a4ca2d,
  @IsRequired = @IsRequired_73a4ca2d,
  @MediaModality = @MediaModality_73a4ca2d,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_73a4ca2d;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_845f5717 UNIQUEIDENTIFIER,
@ActionID_845f5717 UNIQUEIDENTIFIER,
@Name_845f5717 NVARCHAR(255),
@DefaultValue_845f5717 NVARCHAR(MAX),
@Type_845f5717 NCHAR(10),
@ValueType_845f5717 NVARCHAR(30),
@IsArray_845f5717 BIT,
@Description_845f5717 NVARCHAR(MAX),
@IsRequired_845f5717 BIT,
@MediaModality_845f5717 NVARCHAR(20),
@LogValue_845f5717 BIT
SET
  @ID_845f5717 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B09'
SET
  @ActionID_845f5717 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_845f5717 = N'Results'
SET
  @Type_845f5717 = N'Output'
SET
  @ValueType_845f5717 = N'Simple Object'
SET
  @IsArray_845f5717 = 1
SET
  @Description_845f5717 = N'Every unit considered, with its outcome. The deliverable of a preview run — stored on the ScheduledJobRun, where the person confirming the list reads it.'
SET
  @IsRequired_845f5717 = 0
SET
  @LogValue_845f5717 = 1
IF @ActionID_845f5717 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_845f5717 OR ([Name] = @Name_845f5717 AND [ActionID] = @ActionID_845f5717))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_845f5717,
  @ActionID = @ActionID_845f5717,
  @Name = @Name_845f5717,
  @DefaultValue = @DefaultValue_845f5717,
  @DefaultValue_Clear = 1,
  @Type = @Type_845f5717,
  @ValueType = @ValueType_845f5717,
  @IsArray = @IsArray_845f5717,
  @Description = @Description_845f5717,
  @IsRequired = @IsRequired_845f5717,
  @MediaModality = @MediaModality_845f5717,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_845f5717;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_6b4e386d UNIQUEIDENTIFIER,
@ActionID_6b4e386d UNIQUEIDENTIFIER,
@Name_6b4e386d NVARCHAR(255),
@DefaultValue_6b4e386d NVARCHAR(MAX),
@Type_6b4e386d NCHAR(10),
@ValueType_6b4e386d NVARCHAR(30),
@IsArray_6b4e386d BIT,
@Description_6b4e386d NVARCHAR(MAX),
@IsRequired_6b4e386d BIT,
@MediaModality_6b4e386d NVARCHAR(20),
@LogValue_6b4e386d BIT
SET
  @ID_6b4e386d = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B0A'
SET
  @ActionID_6b4e386d = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_6b4e386d = N'PreviewedOnly'
SET
  @Type_6b4e386d = N'Output'
SET
  @ValueType_6b4e386d = N'Scalar'
SET
  @IsArray_6b4e386d = 0
SET
  @Description_6b4e386d = N'True when this pass was a rehearsal. Deliberately not named Preview, so the input''s record survives.'
SET
  @IsRequired_6b4e386d = 0
SET
  @LogValue_6b4e386d = 1
IF @ActionID_6b4e386d IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_6b4e386d OR ([Name] = @Name_6b4e386d AND [ActionID] = @ActionID_6b4e386d))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_6b4e386d,
  @ActionID = @ActionID_6b4e386d,
  @Name = @Name_6b4e386d,
  @DefaultValue = @DefaultValue_6b4e386d,
  @DefaultValue_Clear = 1,
  @Type = @Type_6b4e386d,
  @ValueType = @ValueType_6b4e386d,
  @IsArray = @IsArray_6b4e386d,
  @Description = @Description_6b4e386d,
  @IsRequired = @IsRequired_6b4e386d,
  @MediaModality = @MediaModality_6b4e386d,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_6b4e386d;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_af607c5a UNIQUEIDENTIFIER,
@ActionID_af607c5a UNIQUEIDENTIFIER,
@Name_af607c5a NVARCHAR(255),
@DefaultValue_af607c5a NVARCHAR(MAX),
@Type_af607c5a NCHAR(10),
@ValueType_af607c5a NVARCHAR(30),
@IsArray_af607c5a BIT,
@Description_af607c5a NVARCHAR(MAX),
@IsRequired_af607c5a BIT,
@MediaModality_af607c5a NVARCHAR(20),
@LogValue_af607c5a BIT
SET
  @ID_af607c5a = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B12'
SET
  @ActionID_af607c5a = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_af607c5a = N'PaymentProviderID'
SET
  @Type_af607c5a = N'Input'
SET
  @ValueType_af607c5a = N'Scalar'
SET
  @IsArray_af607c5a = 0
SET
  @Description_af607c5a = N'Poll one provider row (one company''s Bill.com organisation) only. Omit for every active one.'
SET
  @IsRequired_af607c5a = 0
SET
  @LogValue_af607c5a = 1
IF @ActionID_af607c5a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_af607c5a OR ([Name] = @Name_af607c5a AND [ActionID] = @ActionID_af607c5a))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_af607c5a,
  @ActionID = @ActionID_af607c5a,
  @Name = @Name_af607c5a,
  @DefaultValue = @DefaultValue_af607c5a,
  @DefaultValue_Clear = 1,
  @Type = @Type_af607c5a,
  @ValueType = @ValueType_af607c5a,
  @IsArray = @IsArray_af607c5a,
  @Description = @Description_af607c5a,
  @IsRequired = @IsRequired_af607c5a,
  @MediaModality = @MediaModality_af607c5a,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_af607c5a;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_a8b0611a UNIQUEIDENTIFIER,
@ActionID_a8b0611a UNIQUEIDENTIFIER,
@Name_a8b0611a NVARCHAR(255),
@DefaultValue_a8b0611a NVARCHAR(MAX),
@Type_a8b0611a NCHAR(10),
@ValueType_a8b0611a NVARCHAR(30),
@IsArray_a8b0611a BIT,
@Description_a8b0611a NVARCHAR(MAX),
@IsRequired_a8b0611a BIT,
@MediaModality_a8b0611a NVARCHAR(20),
@LogValue_a8b0611a BIT
SET
  @ID_a8b0611a = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13'
SET
  @ActionID_a8b0611a = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_a8b0611a = N'Preview'
SET
  @Type_a8b0611a = N'Input'
SET
  @ValueType_a8b0611a = N'Scalar'
SET
  @IsArray_a8b0611a = 0
SET
  @Description_a8b0611a = N'True decides every payment and writes nothing — no Payment rows, no dispositions, no watermark. False (the default) records. A value that is neither is refused rather than guessed. A scheduler stores params as text, so "false" arrives as a string and is read as false.'
SET
  @IsRequired_a8b0611a = 0
SET
  @LogValue_a8b0611a = 1
IF @ActionID_a8b0611a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_a8b0611a OR ([Name] = @Name_a8b0611a AND [ActionID] = @ActionID_a8b0611a))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_a8b0611a,
  @ActionID = @ActionID_a8b0611a,
  @Name = @Name_a8b0611a,
  @DefaultValue = @DefaultValue_a8b0611a,
  @DefaultValue_Clear = 1,
  @Type = @Type_a8b0611a,
  @ValueType = @ValueType_a8b0611a,
  @IsArray = @IsArray_a8b0611a,
  @Description = @Description_a8b0611a,
  @IsRequired = @IsRequired_a8b0611a,
  @MediaModality = @MediaModality_a8b0611a,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_a8b0611a;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_1304cc9c UNIQUEIDENTIFIER,
@ActionID_1304cc9c UNIQUEIDENTIFIER,
@Name_1304cc9c NVARCHAR(255),
@DefaultValue_1304cc9c NVARCHAR(MAX),
@Type_1304cc9c NCHAR(10),
@ValueType_1304cc9c NVARCHAR(30),
@IsArray_1304cc9c BIT,
@Description_1304cc9c NVARCHAR(MAX),
@IsRequired_1304cc9c BIT,
@MediaModality_1304cc9c NVARCHAR(20),
@LogValue_1304cc9c BIT
SET
  @ID_1304cc9c = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B14'
SET
  @ActionID_1304cc9c = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_1304cc9c = N'MaxCount'
SET
  @Type_1304cc9c = N'Input'
SET
  @ValueType_1304cc9c = N'Scalar'
SET
  @IsArray_1304cc9c = 0
SET
  @Description_1304cc9c = N'Cap on payments considered per provider in one pass. Default 100. The remainder is read next pass (the watermark does not advance past a capped pass). A value that is not a whole number of at least 1 is refused.'
SET
  @IsRequired_1304cc9c = 0
SET
  @LogValue_1304cc9c = 1
IF @ActionID_1304cc9c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_1304cc9c OR ([Name] = @Name_1304cc9c AND [ActionID] = @ActionID_1304cc9c))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_1304cc9c,
  @ActionID = @ActionID_1304cc9c,
  @Name = @Name_1304cc9c,
  @DefaultValue = @DefaultValue_1304cc9c,
  @DefaultValue_Clear = 1,
  @Type = @Type_1304cc9c,
  @ValueType = @ValueType_1304cc9c,
  @IsArray = @IsArray_1304cc9c,
  @Description = @Description_1304cc9c,
  @IsRequired = @IsRequired_1304cc9c,
  @MediaModality = @MediaModality_1304cc9c,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_1304cc9c;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_5272ed28 UNIQUEIDENTIFIER,
@ActionID_5272ed28 UNIQUEIDENTIFIER,
@Name_5272ed28 NVARCHAR(255),
@DefaultValue_5272ed28 NVARCHAR(MAX),
@Type_5272ed28 NCHAR(10),
@ValueType_5272ed28 NVARCHAR(30),
@IsArray_5272ed28 BIT,
@Description_5272ed28 NVARCHAR(MAX),
@IsRequired_5272ed28 BIT,
@MediaModality_5272ed28 NVARCHAR(20),
@LogValue_5272ed28 BIT
SET
  @ID_5272ed28 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B15'
SET
  @ActionID_5272ed28 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_5272ed28 = N'SinceWatermark'
SET
  @Type_5272ed28 = N'Input'
SET
  @ValueType_5272ed28 = N'Scalar'
SET
  @IsArray_5272ed28 = 0
SET
  @Description_5272ed28 = N'Override the stored watermark (ISO 8601) for a first run or a deliberate re-read. Safe: dedupe is by Bill.com payment id and by PaymentHeader.IdempotencyKey. An unreadable value is refused.'
SET
  @IsRequired_5272ed28 = 0
SET
  @LogValue_5272ed28 = 1
IF @ActionID_5272ed28 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_5272ed28 OR ([Name] = @Name_5272ed28 AND [ActionID] = @ActionID_5272ed28))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_5272ed28,
  @ActionID = @ActionID_5272ed28,
  @Name = @Name_5272ed28,
  @DefaultValue = @DefaultValue_5272ed28,
  @DefaultValue_Clear = 1,
  @Type = @Type_5272ed28,
  @ValueType = @ValueType_5272ed28,
  @IsArray = @IsArray_5272ed28,
  @Description = @Description_5272ed28,
  @IsRequired = @IsRequired_5272ed28,
  @MediaModality = @MediaModality_5272ed28,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_5272ed28;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_114776e0 UNIQUEIDENTIFIER,
@ActionID_114776e0 UNIQUEIDENTIFIER,
@Name_114776e0 NVARCHAR(255),
@DefaultValue_114776e0 NVARCHAR(MAX),
@Type_114776e0 NCHAR(10),
@ValueType_114776e0 NVARCHAR(30),
@IsArray_114776e0 BIT,
@Description_114776e0 NVARCHAR(MAX),
@IsRequired_114776e0 BIT,
@MediaModality_114776e0 NVARCHAR(20),
@LogValue_114776e0 BIT
SET
  @ID_114776e0 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B16'
SET
  @ActionID_114776e0 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_114776e0 = N'Captured'
SET
  @Type_114776e0 = N'Output'
SET
  @ValueType_114776e0 = N'Scalar'
SET
  @IsArray_114776e0 = 0
SET
  @Description_114776e0 = N'Payments recorded this pass.'
SET
  @IsRequired_114776e0 = 0
SET
  @LogValue_114776e0 = 1
IF @ActionID_114776e0 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_114776e0 OR ([Name] = @Name_114776e0 AND [ActionID] = @ActionID_114776e0))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_114776e0,
  @ActionID = @ActionID_114776e0,
  @Name = @Name_114776e0,
  @DefaultValue = @DefaultValue_114776e0,
  @DefaultValue_Clear = 1,
  @Type = @Type_114776e0,
  @ValueType = @ValueType_114776e0,
  @IsArray = @IsArray_114776e0,
  @Description = @Description_114776e0,
  @IsRequired = @IsRequired_114776e0,
  @MediaModality = @MediaModality_114776e0,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_114776e0;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_2be82d82 UNIQUEIDENTIFIER,
@ActionID_2be82d82 UNIQUEIDENTIFIER,
@Name_2be82d82 NVARCHAR(255),
@DefaultValue_2be82d82 NVARCHAR(MAX),
@Type_2be82d82 NCHAR(10),
@ValueType_2be82d82 NVARCHAR(30),
@IsArray_2be82d82 BIT,
@Description_2be82d82 NVARCHAR(MAX),
@IsRequired_2be82d82 BIT,
@MediaModality_2be82d82 NVARCHAR(20),
@LogValue_2be82d82 BIT
SET
  @ID_2be82d82 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B17'
SET
  @ActionID_2be82d82 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_2be82d82 = N'Held'
SET
  @Type_2be82d82 = N'Output'
SET
  @ValueType_2be82d82 = N'Scalar'
SET
  @IsArray_2be82d82 = 0
SET
  @Description_2be82d82 = N'Payments not yet cleared, or with a status the decision table does not know.'
SET
  @IsRequired_2be82d82 = 0
SET
  @LogValue_2be82d82 = 1
IF @ActionID_2be82d82 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_2be82d82 OR ([Name] = @Name_2be82d82 AND [ActionID] = @ActionID_2be82d82))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_2be82d82,
  @ActionID = @ActionID_2be82d82,
  @Name = @Name_2be82d82,
  @DefaultValue = @DefaultValue_2be82d82,
  @DefaultValue_Clear = 1,
  @Type = @Type_2be82d82,
  @ValueType = @ValueType_2be82d82,
  @IsArray = @IsArray_2be82d82,
  @Description = @Description_2be82d82,
  @IsRequired = @IsRequired_2be82d82,
  @MediaModality = @MediaModality_2be82d82,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_2be82d82;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_96ed0d7a UNIQUEIDENTIFIER,
@ActionID_96ed0d7a UNIQUEIDENTIFIER,
@Name_96ed0d7a NVARCHAR(255),
@DefaultValue_96ed0d7a NVARCHAR(MAX),
@Type_96ed0d7a NCHAR(10),
@ValueType_96ed0d7a NVARCHAR(30),
@IsArray_96ed0d7a BIT,
@Description_96ed0d7a NVARCHAR(MAX),
@IsRequired_96ed0d7a BIT,
@MediaModality_96ed0d7a NVARCHAR(20),
@LogValue_96ed0d7a BIT
SET
  @ID_96ed0d7a = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B18'
SET
  @ActionID_96ed0d7a = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_96ed0d7a = N'Unmatched'
SET
  @Type_96ed0d7a = N'Output'
SET
  @ValueType_96ed0d7a = N'Scalar'
SET
  @IsArray_96ed0d7a = 0
SET
  @Description_96ed0d7a = N'Payments applied to a Bill.com invoice Orders did not issue. Nothing captured; a person decides.'
SET
  @IsRequired_96ed0d7a = 0
SET
  @LogValue_96ed0d7a = 1
IF @ActionID_96ed0d7a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_96ed0d7a OR ([Name] = @Name_96ed0d7a AND [ActionID] = @ActionID_96ed0d7a))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_96ed0d7a,
  @ActionID = @ActionID_96ed0d7a,
  @Name = @Name_96ed0d7a,
  @DefaultValue = @DefaultValue_96ed0d7a,
  @DefaultValue_Clear = 1,
  @Type = @Type_96ed0d7a,
  @ValueType = @ValueType_96ed0d7a,
  @IsArray = @IsArray_96ed0d7a,
  @Description = @Description_96ed0d7a,
  @IsRequired = @IsRequired_96ed0d7a,
  @MediaModality = @MediaModality_96ed0d7a,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_96ed0d7a;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_461cbd5f UNIQUEIDENTIFIER,
@ActionID_461cbd5f UNIQUEIDENTIFIER,
@Name_461cbd5f NVARCHAR(255),
@DefaultValue_461cbd5f NVARCHAR(MAX),
@Type_461cbd5f NCHAR(10),
@ValueType_461cbd5f NVARCHAR(30),
@IsArray_461cbd5f BIT,
@Description_461cbd5f NVARCHAR(MAX),
@IsRequired_461cbd5f BIT,
@MediaModality_461cbd5f NVARCHAR(20),
@LogValue_461cbd5f BIT
SET
  @ID_461cbd5f = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1E'
SET
  @ActionID_461cbd5f = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_461cbd5f = N'Refused'
SET
  @Type_461cbd5f = N'Output'
SET
  @ValueType_461cbd5f = N'Scalar'
SET
  @IsArray_461cbd5f = 0
SET
  @Description_461cbd5f = N'Payments Orders.CapturePayment refused — a split-company order, an ambiguous payer, a configuration fault. Nothing captured; a person decides. Counts as attention.'
SET
  @IsRequired_461cbd5f = 0
SET
  @LogValue_461cbd5f = 1
IF @ActionID_461cbd5f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_461cbd5f OR ([Name] = @Name_461cbd5f AND [ActionID] = @ActionID_461cbd5f))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_461cbd5f,
  @ActionID = @ActionID_461cbd5f,
  @Name = @Name_461cbd5f,
  @DefaultValue = @DefaultValue_461cbd5f,
  @DefaultValue_Clear = 1,
  @Type = @Type_461cbd5f,
  @ValueType = @ValueType_461cbd5f,
  @IsArray = @IsArray_461cbd5f,
  @Description = @Description_461cbd5f,
  @IsRequired = @IsRequired_461cbd5f,
  @MediaModality = @MediaModality_461cbd5f,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_461cbd5f;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_9d4c3aea UNIQUEIDENTIFIER,
@ActionID_9d4c3aea UNIQUEIDENTIFIER,
@Name_9d4c3aea NVARCHAR(255),
@DefaultValue_9d4c3aea NVARCHAR(MAX),
@Type_9d4c3aea NCHAR(10),
@ValueType_9d4c3aea NVARCHAR(30),
@IsArray_9d4c3aea BIT,
@Description_9d4c3aea NVARCHAR(MAX),
@IsRequired_9d4c3aea BIT,
@MediaModality_9d4c3aea NVARCHAR(20),
@LogValue_9d4c3aea BIT
SET
  @ID_9d4c3aea = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B19'
SET
  @ActionID_9d4c3aea = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_9d4c3aea = N'ReversalNeeded'
SET
  @Type_9d4c3aea = N'Output'
SET
  @ValueType_9d4c3aea = N'Scalar'
SET
  @IsArray_9d4c3aea = 0
SET
  @Description_9d4c3aea = N'Payments captured earlier that Bill.com now reports void or failed. Reverse through the bank-return path.'
SET
  @IsRequired_9d4c3aea = 0
SET
  @LogValue_9d4c3aea = 1
IF @ActionID_9d4c3aea IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_9d4c3aea OR ([Name] = @Name_9d4c3aea AND [ActionID] = @ActionID_9d4c3aea))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_9d4c3aea,
  @ActionID = @ActionID_9d4c3aea,
  @Name = @Name_9d4c3aea,
  @DefaultValue = @DefaultValue_9d4c3aea,
  @DefaultValue_Clear = 1,
  @Type = @Type_9d4c3aea,
  @ValueType = @ValueType_9d4c3aea,
  @IsArray = @IsArray_9d4c3aea,
  @Description = @Description_9d4c3aea,
  @IsRequired = @IsRequired_9d4c3aea,
  @MediaModality = @MediaModality_9d4c3aea,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_9d4c3aea;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_94f0c70f UNIQUEIDENTIFIER,
@ActionID_94f0c70f UNIQUEIDENTIFIER,
@Name_94f0c70f NVARCHAR(255),
@DefaultValue_94f0c70f NVARCHAR(MAX),
@Type_94f0c70f NCHAR(10),
@ValueType_94f0c70f NVARCHAR(30),
@IsArray_94f0c70f BIT,
@Description_94f0c70f NVARCHAR(MAX),
@IsRequired_94f0c70f BIT,
@MediaModality_94f0c70f NVARCHAR(20),
@LogValue_94f0c70f BIT
SET
  @ID_94f0c70f = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1A'
SET
  @ActionID_94f0c70f = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_94f0c70f = N'Ignored'
SET
  @Type_94f0c70f = N'Output'
SET
  @ValueType_94f0c70f = N'Scalar'
SET
  @IsArray_94f0c70f = 0
SET
  @Description_94f0c70f = N'Payments already known and unchanged.'
SET
  @IsRequired_94f0c70f = 0
SET
  @LogValue_94f0c70f = 1
IF @ActionID_94f0c70f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_94f0c70f OR ([Name] = @Name_94f0c70f AND [ActionID] = @ActionID_94f0c70f))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_94f0c70f,
  @ActionID = @ActionID_94f0c70f,
  @Name = @Name_94f0c70f,
  @DefaultValue = @DefaultValue_94f0c70f,
  @DefaultValue_Clear = 1,
  @Type = @Type_94f0c70f,
  @ValueType = @ValueType_94f0c70f,
  @IsArray = @IsArray_94f0c70f,
  @Description = @Description_94f0c70f,
  @IsRequired = @IsRequired_94f0c70f,
  @MediaModality = @MediaModality_94f0c70f,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_94f0c70f;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_a4658960 UNIQUEIDENTIFIER,
@ActionID_a4658960 UNIQUEIDENTIFIER,
@Name_a4658960 NVARCHAR(255),
@DefaultValue_a4658960 NVARCHAR(MAX),
@Type_a4658960 NCHAR(10),
@ValueType_a4658960 NVARCHAR(30),
@IsArray_a4658960 BIT,
@Description_a4658960 NVARCHAR(MAX),
@IsRequired_a4658960 BIT,
@MediaModality_a4658960 NVARCHAR(20),
@LogValue_a4658960 BIT
SET
  @ID_a4658960 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1B'
SET
  @ActionID_a4658960 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_a4658960 = N'Outcomes'
SET
  @Type_a4658960 = N'Output'
SET
  @ValueType_a4658960 = N'Simple Object'
SET
  @IsArray_a4658960 = 1
SET
  @Description_a4658960 = N'Every payment considered, with its disposition and reason. Stored on the ScheduledJobRun.'
SET
  @IsRequired_a4658960 = 0
SET
  @LogValue_a4658960 = 1
IF @ActionID_a4658960 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_a4658960 OR ([Name] = @Name_a4658960 AND [ActionID] = @ActionID_a4658960))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_a4658960,
  @ActionID = @ActionID_a4658960,
  @Name = @Name_a4658960,
  @DefaultValue = @DefaultValue_a4658960,
  @DefaultValue_Clear = 1,
  @Type = @Type_a4658960,
  @ValueType = @ValueType_a4658960,
  @IsArray = @IsArray_a4658960,
  @Description = @Description_a4658960,
  @IsRequired = @IsRequired_a4658960,
  @MediaModality = @MediaModality_a4658960,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_a4658960;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_d54e3707 UNIQUEIDENTIFIER,
@ActionID_d54e3707 UNIQUEIDENTIFIER,
@Name_d54e3707 NVARCHAR(255),
@DefaultValue_d54e3707 NVARCHAR(MAX),
@Type_d54e3707 NCHAR(10),
@ValueType_d54e3707 NVARCHAR(30),
@IsArray_d54e3707 BIT,
@Description_d54e3707 NVARCHAR(MAX),
@IsRequired_d54e3707 BIT,
@MediaModality_d54e3707 NVARCHAR(20),
@LogValue_d54e3707 BIT
SET
  @ID_d54e3707 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1C'
SET
  @ActionID_d54e3707 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_d54e3707 = N'NewWatermarks'
SET
  @Type_d54e3707 = N'Output'
SET
  @ValueType_d54e3707 = N'Simple Object'
SET
  @IsArray_d54e3707 = 1
SET
  @Description_d54e3707 = N'The watermark each provider row ended the pass on.'
SET
  @IsRequired_d54e3707 = 0
SET
  @LogValue_d54e3707 = 1
IF @ActionID_d54e3707 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_d54e3707 OR ([Name] = @Name_d54e3707 AND [ActionID] = @ActionID_d54e3707))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_d54e3707,
  @ActionID = @ActionID_d54e3707,
  @Name = @Name_d54e3707,
  @DefaultValue = @DefaultValue_d54e3707,
  @DefaultValue_Clear = 1,
  @Type = @Type_d54e3707,
  @ValueType = @ValueType_d54e3707,
  @IsArray = @IsArray_d54e3707,
  @Description = @Description_d54e3707,
  @IsRequired = @IsRequired_d54e3707,
  @MediaModality = @MediaModality_d54e3707,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_d54e3707;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_28039c8e UNIQUEIDENTIFIER,
@ActionID_28039c8e UNIQUEIDENTIFIER,
@Name_28039c8e NVARCHAR(255),
@DefaultValue_28039c8e NVARCHAR(MAX),
@Type_28039c8e NCHAR(10),
@ValueType_28039c8e NVARCHAR(30),
@IsArray_28039c8e BIT,
@Description_28039c8e NVARCHAR(MAX),
@IsRequired_28039c8e BIT,
@MediaModality_28039c8e NVARCHAR(20),
@LogValue_28039c8e BIT
SET
  @ID_28039c8e = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1D'
SET
  @ActionID_28039c8e = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_28039c8e = N'PreviewedOnly'
SET
  @Type_28039c8e = N'Output'
SET
  @ValueType_28039c8e = N'Scalar'
SET
  @IsArray_28039c8e = 0
SET
  @Description_28039c8e = N'True when this pass was a rehearsal.'
SET
  @IsRequired_28039c8e = 0
SET
  @LogValue_28039c8e = 1
IF @ActionID_28039c8e IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_28039c8e OR ([Name] = @Name_28039c8e AND [ActionID] = @ActionID_28039c8e))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_28039c8e,
  @ActionID = @ActionID_28039c8e,
  @Name = @Name_28039c8e,
  @DefaultValue = @DefaultValue_28039c8e,
  @DefaultValue_Clear = 1,
  @Type = @Type_28039c8e,
  @ValueType = @ValueType_28039c8e,
  @IsArray = @IsArray_28039c8e,
  @Description = @Description_28039c8e,
  @IsRequired = @IsRequired_28039c8e,
  @MediaModality = @MediaModality_28039c8e,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_28039c8e;

GO

-- Save MJ: Scheduled Jobs (core SP call only)
DECLARE @ID_e9ec7840 UNIQUEIDENTIFIER,
@JobTypeID_e9ec7840 UNIQUEIDENTIFIER,
@Name_e9ec7840 NVARCHAR(200),
@Description_e9ec7840 NVARCHAR(MAX),
@CronExpression_e9ec7840 NVARCHAR(120),
@Timezone_e9ec7840 NVARCHAR(64),
@StartAt_e9ec7840 DATETIMEOFFSET,
@EndAt_e9ec7840 DATETIMEOFFSET,
@Status_e9ec7840 NVARCHAR(20),
@Configuration_e9ec7840 NVARCHAR(MAX),
@OwnerUserID_e9ec7840 UNIQUEIDENTIFIER,
@LastRunAt_e9ec7840 DATETIMEOFFSET,
@NextRunAt_e9ec7840 DATETIMEOFFSET,
@RunCount_e9ec7840 INT,
@SuccessCount_e9ec7840 INT,
@FailureCount_e9ec7840 INT,
@NotifyOnSuccess_e9ec7840 BIT,
@NotifyOnFailure_e9ec7840 BIT,
@NotifyUserID_e9ec7840 UNIQUEIDENTIFIER,
@NotifyViaEmail_e9ec7840 BIT,
@NotifyViaInApp_e9ec7840 BIT,
@LockToken_e9ec7840 UNIQUEIDENTIFIER,
@LockedAt_e9ec7840 DATETIMEOFFSET,
@LockedByInstance_e9ec7840 NVARCHAR(255),
@ExpectedCompletionAt_e9ec7840 DATETIMEOFFSET,
@ConcurrencyMode_e9ec7840 NVARCHAR(20),
@RunImmediatelyIfNeverRun_e9ec7840 BIT,
@MaxRuntimeMinutes_e9ec7840 INT,
@MissedRunPolicy_e9ec7840 NVARCHAR(20)
SET
  @ID_e9ec7840 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B20'
SET
  @JobTypeID_e9ec7840 = ISNULL((SELECT TOP 1 [ID] FROM [${mjSchema}].[ScheduledJobType] WHERE [Name] = N'Action'), '3B94DD43-E961-4D85-B7F4-B6783D748766')
SET
  @Name_e9ec7840 = N'Orders — Send External Invoices (half-hourly, business hours)'
SET
  @Description_e9ec7840 = N'Creates Bill.com invoices for billing units that have become invoiceable: confirmed orders billed as a whole and issued instalments. Ships disabled and set to Preview: enable it, confirm the Results list on the run, then set Preview to false to begin sending.'
SET
  @CronExpression_e9ec7840 = N'0 */30 13-23 * * 1-5'
SET
  @Timezone_e9ec7840 = N'UTC'
SET
  @Status_e9ec7840 = N'Disabled'
SET
  @Configuration_e9ec7840 = N'{"ActionID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01", "Params": [{"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04", "ValueType": "Static", "Value": "true"}, {"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B03", "ValueType": "Static", "Value": "25"}]}'
SET
  @RunCount_e9ec7840 = 0
SET
  @SuccessCount_e9ec7840 = 0
SET
  @FailureCount_e9ec7840 = 0
SET
  @NotifyOnSuccess_e9ec7840 = 0
SET
  @NotifyOnFailure_e9ec7840 = 1
SET
  @NotifyViaEmail_e9ec7840 = 0
SET
  @NotifyViaInApp_e9ec7840 = 1
SET
  @ConcurrencyMode_e9ec7840 = N'Skip'
SET
  @RunImmediatelyIfNeverRun_e9ec7840 = 0
SET
  @MaxRuntimeMinutes_e9ec7840 = 20
SET
  @MissedRunPolicy_e9ec7840 = N'RunOnce'
IF @JobTypeID_e9ec7840 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ScheduledJob]
               WHERE [ID] = @ID_e9ec7840 OR [Name] = @Name_e9ec7840)
EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_e9ec7840,
  @JobTypeID = @JobTypeID_e9ec7840,
  @Name = @Name_e9ec7840,
  @Description = @Description_e9ec7840,
  @CronExpression = @CronExpression_e9ec7840,
  @Timezone = @Timezone_e9ec7840,
  @StartAt = @StartAt_e9ec7840,
  @StartAt_Clear = 1,
  @EndAt = @EndAt_e9ec7840,
  @EndAt_Clear = 1,
  @Status = @Status_e9ec7840,
  @Configuration = @Configuration_e9ec7840,
  @OwnerUserID = @OwnerUserID_e9ec7840,
  @OwnerUserID_Clear = 1,
  @LastRunAt = @LastRunAt_e9ec7840,
  @LastRunAt_Clear = 1,
  @NextRunAt = @NextRunAt_e9ec7840,
  @NextRunAt_Clear = 1,
  @RunCount = @RunCount_e9ec7840,
  @SuccessCount = @SuccessCount_e9ec7840,
  @FailureCount = @FailureCount_e9ec7840,
  @NotifyOnSuccess = @NotifyOnSuccess_e9ec7840,
  @NotifyOnFailure = @NotifyOnFailure_e9ec7840,
  @NotifyUserID = @NotifyUserID_e9ec7840,
  @NotifyUserID_Clear = 1,
  @NotifyViaEmail = @NotifyViaEmail_e9ec7840,
  @NotifyViaInApp = @NotifyViaInApp_e9ec7840,
  @LockToken = @LockToken_e9ec7840,
  @LockToken_Clear = 1,
  @LockedAt = @LockedAt_e9ec7840,
  @LockedAt_Clear = 1,
  @LockedByInstance = @LockedByInstance_e9ec7840,
  @LockedByInstance_Clear = 1,
  @ExpectedCompletionAt = @ExpectedCompletionAt_e9ec7840,
  @ExpectedCompletionAt_Clear = 1,
  @ConcurrencyMode = @ConcurrencyMode_e9ec7840,
  @RunImmediatelyIfNeverRun = @RunImmediatelyIfNeverRun_e9ec7840,
  @MaxRuntimeMinutes = @MaxRuntimeMinutes_e9ec7840,
  @MissedRunPolicy = @MissedRunPolicy_e9ec7840;

GO

-- Save MJ: Scheduled Jobs (core SP call only)
DECLARE @ID_6cba4b5c UNIQUEIDENTIFIER,
@JobTypeID_6cba4b5c UNIQUEIDENTIFIER,
@Name_6cba4b5c NVARCHAR(200),
@Description_6cba4b5c NVARCHAR(MAX),
@CronExpression_6cba4b5c NVARCHAR(120),
@Timezone_6cba4b5c NVARCHAR(64),
@StartAt_6cba4b5c DATETIMEOFFSET,
@EndAt_6cba4b5c DATETIMEOFFSET,
@Status_6cba4b5c NVARCHAR(20),
@Configuration_6cba4b5c NVARCHAR(MAX),
@OwnerUserID_6cba4b5c UNIQUEIDENTIFIER,
@LastRunAt_6cba4b5c DATETIMEOFFSET,
@NextRunAt_6cba4b5c DATETIMEOFFSET,
@RunCount_6cba4b5c INT,
@SuccessCount_6cba4b5c INT,
@FailureCount_6cba4b5c INT,
@NotifyOnSuccess_6cba4b5c BIT,
@NotifyOnFailure_6cba4b5c BIT,
@NotifyUserID_6cba4b5c UNIQUEIDENTIFIER,
@NotifyViaEmail_6cba4b5c BIT,
@NotifyViaInApp_6cba4b5c BIT,
@LockToken_6cba4b5c UNIQUEIDENTIFIER,
@LockedAt_6cba4b5c DATETIMEOFFSET,
@LockedByInstance_6cba4b5c NVARCHAR(255),
@ExpectedCompletionAt_6cba4b5c DATETIMEOFFSET,
@ConcurrencyMode_6cba4b5c NVARCHAR(20),
@RunImmediatelyIfNeverRun_6cba4b5c BIT,
@MaxRuntimeMinutes_6cba4b5c INT,
@MissedRunPolicy_6cba4b5c NVARCHAR(20)
SET
  @ID_6cba4b5c = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B21'
SET
  @JobTypeID_6cba4b5c = ISNULL((SELECT TOP 1 [ID] FROM [${mjSchema}].[ScheduledJobType] WHERE [Name] = N'Action'), '3B94DD43-E961-4D85-B7F4-B6783D748766')
SET
  @Name_6cba4b5c = N'Orders — Poll External Payments (hourly)'
SET
  @Description_6cba4b5c = N'Reads cleared customer payments from Bill.com and records each once against the orders its invoices belong to. Ships disabled and set to Preview: enable it, confirm the Outcomes list on the run, then set Preview to false to begin recording cash.'
SET
  @CronExpression_6cba4b5c = N'0 15 * * * *'
SET
  @Timezone_6cba4b5c = N'UTC'
SET
  @Status_6cba4b5c = N'Disabled'
SET
  @Configuration_6cba4b5c = N'{"ActionID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11", "Params": [{"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13", "ValueType": "Static", "Value": "true"}, {"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B14", "ValueType": "Static", "Value": "100"}]}'
SET
  @RunCount_6cba4b5c = 0
SET
  @SuccessCount_6cba4b5c = 0
SET
  @FailureCount_6cba4b5c = 0
SET
  @NotifyOnSuccess_6cba4b5c = 0
SET
  @NotifyOnFailure_6cba4b5c = 1
SET
  @NotifyViaEmail_6cba4b5c = 0
SET
  @NotifyViaInApp_6cba4b5c = 1
SET
  @ConcurrencyMode_6cba4b5c = N'Skip'
SET
  @RunImmediatelyIfNeverRun_6cba4b5c = 0
SET
  @MaxRuntimeMinutes_6cba4b5c = 30
SET
  @MissedRunPolicy_6cba4b5c = N'RunOnce'
IF @JobTypeID_6cba4b5c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ScheduledJob]
               WHERE [ID] = @ID_6cba4b5c OR [Name] = @Name_6cba4b5c)
EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_6cba4b5c,
  @JobTypeID = @JobTypeID_6cba4b5c,
  @Name = @Name_6cba4b5c,
  @Description = @Description_6cba4b5c,
  @CronExpression = @CronExpression_6cba4b5c,
  @Timezone = @Timezone_6cba4b5c,
  @StartAt = @StartAt_6cba4b5c,
  @StartAt_Clear = 1,
  @EndAt = @EndAt_6cba4b5c,
  @EndAt_Clear = 1,
  @Status = @Status_6cba4b5c,
  @Configuration = @Configuration_6cba4b5c,
  @OwnerUserID = @OwnerUserID_6cba4b5c,
  @OwnerUserID_Clear = 1,
  @LastRunAt = @LastRunAt_6cba4b5c,
  @LastRunAt_Clear = 1,
  @NextRunAt = @NextRunAt_6cba4b5c,
  @NextRunAt_Clear = 1,
  @RunCount = @RunCount_6cba4b5c,
  @SuccessCount = @SuccessCount_6cba4b5c,
  @FailureCount = @FailureCount_6cba4b5c,
  @NotifyOnSuccess = @NotifyOnSuccess_6cba4b5c,
  @NotifyOnFailure = @NotifyOnFailure_6cba4b5c,
  @NotifyUserID = @NotifyUserID_6cba4b5c,
  @NotifyUserID_Clear = 1,
  @NotifyViaEmail = @NotifyViaEmail_6cba4b5c,
  @NotifyViaInApp = @NotifyViaInApp_6cba4b5c,
  @LockToken = @LockToken_6cba4b5c,
  @LockToken_Clear = 1,
  @LockedAt = @LockedAt_6cba4b5c,
  @LockedAt_Clear = 1,
  @LockedByInstance = @LockedByInstance_6cba4b5c,
  @LockedByInstance_Clear = 1,
  @ExpectedCompletionAt = @ExpectedCompletionAt_6cba4b5c,
  @ExpectedCompletionAt_Clear = 1,
  @ConcurrencyMode = @ConcurrencyMode_6cba4b5c,
  @RunImmediatelyIfNeverRun = @RunImmediatelyIfNeverRun_6cba4b5c,
  @MaxRuntimeMinutes = @MaxRuntimeMinutes_6cba4b5c,
  @MissedRunPolicy = @MissedRunPolicy_6cba4b5c;

GO

