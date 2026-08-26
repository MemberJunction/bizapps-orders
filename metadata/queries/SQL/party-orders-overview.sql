-- Single-query party orders overview bundle for Person and Organization forms.
-- Returns all overview KPI figures, 6-month spend trajectory, recent orders, and active subscriptions in one shot.
-- PartyKind is only used in Nunjucks branches — it never touches SQL text.
-- PartyID is quoted via sqlString.
SELECT
    ISNULL(o.OrderCount, 0) AS OrderCount,
    ISNULL(o.OpenCount, 0) AS OpenCount,
    ISNULL(o.OverdueCount, 0) AS OverdueCount,
    ISNULL(o.LifetimeValue, 0) AS LifetimeValue,
    CASE 
        WHEN ISNULL(o.OrderCount, 0) > 0 THEN ISNULL(o.LifetimeValue, 0) / o.OrderCount
        ELSE 0
    END AS AvgOrderValue,
    o.FirstOrderDate,
    CASE
        WHEN o.FirstOrderDate IS NULL THEN NULL
        ELSE DATEDIFF(year, o.FirstOrderDate, SYSUTCDATETIME())
    END AS YearsAsCustomer,
    ISNULL(s.ActiveSubCount, 0) AS ActiveSubCount,
    r.RecentOrdersJson,
    sub_agg.ActiveSubscriptionsJson,
    traj.MonthlyTrajectoryJson
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
            ISNULL(h.Balance, 0) AS Balance
        FROM [__mj_BizAppsOrders].vwOrderHeaders h
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
            ISNULL(SUM(h.TotalGross), 0) AS Amount
        FROM (
            SELECT 0 AS MonthOffset, FORMAT(DATEADD(month, 0, SYSUTCDATETIME()), 'yyyy-MM') AS MonthKey, FORMAT(DATEADD(month, 0, SYSUTCDATETIME()), 'MMMM yyyy') AS MonthLabel, FORMAT(DATEADD(month, 0, SYSUTCDATETIME()), 'MMM') AS MonthShort
            UNION ALL SELECT 1, FORMAT(DATEADD(month, -1, SYSUTCDATETIME()), 'yyyy-MM'), FORMAT(DATEADD(month, -1, SYSUTCDATETIME()), 'MMMM yyyy'), FORMAT(DATEADD(month, -1, SYSUTCDATETIME()), 'MMM')
            UNION ALL SELECT 2, FORMAT(DATEADD(month, -2, SYSUTCDATETIME()), 'yyyy-MM'), FORMAT(DATEADD(month, -2, SYSUTCDATETIME()), 'MMMM yyyy'), FORMAT(DATEADD(month, -2, SYSUTCDATETIME()), 'MMM')
            UNION ALL SELECT 3, FORMAT(DATEADD(month, -3, SYSUTCDATETIME()), 'yyyy-MM'), FORMAT(DATEADD(month, -3, SYSUTCDATETIME()), 'MMMM yyyy'), FORMAT(DATEADD(month, -3, SYSUTCDATETIME()), 'MMM')
            UNION ALL SELECT 4, FORMAT(DATEADD(month, -4, SYSUTCDATETIME()), 'yyyy-MM'), FORMAT(DATEADD(month, -4, SYSUTCDATETIME()), 'MMMM yyyy'), FORMAT(DATEADD(month, -4, SYSUTCDATETIME()), 'MMM')
            UNION ALL SELECT 5, FORMAT(DATEADD(month, -5, SYSUTCDATETIME()), 'yyyy-MM'), FORMAT(DATEADD(month, -5, SYSUTCDATETIME()), 'MMMM yyyy'), FORMAT(DATEADD(month, -5, SYSUTCDATETIME()), 'MMM')
        ) m
        LEFT JOIN [__mj_BizAppsOrders].vwOrderHeaders h
          ON FORMAT(h.OrderDate, 'yyyy-MM') = m.MonthKey
          AND h.Status <> N'Voided'
          {% if PartyKind == "person" %}
          AND h.BillToPersonID = {{ PartyID | sqlString }}
          {% else %}
          AND h.BillToOrganizationID = {{ PartyID | sqlString }}
          {% endif %}
        GROUP BY m.MonthOffset, m.MonthLabel, m.MonthShort
        ORDER BY m.MonthOffset DESC
        FOR JSON PATH
    ) AS MonthlyTrajectoryJson
) traj;
