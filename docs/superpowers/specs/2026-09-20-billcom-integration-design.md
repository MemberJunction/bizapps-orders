# Bill.com integration for Orders — design

**Date:** 2026-09-20 · **Author:** Claude (for Robert Kihm) · **Status:** DRAFT, awaiting Robert's review
**Stories:** golive #146 (O-US6 invoice), #147 (O-US7 cancel), #148 (O-US8 payment polling), #242 (trigger hazard)
**Depends on:** bizapps-orders PR #220 (`OrderHeaderPaymentSchedule`, golive #239) · `@memberjunction/connector-bill-com` 0.3.1

> **How to read this.** Robert was away while this was drafted, so every place where a
> colleague would normally have asked a question is written as a **Decision** with the reasoning,
> and collected again in §12 as **open questions**. Nothing here is implemented. The companion
> implementation plan is `docs/superpowers/plans/2026-09-20-billcom-integration.md`.

---

## 1. Scope

Three behaviours, all Orders-side. The connector half is done and published.

| # | Behaviour | Story |
|---|---|---|
| A | When a billing unit becomes invoiceable, create the invoice in Bill.com and record the Bill.com reference against the unit. | #146, #242 |
| B | Cancel (archive) a Bill.com invoice on a unit with no payment recorded, and let it be re-issued. | #147 |
| C | Poll Bill.com for receivable payments, and capture each cleared payment once, against the orders its invoices belong to, through `Orders.CapturePayment`. | #148 |

"Billing unit" is defined in §4.1. It is what reconciles Robert's brief ("when an order is locked,
create the invoice") with issue #242 ("the trigger must be the schedule row, not the order").

