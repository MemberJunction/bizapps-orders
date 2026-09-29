-- =============================================================================================
-- BizApps Orders v5.20.x -- Bill.com integration metadata (golive #146 / #147 / #148 / #242)
-- =============================================================================================
-- Ships the declarative metadata this feature adds under metadata/, so it reaches a host:
--   * Payment Provider Types -- BillCom, the type a PaymentProvider row is created against
--   * MJ: Remote Operations  -- the six Orders.*ExternalInvoice* / *ExternalPayments* operations
--   * MJ: Actions            -- the two scheduler adapters, with their 23 params
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
-- against a database that did not yet have them (2026-09-28), so every one is an spCreate and
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
DECLARE @ID_8f9c9514 UNIQUEIDENTIFIER,
@Code_8f9c9514 NVARCHAR(40),
@Name_8f9c9514 NVARCHAR(200),
@Description_8f9c9514 NVARCHAR(MAX),
@DriverClass_8f9c9514 NVARCHAR(200),
@SupportsTokenization_8f9c9514 BIT,
@SupportsRefund_8f9c9514 BIT,
@SupportsWebhooks_8f9c9514 BIT,
@Sequence_8f9c9514 INT,
@IsActive_8f9c9514 BIT
SET
  @ID_8f9c9514 = '8B4C2E10-5D93-4A6F-B7C8-1E2F3A4B5C06'
SET
  @Code_8f9c9514 = N'BillCom'
SET
  @Name_8f9c9514 = N'Bill.com'
SET
  @Description_8f9c9514 = N'Bill.com accounts receivable. Invoices are created in Bill.com when a billing unit becomes invoiceable; cleared receivable payments are polled and captured once. Not a checkout rail — no intents, no card capture, no refunds through this type.'
SET
  @DriverClass_8f9c9514 = N'BillComPaymentProvider'
SET
  @SupportsTokenization_8f9c9514 = 0
SET
  @SupportsRefund_8f9c9514 = 0
SET
  @SupportsWebhooks_8f9c9514 = 0
SET
  @Sequence_8f9c9514 = 50
SET
  @IsActive_8f9c9514 = 1
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[PaymentProviderType]
               WHERE [ID] = @ID_8f9c9514 OR [Code] = @Code_8f9c9514)
EXEC [${flyway:defaultSchema}].spCreatePaymentProviderType @ID = @ID_8f9c9514,
  @Code = @Code_8f9c9514,
  @Name = @Name_8f9c9514,
  @Description = @Description_8f9c9514,
  @DriverClass = @DriverClass_8f9c9514,
  @SupportsTokenization = @SupportsTokenization_8f9c9514,
  @SupportsRefund = @SupportsRefund_8f9c9514,
  @SupportsWebhooks = @SupportsWebhooks_8f9c9514,
  @Sequence = @Sequence_8f9c9514,
  @IsActive = @IsActive_8f9c9514;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_651a0f94 UNIQUEIDENTIFIER,
@Name_651a0f94 NVARCHAR(255),
@OperationKey_651a0f94 NVARCHAR(255),
@CategoryID_651a0f94 UNIQUEIDENTIFIER,
@Description_651a0f94 NVARCHAR(MAX),
@InputTypeName_651a0f94 NVARCHAR(255),
@InputTypeDefinition_651a0f94 NVARCHAR(MAX),
@InputTypeIsArray_651a0f94 BIT,
@OutputTypeName_651a0f94 NVARCHAR(255),
@OutputTypeDefinition_651a0f94 NVARCHAR(MAX),
@OutputTypeIsArray_651a0f94 BIT,
@ExecutionMode_651a0f94 NVARCHAR(20),
@RequiredScope_651a0f94 NVARCHAR(255),
@RequiresSystemUser_651a0f94 BIT,
@GenerationType_651a0f94 NVARCHAR(20),
@Code_651a0f94 NVARCHAR(MAX),
@CodeApprovalStatus_651a0f94 NVARCHAR(20),
@CodeApprovedByUserID_651a0f94 UNIQUEIDENTIFIER,
@CodeApprovedAt_651a0f94 DATETIMEOFFSET,
@ContractFingerprint_651a0f94 NVARCHAR(100),
@Status_651a0f94 NVARCHAR(20),
@CacheTTLSeconds_651a0f94 INT,
@TimeoutMS_651a0f94 INT,
@MaxConcurrency_651a0f94 INT,
@CodeLocked_651a0f94 BIT,
@CodeComments_651a0f94 NVARCHAR(MAX),
@Libraries_651a0f94 NVARCHAR(MAX)
SET
  @ID_651a0f94 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A04'
SET
  @Name_651a0f94 = N'Send External Invoices'
SET
  @OperationKey_651a0f94 = N'Orders.SendExternalInvoices'
SET
  @CategoryID_651a0f94 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_651a0f94 = N'The sweep: work the external invoicing worklist through Orders.IssueExternalInvoice, capped by MaxCount, with Preview listing what would be sent. Retries transient failures; never re-issues a cancelled unit. The scheduled caller for Bill.com invoicing.'
SET
  @InputTypeName_651a0f94 = N'OrdersSendExternalInvoicesInput'
SET
  @InputTypeDefinition_651a0f94 = N'/**
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
  @InputTypeIsArray_651a0f94 = 0
SET
  @OutputTypeName_651a0f94 = N'OrdersSendExternalInvoicesOutput'
SET
  @OutputTypeDefinition_651a0f94 = N'/**
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
  @OutputTypeIsArray_651a0f94 = 0
SET
  @ExecutionMode_651a0f94 = N'LongRunning'
SET
  @RequiredScope_651a0f94 = N'orders:write'
SET
  @RequiresSystemUser_651a0f94 = 0
SET
  @GenerationType_651a0f94 = N'Manual'
SET
  @CodeApprovalStatus_651a0f94 = N'Approved'
SET
  @Status_651a0f94 = N'Active'
SET
  @CodeLocked_651a0f94 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_651a0f94 OR [OperationKey] = @OperationKey_651a0f94)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_651a0f94,
  @Name = @Name_651a0f94,
  @OperationKey = @OperationKey_651a0f94,
  @CategoryID = @CategoryID_651a0f94,
  @Description = @Description_651a0f94,
  @InputTypeName = @InputTypeName_651a0f94,
  @InputTypeDefinition = @InputTypeDefinition_651a0f94,
  @InputTypeIsArray = @InputTypeIsArray_651a0f94,
  @OutputTypeName = @OutputTypeName_651a0f94,
  @OutputTypeDefinition = @OutputTypeDefinition_651a0f94,
  @OutputTypeIsArray = @OutputTypeIsArray_651a0f94,
  @ExecutionMode = @ExecutionMode_651a0f94,
  @RequiredScope = @RequiredScope_651a0f94,
  @RequiresSystemUser = @RequiresSystemUser_651a0f94,
  @GenerationType = @GenerationType_651a0f94,
  @Code = @Code_651a0f94,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_651a0f94,
  @CodeApprovedByUserID = @CodeApprovedByUserID_651a0f94,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_651a0f94,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_651a0f94,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_651a0f94,
  @CacheTTLSeconds = @CacheTTLSeconds_651a0f94,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_651a0f94,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_651a0f94,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_651a0f94,
  @CodeComments = @CodeComments_651a0f94,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_651a0f94,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_7353c339 UNIQUEIDENTIFIER,
@Name_7353c339 NVARCHAR(255),
@OperationKey_7353c339 NVARCHAR(255),
@CategoryID_7353c339 UNIQUEIDENTIFIER,
@Description_7353c339 NVARCHAR(MAX),
@InputTypeName_7353c339 NVARCHAR(255),
@InputTypeDefinition_7353c339 NVARCHAR(MAX),
@InputTypeIsArray_7353c339 BIT,
@OutputTypeName_7353c339 NVARCHAR(255),
@OutputTypeDefinition_7353c339 NVARCHAR(MAX),
@OutputTypeIsArray_7353c339 BIT,
@ExecutionMode_7353c339 NVARCHAR(20),
@RequiredScope_7353c339 NVARCHAR(255),
@RequiresSystemUser_7353c339 BIT,
@GenerationType_7353c339 NVARCHAR(20),
@Code_7353c339 NVARCHAR(MAX),
@CodeApprovalStatus_7353c339 NVARCHAR(20),
@CodeApprovedByUserID_7353c339 UNIQUEIDENTIFIER,
@CodeApprovedAt_7353c339 DATETIMEOFFSET,
@ContractFingerprint_7353c339 NVARCHAR(100),
@Status_7353c339 NVARCHAR(20),
@CacheTTLSeconds_7353c339 INT,
@TimeoutMS_7353c339 INT,
@MaxConcurrency_7353c339 INT,
@CodeLocked_7353c339 BIT,
@CodeComments_7353c339 NVARCHAR(MAX),
@Libraries_7353c339 NVARCHAR(MAX)
SET
  @ID_7353c339 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A05'
SET
  @Name_7353c339 = N'Poll External Payments'
SET
  @OperationKey_7353c339 = N'Orders.PollExternalPayments'
SET
  @CategoryID_7353c339 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_7353c339 = N'Read receivable payments from each company''s external AR rail (Bill.com) since the stored watermark and capture every cleared payment exactly once through Orders.CapturePayment, fanned out to the orders its invoices belong to. Unknown statuses are held, unmatched invoices capture nothing, and reversals are flagged for a person. Poll-authoritative: Bill.com publishes no payment-received webhook.'
SET
  @InputTypeName_7353c339 = N'OrdersPollExternalPaymentsInput'
SET
  @InputTypeDefinition_7353c339 = N'/**
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
  @InputTypeIsArray_7353c339 = 0
SET
  @OutputTypeName_7353c339 = N'OrdersPollExternalPaymentsOutput'
SET
  @OutputTypeDefinition_7353c339 = N'/**
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
  @OutputTypeIsArray_7353c339 = 0
SET
  @ExecutionMode_7353c339 = N'LongRunning'
SET
  @RequiredScope_7353c339 = N'orders:write'
SET
  @RequiresSystemUser_7353c339 = 0
SET
  @GenerationType_7353c339 = N'Manual'
SET
  @CodeApprovalStatus_7353c339 = N'Approved'
SET
  @Status_7353c339 = N'Active'
SET
  @CodeLocked_7353c339 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_7353c339 OR [OperationKey] = @OperationKey_7353c339)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_7353c339,
  @Name = @Name_7353c339,
  @OperationKey = @OperationKey_7353c339,
  @CategoryID = @CategoryID_7353c339,
  @Description = @Description_7353c339,
  @InputTypeName = @InputTypeName_7353c339,
  @InputTypeDefinition = @InputTypeDefinition_7353c339,
  @InputTypeIsArray = @InputTypeIsArray_7353c339,
  @OutputTypeName = @OutputTypeName_7353c339,
  @OutputTypeDefinition = @OutputTypeDefinition_7353c339,
  @OutputTypeIsArray = @OutputTypeIsArray_7353c339,
  @ExecutionMode = @ExecutionMode_7353c339,
  @RequiredScope = @RequiredScope_7353c339,
  @RequiresSystemUser = @RequiresSystemUser_7353c339,
  @GenerationType = @GenerationType_7353c339,
  @Code = @Code_7353c339,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_7353c339,
  @CodeApprovedByUserID = @CodeApprovedByUserID_7353c339,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_7353c339,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_7353c339,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_7353c339,
  @CacheTTLSeconds = @CacheTTLSeconds_7353c339,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_7353c339,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_7353c339,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_7353c339,
  @CodeComments = @CodeComments_7353c339,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_7353c339,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_706be237 UNIQUEIDENTIFIER,
