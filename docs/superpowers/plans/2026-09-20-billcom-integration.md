# Bill.com Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a billing unit (a confirmed schedule-less order per selling company, or an `Invoiced` instalment) becomes invoiceable, create its invoice in Bill.com and record the reference; poll Bill.com for cleared receivable payments and capture each exactly once through `Orders.CapturePayment`; let Finance cancel an unpaid Bill.com invoice.

**Architecture:** A `BaseInvoiceRail` class-factory seam (parallel to `BasePaymentProvider`) with one implementation, `BillComInvoiceRail`, talking to the published `@memberjunction/connector-bill-com` through a swappable `BillComGateway`. Per-company configuration is the existing `PaymentProvider` row (new type `BillCom`, new `CompanyIntegrationID` column). Sends and polls are remote operations driven by worklists, wrapped in thin Actions and `MJ: Scheduled Jobs` rows that ship Disabled + Preview. Four new tables (`ExternalInvoice`, `ExternalCustomer`, `ExternalPayment`, `PaymentProviderSyncState`) hold the mapping, the audit trail and the watermark.

**Tech Stack:** TypeScript (ESM), MemberJunction 6.1.x (`@memberjunction/core`, `global`, `actions`, `integration-engine`, `core-entities`), SQL Server Flyway migrations, vitest unit tests, `@memberjunction/testing-integration` check bundles, Angular 17 (`packages/Angular`).

**Spec:** `docs/superpowers/specs/2026-09-20-billcom-integration-design.md` — read it first; decisions are cited as D-B1…D-B12.

## Global Constraints

