-- =====================================================================================
-- Entitlement Provisioning Framework (WS-2)
-- =====================================================================================
-- A ProductEntitlement can now name an EntitlementProvisioningTarget — a downstream
-- system (LXP, license server, community platform) that must be told about a grant
-- before the customer actually has the thing they bought. The engine keeps creating
-- grants INSIDE the booking transaction (D27/D76 — access and the receivable are the
-- same decision); provisioning is the post-commit side effect that pushes the grant
-- out, with per-grant status tracking, bounded retries, and a reconcile sweep for
-- anything the in-line push missed.
--
-- Adds:
--   1. EntitlementProvisioningTarget       — lookup: which downstream, which driver
--   2. ProductEntitlement.ProvisioningTargetID  — nullable FK; NULL = nothing to push
--   3. EntitlementGrant provisioning columns    — status/attempts/error/external ref
--   4. EntitlementProvisioningEvent        — append-only per-attempt log
--
-- Seed rows for EntitlementProvisioningTarget ship via metadata/ (mj sync push),
-- never as INSERTs here. Existing grants land on ProvisioningStatus 'NotRequired'
-- through the column default, which is correct: no targets exist yet.
-- =====================================================================================

-- 1. EntitlementProvisioningTarget
IF OBJECT_ID('[__mj_BizAppsOrders].[EntitlementProvisioningTarget]', 'U') IS NULL
BEGIN
    CREATE TABLE [__mj_BizAppsOrders].[EntitlementProvisioningTarget] (
        [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntitlementProvisioningTarget_ID] DEFAULT (newsequentialid()),
        [Code]                   NVARCHAR(80)     NOT NULL,
        [Name]                   NVARCHAR(200)    NOT NULL,
        [Description]            NVARCHAR(MAX)    NULL,
        [DriverClass]            NVARCHAR(255)    NOT NULL,
        [Configuration]          NVARCHAR(MAX)    NULL,
        [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_EntitlementProvisioningTarget_Status] DEFAULT (N'Active'),
        [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_EntitlementProvisioningTarget___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
        [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_EntitlementProvisioningTarget___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

        CONSTRAINT [PK_EntitlementProvisioningTarget] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_EntitlementProvisioningTarget_Code] UNIQUE ([Code]),
        CONSTRAINT [CK_EntitlementProvisioningTarget_Status] CHECK ([Status] IN (N'Active', N'Disabled'))
    );
END
GO

-- 2. ProductEntitlement.ProvisioningTargetID
IF COL_LENGTH('__mj_BizAppsOrders.ProductEntitlement', 'ProvisioningTargetID') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[ProductEntitlement]
        ADD [ProvisioningTargetID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_ProductEntitlement_ProvisioningTarget] FOREIGN KEY REFERENCES [__mj_BizAppsOrders].[EntitlementProvisioningTarget]([ID]);
END
GO

-- 3. EntitlementGrant provisioning columns (single consolidated ALTER; the guard is on
--    the first column because this migration adds all five together or not at all)
IF COL_LENGTH('__mj_BizAppsOrders.EntitlementGrant', 'ProvisioningStatus') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EntitlementGrant] ADD
        [ProvisioningStatus]     NVARCHAR(20)     NOT NULL CONSTRAINT [DF_EntitlementGrant_ProvisioningStatus] DEFAULT (N'NotRequired'),
        [ProvisionAttempts]      INT              NOT NULL CONSTRAINT [DF_EntitlementGrant_ProvisionAttempts] DEFAULT (0),
        [LastProvisionAttemptAt] DATETIMEOFFSET   NULL,
        [LastProvisionError]     NVARCHAR(2000)   NULL,
        [ProvisioningExternalRef] NVARCHAR(500)   NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_EntitlementGrant_ProvisioningStatus'
               AND parent_object_id = OBJECT_ID('[__mj_BizAppsOrders].[EntitlementGrant]'))
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EntitlementGrant]
        ADD CONSTRAINT [CK_EntitlementGrant_ProvisioningStatus]
        CHECK ([ProvisioningStatus] IN (N'NotRequired', N'Pending', N'Provisioned', N'Failed', N'RevokePending', N'Revoked'));
END
GO