@Name_706be237 NVARCHAR(255),
@OperationKey_706be237 NVARCHAR(255),
@CategoryID_706be237 UNIQUEIDENTIFIER,
@Description_706be237 NVARCHAR(MAX),
@InputTypeName_706be237 NVARCHAR(255),
@InputTypeDefinition_706be237 NVARCHAR(MAX),
@InputTypeIsArray_706be237 BIT,
@OutputTypeName_706be237 NVARCHAR(255),
@OutputTypeDefinition_706be237 NVARCHAR(MAX),
@OutputTypeIsArray_706be237 BIT,
@ExecutionMode_706be237 NVARCHAR(20),
@RequiredScope_706be237 NVARCHAR(255),
@RequiresSystemUser_706be237 BIT,
@GenerationType_706be237 NVARCHAR(20),
@Code_706be237 NVARCHAR(MAX),
@CodeApprovalStatus_706be237 NVARCHAR(20),
@CodeApprovedByUserID_706be237 UNIQUEIDENTIFIER,
@CodeApprovedAt_706be237 DATETIMEOFFSET,
@ContractFingerprint_706be237 NVARCHAR(100),
@Status_706be237 NVARCHAR(20),
@CacheTTLSeconds_706be237 INT,
@TimeoutMS_706be237 INT,
@MaxConcurrency_706be237 INT,
@CodeLocked_706be237 BIT,
@CodeComments_706be237 NVARCHAR(MAX),
@Libraries_706be237 NVARCHAR(MAX)
SET
  @ID_706be237 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A06'
SET
  @Name_706be237 = N'Adopt External Invoice'
SET
  @OperationKey_706be237 = N'Orders.AdoptExternalInvoice'
SET
  @CategoryID_706be237 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_706be237 = N'Attaches an invoice the rail already holds to a unit whose send was never confirmed. A timed-out send leaves the unit claimed on purpose — the rail may or may not have committed the invoice, and retrying blindly is how one billing unit becomes two invoices in a customer''s inbox. This is the half of the answer where the invoice IS there; re-issuing with AllowReissue is the half where it is not. Reads the invoice back and refuses if its total does not tie to the unit.'
SET
  @InputTypeName_706be237 = N'OrdersAdoptExternalInvoiceInput'
SET
  @InputTypeDefinition_706be237 = N'/**
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
  @InputTypeIsArray_706be237 = 0
SET
  @OutputTypeName_706be237 = N'OrdersAdoptExternalInvoiceOutput'
SET
  @OutputTypeDefinition_706be237 = N'/**
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
  @OutputTypeIsArray_706be237 = 0
SET
  @ExecutionMode_706be237 = N'Sync'
SET
  @RequiredScope_706be237 = N'orders:write'
SET
  @RequiresSystemUser_706be237 = 0
SET
  @GenerationType_706be237 = N'Manual'
SET
  @CodeApprovalStatus_706be237 = N'Approved'
SET
  @Status_706be237 = N'Active'
SET
  @CodeLocked_706be237 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_706be237 OR [OperationKey] = @OperationKey_706be237)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_706be237,
  @Name = @Name_706be237,
  @OperationKey = @OperationKey_706be237,
  @CategoryID = @CategoryID_706be237,
  @Description = @Description_706be237,
  @InputTypeName = @InputTypeName_706be237,
  @InputTypeDefinition = @InputTypeDefinition_706be237,
  @InputTypeIsArray = @InputTypeIsArray_706be237,
  @OutputTypeName = @OutputTypeName_706be237,
  @OutputTypeDefinition = @OutputTypeDefinition_706be237,
  @OutputTypeIsArray = @OutputTypeIsArray_706be237,
  @ExecutionMode = @ExecutionMode_706be237,
  @RequiredScope = @RequiredScope_706be237,
  @RequiresSystemUser = @RequiresSystemUser_706be237,
  @GenerationType = @GenerationType_706be237,
  @Code = @Code_706be237,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_706be237,
  @CodeApprovedByUserID = @CodeApprovedByUserID_706be237,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_706be237,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_706be237,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_706be237,
  @CacheTTLSeconds = @CacheTTLSeconds_706be237,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_706be237,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_706be237,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_706be237,
  @CodeComments = @CodeComments_706be237,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_706be237,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_0846fbbf UNIQUEIDENTIFIER,
@Name_0846fbbf NVARCHAR(255),
@OperationKey_0846fbbf NVARCHAR(255),
@CategoryID_0846fbbf UNIQUEIDENTIFIER,
@Description_0846fbbf NVARCHAR(MAX),
@InputTypeName_0846fbbf NVARCHAR(255),
@InputTypeDefinition_0846fbbf NVARCHAR(MAX),
@InputTypeIsArray_0846fbbf BIT,
@OutputTypeName_0846fbbf NVARCHAR(255),
@OutputTypeDefinition_0846fbbf NVARCHAR(MAX),
@OutputTypeIsArray_0846fbbf BIT,
@ExecutionMode_0846fbbf NVARCHAR(20),
@RequiredScope_0846fbbf NVARCHAR(255),
@RequiresSystemUser_0846fbbf BIT,
@GenerationType_0846fbbf NVARCHAR(20),
@Code_0846fbbf NVARCHAR(MAX),
@CodeApprovalStatus_0846fbbf NVARCHAR(20),
@CodeApprovedByUserID_0846fbbf UNIQUEIDENTIFIER,
@CodeApprovedAt_0846fbbf DATETIMEOFFSET,
@ContractFingerprint_0846fbbf NVARCHAR(100),
@Status_0846fbbf NVARCHAR(20),
@CacheTTLSeconds_0846fbbf INT,
@TimeoutMS_0846fbbf INT,
@MaxConcurrency_0846fbbf INT,
@CodeLocked_0846fbbf BIT,
@CodeComments_0846fbbf NVARCHAR(MAX),
@Libraries_0846fbbf NVARCHAR(MAX)
SET
  @ID_0846fbbf = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A02'
SET
  @Name_0846fbbf = N'Cancel External Invoice'
SET
  @OperationKey_0846fbbf = N'Orders.CancelExternalInvoice'
SET
  @CategoryID_0846fbbf = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_0846fbbf = N'Withdraw an unpaid invoice from the external rail (Bill.com archives it). Blocked when any payment is applied to the unit here or visible on the rail. No accounting event; the unit reads as unsent again and can be re-issued deliberately.'
SET
  @InputTypeName_0846fbbf = N'OrdersCancelExternalInvoiceInput'
SET
  @InputTypeDefinition_0846fbbf = N'/**
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
  @InputTypeIsArray_0846fbbf = 0
SET
  @OutputTypeName_0846fbbf = N'OrdersCancelExternalInvoiceOutput'
SET
  @OutputTypeDefinition_0846fbbf = N'/**
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
  @OutputTypeIsArray_0846fbbf = 0
SET
  @ExecutionMode_0846fbbf = N'Sync'
SET
  @RequiredScope_0846fbbf = N'orders:write'
SET
  @RequiresSystemUser_0846fbbf = 0
SET
  @GenerationType_0846fbbf = N'Manual'
SET
  @CodeApprovalStatus_0846fbbf = N'Approved'
SET
  @Status_0846fbbf = N'Active'
SET
  @CodeLocked_0846fbbf = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_0846fbbf OR [OperationKey] = @OperationKey_0846fbbf)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_0846fbbf,
  @Name = @Name_0846fbbf,
  @OperationKey = @OperationKey_0846fbbf,
  @CategoryID = @CategoryID_0846fbbf,
  @Description = @Description_0846fbbf,
  @InputTypeName = @InputTypeName_0846fbbf,
  @InputTypeDefinition = @InputTypeDefinition_0846fbbf,
  @InputTypeIsArray = @InputTypeIsArray_0846fbbf,
  @OutputTypeName = @OutputTypeName_0846fbbf,
  @OutputTypeDefinition = @OutputTypeDefinition_0846fbbf,
  @OutputTypeIsArray = @OutputTypeIsArray_0846fbbf,
  @ExecutionMode = @ExecutionMode_0846fbbf,
  @RequiredScope = @RequiredScope_0846fbbf,
  @RequiresSystemUser = @RequiresSystemUser_0846fbbf,
  @GenerationType = @GenerationType_0846fbbf,
  @Code = @Code_0846fbbf,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_0846fbbf,
  @CodeApprovedByUserID = @CodeApprovedByUserID_0846fbbf,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_0846fbbf,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_0846fbbf,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_0846fbbf,
  @CacheTTLSeconds = @CacheTTLSeconds_0846fbbf,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_0846fbbf,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_0846fbbf,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_0846fbbf,
  @CodeComments = @CodeComments_0846fbbf,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_0846fbbf,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_b63188fb UNIQUEIDENTIFIER,
@Name_b63188fb NVARCHAR(255),
@OperationKey_b63188fb NVARCHAR(255),
@CategoryID_b63188fb UNIQUEIDENTIFIER,
@Description_b63188fb NVARCHAR(MAX),
@InputTypeName_b63188fb NVARCHAR(255),
@InputTypeDefinition_b63188fb NVARCHAR(MAX),
@InputTypeIsArray_b63188fb BIT,
@OutputTypeName_b63188fb NVARCHAR(255),
@OutputTypeDefinition_b63188fb NVARCHAR(MAX),
@OutputTypeIsArray_b63188fb BIT,
@ExecutionMode_b63188fb NVARCHAR(20),
@RequiredScope_b63188fb NVARCHAR(255),
@RequiresSystemUser_b63188fb BIT,
@GenerationType_b63188fb NVARCHAR(20),
@Code_b63188fb NVARCHAR(MAX),
@CodeApprovalStatus_b63188fb NVARCHAR(20),
@CodeApprovedByUserID_b63188fb UNIQUEIDENTIFIER,
@CodeApprovedAt_b63188fb DATETIMEOFFSET,
@ContractFingerprint_b63188fb NVARCHAR(100),
@Status_b63188fb NVARCHAR(20),
@CacheTTLSeconds_b63188fb INT,
@TimeoutMS_b63188fb INT,
@MaxConcurrency_b63188fb INT,
@CodeLocked_b63188fb BIT,
@CodeComments_b63188fb NVARCHAR(MAX),
@Libraries_b63188fb NVARCHAR(MAX)
SET
  @ID_b63188fb = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A03'
SET
  @Name_b63188fb = N'Get External Invoicing Worklist'
SET
  @OperationKey_b63188fb = N'Orders.GetExternalInvoicingWorklist'
SET
  @CategoryID_b63188fb = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B305'
SET
  @Description_b63188fb = N'Billing units that are invoiceable on a company''s external rail and unsent — Confirmed schedule-less orders with a balance and no rail history, Invoiced instalments with SentAt NULL — plus failed and in-flight sends on request. Companies without an active rail never appear.'
SET
  @InputTypeName_b63188fb = N'OrdersGetExternalInvoicingWorklistInput'
SET
  @InputTypeDefinition_b63188fb = N'/**
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
  @InputTypeIsArray_b63188fb = 0
SET
  @OutputTypeName_b63188fb = N'OrdersGetExternalInvoicingWorklistOutput'
SET
  @OutputTypeDefinition_b63188fb = N'/**
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
  @OutputTypeIsArray_b63188fb = 0
SET
  @ExecutionMode_b63188fb = N'Sync'
SET
  @RequiredScope_b63188fb = N'orders:read'
SET
  @RequiresSystemUser_b63188fb = 0
SET
  @GenerationType_b63188fb = N'Manual'
SET
  @CodeApprovalStatus_b63188fb = N'Approved'
