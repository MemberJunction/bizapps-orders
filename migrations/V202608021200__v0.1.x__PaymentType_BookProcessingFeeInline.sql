-- =============================================================================
-- PaymentType.BookProcessingFeeInline — does this tender's processor fee become
-- its own journal entry, or is it accrued at month end? (plan D82)
-- =============================================================================
--
-- WHY THE DEFAULT IS 0, AND WHY THAT IS THE CORRECT ANSWER RATHER THAN THE TIMID ONE.
--
-- Until now a capture booked `Dr Processing Fee / Cr Cash` for every payment
-- carrying a fee. That cannot reconcile to a bank statement, and the reason is
-- structural rather than arithmetic: THE BANK DOES NOT MOVE MONEY PER PAYMENT.
-- A processor batches into payouts and deducts costs that never attach to any
-- payment at all — a failed-debit charge, a dispute fee, a monthly platform
-- charge. Booking one category per transaction therefore produces a Cash figure
-- that is right in aggregate only if every OTHER category is also captured, and
-- never right on any given day.
--
-- Accruing the whole processor cost once, at month end, from the statement
-- Finance actually reconciles against, is both simpler and more correct. So the
-- ledger leg is OFF for every tender, and a deployment opts a tender back in
-- only where per-payment fee attribution is genuinely wanted — which is the one
-- thing an accrual cannot give you.
--
-- NOTE THAT THE FEE IS STILL READ AND STILL STORED. `PaymentHeader.ProcessingFeeAmount`
-- and `NetAmount` are unaffected: the live driver reads `balance_transaction.fee`
-- from the gateway (it never CALCULATES a rate, so graduated and negotiated
-- schedules are the processor's problem). This flag decides only whether that
-- number becomes a JOURNAL ENTRY.
--
-- WHY ON THE TENDER RATHER THAN THE PROVIDER. The fee is arguably a property of
-- the gateway, and a deployment collecting cards through two processors could
-- want different answers. At the volumes this app is built for that distinction
-- is theoretical, and the tender is where an administrator looks — `PaymentType`
-- is the list they already curate. If per-provider granularity is ever needed,
-- this column becomes the default and the provider overrides it.
--
-- THE LONG-TERM MODEL IS A CLEARING ACCOUNT, and this column is not it. The shape
-- that reconciles exactly is `Dr Clearing / Cr AR` per payment and
-- `Dr Cash + Dr Fees / Cr Clearing` per payout, because the payout total IS the
-- fee total. That needs a Payout record and a statement import; deliberately out
-- of scope here, and this flag is compatible with it (a deployment adopting
-- payouts leaves every tender at 0).
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.PaymentType
    ADD BookProcessingFeeInline BIT NOT NULL
        CONSTRAINT DF_PaymentType_BookProcessingFeeInline DEFAULT (0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, a capture with a processor fee books it as its own journal entry (Dr Processing Fee / Cr Cash). DEFAULT 0: a per-payment fee leg cannot reconcile to a bank statement, because the processor batches into payouts and deducts costs that never attach to any payment - a failed-debit charge, a dispute fee, a monthly platform charge - so the whole processor cost is accrued in the accounting system at month end instead (D82). The fee is still READ from the gateway and still stored on PaymentHeader.ProcessingFeeAmount and NetAmount regardless; this flag decides only whether it becomes a ledger entry. Turn it on only for a tender whose per-payment fee attribution is genuinely needed, and expect to reconcile the difference.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentType',
    @level2type = N'COLUMN', @level2name = N'BookProcessingFeeInline';
GO
