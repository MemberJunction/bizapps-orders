-- Single-query party orders overview bundle for Person and Organization forms (PostgreSQL).
SELECT
    COALESCE(o.OrderCount, 0)::int AS "OrderCount",
    COALESCE(o.OpenCount, 0)::int AS "OpenCount",
    COALESCE(o.OverdueCount, 0)::int AS "OverdueCount",
    COALESCE(o.LifetimeValue, 0)::numeric AS "LifetimeValue",
    CASE 
        WHEN COALESCE(o.OrderCount, 0) > 0 THEN (COALESCE(o.LifetimeValue, 0) / o.OrderCount)::numeric
        ELSE 0::numeric
    END AS "AvgOrderValue",
    o.FirstOrderDate AS "FirstOrderDate",
    CASE
        WHEN o.FirstOrderDate IS NULL THEN NULL
        ELSE (EXTRACT(YEAR FROM CURRENT_TIMESTAMP) - EXTRACT(YEAR FROM o.FirstOrderDate))::int
    END AS "YearsAsCustomer",
    COALESCE(s.ActiveSubCount, 0)::int AS "ActiveSubCount",

    -- Top 6 Recent Orders as JSON
    (
        SELECT json_agg(json_build_object(
            'ID', h.ID,
            'OrderNumber', h.OrderNumber,
            'OrderDate', h.OrderDate,
            'Status', h.Status,
            'PaymentStatus', h.PaymentStatus,
            'TotalGross', COALESCE(h.TotalGross, 0),
            'AmountPaid', COALESCE(h.AmountPaid, 0),
            'Balance', COALESCE(h.Balance, 0)
        ))::text
        FROM (
            SELECT h.*
            FROM __mj_bizappsorders.vwOrderHeaders h
            WHERE h.Status <> 'Voided'
              {% if PartyKind == "person" %}
              AND h.BillToPersonID = {{ PartyID | sqlString }}
              {% else %}
              AND h.BillToOrganizationID = {{ PartyID | sqlString }}
              {% endif %}
            ORDER BY h.OrderDate DESC
            LIMIT 6
        ) h
    ) AS "RecentOrdersJson",

    -- Top 4 Active Subscriptions as JSON
    (
        SELECT json_agg(json_build_object(
            'ID', sub.ID,
            'SubscriptionNumber', sub.SubscriptionNumber,
            'Product', sub.Product,
            'SubscriptionType', sub.SubscriptionType,
            'Status', sub.Status,
            'StartDate', sub.StartDate,
            'EndDate', sub.EndDate,
            'AutoRenew', sub.AutoRenew
        ))::text
        FROM (
            SELECT sub.*
            FROM __mj_bizappsorders.vwSubscriptions sub
            WHERE sub.Status = 'Active'
              {% if PartyKind == "person" %}
              AND sub.BeneficiaryPersonID = {{ PartyID | sqlString }}
              {% else %}
              AND sub.HolderOrganizationID = {{ PartyID | sqlString }}
              {% endif %}
            ORDER BY sub.StartDate DESC
            LIMIT 4
        ) sub
    ) AS "ActiveSubscriptionsJson",

    -- Last 6 Months Trajectory as JSON
    (
        SELECT json_agg(json_build_object(
            'MonthOffset', m.MonthOffset,
            'MonthLabel', m.MonthLabel,
            'MonthShort', m.MonthShort,
            'Amount', COALESCE(h_agg.Amount, 0)
        ))::text
        FROM (
            SELECT 0 AS MonthOffset, to_char(CURRENT_TIMESTAMP, 'YYYY-MM') AS MonthKey, to_char(CURRENT_TIMESTAMP, 'FMMonth YYYY') AS MonthLabel, to_char(CURRENT_TIMESTAMP, 'Mon') AS MonthShort
            UNION ALL SELECT 1, to_char(CURRENT_TIMESTAMP - interval '1 month', 'YYYY-MM'), to_char(CURRENT_TIMESTAMP - interval '1 month', 'FMMonth YYYY'), to_char(CURRENT_TIMESTAMP - interval '1 month', 'Mon')
            UNION ALL SELECT 2, to_char(CURRENT_TIMESTAMP - interval '2 month', 'YYYY-MM'), to_char(CURRENT_TIMESTAMP - interval '2 month', 'FMMonth YYYY'), to_char(CURRENT_TIMESTAMP - interval '2 month', 'Mon')
            UNION ALL SELECT 3, to_char(CURRENT_TIMESTAMP - interval '3 month', 'YYYY-MM'), to_char(CURRENT_TIMESTAMP - interval '3 month', 'FMMonth YYYY'), to_char(CURRENT_TIMESTAMP - interval '3 month', 'Mon')
            UNION ALL SELECT 4, to_char(CURRENT_TIMESTAMP - interval '4 month', 'YYYY-MM'), to_char(CURRENT_TIMESTAMP - interval '4 month', 'FMMonth YYYY'), to_char(CURRENT_TIMESTAMP - interval '4 month', 'Mon')
            UNION ALL SELECT 5, to_char(CURRENT_TIMESTAMP - interval '5 month', 'YYYY-MM'), to_char(CURRENT_TIMESTAMP - interval '5 month', 'FMMonth YYYY'), to_char(CURRENT_TIMESTAMP - interval '5 month', 'Mon')
        ) m
        LEFT JOIN (
            SELECT to_char(h.OrderDate, 'YYYY-MM') AS MonthKey, SUM(COALESCE(h.TotalGross, 0)) AS Amount
            FROM __mj_bizappsorders.vwOrderHeaders h
            WHERE h.Status <> 'Voided'
              {% if PartyKind == "person" %}
              AND h.BillToPersonID = {{ PartyID | sqlString }}
              {% else %}
              AND h.BillToOrganizationID = {{ PartyID | sqlString }}
              {% endif %}
            GROUP BY to_char(h.OrderDate, 'YYYY-MM')
        ) h_agg ON m.MonthKey = h_agg.MonthKey
    ) AS "MonthlyTrajectoryJson"

FROM (SELECT 1 AS OneRow) AS seed
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)::int AS OrderCount,
        SUM(CASE WHEN h.PaymentStatus IN ('Unpaid', 'PartiallyPaid', 'Overdue') THEN 1 ELSE 0 END)::int AS OpenCount,
        SUM(CASE WHEN h.PaymentStatus = 'Overdue' THEN 1 ELSE 0 END)::int AS OverdueCount,
        SUM(COALESCE(h.TotalGross, 0))::numeric AS LifetimeValue,
        MIN(h.OrderDate) AS FirstOrderDate
    FROM __mj_bizappsorders.vwOrderHeaders h
    WHERE h.Status <> 'Voided'
      {% if PartyKind == "person" %}
      AND h.BillToPersonID = {{ PartyID | sqlString }}
      {% else %}
      AND h.BillToOrganizationID = {{ PartyID | sqlString }}
      {% endif %}
) o ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS ActiveSubCount
    FROM __mj_bizappsorders.vwSubscriptions sub
    WHERE sub.Status = 'Active'
      {% if PartyKind == "person" %}
      AND sub.BeneficiaryPersonID = {{ PartyID | sqlString }}
      {% else %}
      AND sub.HolderOrganizationID = {{ PartyID | sqlString }}
      {% endif %}
) s ON true;
