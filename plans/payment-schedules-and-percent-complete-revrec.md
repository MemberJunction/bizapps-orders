# Payment schedules and percentage-of-completion revenue recognition

**Status:** proposal, nothing built. Raised from the 2026-09-11/12 AIDP-Next conversion thread
(Andrew Schwartz Crane, Jeremy Hunnewell, Amith Nagarajan).
**Owner of the build:** Craig Adam. **Decisions needed:** Monday 2026-09-15, with Andrew, Craig,
Robert, Jeremy, Johanna.
**Proposed decision numbers:** D85–D90 (D84 is the current ceiling in `plans/archive/`).

---

## 0. What this is, in one paragraph

Blue Cypress sells contracts that are billed in instalments — semi-annual, quarterly, or one payment
per year of a multi-year deal. Orders has no way to say so: `OrderHeader` carries a single `DueDate`,
`PaymentTermsType` carries only `NetDays`, and there is no instalment concept anywhere in the 49
tables. This plan adds one — `OrderHeaderPaymentSchedule` — and then follows the consequence
honestly, because the table on its own is cosmetic. It also adds percentage-of-completion revenue
recognition, which is in the same plan on purpose: **both features are driven by the same
balance-sheet change**, and building either one without it produces a ledger that cannot represent
what the business actually does.

---

## 1. The finding that reorders everything else

> **Confirming an order today debits Accounts Receivable for the full order value, immediately.**

`OrderJournalEntryFactory` (`packages/CoreEntitiesServer/src/OrderJournalEntryFactory.ts:1-27`,
plan D11) books, per line, at confirm:

```
Dr  Accounts Receivable      net + tax + charges
Dr  Sales Discounts          discount
    Cr  Sales                gross          (UpFront)
    Cr  Deferred Revenue     gross          (deferred)
```

A three-year contract billed annually therefore lands in AIDP with the whole three years sitting in
AR on day one, offset by an equal Deferred Revenue credit.

That is **exactly the condition Jeremy is asking us to stop doing in Business Central**:

> *"That receivable sits in AR today even though our right to the money is conditional on our
> performing for two more years, and it carries an equal deferred revenue credit, so we are grossing
> up both sides and make a monthly AR aging adjustment to move 'long term AR' out of the primary AR
> account."*

So the conversion policy he proposes — reverse the unsent future invoices, hold the obligation as a
dated schedule row with no invoice behind it — **cannot be implemented on top of the current booking
entry**. Convert an Active Contract with a 3/18/2029 instalment and AIDP reproduces the gross-up on
its first day, with a new subledger to maintain instead of the old one.

This is why the schema change and the accounting change are one piece of work, and why the
accounting half needs Johanna's sign-off this week rather than in October.

### 1.1 The fix: AR arises on billing, not on booking

Introduce one GL role — an unbilled/contract-asset account — and split the booking entry:

```
At confirm, per line (unchanged except the debit account):
Dr  Unbilled Receivable       net + tax + charges     ← contract asset, NOT AR
Dr  Sales Discounts           discount
    Cr  Sales / Deferred Revenue   gross              (unchanged)

At each instalment's invoicing, per (instalment × company):
Dr  Accounts Receivable       instalment amount
    Cr  Unbilled Receivable   instalment amount
```

Read at any date, the balance sheet then says: **AR = billed and unpaid · Unbilled = contracted,
not yet billable · Deferred Revenue = unearned.** That is the ASC 606 presentation, and it gives
Jeremy the 2029 obligation as a dated row with no receivable, which is what he asked for.

**Orders with no schedule behave exactly as today** — one implicit instalment, due on the header
`DueDate`, AR at confirm. Nothing about existing orders or existing history changes.

**This is also the account percentage-of-completion needs**, in the opposite direction: when a
project has earned more than it has billed, the earned-not-billed amount is the same contract asset.
Build it once.

**Two roles or one?** Strictly, an unconditional right to consideration is a receivable and a
conditional one is a contract asset; a future instalment on a contract we must still perform against
is conditional, so both cases are the same account. Finance may still want them presented
separately. **Johanna's call** — the plan is written for one role and splitting it later is additive.

---

## 2. What I verified before proposing anything

Read across `bizapps-orders`, `bizapps-accounting`, `bizapps-contracts`, `bizapps-tasks` and the
CDP/AIDP integration code. The items below each changed the shape of the proposal.