SET
  @Status_b63188fb = N'Active'
SET
  @CodeLocked_b63188fb = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_b63188fb OR [OperationKey] = @OperationKey_b63188fb)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_b63188fb,
  @Name = @Name_b63188fb,
  @OperationKey = @OperationKey_b63188fb,
  @CategoryID = @CategoryID_b63188fb,
  @Description = @Description_b63188fb,
  @InputTypeName = @InputTypeName_b63188fb,
  @InputTypeDefinition = @InputTypeDefinition_b63188fb,
  @InputTypeIsArray = @InputTypeIsArray_b63188fb,
  @OutputTypeName = @OutputTypeName_b63188fb,
  @OutputTypeDefinition = @OutputTypeDefinition_b63188fb,
  @OutputTypeIsArray = @OutputTypeIsArray_b63188fb,
  @ExecutionMode = @ExecutionMode_b63188fb,
  @RequiredScope = @RequiredScope_b63188fb,
  @RequiresSystemUser = @RequiresSystemUser_b63188fb,
  @GenerationType = @GenerationType_b63188fb,
  @Code = @Code_b63188fb,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_b63188fb,
  @CodeApprovedByUserID = @CodeApprovedByUserID_b63188fb,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_b63188fb,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_b63188fb,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_b63188fb,
  @CacheTTLSeconds = @CacheTTLSeconds_b63188fb,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_b63188fb,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_b63188fb,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_b63188fb,
  @CodeComments = @CodeComments_b63188fb,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_b63188fb,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_ef03a5f4 UNIQUEIDENTIFIER,
@Name_ef03a5f4 NVARCHAR(255),
@OperationKey_ef03a5f4 NVARCHAR(255),
@CategoryID_ef03a5f4 UNIQUEIDENTIFIER,
@Description_ef03a5f4 NVARCHAR(MAX),
@InputTypeName_ef03a5f4 NVARCHAR(255),
@InputTypeDefinition_ef03a5f4 NVARCHAR(MAX),
@InputTypeIsArray_ef03a5f4 BIT,
@OutputTypeName_ef03a5f4 NVARCHAR(255),
@OutputTypeDefinition_ef03a5f4 NVARCHAR(MAX),
@OutputTypeIsArray_ef03a5f4 BIT,
@ExecutionMode_ef03a5f4 NVARCHAR(20),
@RequiredScope_ef03a5f4 NVARCHAR(255),
@RequiresSystemUser_ef03a5f4 BIT,
@GenerationType_ef03a5f4 NVARCHAR(20),
@Code_ef03a5f4 NVARCHAR(MAX),
@CodeApprovalStatus_ef03a5f4 NVARCHAR(20),
@CodeApprovedByUserID_ef03a5f4 UNIQUEIDENTIFIER,
@CodeApprovedAt_ef03a5f4 DATETIMEOFFSET,
@ContractFingerprint_ef03a5f4 NVARCHAR(100),
@Status_ef03a5f4 NVARCHAR(20),
@CacheTTLSeconds_ef03a5f4 INT,
@TimeoutMS_ef03a5f4 INT,
@MaxConcurrency_ef03a5f4 INT,
@CodeLocked_ef03a5f4 BIT,
@CodeComments_ef03a5f4 NVARCHAR(MAX),
@Libraries_ef03a5f4 NVARCHAR(MAX)
SET
  @ID_ef03a5f4 = 'A7F3C2D1-9B4E-4C61-8D2A-5E1F7B3C9A01'
SET
  @Name_ef03a5f4 = N'Issue External Invoice'
SET
  @OperationKey_ef03a5f4 = N'Orders.IssueExternalInvoice'
SET
  @CategoryID_ef03a5f4 = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303'
SET
  @Description_ef03a5f4 = N'Create one billing unit''s invoice on the company''s external AR rail (Bill.com): a Confirmed order billed as a whole, per selling company, or one Invoiced instalment. Idempotent per unit — a unit already on the rail returns its existing reference. Records the rail''s invoice id on ExternalInvoice (authoritative) and on the instalment row; never touches Balance, PaymentStatus or the ledger.'
SET
  @InputTypeName_ef03a5f4 = N'OrdersIssueExternalInvoiceInput'
SET
  @InputTypeDefinition_ef03a5f4 = N'/**
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
  @InputTypeIsArray_ef03a5f4 = 0
SET
  @OutputTypeName_ef03a5f4 = N'OrdersIssueExternalInvoiceOutput'
SET
  @OutputTypeDefinition_ef03a5f4 = N'/**
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
  @OutputTypeIsArray_ef03a5f4 = 0
SET
  @ExecutionMode_ef03a5f4 = N'Sync'
SET
  @RequiredScope_ef03a5f4 = N'orders:write'
SET
  @RequiresSystemUser_ef03a5f4 = 0
SET
  @GenerationType_ef03a5f4 = N'Manual'
SET
  @CodeApprovalStatus_ef03a5f4 = N'Approved'
SET
  @Status_ef03a5f4 = N'Active'
SET
  @CodeLocked_ef03a5f4 = 0
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RemoteOperation]
               WHERE [ID] = @ID_ef03a5f4 OR [OperationKey] = @OperationKey_ef03a5f4)
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_ef03a5f4,
  @Name = @Name_ef03a5f4,
  @OperationKey = @OperationKey_ef03a5f4,
  @CategoryID = @CategoryID_ef03a5f4,
  @Description = @Description_ef03a5f4,
  @InputTypeName = @InputTypeName_ef03a5f4,
  @InputTypeDefinition = @InputTypeDefinition_ef03a5f4,
  @InputTypeIsArray = @InputTypeIsArray_ef03a5f4,
  @OutputTypeName = @OutputTypeName_ef03a5f4,
  @OutputTypeDefinition = @OutputTypeDefinition_ef03a5f4,
  @OutputTypeIsArray = @OutputTypeIsArray_ef03a5f4,
  @ExecutionMode = @ExecutionMode_ef03a5f4,
  @RequiredScope = @RequiredScope_ef03a5f4,
  @RequiresSystemUser = @RequiresSystemUser_ef03a5f4,
  @GenerationType = @GenerationType_ef03a5f4,
  @Code = @Code_ef03a5f4,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_ef03a5f4,
  @CodeApprovedByUserID = @CodeApprovedByUserID_ef03a5f4,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_ef03a5f4,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_ef03a5f4,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_ef03a5f4,
  @CacheTTLSeconds = @CacheTTLSeconds_ef03a5f4,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_ef03a5f4,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_ef03a5f4,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_ef03a5f4,
  @CodeComments = @CodeComments_ef03a5f4,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_ef03a5f4,
  @Libraries_Clear = 1;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @ID_447e032f UNIQUEIDENTIFIER,
@CategoryID_447e032f UNIQUEIDENTIFIER,
@Name_447e032f NVARCHAR(425),
@Description_447e032f NVARCHAR(MAX),
@Type_447e032f NVARCHAR(20),
@UserPrompt_447e032f NVARCHAR(MAX),
@UserComments_447e032f NVARCHAR(MAX),
@Code_447e032f NVARCHAR(MAX),
@CodeComments_447e032f NVARCHAR(MAX),
@CodeApprovalStatus_447e032f NVARCHAR(20),
@CodeApprovalComments_447e032f NVARCHAR(MAX),
@CodeApprovedByUserID_447e032f UNIQUEIDENTIFIER,
@CodeApprovedAt_447e032f DATETIMEOFFSET,
@CodeLocked_447e032f BIT,
@ForceCodeGeneration_447e032f BIT,
@RetentionPeriod_447e032f INT,
@Status_447e032f NVARCHAR(20),
@DriverClass_447e032f NVARCHAR(255),
@ParentID_447e032f UNIQUEIDENTIFIER,
@IconClass_447e032f NVARCHAR(100),
@DefaultCompactPromptID_447e032f UNIQUEIDENTIFIER,
@Config_447e032f NVARCHAR(MAX),
@RuntimeActionConfiguration_447e032f NVARCHAR(MAX),
@MaxExecutionTimeMS_447e032f INT,
@CreatedByAgentID_447e032f UNIQUEIDENTIFIER
SET
  @ID_447e032f = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01'
SET
  @CategoryID_447e032f = '359F5241-25D1-4949-A74F-C20CA3EECC3A'
SET
  @Name_447e032f = N'Send External Invoices'
SET
  @Description_447e032f = N'Work the external invoicing worklist: every billing unit that is invoiceable on its company''s Bill.com rail and not yet sent is created there through Orders.IssueExternalInvoice. Runs the Orders.SendExternalInvoices operation, which carries the selection, the idempotency guard and the tie check — this Action only reads parameters and reports the result. Preview lists what would be sent and sends nothing.'
SET
  @Type_447e032f = N'Custom'
SET
  @UserPrompt_447e032f = N'Send the invoices that are due to Bill.com, or preview what would be sent.'
SET
  @CodeApprovalStatus_447e032f = N'Approved'
SET
  @CodeLocked_447e032f = 0
SET
  @ForceCodeGeneration_447e032f = 0
SET
  @Status_447e032f = N'Active'
SET
  @DriverClass_447e032f = N'Orders.SendExternalInvoices'
SET
  @IconClass_447e032f = N'fa-solid fa-file-invoice-dollar'
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action]
               WHERE [ID] = @ID_447e032f OR [DriverClass] = @DriverClass_447e032f)
EXEC [${mjSchema}].spCreateAction @ID = @ID_447e032f,
  @CategoryID = @CategoryID_447e032f,
  @Name = @Name_447e032f,
  @Description = @Description_447e032f,
  @Type = @Type_447e032f,
  @UserPrompt = @UserPrompt_447e032f,
  @UserComments = @UserComments_447e032f,
  @UserComments_Clear = 1,
  @Code = @Code_447e032f,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_447e032f,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_447e032f,
  @CodeApprovalComments = @CodeApprovalComments_447e032f,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_447e032f,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_447e032f,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_447e032f,
  @ForceCodeGeneration = @ForceCodeGeneration_447e032f,
  @RetentionPeriod = @RetentionPeriod_447e032f,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_447e032f,
  @DriverClass = @DriverClass_447e032f,
  @ParentID = @ParentID_447e032f,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_447e032f,
  @DefaultCompactPromptID = @DefaultCompactPromptID_447e032f,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_447e032f,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_447e032f,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_447e032f,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_447e032f,
  @CreatedByAgentID_Clear = 1;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @ID_9ef6f7d2 UNIQUEIDENTIFIER,
@CategoryID_9ef6f7d2 UNIQUEIDENTIFIER,
@Name_9ef6f7d2 NVARCHAR(425),
@Description_9ef6f7d2 NVARCHAR(MAX),
@Type_9ef6f7d2 NVARCHAR(20),
@UserPrompt_9ef6f7d2 NVARCHAR(MAX),
@UserComments_9ef6f7d2 NVARCHAR(MAX),
@Code_9ef6f7d2 NVARCHAR(MAX),
@CodeComments_9ef6f7d2 NVARCHAR(MAX),
@CodeApprovalStatus_9ef6f7d2 NVARCHAR(20),
@CodeApprovalComments_9ef6f7d2 NVARCHAR(MAX),
@CodeApprovedByUserID_9ef6f7d2 UNIQUEIDENTIFIER,
@CodeApprovedAt_9ef6f7d2 DATETIMEOFFSET,
@CodeLocked_9ef6f7d2 BIT,
@ForceCodeGeneration_9ef6f7d2 BIT,
@RetentionPeriod_9ef6f7d2 INT,
@Status_9ef6f7d2 NVARCHAR(20),
@DriverClass_9ef6f7d2 NVARCHAR(255),
@ParentID_9ef6f7d2 UNIQUEIDENTIFIER,
@IconClass_9ef6f7d2 NVARCHAR(100),
@DefaultCompactPromptID_9ef6f7d2 UNIQUEIDENTIFIER,
@Config_9ef6f7d2 NVARCHAR(MAX),
@RuntimeActionConfiguration_9ef6f7d2 NVARCHAR(MAX),
@MaxExecutionTimeMS_9ef6f7d2 INT,
@CreatedByAgentID_9ef6f7d2 UNIQUEIDENTIFIER
SET
  @ID_9ef6f7d2 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11'
