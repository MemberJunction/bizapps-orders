-- =============================================================================
-- V202611161530 — The confirmed-line freeze (51003) covers the service period
--                 (bc-aidp-next-golive #391)
-- =============================================================================
-- Confirm schedules revenue recognition over ServicePeriodStart/End, so a booked
-- line whose dates move leaves the order and the ledger disagreeing on when the
-- work is delivered. The application refused Quantity, UnitPrice and the other
-- money columns on a booked line, but not the two dates, and trigger 51003 did
-- not compare them, so an API call or generic entity form could re-date a
-- confirmed line with no new or reversing recognition entry.
--
-- THE EXEMPTION. Orders itself re-dates a confirmed line in exactly three places,
-- and each one writes the line's subscription term(s) first and then copies the
-- term's window onto the line:
--   * confirm (materializeSubscriptions) — the header is already Confirmed when
--     the terms are written and the line takes the settled term's dates;
--   * a term extension (approved Duration concession) — moves the term's end,
--     then the line's;
--   * a term shift — moves the term, then the line.
-- Renewals are new orders and go through the confirm case. So the rule the
-- database can state without knowing who is writing is: a confirmed line's
-- service period may change only TO one of its own subscription terms' windows,
-- or to the span of all of them. A line with no terms (an ordinary deferred or
-- back-end line, an event) has no window to follow and is frozen outright.
--
-- trg_OrderLine_ImmutableAfterConfirm is restated whole from V202611031730 with
-- the added comparison (null-safe) and a message that names the period. Every
-- other check is carried forward unchanged. A trigger only, so there is no
-- CodeGen output for this file.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
-- =============================================================================

CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLine_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderLine]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- 51002: DELETE. Block if any deleted line belongs to a Confirmed order.
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
            WHERE o.Status = 'Confirmed'
        )
        BEGIN
            THROW 51002, 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
        END;
        RETURN;
    END;

    -- 51003: UPDATE. The frozen columns on lines of Confirmed orders.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
        WHERE o.Status = 'Confirmed'
          AND (
            i.ProductID      <> d.ProductID      OR
            i.CompanyID      <> d.CompanyID      OR
            i.Quantity       <> d.Quantity       OR
            i.UnitPrice      <> d.UnitPrice      OR
            i.DiscountPct    <> d.DiscountPct    OR
            i.LineTax        <> d.LineTax        OR
            ISNULL(i.LineTotalNet,   0) <> ISNULL(d.LineTotalNet,   0) OR
            ISNULL(i.LineTotalGross, 0) <> ISNULL(d.LineTotalGross, 0) OR
            EXISTS (SELECT i.ExtendedAmount EXCEPT SELECT d.ExtendedAmount) OR
            ISNULL(i.DiscountAmount, 0) <> ISNULL(d.DiscountAmount, 0) OR
            ISNULL(i.ChargeAmount,   0) <> ISNULL(d.ChargeAmount,   0) OR
            (
                -- The service period: recognition was scheduled over it at confirm (golive #391).
                (EXISTS (SELECT i.ServicePeriodStart EXCEPT SELECT d.ServicePeriodStart) OR
                 EXISTS (SELECT i.ServicePeriodEnd   EXCEPT SELECT d.ServicePeriodEnd))
                -- ...unless the new period is one of the line's own subscription terms...
                AND NOT EXISTS (
                    SELECT 1
                    FROM [${flyway:defaultSchema}].[SubscriptionTerm] t
                    WHERE t.OrderLineID = i.ID
                      AND t.StartDate = i.ServicePeriodStart
                      AND t.EndDate   = i.ServicePeriodEnd
                )
                -- ...or the span of all of them.
                AND NOT EXISTS (
                    SELECT 1
                    FROM [${flyway:defaultSchema}].[SubscriptionTerm] t
                    WHERE t.OrderLineID = i.ID
                    HAVING MIN(t.StartDate) = i.ServicePeriodStart
                       AND MAX(t.EndDate)   = i.ServicePeriodEnd
                )
            )
          )
    )
    BEGIN
        THROW 51003, 'OrderLine financial columns, service period and selling company cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order; a subscription line''s service period moves only with its subscription term.', 1;
    END;

    -- 51016: UPDATE. The line keeps the ship-to address it was sold to.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
        WHERE (
                o.Status = 'Confirmed'
                AND (
                    (d.ShipToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.ShipToAddressID EXCEPT SELECT d.ShipToAddressID)) OR
                    (d.ShipToAddressID IS NULL AND i.ShipToAddressID IS NOT NULL
                        AND i.ShipToAddressSnapshot IS NULL)
                )
              )
           OR (d.ShipToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.ShipToAddressSnapshot EXCEPT SELECT d.ShipToAddressSnapshot))
    )
    BEGIN
        THROW 51016, 'OrderLine ship-to address cannot be replaced once its order is Confirmed, and an empty one can be filled only together with its snapshot; the line keeps the address it was sold to. Use a reversal order.', 1;
    END;

    -- 51008: UPDATE. JournalEntryID is the per-line booking record: NULL→value
    -- once, never cleared or replaced (any status). Corrections go through a
    -- reversal order, not by re-pointing the booked entry.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        THROW 51008, 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.', 1;
    END;
END;
GO
