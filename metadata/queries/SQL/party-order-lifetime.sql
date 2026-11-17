-- One-row party lifetime for the Person / Organization form header.
-- PartyKind is only used in Nunjucks branches — it never touches SQL text.
-- PartyID is quoted via sqlString.
-- Money is in the selling company's FUNCTIONAL currency (golive #492). An order's amounts are in its
-- CurrencyCode (NULL, or the company's own functional currency, means functional); a foreign order
-- converts at its BookingExchangeRate, set when it was first confirmed. A foreign order with no rate
-- yet has a NULL FunctionalRate, so SUM leaves it out and UnconvertedOrderCount counts it, instead of
-- adding its foreign amounts as functional.
-- Years are counted to the BUSINESS day (fnBusinessToday), not the UTC one, which turns the year
-- over on Dec 31 evening for anyone west of Greenwich.
SELECT
    ISNULL(o.OrderCount, 0) AS OrderCount,
    ISNULL(o.OpenCount, 0) AS OpenCount,
    ISNULL(o.OverdueCount, 0) AS OverdueCount,
    ISNULL(o.LifetimeValue, 0) AS LifetimeValue,
    ISNULL(o.UnconvertedOrderCount, 0) AS UnconvertedOrderCount,
    o.FirstOrderDate,
    CASE
        WHEN o.FirstOrderDate IS NULL THEN NULL
        ELSE DATEDIFF(year, o.FirstOrderDate, bt.Today)
    END AS YearsAsCustomer,
    ISNULL(s.ActiveSubCount, 0) AS ActiveSubCount
FROM (SELECT 1 AS OneRow) AS seed
CROSS JOIN [__mj_BizAppsCommon].[fnBusinessToday]() AS bt
OUTER APPLY (
    SELECT
        COUNT(*) AS OrderCount,
        SUM(CASE WHEN ISNULL(h.IsOverdue, 0) = 1 OR ISNULL(h.Balance, 0) > 0 THEN 1 ELSE 0 END) AS OpenCount,
        SUM(CASE WHEN ISNULL(h.IsOverdue, 0) = 1 THEN 1 ELSE 0 END) AS OverdueCount,
        CAST(ROUND(SUM(ISNULL(h.TotalGross, 0) * fx.FunctionalRate), 2) AS DECIMAL(18,2)) AS LifetimeValue,
        SUM(CASE WHEN fx.FunctionalRate IS NULL THEN 1 ELSE 0 END) AS UnconvertedOrderCount,
        COUNT(fx.FunctionalRate) AS ConvertedOrderCount,
        MIN(h.OrderDate) AS FirstOrderDate
    FROM [__mj_BizAppsOrders].vwOrderHeaders h
    LEFT JOIN [__mj_BizAppsAccounting].[AccountingCompanyProfile] acp ON acp.ID = h.CompanyID
    CROSS APPLY (
        SELECT CASE
            WHEN h.CurrencyCode IS NULL OR h.CurrencyCode = acp.FunctionalCurrencyCode THEN CAST(1 AS DECIMAL(18,8))
            ELSE h.BookingExchangeRate
        END AS FunctionalRate
    ) fx
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