SET
  @CategoryID_9ef6f7d2 = '359F5241-25D1-4949-A74F-C20CA3EECC3A'
SET
  @Name_9ef6f7d2 = N'Poll External Payments'
SET
  @Description_9ef6f7d2 = N'Read receivable payments from each company''s Bill.com rail since the stored watermark and capture every cleared payment exactly once through Orders.CapturePayment, applied to the orders its invoices belong to. Runs the Orders.PollExternalPayments operation — this Action only reads parameters and reports the result. Preview decides everything and writes nothing. A pass that leaves unmatched or reversed payments for a person reports failure so the job notifies.'
SET
  @Type_9ef6f7d2 = N'Custom'
SET
  @UserPrompt_9ef6f7d2 = N'Poll Bill.com for cleared customer payments and record them, or preview what would be recorded.'
SET
  @CodeApprovalStatus_9ef6f7d2 = N'Approved'
SET
  @CodeLocked_9ef6f7d2 = 0
SET
  @ForceCodeGeneration_9ef6f7d2 = 0
SET
  @Status_9ef6f7d2 = N'Active'
SET
  @DriverClass_9ef6f7d2 = N'Orders.PollExternalPayments'
SET
  @IconClass_9ef6f7d2 = N'fa-solid fa-money-bill-transfer'
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action]
               WHERE [ID] = @ID_9ef6f7d2 OR [DriverClass] = @DriverClass_9ef6f7d2)
EXEC [${mjSchema}].spCreateAction @ID = @ID_9ef6f7d2,
  @CategoryID = @CategoryID_9ef6f7d2,
  @Name = @Name_9ef6f7d2,
  @Description = @Description_9ef6f7d2,
  @Type = @Type_9ef6f7d2,
  @UserPrompt = @UserPrompt_9ef6f7d2,
  @UserComments = @UserComments_9ef6f7d2,
  @UserComments_Clear = 1,
  @Code = @Code_9ef6f7d2,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_9ef6f7d2,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_9ef6f7d2,
  @CodeApprovalComments = @CodeApprovalComments_9ef6f7d2,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_9ef6f7d2,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_9ef6f7d2,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_9ef6f7d2,
  @ForceCodeGeneration = @ForceCodeGeneration_9ef6f7d2,
  @RetentionPeriod = @RetentionPeriod_9ef6f7d2,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_9ef6f7d2,
  @DriverClass = @DriverClass_9ef6f7d2,
  @ParentID = @ParentID_9ef6f7d2,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_9ef6f7d2,
  @DefaultCompactPromptID = @DefaultCompactPromptID_9ef6f7d2,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_9ef6f7d2,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_9ef6f7d2,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_9ef6f7d2,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_9ef6f7d2,
  @CreatedByAgentID_Clear = 1;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_3b12e494 UNIQUEIDENTIFIER,
@ActionID_3b12e494 UNIQUEIDENTIFIER,
@Name_3b12e494 NVARCHAR(255),
@DefaultValue_3b12e494 NVARCHAR(MAX),
@Type_3b12e494 NCHAR(10),
@ValueType_3b12e494 NVARCHAR(30),
@IsArray_3b12e494 BIT,
@Description_3b12e494 NVARCHAR(MAX),
@IsRequired_3b12e494 BIT,
@MediaModality_3b12e494 NVARCHAR(20),
@LogValue_3b12e494 BIT
SET
  @ID_3b12e494 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B02'
SET
  @ActionID_3b12e494 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_3b12e494 = N'CompanyIDs'
SET
  @Type_3b12e494 = N'Input'
SET
  @ValueType_3b12e494 = N'Scalar'
SET
  @IsArray_3b12e494 = 0
SET
  @Description_3b12e494 = N'Restrict the sweep to these selling companies (comma-separated IDs). Omit for every company with an active Bill.com provider row. A value that is not a list of IDs is refused.'
SET
  @IsRequired_3b12e494 = 0
SET
  @LogValue_3b12e494 = 1
IF @ActionID_3b12e494 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_3b12e494 OR ([Name] = @Name_3b12e494 AND [ActionID] = @ActionID_3b12e494))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_3b12e494,
  @ActionID = @ActionID_3b12e494,
  @Name = @Name_3b12e494,
  @DefaultValue = @DefaultValue_3b12e494,
  @DefaultValue_Clear = 1,
  @Type = @Type_3b12e494,
  @ValueType = @ValueType_3b12e494,
  @IsArray = @IsArray_3b12e494,
  @Description = @Description_3b12e494,
  @IsRequired = @IsRequired_3b12e494,
  @MediaModality = @MediaModality_3b12e494,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_3b12e494;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_41e24314 UNIQUEIDENTIFIER,
@ActionID_41e24314 UNIQUEIDENTIFIER,
@Name_41e24314 NVARCHAR(255),
@DefaultValue_41e24314 NVARCHAR(MAX),
@Type_41e24314 NCHAR(10),
@ValueType_41e24314 NVARCHAR(30),
@IsArray_41e24314 BIT,
@Description_41e24314 NVARCHAR(MAX),
@IsRequired_41e24314 BIT,
@MediaModality_41e24314 NVARCHAR(20),
@LogValue_41e24314 BIT
SET
  @ID_41e24314 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B03'
SET
  @ActionID_41e24314 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_41e24314 = N'MaxCount'
SET
  @Type_41e24314 = N'Input'
SET
  @ValueType_41e24314 = N'Scalar'
SET
  @IsArray_41e24314 = 0
SET
  @Description_41e24314 = N'Cap on units sent in one pass, and on the units a preview lists, so the list confirmed at the go-live gate is the pass that follows it. The first-run safety valve: a mis-configuration invoices this many customers, not the book. Default 25. A value that is not a whole number of at least 1 is refused, never dropped: a dropped cap is no cap.'
SET
  @IsRequired_41e24314 = 0
SET
  @LogValue_41e24314 = 1
IF @ActionID_41e24314 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_41e24314 OR ([Name] = @Name_41e24314 AND [ActionID] = @ActionID_41e24314))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_41e24314,
  @ActionID = @ActionID_41e24314,
  @Name = @Name_41e24314,
  @DefaultValue = @DefaultValue_41e24314,
  @DefaultValue_Clear = 1,
  @Type = @Type_41e24314,
  @ValueType = @ValueType_41e24314,
  @IsArray = @IsArray_41e24314,
  @Description = @Description_41e24314,
  @IsRequired = @IsRequired_41e24314,
  @MediaModality = @MediaModality_41e24314,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_41e24314;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_9b9db7da UNIQUEIDENTIFIER,
@ActionID_9b9db7da UNIQUEIDENTIFIER,
@Name_9b9db7da NVARCHAR(255),
@DefaultValue_9b9db7da NVARCHAR(MAX),
@Type_9b9db7da NCHAR(10),
@ValueType_9b9db7da NVARCHAR(30),
@IsArray_9b9db7da BIT,
@Description_9b9db7da NVARCHAR(MAX),
@IsRequired_9b9db7da BIT,
@MediaModality_9b9db7da NVARCHAR(20),
@LogValue_9b9db7da BIT
SET
  @ID_9b9db7da = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04'
SET
  @ActionID_9b9db7da = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_9b9db7da = N'Preview'
SET
  @Type_9b9db7da = N'Input'
SET
  @ValueType_9b9db7da = N'Scalar'
SET
  @IsArray_9b9db7da = 0
SET
  @Description_9b9db7da = N'True lists what WOULD be sent and sends nothing; false (the default) sends. A value that is neither is refused rather than guessed — the wrong guess sends customers invoices. A scheduler stores params as text, so "false" arrives as a string and is read as false, not as a truthy value.'
SET
  @IsRequired_9b9db7da = 0
SET
  @LogValue_9b9db7da = 1
IF @ActionID_9b9db7da IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_9b9db7da OR ([Name] = @Name_9b9db7da AND [ActionID] = @ActionID_9b9db7da))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_9b9db7da,
  @ActionID = @ActionID_9b9db7da,
  @Name = @Name_9b9db7da,
  @DefaultValue = @DefaultValue_9b9db7da,
  @DefaultValue_Clear = 1,
  @Type = @Type_9b9db7da,
  @ValueType = @ValueType_9b9db7da,
  @IsArray = @IsArray_9b9db7da,
  @Description = @Description_9b9db7da,
  @IsRequired = @IsRequired_9b9db7da,
  @MediaModality = @MediaModality_9b9db7da,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_9b9db7da;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_aa3cedfd UNIQUEIDENTIFIER,
@ActionID_aa3cedfd UNIQUEIDENTIFIER,
@Name_aa3cedfd NVARCHAR(255),
@DefaultValue_aa3cedfd NVARCHAR(MAX),
@Type_aa3cedfd NCHAR(10),
@ValueType_aa3cedfd NVARCHAR(30),
@IsArray_aa3cedfd BIT,
@Description_aa3cedfd NVARCHAR(MAX),
@IsRequired_aa3cedfd BIT,
@MediaModality_aa3cedfd NVARCHAR(20),
@LogValue_aa3cedfd BIT
SET
  @ID_aa3cedfd = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B05'
SET
  @ActionID_aa3cedfd = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_aa3cedfd = N'RetryTransientFailures'
SET
  @Type_aa3cedfd = N'Input'
SET
  @ValueType_aa3cedfd = N'Scalar'
SET
  @IsArray_aa3cedfd = 0
SET
  @Description_aa3cedfd = N'True (the default) also retries units whose last send failed for a transient reason — a timeout, a 5xx, a lost session. Permanent failures (a customer with no email) are never retried; they wait in the Bill.com queue for a person.'
SET
  @IsRequired_aa3cedfd = 0
SET
  @LogValue_aa3cedfd = 1
IF @ActionID_aa3cedfd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_aa3cedfd OR ([Name] = @Name_aa3cedfd AND [ActionID] = @ActionID_aa3cedfd))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_aa3cedfd,
  @ActionID = @ActionID_aa3cedfd,
  @Name = @Name_aa3cedfd,
  @DefaultValue = @DefaultValue_aa3cedfd,
  @DefaultValue_Clear = 1,
  @Type = @Type_aa3cedfd,
  @ValueType = @ValueType_aa3cedfd,
  @IsArray = @IsArray_aa3cedfd,
  @Description = @Description_aa3cedfd,
  @IsRequired = @IsRequired_aa3cedfd,
  @MediaModality = @MediaModality_aa3cedfd,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_aa3cedfd;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_fa166649 UNIQUEIDENTIFIER,
@ActionID_fa166649 UNIQUEIDENTIFIER,
@Name_fa166649 NVARCHAR(255),
@DefaultValue_fa166649 NVARCHAR(MAX),
@Type_fa166649 NCHAR(10),
@ValueType_fa166649 NVARCHAR(30),
@IsArray_fa166649 BIT,
@Description_fa166649 NVARCHAR(MAX),
@IsRequired_fa166649 BIT,
@MediaModality_fa166649 NVARCHAR(20),
@LogValue_fa166649 BIT
SET
  @ID_fa166649 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B06'
