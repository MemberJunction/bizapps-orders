-- =============================================================================================
-- PostgreSQL counterpart of V202610291200__v5.39.x__ProgressMeasurement_ReversalDate_Description.sql
-- =============================================================================================
-- Written by hand: the T-SQL side is one sp_updateextendedproperty call, which is COMMENT ON
-- COLUMN here. No schema change. Schema names are written unquoted so they fold to the lowercase
-- schema a PostgreSQL install uses.
-- =============================================================================================

SET standard_conforming_strings = on;

COMMENT ON COLUMN __mj_BizAppsOrders."OrderLineProgressMeasurement"."ReversalJournalEntryID" IS 'Soft reference into accounting: the entry reversing the superseded observation''s recognition. Dated on that observation''s MeasurementDate, so the revenue it recognised nets to zero on that date, unless that date is on or before the company''s AccountingCompanyProfile.BooksClosedThroughDate; then on the first day after it. The Deferred/Unbilled split follows the line''s billing at the time of the supersede. NULL when this row supersedes nothing, or when the superseded observation posted no entry.';
