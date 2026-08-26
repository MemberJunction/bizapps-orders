-- =====================================================================================================
-- PostgreSQL counterpart of V202608261200__v0.1.x__Entitlement_Provisioning.sql.
--
-- See the T-SQL file for the design (targets, the born-Pending obligation model, the event log).
-- Same objects, same names, same CHECK sets; only the DDL dialect and the comment mechanism differ.
-- Converter-assisted, hand-shaped like V202608101200's counterpart: the raw converter skips the
-- guarded T-SQL blocks, so the idempotent guards are re-expressed in native PG idioms
-- (IF NOT EXISTS / IF EXISTS / DO-block constraint guards).
-- =====================================================================================================

-- 1. EntitlementProvisioningTarget
CREATE TABLE IF NOT EXISTS "__mj_BizAppsOrders"."EntitlementProvisioningTarget" (
    "ID"             UUID          NOT NULL DEFAULT gen_random_uuid(),
    "Code"           VARCHAR(80)   NOT NULL,
    "Name"           VARCHAR(200)  NOT NULL,
    "Description"    TEXT          NULL,
    "DriverClass"    VARCHAR(255)  NOT NULL,
    "Configuration"  TEXT          NULL,
    "Status"         VARCHAR(20)   NOT NULL DEFAULT 'Active',
    "__mj_CreatedAt" TIMESTAMPTZ   NOT NULL DEFAULT now(),
    "__mj_UpdatedAt" TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT "PK_EntitlementProvisioningTarget" PRIMARY KEY ("ID"),
    CONSTRAINT "UQ_EntitlementProvisioningTarget_Code" UNIQUE ("Code"),
    CONSTRAINT "CK_EntitlementProvisioningTarget_Status" CHECK ("Status" IN ('Active', 'Disabled'))
);

-- 2. ProductEntitlement.ProvisioningTargetID
ALTER TABLE IF EXISTS "__mj_BizAppsOrders"."ProductEntitlement"
    ADD COLUMN IF NOT EXISTS "ProvisioningTargetID" UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_ProductEntitlement_ProvisioningTarget'
    ) THEN
        ALTER TABLE "__mj_BizAppsOrders"."ProductEntitlement"
            ADD CONSTRAINT "FK_ProductEntitlement_ProvisioningTarget"
            FOREIGN KEY ("ProvisioningTargetID")
            REFERENCES "__mj_BizAppsOrders"."EntitlementProvisioningTarget"("ID");
    END IF;
END $$;