| Finding | Where | Consequence |
|---|---|---|
| There is no `Invoice` record, by design — "the confirmed order IS the receivable" | `InvoiceBehavior.ts:5` | The schedule row has to carry invoice identity; see §3.3 |
| The invoice document number is **derived from position** — `ORD-1234`, `-A`/`-B` per selling company | `InvoiceBehavior.ts:331` | A derived number shifts when the schedule changes. Must freeze at invoicing |
| Statements deliberately DO have storage, because re-deriving gives a different document | `InvoiceBehavior.ts:11-13` | Precedent: some documents legitimately need identity |
| `IsOverdue` is single-sourced across SQL, TS and the browser | `packages/Entities/src/overdue.ts` | Per-instalment ageing is **one module** to change, with a test that fails if a clause is dropped |
| Rev-rec drivers compute the whole schedule **once, at booking**, pure and I/O-free | `RevenueRecognition.ts:11-16`, `OrderJournalEntryFactory.ts:394` | POC cannot use this contract. See §5.1 |
| Reversal idiom is swapping Dr/Cr, amounts stay positive | `OrderJournalEntryFactory.ts:116` (`mirrorIf`) | A POC backward slide reuses it exactly — no new machinery |
| No `Unbilled Receivable` / contract-asset GL role exists | `GLAccountResolver.ts:34-61` | §1.1. `GiftCardLiability` is the precedent for adding one that may not resolve |
| Accounting has **no accounting periods and no close machinery** — deliberate (D2); the ERP owns periods | `bizapps-accounting/plans/…-master.md:141,176-193` | POC period discipline is the accountant's, enforced by the batch cutoff, not by a period FK |
| Accounting JE statuses are `Pending`/`Batched`/`GLPosted`. Batch statuses `Pending`/`Approved`/`Sent`/`Posted`/`Failed`/`Cancelled` — **no `Archived`** | `B202605281200…:439,346` | Andrew's ask is real. `Cancelled` today *releases members back into the nightly sweep* (`JournalEntryBatchEntityServer.ts:221-290`), which is precisely what a conversion batch must not do |
| D15: deferred revenue is real forward-dated JEs; **no schedule tables, no materializer**; changes produce *"correcting orders whose entries NET against what's staged — staged entries are never edited or deleted"* | `bizapps-accounting/plans/…-master.md:153` | POC must not stage a schedule, and its remeasurement mechanism must be netting. This is exactly cumulative catch-up — §5.2 is D15-native, not a departure from it |
| `Accounting.CreateJournalEntries` takes `{Drafts:[]}` and **joins an existing transaction** rather than opening its own | `AccountingEngine.ts:120-135` | A later caller (invoicing, a progress observation) can emit JEs with no new accounting API |
| Contracts has **no `ContractTerm` and no payment schedule** — both existed in v1 and were deleted 2026-08-23; their job moved to orders subscriptions | `bizapps-contracts/migrations/B202608040001…:19-28` | §3.1 |
| A test asserts the deleted v1 entities never register again | `bizapps-contracts/packages/Entities/src/__tests__/class-registration.test.ts:53-104` | The boundary is enforced, not just documented |
| Bill.com **never sees a payment schedule.** CDP expands it into N independent single-`dueDate` invoices before calling Bill.com; terms are a hardcoded `"NET_30"` on the customer | `CDP/apps/Utilities/src/contractAutomation/steps/billcom_integration.ts:424-437,358` | §6 |
| The Bill.com **future send date is not used and not modelled** — `sentDate` is declared once and never written; the sending step is a TODO stub | `CDP/…/types/index.ts:399`, `steps/invoice_delivery.ts:32-36` | Today's "book now, send later" is being done **by hand in the Bill.com UI**. §6 |
| The Bill.com invoice id is **never persisted to any entity** — it survives only in a run-log JSON blob | `CDP/…/database/DDL.sql:104-117` | The schedule row is where it has to live |
| `bizapps-tasks` has **no Project entity, no time/effort log, and no money of any kind**; `PercentComplete` is a freely-editable `INT` rounded at each rollup tier | `bizapps-tasks/migrations/B202604011500…:65`, `Core/src/services/TaskService.ts:24-79` | §5.4 — tasks may *inform* a measurement, never *post* one |

### 2.1 One correction for Monday: the renewal job exists

