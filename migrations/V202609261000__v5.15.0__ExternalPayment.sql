-- =============================================================================
-- ExternalPayment and PaymentProviderSyncState — the payment poller's ledger and watermark.
--
-- golive #148: poll Bill.com for receivable payments and create exactly one Payment per cleared
-- payment. ExternalPayment records EVERY rail payment the poller has seen and what it did with it —
-- Captured (with the PaymentHeader it made), Held (not yet cleared, or an unknown status), Unmatched
-- (an invoice we did not issue), Ignored, or ReversalNeeded (captured, and the rail now says void).
-- The audit trail and the exceptions worklist are the same table. The D19 idempotency guarantee is
-- PaymentHeader.IdempotencyKey ('billcom:0rp…') and its unique index; this row is the cheap lookup
-- in front of it and the answer to "why was this payment not applied".
--
-- PaymentProviderSyncState is the poll watermark per provider row per rail object. Orders-owned
-- because the MJ sync engine's watermark is keyed by entity map, which this integration does not use.
--
-- Plain DDL, GO-separated, one sp_addextendedproperty per description (the #219/#220 shape).
-- No __mj_CreatedAt/__mj_UpdatedAt, no FK indexes — CodeGen owns both.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[ExternalPayment] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ExternalPayment_ID] DEFAULT (newsequentialid()),
    [PaymentProviderID]   UNIQUEIDENTIFIER NOT NULL,
    [ExternalPaymentRef]  NVARCHAR(100)    NOT NULL,
    [ExternalCustomerRef] NVARCHAR(100)    NULL,
    [Amount]              DECIMAL(18,2)    NOT NULL,
    [UnappliedAmount]     DECIMAL(18,2)    NOT NULL CONSTRAINT [DF_ExternalPayment_UnappliedAmount] DEFAULT (0),
    [PaymentDate]         DATE             NULL,
    [ExternalStatus]      NVARCHAR(40)     NULL,
    [ExternalUpdatedAt]   DATETIMEOFFSET   NULL,
    [Disposition]         NVARCHAR(20)     NOT NULL,
    [DispositionReason]   NVARCHAR(500)    NULL,
    [PaymentHeaderID]     UNIQUEIDENTIFIER NULL,
    [Payload]             NVARCHAR(MAX)    NULL,
    [FirstSeenAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_ExternalPayment_FirstSeenAt] DEFAULT (SYSDATETIMEOFFSET()),
    [LastSeenAt]          DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_ExternalPayment_LastSeenAt]  DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT [PK_ExternalPayment] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_ExternalPayment_PaymentProvider] FOREIGN KEY ([PaymentProviderID]) REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT [FK_ExternalPayment_PaymentHeader]   FOREIGN KEY ([PaymentHeaderID])   REFERENCES [${flyway:defaultSchema}].[PaymentHeader]([ID]),
    CONSTRAINT [UQ_ExternalPayment_Ref] UNIQUE ([PaymentProviderID], [ExternalPaymentRef]),
    CONSTRAINT [CK_ExternalPayment_Disposition] CHECK ([Disposition] IN (N'Captured', N'Held', N'Unmatched', N'Refused', N'Ignored', N'ReversalNeeded')),
    -- A captured payment always knows which PaymentHeader it made.
    CONSTRAINT [CK_ExternalPayment_CapturedHasHeader] CHECK ([Disposition] <> N'Captured' OR [PaymentHeaderID] IS NOT NULL)
);
GO

CREATE TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] (
    [ID]                UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PaymentProviderSyncState_ID] DEFAULT (newsequentialid()),
    [PaymentProviderID] UNIQUEIDENTIFIER NOT NULL,
    [ObjectName]        NVARCHAR(100)    NOT NULL,
    [Watermark]         NVARCHAR(100)    NULL,
    [LastPolledAt]      DATETIMEOFFSET   NULL,
    [LastSucceededAt]   DATETIMEOFFSET   NULL,
    [LastError]         NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_PaymentProviderSyncState] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_PaymentProviderSyncState_PaymentProvider] FOREIGN KEY ([PaymentProviderID]) REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT [UQ_PaymentProviderSyncState] UNIQUE ([PaymentProviderID], [ObjectName])
);
GO

-- -----------------------------------------------------------------------------
-- Descriptions
-- -----------------------------------------------------------------------------
EXEC sp_addextendedproperty N'MS_Description', N'Every receivable payment the poller has seen on an external AR rail (Bill.com), and what it did with it. Captured rows name the PaymentHeader they created; Held, Unmatched and ReversalNeeded rows are the exceptions worklist. The idempotency guarantee itself is PaymentHeader.IdempotencyKey; this is the lookup in front of it and the audit trail.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row (rail + company) the payment was read from.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s payment id (Bill.com 0rp…). Unique per provider.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalPaymentRef';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s customer id the payment came from.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalCustomerRef';
EXEC sp_addextendedproperty N'MS_Description', N'The payment''s gross amount as the rail reports it.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Amount';
EXEC sp_addextendedproperty N'MS_Description', N'The part the rail has not applied to any invoice (over-payment or unlinked). Stays on the rail as the customer''s credit.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'UnappliedAmount';
EXEC sp_addextendedproperty N'MS_Description', N'When the rail says funds moved.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentDate';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s status string, verbatim, as last seen.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalStatus';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s updatedTime as last seen — the watermark candidate.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalUpdatedAt';
EXEC sp_addextendedproperty N'MS_Description', N'Captured, Held (pending or unknown status), Unmatched (an invoice we did not issue), Refused (Orders.CapturePayment refused it — a split-company order, an ambiguous payer, a configuration fault), Ignored (nothing to do, or set aside by a person), ReversalNeeded (captured, and the rail now reports it reversed).', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Disposition';
EXEC sp_addextendedproperty N'MS_Description', N'Why, in words a person can act on.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'DispositionReason';
EXEC sp_addextendedproperty N'MS_Description', N'The Orders payment created for a Captured row.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentHeaderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s record as received, JSON, for the audit trail.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Payload';
EXEC sp_addextendedproperty N'MS_Description', N'First poll that saw this payment.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'FirstSeenAt';
EXEC sp_addextendedproperty N'MS_Description', N'Most recent poll that saw this payment.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'LastSeenAt';
GO

EXEC sp_addextendedproperty N'MS_Description', N'Poll watermark and last-run outcome per provider row per rail object (e.g. receivable-payments). Advanced only after a pass completes without a fault.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row (rail + company) this watermark belongs to.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail object polled, e.g. receivable-payments.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'ObjectName';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s max updatedTime seen on the last clean pass (ISO). The next pass reads from one day before it; dedupe is by payment id.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'Watermark';
EXEC sp_addextendedproperty N'MS_Description', N'When the last pass started.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastPolledAt';
EXEC sp_addextendedproperty N'MS_Description', N'When the last pass completed without a fault.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastSucceededAt';
EXEC sp_addextendedproperty N'MS_Description', N'The fault that stopped the last pass, if any.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastError';
GO

-- CodeGen output (entities MJ_BizApps_Orders: External Payments / Payment Provider Sync States) is
-- folded below this banner once applied and generated (docs/database-migrations.md).
