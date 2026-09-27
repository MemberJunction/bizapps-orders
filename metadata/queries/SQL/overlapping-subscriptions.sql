-- Overlapping subscriptions for one holder. Finance exception review, golive #279 type 5.
--
-- Two live subscriptions covering the same holder for the same thing over the same dates each carry
-- their own receivable and their own revenue recognition, so the customer is billed twice unless
-- someone cancels one by hand. Booking does not always prevent it:
--
--   - SubscriptionType.ConcurrencyMode = AllowMultiple creates a second subscription on purpose.
--   - A different band of the same product is a different ProductID, so the booking walk's lookup
--     (OrderEntityServer.findExistingSubscription, same ProductID and exact holder) does not find
--     the first subscription and creates a new one (golive #276).
--   - That lookup matches organization AND person exactly, so a subscription held by an
--     organization and one held by the same organization for a named person do not match.
--
-- This is a review list, not a verdict: an overlap can be intended. It lists pairs for finance to
-- confirm or correct at month end until the nightly exception check replaces it.
--
-- WHAT COUNTS AS THE SAME THING (MatchBasis):
--   SameProduct  - the same ProductID.
--   SameCategory - different products in the same ProductCategory with the same SubscriptionType.
--                  The catalog has no product-family column, so this is how bands of one product
--                  are recognised. It can also pair two unrelated products that share both, which
--                  is why it is labelled rather than merged into SameProduct.
--
-- WHAT COUNTS AS THE SAME HOLDER: the same HolderOrganizationID when both have one; otherwise, when
-- neither has an organization, the same BeneficiaryPersonID. Two people at one organization are one
-- holder here, because the organization is the party billed.
--
-- COVERAGE IS SubscriptionTerm, not Subscription.StartDate/EndDate. A term counts unless it is
-- Canceled or Lapsed; Completed terms count, because a past overlap was still billed twice. A
-- subscription counts unless it is Canceled or Migrated.
--
-- ONE ROW PER PAIR. The pair is ordered by creation, so LaterSubscription is the one the overlap
-- created and LaterOrderNumber is the order that booked it. OverlapStart/OverlapEnd span every
-- overlapping term of the pair.
--
-- DATE DIMENSION: the overlap. PeriodStart/PeriodEnd keep a pair whose overlap touches the window.
WITH live AS (
    SELECT
        s.ID,
        s.SubscriptionNumber,
        s.CompanyID,
        s.Company,
        s.ProductID,
        s.Product,
        p.ProductCategoryID,
        s.SubscriptionTypeID,
        s.HolderOrganizationID,
        s.HolderOrganization,
        s.BeneficiaryPersonID,
        s.BeneficiaryPerson,
        s.OrderLineID,
        s.Status,
        s.__mj_CreatedAt
    FROM [__mj_BizAppsOrders].vwSubscriptions s
    INNER JOIN [__mj_BizAppsOrders].Product p
            ON p.ID = s.ProductID
    WHERE s.Status NOT IN (N'Canceled', N'Migrated')
      {% if CompanyID %}
      AND s.CompanyID = {{ CompanyID | sqlString }}
      {% endif %}
),
pairs AS (
    SELECT
        a.ID AS EarlierID,
        b.ID AS LaterID,
        CASE WHEN a.ProductID = b.ProductID THEN N'SameProduct' ELSE N'SameCategory' END AS MatchBasis
    FROM live a
    INNER JOIN live b
            ON b.ID <> a.ID
           AND (a.__mj_CreatedAt < b.__mj_CreatedAt
                OR (a.__mj_CreatedAt = b.__mj_CreatedAt AND a.ID < b.ID))
           AND (   (a.HolderOrganizationID IS NOT NULL AND a.HolderOrganizationID = b.HolderOrganizationID)
                OR (a.HolderOrganizationID IS NULL AND b.HolderOrganizationID IS NULL
                    AND a.BeneficiaryPersonID = b.BeneficiaryPersonID))
           AND (   a.ProductID = b.ProductID
                OR (a.ProductCategoryID = b.ProductCategoryID
                    AND a.SubscriptionTypeID = b.SubscriptionTypeID))
),
overlaps AS (
    SELECT
        pr.EarlierID,
        pr.LaterID,
        pr.MatchBasis,
        MIN(CASE WHEN ta.StartDate > tb.StartDate THEN ta.StartDate ELSE tb.StartDate END) AS OverlapStart,
        MAX(CASE WHEN ta.EndDate   < tb.EndDate   THEN ta.EndDate   ELSE tb.EndDate   END) AS OverlapEnd,
        SUM(tb.Amount) AS LaterOverlappingTermsAmount
    FROM pairs pr
    INNER JOIN [__mj_BizAppsOrders].SubscriptionTerm ta
            ON ta.SubscriptionID = pr.EarlierID
           AND ta.Status NOT IN (N'Canceled', N'Lapsed')
    INNER JOIN [__mj_BizAppsOrders].SubscriptionTerm tb
            ON tb.SubscriptionID = pr.LaterID
           AND tb.Status NOT IN (N'Canceled', N'Lapsed')
           AND tb.StartDate <= ta.EndDate
           AND ta.StartDate <= tb.EndDate
    GROUP BY pr.EarlierID, pr.LaterID, pr.MatchBasis
)
SELECT
    e.CompanyID,
    e.Company                     AS CompanyName,
    ov.MatchBasis,
    e.HolderOrganizationID,
    e.HolderOrganization          AS HolderOrganizationName,
    e.BeneficiaryPersonID,
    e.BeneficiaryPerson           AS BeneficiaryPersonName,
    ov.OverlapStart,
    ov.OverlapEnd,
    e.ID                          AS EarlierSubscriptionID,
    e.SubscriptionNumber          AS EarlierSubscriptionNumber,
    e.Product                     AS EarlierProductName,
    e.Status                      AS EarlierStatus,
    eo.OrderNumber                AS EarlierOrderNumber,
    l.ID                          AS LaterSubscriptionID,
    l.SubscriptionNumber          AS LaterSubscriptionNumber,
    l.Product                     AS LaterProductName,
    l.Status                      AS LaterStatus,
    lo.ID                         AS LaterOrderHeaderID,
    lo.OrderNumber                AS LaterOrderNumber,
    lo.ConfirmedAt                AS LaterOrderConfirmedAt,
    ov.LaterOverlappingTermsAmount
FROM overlaps ov
INNER JOIN live e ON e.ID = ov.EarlierID
INNER JOIN live l ON l.ID = ov.LaterID
LEFT JOIN [__mj_BizAppsOrders].OrderLine eol ON eol.ID = e.OrderLineID
LEFT JOIN [__mj_BizAppsOrders].OrderHeader eo ON eo.ID = eol.OrderHeaderID
LEFT JOIN [__mj_BizAppsOrders].OrderLine lol ON lol.ID = l.OrderLineID
LEFT JOIN [__mj_BizAppsOrders].OrderHeader lo ON lo.ID = lol.OrderHeaderID
WHERE 1 = 1
  {% if PeriodStart %}
  AND ov.OverlapEnd >= {{ PeriodStart | sqlString }}
  {% endif %}
  {% if PeriodEnd %}
  AND ov.OverlapStart <= {{ PeriodEnd | sqlString }}
  {% endif %}
ORDER BY
    e.Company, e.HolderOrganization, e.BeneficiaryPerson, ov.OverlapStart;