Jeremy's note says *"There is no such job."* The job is built and has a preview mode:
`Orders.SpawnRenewals` — `packages/CoreEntitiesServer/src/SpawnRenewalsOperation.ts` (415 lines),
`Preview?: boolean` at `:67`, two independent idempotency guards, a `MaxOrders` safety valve, and
check-suite coverage asserting a second run is a no-op. It landed in PR #77, after the issues
(#112/#104/#25) that said renewal automation was out of scope.

His *observation* is correct, and the selection SQL explains it. `SpawnRenewalsOperation.ts:231`:

```sql
AND l.EndDate <= DATEADD(DAY, COALESCE(s.RenewalLeadDays, t.RenewalLeadDays, 0), '<asOf>')
```

With `RenewalLeadDays` null on both the subscription and its type it coalesces to **0**, so the job
only ever finds terms that have already ended — it finds nothing, and every term stays `TermNumber 1`.
No scheduler wiring exists either.

**So Amith's go-live gate is a configuration and scheduling task, not a build.** Populate
`RenewalLeadDays` (or `SubscriptionType.RenewalLeadDays`), run the operation with `Preview: true`
over the 90 days after cutover, and Johanna gets her list. That is worth confirming in the room,
because "needs a build" and "needs two config values" produce very different plans for the next
nineteen days.

---

## 3. Part A — `OrderHeaderPaymentSchedule`

### 3.1 Why it belongs on the order (D85)

Jeremy's mental model is the contract — *"the schedule lives on the contract as the Contract Term
Payment Schedule."* That is true of CDP. It must not become true of AIDP:

- `bizapps-contracts` **owns no money at all**, by explicit ruling: *"A number in this app is never
  a number about money owed. That boundary is the single most important thing to understand about the
  design, because the previous version of this app crossed it"* (`bizapps-contracts/README.md:42-46`).
  No monetary column exists on any of its six tables.
- Contracts **v1 did have this table** — `ContractBillingSchedule` + `ContractBillingEvent`, keyed on
  `ContractTermID`, with `ScheduleType` of `Cadence | Milestone | Custom`. The 2026-08-23 clean-sheet
  rebuild deleted them *"so keeping it here would leave two systems that have to agree about money"*,
  and a unit test now asserts they never come back.
- Contracts holds **no reference to orders at all** — not an FK, not a soft UUID. Orders is not
  reachable from contracts without going through the deal.

The receivable is on the order, the invoice is a presentation of the order, and payment application
already lands on `PaymentLine.OrderHeaderID`. **The schedule goes where the money is.** Amith's
placement is the only one consistent with the architecture.

**Worth lifting from git history anyway:** `ContractBillingEvent`'s shape is close to what we need,
including its `Status` enum and a filtered-unique index on the generated order — recover with
`git show 60be120~1:migrations/V202608040002__v0.1.x__Tables_and_Objects.sql` in the contracts repo.
Note where it bit: the `OrderID` + `Status='Generated'` idempotency machinery is exactly where the
two-owners problem surfaced.

**Open question for the room:** does the *obligation* (what the paper says we will invoice, and when)
also need recording in contracts, separately from the *execution* (what we actually invoiced and
collected)? The proposal is **no — one owner, orders** — but Jeremy should confirm the paper facts he
needs are covered by `Contract.EffectiveDate`/`EndDate`/`AnnualIncreasePercent` plus the order's
schedule.

### 3.2 Shape

```sql
CREATE TABLE ${flyway:defaultSchema}.OrderHeaderPaymentSchedule (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderHeaderID       UNIQUEIDENTIFIER NOT NULL,
    CompanyID           UNIQUEIDENTIFIER NOT NULL,   -- stamped server-side, never authored
    InstallmentNumber   INT              NOT NULL,
    DueDate             DATE             NOT NULL,
    Amount              DECIMAL(18,2)    NOT NULL,
    Status              NVARCHAR(20)     NOT NULL DEFAULT 'Scheduled',

    -- identity, frozen at the moment of invoicing (§3.3)
    DocumentNumber      NVARCHAR(40)     NULL,
    InvoicedAt          DATETIMEOFFSET   NULL,
    InvoicedByUserID    UNIQUEIDENTIFIER NULL,
    JournalEntryID      UNIQUEIDENTIFIER NULL,       -- the AR reclass entry

    -- what the customer actually holds (§3.6, §6)
    ExternalSystem      NVARCHAR(40)     NULL,       -- 'BillCom' | 'BusinessCentral' | …
    ExternalInvoiceRef  NVARCHAR(100)    NULL,
    SentAt              DATETIMEOFFSET   NULL,       -- NULL = unsent. Jeremy's test.

    AmountPaid          DECIMAL(18,2)    NOT NULL DEFAULT 0,   -- rolled up by trigger
    Balance             AS (Amount - AmountPaid) PERSISTED,
    Description         NVARCHAR(500)    NULL,
    Notes               NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_OrderHeaderPaymentSchedule PRIMARY KEY (ID),
    CONSTRAINT UQ_OHPS_Installment UNIQUE (OrderHeaderID, CompanyID, InstallmentNumber)
);
```

`Status IN ('Scheduled','Invoiced','Paid','Canceled','WrittenOff')` — mirroring
`OrderHeader.PaymentStatus`'s vocabulary rather than inventing a second one.

No `__mj_CreatedAt`/`__mj_UpdatedAt`, no FK indexes — CodeGen owns both.

**Why `CompanyID` (D86).** The line is the unit of money (ERD rule 1); journal entries are
per-line-per-company; the invoice document is already split per selling company with the invariant
`Σ documents.Gross === OrderHeader.TotalGross`. AR is therefore per company, and Business Central
runs separate company books, so an instalment that spans two companies is already two invoices with
two remit-to addresses. Stamping `CompanyID` (like `OrderLine.CompanyID`, derived and never authored)
keeps the schedule aligned with the ledger and with the document split. **For a single-company order
— which is nearly all of them — nobody sees it.**

The alternative is a header-level schedule spread pro-rata across companies at render time using the
existing `SpreadAcrossCompanies`. Less schema, but a company cannot then have its own cadence, and
the spread can shift under a frozen document number. Flagging it as an alternative; recommending
per-company.

### 3.3 The schedule row is where invoice identity lives (D87)

The "no Invoice record" doctrine is right and should survive. But it survives *because* the invoice
is re-derivable and identical every time. Instalments break that: `DocumentNumber` is computed from
position (`InvoiceBehavior.ts:331`), so adding, removing or re-dating a row shifts the numbers on
invoices customers already hold, and their AP departments can no longer match them.

The resolution keeps both properties:

- The **invoice stays a presentation** — of `(order × schedule row)` instead of `(order)`. Still no
  `Invoice` table, still derived, still re-renderable.
- The **instalment is a record**, because it is an authored commitment — a date and an amount the
  customer agreed to — not a derivation.
- **Identity attaches to the instalment at invoicing and freezes**, which is the repo's own rule 3
  ("derived money is materialised and then frozen") applied one level out.

Proposed numbering: `ORD-1234-1`, `ORD-1234-2` for a single-company instalment order; `ORD-1234-A1`
where both a company split and instalments apply. Craig should confirm this against whatever
Business Central and Bill.com will accept as an invoice number during the transition.

### 3.4 Invariants

1. **The schedule must tie.** `Σ Amount` per `(OrderHeaderID, CompanyID)` = that company's gross on
   the order. Enforced **at confirm** — refuse the confirm if it does not, the same posture GL
   resolution already takes ("booked money with nowhere to go is worse than no order"), and by
   trigger for any later edit.

   Not being lenient here is deliberate. Treating an unscheduled remainder as "due on the header
   `DueDate`" would silently under-bill, which is the failure `InvoiceBehavior` already warns about:
   *"A dropped charge produces an invoice that is internally consistent, adds up perfectly, and
   undercharges the customer."*

2. **Authoring is generated, not typed.** A helper takes `(count, cadence, first due date)` and emits
   rows that tie by construction, reusing `AllocateEvenly`/`SplitExactly` so the remainder is
   front-loaded and the parts sum exactly. Typing four amounts by hand is how a schedule ends up a
   cent short.

3. **Mutability is by lifecycle, not by confirm (D88).** Line money freezes at confirm
   (`trg_OrderLine_ImmutableAfterConfirm`, error 51003). The schedule must not, because re-dating a
   future uninvoiced instalment is an ordinary commercial act. The rule:
   - a **`Scheduled`** row may be re-dated, re-amounted, split or removed, provided the per-company
     sum still ties;
   - an **`Invoiced`** row is immutable except for payment rollups, `SentAt` and external refs —
     a document is out in the world.

   This is also where Jeremy's reversal policy gets a permanent home: *unsent* is
   `SentAt IS NULL`, as a column, not a convention.

### 3.5 Ageing and payment application

- **Overdue.** An order is overdue if **any** unpaid instalment's due date has passed. One module —
  `packages/Entities/src/overdue.ts` — carries the rule for SQL, TypeScript and the browser at once,
  and `overdue.test.ts` fails if a clause survives in one half and not the other. Contained change.
- **Payment application.** Add a nullable `PaymentLine.OrderHeaderPaymentScheduleID`. Default
  behaviour is oldest-due-first, which is what happens today in effect; the column exists so a human
  can direct a cheque at a specific instalment, which is common ("this is for the 2027 payment").
  `AmountPaid` rolls up by trigger, matching the existing `trg_PaymentLine_RollupTotals` pattern.
  Note `trg_PaymentLine_ImmutableAfterCapture` means a mis-assignment is corrected by reversal, not
  by re-pointing — consistent with everything else here.

### 3.6 The "due with no invoice" report

The control Jeremy says they rely on today falls straight out: schedule rows with
`Status = 'Scheduled'` and `DueDate` inside the invoicing window. Worth shipping as a
`Orders.GetBillingWorklist` operation alongside the existing `Orders.GetOverdueWorklist`, so it is
an operation with a UI rather than a report somebody remembers to run.

**This report is the reason to reclassify AR at invoicing rather than on a forward-dated entry
(D89).** Forward-dating the `Dr AR / Cr Unbilled` reclass at confirm would be elegant — it would keep
the ledger-holds-the-future property with no job at all — but it would make AR appear on the due date
whether or not anyone invoiced, and the worklist above would then be reporting on something the
ledger has already quietly assumed. Reclassifying at the moment of invoicing means **AR only ever
arises from a document that exists**, which is the stronger control and preserves the report's
meaning. It costs one more JE-writing call site, and that call site has to exist anyway because
somebody must generate and send the invoice.

---

## 4. Part A, continued — what changes in code

| Area | File | Change |
|---|---|---|
| Schema | new migration + CodeGen tail | the table above, `PaymentLine.OrderHeaderPaymentScheduleID`, rollup + immutability triggers |
| GL role | `GLAccountResolver.ts:34` | add `UnbilledReceivable`; tolerate non-resolution and record the fallback, exactly as `GiftCardLiability` does |
| Booking entry | `OrderJournalEntryFactory.ts` (~`:291`) | debit Unbilled instead of AR **when the order carries schedule rows with a future due date**; unchanged otherwise |
| Invoicing | new `Orders.IssueInstalmentInvoice` operation | freeze `DocumentNumber`, stamp `InvoicedAt`, emit the reclass JE via `Accounting.CreateJournalEntries`, set status |
| Document | `InvoiceBehavior.ts` / `InvoiceBuilder.ts` | render `(order × instalment)`; show full order value, demand this instalment; keep the ladder tying |
| Ageing | `packages/Entities/src/overdue.ts` | per-instalment |
| Worklist | new `Orders.GetBillingWorklist` | §3.6 |
| Delivery | `DeliveryBehavior.ts` | stamp `SentAt` on success — today nothing durable records a send |

**Absence of schedule rows means one implicit instalment**, synthesized in the derivation layer.
There is then no `if (hasSchedule)` branch in the document code and no backfill against historical
orders — the special case is designed out rather than handled.

---

## 5. Part B — percentage-of-completion

### 5.1 Why it is not a fourth driver

The three shipped types answer *"given what we know at booking, when is this earned?"* — and they are
evaluated exactly once, in the booking transaction, with every resulting entry written forward-dated
(`RevenueRecognition.ts` + `OrderJournalEntryFactory.ts:391-438`). D15 in accounting is the same
statement from the other side: *"no schedule tables, no materializer, no daily job."*

Percentage-of-completion answers a different question — *"given what we now know about progress, how
much should be earned to date?"* — and the answer is not knowable at booking. It cannot be expressed
as `BuildSchedule(context) → entries` without the method lying about its own contract.

It also cannot be staged and then edited: accounting's staged entries are immutable once batched, and
D15's sanctioned mechanism for change is *"correcting orders whose entries NET against what's
staged."* Which is precisely what the design below does — so this is D15-native, not a departure
from it.

### 5.2 Cumulative catch-up, which makes reversal fall out for free

Record an **observation**; compute the entry as the difference from what has already been recognized:

```
target = LineAmount × CumulativePercentComplete
delta  = target − recognizedToDate

delta > 0   Dr Deferred Revenue / Cr Sales            (|delta|)
delta < 0   Dr Sales            / Cr Deferred Revenue (|delta|)   ← mirrorIf, the existing idiom
delta = 0   no entry — a legitimate outcome, not a failure
```

Amith's backward-slide case — 50% one month, 40% the next — is **not a feature**. It is what the
subtraction does. There is no reversal path to build, no special case to test, and no way for the
two to drift apart, which is the repo's own "special case → out of existence" principle applied to
the thing most likely to be got wrong.

Three further properties worth having:

- **Self-correcting.** A bad observation is corrected by the next one; nothing needs unwinding.
- **Ties exactly at completion.** At 100%, `target = LineAmount`, so the final catch-up lands the
  remaining cent regardless of the rounding history.
- **Uses the existing reversal mechanics.** `mirrorIf` swaps Dr/Cr and keeps amounts positive
  (`OrderJournalEntryFactory.ts:116`), which is what accounting's `CK_JEL_OneSide` requires.

Note the one thing *not* to use: `Accounting.GenerateJournalEntryReversal` stamps
`EffectiveDate = today`, which for a forward-dated staged entry produces a reversal dated before the
entry it reverses. Netting forward is the right mechanism and the documented one.

### 5.3 Shape

```sql
CREATE TABLE ${flyway:defaultSchema}.OrderLineProgressMeasurement (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderLineID             UNIQUEIDENTIFIER NOT NULL,
    MeasurementDate         DATE             NOT NULL,   -- the period this observation governs
    PercentComplete         DECIMAL(7,4)     NOT NULL,   -- CUMULATIVE, 0..1
    MethodCode              NVARCHAR(40)     NOT NULL,   -- ManualAttestation | CostToCost | UnitsDelivered | MilestoneWeighted

    -- the quantitative inputs, kept for audit even though PercentComplete drives the entry
    MeasureNumerator        DECIMAL(18,4)    NULL,
    MeasureDenominator      DECIMAL(18,4)    NULL,

    -- provenance
    AttestedByUserID        UNIQUEIDENTIFIER NULL,
    SourceEntityID          UNIQUEIDENTIFIER NULL,       -- where a derived number came from
    SourceRecordID          NVARCHAR(400)    NULL,
    Notes                   NVARCHAR(MAX)    NULL,

    -- the result, stamped when the entry is written
    RecognizedToDateBefore  DECIMAL(18,2)    NULL,
    RecognizedToDateAfter   DECIMAL(18,2)    NULL,
    RecognitionAmount       DECIMAL(18,2)    NULL,       -- the delta; NEGATIVE on a backward slide
    JournalEntryID          UNIQUEIDENTIFIER NULL,
    Status                  NVARCHAR(20)     NOT NULL DEFAULT 'Draft',
    CONSTRAINT PK_OrderLineProgressMeasurement PRIMARY KEY (ID),
    CONSTRAINT UQ_OLPM_Period UNIQUE (OrderLineID, MeasurementDate),
    CONSTRAINT CK_OLPM_Percent CHECK (PercentComplete >= 0 AND PercentComplete <= 1)
);
```

**A posted observation is immutable, and corrections happen forward.** You do not restate a period
that has been recognized and swept into a batch; you observe again in the current period and let the
catch-up absorb it. That is both the accounting-correct answer and the only one compatible with
accounting having no period-close machinery to reopen (D2).

`RecognizedToDateBefore/After` are materialised for the audit chain, and a check asserts they agree
with the sum of posted recognition entries for the line — the same belt-and-braces the invoice
ladder already uses.

### 5.4 Where the number comes from — and why not from `bizapps-tasks`

Jeremy's sharpest point in the thread is that *"there is no feedback loop of any kind from delivery
to Finance."* He is right, and it is a process gap rather than a schema gap. `bizapps-tasks` does not
close it:

- **No Project entity.** A "project" is a convention — a root `Task` with `ParentID IS NULL`. No
  name, number, owner, customer, contract or budget of its own.
- **No time or effort log of any kind.** `Task.HoursActual` is a single hand-entered scalar with no
  history, no author, no date and no consumer anywhere in the codebase. So no *input* method
  (cost-to-cost, labour-hours) — the methods auditors prefer — has a source.
- **No money anywhere in the schema.** No contract value, budget, cost, rate or currency column.
- **`PercentComplete` is an `INT`, `Math.round`ed at every rollup tier**, freely hand-editable, with
  no approval, no lock and no immutability once a period is recognized.
- `OnComplete` fires from two independent dispatchers, so anything wired to it must be idempotent.

Driving revenue off a task checkbox would also mean that closing tickets moves revenue — a control
weakness before it is an accuracy problem.

**Recommendation (D90): the observation is an attestation, not a measurement.** The number may be
derived from anywhere — including, later, a cost-to-cost calculation once time logging exists (it is
on the tasks backlog) — but a named person signs it, and the attestation is what posts. That makes
every entry explainable and every reversal attributable, which is what you want the first time a
project slides backwards and someone asks why revenue moved.

Version 1 is therefore a monthly attestation screen listing every open POC line with its last
observation, owned by the delivery lead, on the close calendar. That is a real feedback loop, and it
does not need automation to exist — it needs an owner and a cadence. `bizapps-tasks` can carry the
recurring close task itself.

### 5.5 The driver seam

Keep the pluggability doctrine, but be honest that this is a second family:

```ts
export abstract class ProgressRecognitionDriver {
    /** Cumulative fraction earned, from one observation. Pure: no I/O. */
    public abstract PercentComplete(m: ProgressMeasurement): number;
}
@RegisterClass(ProgressRecognitionDriver, 'ManualAttestation')
@RegisterClass(ProgressRecognitionDriver, 'CostToCost')
@RegisterClass(ProgressRecognitionDriver, 'UnitsDelivered')
```

`RevenueRecognitionType` gains a discriminator — `ScheduleBasis` with a CHECK of
`AtBooking | OnMeasurement`, following the repo's preference for value lists over booleans that decay
(44 columns are already CHECK-constrained this way). A POC type is then `IsDeferred = 1` +
`ScheduleBasis = 'OnMeasurement'`, and the branch at `OrderJournalEntryFactory.ts:391` becomes
`if (revRec.IsDeferred && revRec.ScheduleBasis === 'AtBooking' && !isGiftCard)` — so a POC line books
`Dr Unbilled / Cr Deferred Revenue` and stages **no** recognition entries. Small blast radius:
`IsDeferred` has only two real branch points today.

New operation `Orders.RecordProgress`, shaped like `CancelSubscriptionOperation` — one transaction,
logical failures returned inside the output rather than thrown, and a `Preview` flag (as
`SpawnRenewals` has) so finance can see the entry before it posts. It emits through the existing
`Accounting.CreateJournalEntries`, which joins the caller's transaction, so **no new accounting API
is needed**.

Entries are typed `RevenueRecognition`, which orders already seeds — so they are picked up by
accounting's existing monthly sweep (`.accounting-post-subscriptions-monthly.json`, cron `0 0 3 1 * *`,
`EntryTypeCodes: ["RevenueRecognition"]`, `AutoPost: true`) with no scheduling work at all.