-- 3. EntitlementGrant provisioning columns
ALTER TABLE IF EXISTS "__mj_BizAppsOrders"."EntitlementGrant"
    ADD COLUMN IF NOT EXISTS "ProvisioningStatus"      VARCHAR(20)  NOT NULL DEFAULT 'NotRequired',
    ADD COLUMN IF NOT EXISTS "ProvisionAttempts"       INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "LastProvisionAttemptAt"  TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS "LastProvisionError"      VARCHAR(2000) NULL,
    ADD COLUMN IF NOT EXISTS "ProvisioningExternalRef" VARCHAR(500) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CK_EntitlementGrant_ProvisioningStatus'
    ) THEN
        ALTER TABLE "__mj_BizAppsOrders"."EntitlementGrant"
            ADD CONSTRAINT "CK_EntitlementGrant_ProvisioningStatus"
            CHECK ("ProvisioningStatus" IN ('NotRequired', 'Pending', 'Provisioned', 'Failed', 'RevokePending', 'Revoked'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IX_EntitlementGrant_ProvisioningStatus"
    ON "__mj_BizAppsOrders"."EntitlementGrant" ("ProvisioningStatus")
    INCLUDE ("ProvisionAttempts", "LastProvisionAttemptAt");

-- 4. EntitlementProvisioningEvent
CREATE TABLE IF NOT EXISTS "__mj_BizAppsOrders"."EntitlementProvisioningEvent" (
    "ID"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "EntitlementGrantID"   UUID         NOT NULL,
    "ProvisioningTargetID" UUID         NULL,
    "Operation"            VARCHAR(20)  NOT NULL,
    "Outcome"              VARCHAR(20)  NOT NULL,
    "AttemptNumber"        INTEGER      NOT NULL DEFAULT 1,
    "Detail"               TEXT         NULL,
    "ExternalRef"          VARCHAR(500) NULL,
    "__mj_CreatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "__mj_UpdatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "PK_EntitlementProvisioningEvent" PRIMARY KEY ("ID"),
    CONSTRAINT "FK_EntitlementProvisioningEvent_Grant" FOREIGN KEY ("EntitlementGrantID")
        REFERENCES "__mj_BizAppsOrders"."EntitlementGrant"("ID"),
    CONSTRAINT "FK_EntitlementProvisioningEvent_Target" FOREIGN KEY ("ProvisioningTargetID")
        REFERENCES "__mj_BizAppsOrders"."EntitlementProvisioningTarget"("ID"),
    CONSTRAINT "CK_EntitlementProvisioningEvent_Operation" CHECK ("Operation" IN ('Provision', 'Revoke', 'Verify')),
    CONSTRAINT "CK_EntitlementProvisioningEvent_Outcome" CHECK ("Outcome" IN ('Succeeded', 'Failed', 'Skipped'))
);

-- Comments (the T-SQL extended properties, verbatim)
COMMENT ON TABLE "__mj_BizAppsOrders"."EntitlementProvisioningTarget" IS
  'A downstream system that must be provisioned when an entitlement grant is created or revoked (an LXP enrollment, a license server, a community role). DriverClass names the TypeScript plugin (via ClassFactory) that talks to it; Configuration carries driver-specific JSON. Concrete drivers ship with the deployment that owns the downstream system, not with the orders engine.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningTarget"."Code" IS
  'Machine key for the target, unique, stable across environments (e.g. LXP, LICENSE_SERVER). Referenced by metadata seeds and logs.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningTarget"."DriverClass" IS
  'ClassFactory registration key of the BaseEntitlementProvisioningDriver subclass that implements Provision/Revoke/Verify for this target (e.g. Orders.NoOpProvisioning, Aidp.LxpProvisioning).';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningTarget"."Configuration" IS
  'Driver-specific configuration JSON (endpoints, tenant ids, mapping rules). Secrets do NOT belong here - drivers resolve credentials from environment/credential stores.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningTarget"."Status" IS
  'Disabled targets are skipped by both the post-commit push and the reconcile sweep; their grants stay Pending until re-enabled.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."ProductEntitlement"."ProvisioningTargetID" IS
  'Downstream system this entitlement provisions into when granted. NULL means the grant is self-contained (nothing to push) and its ProvisioningStatus stays NotRequired.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementGrant"."ProvisioningStatus" IS
  'Where this grant stands with its downstream target: NotRequired (no target), Pending (awaiting push), Provisioned, Failed (retryable - see ProvisionAttempts), RevokePending (revoked here, downstream not yet told), Revoked (downstream confirmed). Distinct from Status, which is the grant''s legal validity.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementGrant"."ProvisionAttempts" IS
  'How many provisioning attempts have been made for the current desired state. Reset when the desired state changes (e.g. a revoke starts a fresh count).';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementGrant"."LastProvisionAttemptAt" IS
  'UTC timestamp of the most recent provisioning attempt (success or failure). The reconcile sweep uses it for backoff.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementGrant"."LastProvisionError" IS
  'Error message from the most recent failed provisioning attempt; cleared on success.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementGrant"."ProvisioningExternalRef" IS
  'The downstream system''s identifier for what was provisioned (enrollment id, license key id), returned by the driver on success. Needed to revoke or verify later.';

COMMENT ON TABLE "__mj_BizAppsOrders"."EntitlementProvisioningEvent" IS
  'Append-only log of provisioning attempts against downstream targets - one row per Provision/Revoke/Verify attempt with its outcome. The grant row carries only the latest state; this table answers what happened, when, and why it failed.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningEvent"."Operation" IS
  'Which driver operation ran: Provision, Revoke, or Verify.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."EntitlementProvisioningEvent"."Outcome" IS
  'Succeeded, Failed, or Skipped (target disabled / driver not registered - recorded so silence is never ambiguous).';
