-- =============================================================================
-- Migration: Cleanup orphaned hierarchy fields across BizApps Orders entities
-- =============================================================================
-- Self-referencing foreign keys that represent 1:1 or 1:many operational pointers
-- (product succession, reversal links, subscription migration links) are NOT
-- recursive hierarchy trees. Stale hierarchy fields (Root*, *Depth, *Path, *IsLeaf,
-- *ChildCount) in EntityField cause RunView queries against base views to fail.
--
-- Only Product Categories (ParentProductCategoryID) and Order Lines (ParentOrderLineID)
-- are true recursive hierarchy trees in BizApps Orders.
-- =============================================================================

DELETE ef
FROM [${mjSchema}].[EntityField] ef
INNER JOIN [${mjSchema}].[Entity] e
    ON ef.[EntityID] = e.[ID]
WHERE e.[SchemaName] = '__mj_BizAppsOrders'
  AND (
    ef.[Name] LIKE '%SuccessorProductID%' OR
    ef.[Name] LIKE '%ReversesOrderHeaderID%' OR
    ef.[Name] LIKE '%ReversesOrderLineID%' OR
    ef.[Name] LIKE '%ReversesPaymentHeaderID%' OR
    ef.[Name] LIKE '%MigratesFromSubscriptionID%' OR
    ef.[Name] LIKE '%MigratesToSubscriptionID%'
  )
  AND ef.[Name] NOT IN (
    'SuccessorProductID',
    'ReversesOrderHeaderID',
    'ReversesOrderLineID',
    'ReversesPaymentHeaderID',
    'MigratesFromSubscriptionID',
    'MigratesToSubscriptionID'
  );
GO