SET
  @ActionID_fa166649 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_fa166649 = N'Sent'
SET
  @Type_fa166649 = N'Output'
SET
  @ValueType_fa166649 = N'Scalar'
SET
  @IsArray_fa166649 = 0
SET
  @Description_fa166649 = N'Units created on the rail this pass (or that would be, on a preview).'
SET
  @IsRequired_fa166649 = 0
SET
  @LogValue_fa166649 = 1
IF @ActionID_fa166649 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_fa166649 OR ([Name] = @Name_fa166649 AND [ActionID] = @ActionID_fa166649))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_fa166649,
  @ActionID = @ActionID_fa166649,
  @Name = @Name_fa166649,
  @DefaultValue = @DefaultValue_fa166649,
  @DefaultValue_Clear = 1,
  @Type = @Type_fa166649,
  @ValueType = @ValueType_fa166649,
  @IsArray = @IsArray_fa166649,
  @Description = @Description_fa166649,
  @IsRequired = @IsRequired_fa166649,
  @MediaModality = @MediaModality_fa166649,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_fa166649;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_4f18ffa7 UNIQUEIDENTIFIER,
@ActionID_4f18ffa7 UNIQUEIDENTIFIER,
@Name_4f18ffa7 NVARCHAR(255),
@DefaultValue_4f18ffa7 NVARCHAR(MAX),
@Type_4f18ffa7 NCHAR(10),
@ValueType_4f18ffa7 NVARCHAR(30),
@IsArray_4f18ffa7 BIT,
@Description_4f18ffa7 NVARCHAR(MAX),
@IsRequired_4f18ffa7 BIT,
@MediaModality_4f18ffa7 NVARCHAR(20),
@LogValue_4f18ffa7 BIT
SET
  @ID_4f18ffa7 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B07'
SET
  @ActionID_4f18ffa7 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_4f18ffa7 = N'Failed'
SET
  @Type_4f18ffa7 = N'Output'
SET
  @ValueType_4f18ffa7 = N'Scalar'
SET
  @IsArray_4f18ffa7 = 0
SET
  @Description_4f18ffa7 = N'Units the rail or the tie check refused; each reason is on Results.'
SET
  @IsRequired_4f18ffa7 = 0
SET
  @LogValue_4f18ffa7 = 1
IF @ActionID_4f18ffa7 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_4f18ffa7 OR ([Name] = @Name_4f18ffa7 AND [ActionID] = @ActionID_4f18ffa7))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_4f18ffa7,
  @ActionID = @ActionID_4f18ffa7,
  @Name = @Name_4f18ffa7,
  @DefaultValue = @DefaultValue_4f18ffa7,
  @DefaultValue_Clear = 1,
  @Type = @Type_4f18ffa7,
  @ValueType = @ValueType_4f18ffa7,
  @IsArray = @IsArray_4f18ffa7,
  @Description = @Description_4f18ffa7,
  @IsRequired = @IsRequired_4f18ffa7,
  @MediaModality = @MediaModality_4f18ffa7,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_4f18ffa7;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_a02de50d UNIQUEIDENTIFIER,
@ActionID_a02de50d UNIQUEIDENTIFIER,
@Name_a02de50d NVARCHAR(255),
@DefaultValue_a02de50d NVARCHAR(MAX),
@Type_a02de50d NCHAR(10),
@ValueType_a02de50d NVARCHAR(30),
@IsArray_a02de50d BIT,
@Description_a02de50d NVARCHAR(MAX),
@IsRequired_a02de50d BIT,
@MediaModality_a02de50d NVARCHAR(20),
@LogValue_a02de50d BIT
SET
  @ID_a02de50d = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B08'
SET
  @ActionID_a02de50d = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_a02de50d = N'Skipped'
SET
  @Type_a02de50d = N'Output'
SET
  @ValueType_a02de50d = N'Scalar'
SET
  @IsArray_a02de50d = 0
SET
  @Description_a02de50d = N'Units beyond MaxCount, in flight, or permanent failures. Not lost — still due next pass or waiting for a person.'
SET
  @IsRequired_a02de50d = 0
SET
  @LogValue_a02de50d = 1
IF @ActionID_a02de50d IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_a02de50d OR ([Name] = @Name_a02de50d AND [ActionID] = @ActionID_a02de50d))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_a02de50d,
  @ActionID = @ActionID_a02de50d,
  @Name = @Name_a02de50d,
  @DefaultValue = @DefaultValue_a02de50d,
  @DefaultValue_Clear = 1,
  @Type = @Type_a02de50d,
  @ValueType = @ValueType_a02de50d,
  @IsArray = @IsArray_a02de50d,
  @Description = @Description_a02de50d,
  @IsRequired = @IsRequired_a02de50d,
  @MediaModality = @MediaModality_a02de50d,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_a02de50d;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_d481808b UNIQUEIDENTIFIER,
@ActionID_d481808b UNIQUEIDENTIFIER,
@Name_d481808b NVARCHAR(255),
@DefaultValue_d481808b NVARCHAR(MAX),
@Type_d481808b NCHAR(10),
@ValueType_d481808b NVARCHAR(30),
@IsArray_d481808b BIT,
@Description_d481808b NVARCHAR(MAX),
@IsRequired_d481808b BIT,
@MediaModality_d481808b NVARCHAR(20),
@LogValue_d481808b BIT
SET
  @ID_d481808b = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B09'
SET
  @ActionID_d481808b = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_d481808b = N'Results'
SET
  @Type_d481808b = N'Output'
SET
  @ValueType_d481808b = N'Simple Object'
SET
  @IsArray_d481808b = 1
SET
  @Description_d481808b = N'Every unit considered, with its outcome. The deliverable of a preview run — stored on the ScheduledJobRun, where the person confirming the list reads it.'
SET
  @IsRequired_d481808b = 0
SET
  @LogValue_d481808b = 1
IF @ActionID_d481808b IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_d481808b OR ([Name] = @Name_d481808b AND [ActionID] = @ActionID_d481808b))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_d481808b,
  @ActionID = @ActionID_d481808b,
  @Name = @Name_d481808b,
  @DefaultValue = @DefaultValue_d481808b,
  @DefaultValue_Clear = 1,
  @Type = @Type_d481808b,
  @ValueType = @ValueType_d481808b,
  @IsArray = @IsArray_d481808b,
  @Description = @Description_d481808b,
  @IsRequired = @IsRequired_d481808b,
  @MediaModality = @MediaModality_d481808b,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_d481808b;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_d350b71a UNIQUEIDENTIFIER,
@ActionID_d350b71a UNIQUEIDENTIFIER,
@Name_d350b71a NVARCHAR(255),
@DefaultValue_d350b71a NVARCHAR(MAX),
@Type_d350b71a NCHAR(10),
@ValueType_d350b71a NVARCHAR(30),
@IsArray_d350b71a BIT,
@Description_d350b71a NVARCHAR(MAX),
@IsRequired_d350b71a BIT,
@MediaModality_d350b71a NVARCHAR(20),
@LogValue_d350b71a BIT
SET
  @ID_d350b71a = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B0A'
SET
  @ActionID_d350b71a = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.SendExternalInvoices')
SET
  @Name_d350b71a = N'PreviewedOnly'
SET
  @Type_d350b71a = N'Output'
SET
  @ValueType_d350b71a = N'Scalar'
SET
  @IsArray_d350b71a = 0
SET
  @Description_d350b71a = N'True when this pass was a rehearsal. Deliberately not named Preview, so the input''s record survives.'
SET
  @IsRequired_d350b71a = 0
SET
  @LogValue_d350b71a = 1
IF @ActionID_d350b71a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_d350b71a OR ([Name] = @Name_d350b71a AND [ActionID] = @ActionID_d350b71a))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_d350b71a,
  @ActionID = @ActionID_d350b71a,
  @Name = @Name_d350b71a,
  @DefaultValue = @DefaultValue_d350b71a,
  @DefaultValue_Clear = 1,
  @Type = @Type_d350b71a,
  @ValueType = @ValueType_d350b71a,
  @IsArray = @IsArray_d350b71a,
  @Description = @Description_d350b71a,
  @IsRequired = @IsRequired_d350b71a,
  @MediaModality = @MediaModality_d350b71a,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_d350b71a;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_b747276b UNIQUEIDENTIFIER,
@ActionID_b747276b UNIQUEIDENTIFIER,
@Name_b747276b NVARCHAR(255),
@DefaultValue_b747276b NVARCHAR(MAX),
@Type_b747276b NCHAR(10),
@ValueType_b747276b NVARCHAR(30),
@IsArray_b747276b BIT,
@Description_b747276b NVARCHAR(MAX),
@IsRequired_b747276b BIT,
@MediaModality_b747276b NVARCHAR(20),
@LogValue_b747276b BIT
SET
  @ID_b747276b = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B12'
SET
  @ActionID_b747276b = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_b747276b = N'PaymentProviderID'
SET
  @Type_b747276b = N'Input'
SET
  @ValueType_b747276b = N'Scalar'
SET
  @IsArray_b747276b = 0
SET
  @Description_b747276b = N'Poll one provider row (one company''s Bill.com organisation) only. Omit for every active one.'
SET
  @IsRequired_b747276b = 0
SET
  @LogValue_b747276b = 1
IF @ActionID_b747276b IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_b747276b OR ([Name] = @Name_b747276b AND [ActionID] = @ActionID_b747276b))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_b747276b,
  @ActionID = @ActionID_b747276b,
  @Name = @Name_b747276b,
  @DefaultValue = @DefaultValue_b747276b,
  @DefaultValue_Clear = 1,
  @Type = @Type_b747276b,
  @ValueType = @ValueType_b747276b,
  @IsArray = @IsArray_b747276b,
  @Description = @Description_b747276b,
  @IsRequired = @IsRequired_b747276b,
  @MediaModality = @MediaModality_b747276b,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_b747276b;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_e2cab210 UNIQUEIDENTIFIER,
@ActionID_e2cab210 UNIQUEIDENTIFIER,
@Name_e2cab210 NVARCHAR(255),
@DefaultValue_e2cab210 NVARCHAR(MAX),
@Type_e2cab210 NCHAR(10),
@ValueType_e2cab210 NVARCHAR(30),
@IsArray_e2cab210 BIT,
@Description_e2cab210 NVARCHAR(MAX),
@IsRequired_e2cab210 BIT,
@MediaModality_e2cab210 NVARCHAR(20),
@LogValue_e2cab210 BIT
SET
  @ID_e2cab210 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13'
SET
  @ActionID_e2cab210 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_e2cab210 = N'Preview'
SET
  @Type_e2cab210 = N'Input'
SET
  @ValueType_e2cab210 = N'Scalar'
SET
  @IsArray_e2cab210 = 0
SET
  @Description_e2cab210 = N'True decides every payment and writes nothing — no Payment rows, no dispositions, no watermark. False (the default) records. A value that is neither is refused rather than guessed. A scheduler stores params as text, so "false" arrives as a string and is read as false.'
SET
  @IsRequired_e2cab210 = 0
SET
  @LogValue_e2cab210 = 1
IF @ActionID_e2cab210 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_e2cab210 OR ([Name] = @Name_e2cab210 AND [ActionID] = @ActionID_e2cab210))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_e2cab210,
  @ActionID = @ActionID_e2cab210,
  @Name = @Name_e2cab210,
  @DefaultValue = @DefaultValue_e2cab210,
  @DefaultValue_Clear = 1,
  @Type = @Type_e2cab210,
  @ValueType = @ValueType_e2cab210,
  @IsArray = @IsArray_e2cab210,
  @Description = @Description_e2cab210,
  @IsRequired = @IsRequired_e2cab210,
  @MediaModality = @MediaModality_e2cab210,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_e2cab210;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_49f4a9ff UNIQUEIDENTIFIER,
