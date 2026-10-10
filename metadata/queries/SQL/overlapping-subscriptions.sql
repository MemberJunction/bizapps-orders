-- Overlapping subscriptions for one holder. Finance exception review, golive #279 type 5.
--
-- Two live subscriptions covering the same holder for the same thing over the same dates each carry
-- their own receivable and their own revenue recognition, so the customer is billed twice unless
-- someone cancels one by hand. Booking does not always prevent it:
--
--   - SubscriptionType.ConcurrencyMode = AllowMultiple creates a second subscription on purpose.
--   - A different band of the same product is a different ProductID. Confirm refuses it when both
--     bands share a SubscriptionFamily, unless the line acknowledges the overlap; a product with no
--     family is not checked at all (golive #276).
--   - That lookup matches organization AND person exactly, so a subscription held by an
--     organization and one held by the same organization for a named person do not match.
--
-- This is a review list, not a verdict: an overlap can be intended. It lists pairs for finance to
-- confirm or correct at month end until the nightly exception check replaces it.
--
-- WHAT COUNTS AS THE SAME THING (MatchBasis):
--   SameProduct  - the same ProductID.
--   SameFamily   - different products with the same SubscriptionFamilyID: the catalog states they
--                  are bands of one offering.
--   SameCategory - different products in the same ProductCategory with the same SubscriptionType,
--                  where at least one has no family. This guesses at bands the catalog has not
--                  grouped yet, and can pair two unrelated products that share both, which is why it
--                  is labelled. Two products in DIFFERENT families are never paired this way: the
--                  catalog has said they are different offerings.
--
-- AN ACKNOWLEDGED OVERLAP IS LISTED, AND FLAGGED. LaterOverlapAcknowledged is the later
-- subscription's order line AcknowledgesCoverageOverlap: the person who confirmed it was told both
-- would be billed and chose to run them alongside. It is still billed twice, so the pair stays on the
-- review list; the nightly exception check leaves acknowledged SameFamily pairs out.
--
-- WHAT COUNTS AS THE SAME HOLDER: the same HolderOrganizationID when both have one, and then either
-- the same BeneficiaryPersonID or no named person on one side; when neither has an organization, the
-- same BeneficiaryPersonID. Two DIFFERENT named people at one organization are two holders: an
-- organization buying the same membership for several staff gets one subscription per person on
-- purpose, and pairing them would report every seat against every other. An organization-held
-- subscription next to one held by the same organization for a named person is still a pair.
--
-- COVERAGE IS SubscriptionTerm, not Subscription.StartDate/EndDate. A term counts unless it is
-- Canceled or Lapsed; Completed terms count, because a past overlap was still billed twice. A
-- subscription counts unless it is Migrated.
--
-- A CANCELED SUBSCRIPTION IS NOT LEFT OUT. Cancelling marks the whole subscription Canceled at once
-- but stamps only the term it affects: a term cut short becomes Canceled (and drops out here), a term
-- ridden to its end becomes Completed, and later terms already booked stay as they were, still billed.
-- Leaving out every Canceled subscription would hide those, so the term status alone decides.
--
-- ONE ROW PER PAIR. The pair is ordered by creation, so LaterSubscription is the one the overlap
-- created and LaterOrderNumber is the order that booked it. OverlapStart/OverlapEnd span every
-- overlapping term of the pair.
--
-- LaterOverlappingTermsAmount IS AN UPPER BOUND: the full amount of every later term that overlaps,
-- not the overlapping part. A 1,200 annual term that overlaps by one month reports 1,200 at stake,
-- of which roughly 100 was billed twice.
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
        p.SubscriptionFamilyID,
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
    WHERE s.Status <> N'Migrated'
      {% if CompanyID %}
      AND s.CompanyID = {{ CompanyID | sqlString }}
      {% endif %}
),
pairs AS (
    SELECT
        a.ID AS EarlierID,
        b.ID AS LaterID,
        CASE
            WHEN a.ProductID = b.ProductID THEN N'SameProduct'
            WHEN a.SubscriptionFamilyID = b.SubscriptionFamilyID THEN N'SameFamily'
            ELSE N'SameCategory'
        END AS MatchBasis
    FROM live a
    INNER JOIN live b
            ON b.ID <> a.ID
           AND (a.__mj_CreatedAt < b.__mj_CreatedAt
                OR (a.__mj_CreatedAt = b.__mj_CreatedAt AND a.ID < b.ID))
           AND (   (a.HolderOrganizationID IS NOT NULL AND a.HolderOrganizationID = b.HolderOrganizationID
                    AND (a.BeneficiaryPersonID IS NULL OR b.BeneficiaryPersonID IS NULL
                         OR a.BeneficiaryPersonID = b.BeneficiaryPersonID))
                OR (a.HolderOrganizationID IS NULL AND b.HolderOrganizationID IS NULL
                    AND a.BeneficiaryPersonID = b.BeneficiaryPersonID))
           AND (   a.ProductID = b.ProductID
                OR a.SubscriptionFamilyID = b.SubscriptionFamilyID
                OR (a.ProductCategoryID = b.ProductCategoryID
                    AND a.SubscriptionTypeID = b.SubscriptionTypeID
                    AND (a.SubscriptionFamilyID IS NULL OR b.SubscriptionFamilyID IS NULL)))
),
overlaps AS (
    SELECT
        pr.EarlierID,
        pr.LaterID,
        pr.MatchBasis,
        MIN(CASE WHEN ta.StartDate > tb.StartDate THEN ta.StartDate ELSE tb.StartDate END) AS OverlapStart,
        MAX(CASE WHEN ta.EndDate   < tb.EndDate   THEN ta.EndDate   ELSE tb.EndDate   END) AS OverlapEnd
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
    CAST(COALESCE(lol.AcknowledgesCoverageOverlap, 0) AS BIT) AS LaterOverlapAcknowledged,
    amt.LaterOverlappingTermsAmount
FROM overlaps ov
INNER JOIN live e ON e.ID = ov.EarlierID
INNER JOIN live l ON l.ID = ov.LaterID
-- Summed per later TERM, not per overlapping term pair: a later term that overlaps two earlier
-- terms is counted once.
OUTER APPLY (
    SELECT SUM(tb.Amount) AS LaterOverlappingTermsAmount
    FROM [__mj_BizAppsOrders].SubscriptionTerm tb
    WHERE tb.SubscriptionID = ov.LaterID
      AND tb.Status NOT IN (N'Canceled', N'Lapsed')
      AND EXISTS (
          SELECT 1
          FROM [__mj_BizAppsOrders].SubscriptionTerm ta
          WHERE ta.SubscriptionID = ov.EarlierID
            AND ta.Status NOT IN (N'Canceled', N'Lapsed')
            AND tb.StartDate <= ta.EndDate
            AND ta.StartDate <= tb.EndDate)
) amt
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
