-- Orders' contribution to the Party Signals roster (PostgreSQL twin of party-customer-roster.sql).
--
-- Same contract, same rules: PartyKind, PartyID, Count, LastActivityAt; bill-to is the customer
-- (D65) and voided orders do not count. Output aliases are quoted because the contract is
-- case-sensitive on the consuming side — an unquoted alias folds to lower case and the picker
-- reads no columns at all.
SELECT
    'organization' AS "PartyKind",
    h.BillToOrganizationID AS "PartyID",
    COUNT(*)::int AS "Count",
    MAX(h.OrderDate) AS "LastActivityAt"
FROM __mj_bizappsorders.vwOrderHeaders h
WHERE h.Status <> 'Voided'
  AND h.BillToOrganizationID IS NOT NULL
GROUP BY h.BillToOrganizationID

UNION ALL

SELECT
    'person' AS "PartyKind",
    h.BillToPersonID AS "PartyID",
    COUNT(*)::int AS "Count",
    MAX(h.OrderDate) AS "LastActivityAt"
FROM __mj_bizappsorders.vwOrderHeaders h
WHERE h.Status <> 'Voided'
  AND h.BillToPersonID IS NOT NULL
GROUP BY h.BillToPersonID;