---

## 6. Bill.com

The thread assumes more than the code does, and the correction simplifies the work.

- **Bill.com never receives a schedule.** CDP expands `explicitPayments[]` into N discrete invoices
  via an LLM prompt (`contract_processing.ts:4291`) and posts each one flat:
  `{ customer, invoiceNumber, invoiceDate, dueDate, description, subtotal, total, isActive, status, invoiceLineItems }`
  — one `dueDate`, `subtotal === total`, no terms, no instalments, no partial amounts. Terms are a
  hardcoded `paymentTerms: "NET_30"` on the *customer* record, not read from the contract.
- **The future send date is not being set by code.** `sentDate` is declared once and never written;
  Step 7 `invoice_delivery.ts` is a TODO stub that reports `invoicesDelivered` without delivering
  anything; there is no `/send` or `/email` call. Whatever future-dating happens today is **manual,
  in the Bill.com UI**.

So the integration requirement is *smaller* than it looks: **create the Bill.com invoice when the
schedule row enters the window**, which is exactly what Jeremy's preferred path 2 already does by
hand, and which removes the need for the future-send trick entirely. What the schedule row must carry
is `ExternalSystem`, `ExternalInvoiceRef` and `SentAt` — because today the Bill.com invoice id is
**not persisted to any entity at all**, only into a run-log JSON blob, so you cannot currently answer
"what is this invoice's Bill.com id?" from the database.

