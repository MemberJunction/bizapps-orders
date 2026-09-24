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
| S2 | `receivable-payments` status vocabulary | **Answered 2026-09-22.** Robert recorded an offline check in the sandbox; the poll returned one payment, `status: "PAID"`, `receivablesType: "CHECK"`, `onlinePayment: false`, `referenceNumber: "1234"`, `fundingAccount: {}`, `receivablesAccount.id` all-zeros. BILL's reference documents the **whole** enum: status is `PAID`, `VOID`, `SCHEDULED`, `CANCELED`, `ESCHEATED`, `UNDEFINED`; `receivablesType` is `CASH`, `CHECK`, `CREDIT_CARD`, `ACH`, `PAYPAL`, `OTHER`, `WALLET`, `VIRTUAL_CARD`, `UNDEFINED`. | `BILLCOM_PAYMENT_STATUS` rewritten to those six, dropping ten invented keys and adding `ESCHEATED` → Reversed. `UNDEFINED` deliberately unmapped so it Holds. `TenderFor` rewritten: see the two rows below. |
| S3 | Fetch cost | Empty fetch round trip 1.5 s (login + one page). `newWatermark: null` on an empty result. | Hourly poll is fine. `NewWatermark` null on empty pages is already handled (`processedMax` keeps the prior watermark). |
| S4 | Duplicate `invoiceNumber`; line item field names; total tie | Duplicate → **422** refused. Lines `{description, price, quantity, taxable}` accepted; BILL adds `id` per line. `totalAmount` 250.25 = 2×100 + 1×50.25 exactly; `dueAmount` 250.25, `scheduledAmount` 0, `creditAmount` 0, `salesTaxTotal` 0. `customerId` is returned on read even though `customer: {id}` is what create takes. | Re-issue after a cancel **cannot reuse** the number: the archived invoice still owns it. Task 12's re-issue numbering must suffix (`ORD-1234-R1`) or BILL refuses. Tie check at 0.005 holds. |
| S2a | Is `status` the object the design assumed? | **No — a bare string.** `"status": "PAID"`, not `{value: …}`. §2 of the design said otherwise. | No code change: the `str()` helper already flattened both shapes, which is why this cost nothing. The design text is corrected. |
| S2b | Does the tender mapping survive the real enum? | **No.** The old `TenderFor` short-circuited on `onlinePayment === true` and answered ACH, which would book an online card payment to the bank. It also branched on `WIRE`, which BILL cannot emit, and sent `CASH` to ACH although Orders has a `Cash` payment type. | `receivablesType` is now read first and `onlinePayment` only breaks a tie. `CASH`→Cash, `CHECK`→Check, `CREDIT_CARD`/`VIRTUAL_CARD`→CreditCard, `ACH`→ACH. `PAYPAL`/`WALLET`/`OTHER`/`UNDEFINED` still fall to ACH — **spec §12 q6, open for Finance**. Orders' `Wire` tender is unreachable from this rail. |
| S2c | Does the poller work end to end on a real payment? | Yes. `Orders.PollExternalPayments` preview read the payment, classified `PAID` as cleared, and returned `Unmatched` because invoice `00e01DYPWKVDNSX9w76e` was created by the probe, not issued by Orders. Watermark advanced to `2026-09-22T13:04:32.000Z`, computed locally from `updatedTime` since the connector returns none (U2). | Correct behaviour on all three counts. The capture leg is still unproven: it needs a payment against an invoice Orders issued, which needs a Confirmed order in QA. |
| S2d | **Capture leg, end to end** | Proven 2026-09-22. Order ORD-000004 confirmed ($27,480) → `Orders.IssueExternalInvoice` sent it as `00e01WGECMZLQUY9w8ow` under customer `0cu01OACCDDJTTL418im` → payment recorded in BILL → live poll captured it as `PAY-000001`. `PaymentType` resolved to **Check** from `receivablesType: CHECK`, proving the rewritten `TenderFor`. Order rollup went to paid 27,480 / balance 0.00. Two balanced journal entries: DR AR / CR Sales on confirm, DR Cash / CR AR on capture, so AR nets to zero. | The whole rail is now proven live: issue, poll, match, capture, book. |
| S2e | Is the capture idempotent? | Re-polled from a January watermark. The captured payment was skipped, not re-captured; one PaymentHeader, one PaymentLine, two journal entries. The unrelated probe payment stayed `Unmatched`, so `ATTENTION` is still returned. | Idempotency holds on a real second pass, not just in unit tests. |
| S5 | Does creating an invoice email the customer? | No sent/emailed indicator appears on the record after create or on re-read; `invoicePdfId` is the zero id. The probe customer's `example.com` mailbox is unobservable. | Treat create as **draft-in-BILL** (D-B12 stands: the human gate is BILL's Send). Confirm once with a real mailbox before go-live. |

