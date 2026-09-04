-- =============================================================================
-- Ship the three price-override Authorizations declared in
-- metadata/authorizations/.price-override.json.
--
-- WHY THIS FILE EXISTS. metadata/ is a dev-time source: an app's mj-app.json
-- points MetadataSync at it, but the install engine never reads that directory.
-- Metadata reaches a host ONLY through a migration. Without this file the three
-- records ship to nobody -- the feature's permission checks would find no
-- authorization to test against on any host but the developer's own. The
-- repo's own gate says so: scripts/check-release-seed-coverage.mjs reported
--
--     metadata/authorizations/.price-override.json: 3 undeclared in SQL
--
-- and the release is blocked until they appear in a migration.
--
-- GUARDED ON ID *OR* NAME, NOT ID ALONE. __mj.Authorization carries
-- UQ_Authorization on (Name) as well as its primary key. An ID-only guard is
-- therefore not enough: on a host where these rows were created by `mj sync
-- push` rather than by this migration, MJ minted its own IDs, so the row is
-- present under a DIFFERENT ID with the same Name -- the ID guard passes and
-- the INSERT trips the unique constraint instead. That exact mechanism stopped
-- an AIDP stage upgrade at batch 78 of 248 on UQ_UserApplication. Testing both
-- halves of the identity is what makes this re-runnable anywhere.
--
-- THE CHILDREN RESOLVE THEIR PARENT BY NAME, not by the literal ID above, for
-- the same reason: if the parent already existed under a host-assigned ID we
-- must point at THAT row, not at an ID this file happens to know. This mirrors
-- what the metadata declares -- `@lookup:MJ: Authorizations.Name=...`.
--
-- Idempotent: every statement is a no-op on a host that already has the row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Parent: the grant to move an order line off the engine price at all.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Authorization]
                WHERE [ID] = 'D77D8593-04A1-46E4-B443-66B954F095B9'
                   OR [Name] = N'MJ.BizApps.Orders.Price.Override')
INSERT INTO [${mjSchema}].[Authorization]
    ([ID], [ParentID], [Name], [IsActive], [UseAuditLog], [Description], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
    ('D77D8593-04A1-46E4-B443-66B954F095B9', NULL, N'MJ.BizApps.Orders.Price.Override', 1, 1,
     N'Parent grant for changing an order line away from the engine price. Child authorizations are OverrideList (pick another named applicable price) and OverrideAny (type an amount).',
     GETUTCDATE(), GETUTCDATE());
GO

-- -----------------------------------------------------------------------------
-- Children. ParentID is resolved from the parent's NAME so this still points at
-- the right row on a host where the parent was created under a different ID.
-- -----------------------------------------------------------------------------
DECLARE @ParentID UNIQUEIDENTIFIER =
    (SELECT [ID] FROM [${mjSchema}].[Authorization]
      WHERE [Name] = N'MJ.BizApps.Orders.Price.Override');

IF @ParentID IS NULL
    THROW 50000, N'MJ.BizApps.Orders.Price.Override is missing: the parent authorization must exist before its children can be created.', 1;

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Authorization]
                WHERE [ID] = 'D43AC18D-EB2B-4DE4-9D95-050EA7501D5C'
                   OR [Name] = N'MJ.BizApps.Orders.Price.OverrideList')
INSERT INTO [${mjSchema}].[Authorization]
    ([ID], [ParentID], [Name], [IsActive], [UseAuditLog], [Description], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
    ('D43AC18D-EB2B-4DE4-9D95-050EA7501D5C', @ParentID, N'MJ.BizApps.Orders.Price.OverrideList', 1, 1,
     N'Pick another named applicable price (product or inherited category, When-matching). UnitPrice must match that row. Does not allow typing an arbitrary amount.',
     GETUTCDATE(), GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Authorization]
                WHERE [ID] = 'A308824E-A9D1-45CD-8490-FE28B6284E3B'
                   OR [Name] = N'MJ.BizApps.Orders.Price.OverrideAny')
INSERT INTO [${mjSchema}].[Authorization]
    ([ID], [ParentID], [Name], [IsActive], [UseAuditLog], [Description], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
    ('A308824E-A9D1-45CD-8490-FE28B6284E3B', @ParentID, N'MJ.BizApps.Orders.Price.OverrideAny', 1, 1,
     N'Type any unit price on an unbooked line. Implies OverrideList. Clears ProductPriceID (or records OverrideKind=Amount) and still writes the engine price on the component breakdown.',
     GETUTCDATE(), GETUTCDATE());
GO