Two things to raise rather than quietly inherit:

- **The Bill.com integration is the least production-ready touchpoint in the estate**: both
  `.env.prod` and `.env.stage` point at `gateway.stage.bill.com` while labelled Production;
  auth is username/password + devKey in a plaintext body; invoice↔contract matching is heuristic
  (customer number *or* amount *or* a 4-character name prefix); dedupe is client-side over a
  100-record page. If outbound invoicing is going to be load-bearing from 10/1, the pattern to copy
  is `bizapps-accounting`'s Business Central batch export — OAuth, an approval seal, drift detection,
  failure triage and a real cron.
- **Bill.com was evaluated for ACH and dropped in favour of Stripe** (D77, Amith, 2026-08-02). The
  posture is therefore Stripe for money in, Bill.com for invoice delivery only. Worth restating so
  nobody rebuilds payment capture on it.

---

## 7. Sequencing

**On the critical path for 10/1** — because the conversion policy depends on it:

1. `OrderHeaderPaymentSchedule` + authoring helper + the tie-at-confirm invariant.
2. The `Unbilled Receivable` role and the booking-entry split (§1.1). **Without this, converting an
   Active Contract with a long-dated instalment reproduces the Business Central gross-up on day one.**
3. `Orders.GetBillingWorklist` — the due-with-no-invoice control.

