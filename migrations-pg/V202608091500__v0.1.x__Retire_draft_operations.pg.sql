-- =====================================================================================================
-- PostgreSQL counterpart of V202608091500__v0.1.x__Retire_draft_operations.sql.
--
-- Retire the four remote operations that took an OrderDraft. See the T-SQL file for WHY they are gone
-- and why deleting them needs a migration rather than a metadata push.
--
-- Identical statements: this touches only MJ core metadata rows, with no T-SQL-specific syntax to
-- translate. It is a separate file because the parity check wants one per migration, and because a
-- future divergence should be visible as a diff rather than discovered at deploy time.
--
-- NOTE: this repository has no other PG counterparts yet — the baseline and the tables migration
-- predate the check. The parity job stays red until those are written; this file is here so the new
-- migration is not a third one owing an explanation.
-- =====================================================================================================

DELETE FROM "__mj"."RemoteOperation"
 WHERE "ID" IN (
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C401',  -- Orders.SaveOrder
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C402',  -- Orders.PreviewOrder
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C403',  -- Orders.PreviewConfirm
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C404'   -- Orders.ConfirmOrder
       );

-- Belt and braces: an install that seeded these under different IDs is still carrying dead rows, and
-- the operation KEY is what a caller resolves by.
DELETE FROM "__mj"."RemoteOperation"
 WHERE "OperationKey" IN (
        'Orders.SaveOrder',
        'Orders.PreviewOrder',
        'Orders.PreviewConfirm',
        'Orders.ConfirmOrder'
       );
