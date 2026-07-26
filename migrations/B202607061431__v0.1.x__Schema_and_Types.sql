-- =============================================================================
--  BizApps Orders — schema and shared TYPES.
--
--  SPLIT FROM THE MAIN BASELINE ON PURPOSE, and the split is load-bearing.
--
--  Migrations run as ONE TRANSACTION PER FILE (skyway wraps each file). A trigger that
--  declares a variable of a user-defined table type must therefore not be COMPILED inside
--  the same transaction that created the type — SQL Server needs a schema lock on the type
--  to compile the trigger body, the creating transaction still holds it, and the statement
--  dies with a deadlock. It surfaces as `Msg 1205 ... deadlocked with another process` on a
--  single-connection run, which reads like server instability rather than an ordering bug.
--  Reproducible with plain `sqlcmd` + `BEGIN TRAN`; it is not a runner defect.
--
--  Returning early from the trigger does NOT avoid it: compilation happens before execution,
--  so the type is needed even for a zero-row statement. The only fix is to COMMIT the type
--  first — which is what this file is for.
--
--  Everything else lives in the sibling V...__Tables_and_Objects.sql.
-- =============================================================================

-- =============================================================================
-- BizApps Orders — Baseline Schema (v0.1.0)
-- =============================================================================
-- Creates the entire __mj_BizAppsOrders schema: the product catalog + order
-- lifecycle, per the CONSOLIDATED master plan (plans/bizapps-orders-master.md,
-- decisions D1–D35; collapse-into-baseline strategy — this file is edited in
-- place pre-release, clean-DB rebuild + CodeGen after every change).
-- 2026-07-23: donor-branch baseline brought current with the S1 company-model
-- wave (D6/D7) and the D14 rev-rec rework:
--   * ProductType         — flat lookup + RequiresFulfillment (fulfillment hold, D15)
--   * ProductCategory     — PER-COMPANY (CompanyID NOT NULL, D7); hierarchical
--                           (ParentProductCategoryID self-FK) within one company
--   * Product             — CompanyID NOT NULL = source of truth for line ownership
--                           (D6); NO GL columns (D5 — accounting's polymorphic
--                           GLAccountLink points AT Product/ProductCategory rows)
--   * Order               — Status lifecycle + the A/R field set (order = the
--                           receivable, D2); CompanyID NOT NULL = the ORIGINATING/
--                           owning company — document/visibility/sales-attribution
--                           anchor, NEVER GL resolution (D6); NO currency (D24)
--   * OrderLine           — ProductID / Quantity / UnitPrice + line totals, service
--                           period, fulfillment status, reversal lineage; CompanyID
--                           NOT NULL = denormalized stamp of the product's company
--                           at save (D6); JournalEntryID = per-line booked JE (D10)
--   * PaymentTermsType    — payment-terms lookup (Net30 …; seed rows via metadata/)
--   * OrderSequence       — global singleton counter for gap-conscious ORD-{seq} numbers (D30)
--   * Payments subsystem (§4.7/§8): PaymentProvider / CustomerPaymentMethod /
--                           PaymentIntent / Payment / PaymentLine / PaymentSequence —
--                           receipts, reversals, cash application; NO currency columns (D24)
--   * Subscriptions + rev-rec envelope (§4.5/§4.6): SubscriptionType / SubscriptionTerm / Subscription /
--                           SubscriptionEvent / RevenueRecognitionSchedule / RevRecScheduleLine —
--                           schedules hang off ORDER LINES (renewals carry their own).
--                           D14: the LEDGER truth is real forward-dated JEs written at
--                           booking-lock; the ScheduledJournalEntry bridge is RETIRED —
--                           RevRecScheduleLine.JournalEntryID points at the staged dated JE.
--   * Catalog depth (§4.1): ProductType/Product behavior + lifecycle fields, bundles,
--                           entitlements + grants, PPO, EventProduct/EventOrderLine (IsA),
--                           StoredValue pair, OrderLineDimension, PriceList/ProductPrice/PriceTier;
--                           seeded product types via metadata/. NO GL columns (D5), NO currency (D24)
--   * Sales rules (§4.8): SalesRule / SalesAuthority + Order.ApprovalTaskID —
--                           evaluation engine + tasks-app routing deferred (D26, §18)
--
-- Cross-app references are REAL FOREIGN KEYS (§4.A), not soft UUID columns.
-- BizApps install in dependency order, so bizapps-common and bizapps-accounting
-- are already present when this migration runs and the database — not
-- convention — enforces referential integrity across app schemas:
--   * → __mj_BizAppsCommon.Organization / Person / Address
--       Order.CustomerOrganizationID, Order.CustomerPersonID,
--       Order.BillToAddressID, Order.ShipToAddressID,
--       PaymentIntent.CustomerOrganizationID, Payment.CustomerOrganizationID,
--       CustomerPaymentMethod.CustomerOrganizationID,
--       Subscription.CustomerOrganizationID, Subscription.BeneficiaryPersonID,
--       EntitlementGrant.BeneficiaryPersonID/BeneficiaryOrganizationID,
--       StoredValueAccount.BeneficiaryPersonID/BeneficiaryOrganizationID,
--       EventProduct.VenueAddressID
--   * → __mj_BizAppsAccounting.JournalEntry / Dimension / DimensionValue
--       OrderLine.JournalEntryID (per-line booked JE; D10),
--       Payment.JournalEntryID, RevRecScheduleLine.JournalEntryID (D14),
--       OrderLineDimension.DimensionID / DimensionValueID
--
-- INSTALL-ORDER DEPENDENCY: bizapps-common and bizapps-accounting MUST be
-- installed BEFORE bizapps-orders. Applying this migration without them fails
-- at §4.A — deliberately, as the dependency check.
--
-- Two references stay SOFT (plain UNIQUEIDENTIFIER, no FK) because the target
-- app is absent, not because the coupling is unwanted — see §4.A:
--   * Order.ApprovalTaskID → bizapps-tasks is not installed here (D26, §18)
--
-- CodeGen handles __mj_CreatedAt/__mj_UpdatedAt and FK indexes — do NOT add them here.
-- SQL Server is the source of truth; the PostgreSQL counterpart is produced via
-- @memberjunction/sql-converter (see migrations-pg/README.md).
-- Reference: plans/bizapps-orders-master.md §4 (entity model), §18 (sequencing).
-- =============================================================================

