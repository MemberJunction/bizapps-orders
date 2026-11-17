-- Single-query party orders overview bundle for Person and Organization forms.
-- Returns all overview KPI figures, 6-month spend trajectory, recent orders, and active subscriptions in one shot.
-- PartyKind is only used in Nunjucks branches — it never touches SQL text.
-- PartyID is quoted via sqlString.
-- Money is in the selling company's FUNCTIONAL currency (golive #492). An order's amounts are in its
-- CurrencyCode (NULL, or the company's own functional currency, means functional); a foreign order
-- converts at its BookingExchangeRate, set when it was first confirmed. A foreign order with no rate
-- yet has a NULL FunctionalRate, so SUM leaves it out and UnconvertedOrderCount counts it, instead of
-- adding its foreign amounts as functional.
-- "Now" is the BUSINESS day (fnBusinessToday), not the UTC clock: the UTC day is already tomorrow
-- for the whole American evening, which moved the six-month window a month ahead on the last
-- evening of every month and turned the customer-years over on Dec 31.
SELECT
    ISNULL(o.OrderCount, 0) AS OrderCount,
    ISNULL(o.OpenCount, 0) AS OpenCount,
    ISNULL(o.OverdueCount, 0) AS OverdueCount,
    ISNULL(o.LifetimeValue, 0) AS LifetimeValue,
    ISNULL(o.UnconvertedOrderCount, 0) AS UnconvertedOrderCount,
    -- Averaged over the orders the lifetime value includes.
    CASE
        WHEN ISNULL(o.ConvertedOrderCount, 0) > 0 THEN ISNULL(o.LifetimeValue, 0) / o.ConvertedOrderCount
        ELSE 0
    END AS AvgOrderValue,
    o.FirstOrderDate,
    CASE
        WHEN o.FirstOrderDate IS NULL THEN NULL
        ELSE DATEDIFF(year, o.FirstOrderDate, bt.Today)
    END AS YearsAsCustomer,
    ISNULL(s.ActiveSubCount, 0) AS ActiveSubCount,
    r.RecentOrdersJson,
    sub_agg.ActiveSubscriptionsJson,
    traj.MonthlyTrajectoryJson
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
) s
OUTER APPLY (
    SELECT (
        SELECT TOP 6
            h.ID,
            h.OrderNumber,
            h.OrderDate,
            h.Status,
            h.IsOverdue,
            ISNULL(h.TotalGross, 0) AS TotalGross,
            ISNULL(h.AmountPaid, 0) AS AmountPaid,
            ISNULL(h.Balance, 0) AS Balance,
            -- The order's own currency when it is not functional; NULL prints as functional.
            CASE WHEN h.CurrencyCode IS NULL OR h.CurrencyCode = acp.FunctionalCurrencyCode THEN NULL ELSE h.CurrencyCode END AS ForeignCurrencyCode,
            CAST(ROUND(ISNULL(h.TotalGross, 0) * fx.FunctionalRate, 2) AS DECIMAL(18,2)) AS FunctionalTotalGross
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
        ORDER BY h.OrderDate DESC
        FOR JSON PATH
    ) AS RecentOrdersJson
) r
OUTER APPLY (
    SELECT (
        SELECT TOP 4
            sub.ID,
            sub.SubscriptionNumber,
            sub.Product,
            sub.SubscriptionType,
            sub.Status,
            sub.StartDate,
            sub.EndDate,
            sub.AutoRenew
        FROM [__mj_BizAppsOrders].vwSubscriptions sub
        WHERE sub.Status = N'Active'
          {% if PartyKind == "person" %}
          AND sub.BeneficiaryPersonID = {{ PartyID | sqlString }}
          {% else %}
          AND sub.HolderOrganizationID = {{ PartyID | sqlString }}
          {% endif %}
        ORDER BY sub.StartDate DESC
        FOR JSON PATH
    ) AS ActiveSubscriptionsJson
) sub_agg
OUTER APPLY (
    SELECT (
        SELECT
            m.MonthOffset,
            m.MonthLabel,
            m.MonthShort,
            CAST(ISNULL(ROUND(SUM(h.TotalGross * fx.FunctionalRate), 2), 0) AS DECIMAL(18,2)) AS Amount
        FROM [__mj_BizAppsCommon].[fnBusinessToday]() AS mbt
        CROSS APPLY (
            SELECT 0 AS MonthOffset, FORMAT(DATEADD(month, 0, mbt.Today), 'yyyy-MM') AS MonthKey, FORMAT(DATEADD(month, 0, mbt.Today), 'MMMM yyyy') AS MonthLabel, FORMAT(DATEADD(month, 0, mbt.Today), 'MMM') AS MonthShort
            UNION ALL SELECT 1, FORMAT(DATEADD(month, -1, mbt.Today), 'yyyy-MM'), FORMAT(DATEADD(month, -1, mbt.Today), 'MMMM yyyy'), FORMAT(DATEADD(month, -1, mbt.Today), 'MMM')
            UNION ALL SELECT 2, FORMAT(DATEADD(month, -2, mbt.Today), 'yyyy-MM'), FORMAT(DATEADD(month, -2, mbt.Today), 'MMMM yyyy'), FORMAT(DATEADD(month, -2, mbt.Today), 'MMM')
            UNION ALL SELECT 3, FORMAT(DATEADD(month, -3, mbt.Today), 'yyyy-MM'), FORMAT(DATEADD(month, -3, mbt.Today), 'MMMM yyyy'), FORMAT(DATEADD(month, -3, mbt.Today), 'MMM')
            UNION ALL SELECT 4, FORMAT(DATEADD(month, -4, mbt.Today), 'yyyy-MM'), FORMAT(DATEADD(month, -4, mbt.Today), 'MMMM yyyy'), FORMAT(DATEADD(month, -4, mbt.Today), 'MMM')
            UNION ALL SELECT 5, FORMAT(DATEADD(month, -5, mbt.Today), 'yyyy-MM'), FORMAT(DATEADD(month, -5, mbt.Today), 'MMMM yyyy'), FORMAT(DATEADD(month, -5, mbt.Today), 'MMM')
        ) m
        LEFT JOIN [__mj_BizAppsOrders].vwOrderHeaders h
          ON FORMAT(h.OrderDate, 'yyyy-MM') = m.MonthKey
          AND h.Status <> N'Voided'
          {% if PartyKind == "person" %}
          AND h.BillToPersonID = {{ PartyID | sqlString }}
          {% else %}
          AND h.BillToOrganizationID = {{ PartyID | sqlString }}
          {% endif %}
        LEFT JOIN [__mj_BizAppsAccounting].[AccountingCompanyProfile] acp ON acp.ID = h.CompanyID
        OUTER APPLY (
            SELECT CASE
                WHEN h.ID IS NULL THEN NULL
                WHEN h.CurrencyCode IS NULL OR h.CurrencyCode = acp.FunctionalCurrencyCode THEN CAST(1 AS DECIMAL(18,8))
                ELSE h.BookingExchangeRate
            END AS FunctionalRate
        ) fx
        GROUP BY m.MonthOffset, m.MonthLabel, m.MonthShort
        ORDER BY m.MonthOffset DESC
        FOR JSON PATH
    ) AS MonthlyTrajectoryJson
) traj;
