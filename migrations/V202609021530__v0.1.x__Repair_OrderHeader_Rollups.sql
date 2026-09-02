-- =====================================================================================
-- Repair OrderHeader money rollups erased by a stale client write (issue #147)
-- =====================================================================================
-- TotalGross, AmountPaid and Balance on OrderHeader are maintained by
-- __mj_BizAppsOrders.spRecalcOrderHeaderTotals, fired by the OrderLine and PaymentLine
-- triggers. They were also, until this release, writable through the entity API.
--
-- WHAT WENT WRONG. On a create-and-confirm the header row is written before any line
-- exists, so Balance is legitimately NULL at that instant. OrderEntityServer never read the
-- refreshed row back onto the entity, so the object returned to the caller kept that NULL —
-- which is the dash the Balance tile rendered on an unpaid $895 order. The next header
-- update then sent it back: every SP-parameter field is sent regardless of dirty state, and
-- a nullable column carrying NULL emits @<Col>_Clear=1, which spUpdateOrderHeader honours by
-- writing NULL over the trigger's value. A stale AmountPaid = 0 needs no _Clear flag at all
-- to overwrite a captured payment.
--
-- So affected rows are not merely displaying wrong — the stored totals are gone, and Balance
-- is what payment allocation and the aging report read. ORD-000023 in BizAppsDev was
-- Confirmed, with one line worth 240.00 and a captured payment of 240.00, and a header
-- carrying TotalGross NULL, AmountPaid 0 and Balance NULL.
--
-- THE REPAIR. Re-derive the three money columns from the rows that are still authoritative:
-- OrderLine.LineTotalGross, and PaymentLine.Amount for payments in a state that counts.
--
-- WHY NOT JUST CALL THE PROC, given it holds this same formula. Because the proc also writes
-- FulfillmentStatus, and that column has drift of its own that has nothing to do with this
-- defect: V202608241300 added it with DEFAULT 'Pending' and never backfilled, so orders whose
-- lines require no fulfilment still read 'Pending' rather than 'NotApplicable' (10 of 24 in
-- BizAppsDev). Recalculating it here would silently change what the fulfilment queue shows,
-- inside a migration whose stated job is repairing money. That backfill is a separate change
-- with its own reasoning; this one touches only what the stale writes destroyed. The cost is
-- the aggregate expressions below duplicating the proc's — acceptable in a one-shot repair,
-- which is a point-in-time script rather than a second live definition to keep in step.
--
-- Safe to re-run: it is a pure recalculation from current line and payment state, so applying
-- it twice produces the same row. Orders that were never damaged are rewritten with the values
-- they already had. On a clean install it matches nothing.
--
-- The code fix that stops this recurring is OrderEntityServer.refreshRolledUpTotals(), which
-- adopts the row's values before Save() returns and before any header-only update is sent.
-- =====================================================================================

UPDATE o
SET TotalGross = ISNULL(l.LineTotal, 0),
    AmountPaid = ISNULL(p.Paid, 0),
    Balance    = ISNULL(l.LineTotal, 0) - ISNULL(p.Paid, 0)
FROM __mj_BizAppsOrders.OrderHeader o
OUTER APPLY (
    SELECT SUM(ol.LineTotalGross) AS LineTotal
    FROM __mj_BizAppsOrders.OrderLine ol
    WHERE ol.OrderHeaderID = o.ID
) l
OUTER APPLY (
    SELECT SUM(pl.Amount) AS Paid
    FROM __mj_BizAppsOrders.PaymentLine pl
    JOIN __mj_BizAppsOrders.PaymentHeader ph ON ph.ID = pl.PaymentHeaderID
    WHERE pl.OrderHeaderID = o.ID
      AND ph.Status IN ('Captured', 'Refunded', 'Disputed')
) p
-- Only rows that actually disagree with their source. Keeps the write set to the damage and
-- leaves __mj_UpdatedAt alone on every order that was already correct.
WHERE o.TotalGross IS NULL
   OR o.Balance IS NULL
   OR o.TotalGross <> ISNULL(l.LineTotal, 0)
   OR o.AmountPaid <> ISNULL(p.Paid, 0)
   OR o.Balance <> ISNULL(l.LineTotal, 0) - ISNULL(p.Paid, 0);
GO