- MJ peer range in this repo is `^6.1.0-edge.5`; the connector's is `>=5.43.0 <7.0.0`. Do not pin anything else.
- Schema changes are **new `V` migrations only**, idempotent (`IF OBJECT_ID(...) IS NULL`, `IF COL_LENGTH(...) IS NULL`). Never edit the baseline. Use `[${flyway:defaultSchema}]` for app tables, literal `[__mj]` for core tables. No `__mj_CreatedAt/__mj_UpdatedAt`, no FK indexes (CodeGen adds them). Every table and column gets an `MS_Description` extended property.
- Every migration PR carries a changeset (`npx changeset`, at least `minor`).
- SQL literals in `ExtraFilter` go through `RequireUUID` / `RequireUUIDs` / `RequireDate` / `EscapeSQLString` from `packages/CoreEntitiesServer/src/sql-guards.ts`. No inline `.replace(/'/g, "''")`.
- No Angular data-access services. Components call `RunView`, entity objects and the generated remote-operation classes directly (`docs/ui-architecture.md`).
- Logical refusal returns `Success: false` with a `ResultCode`/`Message`; only faults throw.
- `@RegisterClass` subclasses need a `Load*()` anchor called from `packages/Server/src/index.ts`, or the class is tree-shaken.
- `metadata/` is dev-time only (`mj sync push`). Rows reach a host only via a `*__Metadata_Sync.sql` migration at release (phase 4).
- Spelling in code follows PR #220: `Instalment`.
- Build/test commands: `pnpm run build:packages`, `pnpm run test:unit` (vitest), `pnpm run test:integration` (needs a live dev DB), `pnpm run verify`.
- **PR #208 (`feat/168-business-today`) and PR #220 (`aidp-24`) are merged INTO this branch** (2026-09-20) in that order, with the two reconciled: `OverdueSQL(alias, dueDateExpression, todayExpression)`, `OverdueViewSQL()` emitting `vwOrderHeaders` with both the `nd` CROSS APPLY (next unpaid instalment) and the `bt` CROSS JOIN (business day), and PR #220's `V202609211200` carrying that exact view text. When #208 and #220 land on `next` with the same resolution this branch merges cleanly; if Craig resolves differently, re-merge here.
- **Migration order is fixed:** `V202609211200`/`V202609211300` (#220) → `V202609221000`, `V202609241000`, `V202609261000` (this branch). `ExternalInvoice`'s FK to `OrderHeaderPaymentSchedule` is therefore plain, not conditional.
- **Deploy order (from #208):** the bizapps-common migration that creates `[__mj_BizAppsCommon].[fnBusinessToday]()` must be applied before any migration that creates `vwOrderHeaders` (#208's `V202609161000` and #220's `V202609211200`), and the `BizApps.BusinessTimeZone` configuration row must be set or everything silently falls back to UTC.
- **DDL style (Amith, via Andrew's review of #220):** plain `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` / `sp_addextendedproperty`, GO-separated, no existence checks, no cursor or table variable — a cursor breaks the PostgreSQL conversion. This branch's three migrations follow it. **Robert:** this departs from `CLAUDE.md`'s "write migrations idempotently"; say which rule wins and the guards go back in if it is the CLAUDE.md one.

---

## Status (2026-09-20, end of day)

| Task | State |
|---|---|
| 1 spikes + harness | harness written (`test-harnesses/billcom-live.mjs`); spikes **not run** — need sandbox credentials |
| 2 provider type + column | done; applied to `MJ_BizAppsSales_QA` 2026-09-21, CodeGen folded, metadata pushed |
| 3–6 driver, rail seam, resolver, gateway + rail | done, unit-tested |
| 7 ExternalInvoice/ExternalCustomer | applied to QA; CodeGen (entities, views, CRUD, relationships) folded under the banner; the exactly-one-party CHECK was rewritten to valid T-SQL when the live run refused the original |
| 8 ExternalInvoiceBehavior | done (in `packages/CoreEntitiesServer`, where `InvoiceDocument` lives), 20 tests |
| 9 ExternalPaymentBehavior | done, 17 tests |
| 10 operation contracts | done; metadata pushed to QA (`sync push --include payment-provider-types,remote-operations,actions,scheduled-jobs`), bases now regenerated by CodeGen and identical in effect to the hand-emitted ones |
| 11–14 operations | done; **integration check bundles not written** (need the applied schema) |
| 13 delivery exclusion | done, unit-tested (`DeliveryBehavior.test.ts`, externally-invoiced cases) |
| 15, 18 Actions + jobs | done; pushed to QA, jobs Disabled + Preview |
| 16 ExternalPayment/SyncState | applied to QA; CodeGen folded; `Refused` disposition in the CHECK |
| 17 poller | done; `CapturePayment` allocations now accept `OrderHeaderPaymentScheduleID` (PR #220's column) |
| webhook receiver (not in the original plan) | `BillComWebhookExtension` + `BillComWebhook.ts`, unit-tested, registered in manifest/package.json/mj.config |
| adversarial review (2026-09-20) | 17 findings, 14 fixed, 3 deferred — spec §13.5. Contract changes: `Refused` disposition, `PART_PAID` result code, `BasePaymentProvider.CollectsAtCapture`, `BaseInvoiceRail.CheckConfiguration` |
| 19 Angular | **not started** |
| 20 release plumbing | **not started** |

## QA environment (2026-09-21)

`MJ_BizAppsSales_QA` on Robert's local SQL Server 2022 container is the test database. It was brought to the
latest of every app (tasks 1.5.0, accounting 0.10.0, sales 6.4.0, contracts 0.3.0, orders through the Bill.com
migrations), the `connector-bill-com` seed migrations were applied (schema `mj_connector_bill_com`; the
`Bill.com` integration, its 3 objects and the `Bill.com Session` credential type exist), and this repo's `.env`
(git-ignored) points at it as `sa`. CodeGen ran without AI credentials, so generated descriptions/layouts from
the AI pass are absent; the carve kept only this branch's entities and fields and left `next`'s committed
generated code for everything else. Flyway checksums for the three folded migrations were realigned in the
history table.

**Configured and probed (2026-09-21 evening).** MJAPI (`:4100`) and Explorer (`:4201`) run from the MJ core repo
against the QA database (no open-app packages, so core entities only). Robert entered the `Bill.com Session`
credential (`54B6C9C5-…`) and the Company Integration (`EAA2E453-FEA6-4DBD-B852-9148E482A162`) through
Explorer; the `BillCom` PaymentProvider row (`B1C0FF5A-0001-4B11-9C0A-5E1F7B3C9A01`, IsLiveMode 0) went in by
SQL. Spikes S1, S3, S4, S5 are answered in `docs/superpowers/specs/2026-09-20-billcom-spike-results.md`; S2 waits
for a payment recorded in the sandbox UI. The live run found two connector defects (double `/v3` in every
generic URL → 404; no archive verb, `PUT {archived:true}` is a 400) and one integration gap (engine object
cache never loaded on the connector path). The QA database carries a metadata patch for the first; the gateway
now loads the cache and archives through `POST /invoices/{id}/archive`. **Re-apply the `/v3` patch on any new
database** until Integrations ships U3.

## File structure

| Path | Responsibility |
|---|---|
| `test-harnesses/billcom-live.mjs` | Env-gated probes against the BILL sandbox (spikes S1–S5, then end-to-end). Not CI. |
| `metadata/payment-provider-types/.payment-provider-types.json` | Add the `BillCom` type row. |
| `migrations/V202609221000__v5.15.0__PaymentProvider_CompanyIntegration.sql` | `PaymentProvider.CompanyIntegrationID`. |
| `packages/CoreEntitiesServer/src/BillComPaymentProvider.ts` | Minimal `BasePaymentProvider` for type `BillCom`. |
| `packages/CoreEntitiesServer/src/BaseInvoiceRail.ts` | The rail contract + `LoadBaseInvoiceRail`. |
| `packages/CoreEntitiesServer/src/InvoiceRailResolver.ts` | `ResolveInvoiceRail`, `FindInvoiceRailForCompany`. |
| `packages/CoreEntitiesServer/src/BillComGateway.ts` | Connector-facing seam; `UseBillComGatewaySeams` for tests. |
| `packages/CoreEntitiesServer/src/BillComInvoiceRail.ts` | Wire-shape mapping over the gateway. |
| `packages/Entities/src/ExternalInvoiceBehavior.ts` | Pure: payload, invoiceable, cancel, failure class. |
| `packages/Entities/src/ExternalPaymentBehavior.ts` | Pure: status table, decision, fan-out, tender, idempotency key. |
| `migrations/V202609241000__v5.15.0__ExternalInvoice.sql` | `ExternalInvoice`, `ExternalCustomer`. |
| `migrations/V202609261000__v5.15.0__ExternalPayment.sql` | `ExternalPayment`, `PaymentProviderSyncState`. |
| `packages/CoreEntitiesServer/src/IssueExternalInvoiceOperation.ts` | §5.1. |
| `packages/CoreEntitiesServer/src/CancelExternalInvoiceOperation.ts` | §5.2. |
| `packages/CoreEntitiesServer/src/GetExternalInvoicingWorklistOperation.ts` | Unsent + failed units. |
| `packages/CoreEntitiesServer/src/SendExternalInvoicesOperation.ts` | The sweep. |
| `packages/CoreEntitiesServer/src/PollExternalPaymentsOperation.ts` | §5.3. |
| `packages/CoreEntitiesServer/src/DeliveryBehavior.ts` (+ `DeliveryRecipientResolver.ts`, `packages/Server/src/custom/send-document.action.ts`) | `ExternallyInvoiced` refusal (§5.4). |
| `packages/Server/src/custom/send-external-invoices.action.ts`, `poll-external-payments.action.ts` | Scheduler adapters. |
| `metadata/remote-operations/…`, `metadata/actions/.orders-billcom-actions.json`, `metadata/scheduled-jobs/.orders-billcom-scheduled-jobs.json` | Metadata rows + `types/*.ts`. |
| `packages/Angular/src/lib/panels/external-invoices-panel.component.ts`, `pages/receivables/billcom-queue.page.ts` | UI. |
| `packages/IntegrationTests/src/checks/external-invoicing.checks.ts`, `external-payments.checks.ts` | Live-DB bundles with the gateway faked. |

---

# Phase 1 — Foundation and spikes (no PR #220 dependency)

### Task 1: Live sandbox harness and the five spikes

**Files:**
- Create: `test-harnesses/billcom-live.mjs`
- Create: `docs/superpowers/specs/2026-09-20-billcom-spike-results.md`

**Interfaces:**
- Produces: written answers to S1–S5 that later tasks read (S2 fills `BILLCOM_PAYMENT_STATUS` in Task 9; S1 decides Task 6's `CancelInvoice`; S4 decides Task 12's re-issue numbering).

The harness runs the connector the same way the rail will, so it doubles as the smoke test for Task 6. It needs `BILLCOM_COMPANY_INTEGRATION_ID` (a `MJ: Company Integrations` row whose credential is the sandbox `Bill.com Session`) and the usual DB env from `mj.config.cjs`. Model it on `test-harnesses/invoice-live.mjs` for bootstrapping MJ (provider setup, `LoadBizAppsOrdersServer()`), then:

- [ ] **Step 1: Write the harness**

```js
// test-harnesses/billcom-live.mjs — probes against the BILL sandbox. Never CI. Requires
//   BILLCOM_COMPANY_INTEGRATION_ID  the MJ: Company Integrations row (sandbox credential)
//   BILLCOM_PROBE                   one of: login | customer | invoice | archive-put | payments | send-default
import { bootstrap } from './_bootstrap.mjs'; // whatever invoice-live.mjs uses to get { provider, user }
import { ConnectorFactory } from '@memberjunction/integration-engine';

const { provider, user } = await bootstrap();
const ciID = process.env.BILLCOM_COMPANY_INTEGRATION_ID;
if (!ciID) throw new Error('BILLCOM_COMPANY_INTEGRATION_ID is required');

const ci = await provider.GetEntityObject('MJ: Company Integrations', user);
if (!(await ci.Load(ciID))) throw new Error(`No Company Integration ${ciID}`);
const integration = await provider.GetEntityObject('MJ: Integrations', user);
await integration.Load(ci.IntegrationID);
const connector = ConnectorFactory.Resolve(integration);
const base = { CompanyIntegration: ci, ContextUser: user };
const log = (label, v) => console.log(`\n== ${label}\n`, JSON.stringify(v, null, 2));

switch (process.env.BILLCOM_PROBE ?? 'login') {
  case 'login':
    log('TestConnection', await connector.TestConnection(ci, user));
    break;
  case 'customer': {
    const r = await connector.CreateRecord({ ...base, ObjectName: 'customers',
      Attributes: { name: `Probe ${Date.now()}`, email: `probe+${Date.now()}@example.com`, accountNumber: 'PROBE' } });
    log('customers.create', r);
    log('customers.get', await connector.GetRecord({ ...base, ObjectName: 'customers', ExternalID: r.ExternalID }));
    break;
  }
  case 'invoice': {
    const cust = process.env.BILLCOM_CUSTOMER_ID; // from the customer probe
    const r = await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
      invoiceNumber: `PROBE-${Date.now()}`, invoiceDate: '2026-09-22', dueDate: '2026-10-22',
      customer: { id: cust },
      invoiceLineItems: [{ description: 'Probe line A', quantity: 2, price: 100.00 }, { description: 'Probe line B', quantity: 1, price: 50.25 }],
    } });
    log('invoices.create', r);
    log('invoices.get', await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: r.ExternalID }));
    // S4a: does a second create with the SAME invoiceNumber succeed or 4xx?
    log('invoices.create-duplicate-number', await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
      invoiceNumber: process.env.BILLCOM_DUP_NUMBER ?? 'PROBE-DUP', customer: { id: cust },
      invoiceLineItems: [{ description: 'dup', quantity: 1, price: 1 }] } }));
    break;
  }
  case 'archive-put': { // S1: does PUT {archived:true} archive, or do we need a connector verb?
    const id = process.env.BILLCOM_INVOICE_ID;
    log('invoices.update archived', await connector.UpdateRecord({ ...base, ObjectName: 'invoices', ExternalID: id, Attributes: { archived: true } }));
    log('invoices.get after', await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: id }));
    break;
  }
  case 'payments': { // S2/S3: shape, status vocabulary, and whether WatermarkValue narrows anything
    const t0 = Date.now();
    const r = await connector.FetchChanges({ ...base, ObjectName: 'receivable-payments', WatermarkValue: '2026-01-01T00:00:00.000Z', BatchSize: 100 });
    log('receivable-payments.fetch', { ms: Date.now() - t0, count: r.Records.length, hasMore: r.HasMore, newWatermark: r.NewWatermarkValue, statuses: [...new Set(r.Records.map(x => JSON.stringify(x.Fields.status)))], sample: r.Records.slice(0, 3).map(x => x.Fields) });
    break;
  }
  case 'send-default': // S5: read a created invoice's fields that reveal auto-send (e.g. `sentDate`, email status) — record what is there
    log('invoices.get', await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: process.env.BILLCOM_INVOICE_ID }));
    break;
}
```

- [x] **Step 2: Run the probes in order** — `login`, `customer`, `invoice` (record the id), `archive-put`, `payments`, `send-default`. Record a customer bank payment manually in the sandbox UI against the probe invoice, then re-run `payments` until it appears and again after it "clears" so both statuses are captured. *(2026-09-21: all run except the two `payments` re-runs, which wait on Robert recording a payment against `00e01DYPWKVDNSX9w76e`. A seventh probe, `archive-post`, was added when `archive-put` came back 400.)*

- [x] **Step 3: Write `docs/superpowers/specs/2026-09-20-billcom-spike-results.md`** with a table: spike, question, observed result, decision. Required entries:
  - S1 archive via `PUT {archived:true}` — **does not** (400, PUT is a full replace). `POST /invoices/{id}/archive` does, idempotently. `CancelInvoice` now uses it through `BillComGateway.archiveInvoice` (connector's session helpers) until U1 lands.
  - S2 **done 2026-09-22.** Live: `PAID` / `CHECK` / `onlinePayment false` on an offline check. Documented enums: status `PAID|VOID|SCHEDULED|CANCELED|ESCHEATED|UNDEFINED`, receivablesType `CASH|CHECK|CREDIT_CARD|ACH|PAYPAL|OTHER|WALLET|VIRTUAL_CARD|UNDEFINED`. Task 9's table is rewritten to exactly these; `UNDEFINED` intentionally unmapped. Pending (`SCHEDULED`) and reversed (`VOID`) were NOT observed live — they are documented but unexercised, and a `0rp` cannot be voided through v3, so `VOID` may only ever be reachable through BILL's UI.
  - S3 fetch time and count with/without watermark; whether `NewWatermarkValue` is returned.
  - S4 duplicate `invoiceNumber` accepted or refused; `invoiceLineItems` field names BILL accepted; whether `totalAmount` equals Σ(quantity×price).
  - S5 whether creating an invoice emailed the sandbox customer.

- [ ] **Step 4: Commit**

```bash
git add test-harnesses/billcom-live.mjs docs/superpowers/specs/2026-09-20-billcom-spike-results.md
git commit -m "chore(orders): Bill.com sandbox harness and spike results (golive #146 #147 #148)"
```

---

### Task 2: `BillCom` provider type and `PaymentProvider.CompanyIntegrationID`

**Files:**
- Modify: `metadata/payment-provider-types/.payment-provider-types.json` (append one row)
- Create: `migrations/V202609221000__v5.15.0__PaymentProvider_CompanyIntegration.sql`
- Create: `.changeset/billcom-provider-type.md`

**Interfaces:**
- Produces: type code `'BillCom'` (the class-factory key used by Tasks 3, 5, 6, 8); column `PaymentProvider.CompanyIntegrationID` read by Task 5.

- [ ] **Step 1: Append the metadata row** (after the `JPMorgan` row; keep the file's array shape):

```json
{
  "_comments": [
    "Bill.com — the retained AR rail for invoiced ACH/check collection (golive #146/#147/#148).",
    "NOT a checkout rail: the driver refuses CreateIntent/Capture/Refund. It exists so a company can",
    "configure one row per Bill.com organisation, so Orders' invoice rail (BaseInvoiceRail, same code)",
    "resolves from it, and so payments the poller captures carry a PaymentProviderID.",
    "CredentialsRef stays NULL for this type: credentials live on the MJ: Company Integrations row named",
    "by PaymentProvider.CompanyIntegrationID and are read by the connector, never by Orders."
  ],
  "fields": {
    "Code": "BillCom",
    "Name": "Bill.com",
    "Description": "Bill.com accounts receivable. Invoices are created in Bill.com when a billing unit becomes invoiceable; cleared receivable payments are polled and captured once. Not a checkout rail — no intents, no card capture, no refunds through this type.",
    "DriverClass": "BillComPaymentProvider",
    "SupportsTokenization": 0,
    "SupportsRefund": 0,
    "SupportsWebhooks": 0,
    "Sequence": 50,
    "IsActive": 1
  },
  "primaryKey": { "ID": "8B4C2E10-5D93-4A6F-B7C8-1E2F3A4B5C06" }
}
```

- [ ] **Step 2: Write the migration**

```sql
-- =============================================================================
-- PaymentProvider.CompanyIntegrationID — which MJ Company Integration a provider row uses.
-- Added for the Bill.com rail (golive #146/#148): the connector resolves its own credentials from
-- the MJ: Company Integrations row, so Orders stores a POINTER to that row, never a secret.
-- Nullable; existing Stripe/Manual/StoredValue rows are untouched.
-- Idempotent.
-- =============================================================================
IF COL_LENGTH('${flyway:defaultSchema}.PaymentProvider', 'CompanyIntegrationID') IS NULL
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[PaymentProvider]
        ADD [CompanyIntegrationID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_PaymentProvider_CompanyIntegration]
            REFERENCES [__mj].[CompanyIntegration]([ID]);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties ep
               JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
               WHERE ep.name = 'MS_Description' AND c.name = 'CompanyIntegrationID'
                 AND ep.major_id = OBJECT_ID('${flyway:defaultSchema}.PaymentProvider'))
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The MJ Company Integration whose connector and credential this provider uses (Bill.com). NULL for providers that resolve credentials through CredentialsRef. A pointer, never a secret.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProvider',
    @level2type = N'COLUMN', @level2name = N'CompanyIntegrationID';
GO
```

- [ ] **Step 3: Apply and regenerate** — `pnpm run mj:migrate` against the dev DB, then run CodeGen (the repo's `codegen` script) so `mjBizAppsOrdersPaymentProviderEntity` gains `CompanyIntegrationID`. Fold CodeGen's SQL for the new EntityField below a `-- CodeGen output` banner in the same migration (PR #220's convention; replace any literal `Sequence` on an existing entity with `(SELECT COALESCE(MAX([Sequence]),0) FROM [${mjSchema}].[EntityField] WHERE EntityID = …) + 1`). Then `mj sync push` for the new type row.

- [ ] **Step 4: Verify** — `pnpm run build:packages` green; `grep -n CompanyIntegrationID packages/Entities/src/generated/entities/__mj_BizAppsOrders.ts` shows the getter.

- [ ] **Step 5: Changeset + commit**

```bash
npx changeset   # minor: entities, core-entities-server, server
git add metadata/payment-provider-types migrations/V202609221000__v5.15.0__PaymentProvider_CompanyIntegration.sql packages/Entities/src/generated .changeset
git commit -m "feat(orders): BillCom payment provider type and PaymentProvider.CompanyIntegrationID"
```

---

### Task 3: `BillComPaymentProvider`

**Files:**
- Create: `packages/CoreEntitiesServer/src/BillComPaymentProvider.ts`
- Test: `packages/CoreEntitiesServer/src/__tests__/BillComPaymentProvider.test.ts`
- Modify: `packages/CoreEntitiesServer/src/index.ts` (export), `packages/Server/src/index.ts:129` (anchor after `LoadStoredValuePaymentProvider()`)

**Interfaces:**
- Produces: `class BillComPaymentProvider extends BasePaymentProvider`, `LoadBillComPaymentProvider()`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { BillComPaymentProvider } from '../BillComPaymentProvider.js';

const driver = () => {
    const d = new BillComPaymentProvider();
    d.Config = { ID: 'p', TypeCode: 'BillCom', CompanyID: 'c', Name: 'BC', CredentialsRef: null, IsLiveMode: false,
        Capabilities: { SupportsTokenization: false, SupportsRefund: false, SupportsWebhooks: false } };
    d.Credentials = {};
    return d;
};

describe('BillComPaymentProvider', () => {
    it('settles synchronously — the poller only captures cleared money', () => {
        expect(driver().SettlesAsynchronously).toBe(false);
    });
    it('refuses to open an intent, naming the rail', async () => {
        const r = await driver().CreateIntent({ Amount: 10, CurrencyCode: 'USD' });
        expect(r.Success).toBe(false);
        expect(r.Reason).toMatch(/not a checkout rail/i);
    });
    it('refuses capture and refund the same way', async () => {
        const d = driver();
        expect((await d.Capture({ PaymentIntentID: 'x', ProviderIntentID: 'y', Amount: 10, CurrencyCode: 'USD' } as never)).Success).toBe(false);
        expect((await d.Refund({ ProviderChargeID: 'z', Amount: 1, CurrencyCode: 'USD' } as never)).Success).toBe(false);
    });
});
```

- [ ] **Step 2: Run** `pnpm vitest run packages/CoreEntitiesServer/src/__tests__/BillComPaymentProvider.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * @fileoverview `BillCom` payment driver — deliberately almost empty.
 *
 * Bill.com is the AR rail: invoices go OUT through `BillComInvoiceRail`, and cleared payments come
 * IN through `Orders.PollExternalPayments`, which captures them as recorded money. Nothing is charged
 * from here, so every gateway verb refuses. The class exists so the `BillCom` type row resolves to a
 * driver (the resolver refuses the base class) and so captured payments can carry a PaymentProviderID.
 */
import { RegisterClass } from '@memberjunction/global';
import { BasePaymentProvider, type CaptureRequest, type CaptureResult, type CreateIntentRequest, type CreateIntentResult, type RefundRequest, type RefundResult } from './BasePaymentProvider.js';

const NOT_A_CHECKOUT_RAIL =
    'Bill.com is not a checkout rail. Invoices are created in Bill.com and payments are captured by the ' +
    'poller when Bill.com reports them cleared; nothing is charged from Orders.';

@RegisterClass(BasePaymentProvider, 'BillCom')
export class BillComPaymentProvider extends BasePaymentProvider {
    public override get SettlesAsynchronously(): boolean { return false; }
    public override async CreateIntent(_r: CreateIntentRequest): Promise<CreateIntentResult> { return { Success: false, Reason: NOT_A_CHECKOUT_RAIL }; }
    public override async Capture(_r: CaptureRequest): Promise<CaptureResult> { return { Success: false, Reason: NOT_A_CHECKOUT_RAIL }; }
    public override async Refund(_r: RefundRequest): Promise<RefundResult> { return { Success: false, Reason: NOT_A_CHECKOUT_RAIL }; }
}

/** Tree-shaking anchor — call from the server bootstrap. */
export function LoadBillComPaymentProvider(): void { void BillComPaymentProvider; }
```

Check the exact shapes of `CreateIntentResult`/`CaptureResult`/`RefundResult` in `BasePaymentProvider.ts` (all carry `Success` and `Reason?`); adjust the object literals if a field is required.

- [ ] **Step 4: Wire exports** — add `export { BillComPaymentProvider, LoadBillComPaymentProvider } from './BillComPaymentProvider.js';` to `packages/CoreEntitiesServer/src/index.ts` next to the other providers; add `LoadBillComPaymentProvider();  // Bill.com — AR rail, refuses every checkout verb` to `packages/Server/src/index.ts` after line 129.

- [ ] **Step 5: Run tests** → PASS. `pnpm run build:packages` green.

- [ ] **Step 6: Commit**

```bash
git add packages/CoreEntitiesServer/src/BillComPaymentProvider.ts packages/CoreEntitiesServer/src/__tests__/BillComPaymentProvider.test.ts packages/CoreEntitiesServer/src/index.ts packages/Server/src/index.ts
git commit -m "feat(orders): BillComPaymentProvider — the BillCom type resolves, and refuses to charge"
```

---

### Task 4: `BaseInvoiceRail` contract

**Files:**
- Create: `packages/CoreEntitiesServer/src/BaseInvoiceRail.ts`
- Test: `packages/CoreEntitiesServer/src/__tests__/BaseInvoiceRail.test.ts`
- Modify: `packages/CoreEntitiesServer/src/index.ts`

**Interfaces:**
- Produces (used by Tasks 5, 6, 11, 12, 15):

```ts
export interface RailCustomerFacts { PartyKind: 'Organization' | 'Person'; PartyID: string; Name: string; Email: string | null; AddressLines: string[]; City: string | null; State: string | null; PostalCode: string | null; Country: string | null; }
export interface RailInvoiceLine { Description: string; Quantity: number; UnitPrice: number; }
export interface RailInvoiceFacts { DocumentNumber: string; InvoiceDate: string; DueDate: string | null; Amount: number; ExternalCustomerRef: string; Lines: RailInvoiceLine[]; Memo: string | null; }
export interface RailInvoiceSnapshot { ExternalInvoiceRef: string; InvoiceNumber: string | null; Total: number; DueAmount: number; ScheduledAmount: number; Status: string | null; Archived: boolean; }
export interface RailPaymentRecord { ExternalPaymentRef: string; ExternalCustomerRef: string | null; Amount: number; UnappliedAmount: number; PaymentDate: string | null; Status: string | null; OnlinePayment: boolean | null; ReceivablesType: string | null; UpdatedAt: string | null; InvoicePayments: Array<{ ExternalInvoiceRef: string; Amount: number; PaymentDate: string | null }>; Raw: Record<string, unknown>; }
export type RailResult<T> = { Success: true; Value: T } | { Success: false; Reason: string; Transient: boolean };
export interface InvoiceRailConfig { PaymentProviderID: string; TypeCode: string; CompanyID: string; Name: string; IsLiveMode: boolean; CompanyIntegrationID: string | null; }
export class BaseInvoiceRail {
    public Config!: InvoiceRailConfig; public Provider?: IMetadataProvider; public User?: UserInfo;
    EnsureCustomer(facts: RailCustomerFacts): Promise<RailResult<{ ExternalCustomerRef: string }>>;
    IssueInvoice(facts: RailInvoiceFacts): Promise<RailResult<{ ExternalInvoiceRef: string }>>;
    GetInvoice(externalInvoiceRef: string): Promise<RailResult<RailInvoiceSnapshot | null>>;
    CancelInvoice(externalInvoiceRef: string): Promise<RailResult<{ Archived: true }>>;
    FetchPaymentsSince(watermark: string | null): Promise<RailResult<{ Payments: RailPaymentRecord[]; NewWatermark: string | null }>>;
}
export function LoadBaseInvoiceRail(): void;
```

- [ ] **Step 1: Failing test** — every base method returns `Success:false`, `Transient:false`, and a reason naming the type code:

```ts
import { describe, it, expect } from 'vitest';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';

describe('BaseInvoiceRail', () => {
    const rail = new BaseInvoiceRail();
    rail.Config = { PaymentProviderID: 'p', TypeCode: 'Nothing', CompanyID: 'c', Name: 'n', IsLiveMode: false, CompanyIntegrationID: null };
    it('refuses every verb, permanently, naming the type', async () => {
        const r = await rail.IssueInvoice({ DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: null, Amount: 1, ExternalCustomerRef: '0cu', Lines: [], Memo: null });
        expect(r.Success).toBe(false);
        if (!r.Success) { expect(r.Transient).toBe(false); expect(r.Reason).toContain('Nothing'); }
    });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the interfaces above verbatim, each method returning `{ Success: false, Transient: false, Reason: \`The '${this.Config?.TypeCode ?? 'unknown'}' invoice rail does not implement ${what}. Register a subclass with @RegisterClass(BaseInvoiceRail, '<code>') and call its Load* anchor.\` }`. No decorator on the base (same reasoning as `BaseDeliveryChannel`: the resolver detects the base fallback by `constructor === BaseInvoiceRail`). Export everything from `index.ts`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(orders): BaseInvoiceRail — the outbound invoice seam`.

---

### Task 5: `InvoiceRailResolver`

**Files:**
- Create: `packages/CoreEntitiesServer/src/InvoiceRailResolver.ts`
- Test: `packages/CoreEntitiesServer/src/__tests__/InvoiceRailResolver.test.ts`
- Modify: `packages/CoreEntitiesServer/src/index.ts`

**Interfaces:**
- Consumes: `LoadPaymentProviderConfig` pattern (`PaymentProviderResolver.ts:118`), `PAYMENT_PROVIDER_ENTITY`, `BaseInvoiceRail`.
- Produces: `ResolveInvoiceRail(paymentProviderID, provider, user): Promise<BaseInvoiceRail>` (throws `InvoiceRailNotConfiguredError`), `FindInvoiceRailForCompany(companyID, provider, user): Promise<BaseInvoiceRail | null>` (null when the company has no active rail-capable provider), `BuildInvoiceRail(config, provider, user)`, `INVOICE_RAIL_TYPE_CODES = ['BillCom']`.

- [ ] **Step 1: Failing test** for `BuildInvoiceRail` (pure part): registers a fake subclass under `'FakeRail'` in the test, builds it, asserts the config is attached; asserts an unregistered code throws `InvoiceRailNotConfiguredError` mentioning `@RegisterClass(BaseInvoiceRail, 'Nope')`.

```ts
import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';
import { BuildInvoiceRail, InvoiceRailNotConfiguredError } from '../InvoiceRailResolver.js';

@RegisterClass(BaseInvoiceRail, 'FakeRail')
class FakeRail extends BaseInvoiceRail {}
void FakeRail;

const cfg = (code: string) => ({ PaymentProviderID: 'p', TypeCode: code, CompanyID: 'c', Name: 'n', IsLiveMode: false, CompanyIntegrationID: 'ci' });

describe('BuildInvoiceRail', () => {
    it('resolves a registered subclass and attaches the config', () => {
        const rail = BuildInvoiceRail(cfg('FakeRail'), {} as never, {} as never);
        expect(rail).toBeInstanceOf(FakeRail);
        expect(rail.Config.CompanyIntegrationID).toBe('ci');
    });
    it('refuses an unregistered code with registration instructions', () => {
        expect(() => BuildInvoiceRail(cfg('Nope'), {} as never, {} as never)).toThrow(InvoiceRailNotConfiguredError);
        expect(() => BuildInvoiceRail(cfg('Nope'), {} as never, {} as never)).toThrow(/@RegisterClass\(BaseInvoiceRail, 'Nope'\)/);
    });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

```ts
import { MJGlobal } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { BaseInvoiceRail, type InvoiceRailConfig } from './BaseInvoiceRail.js';
import { LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { PAYMENT_PROVIDER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

/** Provider type codes that are also invoice rails. A type is a rail iff a BaseInvoiceRail subclass is registered under its code. */
export const INVOICE_RAIL_TYPE_CODES: readonly string[] = ['BillCom'];

export class InvoiceRailNotConfiguredError extends Error {}

export function BuildInvoiceRail(config: InvoiceRailConfig, provider: IMetadataProvider, user: UserInfo): BaseInvoiceRail {
    const rail = MJGlobal.Instance.ClassFactory.CreateInstance<BaseInvoiceRail>(BaseInvoiceRail, config.TypeCode);
    if (!rail || rail.constructor === BaseInvoiceRail) {
        throw new InvoiceRailNotConfiguredError(
            `No invoice rail is registered for provider type '${config.TypeCode}'. Register one with ` +
            `@RegisterClass(BaseInvoiceRail, '${config.TypeCode}') and call its Load* anchor from the server bootstrap.`);
    }
    rail.Config = config; rail.Provider = provider; rail.User = user;
    return rail;
}

export async function ResolveInvoiceRail(paymentProviderID: string, provider: IMetadataProvider, user: UserInfo): Promise<BaseInvoiceRail> {
    const cfg = await LoadPaymentProviderConfig(paymentProviderID, provider, user); // throws when missing/inactive
    const ci = await loadCompanyIntegrationID(cfg.ID, provider, user);
    return BuildInvoiceRail({ PaymentProviderID: cfg.ID, TypeCode: cfg.TypeCode, CompanyID: cfg.CompanyID, Name: cfg.Name, IsLiveMode: cfg.IsLiveMode, CompanyIntegrationID: ci }, provider, user);
}

/** The company's active rail, or null — null is the ordinary answer for a company that invoices natively. */
export async function FindInvoiceRailForCompany(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<BaseInvoiceRail | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const codes = INVOICE_RAIL_TYPE_CODES.map((c) => `'${c}'`).join(',');
    const rows = await rv.RunView<{ ID: string }>({
        EntityName: PAYMENT_PROVIDER_ENTITY,
        ExtraFilter: `CompanyID = '${RequireUUID(companyID, 'CompanyID')}' AND IsActive = 1 AND PaymentProviderTypeID IN (SELECT ID FROM [__mj_BizAppsOrders].[PaymentProviderType] WHERE Code IN (${codes}))`,
        Fields: ['ID'], ResultType: 'simple',
    }, user);
    const id = rows.Results?.[0]?.ID;
    if (!id) return null;
    if ((rows.Results?.length ?? 0) > 1) throw new InvoiceRailNotConfiguredError(`Company ${companyID} has ${rows.Results!.length} active invoice rails; exactly one is allowed.`);
    return ResolveInvoiceRail(id, provider, user);
}

async function loadCompanyIntegrationID(paymentProviderID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ CompanyIntegrationID: string | null }>({ EntityName: PAYMENT_PROVIDER_ENTITY, ExtraFilter: `ID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}'`, Fields: ['CompanyIntegrationID'], ResultType: 'simple' }, user);
    return r.Results?.[0]?.CompanyIntegrationID ?? null;
}
```

Use the schema-qualified subquery only if `PaymentProviderType` is not a related virtual field on the provider view; check `vwPaymentProviders` — if it exposes `PaymentProviderType` (the type's Name, per `LoadPaymentProviderConfig`), it is the Name not the Code, so keep the subquery.

- [ ] **Step 4: Run** → PASS. Export from `index.ts`. **Step 5: Commit** `feat(orders): resolve an invoice rail from a PaymentProvider row`.

---

### Task 6: `BillComGateway` and `BillComInvoiceRail`

**Files:**
- Create: `packages/CoreEntitiesServer/src/BillComGateway.ts`, `packages/CoreEntitiesServer/src/BillComInvoiceRail.ts`
- Test: `packages/CoreEntitiesServer/src/__tests__/BillComInvoiceRail.test.ts`
- Modify: `packages/CoreEntitiesServer/package.json` (add `"@memberjunction/integration-engine": "^6.1.0-edge.5"` and `"@memberjunction/core-entities"` if absent), `index.ts`, `packages/Server/src/index.ts`

**Interfaces:**
- Consumes: Task 4 types; connector generic verbs (`CreateRecord`, `UpdateRecord`, `GetRecord`, `FetchChanges`) via `ConnectorFactory.Resolve`.
- Produces: `interface BillComGatewaySeams { createRecord, updateRecord, getRecord, fetchChanges }`, `UseBillComGatewaySeams(seams | null)`, `class BillComInvoiceRail`, `LoadBillComInvoiceRail()`.

- [ ] **Step 1: Failing tests** (stub the gateway; assert wire shapes — the `customer:{id}` rule is the one live-verified defect):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BillComInvoiceRail } from '../BillComInvoiceRail.js';
import { UseBillComGatewaySeams } from '../BillComGateway.js';

const calls: Array<{ verb: string; object: string; attrs?: Record<string, unknown>; id?: string }> = [];
const rail = () => {
    const r = new BillComInvoiceRail();
    r.Config = { PaymentProviderID: 'p', TypeCode: 'BillCom', CompanyID: 'c', Name: 'BC', IsLiveMode: false, CompanyIntegrationID: 'ci' };
    return r;
};
beforeEach(() => {
    calls.length = 0;
    UseBillComGatewaySeams({
        createRecord: async (_ci, object, attrs) => { calls.push({ verb: 'create', object, attrs }); return { Success: true, ExternalID: object === 'customers' ? '0cu1' : '00e1', StatusCode: 201 }; },
        updateRecord: async (_ci, object, id, attrs) => { calls.push({ verb: 'update', object, id, attrs }); return { Success: true, ExternalID: id, StatusCode: 200 }; },
        getRecord: async (_ci, object, id) => { calls.push({ verb: 'get', object, id }); return { ExternalID: id, ObjectType: object, Fields: { id, invoiceNumber: 'ORD-1', totalAmount: 250.25, dueAmount: 250.25, scheduledAmount: 0, status: { value: 'OPEN' }, archived: false } }; },
        fetchChanges: async () => ({ Records: [{ ExternalID: '0rp1', ObjectType: 'receivable-payments', Fields: { id: '0rp1', customerId: '0cu1', amount: 100, unappliedAmount: 0, paymentDate: '2026-09-20', status: 'PAID', onlinePayment: true, updatedTime: '2026-09-20T10:00:00.000Z', invoicePayments: [{ invoiceId: '00e1', amount: 100, paymentDate: '2026-09-20' }] } }], HasMore: false }),
        loadCompanyIntegration: async () => ({ ID: 'ci' } as never),
    });
});

describe('BillComInvoiceRail', () => {
    it('creates an invoice with customer:{id}, never customerId, and lines as BILL spells them', async () => {
        const r = await rail().IssueInvoice({ DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: '2026-10-22', Amount: 250.25, ExternalCustomerRef: '0cu1', Memo: null,
            Lines: [{ Description: 'A', Quantity: 2, UnitPrice: 100 }, { Description: 'B', Quantity: 1, UnitPrice: 50.25 }] });
        expect(r.Success).toBe(true);
        const create = calls.find((c) => c.verb === 'create' && c.object === 'invoices')!;
        expect(create.attrs).toMatchObject({ invoiceNumber: 'ORD-1', invoiceDate: '2026-09-22', dueDate: '2026-10-22', customer: { id: '0cu1' } });
        expect(create.attrs).not.toHaveProperty('customerId');
        expect(create.attrs!.invoiceLineItems).toEqual([{ description: 'A', quantity: 2, price: 100 }, { description: 'B', quantity: 1, price: 50.25 }]);
    });
    it('reads an invoice back into a snapshot', async () => {
        const r = await rail().GetInvoice('00e1');
        expect(r.Success && r.Value).toMatchObject({ ExternalInvoiceRef: '00e1', Total: 250.25, DueAmount: 250.25, Status: 'OPEN', Archived: false });
    });
    it('normalises receivable payments, including the invoice fan-out', async () => {
        const r = await rail().FetchPaymentsSince('2026-09-01T00:00:00.000Z');
        expect(r.Success && r.Value.Payments[0]).toMatchObject({ ExternalPaymentRef: '0rp1', Amount: 100, Status: 'PAID', OnlinePayment: true, InvoicePayments: [{ ExternalInvoiceRef: '00e1', Amount: 100 }] });
        expect(r.Success && r.Value.NewWatermark).toBe('2026-09-20T10:00:00.000Z');
    });
    it('refuses a live-mode mismatch before contacting BILL', async () => {
        const r = rail(); r.Config = { ...r.Config, IsLiveMode: true };
        UseBillComGatewaySeams({ ...(await import('../BillComGateway.js')).CurrentBillComGatewaySeams()!, loadCredentialEnvironment: async () => 'sandbox' });
        const out = await r.IssueInvoice({ DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: null, Amount: 1, ExternalCustomerRef: '0cu1', Lines: [{ Description: 'x', Quantity: 1, UnitPrice: 1 }], Memo: null });
        expect(out.Success).toBe(false);
        expect(out.Success === false && out.Reason).toMatch(/sandbox/);
    });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement the gateway**

```ts
/**
 * @fileoverview The connector-facing seam for Bill.com. Everything that touches
 * `@memberjunction/connector-bill-com` goes through here so the rail can be unit-tested with the wire
 * stubbed (precedent: AccountingERPEngine.UseSeams), and so the one place that knows how a Company
 * Integration turns into a connector instance is this file.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { ConnectorFactory, type CRUDResult, type ExternalRecord, type FetchBatchResult } from '@memberjunction/integration-engine';

export interface BillComGatewaySeams {
    loadCompanyIntegration(companyIntegrationID: string, provider: IMetadataProvider, user: UserInfo): Promise<MJCompanyIntegrationEntity>;
    /** 'sandbox' | 'production' from the credential's `environment`; null when unreadable. */
    loadCredentialEnvironment?(ci: MJCompanyIntegrationEntity, provider: IMetadataProvider, user: UserInfo): Promise<string | null>;
    createRecord(ci: MJCompanyIntegrationEntity, object: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    updateRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    getRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, user: UserInfo): Promise<ExternalRecord | null>;
    fetchChanges(ci: MJCompanyIntegrationEntity, object: string, watermark: string | null, user: UserInfo): Promise<FetchBatchResult>;
}

let seams: BillComGatewaySeams | null = null;
export function UseBillComGatewaySeams(s: BillComGatewaySeams | null): void { seams = s; }
export function CurrentBillComGatewaySeams(): BillComGatewaySeams | null { return seams; }

async function connectorFor(ci: MJCompanyIntegrationEntity, provider: IMetadataProvider, user: UserInfo) {
    const integration = await provider.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', user);
    if (!(await integration.Load(ci.IntegrationID))) throw new Error(`Integration ${ci.IntegrationID} behind Company Integration ${ci.ID} could not be loaded.`);
    return ConnectorFactory.Resolve(integration);
}

export const DefaultBillComGateway = (provider: IMetadataProvider): BillComGatewaySeams => ({
    async loadCompanyIntegration(id, p, user) {
        const ci = await p.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
        if (!(await ci.Load(id))) throw new Error(`Company Integration ${id} does not exist.`);
        return ci;
    },
    async loadCredentialEnvironment(ci, p, user) {
        if (!ci.CredentialID) return null;
        const cred = await p.GetEntityObject<{ Load(id: string): Promise<boolean>; Values: string | null }>('MJ: Credentials', user);
        if (!(await cred.Load(ci.CredentialID))) return null;
        try { const v = JSON.parse(cred.Values ?? '{}'); return v.environment ?? v.Environment ?? 'sandbox'; } catch { return null; }
    },
    async createRecord(ci, object, attrs, user) { return (await connectorFor(ci, provider, user)).CreateRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, Attributes: attrs }); },
    async updateRecord(ci, object, externalID, attrs, user) { return (await connectorFor(ci, provider, user)).UpdateRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, ExternalID: externalID, Attributes: attrs }); },
    async getRecord(ci, object, externalID, user) { return (await connectorFor(ci, provider, user)).GetRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, ExternalID: externalID }); },
    async fetchChanges(ci, object, watermark, user) {
        const c = await connectorFor(ci, provider, user);
        const all: ExternalRecord[] = []; let page = 1; let cursor: string | undefined; let more = true; let last: FetchBatchResult | null = null;
        while (more && page <= 200) { // 200 × 100 rows is a hard stop, not a target
            last = await c.FetchChanges({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, WatermarkValue: watermark, BatchSize: 100, CurrentPage: page, CurrentCursor: cursor });
            all.push(...last.Records); more = last.HasMore; cursor = (last as { NextCursor?: string }).NextCursor; page++;
        }
        return { Records: all, HasMore: false, NewWatermarkValue: last?.NewWatermarkValue };
    },
});

export function BillComGateway(provider: IMetadataProvider): BillComGatewaySeams { return seams ?? DefaultBillComGateway(provider); }
```

Check `FetchBatchResult` for the exact cursor field name (`NextCursor` / `NextPage`) in `BaseIntegrationConnector.ts:214–240` and use it.

- [ ] **Step 4: Implement the rail**

```ts
import { RegisterClass } from '@memberjunction/global';
import { BaseInvoiceRail, type RailCustomerFacts, type RailInvoiceFacts, type RailInvoiceSnapshot, type RailPaymentRecord, type RailResult } from './BaseInvoiceRail.js';
import { BillComGateway } from './BillComGateway.js';

const TRANSIENT = /timeout|ECONN|ETIMEDOUT|5\d\d|rate limit|session|401|429|503/i;
const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
const str = (v: unknown): string | null => (v == null ? null : typeof v === 'object' ? String((v as { value?: unknown }).value ?? JSON.stringify(v)) : String(v));

@RegisterClass(BaseInvoiceRail, 'BillCom')
export class BillComInvoiceRail extends BaseInvoiceRail {
    private fail<T>(reason: string): RailResult<T> { return { Success: false, Reason: reason, Transient: TRANSIENT.test(reason) }; }

    private async ci() {
        if (!this.Provider || !this.User) throw new Error('BillComInvoiceRail needs Provider and User.');
        if (!this.Config.CompanyIntegrationID) throw new Error(`Payment provider '${this.Config.Name}' has no CompanyIntegrationID; Bill.com cannot be reached without one.`);
        const gw = BillComGateway(this.Provider);
        const ci = await gw.loadCompanyIntegration(this.Config.CompanyIntegrationID, this.Provider, this.User);
        const env = gw.loadCredentialEnvironment ? await gw.loadCredentialEnvironment(ci, this.Provider, this.User) : null;
        if (env && (env === 'production') !== this.Config.IsLiveMode) {
            throw new Error(`Payment provider '${this.Config.Name}' is ${this.Config.IsLiveMode ? 'live' : 'not live'} but its Bill.com credential is '${env}'. Refusing rather than sending a real customer a sandbox invoice, or vice versa.`);
        }
        return { gw, ci };
    }

    public override async EnsureCustomer(f: RailCustomerFacts): Promise<RailResult<{ ExternalCustomerRef: string }>> {
        try {
            if (!f.Email) return this.fail(`Bill.com requires a customer email and ${f.Name} has none. Add a billing email to the ${f.PartyKind.toLowerCase()} and re-run.`);
            const { gw, ci } = await this.ci();
            const r = await gw.createRecord(ci, 'customers', {
                name: f.Name, email: f.Email, accountNumber: f.PartyID,
                billingAddress: { line1: f.AddressLines[0] ?? null, line2: f.AddressLines[1] ?? null, city: f.City, stateOrProvince: f.State, zipOrPostalCode: f.PostalCode, country: f.Country },
            }, this.User!);
            return r.Success && r.ExternalID ? { Success: true, Value: { ExternalCustomerRef: r.ExternalID } } : this.fail(r.ErrorMessage ?? `Bill.com refused the customer (HTTP ${r.StatusCode}).`);
        } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    }

    public override async IssueInvoice(f: RailInvoiceFacts): Promise<RailResult<{ ExternalInvoiceRef: string }>> {
        try {
            const { gw, ci } = await this.ci();
            const attrs: Record<string, unknown> = {
                invoiceNumber: f.DocumentNumber, invoiceDate: f.InvoiceDate, customer: { id: f.ExternalCustomerRef },
                invoiceLineItems: f.Lines.map((l) => ({ description: l.Description, quantity: l.Quantity, price: l.UnitPrice })),
            };
            if (f.DueDate) attrs.dueDate = f.DueDate;
            if (f.Memo) attrs.description = f.Memo;
            const r = await gw.createRecord(ci, 'invoices', attrs, this.User!);
            return r.Success && r.ExternalID ? { Success: true, Value: { ExternalInvoiceRef: r.ExternalID } } : this.fail(r.ErrorMessage ?? `Bill.com refused the invoice (HTTP ${r.StatusCode}).`);
        } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    }

    public override async GetInvoice(ref: string): Promise<RailResult<RailInvoiceSnapshot | null>> {
        try {
            const { gw, ci } = await this.ci();
            const rec = await gw.getRecord(ci, 'invoices', ref, this.User!);
            if (!rec) return { Success: true, Value: null };
            const x = rec.Fields;
            return { Success: true, Value: { ExternalInvoiceRef: ref, InvoiceNumber: str(x.invoiceNumber), Total: num(x.totalAmount), DueAmount: num(x.dueAmount), ScheduledAmount: num(x.scheduledAmount), Status: str(x.status), Archived: x.archived === true } };
        } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    }

    /** Spike S1 decides the body: `{archived:true}` via PUT if BILL honours it, else this returns a permanent refusal until upstream ask U1 lands. */
    public override async CancelInvoice(ref: string): Promise<RailResult<{ Archived: true }>> {
        try {
            const { gw, ci } = await this.ci();
            const r = await gw.updateRecord(ci, 'invoices', ref, { archived: true }, this.User!);
            if (!r.Success) return this.fail(r.ErrorMessage ?? `Bill.com refused the archive (HTTP ${r.StatusCode}).`);
            const back = await this.GetInvoice(ref);
            if (!back.Success) return back as RailResult<{ Archived: true }>;
            return back.Value?.Archived ? { Success: true, Value: { Archived: true } } : this.fail('Bill.com accepted the update but the invoice is not archived. The archive verb is not available through this connector version (upstream ask U1).');
        } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    }

    public override async FetchPaymentsSince(watermark: string | null): Promise<RailResult<{ Payments: RailPaymentRecord[]; NewWatermark: string | null }>> {
        try {
            const { gw, ci } = await this.ci();
            const batch = await gw.fetchChanges(ci, 'receivable-payments', watermark, this.User!);
            const payments = batch.Records.map((r) => {
                const x = r.Fields; const ip = Array.isArray(x.invoicePayments) ? x.invoicePayments as Array<Record<string, unknown>> : [];
                return {
                    ExternalPaymentRef: r.ExternalID, ExternalCustomerRef: str(x.customerId), Amount: num(x.amount), UnappliedAmount: num(x.unappliedAmount),
                    PaymentDate: str(x.paymentDate), Status: str(x.status), OnlinePayment: typeof x.onlinePayment === 'boolean' ? x.onlinePayment : null,
                    ReceivablesType: str(x.receivablesType), UpdatedAt: str(x.updatedTime),
                    InvoicePayments: ip.map((p) => ({ ExternalInvoiceRef: String(p.invoiceId), Amount: num(p.amount), PaymentDate: str(p.paymentDate) })), Raw: x,
                } satisfies RailPaymentRecord;
            }).filter((p) => !watermark || !p.UpdatedAt || p.UpdatedAt >= watermark); // local narrowing until the connector applies the filter (U2)
            const newWm = payments.reduce<string | null>((m, p) => (p.UpdatedAt && (!m || p.UpdatedAt > m) ? p.UpdatedAt : m), batch.NewWatermarkValue ?? null);
            return { Success: true, Value: { Payments: payments, NewWatermark: newWm } };
        } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    }
}
export function LoadBillComInvoiceRail(): void { void BillComInvoiceRail; }
```

Adjust the `billingAddress` sub-field names to what spike S4 showed BILL accepts. The `str()` helper flattens BILL's `status` object; confirm against S2's sample whether the value sits under `value`, `name` or is a bare string, and adjust.

- [ ] **Step 5: Wire** exports (`index.ts`) and anchor `LoadBillComInvoiceRail();  // 'BillCom' — the outbound invoice rail over the published connector` after `LoadEmailDeliveryChannel()` in `packages/Server/src/index.ts`. Add `@memberjunction/integration-engine` and `@memberjunction/core-entities` to `packages/CoreEntitiesServer/package.json` dependencies at `^6.1.0-edge.5`; `pnpm install`.

- [ ] **Step 6: Run** unit tests → PASS; `pnpm run build:packages` green. Run `BILLCOM_PROBE=login node test-harnesses/billcom-live.mjs` to prove the real gateway path boots (`No connector registered` here means the host has not loaded the connector package — see U3).

- [ ] **Step 7: Commit** `feat(orders): BillComInvoiceRail over the published connector, with a stubbable gateway`.

---

# Phase 2 — Outbound invoicing (requires PR #220 merged)

### Task 7: `ExternalInvoice` and `ExternalCustomer` tables

**Files:**
- Create: `migrations/V202609241000__v5.15.0__ExternalInvoice.sql`
- Modify: `packages/CoreEntitiesServer/src/entity-names.ts`, `packages/IntegrationTests/src/entity-names.ts`, `packages/Angular/src/lib/data/entity-names.ts` (add `EXTERNAL_INVOICE_ENTITY = 'MJ_BizApps_Orders: External Invoices'`, `EXTERNAL_CUSTOMER_ENTITY = 'MJ_BizApps_Orders: External Customers'`)
- Create: `.changeset/external-invoice.md`

- [ ] **Step 1: Write the migration** — the DDL from spec §4.3 for `ExternalInvoice` (with the persisted `UnitScheduleKey` computed column and both filtered unique indexes) and `ExternalCustomer`, each wrapped in `IF OBJECT_ID('${flyway:defaultSchema}.ExternalInvoice') IS NULL BEGIN … END`, with FKs: `ExternalInvoice.PaymentProviderID → PaymentProvider`, `OrderHeaderID → OrderHeader`, `CompanyID → __mj.Company`, `OrderHeaderPaymentScheduleID → OrderHeaderPaymentSchedule`, `IssuedByUserID → __mj.User`; `ExternalCustomer.PaymentProviderID → PaymentProvider`, `BillToOrganizationID → __mj_BizAppsCommon.Organization`, `BillToPersonID → __mj_BizAppsCommon.Person`. One `MS_Description` per table and column (copy the intent from the spec's inline comments). Add the header comment explaining: authoritative mapping (#146), why the schedule columns are also written (D-B2), what `Sending` means (§7).

- [ ] **Step 2: Apply, CodeGen, fold** exactly as Task 2 step 3. Confirm the generated entity names match the constants (`grep "External Invoices" packages/Entities/src/generated/entities/__mj_BizAppsOrders.ts`).

- [ ] **Step 3: Verify** `pnpm run build:packages`; `pnpm run test:unit` still green (registry-parity untouched so far).

- [ ] **Step 4: Changeset + commit** `feat(orders): ExternalInvoice and ExternalCustomer — the Bill.com invoice and customer mapping`.

---

### Task 8: `ExternalInvoiceBehavior` (pure)

**Files:**
- Create: `packages/Entities/src/ExternalInvoiceBehavior.ts`
- Test: `packages/Entities/src/__tests__/ExternalInvoiceBehavior.test.ts`
- Modify: `packages/Entities/src/index.ts` (export)

**Interfaces:**
- Consumes: `InvoiceDocument`, `InvoiceInstalmentFacts` from `InvoiceBehavior.ts` (PR #220) — import types only.
- Produces:

```ts
export type ExternalInvoiceStatus = 'Sending' | 'Sent' | 'Canceled' | 'Failed';
export interface BillingUnitKey { OrderHeaderID: string; CompanyID: string; OrderHeaderPaymentScheduleID: string | null; }
export interface ExternalInvoicePayload { DocumentNumber: string; InvoiceDate: string; DueDate: string | null; Amount: number; Lines: Array<{ Description: string; Quantity: number; UnitPrice: number }>; Memo: string | null; }
export function BuildExternalInvoicePayload(doc: InvoiceDocument, inst: InvoiceInstalmentFacts, invoiceDate: string): { OK: true; Payload: ExternalInvoicePayload } | { OK: false; Reason: string };
export function DecideInvoiceable(i: { OrderStatus: string; HasSchedule: boolean; ScheduleRowStatus: string | null; ScheduleRowNamed: boolean; ExistingStatus: ExternalInvoiceStatus | null; AllowReissue: boolean }): { Verdict: 'Issue' | 'AlreadySent' | 'Refuse'; Code: 'OK' | 'ALREADY_SENT' | 'IN_FLIGHT' | 'NOT_CONFIRMED' | 'NAME_THE_INSTALMENT' | 'INSTALMENT_NOT_INVOICED' | 'HAS_HISTORY'; Reason: string };
export function DecideCancel(i: { Status: ExternalInvoiceStatus; PaidAmountOnUnit: number; ExternalDueAmount: number | null; ExternalTotal: number | null }): { OK: boolean; Code: 'OK' | 'NOT_SENT' | 'HAS_PAYMENT' | 'PAYMENT_PENDING_ON_RAIL'; Reason: string };
export function ClassifyIssueFailure(reason: string): 'Transient' | 'Permanent';
export const money: (n: number) => number; // round to cents
```

- [ ] **Step 1: Failing tests** (the cases that matter):

```ts
import { describe, it, expect } from 'vitest';
import { BuildExternalInvoicePayload, DecideCancel, DecideInvoiceable, ClassifyIssueFailure } from '../ExternalInvoiceBehavior.js';
import type { InvoiceDocument, InvoiceInstalmentFacts } from '../InvoiceBehavior.js';

const row = (n: number, amount: number, qty = 1, over: Partial<InvoiceDocument['Rows'][0]> = {}) => ({ LineID: `l${n}`, LineNumber: n, ProductName: `P${n}`, ProductSKU: null, Description: null, Quantity: qty, UnitPrice: amount / qty, DiscountAmount: 0, Amount: amount, IncludedInParent: false, ServicePeriodStart: null, ServicePeriodEnd: null, ReversesOrderLineID: null, Children: [], ...over });
const doc = (over: Partial<InvoiceDocument> = {}): InvoiceDocument => ({ Kind: 'Invoice', DocumentNumber: 'ORD-1', OrderNumber: 'ORD-1', OrderHeaderID: 'o', OrderDate: '2026-09-01', DueDate: '2026-10-01', DaysUntilDue: 10, Status: 'Confirmed', PaymentStatusLabel: 'Unpaid', CompanyID: 'c', CompanyName: 'Co', Issuer: {} as never, BillTo: {} as never, ShipTo: null, TermsLabel: 'Net 30', ExternalDocumentNumber: null, ReversesOrderNumber: null, ReversalReason: null, Description: null, Rows: [row(1, 200, 2), row(2, 50.25)], Ladder: [], ListSubtotal: 250.25, DiscountTotal: 0, NetTotal: 250.25, ChargeTotal: 10, TaxTotal: 5, Gross: 265.25, AmountPaid: 0, AmountDue: 265.25, Payments: [], Notes: [], ...over });
const whole = (): InvoiceInstalmentFacts => ({ CompanyID: 'c', InstallmentNumber: 1, InstallmentCount: 1, DueDate: '2026-10-01', Amount: 265.25, AmountPaid: 0, DocumentNumber: null, Payments: [] });

describe('BuildExternalInvoicePayload', () => {
    it('schedule-less: one BILL line per row, plus charges and tax, tying to the cent', () => {
        const r = BuildExternalInvoicePayload(doc(), whole(), '2026-09-22');
        expect(r.OK).toBe(true);
        if (r.OK) {
            expect(r.Payload.Lines).toEqual([
                { Description: 'P1', Quantity: 2, UnitPrice: 100 }, { Description: 'P2', Quantity: 1, UnitPrice: 50.25 },
                { Description: 'Charges', Quantity: 1, UnitPrice: 10 }, { Description: 'Tax', Quantity: 1, UnitPrice: 5 }]);
            expect(r.Payload.Amount).toBe(265.25); expect(r.Payload.DocumentNumber).toBe('ORD-1');
        }
    });
    it('instalment: a single line naming N of M, for the instalment amount, under the frozen number', () => {
        const r = BuildExternalInvoicePayload(doc(), { ...whole(), InstallmentNumber: 2, InstallmentCount: 4, Amount: 66.31, DocumentNumber: 'ORD-1-2', DueDate: '2027-03-18' }, '2026-09-22');
        expect(r.OK && r.Payload).toMatchObject({ DocumentNumber: 'ORD-1-2', DueDate: '2027-03-18', Amount: 66.31, Lines: [{ Description: 'Instalment 2 of 4 — ORD-1', Quantity: 1, UnitPrice: 66.31 }] });
    });
    it('refuses when the lines do not tie to the amount', () => {
        const r = BuildExternalInvoicePayload(doc({ Gross: 999 }), { ...whole(), Amount: 999 }, '2026-09-22');
        expect(r.OK).toBe(false); expect(!r.OK && r.Reason).toMatch(/does not tie/);
    });
    it('a rollup child prints no amount and is folded into its parent line', () => {
        const parent = row(1, 150, 1, { Children: [row(3, 0, 1, { IncludedInParent: true })] });
        const r = BuildExternalInvoicePayload(doc({ Rows: [parent], ListSubtotal: 150, NetTotal: 150, ChargeTotal: 0, TaxTotal: 0, Gross: 150, AmountDue: 150 }), { ...whole(), Amount: 150 }, '2026-09-22');
        expect(r.OK && r.Payload.Lines).toEqual([{ Description: 'P1', Quantity: 1, UnitPrice: 150 }]);
    });
});

describe('DecideInvoiceable', () => {
    const base = { OrderStatus: 'Confirmed', HasSchedule: false, ScheduleRowStatus: null, ScheduleRowNamed: false, ExistingStatus: null, AllowReissue: false };
    it('a confirmed schedule-less order with no history issues', () => expect(DecideInvoiceable(base).Code).toBe('OK'));
    it('a draft refuses', () => expect(DecideInvoiceable({ ...base, OrderStatus: 'Draft' }).Code).toBe('NOT_CONFIRMED'));
    it('an order with a schedule must name the instalment', () => expect(DecideInvoiceable({ ...base, HasSchedule: true }).Code).toBe('NAME_THE_INSTALMENT'));
    it('a Scheduled instalment is not yet invoiceable', () => expect(DecideInvoiceable({ ...base, HasSchedule: true, ScheduleRowNamed: true, ScheduleRowStatus: 'Scheduled' }).Code).toBe('INSTALMENT_NOT_INVOICED'));
    it('Sent → AlreadySent; Sending → IN_FLIGHT; Canceled → HAS_HISTORY unless AllowReissue', () => {
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Sent' }).Verdict).toBe('AlreadySent');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Sending' }).Code).toBe('IN_FLIGHT');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Canceled' }).Code).toBe('HAS_HISTORY');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Canceled', AllowReissue: true }).Code).toBe('OK');
    });
});

describe('DecideCancel', () => {
    it('refuses when money has been applied to the unit', () => expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 10, ExternalDueAmount: 100, ExternalTotal: 100 }).Code).toBe('HAS_PAYMENT'));
    it('refuses when BILL shows a payment we have not polled yet', () => expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 0, ExternalDueAmount: 60, ExternalTotal: 100 }).Code).toBe('PAYMENT_PENDING_ON_RAIL'));
    it('allows an untouched Sent invoice', () => expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 0, ExternalDueAmount: 100, ExternalTotal: 100 }).OK).toBe(true));
});

describe('ClassifyIssueFailure', () => {
    it('network and session are transient; a missing email is permanent', () => {
        expect(ClassifyIssueFailure('ETIMEDOUT')).toBe('Transient');
        expect(ClassifyIssueFailure('Bill.com requires a customer email')).toBe('Permanent');
    });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Rules: rows → lines using `Amount` and `Quantity` (`UnitPrice = money(Amount/Quantity)`; when that does not multiply back exactly, emit `Quantity: 1, UnitPrice: Amount`), skipping rows with `IncludedInParent`; append `Charges` and `Tax` lines when `> 0`; for `InstallmentCount > 1` emit the single instalment line under `inst.DocumentNumber` (refuse if it is null: "instalment has no frozen number; issue it first"); `Amount` is `inst.Amount`; tie check `|Σ(q×p) − Amount| ≤ 0.005` else `Reason: \`${DocumentNumber} lines total X, which does not tie to the unit amount Y\``. `DecideInvoiceable` order of checks: existing status first (`Sending`→`IN_FLIGHT`, `Sent`→`AlreadySent`, `Canceled`/`Failed` without `AllowReissue`→`HAS_HISTORY`), then order status, then schedule rules. `ClassifyIssueFailure` uses the same regex as the rail's `TRANSIENT`.

- [ ] **Step 4: Run** → PASS. Export from `packages/Entities/src/index.ts`. **Step 5: Commit** `feat(orders): ExternalInvoiceBehavior — payload, invoiceable and cancel decisions`.

---

### Task 9: `ExternalPaymentBehavior` (pure)

**Files:**
- Create: `packages/Entities/src/ExternalPaymentBehavior.ts`
- Test: `packages/Entities/src/__tests__/ExternalPaymentBehavior.test.ts`
- Modify: `packages/Entities/src/index.ts`

**Interfaces:**
- Produces:

```ts
export type ExternalPaymentDisposition = 'Captured' | 'Held' | 'Unmatched' | 'Ignored' | 'ReversalNeeded';
export type RailPaymentClass = 'Cleared' | 'Pending' | 'Reversed';
/** Filled from spike S2. Keys are BILL's literal status strings, upper-cased. */
export const BILLCOM_PAYMENT_STATUS: Readonly<Record<string, RailPaymentClass>>;
export function ClassifyPaymentStatus(status: string | null): RailPaymentClass | 'Unknown';
export interface PaymentSeen { ExternalPaymentRef: string; Status: string | null; PriorDisposition: ExternalPaymentDisposition | null; }
export function DecideExternalPayment(p: PaymentSeen): { Action: 'Capture' | 'Hold' | 'Ignore' | 'ReversalNeeded'; Reason: string };
export interface UnitRef { OrderHeaderID: string; CompanyID: string; OrderHeaderPaymentScheduleID: string | null; BillToOrganizationID: string | null; BillToPersonID: string | null; }
export function AllocateInvoicePayments(invoicePayments: Array<{ ExternalInvoiceRef: string; Amount: number }>, lookup: (ref: string) => UnitRef | undefined): { OK: true; Allocations: Array<{ OrderHeaderID: string; Amount: number; OrderHeaderPaymentScheduleID: string | null }>; Payer: { BillToOrganizationID: string | null; BillToPersonID: string | null }; CompanyID: string } | { OK: false; Unmatched: string[]; Reason: string };
export function ExternalPaymentIdempotencyKey(typeCode: string, externalPaymentRef: string): string; // 'billcom:0rp…'
export function TenderFor(p: { OnlinePayment: boolean | null; ReceivablesType: string | null }): 'ACH' | 'Check' | 'CreditCard' | 'Wire';
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { AllocateInvoicePayments, DecideExternalPayment, ExternalPaymentIdempotencyKey, TenderFor, ClassifyPaymentStatus } from '../ExternalPaymentBehavior.js';

describe('DecideExternalPayment', () => {
    it('a cleared payment never seen captures', () => expect(DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'PAID', PriorDisposition: null }).Action).toBe('Capture'));
    it('a pending payment holds', () => expect(DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'SCHEDULED', PriorDisposition: null }).Action).toBe('Hold'));
    it('an UNKNOWN status holds and says so', () => { const d = DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'MYSTERY', PriorDisposition: null }); expect(d.Action).toBe('Hold'); expect(d.Reason).toMatch(/unknown/i); });
    it('already captured and still cleared ignores', () => expect(DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'PAID', PriorDisposition: 'Captured' }).Action).toBe('Ignore'));
    it('already captured and now reversed needs a reversal', () => expect(DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'VOID', PriorDisposition: 'Captured' }).Action).toBe('ReversalNeeded'));
    it('held then cleared captures on the later pass', () => expect(DecideExternalPayment({ ExternalPaymentRef: '0rp1', Status: 'PAID', PriorDisposition: 'Held' }).Action).toBe('Capture'));
});

describe('AllocateInvoicePayments', () => {
    const units: Record<string, ReturnType<typeof unit>> = {};
    const unit = (o: string, sched: string | null = null) => ({ OrderHeaderID: o, CompanyID: 'c', OrderHeaderPaymentScheduleID: sched, BillToOrganizationID: 'org', BillToPersonID: null });
    units['00e1'] = unit('o1'); units['00e2'] = unit('o2', 's2');
    it('fans one payment across the units its invoices belong to', () => {
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 60 }, { ExternalInvoiceRef: '00e2', Amount: 40 }], (ref) => units[ref]);
        expect(r.OK && r.Allocations).toEqual([{ OrderHeaderID: 'o1', Amount: 60, OrderHeaderPaymentScheduleID: null }, { OrderHeaderID: 'o2', Amount: 40, OrderHeaderPaymentScheduleID: 's2' }]);
        expect(r.OK && r.Payer).toEqual({ BillToOrganizationID: 'org', BillToPersonID: null });
    });
    it('one unknown invoice makes the whole payment Unmatched — nothing is captured', () => {
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 60 }, { ExternalInvoiceRef: '00eX', Amount: 40 }], (ref) => units[ref]);
        expect(r.OK).toBe(false); expect(!r.OK && r.Unmatched).toEqual(['00eX']);
    });
    it('no invoices at all is Unmatched', () => expect(AllocateInvoicePayments([], () => undefined).OK).toBe(false));
});

it('idempotency key and tender', () => {
    expect(ExternalPaymentIdempotencyKey('BillCom', '0rp1')).toBe('billcom:0rp1');
    expect(TenderFor({ OnlinePayment: true, ReceivablesType: null })).toBe('ACH');
    expect(TenderFor({ OnlinePayment: false, ReceivablesType: 'CHECK' })).toBe('Check');
    expect(ClassifyPaymentStatus(null)).toBe('Unknown');
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Seed `BILLCOM_PAYMENT_STATUS` from spike S2's observed values; until S2 is done, start with `{ PAID: 'Cleared', CLEARED: 'Cleared', SCHEDULED: 'Pending', PROCESSING: 'Pending', PENDING: 'Pending', VOID: 'Reversed', VOIDED: 'Reversed', CANCELED: 'Reversed', FAILED: 'Reversed' }` and a file header saying so. `TenderFor`: `OnlinePayment === true` → `ACH`; else map `ReceivablesType` upper-cased containing `CHECK`→`Check`, `CARD`→`CreditCard`, `WIRE`→`Wire`, default `ACH`. `AllocateInvoicePayments` also refuses (`OK:false`) when matched units span more than one `CompanyID` (one payment → one receiving company).

- [ ] **Step 4: Run** → PASS. Export. **Step 5: Commit** `feat(orders): ExternalPaymentBehavior — status table, fan-out, idempotency key`.

---

### Task 10: Remote-operation metadata and types for the five operations

**Files:**
- Create: `metadata/remote-operations/.orders-billcom-remote-operations.json` (own dot-json — `filePattern` is `**/.*.json`, and two sessions appending to one file always conflict)
- Create: `metadata/remote-operations/types/orders-issue-external-invoice.{input,output}.ts`, `orders-cancel-external-invoice.{input,output}.ts`, `orders-get-external-invoicing-worklist.{input,output}.ts`, `orders-send-external-invoices.{input,output}.ts`, `orders-poll-external-payments.{input,output}.ts`

**Interfaces (produces, consumed by Tasks 11–15 and the Angular tasks):**

```ts
// issue
export interface OrdersIssueExternalInvoiceInput { OrderHeaderID: string; CompanyID?: string | null; OrderHeaderPaymentScheduleID?: string | null; Preview?: boolean; AllowReissue?: boolean; }
export interface OrdersIssueExternalInvoiceOutput { Success: boolean; Message?: string; ResultCode: 'SENT' | 'ALREADY_SENT' | 'PREVIEWED' | 'NO_RAIL' | 'IN_FLIGHT' | 'HAS_HISTORY' | 'NOT_CONFIRMED' | 'NAME_THE_INSTALMENT' | 'NAME_THE_COMPANY' | 'INSTALMENT_NOT_INVOICED' | 'NO_CUSTOMER_EMAIL' | 'TIE_FAILED' | 'RAIL_REFUSED' | 'ERROR'; ExternalInvoiceID?: string | null; ExternalInvoiceRef?: string | null; ExternalCustomerRef?: string | null; DocumentNumber?: string | null; Amount?: number | null; DueDate?: string | null; SentAt?: string | null; Payload?: unknown; }
// cancel
export interface OrdersCancelExternalInvoiceInput { ExternalInvoiceID: string; Reason: string; }
export interface OrdersCancelExternalInvoiceOutput { Success: boolean; Message?: string; ResultCode: 'CANCELED' | 'NOT_SENT' | 'HAS_PAYMENT' | 'PAYMENT_PENDING_ON_RAIL' | 'RAIL_REFUSED' | 'ERROR'; ExternalInvoiceID?: string | null; CanceledAt?: string | null; }
// worklist
export interface OrdersGetExternalInvoicingWorklistInput { CompanyIDs?: string[]; MaxCount?: number; IncludeFailed?: boolean; }
export interface ExternalInvoicingWorklistRow { OrderHeaderID: string; OrderNumber: string; CompanyID: string; CompanyName: string; OrderHeaderPaymentScheduleID: string | null; InstallmentNumber: number | null; DocumentNumber: string; Amount: number; DueDate: string | null; CustomerName: string; State: 'Unsent' | 'Failed' | 'InFlight'; ExternalInvoiceID: string | null; LastError: string | null; SinceAt: string | null; }
export interface OrdersGetExternalInvoicingWorklistOutput { Success: boolean; Message?: string; Rows: ExternalInvoicingWorklistRow[]; RowCount: number; Truncated: boolean; }
// sweep
export interface OrdersSendExternalInvoicesInput { CompanyIDs?: string[]; MaxCount?: number; Preview?: boolean; RetryTransientFailures?: boolean; }
export interface OrdersSendExternalInvoicesOutput { Success: boolean; Message?: string; Sent: number; Failed: number; Skipped: number; PreviewedOnly: boolean; Results: Array<{ OrderNumber: string; DocumentNumber: string; CompanyID: string; ResultCode: string; Message?: string; ExternalInvoiceRef?: string | null }>; }
// poll
export interface OrdersPollExternalPaymentsInput { PaymentProviderID?: string | null; Preview?: boolean; MaxCount?: number; SinceWatermark?: string | null; }
export interface ExternalPaymentOutcome { ExternalPaymentRef: string; Amount: number; Disposition: 'Captured' | 'Held' | 'Unmatched' | 'Ignored' | 'ReversalNeeded'; Reason: string; PaymentNumber?: string | null; PaymentHeaderID?: string | null; }
export interface OrdersPollExternalPaymentsOutput { Success: boolean; Message?: string; ResultCode: 'COMPLETED' | 'PREVIEWED' | 'ATTENTION' | 'NO_PROVIDERS' | 'ERROR'; Captured: number; Held: number; Unmatched: number; ReversalNeeded: number; Ignored: number; Outcomes: ExternalPaymentOutcome[]; NewWatermarks: Array<{ PaymentProviderID: string; Watermark: string | null }>; PreviewedOnly: boolean; }
```

- [ ] **Step 1: Write the five type-file pairs** exactly as above, each with the repo's header (`NO import statements — definitions are emitted verbatim.`) and a paragraph of intent per file.

- [ ] **Step 2: Write the metadata rows.** Copy the SpawnRenewals row's field set (`Name`, `OperationKey`, `CategoryID: @lookup:MJ: Remote Operation Categories.Name=Payments` — use the category the payment operations already use; check `.orders-remote-operations.json` for `CapturePayment`'s CategoryID and reuse it), `Description`, `InputTypeName`/`InputTypeDefinition: @file:types/…`, `OutputTypeName`/`OutputTypeDefinition`, `ExecutionMode` (`Standard` for Issue/Cancel/Worklist; `LongRunning` for Send/Poll), `RequiredScope: 'payments:write'` (read the scope used by `Orders.CapturePayment` and reuse), `RequiresSystemUser: false`, `GenerationType: Manual`, `CodeApprovalStatus: Approved`, `Status: Active`. Mint five new GUIDs (`uuidgen`) and record them in the file's `_comments` — the Metadata_Sync migration in Task 20 needs them.

- [ ] **Step 3: Push and regenerate** — `mj sync push` (remote-operations dir), then CodeGen → `packages/Entities/src/generated/remote_operations.ts` gains `OrdersIssueExternalInvoiceOperation`, `OrdersCancelExternalInvoiceOperation`, `OrdersGetExternalInvoicingWorklistOperation`, `OrdersSendExternalInvoicesOperation`, `OrdersPollExternalPaymentsOperation` base classes (the generated names follow `Orders<Name>Operation`; verify with `grep -n "class Orders.*External" packages/Entities/src/generated/remote_operations.ts`).

- [ ] **Step 4: Build** `pnpm run build:packages` green. **Step 5: Commit** `feat(orders): remote-operation contracts for Bill.com invoicing and payment polling`.

---

### Task 11: `Orders.IssueExternalInvoice`

**Files:**
- Create: `packages/CoreEntitiesServer/src/IssueExternalInvoiceOperation.ts`
- Modify: `packages/CoreEntitiesServer/src/index.ts`, `packages/Server/src/index.ts`
- Test: `packages/IntegrationTests/src/checks/external-invoicing.checks.ts` (created here; XI1–XI6), `packages/IntegrationTests/src/index.ts`, `packages/IntegrationTests/src/__tests__/registry-parity.test.ts`

**Interfaces:**
- Consumes: `FindInvoiceRailForCompany` (Task 5), `BuildInvoiceDocuments` (PR #220, `InvoiceBuilder.ts`), `DecideInvoiceable`/`BuildExternalInvoicePayload` (Task 8), `EXTERNAL_INVOICE_ENTITY`, `EXTERNAL_CUSTOMER_ENTITY`, `ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY`.
- Produces: `IssueExternalInvoiceOperation` registered as `'Orders.IssueExternalInvoice'`; exported helper `IssueOneUnit(unit, opts, provider, user)` reused by the sweep (Task 14).

- [ ] **Step 1: Write the check bundle skeleton with XI1–XI6 as failing checks** (same shape as `payment-providers.checks.ts`: `NamedCheck[]`, `IntegrationCheckRegistry.Instance.Register`, lifecycle `external-invoicing` with `CreateOrdersFixture`/`TeardownOrdersFixture`). Helpers in the bundle:
  - `makeBillComProvider(ctx)` — like `makeProvider` in `payment-providers.checks.ts`, type code `BillCom`, `IsLiveMode 0`, `CompanyIntegrationID` = a `MJ: Company Integrations` row the fixture creates (or `NULL` — the fake gateway ignores it; but `BillComInvoiceRail.ci()` throws without one, so create a throwaway row pointing at the `Bill.com` integration if present, else skip the check with a clear message).
  - `fakeGateway(script)` — `UseBillComGatewaySeams({...})` returning scripted results and recording calls; reset in `Teardown`.
  - XI1: confirm an order (`ConfirmOrder`) for a company with a BillCom provider → `IssueExternalInvoice` → `Success`, `ResultCode 'SENT'`, an `ExternalInvoice` row `Sent` with `ExternalInvoiceRef='00e1'`, `Amount` = order gross, `ExternalCustomer` row created, order `Balance` unchanged, no new `JournalEntry` for the order since confirm.
  - XI2: second call → `ALREADY_SENT`, same `ExternalInvoiceID`, gateway `create` called zero more times.
  - XI3: a company **without** a BillCom provider → `NO_RAIL`, no rows written (the regression fence).
  - XI4: bill-to organization with no email → `NO_CUSTOMER_EMAIL`, row `Failed` with `LastError`, gateway never called.
  - XI5: gateway invoice read-back `totalAmount` ≠ amount → row `Failed`, gateway `update {archived:true}` was called.
  - XI6: `Preview: true` → `PREVIEWED`, payload returned, zero rows.

- [ ] **Step 2: Run the bundle** (`pnpm run test:integration -- --bundle external-invoicing` or however `test-harnesses/integration.mjs` filters — check its `--help`) → all fail (operation not registered).

- [ ] **Step 3: Implement the operation**

```ts
@RegisterClass(BaseRemotableOperation, 'Orders.IssueExternalInvoice')
export class IssueExternalInvoiceOperation extends OrdersIssueExternalInvoiceOperationBase {
    protected async InternalExecute(input, provider, user) {
        try { return await IssueOneUnit({ OrderHeaderID: RequireUUID(input.OrderHeaderID, 'OrderHeaderID'), CompanyID: input.CompanyID ? RequireUUID(input.CompanyID, 'CompanyID') : null, OrderHeaderPaymentScheduleID: input.OrderHeaderPaymentScheduleID ? RequireUUID(input.OrderHeaderPaymentScheduleID, 'OrderHeaderPaymentScheduleID') : null }, { Preview: !!input.Preview, AllowReissue: !!input.AllowReissue }, provider, user); }
        catch (e) { LogError(`Orders.IssueExternalInvoice failed: ${e}`); return { Success: false, ResultCode: 'ERROR', Message: e instanceof Error ? e.message : String(e) }; }
    }
}
```

`IssueOneUnit` follows spec §5.1 step by step:
1. Load order (`Status`, `OrderNumber`, `CompanyID`, `BillToOrganizationID`, `BillToPersonID`, `ConfirmedAt`). Load schedule rows for the order (PR #220 entity). If a schedule row is named, load it. Resolve `CompanyID`: the named schedule row's, else the input, else the order's single selling company (distinct `OrderLine.CompanyID`). A schedule-less order that sells for more than one company and names none refuses with `NAME_THE_COMPANY`: "This order sells for N companies; name the CompanyID to invoice."
2. `FindInvoiceRailForCompany(companyID)` → null ⇒ `NO_RAIL`.
3. Existing `ExternalInvoice` for `(PaymentProviderID, OrderHeaderID, CompanyID, UnitScheduleKey)` with `Status IN ('Sending','Sent')`, else latest of any status → `DecideInvoiceable`. Map codes to `ResultCode`; `AlreadySent` returns the existing row's fields.
4. `BuildInvoiceDocuments(orderID, provider, user, { OnlyCompanyID: companyID, PaymentScheduleID })` → the one document + its instalment facts (read how PR #220 exposes `InvoiceInstalmentFacts` on the result; if `BuildInvoiceDocuments` returns only documents, call `BuildDocuments` from `InvoiceBehavior` with the same facts the builder loads — mirror how `InvoiceBuilder.ts` does it). `BuildExternalInvoicePayload(doc, inst, invoiceDate = (row?.InvoicedAt ?? order.ConfirmedAt ?? today).slice(0,10))` → `TIE_FAILED` on refusal.
5. `Preview` → `PREVIEWED` with `Payload`.
6. Customer: `ExternalCustomer` lookup by `(PaymentProviderID, party)`; miss → build `RailCustomerFacts` from the bill-to party (Organization `Name`/`Email ?? PrimaryEmail`/`PrimaryAddress*`, or Person `DisplayName`/`Email ?? PrimaryEmail`) → `rail.EnsureCustomer` → on refusal write a `Failed` row (`LastError`) and return `NO_CUSTOMER_EMAIL` when the reason mentions email, else `RAIL_REFUSED`; on success insert `ExternalCustomer`.
7. Insert `ExternalInvoice{Status:'Sending', PaymentProviderID, OrderHeaderID, CompanyID, OrderHeaderPaymentScheduleID, DocumentNumber, Amount, DueDate, ExternalCustomerRef, IssuedByUserID}` via `provider.GetEntityObject(EXTERNAL_INVOICE_ENTITY)`; a save failure whose message mentions `UQ_ExternalInvoice_LiveUnit` ⇒ `IN_FLIGHT`.
8. `rail.IssueInvoice({...payload, ExternalCustomerRef})`. Failure ⇒ row `Failed` + `LastError`, `RAIL_REFUSED`. Success ⇒ `rail.GetInvoice(ref)`; if `|Total − Amount| > 0.005` ⇒ `rail.CancelInvoice(ref)`, row `Failed` with reason, `TIE_FAILED`. Else row `Sent` (`ExternalInvoiceRef`, `SentAt = now`, `ExternalTotal`, `ExternalDueAmount`, `ExternalStatus`, `LastSyncedAt`). If a schedule row: load it, set `ExternalSystem='BillCom'`, `ExternalInvoiceRef`, `SentAt`, save. D-B3: if the order now has exactly one `Sent` row, `UPDATE` `OrderHeader.ExternalDocumentNumber` via the entity (verify `OrderEntityServer.Save` accepts a header-only change on a Confirmed order — if it refuses or re-runs booking, skip D-B3 and note it in the PR).
9. Return `SENT` with all fields.

- [ ] **Step 4: Wire and run** — export, `LoadIssueExternalInvoiceOperation()` anchor, `export * from './checks/external-invoicing.checks.js'` in `IntegrationTests/src/index.ts`, `'external-invoicing': 6` in `registry-parity.test.ts`. Bundle XI1–XI6 green; `pnpm run test:unit` green.

- [ ] **Step 5: Commit** `feat(orders): Orders.IssueExternalInvoice — one billing unit, one Bill.com invoice, once`.

---

### Task 12: `Orders.CancelExternalInvoice`

**Files:**
- Create: `packages/CoreEntitiesServer/src/CancelExternalInvoiceOperation.ts`
- Modify: `index.ts` ×2; `external-invoicing.checks.ts` (XI7–XI10); `registry-parity.test.ts` → 10

- [ ] **Step 1: Checks first** — XI7 cancel a `Sent` unit with no payment → `CANCELED`, row `Canceled` with `CancelReason`, gateway `update {archived:true}` called once, schedule row (when present) `SentAt IS NULL` and `ExternalInvoiceRef IS NULL`, no `JournalEntry` created, order `Status` still `Confirmed`. XI8 capture a check payment against the order first (`payment-builder`) → `HAS_PAYMENT`, gateway not called. XI9 gateway `get` returns `dueAmount < totalAmount` → `PAYMENT_PENDING_ON_RAIL`. XI10 after a cancel, `IssueExternalInvoice` without `AllowReissue` → `HAS_HISTORY`; with it → `SENT`, a second `ExternalInvoice` row.

- [ ] **Step 2: Run** → fail. **Step 3: Implement** per spec §5.2: load row; `PaidAmountOnUnit` = `SUM(PaymentLine.Amount)` joined to `PaymentHeader.Status IN ('Captured','Refunded','Disputed')` filtered by `OrderHeaderID` (+ `OrderHeaderPaymentScheduleID` when set), via `RunView` on `PaymentLine` with `ExtraFilter` using `RequireUUID`; `rail.GetInvoice` → `DecideCancel`; `rail.CancelInvoice`; update row; clear schedule columns; clear D-B3 if `OrderHeader.ExternalDocumentNumber === row.DocumentNumber`.

- [ ] **Step 4: Run** → green. **Step 5: Commit** `feat(orders): Orders.CancelExternalInvoice — archive an unpaid Bill.com invoice, no ledger event`.

---

### Task 13: Native delivery exclusion (#146 AC5)

**Files:**
- Modify: `packages/CoreEntitiesServer/src/DeliveryBehavior.ts` (add `ExternallyInvoiced?: boolean` to `DeliverableFacts`, new code `'EXTERNALLY_INVOICED'`), `DeliveryRecipientResolver.ts` (add `LoadExternallyInvoiced(orderID, companyID, provider, user): Promise<boolean>`), `packages/Server/src/custom/send-document.action.ts` (call it per document in `toFacts`)
- Test: `packages/CoreEntitiesServer/src/__tests__/DeliveryBehavior.test.ts` (add a case), `external-invoicing.checks.ts` XI11

- [ ] **Step 1: Unit test** — `DecideDelivery({ Document: facts({ ExternallyInvoiced: true }), Recipients: [billing('a@b.c')] })` → `Verdict 'Refuse'`, `Code 'EXTERNALLY_INVOICED'`, reason mentions Bill.com and "would be sent twice". **Step 2:** run → fail. **Step 3:** implement: check before `NO_RECIPIENT`. `LoadExternallyInvoiced` returns true when `ExternalInvoice` has a `Sent`/`Sending` row for `(OrderHeaderID, CompanyID)` **or** `FindInvoiceRailForCompany(companyID)` is non-null (D-B11). In `send-document.action.ts`, `toFacts` becomes async or the flag is loaded before the loop per `doc.CompanyID`. **Step 4:** XI11: `Orders.SendDocument` with `PreviewOnly` on a BillCom company reports the document `Sent:false` with `EXTERNALLY_INVOICED`. **Step 5:** commit `fix(orders): native invoice delivery refuses a company invoiced through Bill.com`.

---

### Task 14: Worklist and sweep operations

**Files:**
- Create: `packages/CoreEntitiesServer/src/GetExternalInvoicingWorklistOperation.ts`, `SendExternalInvoicesOperation.ts`
- Modify: `index.ts` ×2; `external-invoicing.checks.ts` (XI12–XI15); `registry-parity.test.ts` → 15

- [ ] **Step 1: Checks** — XI12 worklist lists a confirmed schedule-less order (BillCom company, no history) as `Unsent`, and an `Invoiced` instalment with `SentAt IS NULL` as `Unsent` with its `InstallmentNumber`, and excludes a `Scheduled` instalment, a Draft order, an order with `Balance <= 0`, and a company without a rail. XI13 a `Failed` row appears with `State 'Failed'` only when `IncludeFailed`. XI14 sweep `Preview:true` returns the same rows as the worklist and writes nothing. XI15 sweep with `MaxCount:1` over two unsent units sends one (`Sent:1`), reports `Skipped:1`, and a second sweep sends the other.

- [ ] **Step 2: Implement the worklist** as one SQL-shaped `RunView` pass per source, joined in code (pattern: `GetBillingWorklistOperation.ts`):
  - schedule-less: `OrderHeader` with `Status='Confirmed' AND Balance > 0 AND ID NOT IN (SELECT OrderHeaderID FROM OrderHeaderPaymentSchedule)`, restricted to companies that have an active BillCom provider (`PaymentProvider` rows → set of `CompanyID`); per order, per selling company (distinct `OrderLine.CompanyID`); drop units with any `ExternalInvoice` history (`State 'Unsent'`), report `Sending` rows as `InFlight` and `Failed` as `Failed` when `IncludeFailed`. `DocumentNumber` from `DocumentNumber(orderNumber, companyIndex, companyCount)` (`InvoiceBehavior`).
  - instalments: `OrderHeaderPaymentSchedule` with `Status='Invoiced' AND SentAt IS NULL` whose `CompanyID` has a rail, minus units with live history.
  - `MaxCount` default 200 with the `+1` truncation idiom.

- [ ] **Step 3: Implement the sweep** — worklist (`IncludeFailed: RetryTransientFailures`) → for each row up to `MaxCount`: `Failed` rows only when `ClassifyIssueFailure(LastError) === 'Transient'`; `IssueOneUnit(unit, { Preview, AllowReissue: row.State === 'Failed' })`; tally. `Success:false, Message` naming the failures when any unit failed on a live pass (the renewal action's posture).

- [ ] **Step 4: Run** → green. **Step 5: Commit** `feat(orders): external invoicing worklist and the Send External Invoices sweep`.

---

### Task 15: Action adapter and scheduled job for the sweep

**Files:**
- Create: `packages/Server/src/custom/send-external-invoices.action.ts`, `metadata/actions/.orders-billcom-actions.json`, `metadata/scheduled-jobs/.orders-billcom-scheduled-jobs.json`
- Modify: `packages/Server/src/index.ts`; `packages/Server/src/__tests__/` add `send-external-invoices.action.test.ts`; `external-invoicing.checks.ts` XI16–XI17; parity → 17

- [ ] **Step 1: Unit test** the coercion (copy the shape of the renewal action): `Preview` `"false"` string → live; `"maybe"` → `INVALID_PREVIEW`; `MaxCount` `"0"` → `INVALID_MAX_COUNT`; `CompanyIDs` `"a,b"` (non-UUID) → `INVALID_COMPANY_IDS`.

- [ ] **Step 2: Implement the Action** `@RegisterClass(BaseAction, 'Orders.SendExternalInvoices')`: copy `param/strParam/numParam/supplied/boolParam/setOutput` verbatim from `spawn-renewals.action.ts` (or lift them into `packages/Server/src/custom/action-params.ts` and have both actions import — do this, one file, both callers), route to `new OrdersSendExternalInvoicesOperation().Execute(input, { provider, user })`, outputs `Sent`, `Failed`, `Skipped`, `Results`, `PreviewedOnly`; `Success:false` + `ResultCode 'PARTIAL'` when a live pass left failures.

- [ ] **Step 3: Metadata** — Action row (`Name: 'Send External Invoices'`, `DriverClass: 'Orders.SendExternalInvoices'`, category `Orders`, params `CompanyIDs`, `MaxCount`, `Preview`, `RetryTransientFailures`, each with a description explaining the string-encoding trap) with minted GUIDs; ScheduledJob row `Orders — Send External Invoices (half-hourly, business hours)`, `JobTypeID: 3B94DD43-E961-4D85-B7F4-B6783D748766`, `CronExpression: "0 */30 13-23 * * 1-5"`, `Timezone: UTC`, `Status: Disabled`, `ConcurrencyMode: Skip`, `MissedRunPolicy: RunOnce`, `RunImmediatelyIfNeverRun: false`, `MaxRuntimeMinutes: 20`, notify on failure in-app, `Configuration` with `Preview:"true"`, `MaxCount:"25"`. Copy the renewal job's `_comments` structure and explain the two go-live acts.

- [ ] **Step 4: Checks** XI16 the Action reaches the operation (`Preview:"true"` writes nothing); XI17 the job's `Configuration.ActionID` exists and the job is `Disabled` with `Preview` true (mirror SR14).

- [ ] **Step 5: Run, push metadata (`mj sync push`), commit** `feat(orders): schedule the external-invoice sweep, disabled and set to preview`.

---

# Phase 3 — Inbound payments

### Task 16: `ExternalPayment` and `PaymentProviderSyncState` tables

**Files:** `migrations/V202609261000__v5.15.0__ExternalPayment.sql`; entity-name constants (`EXTERNAL_PAYMENT_ENTITY = 'MJ_BizApps_Orders: External Payments'`, `PAYMENT_PROVIDER_SYNC_STATE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Sync States'`); changeset.

- [ ] Write the DDL from spec §4.3 (idempotent guards, FKs `PaymentProviderID → PaymentProvider`, `PaymentHeaderID → PaymentHeader`, descriptions), apply, CodeGen, fold, build, changeset, commit `feat(orders): ExternalPayment and PaymentProviderSyncState — the poller's ledger and watermark`.

---

### Task 17: `Orders.PollExternalPayments`

**Files:**
- Create: `packages/CoreEntitiesServer/src/PollExternalPaymentsOperation.ts`
- Modify: `index.ts` ×2
- Test: `packages/IntegrationTests/src/checks/external-payments.checks.ts` (XP1–XP9), `IntegrationTests/src/index.ts`, parity `'external-payments': 9`

- [ ] **Step 1: Checks** (fake gateway `fetchChanges` scripted per check; a `Sent` `ExternalInvoice` seeded by calling `IssueExternalInvoice` from Task 11 with the fake):
  - XP1 one cleared payment for one invoice → exactly one `PaymentHeader` (`Status 'Captured'`, `PaymentProviderID` = BillCom row, `IdempotencyKey 'billcom:0rp1'`, tender `ACH`), one `PaymentLine` on the order, order `Balance` reduced, a balanced `JournalEntry` linked to the payment (reuse the ledger query from `payment-providers.checks.ts` PV12), `ExternalPayment` `Captured` with `PaymentHeaderID`.
  - XP2 re-poll same payload → no new `PaymentHeader`, `Ignored`.
  - XP3 payment fanned across two invoices on two orders → one header, two lines, each order reduced by its share; instalment invoice's line carries `OrderHeaderPaymentScheduleID` and the schedule row's `AmountPaid` updates.
  - XP4 one invoice unknown → `Unmatched`, zero headers.
  - XP5 status `SCHEDULED` → `Held`; second poll `PAID` → `Captured`.
  - XP6 captured then `VOID` → `ReversalNeeded`, original header untouched.
  - XP7 `Preview:true` → outcomes listed, zero rows written, watermark unchanged.
  - XP8 watermark advances to max `updatedTime` after a clean pass; not advanced when the gateway throws.
  - XP9 `unappliedAmount > 0` → captured for the applied sum, reason notes the unapplied remainder.

- [ ] **Step 2: Implement** per spec §5.3. Per provider (`PaymentProvider` rows with type `BillCom`, active, or the one named): `ResolveInvoiceRail`; load `PaymentProviderSyncState` (create on first run); `since = SinceWatermark ?? (Watermark ? minusOneDay(Watermark) : null)`; `rail.FetchPaymentsSince(since)`; for each payment (cap `MaxCount`): upsert `ExternalPayment` (`FirstSeenAt` once, `LastSeenAt`, `ExternalStatus`, `Payload = JSON.stringify(Raw)`); `DecideExternalPayment({Status, PriorDisposition})`; on `Capture`: resolve invoice refs → `ExternalInvoice` rows (`Sent`, this provider) → `UnitRef` (join `OrderHeader.BillTo*`); `AllocateInvoicePayments`; `Unmatched` ⇒ disposition + reason; else `new OrdersCapturePaymentOperation().Execute({ Amount: Σ allocations, ReceivingCompanyID: provider.CompanyID, BillToOrganizationID/BillToPersonID, TenderCode: TenderFor(p), PaymentDate: p.PaymentDate?.slice(0,10), Reference: p.ExternalPaymentRef, Notes: \`Bill.com receivable payment ${ref}\`, Allocations: [{OrderHeaderID, Amount}], PaymentDetail: { PaymentProviderID, ReferenceNumber: p.Raw.referenceNumber }, IdempotencyKey: ExternalPaymentIdempotencyKey('BillCom', ref), Preview }, { provider, user })`. **Check `OrdersCapturePaymentAllocationInput` for an `OrderHeaderPaymentScheduleID` field** (PR #220 added `PaymentLine.OrderHeaderPaymentScheduleID`; if the capture input does not carry it, add it to `orders-capture-payment.input.ts` + `CapturePaymentOperation.writePayment` in this task — nullable, passed straight through to the `PaymentLine`). On capture success: disposition `Captured`, `PaymentHeaderID`; a `WasRetry` result is `Ignored`. Refresh `ExternalInvoice.ExternalDueAmount/ExternalStatus/LastSyncedAt` for the invoices touched via `rail.GetInvoice`. After the loop with no thrown fault: write `Watermark = NewWatermark ?? Watermark`, `LastSucceededAt`; on fault write `LastError` only. `ResultCode 'ATTENTION'` + `Success:false` when `Unmatched + ReversalNeeded > 0` on a live pass.

- [ ] **Step 3: Run** → green (unit + bundle). **Step 4: Commit** `feat(orders): Orders.PollExternalPayments — capture cleared Bill.com payments once, through CapturePayment`.

---

### Task 18: Action adapter and scheduled job for the poller

**Files:** `packages/Server/src/custom/poll-external-payments.action.ts` (+ unit test), append to `metadata/actions/.orders-billcom-actions.json` and `metadata/scheduled-jobs/.orders-billcom-scheduled-jobs.json`; `external-payments.checks.ts` XP10–XP11 (Action reaches operation in preview; job row sane); parity → 11.

- [ ] Implement like Task 15 (shared `action-params.ts`), Action `Orders.PollExternalPayments` with params `PaymentProviderID`, `Preview`, `MaxCount`, `SinceWatermark`; outputs `Captured`, `Held`, `Unmatched`, `ReversalNeeded`, `Outcomes`, `PreviewedOnly`; `Success:false, ResultCode 'ATTENTION'` when the operation says so. Job `Orders — Poll External Payments (hourly)`, cron `0 15 * * * *`, `Disabled`, `Preview:"true"`, `MaxCount:"100"`, `MaxRuntimeMinutes: 30`. Push, run, commit `feat(orders): schedule the Bill.com payment poll, disabled and set to preview`.

---

# Phase 4 — UI and release

### Task 19: Angular — order form panel, Bill.com queue page, Billing worklist column

**Files:**
- Create: `packages/Angular/src/lib/panels/external-invoices-panel.component.ts` (standalone; used inside `custom/OrderHeader/order-header-form.component.html`)
- Create: `packages/Angular/src/lib/pages/receivables/billcom-queue.page.ts`
- Modify: `packages/Angular/src/lib/sections/section-nav.model.ts` + `orders-sections.component.ts` (`resolvePage` case) — rail entry "Bill.com queue" under Receivables; `packages/Angular/src/lib/pages/receivables/billing.page.ts` (add `Sent` column reading the schedule row's `SentAt`); `public-api.ts`
- Test: `packages/Angular/src/lib/sections/__tests__/rail-coverage.test.ts` (auto-covers the new rail entry), `packages/Angular/src/lib/panels/__tests__/external-invoices-panel.test.ts` (render states)

- [ ] **Step 1: Panel** — inputs `orderID`; loads `ExternalInvoice` rows via `RunView` (`EXTERNAL_INVOICE_ENTITY`, `ExtraFilter` on `OrderHeaderID`), shows `DocumentNumber`, `Status`, `ExternalInvoiceRef`, `SentAt`, `LastError`; buttons **Send to Bill.com** (`new OrdersIssueExternalInvoiceOperation().Execute({ OrderHeaderID, CompanyID, OrderHeaderPaymentScheduleID, AllowReissue })` — shown when the company has a rail and the unit is unsent/canceled/failed; confirm dialog via `MJConfirmService`) and **Cancel in Bill.com** (`OrdersCancelExternalInvoiceOperation`, prompts for `Reason`). Hidden entirely when the panel's first load finds no rail for any of the order's companies (call `Orders.GetExternalInvoicingWorklist`? No — expose rail presence cheaply: `RunView` on `PaymentProvider` with `IsActive=1` and the BillCom type, same subquery as `FindInvoiceRailForCompany`). Plain-English copy (golive #210 precedent).
- [ ] **Step 2: Queue page** — two tabs: *Unsent invoices* (`OrdersGetExternalInvoicingWorklistOperation`, `IncludeFailed: true`, row action Send) and *Payment exceptions* (`RunView` on `EXTERNAL_PAYMENT_ENTITY` with `Disposition IN ('Held','Unmatched','ReversalNeeded')`, columns ref/amount/date/status/reason, link to the ScheduledJobRun is not needed). A **Run now** button per tab calls the sweep/poll operation with `Preview:false` behind a confirm.
- [ ] **Step 3: Billing worklist** — add a `Sent` column (`SentAt` formatted, or "—").
- [ ] **Step 4:** `pnpm run build` (Angular) and `pnpm run test:unit` green; screenshots of the panel and queue in the PR. Commit `feat(orders-ng): Bill.com panel on the order, and the Bill.com queue page`.

---

### Task 20: Release plumbing

**Files:** `migrations/V2026MMDDHHMM__v5.14.0__BillCom_Metadata_Sync.sql`; changesets; `aidp-next` PR.

- [ ] **Step 1: Metadata_Sync migration** generated from a **fresh** database per `docs/database-migrations.md` (a push against a dev DB emits `spUpdate*`, which the generator refuses). It must carry: the `BillCom` provider type row, five remote operations, two Actions with params, two scheduled jobs — each guarded on ID **or** natural key (the V202609041700 pattern). Run `node scripts/check-release-seed-coverage.mjs` → zero undeclared.
- [ ] **Step 2: Changesets** `minor` on entities, core-entities-server, server, ng; `pnpm run verify` green.
- [ ] **Step 3: Host PR in `aidp-next`** (upstream ask U3): add `"@memberjunction/connector-bill-com": "0.3.1"` to `apps/MJAPI/package.json`; document the per-company setup runbook in `plans/`: create `MJ: Credentials` (type `Bill.com Session`, sandbox first), `MJ: Company Integrations` (Integration `Bill.com`, `CompanyID`), then the Orders `PaymentProvider` row (`BillCom`, `CompanyIntegrationID`, `IsLiveMode 0`), then enable the two jobs in Preview and read one run with Finance before flipping Preview.
- [x] **Step 4: Upstream asks** filed as issues on `MemberJunction/Integrations`: [#391](https://github.com/MemberJunction/Integrations/issues/391) archive verb (S1 failed, so it was needed) and [#390](https://github.com/MemberJunction/Integrations/issues/390) the double `/v3` plus array-shaped errors, both fixed by PR [#392](https://github.com/MemberJunction/Integrations/pull/392) (CI green, awaiting review). U2 (watermark filter) is not filed — the full-scan fallback is adequate at current volumes. Linked from the spike results doc.
- [ ] **Step 5: Commit** and open the Orders PR referencing golive #146, #147, #148, #242, with the spec, the spike results and the verification section (bundle counts, unit counts, sandbox end-to-end run log).

---

## Self-review

**Spec coverage.** §4.1 units → Task 11/14; D-B1 decoupled sends → Tasks 11, 14, 15; §4.2 components → Tasks 3–6, 8–9, 11–18; §4.3 tables → Tasks 2, 7, 16; D-B2 schedule stamping → Task 11 step 8 / Task 12; D-B3 → Task 11 (best effort, verified); D-B4 config → Tasks 2, 5; §5.1 → Task 11; §5.2 → Task 12; D-B7 → Tasks 11, 12, 14; §5.3 incl. D-B8/9/10 → Task 17; §5.4 D-B11 → Task 13; §6 jobs → Tasks 15, 18; §7 guards → Tasks 7 (indexes), 11 (`Sending`, `IN_FLIGHT`), 17 (idempotency key, watermark); §8 → global constraints; §9 tests → each task; §10 U1–U3 → Tasks 1, 6, 20; §11 phases → the four parts. **Gap:** the spec's "Reconcile" action for stuck `Sending` rows (§7) has no task — deliberately deferred; the queue page shows `InFlight` rows with age, and a person marks them `Failed` through the entity form. Noted for the PR.

**Type consistency.** `RailResult<T>`, `RailInvoiceFacts`, `RailPaymentRecord` (Task 4) are what Task 6 implements and Tasks 11/17 consume; `ExternalPaymentDisposition` values match the `CK_ExternalPayment_Disposition` list (Task 16) and `ExternalPaymentOutcome.Disposition` (Task 10); `DecideInvoiceable` codes are a subset of `OrdersIssueExternalInvoiceOutput.ResultCode`; `NAME_THE_COMPANY` is decided in the operation (Task 11), not the pure module, because it needs the order's line companies. `ExternalInvoicingWorklistRow.State` values (`Unsent | Failed | InFlight`) match Task 14.
