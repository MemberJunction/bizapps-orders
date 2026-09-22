# Bill.com sandbox spike results (2026-09-21)

Run with `test-harnesses/billcom-live.mjs` against the BILL stage sandbox, through
`@memberjunction/connector-bill-com` 0.3.1, from the `MJ_BizAppsSales_QA` configuration
(Company Integration `EAA2E453-FEA6-4DBD-B852-9148E482A162`, credential type `Bill.com Session`,
`environment: sandbox`). Every call below went through the connector's own session; nothing was
hand-crafted outside it except where the row says "raw".

| Spike | Question | Observed | Decision |
|---|---|---|---|
| — | Does the encrypted `MJ: Credentials` row resolve through `ConnectorFactory`? | `TestConnection` → `Connected to Bill.com at https://gateway.stage.bill.com/connect/v3`. Field-level decryption with `MJ_BASE_ENCRYPTION_KEY` worked from a second process. | Credential entry through Explorer is the supported path. Any process that reads it needs the same key. |
| — | Do the generic verbs reach BILL? | **No, not as shipped.** `CreateRecord('customers')` → 404. The connector's base URL ends in `/connect/v3` and the seeded `IntegrationObject` paths begin with `/v3/…`; `BuildFullURL` concatenates → `/connect/v3/v3/customers`. Login works only because it builds `${base}/login` itself. | **Connector defect (new upstream ask U3).** QA workaround: stripped the `/v3` prefix from `APIPath`/`CreateAPIPath`/`UpdateAPIPath` on the three Bill.com objects. A fresh host reproduces the 404 until Integrations fixes the catalog or `BuildFullURL`. |
| — | Is the engine's object cache loaded on the connector path? | No — `IntegrationObject not found: "customers"` against a fully seeded database. Nothing between `ConnectorFactory.Resolve` and `CreateRecord` calls `IntegrationEngineBase.Instance.Config()`. | `BillComGateway.connectorFor` now calls `Config(false, user, provider)` (no-op once loaded). |
| S1 | Does `PUT /invoices/{id} {archived:true}` archive? | **400**: `customer: must not be null; invoiceLineItems: must not be null` — PUT is a full replace. Raw `POST /invoices/{id}/archive` → **200**, `archived: true`, `recordStatus: INACTIVE`, `status` stays `OPEN`; a second POST is also 200 (idempotent). | `CancelInvoice` uses the archive verb via `BillComGateway.archiveInvoice`, which borrows the connector's protected session helpers (spec §10 U1 "last resort"). Swap to a connector verb when U1 lands. |
| S2 | `receivable-payments` status vocabulary | Sandbox has no payments yet: `count: 0`. `statuses`, `onlinePayment`, `receivablesType` unobserved. | `BILLCOM_PAYMENT_STATUS` stays provisional. **Robert:** record a customer payment in the sandbox UI against invoice `00e01DYPWKVDNSX9w76e` (PROBE-1790039330190, $250.25), then re-run `BILLCOM_PROBE=payments` before and after it clears. |
| S3 | Fetch cost | Empty fetch round trip 1.5 s (login + one page). `newWatermark: null` on an empty result. | Hourly poll is fine. `NewWatermark` null on empty pages is already handled (`processedMax` keeps the prior watermark). |
| S4 | Duplicate `invoiceNumber`; line item field names; total tie | Duplicate → **422** refused. Lines `{description, price, quantity, taxable}` accepted; BILL adds `id` per line. `totalAmount` 250.25 = 2×100 + 1×50.25 exactly; `dueAmount` 250.25, `scheduledAmount` 0, `creditAmount` 0, `salesTaxTotal` 0. `customerId` is returned on read even though `customer: {id}` is what create takes. | Re-issue after a cancel **cannot reuse** the number: the archived invoice still owns it. Task 12's re-issue numbering must suffix (`ORD-1234-R1`) or BILL refuses. Tie check at 0.005 holds. |
| S5 | Does creating an invoice email the customer? | No sent/emailed indicator appears on the record after create or on re-read; `invoicePdfId` is the zero id. The probe customer's `example.com` mailbox is unobservable. | Treat create as **draft-in-BILL** (D-B12 stands: the human gate is BILL's Send). Confirm once with a real mailbox before go-live. |

## Sandbox records created

| Kind | ID | Note |
|---|---|---|
| customer | `0cu01EJKMVESMIG418ak` | "Probe 1790039212683", email probe+…@example.com |
| invoice | `00e01DYPWKVDNSX9w76e` | PROBE-1790039330190, OPEN, $250.25 — **use this one for the S2 payment** |
| invoice | `00e01PYJIMJEHEO9w76i` | PROBE-1790039425104, archived by the S1 probe |

## What changed because of these results

- `packages/CoreEntitiesServer/src/BillComGateway.ts`: `connectorFor` loads the engine cache; new seam
  `archiveInvoice`; `billComErrorText` reads BILL's array-shaped errors.
- `packages/CoreEntitiesServer/src/BillComInvoiceRail.ts`: `CancelInvoice` → archive verb.
- `test-harnesses/billcom-live.mjs`: loads the engine cache; new `archive-post` probe.
- Root/CoreEntitiesServer: `@memberjunction/connector-bill-com`, `integration-engine`,
  `integration-engine-base` added (dev at root, runtime for the server package's `integration-engine-base`).
- QA database only: `/v3` prefix removed from the three Bill.com `IntegrationObject` rows.

## Upstream asks after this run

| # | Where | Ask |
|---|---|---|
| U1 — [#391](https://github.com/MemberJunction/Integrations/issues/391), fixed in PR [#392](https://github.com/MemberJunction/Integrations/pull/392) | Integrations `Finance/BillCom` | `ArchiveInvoice`/`RestoreInvoice` verbs (the catalog already declares `archivePath`/`restorePath`; nothing calls them). |
| U2 — not filed | Integrations / engine | Honour `WatermarkValue` in `FetchChanges`. Unchanged. |
| U3 — [#390](https://github.com/MemberJunction/Integrations/issues/390), fixed in PR [#392](https://github.com/MemberJunction/Integrations/pull/392) | Integrations `Finance/BillCom` | Fix the double `/v3`: either seed paths without the version prefix (base URL owns it) or override `BuildFullURL` to collapse `/v3/v3/`. Also read array-shaped error bodies in `ExtractErrorMessage`. |
