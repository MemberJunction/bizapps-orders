-- One-row party lifetime for the Person / Organization form header.
-- PartyKind is only used in Nunjucks branches — it never touches SQL text.
-- PartyID is quoted via sqlString.
SELECT
    ISNULL(o.OrderCount, 0) AS OrderCount,
    ISNULL(o.OpenCount, 0) AS OpenCount,
    ISNULL(o.OverdueCount, 0) AS OverdueCount,
    ISNULL(o.LifetimeValue, 0) AS LifetimeValue,
    o.FirstOrderDate,
    CASE
        WHEN o.FirstOrderDate IS NULL THEN NULL
        ELSE DATEDIFF(year, o.FirstOrderDate, SYSUTCDATETIME())
    END AS YearsAsCustomer,
    ISNULL(s.ActiveSubCount, 0) AS ActiveSubCount
FROM (SELECT 1 AS OneRow) AS seed
OUTER APPLY (
    SELECT
        COUNT(*) AS OrderCount,
        SUM(CASE WHEN ISNULL(h.IsOverdue, 0) = 1 OR ISNULL(h.Balance, 0) > 0 THEN 1 ELSE 0 END) AS OpenCount,
        SUM(CASE WHEN ISNULL(h.IsOverdue, 0) = 1 THEN 1 ELSE 0 END) AS OverdueCount,
        SUM(ISNULL(h.TotalGross, 0)) AS LifetimeValue,
        MIN(h.OrderDate) AS FirstOrderDate
    FROM [__mj_BizAppsOrders].vwOrderHeaders h
    WHERE h.Status <> N'Voided'
      {% if PartyKind == "person" %}
      AND h.BillToPersonID = {{ PartyID | sqlString }}
      {% else %}
      AND h.BillToOrganizationID = {{ PartyID | sqlString }}
      {% endif %}
) o
OUTER APPLY (
    SELECT COUNT(*) AS ActiveSubCount
    FROM [__mj_BizAppsOrders].vwSubscriptions sub
    WHERE sub.Status = N'Active'
      {% if PartyKind == "person" %}
      AND sub.BeneficiaryPersonID = {{ PartyID | sqlString }}
      {% else %}
      AND sub.HolderOrganizationID = {{ PartyID | sqlString }}
      {% endif %}
) s;