-- =============================================================================
-- 1. SCHEMA
-- =============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj_BizAppsOrders')
    EXEC('CREATE SCHEMA __mj_BizAppsOrders');
GO

-- =============================================================================
-- 2. SCHEMA INFO — entity-name prefix for CodeGen (must match mj.config.cjs)
-- =============================================================================
INSERT INTO __mj.SchemaInfo
(
  ID,
  SchemaName,
  EntityIDMin, EntityIDMax,
  Comments,
  Description,
  EntityNamePrefix, EntityNameSuffix
)
VALUES
(
  'B6E2A4C1-7F03-4E52-9C8A-2D6F1B0E9A47',
  '__mj_BizAppsOrders',
  1, 1000000,
  NULL,
  'MemberJunction: BizApps Orders — product catalog + order lifecycle',
  'MJ_BizApps_Orders: ', NULL
);
GO

-- =============================================================================
-- 2.A TYPES — the id list the rollup recalc takes (plan D41)
-- =============================================================================
-- CONSTRAINT ON EVERY CONSUMER OF THIS TYPE: never touch a variable of it inside the transaction
-- that created it. Migrations run as ONE transaction per file (skyway wraps each file), so a trigger
-- that declares `@x OrderHeaderIDList` and fires during the migration deadlocks on the type's own
-- metadata lock — reproducible with plain sqlcmd + BEGIN TRAN, and it surfaces as a bewildering
-- "deadlocked with another process" on a single-connection run. The rollup triggers therefore return
-- early on zero-row DML, which is exactly what CodeGen's `__mj_CreatedAt` backfills are.
CREATE TYPE __mj_BizAppsOrders.OrderHeaderIDList AS TABLE (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
GO
