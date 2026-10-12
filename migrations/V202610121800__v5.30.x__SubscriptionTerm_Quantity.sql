-- =============================================================================
-- V202610121800 — SubscriptionTerm.Quantity: how many seats a term covers
--                 (MemberJunction/bizapps-orders#589)
-- =============================================================================
-- A subscription line bought at quantity 10 bills ten times the rate and creates
-- one subscription with one term. Nothing recorded the 10. The order line could
-- not stand in for it either: a prorated first period is priced by scaling the
-- line's quantity (10 seats at a factor of 0.5 store Quantity 5), so after
-- booking the seat count existed nowhere. Entitlement grants and renewals read
-- the scaled number, so a half-length first period granted and renewed 5 seats.
--
-- The count lives on the TERM, not the subscription: each term is one purchase,
-- so a renewal at a different seat count is a new term with its own count and
-- the earlier terms keep theirs. A subscription's current seat count is its
-- active term's.
--
-- Existing terms are backfilled from the line that bought them, undoing the
-- proration scaling and rounding to whole seats (the same rounding renewals
-- already applied), never below 1.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[SubscriptionTerm]
    ADD [Quantity] INT NOT NULL CONSTRAINT [DF_SubscriptionTerm_Quantity] DEFAULT 1;
GO

UPDATE t
SET t.[Quantity] = CASE
        WHEN seats.[Seats] < 1 THEN 1
        ELSE CAST(seats.[Seats] AS INT)
    END
FROM [${flyway:defaultSchema}].[SubscriptionTerm] t
INNER JOIN [${flyway:defaultSchema}].[OrderLine] l ON l.[ID] = t.[OrderLineID]
CROSS APPLY (
    SELECT ROUND(
        CASE
            WHEN t.[IsProrated] = 1 AND t.[ProrationFactor] > 0 THEN ABS(l.[Quantity]) / t.[ProrationFactor]
            ELSE ABS(l.[Quantity])
        END, 0) AS [Seats]
) seats;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many seats this term covers: the quantity the order line bought, before any proration. A prorated first period scales the order line''s Quantity to price the short period, so the line cannot be read for the seat count; entitlement grants and renewals read this instead. Whole seats only, at least 1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionTerm',
    @level2type = N'COLUMN', @level2name = N'Quantity';
GO























































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================