@ActionID_49f4a9ff UNIQUEIDENTIFIER,
@Name_49f4a9ff NVARCHAR(255),
@DefaultValue_49f4a9ff NVARCHAR(MAX),
@Type_49f4a9ff NCHAR(10),
@ValueType_49f4a9ff NVARCHAR(30),
@IsArray_49f4a9ff BIT,
@Description_49f4a9ff NVARCHAR(MAX),
@IsRequired_49f4a9ff BIT,
@MediaModality_49f4a9ff NVARCHAR(20),
@LogValue_49f4a9ff BIT
SET
  @ID_49f4a9ff = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B14'
SET
  @ActionID_49f4a9ff = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_49f4a9ff = N'MaxCount'
SET
  @Type_49f4a9ff = N'Input'
SET
  @ValueType_49f4a9ff = N'Scalar'
SET
  @IsArray_49f4a9ff = 0
SET
  @Description_49f4a9ff = N'Cap on payments considered per provider in one pass. Default 100. The remainder is read next pass (the watermark does not advance past a capped pass). A value that is not a whole number of at least 1 is refused.'
SET
  @IsRequired_49f4a9ff = 0
SET
  @LogValue_49f4a9ff = 1
IF @ActionID_49f4a9ff IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_49f4a9ff OR ([Name] = @Name_49f4a9ff AND [ActionID] = @ActionID_49f4a9ff))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_49f4a9ff,
  @ActionID = @ActionID_49f4a9ff,
  @Name = @Name_49f4a9ff,
  @DefaultValue = @DefaultValue_49f4a9ff,
  @DefaultValue_Clear = 1,
  @Type = @Type_49f4a9ff,
  @ValueType = @ValueType_49f4a9ff,
  @IsArray = @IsArray_49f4a9ff,
  @Description = @Description_49f4a9ff,
  @IsRequired = @IsRequired_49f4a9ff,
  @MediaModality = @MediaModality_49f4a9ff,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_49f4a9ff;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_52702443 UNIQUEIDENTIFIER,
@ActionID_52702443 UNIQUEIDENTIFIER,
@Name_52702443 NVARCHAR(255),
@DefaultValue_52702443 NVARCHAR(MAX),
@Type_52702443 NCHAR(10),
@ValueType_52702443 NVARCHAR(30),
@IsArray_52702443 BIT,
@Description_52702443 NVARCHAR(MAX),
@IsRequired_52702443 BIT,
@MediaModality_52702443 NVARCHAR(20),
@LogValue_52702443 BIT
SET
  @ID_52702443 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B15'
SET
  @ActionID_52702443 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_52702443 = N'SinceWatermark'
SET
  @Type_52702443 = N'Input'
SET
  @ValueType_52702443 = N'Scalar'
SET
  @IsArray_52702443 = 0
SET
  @Description_52702443 = N'Override the stored watermark (ISO 8601) for a first run or a deliberate re-read. Safe: dedupe is by Bill.com payment id and by PaymentHeader.IdempotencyKey. An unreadable value is refused.'
SET
  @IsRequired_52702443 = 0
SET
  @LogValue_52702443 = 1
IF @ActionID_52702443 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_52702443 OR ([Name] = @Name_52702443 AND [ActionID] = @ActionID_52702443))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_52702443,
  @ActionID = @ActionID_52702443,
  @Name = @Name_52702443,
  @DefaultValue = @DefaultValue_52702443,
  @DefaultValue_Clear = 1,
  @Type = @Type_52702443,
  @ValueType = @ValueType_52702443,
  @IsArray = @IsArray_52702443,
  @Description = @Description_52702443,
  @IsRequired = @IsRequired_52702443,
  @MediaModality = @MediaModality_52702443,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_52702443;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_fe7eb7a5 UNIQUEIDENTIFIER,
@ActionID_fe7eb7a5 UNIQUEIDENTIFIER,
@Name_fe7eb7a5 NVARCHAR(255),
@DefaultValue_fe7eb7a5 NVARCHAR(MAX),
@Type_fe7eb7a5 NCHAR(10),
@ValueType_fe7eb7a5 NVARCHAR(30),
@IsArray_fe7eb7a5 BIT,
@Description_fe7eb7a5 NVARCHAR(MAX),
@IsRequired_fe7eb7a5 BIT,
@MediaModality_fe7eb7a5 NVARCHAR(20),
@LogValue_fe7eb7a5 BIT
SET
  @ID_fe7eb7a5 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B16'
SET
  @ActionID_fe7eb7a5 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_fe7eb7a5 = N'Captured'
SET
  @Type_fe7eb7a5 = N'Output'
SET
  @ValueType_fe7eb7a5 = N'Scalar'
SET
  @IsArray_fe7eb7a5 = 0
SET
  @Description_fe7eb7a5 = N'Payments recorded this pass.'
SET
  @IsRequired_fe7eb7a5 = 0
SET
  @LogValue_fe7eb7a5 = 1
IF @ActionID_fe7eb7a5 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_fe7eb7a5 OR ([Name] = @Name_fe7eb7a5 AND [ActionID] = @ActionID_fe7eb7a5))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_fe7eb7a5,
  @ActionID = @ActionID_fe7eb7a5,
  @Name = @Name_fe7eb7a5,
  @DefaultValue = @DefaultValue_fe7eb7a5,
  @DefaultValue_Clear = 1,
  @Type = @Type_fe7eb7a5,
  @ValueType = @ValueType_fe7eb7a5,
  @IsArray = @IsArray_fe7eb7a5,
  @Description = @Description_fe7eb7a5,
  @IsRequired = @IsRequired_fe7eb7a5,
  @MediaModality = @MediaModality_fe7eb7a5,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_fe7eb7a5;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_58f9540c UNIQUEIDENTIFIER,
@ActionID_58f9540c UNIQUEIDENTIFIER,
@Name_58f9540c NVARCHAR(255),
@DefaultValue_58f9540c NVARCHAR(MAX),
@Type_58f9540c NCHAR(10),
@ValueType_58f9540c NVARCHAR(30),
@IsArray_58f9540c BIT,
@Description_58f9540c NVARCHAR(MAX),
@IsRequired_58f9540c BIT,
@MediaModality_58f9540c NVARCHAR(20),
@LogValue_58f9540c BIT
SET
  @ID_58f9540c = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B17'
SET
  @ActionID_58f9540c = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_58f9540c = N'Held'
SET
  @Type_58f9540c = N'Output'
SET
  @ValueType_58f9540c = N'Scalar'
SET
  @IsArray_58f9540c = 0
SET
  @Description_58f9540c = N'Payments not yet cleared, or with a status the decision table does not know.'
SET
  @IsRequired_58f9540c = 0
SET
  @LogValue_58f9540c = 1
IF @ActionID_58f9540c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_58f9540c OR ([Name] = @Name_58f9540c AND [ActionID] = @ActionID_58f9540c))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_58f9540c,
  @ActionID = @ActionID_58f9540c,
  @Name = @Name_58f9540c,
  @DefaultValue = @DefaultValue_58f9540c,
  @DefaultValue_Clear = 1,
  @Type = @Type_58f9540c,
  @ValueType = @ValueType_58f9540c,
  @IsArray = @IsArray_58f9540c,
  @Description = @Description_58f9540c,
  @IsRequired = @IsRequired_58f9540c,
  @MediaModality = @MediaModality_58f9540c,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_58f9540c;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_ba4986fb UNIQUEIDENTIFIER,
@ActionID_ba4986fb UNIQUEIDENTIFIER,
@Name_ba4986fb NVARCHAR(255),
@DefaultValue_ba4986fb NVARCHAR(MAX),
@Type_ba4986fb NCHAR(10),
@ValueType_ba4986fb NVARCHAR(30),
@IsArray_ba4986fb BIT,
@Description_ba4986fb NVARCHAR(MAX),
@IsRequired_ba4986fb BIT,
@MediaModality_ba4986fb NVARCHAR(20),
@LogValue_ba4986fb BIT
SET
  @ID_ba4986fb = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B18'
SET
  @ActionID_ba4986fb = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_ba4986fb = N'Unmatched'
SET
  @Type_ba4986fb = N'Output'
SET
  @ValueType_ba4986fb = N'Scalar'
SET
  @IsArray_ba4986fb = 0
SET
  @Description_ba4986fb = N'Payments applied to a Bill.com invoice Orders did not issue. Nothing captured; a person decides.'
SET
  @IsRequired_ba4986fb = 0
SET
  @LogValue_ba4986fb = 1
IF @ActionID_ba4986fb IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_ba4986fb OR ([Name] = @Name_ba4986fb AND [ActionID] = @ActionID_ba4986fb))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_ba4986fb,
  @ActionID = @ActionID_ba4986fb,
  @Name = @Name_ba4986fb,
  @DefaultValue = @DefaultValue_ba4986fb,
  @DefaultValue_Clear = 1,
  @Type = @Type_ba4986fb,
  @ValueType = @ValueType_ba4986fb,
  @IsArray = @IsArray_ba4986fb,
  @Description = @Description_ba4986fb,
  @IsRequired = @IsRequired_ba4986fb,
  @MediaModality = @MediaModality_ba4986fb,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_ba4986fb;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_c0bbe363 UNIQUEIDENTIFIER,
@ActionID_c0bbe363 UNIQUEIDENTIFIER,
@Name_c0bbe363 NVARCHAR(255),
@DefaultValue_c0bbe363 NVARCHAR(MAX),
@Type_c0bbe363 NCHAR(10),
@ValueType_c0bbe363 NVARCHAR(30),
@IsArray_c0bbe363 BIT,
@Description_c0bbe363 NVARCHAR(MAX),
@IsRequired_c0bbe363 BIT,
@MediaModality_c0bbe363 NVARCHAR(20),
@LogValue_c0bbe363 BIT
SET
  @ID_c0bbe363 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1E'
SET
  @ActionID_c0bbe363 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_c0bbe363 = N'Refused'
SET
  @Type_c0bbe363 = N'Output'
SET
  @ValueType_c0bbe363 = N'Scalar'
SET
  @IsArray_c0bbe363 = 0
SET
  @Description_c0bbe363 = N'Payments Orders.CapturePayment refused — a split-company order, an ambiguous payer, a configuration fault. Nothing captured; a person decides. Counts as attention.'
SET
  @IsRequired_c0bbe363 = 0
SET
  @LogValue_c0bbe363 = 1
IF @ActionID_c0bbe363 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_c0bbe363 OR ([Name] = @Name_c0bbe363 AND [ActionID] = @ActionID_c0bbe363))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_c0bbe363,
  @ActionID = @ActionID_c0bbe363,
  @Name = @Name_c0bbe363,
  @DefaultValue = @DefaultValue_c0bbe363,
  @DefaultValue_Clear = 1,
  @Type = @Type_c0bbe363,
  @ValueType = @ValueType_c0bbe363,
  @IsArray = @IsArray_c0bbe363,
  @Description = @Description_c0bbe363,
  @IsRequired = @IsRequired_c0bbe363,
  @MediaModality = @MediaModality_c0bbe363,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_c0bbe363;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_a5c58309 UNIQUEIDENTIFIER,
@ActionID_a5c58309 UNIQUEIDENTIFIER,
@Name_a5c58309 NVARCHAR(255),
@DefaultValue_a5c58309 NVARCHAR(MAX),
@Type_a5c58309 NCHAR(10),
@ValueType_a5c58309 NVARCHAR(30),
@IsArray_a5c58309 BIT,
@Description_a5c58309 NVARCHAR(MAX),
@IsRequired_a5c58309 BIT,
@MediaModality_a5c58309 NVARCHAR(20),
@LogValue_a5c58309 BIT
SET
  @ID_a5c58309 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B19'
SET
  @ActionID_a5c58309 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_a5c58309 = N'ReversalNeeded'
SET
  @Type_a5c58309 = N'Output'
SET
  @ValueType_a5c58309 = N'Scalar'
SET
  @IsArray_a5c58309 = 0
SET
  @Description_a5c58309 = N'Payments captured earlier that Bill.com now reports void or failed. Reverse through the bank-return path.'
SET
  @IsRequired_a5c58309 = 0
SET
  @LogValue_a5c58309 = 1
IF @ActionID_a5c58309 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_a5c58309 OR ([Name] = @Name_a5c58309 AND [ActionID] = @ActionID_a5c58309))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_a5c58309,
  @ActionID = @ActionID_a5c58309,
  @Name = @Name_a5c58309,
  @DefaultValue = @DefaultValue_a5c58309,
  @DefaultValue_Clear = 1,
  @Type = @Type_a5c58309,
  @ValueType = @ValueType_a5c58309,
  @IsArray = @IsArray_a5c58309,
  @Description = @Description_a5c58309,
  @IsRequired = @IsRequired_a5c58309,
  @MediaModality = @MediaModality_a5c58309,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_a5c58309;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_ef6fa6d3 UNIQUEIDENTIFIER,
@ActionID_ef6fa6d3 UNIQUEIDENTIFIER,
@Name_ef6fa6d3 NVARCHAR(255),
@DefaultValue_ef6fa6d3 NVARCHAR(MAX),
@Type_ef6fa6d3 NCHAR(10),
@ValueType_ef6fa6d3 NVARCHAR(30),
@IsArray_ef6fa6d3 BIT,
@Description_ef6fa6d3 NVARCHAR(MAX),
@IsRequired_ef6fa6d3 BIT,
@MediaModality_ef6fa6d3 NVARCHAR(20),
@LogValue_ef6fa6d3 BIT
SET
  @ID_ef6fa6d3 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1F'
SET
  @ActionID_ef6fa6d3 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_ef6fa6d3 = N'Reapplied'
SET
  @Type_ef6fa6d3 = N'Output'
SET
  @ValueType_ef6fa6d3 = N'Scalar'
SET
  @IsArray_ef6fa6d3 = 0
SET
  @Description_ef6fa6d3 = N'How many payments were already captured but have since been applied to different invoices on the rail. The cash is right and nothing is re-captured; the allocation held here is stale and a person has to move it. Counted as attention, like Unmatched.'
SET
  @IsRequired_ef6fa6d3 = 0
SET
  @LogValue_ef6fa6d3 = 1
IF @ActionID_ef6fa6d3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_ef6fa6d3 OR ([Name] = @Name_ef6fa6d3 AND [ActionID] = @ActionID_ef6fa6d3))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_ef6fa6d3,
  @ActionID = @ActionID_ef6fa6d3,
  @Name = @Name_ef6fa6d3,
  @DefaultValue = @DefaultValue_ef6fa6d3,
  @DefaultValue_Clear = 1,
  @Type = @Type_ef6fa6d3,
  @ValueType = @ValueType_ef6fa6d3,
  @IsArray = @IsArray_ef6fa6d3,
  @Description = @Description_ef6fa6d3,
  @IsRequired = @IsRequired_ef6fa6d3,
  @MediaModality = @MediaModality_ef6fa6d3,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_ef6fa6d3;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_fc311f46 UNIQUEIDENTIFIER,
@ActionID_fc311f46 UNIQUEIDENTIFIER,
@Name_fc311f46 NVARCHAR(255),
@DefaultValue_fc311f46 NVARCHAR(MAX),
@Type_fc311f46 NCHAR(10),
@ValueType_fc311f46 NVARCHAR(30),
@IsArray_fc311f46 BIT,
@Description_fc311f46 NVARCHAR(MAX),
@IsRequired_fc311f46 BIT,
@MediaModality_fc311f46 NVARCHAR(20),
@LogValue_fc311f46 BIT
SET
  @ID_fc311f46 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1A'
SET
  @ActionID_fc311f46 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_fc311f46 = N'Ignored'
SET
  @Type_fc311f46 = N'Output'
SET
  @ValueType_fc311f46 = N'Scalar'
SET
  @IsArray_fc311f46 = 0
SET
  @Description_fc311f46 = N'Payments already known and unchanged.'
SET
  @IsRequired_fc311f46 = 0
SET
  @LogValue_fc311f46 = 1
IF @ActionID_fc311f46 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_fc311f46 OR ([Name] = @Name_fc311f46 AND [ActionID] = @ActionID_fc311f46))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_fc311f46,
  @ActionID = @ActionID_fc311f46,
  @Name = @Name_fc311f46,
  @DefaultValue = @DefaultValue_fc311f46,
  @DefaultValue_Clear = 1,
  @Type = @Type_fc311f46,
  @ValueType = @ValueType_fc311f46,
  @IsArray = @IsArray_fc311f46,
  @Description = @Description_fc311f46,
  @IsRequired = @IsRequired_fc311f46,
  @MediaModality = @MediaModality_fc311f46,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_fc311f46;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_e660fc6e UNIQUEIDENTIFIER,
@ActionID_e660fc6e UNIQUEIDENTIFIER,
@Name_e660fc6e NVARCHAR(255),
@DefaultValue_e660fc6e NVARCHAR(MAX),
@Type_e660fc6e NCHAR(10),
@ValueType_e660fc6e NVARCHAR(30),
@IsArray_e660fc6e BIT,
@Description_e660fc6e NVARCHAR(MAX),
@IsRequired_e660fc6e BIT,
@MediaModality_e660fc6e NVARCHAR(20),
@LogValue_e660fc6e BIT
SET
  @ID_e660fc6e = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1B'
SET
  @ActionID_e660fc6e = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_e660fc6e = N'Outcomes'
SET
  @Type_e660fc6e = N'Output'
SET
  @ValueType_e660fc6e = N'Simple Object'
SET
  @IsArray_e660fc6e = 1
SET
  @Description_e660fc6e = N'Every payment considered, with its disposition and reason. Stored on the ScheduledJobRun.'
SET
  @IsRequired_e660fc6e = 0
SET
  @LogValue_e660fc6e = 1
IF @ActionID_e660fc6e IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_e660fc6e OR ([Name] = @Name_e660fc6e AND [ActionID] = @ActionID_e660fc6e))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_e660fc6e,
  @ActionID = @ActionID_e660fc6e,
  @Name = @Name_e660fc6e,
  @DefaultValue = @DefaultValue_e660fc6e,
  @DefaultValue_Clear = 1,
  @Type = @Type_e660fc6e,
  @ValueType = @ValueType_e660fc6e,
  @IsArray = @IsArray_e660fc6e,
  @Description = @Description_e660fc6e,
  @IsRequired = @IsRequired_e660fc6e,
  @MediaModality = @MediaModality_e660fc6e,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_e660fc6e;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_78972ba6 UNIQUEIDENTIFIER,
@ActionID_78972ba6 UNIQUEIDENTIFIER,
@Name_78972ba6 NVARCHAR(255),
@DefaultValue_78972ba6 NVARCHAR(MAX),
@Type_78972ba6 NCHAR(10),
@ValueType_78972ba6 NVARCHAR(30),
@IsArray_78972ba6 BIT,
@Description_78972ba6 NVARCHAR(MAX),
@IsRequired_78972ba6 BIT,
@MediaModality_78972ba6 NVARCHAR(20),
@LogValue_78972ba6 BIT
SET
  @ID_78972ba6 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1C'
SET
  @ActionID_78972ba6 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_78972ba6 = N'NewWatermarks'
SET
  @Type_78972ba6 = N'Output'
SET
  @ValueType_78972ba6 = N'Simple Object'
SET
  @IsArray_78972ba6 = 1
SET
  @Description_78972ba6 = N'The watermark each provider row ended the pass on.'
SET
  @IsRequired_78972ba6 = 0
SET
  @LogValue_78972ba6 = 1
IF @ActionID_78972ba6 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_78972ba6 OR ([Name] = @Name_78972ba6 AND [ActionID] = @ActionID_78972ba6))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_78972ba6,
  @ActionID = @ActionID_78972ba6,
  @Name = @Name_78972ba6,
  @DefaultValue = @DefaultValue_78972ba6,
  @DefaultValue_Clear = 1,
  @Type = @Type_78972ba6,
  @ValueType = @ValueType_78972ba6,
  @IsArray = @IsArray_78972ba6,
  @Description = @Description_78972ba6,
  @IsRequired = @IsRequired_78972ba6,
  @MediaModality = @MediaModality_78972ba6,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_78972ba6;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_d122c96d UNIQUEIDENTIFIER,
@ActionID_d122c96d UNIQUEIDENTIFIER,
@Name_d122c96d NVARCHAR(255),
@DefaultValue_d122c96d NVARCHAR(MAX),
@Type_d122c96d NCHAR(10),
@ValueType_d122c96d NVARCHAR(30),
@IsArray_d122c96d BIT,
@Description_d122c96d NVARCHAR(MAX),
@IsRequired_d122c96d BIT,
@MediaModality_d122c96d NVARCHAR(20),
@LogValue_d122c96d BIT
SET
  @ID_d122c96d = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B1D'
SET
  @ActionID_d122c96d = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Action] WHERE [DriverClass] = N'Orders.PollExternalPayments')
SET
  @Name_d122c96d = N'PreviewedOnly'
SET
  @Type_d122c96d = N'Output'
SET
  @ValueType_d122c96d = N'Scalar'
SET
  @IsArray_d122c96d = 0
SET
  @Description_d122c96d = N'True when this pass was a rehearsal.'
SET
  @IsRequired_d122c96d = 0
SET
  @LogValue_d122c96d = 1
IF @ActionID_d122c96d IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE [ID] = @ID_d122c96d OR ([Name] = @Name_d122c96d AND [ActionID] = @ActionID_d122c96d))
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_d122c96d,
  @ActionID = @ActionID_d122c96d,
  @Name = @Name_d122c96d,
  @DefaultValue = @DefaultValue_d122c96d,
  @DefaultValue_Clear = 1,
  @Type = @Type_d122c96d,
  @ValueType = @ValueType_d122c96d,
  @IsArray = @IsArray_d122c96d,
  @Description = @Description_d122c96d,
  @IsRequired = @IsRequired_d122c96d,
  @MediaModality = @MediaModality_d122c96d,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_d122c96d;

GO