**Needed by the first billing run after 10/1**, which is days later rather than on the date itself:

4. Per-instalment invoice rendering with a frozen `DocumentNumber`.
5. Per-instalment ageing and payment application.
6. `SentAt` stamping and the Bill.com external ref.

**After cutover** — Amith has already agreed manual rev-rec adjustment for 10/1:

7. Percentage-of-completion (§5), including the attestation screen and its close-calendar owner.

The schedule table is a conversion dependency, not a nice-to-have, and Boston needs its columns
settled before he can write the Active Contracts importer. **Sending Jeremy the column template
ahead of Danny's return on 9/16 is the single highest-value thing to come out of Monday** — he asked
for it explicitly, and it lets accounting build the spreadsheet once.

Useful for that conversation: CDP already has a persisted `Contract Term Payment Schedules` entity
(`ContractTermID`, `ContractTermLineItemID`, `PaymentDate`, `Amount`, `Status`, `Comments`) written by
`contract_processing.ts:3652`. The conversion source is a real table, not a spreadsheet guess.

---

## 8. Decisions needed Monday

| # | Decision | Owner |
|---|---|---|
| D85 | The schedule lives on the order, not the contract. Contracts records the paper; orders records the money | Amith / Jeremy |
| D86 | Schedule rows carry a stamped `CompanyID`, so an instalment aligns with the per-company invoice split — or, alternatively, stay header-level and spread pro-rata | Amith / Craig |
| D87 | The schedule row carries invoice identity, frozen at invoicing. There is still no `Invoice` table | Amith |
| D88 | `Scheduled` rows are mutable while the sum ties; `Invoiced` rows are immutable. Unsent is `SentAt IS NULL` | Jeremy |
| **D89** | **AR arises on invoicing, not on booking. Confirm debits an unbilled/contract-asset account.** One role or two? | **Johanna / Jeremy / Andrew** |
| D90 | POC progress is an attestation with a named signer, not an automated feed from `bizapps-tasks` | Andrew / Jeremy |
| — | Confirm the renewal gate is config + scheduling, not a build (§2.1) | Andrew / Johanna |
| — | Invoice numbering format for instalments, against what BC and Bill.com will accept | Craig / Jeremy |

