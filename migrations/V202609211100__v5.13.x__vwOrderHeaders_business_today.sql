-- =============================================================================
-- IsOverdue compares against the BUSINESS day, not the UTC day
-- (bc-aidp-next-golive#168, aidp-next plans/2026-09-15-business-dates-design.md §6.1).
--
-- `CAST(GETUTCDATE() AS date)` is already tomorrow for the whole American evening, so
-- an order due today read as overdue from 7 PM Central. `bt.Today` is the calendar day
-- in the zone the business books in, from bizapps-common's fnBusinessToday(), joined
-- once per query (inline TVF, not a per-row scalar call).
--
-- THE VIEW BELOW IS `OverdueViewSQL()` FROM packages/Entities/src/overdue.ts, PASTED.
-- overdue.test.ts asserts this file contains that text. Change the function, not this.
-- The generated inner view vwOrderHeadersGenerated is untouched. SQL Server only:
-- layered base views are not supported on PostgreSQL, so there is no PG twin.
-- =============================================================================

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]
AS
SELECT
    g.*,
    CASE WHEN g.Balance > 0 AND g.DueDate IS NOT NULL AND g.DueDate < bt.Today AND g.Status NOT IN ('Draft','Quoted','Voided')
         THEN 1 ELSE 0 END AS IsOverdue
FROM [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g
CROSS JOIN [__mj_BizAppsCommon].[fnBusinessToday]() AS bt;
GO

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO
