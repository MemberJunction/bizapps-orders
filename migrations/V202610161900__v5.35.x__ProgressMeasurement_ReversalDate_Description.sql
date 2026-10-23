-- =============================================================================
-- V202610161900 — ReversalJournalEntryID's description follows the closed-books
-- rule (golive #316)
-- =============================================================================
-- Orders.RecordProgress no longer decides a month is closed because a journal-
-- entry batch posted in it: with batches built daily, every month looked closed
-- from its first day. Finance now sets
-- AccountingCompanyProfile.BooksClosedThroughDate per company, and a supersede's
-- reversal stays on the replaced observation's own date unless that date is on
-- or before it; then the reversal is dated the first day after it.
--
-- The column description written with the supersede still describes the
-- posted-batch rule. This migration replaces it. No schema change.
--
-- The banner at the end of this file says why nothing follows it.
-- =============================================================================

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Soft reference into accounting: the entry reversing the superseded observation''s recognition. Dated on that observation''s MeasurementDate, so the revenue it recognised nets to zero on that date, unless that date is on or before the company''s AccountingCompanyProfile.BooksClosedThroughDate; then on the first day after it. The Deferred/Unbilled split follows the line''s billing at the time of the supersede. NULL when this row supersedes nothing, or when the superseded observation posted no entry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'ReversalJournalEntryID';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- CodeGen emits no SQL for this change: a description is not a schema
-- change, and the view and CRUD procs it regenerates are unchanged. Install's
-- metadata refresh (spUpdateExistingEntityFieldsFromSchema) copies the new
-- description into EntityField; the generated entity and GraphQL descriptions
-- are committed with this migration.
-- =============================================================================
