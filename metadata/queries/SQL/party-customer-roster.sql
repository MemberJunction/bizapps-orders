-- Orders' contribution to the Party Signals roster.
--
-- Contract columns, in this order and under these names: PartyKind, PartyID, Count,
-- LastActivityAt. The shared party pickers union this with every other app's signal query
-- to answer "is this party a customer" without knowing what an order is.
--
-- BILL-TO IS THE CUSTOMER (D65). Ship-to is where the goods land — a warehouse, a venue, an
-- attendee — and naming it here would offer a party we have never billed as a customer, which
-- is the confusion this query exists to remove.
--
-- Voided orders do not count: a voided order is a transaction that did not happen, and letting
-- one stand in for a customer relationship is how a mistyped party keeps looking like a real one.
-- No parameters; the picker filters client side.
SELECT
    N'organization' AS PartyKind,
    h.BillToOrganizationID AS PartyID,
    COUNT(*) AS [Count],
    MAX(h.OrderDate) AS LastActivityAt
FROM [__mj_BizAppsOrders].vwOrderHeaders h
WHERE h.Status <> N'Voided'
  AND h.BillToOrganizationID IS NOT NULL
GROUP BY h.BillToOrganizationID

UNION ALL

SELECT
    N'person' AS PartyKind,
    h.BillToPersonID AS PartyID,
    COUNT(*) AS [Count],
    MAX(h.OrderDate) AS LastActivityAt
FROM [__mj_BizAppsOrders].vwOrderHeaders h
WHERE h.Status <> N'Voided'
  AND h.BillToPersonID IS NOT NULL
GROUP BY h.BillToPersonID;