**D89 is the one that cannot be deferred.** Everything in Part A is presentation until the booking
entry stops debiting AR for money that is not yet billable, and the conversion policy Jeremy proposes
assumes it.

---

## 9. Adjacent, and deliberately not in this plan

- **A terminal batch status that does not release its members.** Andrew's ask, and Amith agreed to an
  issue. Accounting's `Cancelled` today runs `TearDownSummaryAndUnlock` and returns every member to
  `Pending`, where the nightly sweep picks it up again — the opposite of what a conversion batch
  needs. Small, separable, and it belongs in `bizapps-accounting` with a required reason and the
  batch still visible in the list (Jeremy's amendment). Not this plan.
- **Escalation.** `Contract.AnnualIncreasePercent` exists only because orders has no escalation
  concept; renewals price at then-current product pricing and finance reconciles by hand (contracts
  D-1). A multi-year instalment schedule makes this more visible, not less. Worth filing.
- **Issue #34 (`OrdersCompanyProfile`).** Per-company payment-terms defaults are already dead; a
  per-company default billing cadence would want the same home. Worth folding in if #34 is picked up.
- **Issue #179.** `OrdersEngine`'s product cache never refreshes, so a new `RevenueRecognitionType`
  will not take effect until MJAPI restarts. Will bite whoever first configures a POC product.
