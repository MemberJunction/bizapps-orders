-- =============================================================================
-- V202610051600 — Payment schedule rows belong to the order's company
-- (bc-aidp-next-golive#311)
-- =============================================================================
-- An order is invoiced once per instalment, from the order's company, whatever
-- company owns each product on it (D61: one order, one payer, one invoice). Until
-- now the schedule carried one set of rows per product company, and each set was
-- invoiced as its own document. The code that ships with this release stamps every
-- new row with the order's CompanyID; this file moves the rows already written.
--
-- WHAT MOVES. On an order none of whose instalments has been issued, the Scheduled
-- rows that share a due date become ONE row for the order's company, for their
-- combined amount. Due dates are kept, so nothing is billed earlier or later than
-- the schedule already said. The new rows are numbered after any cancelled row the
-- order's company already holds, so no instalment number is reused.
--
-- WHAT DOES NOT MOVE.
--   * Any order with an issued instalment (a DocumentNumber, or a status past
--     Scheduled). The customer holds those documents, and the rest of that order's
--     schedule keeps its per-company rows so its later instalments still tie to
--     the instalments already issued. Such an order finishes on its old rows.
--   * Any order whose rows are named by a payment line or an external invoice. A
--     captured payment line cannot be re-pointed (trg_PaymentLine_ImmutableAfterCapture),
--     so deleting the row it names is not possible without losing what it settled.
--   * Cancelled rows. They are history and bill nothing.
--   * Orders whose Scheduled rows already all carry the order's company.
--
-- The ledger is untouched: a Scheduled row has booked nothing (D92). AmountPaid and
-- Balance are trigger-maintained, so trg_OrderHeaderPaymentSchedule_RollupTotals
-- recalculates them for every order this file changes.
--
-- One batch, so the temporary table lives for the whole of it.
-- =============================================================================

SET NOCOUNT ON;

-- Orders whose schedule moves.
SELECT DISTINCT s.OrderHeaderID, o.CompanyID AS OrderCompanyID
INTO #Orders
FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = s.OrderHeaderID
WHERE s.Status = N'Scheduled'
  AND s.CompanyID <> o.CompanyID
  AND NOT EXISTS (
        SELECT 1 FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] x
        WHERE x.OrderHeaderID = s.OrderHeaderID
          AND (x.DocumentNumber IS NOT NULL OR x.Status NOT IN (N'Scheduled', N'Canceled')))
  AND NOT EXISTS (
        SELECT 1
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] x ON x.ID = pl.OrderHeaderPaymentScheduleID
        WHERE x.OrderHeaderID = s.OrderHeaderID)
  AND NOT EXISTS (
        SELECT 1
        FROM [${flyway:defaultSchema}].[ExternalInvoice] ei
        JOIN [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] x ON x.ID = ei.OrderHeaderPaymentScheduleID
        WHERE x.OrderHeaderID = s.OrderHeaderID);

-- One row per order and due date. The description and notes of the first row on that
-- date (order's company first, then by company and instalment number) are kept; the
-- other rows' notes are appended so nothing typed on them is lost.
SELECT g.OrderHeaderID,
       g.OrderCompanyID,
       g.DueDate,
       g.Amount,
       DENSE_RANK() OVER (PARTITION BY g.OrderHeaderID ORDER BY g.DueDate) AS Position,
       lead_row.Description,
       g.Notes
INTO #Collapsed
FROM (
    SELECT s.OrderHeaderID,
           o.OrderCompanyID,
           s.DueDate,
           SUM(s.Amount) AS Amount,
           STRING_AGG(CAST(s.Notes AS NVARCHAR(MAX)), CHAR(13) + CHAR(10))
               WITHIN GROUP (ORDER BY s.CompanyID, s.InstallmentNumber) AS Notes
    FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
    JOIN #Orders o ON o.OrderHeaderID = s.OrderHeaderID
    WHERE s.Status = N'Scheduled'
    GROUP BY s.OrderHeaderID, o.OrderCompanyID, s.DueDate
) g
CROSS APPLY (
    SELECT TOP 1 s.Description
    FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
    WHERE s.OrderHeaderID = g.OrderHeaderID AND s.DueDate = g.DueDate AND s.Status = N'Scheduled'
    ORDER BY CASE WHEN s.CompanyID = g.OrderCompanyID THEN 0 ELSE 1 END, s.CompanyID, s.InstallmentNumber
) lead_row;

DELETE s
FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
JOIN #Orders o ON o.OrderHeaderID = s.OrderHeaderID
WHERE s.Status = N'Scheduled';

-- Numbered after the order company's highest remaining (cancelled) instalment, which
-- keeps UQ_OrderHeaderPaymentSchedule_Installment and never reissues a number.
INSERT INTO [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
    (OrderHeaderID, CompanyID, InstallmentNumber, DueDate, Amount, Status, Description, Notes)
SELECT c.OrderHeaderID,
       c.OrderCompanyID,
       ISNULL(used.MaxNumber, 0) + c.Position,
       c.DueDate,
       c.Amount,
       N'Scheduled',
       c.Description,
       c.Notes
FROM #Collapsed c
OUTER APPLY (
    SELECT MAX(x.InstallmentNumber) AS MaxNumber
    FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] x
    WHERE x.OrderHeaderID = c.OrderHeaderID AND x.CompanyID = c.OrderCompanyID
) used;

DROP TABLE #Collapsed;
DROP TABLE #Orders;