## Sandbox records created

| Kind | ID | Note |
|---|---|---|
| customer | `0cu01EJKMVESMIG418ak` | "Probe 1790039212683", email probe+…@example.com |
| invoice | `00e01DYPWKVDNSX9w76e` | PROBE-1790039330190, OPEN, $250.25 — **use this one for the S2 payment** |
| invoice | `00e01PYJIMJEHEO9w76i` | PROBE-1790039425104, archived by the S1 probe |
| invoice | `00e01WGECMZLQUY9w8ow` | ORD-000004, $27,480, issued by Orders — the capture-leg invoice |
| customer | `0cu01OACCDDJTTL418im` | Cascade Manufacturing, created by `EnsureCustomer` |
| payment | `0rp01NTDSOUKIBE5q418` | $27,480 CHECK against the Orders invoice; captured as PAY-000001 |
| payment | `0rp01ZVRQWXFUAC5q414` | Offline CHECK, $250.25, PAID, against `00e01DYPWKVDNSX9w76e`. Cannot be voided: v3 has no endpoint that transitions a `0rp` to VOID or CANCELED. |

## What changed because of these results

- `packages/CoreEntitiesServer/src/BillComGateway.ts`: `connectorFor` loads the engine cache; new seam
  `archiveInvoice`; `billComErrorText` reads BILL's array-shaped errors.
- `packages/CoreEntitiesServer/src/BillComInvoiceRail.ts`: `CancelInvoice` → archive verb.
- `packages/Entities/src/ExternalPaymentBehavior.ts`: `BILLCOM_PAYMENT_STATUS` cut to BILL's six documented
  values plus `ESCHEATED`; `TenderFor` rewritten around the real `receivablesType` enum.
- `packages/CoreEntitiesServer/src/IssueExternalInvoiceOperation.ts`: stopped case-folding the selling
  company id (see below).
- `packages/CoreEntitiesServer/src/InvoiceBehavior.ts`: `OnlyCompanyID` now matches with `UUIDsEqual`.
- `test-harnesses/confirm-order.mjs` (new) and `billcom-live.mjs`: register the accounting and common
  entity classes and accounting's server classes; new `record-payment` probe.

## The bug the capture leg found

`IssueOneUnit` lower-cased the order lines' `CompanyID` when deduplicating them, then passed that value on
as the unit's company. `BuildDocuments` filtered its output with `d.CompanyID === OnlyCompanyID`, a
case-sensitive comparison against the database's uppercase ids, so it returned nothing and the caller
reported **"Order ORD-000004 has no lines sold by company …"**. The message names missing data; the cause
was a case fold. It would have failed every single-company send against SQL Server.

Both halves are fixed: the operation keeps the database's casing, and the filter uses `UUIDsEqual`, because
a UUID comparison must not care about case. The case-sensitive filter predates this work (2026-07-31); the
lower-casing that fed it does not.

## What this needed in the QA environment, and why it is not a product defect

Confirming an order books through accounting, and the bare harness had registered only Orders' classes. With
the accounting and common entity classes unregistered, MJ fell back to plain `BaseEntity`, every typed field
read `undefined`, and the engine's 27 cached GL account links matched nothing — which surfaced as
`No GL account is linked for role 'Accounts Receivable'`. The configuration was correct all along. MJAPI
loads these packages through `mj.config.cjs`, so only standalone scripts need the explicit loaders now in
both harnesses. Cascade Manufacturing also needed a billing email, which the rail correctly refuses without.
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