-- Reconcile-sweep seek: the sweep filters on the small set of "work to do" statuses.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EntitlementGrant_ProvisioningStatus'
               AND object_id = OBJECT_ID('[__mj_BizAppsOrders].[EntitlementGrant]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_EntitlementGrant_ProvisioningStatus]
        ON [__mj_BizAppsOrders].[EntitlementGrant]([ProvisioningStatus])
        INCLUDE ([ProvisionAttempts], [LastProvisionAttemptAt]);
END
GO

-- 4. EntitlementProvisioningEvent — append-only; one row per provisioning attempt
IF OBJECT_ID('[__mj_BizAppsOrders].[EntitlementProvisioningEvent]', 'U') IS NULL
BEGIN
    CREATE TABLE [__mj_BizAppsOrders].[EntitlementProvisioningEvent] (
        [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntitlementProvisioningEvent_ID] DEFAULT (newsequentialid()),
        [EntitlementGrantID]     UNIQUEIDENTIFIER NOT NULL,
        [ProvisioningTargetID]   UNIQUEIDENTIFIER NULL,
        [Operation]              NVARCHAR(20)     NOT NULL,
        [Outcome]                NVARCHAR(20)     NOT NULL,
        [AttemptNumber]          INT              NOT NULL CONSTRAINT [DF_EntitlementProvisioningEvent_AttemptNumber] DEFAULT (1),
        [Detail]                 NVARCHAR(MAX)    NULL,
        [ExternalRef]            NVARCHAR(500)    NULL,
        [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_EntitlementProvisioningEvent___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
        [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_EntitlementProvisioningEvent___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

        CONSTRAINT [PK_EntitlementProvisioningEvent] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_EntitlementProvisioningEvent_Grant] FOREIGN KEY ([EntitlementGrantID])
            REFERENCES [__mj_BizAppsOrders].[EntitlementGrant]([ID]),
        CONSTRAINT [FK_EntitlementProvisioningEvent_Target] FOREIGN KEY ([ProvisioningTargetID])
            REFERENCES [__mj_BizAppsOrders].[EntitlementProvisioningTarget]([ID]),
        CONSTRAINT [CK_EntitlementProvisioningEvent_Operation] CHECK ([Operation] IN (N'Provision', N'Revoke', N'Verify')),
        CONSTRAINT [CK_EntitlementProvisioningEvent_Outcome] CHECK ([Outcome] IN (N'Succeeded', N'Failed', N'Skipped'))
    );
END
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A downstream system that must be provisioned when an entitlement grant is created or revoked (an LXP enrollment, a license server, a community role). DriverClass names the TypeScript plugin (via ClassFactory) that talks to it; Configuration carries driver-specific JSON. Concrete drivers ship with the deployment that owns the downstream system, not with the orders engine.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningTarget';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Machine key for the target, unique, stable across environments (e.g. LXP, LICENSE_SERVER). Referenced by metadata seeds and logs.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningTarget',
    @level2type = N'COLUMN', @level2name = N'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory registration key of the BaseEntitlementProvisioningDriver subclass that implements Provision/Revoke/Verify for this target (e.g. Orders.NoOpProvisioning, Aidp.LxpProvisioning).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningTarget',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver-specific configuration JSON (endpoints, tenant ids, mapping rules). Secrets do NOT belong here — drivers resolve credentials from environment/credential stores.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningTarget',
    @level2type = N'COLUMN', @level2name = N'Configuration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Disabled targets are skipped by both the post-commit push and the reconcile sweep; their grants stay Pending until re-enabled.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningTarget',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Downstream system this entitlement provisions into when granted. NULL means the grant is self-contained (nothing to push) and its ProvisioningStatus stays NotRequired.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'ProductEntitlement',
    @level2type = N'COLUMN', @level2name = N'ProvisioningTargetID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where this grant stands with its downstream target: NotRequired (no target), Pending (awaiting push), Provisioned, Failed (retryable — see ProvisionAttempts), RevokePending (revoked here, downstream not yet told), Revoked (downstream confirmed). Distinct from Status, which is the grant''s legal validity.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'ProvisioningStatus';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many provisioning attempts have been made for the current desired state. Reset when the desired state changes (e.g. a revoke starts a fresh count).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'ProvisionAttempts';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp of the most recent provisioning attempt (success or failure). The reconcile sweep uses it for backoff.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'LastProvisionAttemptAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Error message from the most recent failed provisioning attempt; cleared on success.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'LastProvisionError';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The downstream system''s identifier for what was provisioned (enrollment id, license key id), returned by the driver on success. Needed to revoke or verify later.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'ProvisioningExternalRef';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Append-only log of provisioning attempts against downstream targets — one row per Provision/Revoke/Verify attempt with its outcome. The grant row carries only the latest state; this table answers what happened, when, and why it failed.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningEvent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which driver operation ran: Provision, Revoke, or Verify.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningEvent',
    @level2type = N'COLUMN', @level2name = N'Operation';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Succeeded, Failed, or Skipped (target disabled / driver not registered — recorded so silence is never ambiguous).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementProvisioningEvent',
    @level2type = N'COLUMN', @level2name = N'Outcome';
GO






-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- Run `pnpm run mj:migrate && pnpm run mj:codegen` against a database current
-- through the migration above, then `scripts/append-codegen.sh migrations/V202608261200__v0.1.x__Entitlement_Provisioning.sql`
-- to fold the generated half (Entity/EntityField metadata, base views, CRUD
-- procs, permissions, FK indexes) in below this banner.
-- =============================================================================