**Out of scope:** refunds via Bill.com (descoped, #149 — v3 has no AR refund endpoint), access
gating on payment (#223), the Unbilled Receivable ledger change (#240), Business Central invoicing,
sending the invoice *email* from Bill.com (see D-B12), Stripe.

---

## 2. What exists today (verified 2026-09-20)

**In `bizapps-orders` (`next`):**
- "Locked" is `OrderHeader.Status = 'Confirmed'`. There is no lock flag or lock operation; the
  transition is `Status = 'Confirmed'; Save()` and it is terminal (`OrderStatusBehavior.ts:67`).
  Booking, subscriptions, entitlements and the initial payment all happen inside one transaction in
  `OrderEntityServer.Save` (L446–618). **Nothing in that transaction calls the network**, only
  `Accounting.CreateJournalEntries` through the class factory.
- Delivery seam: `BaseDeliveryChannel` → one channel, `Email`. The channel contract carries a
  **rendered HTML document plus recipients**, not structured invoice data
  (`BaseDeliveryChannel.ts:37–82`). `Orders.SendDocument` is the composer; it is not idempotent and
  **nothing calls it** (no Angular caller, no job). `DeliveryChannelCode` is the closed union `'Email'`.
- Payment seam: `BasePaymentProvider` with `Stripe`, `StripeACH`, `Manual`, `StoredValue`. The
  `PaymentProvider` row is **per company** (`CompanyID`, `CredentialsRef`, `IsLiveMode`, `IsActive`) and
  `PaymentProviderType.Code` is the class-factory key. Inbound money arrives only via the Stripe
  webhook (`PaymentWebhookHandler`); there is no poller anywhere.
- Capture: `Orders.CapturePayment` writes `PaymentHeader` + `PaymentLine` in one transaction, mints
  the payment number, and `PaymentHeaderEntityServer.Save` books the cash-leg journal entry.
  Rollups (`Balance`, `PaymentStatus`) are trigger-maintained. Idempotency: `PaymentHeader.IdempotencyKey`
  with unique index `UX_PaymentHeader_IdempotencyKey`.
- Scheduling: MJ's scheduler dispatches Actions. The repo's pattern is remote operation → thin
  Action adapter → `MJ: Scheduled Jobs` row that ships **Disabled and in Preview**
  (`spawn-renewals.action.ts`, PR #217).
- `OrderHeader.ExternalDocumentNumber` (nvarchar 80, free-form, not unique) exists "for bill.com sync"
  and nothing writes it.
- **No Bill.com code, metadata row or package dependency.** Prior art (master plan D77) dropped
  Bill.com as a *payment rail* in favour of Stripe; it was retained as a downstream sync target.

**In PR #220 (open, Craig, branch `aidp-24`):** `OrderHeaderPaymentSchedule` with
`ExternalSystem`, `ExternalInvoiceRef`, `SentAt` reserved for this work; `Orders.IssueInstalmentInvoice`
(freezes `DocumentNumber`, idempotent); `Orders.GetBillingWorklist`; per-instalment document via
`InvoiceInstalmentFacts` / `ImplicitInstalment`; `PaymentLine.OrderHeaderPaymentScheduleID`. The
immutability trigger permits `ExternalSystem`/`ExternalInvoiceRef`/`SentAt` edits on an `Invoiced` row.

**In the connector (`MemberJunction/Integrations`, `Finance/BillCom`, published 0.3.1):**
- Peer range is now `>=5.43.0 <7.0.0`, so Andrew's 5.x/6.x concern (#146 comment) is resolved.
- `BillComConnector extends BaseRESTIntegrationConnector`, registered as
  `'@memberjunction/connector-bill-com'`. It owns session login, 25-minute proactive re-login,
  rate limiting and the sandbox/production base URL. **It has no domain methods.** Consumers use the
  engine's generic `CreateRecord` / `UpdateRecord` / `GetRecord` / `FetchChanges` with a
  `MJ: Company Integrations` row, which is where credentials (`Bill.com Session` type: username,
  password, organizationId, devKey, environment, apiUrl) are resolved from.
- Objects: `customers` (create needs `name`, `email`), `invoices` (create **must** send
  `customer: {id}` and must not send `customerId`; totals are `totalAmount`, `dueAmount`,
  `scheduledAmount`, `creditAmount`; there is no `paidAmount`), `receivable-payments` (`0rp`;
  `invoicePayments[] = {invoiceId, amount, paymentDate}`; `status` is an object whose values are not
  in the catalog; `onlinePayment` distinguishes money moved by BILL from money recorded in BILL).
- Verified live in a sandbox: customer create, invoice create, invoice archive (`POST
  /v3/invoices/{id}/archive`, idempotent), read paths and the `updatedTime` filter. **Not verified:**
  receivable-payment create (we do not need it), any production write.
- **Gaps that matter to us:** (1) archive/restore is declared only in free-form metadata, there is
  no connector verb, `DeleteRecord` throws; (2) `FetchChanges` never applies the watermark filter, so
  an incremental read is a full re-scan today; (3) only three Actions ship (Get/Create/Update
  Invoices) — none for customers or payments; (4) the scheduler-driven sync engine needs an MJ
  landing entity plus entity maps, which Orders does not have.

**In the host (`aidp-next`):** `mj.config.cjs` lists `@memberjunction/connector-bill-com` as an
enabled dynamic package, but `apps/MJAPI/package.json` does not depend on it, and there is no
`MJ: Company Integrations` row for Bill.com. Orders is installed at 5.12.2.

---

## 3. Approaches considered

**A. Bill.com as a second `BaseDeliveryChannel`** (issue #242's stated preference). Reuses
`Orders.SendDocument`. Rejected as the primary shape: the channel contract is HTML plus email
recipients; Bill.com needs structured facts (customer party, amount, due date, line items, the unit's
frozen number) and returns a reference we must persist. `SendDocument` is also not idempotent, has
no caller, and its "no billing contact → refuse" rule is wrong for a rail that has its own customer
record. Making the channel carry structured facts and skip recipient resolution would leave a
channel that behaves like nothing else registered under that base. #242 itself allows the
alternative: "if Bill.com has to be a batch push, read the billing worklist and write back per row".

**B. Bill.com invoicing inside the confirm transaction** (Robert's brief taken literally). Rejected:
`OrderEntityServer.Save` deliberately makes no network calls; a Bill.com timeout would roll back a
booking, and once instalments exist the whole term would be invoiced on day one (#242's hazard).

**C. An `InvoiceRail` seam parallel to `BasePaymentProvider`, driven by a worklist of invoiceable
units, with the per-company configuration on the existing `PaymentProvider` row, and a poller that
lands cash through `Orders.CapturePayment`.** **Recommended, and what follows.** It reuses the
per-company provider row, the class-factory registration idiom, the operation → Action → job shape,
and the single capture path, and it leaves the Email channel and `SendDocument` untouched except for
one refusal.

---

## 4. Design

### 4.1 The billing unit

A **billing unit** is what one Bill.com invoice represents: `(OrderHeaderID, CompanyID,
OrderHeaderPaymentScheduleID | null)`.

- An order **with** a schedule has one unit per schedule row. The unit becomes invoiceable when
  `Orders.IssueInstalmentInvoice` has advanced the row to `Invoiced` (which freezes its
  `DocumentNumber`). That is the "schedule row enters the billing window" trigger of #242, and it is
  already gated by the Billing worklist.
- An order **without** a schedule has one unit per selling company (PR #220's
  `ImplicitInstalment`), and it becomes invoiceable at `Confirmed`. For these orders "locked" and
  "invoiceable" coincide exactly, as #242 requires.

**D-B1.** The Bill.com send is decoupled from both events. Neither `OrderEntityServer.Save` nor
`IssueInstalmentInvoice` calls Bill.com. Instead, invoiceable-and-unsent units are a *query*, and
`Orders.SendExternalInvoices` works that query — on a schedule, and on demand from the UI. This is
what makes the send retryable, previewable, and safe to run twice.

### 4.2 Components (all in `packages/CoreEntitiesServer` unless noted)

| Component | Kind | Purpose |
|---|---|---|
| `BaseInvoiceRail` | class-factory base | `EnsureCustomer`, `IssueInvoice`, `GetInvoice`, `CancelInvoice`, `FetchPaymentsSince`. Registered under the `PaymentProviderType.Code`, same idiom as `BasePaymentProvider`. |
| `BillComInvoiceRail` | `@RegisterClass(BaseInvoiceRail, 'BillCom')` | Maps our facts to BILL's wire shapes and back. Talks only to `BillComGateway`. |
| `BillComGateway` | seam | Thin wrapper over the connector: `ConnectorFactory.Resolve(integration)` then `CreateRecord` / `GetRecord` / `UpdateRecord` / `FetchChanges` with the company's `MJ: Company Integrations` row. Swappable via `UseSeams()` for tests (precedent: `AccountingERPEngine`). |
| `BillComPaymentProvider` | `@RegisterClass(BasePaymentProvider, 'BillCom')` | Minimal. Refuses `CreateIntent`/`Capture`/`Refund` ("Bill.com is not a checkout rail"), `SettlesAsynchronously = false`. Exists so the `BillCom` type row resolves, and so captured payments can carry `PaymentProviderID`. |
| `InvoiceRailResolver` | function | `ResolveInvoiceRail(paymentProviderID)` → loads the `PaymentProvider` row, resolves the rail class by type code, attaches the `CompanyIntegrationID`. Refuses the base class like `PaymentProviderResolver` does. |
| `ExternalInvoiceBehavior` | pure module (`packages/Entities`) | `DecideInvoiceable`, `BuildExternalInvoicePayload`, `DecideCancel`, `ExternalInvoiceIdempotencyKey`. No I/O. |
| `ExternalPaymentBehavior` | pure module (`packages/Entities`) | `DecideExternalPayment` (status → `Capture` / `Hold` / `Ignore` / `Reversal`), `AllocateInvoicePayments` (fan-out to units), `ExternalPaymentIdempotencyKey`. No I/O. |
| `Orders.IssueExternalInvoice` | remote operation | One unit → one Bill.com invoice (§5.1). |
| `Orders.CancelExternalInvoice` | remote operation | Archive + local record (§5.2). |
| `Orders.GetExternalInvoicingWorklist` | remote operation | Invoiceable-and-unsent units plus failed sends, for the UI and the sweep. |
| `Orders.SendExternalInvoices` | remote operation | The sweep: worklist → `IssueExternalInvoice` per unit, `Preview`, `MaxCount`. |
| `Orders.PollExternalPayments` | remote operation | The poller (§5.3). |
| `Orders: Send External Invoices`, `Orders: Poll External Payments` | Actions (`packages/Server/src/custom`) | Thin scheduler adapters, copied from `spawn-renewals.action.ts` including its string-param coercion. |
| Two `MJ: Scheduled Jobs` rows | metadata | Ship **Disabled + Preview**, like the renewal job. |
| Angular | `packages/Angular` | Order form panel "Bill.com"; Receivables rail page "Bill.com queue" (unsent, failed, held payments); a `Sent` column on the Billing worklist. |

### 4.3 Data model — new `V` migration(s), never the baseline

```sql
-- Per-company configuration: which MJ Company Integration this provider row uses.
ALTER TABLE PaymentProvider ADD CompanyIntegrationID UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_PaymentProvider_CompanyIntegration REFERENCES __mj.CompanyIntegration(ID);

-- The authoritative invoice ↔ unit mapping (#146: "the connector must keep its own mapping").
CREATE TABLE ExternalInvoice (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentProviderID           UNIQUEIDENTIFIER NOT NULL,          -- which rail, which company
    OrderHeaderID               UNIQUEIDENTIFIER NOT NULL,
    CompanyID                   UNIQUEIDENTIFIER NOT NULL,          -- the DOCUMENT's selling company
    OrderHeaderPaymentScheduleID UNIQUEIDENTIFIER NULL,             -- null = schedule-less unit
    DocumentNumber              NVARCHAR(40)     NOT NULL,          -- what we sent as invoiceNumber
    Amount                      DECIMAL(18,2)    NOT NULL,
    DueDate                     DATE             NULL,
    Status                      NVARCHAR(20)     NOT NULL,          -- Sending | Sent | Canceled | Failed
    ExternalCustomerRef         NVARCHAR(100)    NULL,              -- 0cu…
    ExternalInvoiceRef          NVARCHAR(100)    NULL,              -- 00e…, NULL while Sending/Failed
    ExternalTotal               DECIMAL(18,2)    NULL,              -- BILL's totalAmount on read-back
    ExternalDueAmount           DECIMAL(18,2)    NULL,              -- last seen dueAmount
    ExternalStatus              NVARCHAR(40)     NULL,              -- last seen status
    SentAt                      DATETIMEOFFSET   NULL,
    CanceledAt                  DATETIMEOFFSET   NULL,
    CancelReason                NVARCHAR(500)    NULL,
    LastSyncedAt                DATETIMEOFFSET   NULL,
    LastError                   NVARCHAR(MAX)    NULL,
    IssuedByUserID              UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_ExternalInvoice PRIMARY KEY (ID),
    CONSTRAINT CK_ExternalInvoice_Status CHECK (Status IN ('Sending','Sent','Canceled','Failed')),
    CONSTRAINT CK_ExternalInvoice_SentHasRef CHECK (Status <> 'Sent' OR (ExternalInvoiceRef IS NOT NULL AND SentAt IS NOT NULL))
);
CREATE UNIQUE INDEX UQ_ExternalInvoice_Ref ON ExternalInvoice (PaymentProviderID, ExternalInvoiceRef) WHERE ExternalInvoiceRef IS NOT NULL;
-- At most one live (Sending/Sent) invoice per unit per rail: the D19 idempotency guard for issuance.
-- SQL Server cannot index an expression, so the unit key is a persisted computed column.
ALTER TABLE ExternalInvoice ADD UnitScheduleKey AS ISNULL(OrderHeaderPaymentScheduleID, CAST('00000000-0000-0000-0000-000000000000' AS UNIQUEIDENTIFIER)) PERSISTED;
CREATE UNIQUE INDEX UQ_ExternalInvoice_LiveUnit ON ExternalInvoice (PaymentProviderID, OrderHeaderID, CompanyID, UnitScheduleKey)
    WHERE Status IN ('Sending','Sent');

-- Party ↔ Bill.com customer, per rail (a BILL org is per company).
CREATE TABLE ExternalCustomer (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentProviderID   UNIQUEIDENTIFIER NOT NULL,
    BillToOrganizationID UNIQUEIDENTIFIER NULL,
    BillToPersonID      UNIQUEIDENTIFIER NULL,
    ExternalCustomerRef NVARCHAR(100)    NOT NULL,
    LastSyncedAt        DATETIMEOFFSET   NULL,
    CONSTRAINT PK_ExternalCustomer PRIMARY KEY (ID),
    CONSTRAINT CK_ExternalCustomer_OneParty CHECK ((BillToOrganizationID IS NULL) <> (BillToPersonID IS NULL)),
    CONSTRAINT UQ_ExternalCustomer_Ref UNIQUE (PaymentProviderID, ExternalCustomerRef)
);
CREATE UNIQUE INDEX UQ_ExternalCustomer_Org    ON ExternalCustomer (PaymentProviderID, BillToOrganizationID) WHERE BillToOrganizationID IS NOT NULL;
CREATE UNIQUE INDEX UQ_ExternalCustomer_Person ON ExternalCustomer (PaymentProviderID, BillToPersonID)       WHERE BillToPersonID IS NOT NULL;

-- Every receivable payment the poller has seen, and what it did with it. The exceptions worklist
-- and the audit trail are the same table.
CREATE TABLE ExternalPayment (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentProviderID   UNIQUEIDENTIFIER NOT NULL,
    ExternalPaymentRef  NVARCHAR(100)    NOT NULL,                  -- 0rp…
    ExternalCustomerRef NVARCHAR(100)    NULL,
    Amount              DECIMAL(18,2)    NOT NULL,
    UnappliedAmount     DECIMAL(18,2)    NOT NULL DEFAULT 0,
    PaymentDate         DATE             NULL,
    ExternalStatus      NVARCHAR(40)     NULL,
    ExternalUpdatedAt   DATETIMEOFFSET   NULL,
    Disposition         NVARCHAR(20)     NOT NULL,                  -- Captured | Held | Unmatched | Ignored | ReversalNeeded
    DispositionReason   NVARCHAR(500)    NULL,
    PaymentHeaderID     UNIQUEIDENTIFIER NULL,                      -- set once Captured
    Payload             NVARCHAR(MAX)    NULL,                      -- the 0rp record as received
    FirstSeenAt         DATETIMEOFFSET   NOT NULL,
    LastSeenAt          DATETIMEOFFSET   NOT NULL,
    CONSTRAINT PK_ExternalPayment PRIMARY KEY (ID),
    CONSTRAINT UQ_ExternalPayment_Ref UNIQUE (PaymentProviderID, ExternalPaymentRef),
    CONSTRAINT CK_ExternalPayment_Disposition CHECK (Disposition IN ('Captured','Held','Unmatched','Ignored','ReversalNeeded'))
);

-- Poll watermark per provider per object. Orders-owned because the MJ sync engine's watermark is
-- keyed by entity map, which we do not use.
CREATE TABLE PaymentProviderSyncState (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentProviderID UNIQUEIDENTIFIER NOT NULL,
    ObjectName        NVARCHAR(100)    NOT NULL,                    -- 'receivable-payments'
    Watermark         NVARCHAR(100)    NULL,                        -- BILL updatedTime, ISO
    LastPolledAt      DATETIMEOFFSET   NULL,
    LastSucceededAt   DATETIMEOFFSET   NULL,
    LastError         NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_PaymentProviderSyncState PRIMARY KEY (ID),
    CONSTRAINT UQ_PaymentProviderSyncState UNIQUE (PaymentProviderID, ObjectName)
);
```

Plus one metadata row in `metadata/payment-provider-types`: `Code: BillCom`, `Name: Bill.com`,
`DriverClass: BillComPaymentProvider`, tokenization 0, refund 0, webhooks 0, `IsActive: 1`.

**D-B2.** The schedule row's `ExternalSystem` / `ExternalInvoiceRef` / `SentAt` are **also** written,
as the contract in #239/#242 promises and so Jeremy's "unsent means `SentAt IS NULL`" stays a
one-column query. `ExternalInvoice` is the authoritative mapping (it is the only home for a
schedule-less unit, it survives cancellation as history, and the poller matches on it); the schedule
columns are the denormalised convenience.

**D-B3.** `OrderHeader.ExternalDocumentNumber` gets the Bill.com `invoiceNumber` only when the order
has exactly one live external invoice (best effort, display only — #146's own caveat). It is never
read by the integration.

**D-B4.** Configuration is the existing `PaymentProvider` row: one per (company, `BillCom`), with
`CompanyIntegrationID` pointing at the MJ integration row that holds the credential. `CredentialsRef`
stays NULL for this type. `IsLiveMode` must agree with the credential's `environment`; the rail
refuses to send when they disagree.

### 4.4 Sequencing constraint

Phase 2 (outbound) needs `OrderHeaderPaymentScheduleID` on `ExternalInvoice` to reference PR #220's
table. **Build on `next` after #220 merges**, or rebase onto `aidp-24` if it has not by the time
phase 2 starts. Phase 1 and the spikes have no dependency on #220.

---

## 5. Flows

### 5.1 Issue (`Orders.IssueExternalInvoice`)

Input: `{ OrderHeaderID, CompanyID?, OrderHeaderPaymentScheduleID?, Preview?, AllowReissue? }`.

1. Resolve the unit. Load the order; refuse unless `Status = 'Confirmed'`. If a schedule row is
   named, refuse unless its `Status = 'Invoiced'` (it must already carry a frozen `DocumentNumber`).
   If the order has schedule rows and none is named, refuse: *"This order is billed in instalments;
   issue instalment N from the Billing worklist."*
2. Resolve the rail: the active `PaymentProvider` of type `BillCom` for the unit's `CompanyID`.
   None → refuse `NO_RAIL` (that company invoices natively; nothing else changes).
3. Idempotency: an `ExternalInvoice` row for this unit in `Sent` → return it, `AlreadySent: true`.
   In `Sending` → refuse `IN_FLIGHT` (a previous attempt may have created the BILL invoice; see 7).
   In `Canceled` or `Failed` → proceed only with `AllowReissue` (D-B7).
4. Build facts: `BuildInvoiceDocuments({OrderHeaderID, OnlyCompanyID, PaymentScheduleID})` from PR #220
   gives the per-company document with `InvoiceInstalmentFacts`. `BuildExternalInvoicePayload` (pure)
   turns it into `{ invoiceNumber: DocumentNumber, invoiceDate, dueDate, customer:{id}, invoiceLineItems[] }`.
   **D-B5 — line detail.** A schedule-less unit sends one BILL line per order line (description,
   quantity, unit price after discount) plus one line per charge and one for tax; an instalment sends a
   single line *"Instalment N of M — ORD-1234"* for the instalment amount. The payload's computed total
   must equal the unit's amount to the cent, or the operation refuses before contacting BILL.
5. `Preview` → return the payload and stop. Nothing is written.
6. Ensure the customer: look up `ExternalCustomer` for the order's bill-to party; else
   `EnsureCustomer` creates it in BILL from the party (`name`, `email`, `billingAddress`,
   `accountNumber` = our party ID so the link is recoverable) and records the mapping. **Bill.com
   requires an email**; a party without one refuses with `NO_CUSTOMER_EMAIL` naming the party, and
   the unit lands in the queue as `Failed` so a person fixes the party and re-runs.
7. Write the outbox row: insert `ExternalInvoice(Status='Sending')` and commit. This is the claim on
   the unit; the unique live-unit index makes a concurrent second send fail here rather than at BILL.
8. Call `IssueInvoice`. On success: read the invoice back, check `totalAmount` equals `Amount`,
   update the row to `Sent` with refs, `SentAt`, `ExternalTotal`; stamp the schedule row
   (`ExternalSystem='BillCom'`, `ExternalInvoiceRef`, `SentAt`) when there is one; best-effort D-B3.
   On a total mismatch: archive the BILL invoice, mark `Failed` with the reason — a document for the
   wrong amount must not reach a customer.
   On failure: mark `Failed` with `LastError`; the queue shows it; re-run is manual or the next sweep
   (D-B6).

Nothing here touches `Balance`, `PaymentStatus` or the ledger (#146 AC3).

**D-B6 — what the sweep retries.** `Orders.SendExternalInvoices` sends units with **no**
`ExternalInvoice` history and retries `Failed` rows whose error is transient (network, 5xx, session).
It never retries `NO_CUSTOMER_EMAIL`-class failures and never touches `Canceled` — those are a
person's call (D-B7).

### 5.2 Cancel (`Orders.CancelExternalInvoice`)

Input: `{ ExternalInvoiceID, Reason }`.

1. Refuse unless the row is `Sent`.
2. Refuse if any `PaymentLine` with `PaymentHeader.Status IN ('Captured','Refunded','Disputed')`
   exists against the unit (the instalment when named, else the order+company). #147: "blocked or
   warns if any payment has been recorded" — **blocked**, because a paid invoice follows the
   refund/reversal path (O-US5), not this one.
3. Read the BILL invoice. Refuse if `dueAmount < totalAmount` (a payment is applied or scheduled on
   BILL's side that we have not yet polled) — the poller will capture it and the refusal will then
   read as step 2.
4. `CancelInvoice` (archive). Update the row: `Status='Canceled'`, `CanceledAt`, `CancelReason`.
   Clear the schedule row's `ExternalInvoiceRef`/`SentAt` (the trigger allows it) so "unsent" is true
   again. Clear D-B3's `ExternalDocumentNumber` if it was ours.
5. No journal entry, no status change on the order or the instalment (#147 AC4). An `Invoiced`
   instalment stays `Invoiced` — its frozen number is the customer's — and is re-issued to BILL under
   the same `DocumentNumber` when someone chooses to.

**D-B7 — re-issue is a human act.** After a cancel, the unit is deliberately *not* picked up by the
sweep. The order form's "Send to Bill.com" button calls `IssueExternalInvoice` with `AllowReissue`.
Rationale: a cancel means something was wrong; auto-resending the same thing is the one behaviour
nobody wants. Bill.com may reject a duplicate `invoiceNumber` on the same org — spike S4 decides
whether the re-issue appends a suffix (`ORD-1234-R2`).

### 5.3 Poll (`Orders.PollExternalPayments`)

Input: `{ PaymentProviderID?, Preview?, MaxCount?, SinceWatermark? }`. Runs per active `BillCom`
provider row.

1. Load `PaymentProviderSyncState` for `receivable-payments`; fetch everything with
   `updatedTime >= (Watermark − 1 day)` (the overlap is cheap because dedupe is by payment id).
   Until the connector applies the filter (upstream ask U2), this is a full scan filtered locally.
2. For each `0rp` record, upsert `ExternalPayment` (`LastSeenAt`, `ExternalStatus`, `Payload`) and
   run `DecideExternalPayment`:
   - already `Captured` and status still cleared → nothing;
   - already `Captured` and status now void/failed/canceled → `ReversalNeeded` (v1 flags it for
     O-US13's manual bank-return path; automating the reversal is a follow-up);
   - status not yet cleared (scheduled, processing) → `Held`;
   - cleared → **capture**.
   The status vocabulary is a table in code with **unknown → `Held` and a warning**, populated by
   spike S2. `onlinePayment=false` (money recorded in BILL, e.g. a check keyed by Finance) is captured
   the same way — D-B8.
3. Capture: map `invoicePayments[]` to units via `ExternalInvoice.ExternalInvoiceRef`.
   - Every invoice matched → one `Orders.CapturePayment` call: `ReceivingCompanyID` = the provider's
     company, `TenderCode` from the payment (`ACH` default; `Check`/`CreditCard` when the payload says
     so), `PaymentProviderID` = the BillCom row, `PaymentDate = paymentDate`,
     `IdempotencyKey = 'billcom:' + 0rp id` (the D19 guard; `UX_PaymentHeader_IdempotencyKey` is the
     guarantee, the `ExternalPayment` row the optimisation), one allocation per matched invoice for its
     `amount`, `OrderHeaderPaymentScheduleID` set when the invoice was an instalment, payer = the
     unit's bill-to party, `ProcessingFeeAmount = 0` (D-B9). Disposition → `Captured`, with the new
     `PaymentHeaderID`. Capture books the cash-leg entry through `PaymentHeaderEntityServer` as
     today (#148 AC4).
   - Any invoice unmatched (an invoice created directly in BILL, pre-cutover AR) → `Unmatched`, no
     capture at all, reason names the invoice ids. Partial capture would misstate the payment.
   - `unappliedAmount > 0` → capture the applied part; note the unapplied amount in the reason
     (the customer's credit lives in BILL until Finance applies it there).
4. Advance the watermark to the max `updatedTime` seen only when the pass completes without a fault.
   Report `Captured / Held / Unmatched / ReversalNeeded` counts and rows (the `Candidates`-style
   deliverable of a preview). `Preview` runs steps 1–3 without writing anything.
5. A pass that captured nothing but left `Unmatched` or `ReversalNeeded` rows reports
   `Success: false, ResultCode: 'ATTENTION'` so the job's failure notification fires — the same
   posture as the renewal action.

**D-B8 — Bill.com is the AR ledger of record for BillCom companies.** A payment recorded in BILL by
any means is captured here, and Finance must **not** also key it into Orders by hand (O-US3), or it
double-counts. Confirm with Jeremy (§12 Q4).

**D-B9 — fees.** BILL's fee to us is not in the payment payload; `convenienceFeeAmount` is charged to
the customer. The cash-leg entry therefore books gross with a zero fee leg, and bank reconciliation
sees BILL's fee as a separate expense. Confirm with Jeremy (§12 Q5).

**D-B10 — multi-company orders.** `Orders.CapturePayment` refuses an allocation whose order's
header `CompanyID` differs from `ReceivingCompanyID`. A unit for selling company B on an order
headed by company A therefore cannot be captured today. v1 records such payments as `Unmatched`
with a clear reason. This is a pre-existing gap shared with check payments, filed separately.

### 5.4 Native delivery exclusion (#146 AC5)

`DecideDelivery` gains one fact, `ExternallyInvoiced`, true when the (order, company) has a live
`ExternalInvoice` **or** the company has an active `BillCom` provider; the verdict is `Refuse`
(`EXTERNALLY_INVOICED`). `Orders.SendDocument` loads the fact alongside the order status. A `Force`
flag is deliberately not added.

**D-B11.** The second condition (active rail ⇒ refuse email even before the send) is what prevents
a double send in the window between confirm and the sweep.

### 5.5 What "sent" means

**D-B12.** Creating the invoice in Bill.com is the handoff. Whether the customer is emailed is
Bill.com's configuration (auto-send) or a Finance click in Bill.com; the connector exposes no send
endpoint and this design does not add one. This also preserves the CFO review's human gate for
anything Finance wants to eyeball, without building a second approval queue. Spike S5 confirms the
sandbox's default behaviour.

---

## 6. Scheduling and go-live posture

Two `MJ: Scheduled Jobs` rows, both `ActionScheduledJobDriver`, both shipped **Disabled** and with
`Preview: true`, `ConcurrencyMode: Skip`, `MissedRunPolicy: RunOnce`, `RunImmediatelyIfNeverRun: false`:

| Job | Cron | MaxCount | Why |
|---|---|---|---|
| Orders — Send External Invoices | every 30 min, business hours UTC−6 (`0 */30 13-23 * * 1-5`) | 25 | A confirmed order should reach BILL the same half-hour; a mis-configuration invoices 25 customers, not the book. |
| Orders — Poll External Payments | hourly (`0 15 * * * *`) | 100 | ACH clears in days; hourly is generous. Runs at :15 so it never coincides with the send. |

Go-live is the renewal job's two acts: enable, read the preview run's list with Finance, then set
`Preview` false. Per `CLAUDE.md`, these rows reach a host only through a release `*__Metadata_Sync.sql`.

---

## 7. Failure handling and idempotency, in one place

| Risk | Guard |
|---|---|
| Same unit sent twice (double click, two sweeps) | `UQ_ExternalInvoice_LiveUnit` at step 5.1.7, before BILL is called. |
| BILL invoice created, our update lost (crash between 5.1.8 and commit) | Row stays `Sending`, no auto-retry; the queue shows it with age; `IssueExternalInvoice` refuses `IN_FLIGHT`; a person reconciles via "Reconcile" (reads BILL by `invoiceNumber` once U2 lands, else manual) and either adopts the ref or marks `Failed`. |
| Same payment captured twice | `IdempotencyKey` + `UX_PaymentHeader_IdempotencyKey`; `ExternalPayment.Disposition`. |
| Payment applied to the wrong order | Matching is only by `ExternalInvoiceRef`, never by `ExternalDocumentNumber` or amount. |
| Partial fan-out | All-or-nothing per payment: any unmatched invoice ⇒ `Unmatched`, nothing captured. |
| Unknown BILL status | `Held`, warning logged, surfaced in the queue. |
| Sandbox credential on a live provider row | Rail refuses when `IsLiveMode` ≠ (`environment = production`). |
| Watermark skipping a late-arriving update | 1-day overlap; dedupe by id makes it free. |
| Network fault mid-poll | Watermark not advanced; the next pass re-reads. |
| Logical refusal vs fault | Refusals return `Success:false` with a code; only faults throw (repo convention). |

---

## 8. Security

- No secret in Orders' tables. `CompanyIntegrationID` is a pointer; credentials live in
  `MJ: Credentials` behind the `Bill.com Session` type and are read by the connector.
- All `ExtraFilter` literals go through `RequireUUID` / `EscapeSQLString` from `sql-guards.ts`
  (repo rule). Payloads from BILL are data, never interpolated.
- The operations run under the caller's `UserInfo`; the Actions require `ContextUser`. Authorization
  follows the existing remote-operation `Authorize` hook; the issue/cancel operations should require
  the same authority as recording a payment (spike: name the existing authorization key).

---

## 9. Testing

- **Unit (vitest, no I/O):** `ExternalInvoiceBehavior` (payload from an `InvoiceDocument`, tie
  check, instalment vs schedule-less, refusal reasons), `ExternalPaymentBehavior` (decision table
  incl. unknown status, fan-out, unmatched ⇒ nothing, idempotency key), `BillComInvoiceRail` with a
  stubbed `BillComGateway` (write shape `customer:{id}`, no `customerId`; archive; total read-back),
  `DecideDelivery` refusal, Action adapters' string coercion.
- **Integration bundles** (`packages/IntegrationTests/src/checks/external-invoicing.checks.ts`,
  `external-payments.checks.ts`) against a live DB with the gateway seam faked: issue → row + schedule
  stamp; idempotent second issue; cancel refused when paid; cancel clears `SentAt`; sweep respects
  `MaxCount` and history; poll captures once, re-poll no-op, unmatched captures nothing, held then
  cleared captures on the second pass; email delivery refused for a BillCom company; the no-rail
  company is untouched (regression fence). Register counts in `registry-parity.test.ts`.
- **Live sandbox harness** `test-harnesses/billcom-live.mjs`, env-gated, runs the spikes' probes
  and one end-to-end issue → poll against the BILL sandbox. Not part of CI.

---

## 10. Upstream asks (not blocking phase 1–2, blocking parts of 3)

| # | Repo | Ask | Fallback if slow |
|---|---|---|---|
| U1 | Integrations `Finance/BillCom` | Expose archive/restore as a connector verb (or a generic `InvokeObjectAction(object, id, 'archive')`). | Spike S1: `UpdateRecord({archived:true})` via `PUT` if BILL honours it. Last resort: the rail calls the gateway's raw request helper — not preferred. |
| U2 | MJ `integration-engine` / connector | Honour `WatermarkValue` in `FetchChanges` (`filters=updatedTime:gte:…`) or add a filtered `ListRecords`. | Full scan + local filter (works, scales poorly). |
| U3 | `aidp-next` | Add `@memberjunction/connector-bill-com` to `apps/MJAPI/package.json`; create the `Bill.com` `MJ: Integrations`/`Company Integrations`/`Credentials` rows per company (sandbox first). | None — deployment prerequisite. |
| U4 | Integrations | Optional: ship the `customers` Get/Create Actions so agents can use them too. Not needed by this design. | — |

---

## 11. Phases (mirrors the implementation plan)

1. **Foundation + spikes (no #220 dependency).** Provider type row, `BillComPaymentProvider`,
   `PaymentProvider.CompanyIntegrationID`, `BaseInvoiceRail` + resolver, `BillComGateway` + rail,
   live harness, spikes S1–S5 answered in the plan.
2. **Outbound invoicing.** `ExternalInvoice`/`ExternalCustomer` migration, behaviours, issue/cancel/
   worklist/sweep operations, delivery exclusion, Action + job, Angular panel and queue page.
3. **Inbound payments.** `ExternalPayment`/`PaymentProviderSyncState` migration, decision table,
   poller, Action + job, queue page's held/unmatched tab.
4. **Release.** Metadata sync migration, changesets, host wiring (U3), preview runs with Finance.

---

## 12. Open questions and assumptions for Robert

Decisions above were made so work can start; each is reversible before phase 2 ships.

1. **Rail seam over delivery channel (§3, D-B1).** #242 leaned "channel". I recommend the rail.
   Overrule and the plan's phase 2 changes shape, not size.
2. **Sweep cadence and the schedule-less trigger.** Auto-send every 30 minutes after confirm, versus
   a human "Send to Bill.com" click only. The CFO review asked for a human gate before the customer
   sees an invoice; D-B12 places that gate in Bill.com itself. If Finance wants the gate in Orders,
   set the send job to stay in Preview and use the button — zero code change.
3. **Instalment invoice number format** in BILL (`ORD-1234-2`) and whether a re-issue may reuse it
   (D-B7, spike S4). Plan §14.3 already flags this for Jeremy/Craig.
4. **D-B8:** BILL-recorded checks are captured by the poller and must not be keyed manually. Jeremy.
5. **D-B9:** zero fee leg on BILL payments. Jeremy/Johanna.
6. **Tender mapping** for BILL payments (`ACH` default). Is there a `receivablesType`/funding value
   Finance wants mapped to `Check` or `Wire`? Spike S2 lists what BILL actually returns.
7. **D-B10 multi-company orders** are out of v1's capture path. Acceptable for cutover?
8. **Reversal automation.** v1 flags voided/failed BILL payments as `ReversalNeeded`; O-US13's
   manual path handles them. Automate in a follow-up?
9. **Who owns U1/U2** in Integrations (Madhav?) and whether phase 3 waits for U2 or ships with the
   full-scan fallback.
10. **Assumption:** the `PaymentProvider` row is the right home for per-company Bill.com config
    (D-B4), rather than a new `OrderCompanyPolicy` column. Reasoning: #146 says "provider registration
    follows the pluggable PaymentProvider pattern", and the poller needs a `PaymentProviderID` anyway.
11. **Assumption:** Bill.com is enabled per company, and companies without a `BillCom` row keep
    native email invoicing untouched.

---

## 13. Addendum (2026-09-20, after implementation started) — webhooks, and what shipped

### 13.1 Bill.com webhook support, verified against the public docs

Read from developer.bill.com ("Webhook Events & Subscriptions", "Webhooks", release notes to May 2026):

- **Mechanics.** `POST /v3/subscriptions` with `name`, `status.enabled`, `events[] {type, version}`,
  `notificationUrl` (HTTPS). Every notification is signed **HMAC-SHA256 over the raw body, base64,
  in `x-bill-sha-signature`**, keyed by the subscription's `securityKey`. Failed deliveries retry with
  exponential backoff; a subscription that keeps failing is disabled by BILL. Limit: 10 subscriptions
  per organisation; duplicates (same events + URL) are refused. The event catalog is served by
  `GET /v3/events/catalog`. BILL's own guidance: webhooks are "a trigger for your system", not the
  source of truth — validate with GET.
- **AR coverage.** Invoice events only: `invoice.created`, `invoice.updated`, `invoice.archived`,
  `invoice.restored` (the March 2026 release added a `createdBy` field to them). **There is no
  payment-received event, and `invoice.updated` carries no receivable-payment id** — confirmed both
  by the connector's own research (golive #49) and by the docs read today.
- **Consequence.** The poll stays authoritative (§5.3). A webhook is useful only as a *latency
  trigger*: a verified `invoice.*` event on an invoice we issued means "run the poll for this provider
  now". That is what shipped: `POST /webhooks/billcom/:providerId` (`BillComWebhookExtension`,
  `OrdersBillComWebhook`, registered in `mj.config.cjs`, the server-extensions manifest and
  `package.json`), which verifies the signature through `BillComPaymentProvider.VerifyWebhook`
  (`Credentials.WebhookSecret` ← `<CredentialsRef>_WEBHOOK_SECRET`), answers 202, and runs
  `Orders.PollExternalPayments({ PaymentProviderID })` detached. Unverified or non-invoice
  notifications never trigger anything. Registering the subscription in BILL is a setup step.

### 13.2 What shipped on `feat/billcom-integration`

Phase 1 (rail component), the pure behaviours, all five operations, both scheduler adapters and jobs,
the native-delivery exclusion, the webhook receiver, three migrations, the metadata rows, a changeset,
and the live harness. **Not done here:** applying the migrations and running CodeGen (no development
database is configured in this checkout; the server addresses the new entities by name so nothing
depends on generated getters), `mj sync push`, the Angular panel and queue page (Task 19), the
integration check bundles (they need the applied schema), the release Metadata_Sync migration, and
the spikes S1–S5 (they need sandbox credentials; the harness is ready).

### 13.3 PR #208 and PR #220, as of 2026-09-20 evening

- **#220 was rebased onto `next`** the same day: migrations renumbered `V202609201200` / `V202609201300`,
  CodeGen `Sequence` literals replaced with `MAX+1`, and Andrew's review (changes requested) asked for
  (1) plain DDL above the CodeGen banner — done in `44b554e7`; (2) **merge #208 first and rebase onto
  Robert's `OverdueViewSQL()` emitter** — pending; (3) a fresh-database replay — pending. Andrew is out
  and told Craig to coordinate the #208 order with Robert and merge without him.
- **#208 conflicted with `next` only on package versions and the lockfile** (`next` had released 5.13.0
  and raised the bizapps-common floor to `>=5.44.0`). Resolved in the `bizapps-orders-tz` worktree:
  `next`'s versions win, #208's `@mj-biz-apps/common-entities` dependency stays at the new floor,
  lockfile regenerated. Build green, 1,704 unit tests pass (the two checkout-element failures are the
  local Angular-build ones). **Not pushed** — Robert's PR, Robert's call.
- **The #208 × #220 reconciliation** is the one Craig's item (2) needs, and it is done on this branch:
  `OverdueSQL(alias, dueDateExpression = alias.DueDate, todayExpression = 'bt.Today')`; the filter reads
  `NextDueDate`; `OverdueViewSQL()` emits the view with `nd` (CROSS APPLY over live unpaid instalments,
  falling back to the header) and `bt` (CROSS JOIN `fnBusinessToday()`); #220's migration carries that
  text byte for byte so both branches' drift tests hold. Craig can lift `packages/Entities/src/overdue.ts`,
  its test, and the view block from this branch.
- **This design is unchanged by #220's updates.** The trigger contract (schedule row → invoiceable when
  `Invoiced`; whole order → invoiceable at `Confirmed`) is what #220 ships. Two code-level uses were
  added: `BuildInvoiceDocuments({ PaymentScheduleID })` renders the instalment's own document for the
  rail payload, and `Orders.CapturePayment` allocations gained `OrderHeaderPaymentScheduleID` so a
  polled instalment payment lands on the instalment it paid rather than cascading oldest-first.

### 13.4 Deviations from the plan worth knowing

- `ExternalInvoiceBehavior` lives in `packages/CoreEntitiesServer`, not `packages/Entities`, because
  `InvoiceDocument` lives there on `next`; `ExternalPaymentBehavior` is in `packages/Entities` as planned.
- Schedule (PR #220) support is still checked at runtime (`provider.EntityByName`) so a database that
  has not run #220's migration reads every order as billed as a whole; the `ExternalInvoice →
  OrderHeaderPaymentSchedule` FK is plain, because this branch's migrations sort after #220's.
- Migrations are plain DDL (Amith's direction on #220), not the idempotent guards `CLAUDE.md` asks for —
  flagged for Robert in the plan's Global Constraints.
- The generated remote-operation base classes were added to `remote_operations.ts` by hand in exactly
  CodeGen's emitted shape; the next CodeGen run reproduces them.
- TypeScript here compiles without `strictNullChecks`, so union narrowing uses `=== false` / `=== true`
  rather than truthiness, and `BaseEntity` rows load through `InnerLoad(CompositeKey.FromID(id))`.

### 13.5 Adversarial review (2026-09-20, independent reviewer over the whole branch)

Seventeen findings; fourteen fixed on the branch, three deferred with reasons.

**Fixed**
1. *Blocker.* Every polled capture would have been refused: a `PaymentHeader` with a `PaymentProviderID`
   and no intent is a gateway capture to `PaymentHeaderEntityServer.settleWithProvider`. Added
   `BasePaymentProvider.CollectsAtCapture` (true for a till, false for a rail that already moved the
   money); the settlement step returns early for a non-collecting provider, so a Bill.com payment is
   RECORDED like a check while keeping its provider for attribution. Stripe's path is unchanged (PV7).
2. *Cap starvation.* The poll now sorts oldest-first, drops payments already in a final state with an
   unchanged `updatedTime` before applying `MaxCount`, and advances the watermark to the last processed
   instant on a capped pass — so a first run against an org with more history than `MaxCount` moves.
3. *Timestamps.* Rail timestamps are canonicalised to ISO-Z in `NormalizeReceivablePayment`; comparisons
   are on parsed instants; an unreadable stored watermark reads as "none" and is logged instead of
   faulting every pass; unreadable dates are never written.
4. *Refusals were invisible.* A `CapturePayment` refusal is now the disposition `Refused` (new CK value),
   counted as ATTENTION so the job notifies; it is retried next pass in case the cause was fixed.
5. *Ambiguous payer.* An order with both a bill-to organisation and person pays as the organisation.
6. *Part-paid orders.* An order billed as a whole with money already applied is refused (`PART_PAID`),
   recorded once as `Failed` so the sweep does not retry it every half hour; same for `TIE_FAILED`.
7. *Configuration faults.* `BaseInvoiceRail.CheckConfiguration()` runs before any write in the issue
   operation and before any fetch in the poll; a bad provider row is an operation ERROR / provider
   fault, never a `Failed` row per unit — and a preview run now surfaces it.
8. *Unverified totals.* The post-send read-back retries once on a transient failure; if it still fails the
   row is `Sent` with `LastError` saying the total is unverified.
9. *Set-aside.* `Ignored` is terminal: a person sets an `Unmatched`/`Refused` row to `Ignored` and the
   decision table never re-opens it, so pre-cutover AR stops raising ATTENTION.
10. *Customer race.* When two concurrent sends both create a Bill.com customer, the loser adopts the
    winner's mapping and logs the duplicate rail customer for archiving.
11. *In-flight detection* also matches `duplicate key`, as `CapturePaymentOperation` does.
15. Delivery-exclusion unit tests added (the plan's claim was wrong before).
Also: `Refused` output on the poll Action and its metadata param.

**Deferred**
- 12 *Webhook replay.* A captured, signed notification can be replayed to force polls. The endpoint only
  ever triggers a poll, which is idempotent and rate-limited by the connector; an `EventID` LRU is a
  cheap follow-up once the sandbox shows what BILL actually sends.
- 13 *Hard-coded schema* in `paidOnUnit`'s subquery (`[__mj_BizAppsOrders].[PaymentHeader]`): the same
  precedent as `nextPaymentNumber`; the app schema is not parameterised at runtime.
- 14 *Schedule stamp is best-effort.* If stamping `SentAt` on the instalment fails after the
  `ExternalInvoice` row is `Sent`, the worklist is still right (it reads `ExternalInvoice`) but Jeremy's
  `SentAt IS NULL` query is not; the failure is logged. Making the two writes one transaction is a
  follow-up once the operation's transaction boundary is settled with the rail call outside it.
- 16 *Re-issue numbering* after a cancel still sends the same `DocumentNumber`; whether BILL accepts a
  duplicate is spike S4.
- 17 A filtered unique index on a persisted computed column needs `QUOTED_IDENTIFIER`/`ANSI_*`/
  `ARITHABORT` ON for inserts — tedious defaults satisfy this; note for the fresh-database replay.

**Verification round (same day).** A second reviewer confirmed the fourteen fixes and found four defects
the fixes introduced; all four are fixed:
- the transient-failure pattern matched money (`500.00`) and document numbers (`INV-500`) as HTTP 5xx, so a
  part-paid refusal would have been retried and re-recorded every half hour — status codes now match only
  when they stand alone, and every refusal this module writes is classified permanent by name;
- a mis-configured rail threw out of `IssueOneUnit` and aborted the whole sweep — each unit is now caught,
  and a configuration error skips the rest of that company's units and moves on to the next company;
- "nothing owed", "credit memo" and "instalment not yet issued" were written as `Failed` rows (one with a
  fabricated amount) — only the two money facts (`PART_PAID`, `TIE_FAILED`) write a row; the rest return
  `NOT_INVOICEABLE` and leave no history;
- unchanged non-final rows (Held / Unmatched / Refused) counted against the poll's `MaxCount`, so a
  pre-cutover backlog wider than the cap pinned the watermark — they are re-decided every pass but no
  longer count, and a person's `Ignored` reason is no longer overwritten.

