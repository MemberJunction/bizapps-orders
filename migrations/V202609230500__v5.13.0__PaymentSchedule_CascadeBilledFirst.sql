-- =============================================================================
-- V202609230500 — unnamed cash settles an INVOICED instalment before a Scheduled one
-- (bc-aidp-next-golive#239 follow-up · D91)
-- =============================================================================
-- Under D91 a scheduled company books no value at confirm; the receivable is created when an
-- instalment is invoiced. That makes the two row states mean different things to the ledger:
-- cash against an Invoiced row settles a receivable (Cr AR), cash against a Scheduled row is a
-- customer deposit (Cr Deferred Revenue). PaymentAllocationFactory splits the credit that way.
--
-- The cascade therefore has to agree with it. As first written this procedure poured unnamed cash
-- oldest-due-first with no regard for whether a row had been billed, so a payment could be counted
-- as a deposit against a future instalment while an invoice the customer actually holds sat unpaid.
-- Ordering billed rows first makes the rollup and the ledger tell the same story.
--
-- "Billed" is `DocumentNumber IS NOT NULL` rather than `Status = 'Invoiced'` deliberately: the
-- number is frozen at invoicing and never cleared (trg_OrderHeaderPaymentSchedule_Immutable), while
-- Status keeps moving — an invoiced row that is paid off reads 'Paid'. The document is the fact
-- that the customer was billed; the status is where the row is now.
--
-- NAMED PAYMENTS ARE UNAFFECTED. A payment line carrying OrderHeaderPaymentScheduleID still counts
-- against exactly the row it names, including a Scheduled one; only the leftover unnamed cash
-- cascades. Nothing else in the procedure changes, and an order with no schedule rows never
-- reaches it.
--
-- Procedure body only — no table, column, view or entity changes, so CodeGen emits nothing for this
-- file and there is no banner below.
-- =============================================================================

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spRecalcOrderHeaderPaymentSchedule]
    @OrderHeaderIDs [${flyway:defaultSchema}].[OrderHeaderIDList] READONLY
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH named AS (
        SELECT pl.OrderHeaderPaymentScheduleID AS ScheduleID, SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        JOIN @OrderHeaderIDs ids ON ids.ID = pl.OrderHeaderID
        WHERE pl.OrderHeaderPaymentScheduleID IS NOT NULL
          AND ph.Status IN ('Captured','Refunded','Disputed')
        GROUP BY pl.OrderHeaderPaymentScheduleID
    ),
    unnamed AS (
        SELECT pl.OrderHeaderID, SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        JOIN @OrderHeaderIDs ids ON ids.ID = pl.OrderHeaderID
        WHERE pl.OrderHeaderPaymentScheduleID IS NULL
          AND ph.Status IN ('Captured','Refunded','Disputed')
        GROUP BY pl.OrderHeaderID
    ),
    room AS (
        SELECT s.ID,
               s.OrderHeaderID,
               s.Amount,
               s.Status,
               ISNULL(n.Paid, 0) AS Named,
               -- What this row can still absorb from unnamed cash, and the running total of that
               -- through this row. BILLED FIRST, then oldest-due-first: a row that has been invoiced
               -- (it has a DocumentNumber) takes cash before a merely Scheduled one, whatever the
               -- dates say. Cash landing on a Scheduled row is a customer deposit rather than the
               -- settlement of a receivable (D91), so it must not happen while the customer still
               -- owes an invoice this order has actually issued. Canceled rows absorb nothing.
               CASE WHEN s.Status = 'Canceled' THEN 0
                    ELSE CASE WHEN s.Amount - ISNULL(n.Paid, 0) > 0 THEN s.Amount - ISNULL(n.Paid, 0) ELSE 0 END
               END AS Room,
               SUM(CASE WHEN s.Status = 'Canceled' THEN 0
                        ELSE CASE WHEN s.Amount - ISNULL(n.Paid, 0) > 0 THEN s.Amount - ISNULL(n.Paid, 0) ELSE 0 END
                   END) OVER (PARTITION BY s.OrderHeaderID
                              ORDER BY CASE WHEN s.DocumentNumber IS NOT NULL THEN 0 ELSE 1 END,
                                       s.DueDate, s.InstallmentNumber, s.CompanyID
                              ROWS UNBOUNDED PRECEDING) AS RoomThrough,
               ISNULL(u.Paid, 0) AS Unnamed
        FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
        JOIN @OrderHeaderIDs ids ON ids.ID = s.OrderHeaderID
        LEFT JOIN named n ON n.ScheduleID = s.ID
        LEFT JOIN unnamed u ON u.OrderHeaderID = s.OrderHeaderID
    ),
    computed AS (
        SELECT ID, Status, Amount,
               Named + CASE WHEN Unnamed >= RoomThrough THEN Room
                            WHEN Unnamed > RoomThrough - Room THEN Unnamed - (RoomThrough - Room)
                            ELSE 0 END AS Paid
        FROM room
    ),
    final AS (
        SELECT ID,
               Paid,
               Amount - Paid AS Balance,
               CASE WHEN Status IN ('Scheduled','Canceled','WrittenOff') THEN Status
                    WHEN Amount - Paid <= 0 THEN 'Paid'
                    ELSE 'Invoiced'
               END AS NewStatus
        FROM computed
    )
    UPDATE s
    SET AmountPaid = f.Paid,
        Balance    = f.Balance,
        Status     = f.NewStatus
    FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
    JOIN final f ON f.ID = s.ID
    -- Only rows whose figures actually move, so an unchanged row is not rewritten (and its
    -- immutability trigger not re-run) every time a sibling changes.
    WHERE s.AmountPaid <> f.Paid
       OR ISNULL(s.Balance, -1) <> f.Balance
       OR s.Status <> f.NewStatus;
END;
GO
