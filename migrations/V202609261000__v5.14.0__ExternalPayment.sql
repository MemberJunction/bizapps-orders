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
-- No __mj_CreatedAt/__mj_UpdatedAt, no FK indexes — CodeGen owns both. Idempotent.
-- =============================================================================

IF OBJECT_ID('${flyway:defaultSchema}.ExternalPayment') IS NULL
BEGIN
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
        CONSTRAINT [CK_ExternalPayment_Disposition] CHECK ([Disposition] IN (N'Captured', N'Held', N'Unmatched', N'Ignored', N'ReversalNeeded')),
        -- A captured payment always knows which PaymentHeader it made.
        CONSTRAINT [CK_ExternalPayment_CapturedHasHeader] CHECK ([Disposition] <> N'Captured' OR [PaymentHeaderID] IS NOT NULL)
    );
END;
GO

IF OBJECT_ID('${flyway:defaultSchema}.PaymentProviderSyncState') IS NULL
BEGIN
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
END;
GO

DECLARE @s NVARCHAR(128) = N'${flyway:defaultSchema}';

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(@s + N'.ExternalPayment') AND minor_id = 0 AND name = 'MS_Description')
    EXEC sp_addextendedproperty N'MS_Description', N'Every receivable payment the poller has seen on an external AR rail (Bill.com), and what it did with it. Captured rows name the PaymentHeader they created; Held, Unmatched and ReversalNeeded rows are the exceptions worklist. The idempotency guarantee itself is PaymentHeader.IdempotencyKey; this is the lookup in front of it and the audit trail.', N'SCHEMA', @s, N'TABLE', N'ExternalPayment';

DECLARE @cols TABLE (Col SYSNAME, Txt NVARCHAR(1000));
INSERT INTO @cols VALUES
 (N'PaymentProviderID', N'The provider row (rail + company) the payment was read from.'),
 (N'ExternalPaymentRef', N'The rail''s payment id (Bill.com 0rp…). Unique per provider.'),
 (N'ExternalCustomerRef', N'The rail''s customer id the payment came from.'),
 (N'Amount', N'The payment''s gross amount as the rail reports it.'),
 (N'UnappliedAmount', N'The part the rail has not applied to any invoice (over-payment or unlinked). Stays on the rail as the customer''s credit.'),
 (N'PaymentDate', N'When the rail says funds moved.'),
 (N'ExternalStatus', N'The rail''s status string, verbatim, as last seen.'),
 (N'ExternalUpdatedAt', N'The rail''s updatedTime as last seen — the watermark candidate.'),
 (N'Disposition', N'Captured, Held (pending or unknown status), Unmatched (an invoice we did not issue), Ignored (nothing to do), ReversalNeeded (captured, and the rail now reports it reversed).'),
 (N'DispositionReason', N'Why, in words a person can act on.'),
 (N'PaymentHeaderID', N'The Orders payment created for a Captured row.'),
 (N'Payload', N'The rail''s record as received, JSON, for the audit trail.'),
 (N'FirstSeenAt', N'First poll that saw this payment.'),
 (N'LastSeenAt', N'Most recent poll that saw this payment.');
DECLARE @c SYSNAME, @t NVARCHAR(1000);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT Col, Txt FROM @cols;
OPEN cur; FETCH NEXT FROM cur INTO @c, @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.extended_properties ep JOIN sys.columns col ON col.object_id = ep.major_id AND col.column_id = ep.minor_id
                   WHERE ep.name = 'MS_Description' AND ep.major_id = OBJECT_ID(@s + N'.ExternalPayment') AND col.name = @c)
        EXEC sp_addextendedproperty N'MS_Description', @t, N'SCHEMA', @s, N'TABLE', N'ExternalPayment', N'COLUMN', @c;
    FETCH NEXT FROM cur INTO @c, @t;
END;
CLOSE cur; DEALLOCATE cur;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(@s + N'.PaymentProviderSyncState') AND minor_id = 0 AND name = 'MS_Description')
    EXEC sp_addextendedproperty N'MS_Description', N'Poll watermark and last-run outcome per provider row per rail object (e.g. receivable-payments). Advanced only after a pass completes without a fault.', N'SCHEMA', @s, N'TABLE', N'PaymentProviderSyncState';

DELETE FROM @cols;
INSERT INTO @cols VALUES
 (N'PaymentProviderID', N'The provider row (rail + company) this watermark belongs to.'),
 (N'ObjectName', N'The rail object polled, e.g. receivable-payments.'),
 (N'Watermark', N'The rail''s max updatedTime seen on the last clean pass (ISO). The next pass reads from one day before it; dedupe is by payment id.'),
 (N'LastPolledAt', N'When the last pass started.'),
 (N'LastSucceededAt', N'When the last pass completed without a fault.'),
 (N'LastError', N'The fault that stopped the last pass, if any.');
OPEN cur; FETCH NEXT FROM cur INTO @c, @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.extended_properties ep JOIN sys.columns col ON col.object_id = ep.major_id AND col.column_id = ep.minor_id
                   WHERE ep.name = 'MS_Description' AND ep.major_id = OBJECT_ID(@s + N'.PaymentProviderSyncState') AND col.name = @c)
        EXEC sp_addextendedproperty N'MS_Description', @t, N'SCHEMA', @s, N'TABLE', N'PaymentProviderSyncState', N'COLUMN', @c;
    FETCH NEXT FROM cur INTO @c, @t;
END;
CLOSE cur; DEALLOCATE cur;
GO

-- CodeGen output (entities MJ_BizApps_Orders: External Payments / Payment Provider Sync States) is
-- folded below this banner once applied and generated (docs/database-migrations.md).