-- Save MJ: Scheduled Jobs (core SP call only)
DECLARE @ID_40e8337a UNIQUEIDENTIFIER,
@JobTypeID_40e8337a UNIQUEIDENTIFIER,
@Name_40e8337a NVARCHAR(200),
@Description_40e8337a NVARCHAR(MAX),
@CronExpression_40e8337a NVARCHAR(120),
@Timezone_40e8337a NVARCHAR(64),
@StartAt_40e8337a DATETIMEOFFSET,
@EndAt_40e8337a DATETIMEOFFSET,
@Status_40e8337a NVARCHAR(20),
@Configuration_40e8337a NVARCHAR(MAX),
@OwnerUserID_40e8337a UNIQUEIDENTIFIER,
@LastRunAt_40e8337a DATETIMEOFFSET,
@NextRunAt_40e8337a DATETIMEOFFSET,
@RunCount_40e8337a INT,
@SuccessCount_40e8337a INT,
@FailureCount_40e8337a INT,
@NotifyOnSuccess_40e8337a BIT,
@NotifyOnFailure_40e8337a BIT,
@NotifyUserID_40e8337a UNIQUEIDENTIFIER,
@NotifyViaEmail_40e8337a BIT,
@NotifyViaInApp_40e8337a BIT,
@LockToken_40e8337a UNIQUEIDENTIFIER,
@LockedAt_40e8337a DATETIMEOFFSET,
@LockedByInstance_40e8337a NVARCHAR(255),
@ExpectedCompletionAt_40e8337a DATETIMEOFFSET,
@ConcurrencyMode_40e8337a NVARCHAR(20),
@RunImmediatelyIfNeverRun_40e8337a BIT,
@MaxRuntimeMinutes_40e8337a INT,
@MissedRunPolicy_40e8337a NVARCHAR(20)
SET
  @ID_40e8337a = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B20'
SET
  @JobTypeID_40e8337a = ISNULL((SELECT TOP 1 [ID] FROM [${mjSchema}].[ScheduledJobType] WHERE [Name] = N'Action'), '3B94DD43-E961-4D85-B7F4-B6783D748766')
SET
  @Name_40e8337a = N'Orders — Send External Invoices (half-hourly, business hours)'
SET
  @Description_40e8337a = N'Creates Bill.com invoices for billing units that have become invoiceable: confirmed orders billed as a whole and issued instalments. Ships disabled and set to Preview: enable it, confirm the Results list on the run, then set Preview to false to begin sending.'
SET
  @CronExpression_40e8337a = N'0 */30 13-23 * * 1-5'
SET
  @Timezone_40e8337a = N'UTC'
SET
  @Status_40e8337a = N'Disabled'
SET
  @Configuration_40e8337a = N'{"ActionID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01", "Params": [{"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04", "ValueType": "Static", "Value": "true"}, {"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B03", "ValueType": "Static", "Value": "25"}]}'
SET
  @RunCount_40e8337a = 0
SET
  @SuccessCount_40e8337a = 0
SET
  @FailureCount_40e8337a = 0
SET
  @NotifyOnSuccess_40e8337a = 0
SET
  @NotifyOnFailure_40e8337a = 1
SET
  @NotifyViaEmail_40e8337a = 0
SET
  @NotifyViaInApp_40e8337a = 1
SET
  @ConcurrencyMode_40e8337a = N'Skip'
SET
  @RunImmediatelyIfNeverRun_40e8337a = 0
SET
  @MaxRuntimeMinutes_40e8337a = 20
SET
  @MissedRunPolicy_40e8337a = N'RunOnce'
IF @JobTypeID_40e8337a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ScheduledJob]
               WHERE [ID] = @ID_40e8337a OR [Name] = @Name_40e8337a)
EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_40e8337a,
  @JobTypeID = @JobTypeID_40e8337a,
  @Name = @Name_40e8337a,
  @Description = @Description_40e8337a,
  @CronExpression = @CronExpression_40e8337a,
  @Timezone = @Timezone_40e8337a,
  @StartAt = @StartAt_40e8337a,
  @StartAt_Clear = 1,
  @EndAt = @EndAt_40e8337a,
  @EndAt_Clear = 1,
  @Status = @Status_40e8337a,
  @Configuration = @Configuration_40e8337a,
  @OwnerUserID = @OwnerUserID_40e8337a,
  @OwnerUserID_Clear = 1,
  @LastRunAt = @LastRunAt_40e8337a,
  @LastRunAt_Clear = 1,
  @NextRunAt = @NextRunAt_40e8337a,
  @NextRunAt_Clear = 1,
  @RunCount = @RunCount_40e8337a,
  @SuccessCount = @SuccessCount_40e8337a,
  @FailureCount = @FailureCount_40e8337a,
  @NotifyOnSuccess = @NotifyOnSuccess_40e8337a,
  @NotifyOnFailure = @NotifyOnFailure_40e8337a,
  @NotifyUserID = @NotifyUserID_40e8337a,
  @NotifyUserID_Clear = 1,
  @NotifyViaEmail = @NotifyViaEmail_40e8337a,
  @NotifyViaInApp = @NotifyViaInApp_40e8337a,
  @LockToken = @LockToken_40e8337a,
  @LockToken_Clear = 1,
  @LockedAt = @LockedAt_40e8337a,
  @LockedAt_Clear = 1,
  @LockedByInstance = @LockedByInstance_40e8337a,
  @LockedByInstance_Clear = 1,
  @ExpectedCompletionAt = @ExpectedCompletionAt_40e8337a,
  @ExpectedCompletionAt_Clear = 1,
  @ConcurrencyMode = @ConcurrencyMode_40e8337a,
  @RunImmediatelyIfNeverRun = @RunImmediatelyIfNeverRun_40e8337a,
  @MaxRuntimeMinutes = @MaxRuntimeMinutes_40e8337a,
  @MissedRunPolicy = @MissedRunPolicy_40e8337a;

GO

-- Save MJ: Scheduled Jobs (core SP call only)
DECLARE @ID_5f6d7fa3 UNIQUEIDENTIFIER,
@JobTypeID_5f6d7fa3 UNIQUEIDENTIFIER,
@Name_5f6d7fa3 NVARCHAR(200),
@Description_5f6d7fa3 NVARCHAR(MAX),
@CronExpression_5f6d7fa3 NVARCHAR(120),
@Timezone_5f6d7fa3 NVARCHAR(64),
@StartAt_5f6d7fa3 DATETIMEOFFSET,
@EndAt_5f6d7fa3 DATETIMEOFFSET,
@Status_5f6d7fa3 NVARCHAR(20),
@Configuration_5f6d7fa3 NVARCHAR(MAX),
@OwnerUserID_5f6d7fa3 UNIQUEIDENTIFIER,
@LastRunAt_5f6d7fa3 DATETIMEOFFSET,
@NextRunAt_5f6d7fa3 DATETIMEOFFSET,
@RunCount_5f6d7fa3 INT,
@SuccessCount_5f6d7fa3 INT,
@FailureCount_5f6d7fa3 INT,
@NotifyOnSuccess_5f6d7fa3 BIT,
@NotifyOnFailure_5f6d7fa3 BIT,
@NotifyUserID_5f6d7fa3 UNIQUEIDENTIFIER,
@NotifyViaEmail_5f6d7fa3 BIT,
@NotifyViaInApp_5f6d7fa3 BIT,
@LockToken_5f6d7fa3 UNIQUEIDENTIFIER,
@LockedAt_5f6d7fa3 DATETIMEOFFSET,
@LockedByInstance_5f6d7fa3 NVARCHAR(255),
@ExpectedCompletionAt_5f6d7fa3 DATETIMEOFFSET,
@ConcurrencyMode_5f6d7fa3 NVARCHAR(20),
@RunImmediatelyIfNeverRun_5f6d7fa3 BIT,
@MaxRuntimeMinutes_5f6d7fa3 INT,
@MissedRunPolicy_5f6d7fa3 NVARCHAR(20)
SET
  @ID_5f6d7fa3 = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B21'
SET
  @JobTypeID_5f6d7fa3 = ISNULL((SELECT TOP 1 [ID] FROM [${mjSchema}].[ScheduledJobType] WHERE [Name] = N'Action'), '3B94DD43-E961-4D85-B7F4-B6783D748766')
SET
  @Name_5f6d7fa3 = N'Orders — Poll External Payments (hourly)'
SET
  @Description_5f6d7fa3 = N'Reads cleared customer payments from Bill.com and records each once against the orders its invoices belong to. Ships disabled and set to Preview: enable it, confirm the Outcomes list on the run, then set Preview to false to begin recording cash.'
SET
  @CronExpression_5f6d7fa3 = N'0 15 * * * *'
SET
  @Timezone_5f6d7fa3 = N'UTC'
SET
  @Status_5f6d7fa3 = N'Disabled'
SET
  @Configuration_5f6d7fa3 = N'{"ActionID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11", "Params": [{"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13", "ValueType": "Static", "Value": "true"}, {"ActionParamID": "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B14", "ValueType": "Static", "Value": "100"}]}'
SET
  @RunCount_5f6d7fa3 = 0
SET
  @SuccessCount_5f6d7fa3 = 0
SET
  @FailureCount_5f6d7fa3 = 0
SET
  @NotifyOnSuccess_5f6d7fa3 = 0
SET
  @NotifyOnFailure_5f6d7fa3 = 1
SET
  @NotifyViaEmail_5f6d7fa3 = 0
SET
  @NotifyViaInApp_5f6d7fa3 = 1
SET
  @ConcurrencyMode_5f6d7fa3 = N'Skip'
SET
  @RunImmediatelyIfNeverRun_5f6d7fa3 = 0
SET
  @MaxRuntimeMinutes_5f6d7fa3 = 30
SET
  @MissedRunPolicy_5f6d7fa3 = N'RunOnce'
IF @JobTypeID_5f6d7fa3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ScheduledJob]
               WHERE [ID] = @ID_5f6d7fa3 OR [Name] = @Name_5f6d7fa3)
EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_5f6d7fa3,
  @JobTypeID = @JobTypeID_5f6d7fa3,
  @Name = @Name_5f6d7fa3,
  @Description = @Description_5f6d7fa3,
  @CronExpression = @CronExpression_5f6d7fa3,
  @Timezone = @Timezone_5f6d7fa3,
  @StartAt = @StartAt_5f6d7fa3,
  @StartAt_Clear = 1,
  @EndAt = @EndAt_5f6d7fa3,
  @EndAt_Clear = 1,
  @Status = @Status_5f6d7fa3,
  @Configuration = @Configuration_5f6d7fa3,
  @OwnerUserID = @OwnerUserID_5f6d7fa3,
  @OwnerUserID_Clear = 1,
  @LastRunAt = @LastRunAt_5f6d7fa3,
  @LastRunAt_Clear = 1,
  @NextRunAt = @NextRunAt_5f6d7fa3,
  @NextRunAt_Clear = 1,
  @RunCount = @RunCount_5f6d7fa3,
  @SuccessCount = @SuccessCount_5f6d7fa3,
  @FailureCount = @FailureCount_5f6d7fa3,
  @NotifyOnSuccess = @NotifyOnSuccess_5f6d7fa3,
  @NotifyOnFailure = @NotifyOnFailure_5f6d7fa3,
  @NotifyUserID = @NotifyUserID_5f6d7fa3,
  @NotifyUserID_Clear = 1,
  @NotifyViaEmail = @NotifyViaEmail_5f6d7fa3,
  @NotifyViaInApp = @NotifyViaInApp_5f6d7fa3,
  @LockToken = @LockToken_5f6d7fa3,
  @LockToken_Clear = 1,
  @LockedAt = @LockedAt_5f6d7fa3,
  @LockedAt_Clear = 1,
  @LockedByInstance = @LockedByInstance_5f6d7fa3,
  @LockedByInstance_Clear = 1,
  @ExpectedCompletionAt = @ExpectedCompletionAt_5f6d7fa3,
  @ExpectedCompletionAt_Clear = 1,
  @ConcurrencyMode = @ConcurrencyMode_5f6d7fa3,
  @RunImmediatelyIfNeverRun = @RunImmediatelyIfNeverRun_5f6d7fa3,
  @MaxRuntimeMinutes = @MaxRuntimeMinutes_5f6d7fa3,
  @MissedRunPolicy = @MissedRunPolicy_5f6d7fa3;

GO

