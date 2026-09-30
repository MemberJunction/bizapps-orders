# Payment schedules and percentage-of-completion revenue recognition

**Status:** DECIDED — build all of it, as one body of work. Nothing implemented yet.
**Decision:** Amith Nagarajan, 2026-09-12, from the AIDP-Next conversion thread (Andrew Schwartz
Crane, Jeremy Hunnewell, Johanna Snider, Robert Kihm, Boston Gunderson).
**Implementation:** Craig Adam. **Review:** Amith.
**Decisions recorded here:** D85–D90 (D84 was the previous ceiling in `plans/archive/`).

---

## 0. Scope, and why it is one plan

Blue Cypress sells contracts billed in instalments — semi-annual, quarterly, or one payment per year
of a multi-year deal — and sells project work that is earned as it is delivered. Orders can express
neither. `OrderHeader` carries a single `DueDate`, `PaymentTermsType` carries only `NetDays`, there
is no instalment concept in any of the 49 tables, and the three revenue-recognition types are
booking, straight-line and on-completion.

This plan adds both, plus the balance-sheet change they share. **The three parts are not
independently shippable**, and that is the reason they are one PR rather than three:

- The instalment table on its own is cosmetic, because confirming an order still debits Accounts
  Receivable for the whole order value (§1).
- Percentage-of-completion needs the same contract-asset account, in the opposite direction — a
  project that has earned more than it has billed.
- The conversion policy Jeremy proposed for 10/1 assumes both.

Ordering inside §10 is delivery sequence, not scope negotiation. The whole of it is committed.

---

## 1. The finding that orders the work

> **Confirming an order today debits Accounts Receivable for the full order value, immediately.**

`OrderJournalEntryFactory` (`packages/CoreEntitiesServer/src/OrderJournalEntryFactory.ts:1-27`,
plan D11) books, per line, at confirm:

```
Dr  Accounts Receivable      net + tax + charges
Dr  Sales Discounts          discount
    Cr  Sales                gross          (UpFront)
    Cr  Deferred Revenue     gross          (deferred)
```

A three-year contract billed annually therefore lands with all three years in AR on day one, against
an equal Deferred Revenue credit.

That is precisely the condition Jeremy is asking us to stop reproducing:

> *"That receivable sits in AR today even though our right to the money is conditional on our
> performing for two more years, and it carries an equal deferred revenue credit, so we are grossing
> up both sides and make a monthly AR aging adjustment to move 'long term AR' out of the primary AR
> account."*

So his conversion policy — reverse the unsent future invoices, hold the obligation as a dated
schedule row with no invoice behind it — **cannot be implemented on top of the current booking
entry**. Convert an Active Contract with a 3/18/2029 instalment and we reproduce the gross-up on
AIDP's first day, having moved the problem rather than fixed it.

### 1.1 AR arises on billing, not on booking (D89)

One new GL role, and the booking entry splits:

```
At confirm, per line — only the debit account changes:
Dr  Unbilled Receivable       net + tax + charges     ← contract asset, NOT AR
Dr  Sales Discounts           discount
    Cr  Sales / Deferred Revenue   gross              (unchanged)

At each instalment's invoicing, per (instalment × company):
Dr  Accounts Receivable       instalment amount
    Cr  Unbilled Receivable   instalment amount
```

Read at any date the balance sheet then says: **AR = billed and unpaid · Unbilled = contracted, not
yet billable · Deferred Revenue = unearned.** That is the ASC 606 presentation, it removes the
monthly long-term-AR reclass Jeremy does by hand, and it gives the 2029 obligation a home that is a
dated row rather than a receivable.

**Orders with no schedule behave exactly as today** — one implicit instalment, due on the header
`DueDate`, AR at confirm. No existing order changes, and there is no backfill.

There is no such role today: `GL_ROLE` is Accounts Receivable, Sales, Sales Discounts, Deferred
Revenue, Sales Returns and Allowances, Cash, Processing Fee, Gift Card Liability
(`GLAccountResolver.ts:34-61`). Accounting seeds ten roles and none of them is an unbilled or
contract-asset account.

---

## 2. What was verified, and what was not

Read across `bizapps-orders`, `bizapps-accounting`, `bizapps-contracts`, `bizapps-tasks`, MJ core and
the legacy CDP/AIDP code. Each item below changed the shape of the plan.

**Not verified, taken on report:** the Bill.com integration. Amith reports it exists and fires when
an order reaches Confirmed, most likely in the MJ integrations repo, which is not available in the
session this plan was written from. Everything in §8 is written as a change to something that exists;
**Craig should confirm its location and current trigger before starting §8**, because one of its
properties (§8.1) is a hazard rather than a nicety.

| Finding | Where | Consequence |
|---|---|---|
| There is no `Invoice` record, by design — "the confirmed order IS the receivable" | `InvoiceBehavior.ts:5` | The schedule row has to carry invoice identity — §6.1 |
| The invoice document number is **derived from position** — `ORD-1234`, `-A`/`-B` per selling company | `InvoiceBehavior.ts:331` | A derived number shifts when the schedule changes. Must freeze at invoicing |
| Statements deliberately DO have storage, because re-deriving gives a different document | `InvoiceBehavior.ts:11-13` | Precedent: some documents legitimately need identity |
| The invoice splits per selling company, invariant `Σ documents.Gross === OrderHeader.TotalGross` | `InvoiceBehavior.ts:15-23` | Instalments make this two-dimensional — §4.2 |
| `IsOverdue` is single-sourced across SQL, TypeScript and the browser, with a test asserting every clause survives in each half | `packages/Entities/src/overdue.ts`, `overdue.test.ts` | Per-instalment ageing is **one module** to change |
| Rev-rec drivers compute the whole schedule **once, at booking**, pure and I/O-free | `RevenueRecognition.ts:11-16`, `OrderJournalEntryFactory.ts:394` | POC cannot use this contract — §9.1 |
| Reversal idiom is swapping Dr/Cr; amounts stay positive | `OrderJournalEntryFactory.ts:116` (`mirrorIf`) | A POC backward slide reuses it exactly — no new machinery |
| `OrderHeader.Balance` is a plain column maintained by trigger, not a computed column | `V202607061432…:333,2830-2849` | The schedule's `Balance` must follow the same pattern |
| Rollup triggers early-return on zero-row statements — touching a table-type variable there deadlocks against CodeGen's `__mj_UpdatedAt` backfill inside the migration transaction | `V202607061432…:2897-2909` | Copy the guard verbatim — §11 |
| Accounting has **no accounting periods and no close machinery** — deliberate (D2); the ERP owns periods | `bizapps-accounting/plans/…-master.md:141,176-193` | POC period discipline is the accountant's, enforced by the batch cutoff, not a period FK |
| D15: deferred revenue is real forward-dated JEs; **no schedule tables, no materializer**; changes produce *"correcting orders whose entries NET against what's staged — staged entries are never edited or deleted"* | `bizapps-accounting/plans/…-master.md:153` | Cumulative catch-up is D15-native, not a departure from it — §9.2 |
| `Accounting.CreateJournalEntries` takes `{Drafts:[]}` and **joins an existing transaction** rather than opening its own | `bizapps-accounting/.../AccountingEngine.ts:120-135` | A later caller can emit JEs with **no new accounting API** |
| Accounting's JE draft carries **no `CompanyID`** — the engine derives it from the lines' accounts and rejects a multi-company draft (`MULTI_COMPANY_DRAFT`) | `bizapps-accounting/packages/EngineBase/src/contract.ts:37` | The reclass entry must be split per company before it is handed over — §4.2 |
| Orders already seeds the `RevenueRecognition` JE type, and accounting's monthly job sweeps exactly that code with `AutoPost: true` | `metadata/journal-entry-types/`, `.accounting-post-subscriptions-monthly.json` | POC entries need **no scheduling work** — they ride the existing sweep |
| Contracts has **no `ContractTerm` and no payment schedule** — both existed in v1 and were deleted 2026-08-23, their job moved to orders | `bizapps-contracts/migrations/B202608040001…:19-28` | §4.1 |
| A unit test asserts the deleted v1 entities never register again | `bizapps-contracts/.../class-registration.test.ts:53-104` | The boundary is enforced, not merely documented |
| `bizapps-tasks` has **no Project entity, no time or effort log, and no money column of any kind**; `PercentComplete` is a freely-editable `INT`, `Math.round`ed at every rollup tier, with no lock after a period is recognised; `OnComplete` fires from two independent dispatchers | `bizapps-tasks/migrations/B202604011500…:65`, `Core/src/services/TaskService.ts:24-79` | Tasks may *inform* a measurement, never *post* one — §9.4 |
| CDP holds a persisted `Contract Term Payment Schedules` entity (`ContractTermID`, `ContractTermLineItemID`, `PaymentDate`, `Amount`, `Status`, `Comments`) | `CDP/.../contract_processing.ts:3652,3893-3902` | The **conversion source is a real table**, not a spreadsheet guess. CDP is a source, never a target |

### 2.1 One correction for the thread: the renewal job exists

Jeremy's note says *"There is no such job."* It is built, with a preview mode:
`Orders.SpawnRenewals` — `packages/CoreEntitiesServer/src/SpawnRenewalsOperation.ts` (415 lines),
`Preview?: boolean` at `:67`, two independent idempotency guards, a `MaxOrders` safety valve, and
check-suite coverage asserting that a second run is a no-op. It landed in PR #77, after the issues
(#112 / #104 / #25) that recorded renewal automation as out of scope.

His *observation* is correct, and the selection SQL explains it — `SpawnRenewalsOperation.ts:231`:

```sql
AND l.EndDate <= DATEADD(DAY, COALESCE(s.RenewalLeadDays, t.RenewalLeadDays, 0), '<asOf>')
```

With `RenewalLeadDays` null on both the subscription and its type it coalesces to **0**, so the job
only finds terms that have already ended — it finds nothing, and every term stays `TermNumber 1`.
No scheduler wiring exists either.

**The go-live gate is therefore configuration and scheduling, not a build.** Populate
`RenewalLeadDays` (on the subscription or its type), run the operation with `Preview: true` across
the 90 days after cutover, and Johanna has her list. Not part of this PR; it needs saying because
"needs a build" and "needs two config values" produce very different plans for the next nineteen days.

---

## 3. Decisions

| # | Decision |
|---|---|
| **D85** | The payment schedule lives on the **order**, not the contract. Contracts records the paper; orders records the money. |
| **D86** | Schedule rows carry a **stamped `CompanyID`**, derived server-side from the lines they bill, never authored. |
| **D87** | The schedule row **carries invoice identity**, frozen at the moment of invoicing. There is still no `Invoice` table. |
| **D88** | Mutability is by lifecycle: a `Scheduled` row is editable while the per-company sum still ties; an `Invoiced` row is immutable. **Unsent is `SentAt IS NULL`**, as a column. |
| **D89** | **AR arises on invoicing, not on booking.** Confirm debits an unbilled/contract-asset account; each instalment's invoicing reclassifies it to AR. |
| **D90** | POC progress is an **attestation with a named signer**, recorded as a dated observation, with recognition computed by cumulative catch-up. It is not an automated feed from `bizapps-tasks`. |

### 3.1 D85 — why the order, given that Jeremy says "contract"

Jeremy's mental model is CDP's, where the schedule hangs off the contract term. That must not become
true of AIDP:

- `bizapps-contracts` **owns no monetary column at all**, by explicit ruling: *"A number in this app
  is never a number about money owed. That boundary is the single most important thing to understand
  about the design, because the previous version of this app crossed it"* (`bizapps-contracts/README.md:42-46`).
- Contracts **v1 had exactly this table** — `ContractBillingSchedule` + `ContractBillingEvent`, keyed
  on `ContractTermID`, with `ScheduleType` of `Cadence | Milestone | Custom`. The 2026-08-23
  clean-sheet rebuild deleted them *"so keeping it here would leave two systems that have to agree
  about money"*, and a unit test now prevents their return.
- Contracts holds **no reference to orders** — not an FK, not a soft UUID. It is unreachable from
  there without going through the deal.

The receivable is on the order, the invoice is a presentation of the order, and payment application
already lands on `PaymentLine.OrderHeaderID`. The schedule goes where the money is.

**Worth lifting anyway:** `ContractBillingEvent`'s shape is close to what we need, including its
status vocabulary and a filtered-unique index on the generated order. Recover with
`git show 60be120~1:migrations/V202608040002__v0.1.x__Tables_and_Objects.sql` in the contracts repo.
Note where it bit: the `OrderID` + `Status='Generated'` idempotency machinery is exactly where the
two-owners problem surfaced.

**To confirm with Jeremy:** that the *paper* facts he needs are covered by `Contract.EffectiveDate` /
`EndDate` / `AutoRenew` / `RenewalNoticeDays` / `AnnualIncreasePercent` plus the order's schedule, so
nothing has to be recorded twice.

---

## 4. Part A — `OrderHeaderPaymentSchedule`

### 4.1 Shape

```sql
CREATE TABLE ${flyway:defaultSchema}.OrderHeaderPaymentSchedule (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderHeaderID       UNIQUEIDENTIFIER NOT NULL,
    CompanyID           UNIQUEIDENTIFIER NOT NULL,   -- stamped server-side, never authored (D86)
    InstallmentNumber   INT              NOT NULL,
    DueDate             DATE             NOT NULL,
    Amount              DECIMAL(18,2)    NOT NULL,
    Status              NVARCHAR(20)     NOT NULL DEFAULT 'Scheduled',

    -- identity, frozen at invoicing (D87)
    DocumentNumber      NVARCHAR(40)     NULL,
    InvoicedAt          DATETIMEOFFSET   NULL,
    InvoicedByUserID    UNIQUEIDENTIFIER NULL,
    JournalEntryID      UNIQUEIDENTIFIER NULL,       -- the AR reclass entry

    -- what the customer actually holds (D88, §8)
    ExternalSystem      NVARCHAR(40)     NULL,
    ExternalInvoiceRef  NVARCHAR(100)    NULL,
    SentAt              DATETIMEOFFSET   NULL,       -- NULL = unsent. Jeremy's test, as a column.

    AmountPaid          DECIMAL(18,2)    NOT NULL DEFAULT 0,   -- trigger-maintained
    Balance             DECIMAL(18,2)    NULL,                 -- trigger-maintained, same statement
    Description         NVARCHAR(500)    NULL,
    Notes               NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_OrderHeaderPaymentSchedule PRIMARY KEY (ID),
    CONSTRAINT UQ_OHPS_Installment UNIQUE (OrderHeaderID, CompanyID, InstallmentNumber),
    CONSTRAINT CK_OHPS_Status CHECK (Status IN ('Scheduled','Invoiced','Paid','Canceled','WrittenOff')),
    CONSTRAINT CK_OHPS_Amount CHECK (Amount > 0),
    CONSTRAINT CK_OHPS_InvoicedHasIdentity
        CHECK (Status = 'Scheduled' OR (DocumentNumber IS NOT NULL AND InvoicedAt IS NOT NULL))
);
```

`Balance` is a **plain column maintained in the same trigger statement as `AmountPaid`**, matching
`OrderHeader` (`V202607061432…:2830-2849`) — not a computed column, so the behaviour is identical to
the header rollup a reader already knows.

The status vocabulary deliberately mirrors `OrderHeader.PaymentStatus` rather than inventing a second
one. `CK_OHPS_InvoicedHasIdentity` is what makes D87 structural instead of conventional.

No `__mj_CreatedAt` / `__mj_UpdatedAt`, no FK indexes — CodeGen owns both.

### 4.2 Why `CompanyID` (D86)

The line is the unit of money (ERD rule 1); journal entries are per-line-per-company; the invoice
document is already split per selling company with `Σ documents.Gross === OrderHeader.TotalGross`.
AR is therefore per company. Three consequences make the column load-bearing rather than tidy:

1. **Accounting will refuse a multi-company draft.** The JE draft carries no `CompanyID`; the engine
   derives it from the lines' accounts and returns `MULTI_COMPANY_DRAFT` if they disagree
   (`bizapps-accounting/packages/EngineBase/src/contract.ts:37`). The reclass entry has to be
   per-company regardless, so the schedule may as well be.
2. **Business Central runs separate company books**, so an instalment spanning two companies is
   already two invoices with two remit-to addresses.
3. **A frozen document number must not move.** A header-level schedule spread pro-rata at render time
   can shift under a number already sent.

Stamp it like `OrderLine.CompanyID` — derived at save, whatever the caller passes is overwritten. For
a single-company order, which is nearly all of them, nobody sees it.

### 4.3 Invariants

**The schedule must tie.** `Σ Amount` per `(OrderHeaderID, CompanyID)` equals that company's gross on
the order. Enforced **at confirm** — refuse the confirm if it does not, the same posture GL
resolution already takes ("booked money with nowhere to go is worse than no order") — and by trigger
for any later edit.

Leniency here would be a mistake. Treating an unscheduled remainder as "due on the header `DueDate`"
silently under-bills, which is the failure `InvoiceBehavior` already names: *"A dropped charge
produces an invoice that is internally consistent, adds up perfectly, and undercharges the customer."*

**Authoring is generated, not typed.** A helper takes `(count, cadence, first due date)` and emits
rows that tie by construction, reusing `AllocateEvenly` / `SplitExactly` so the remainder is
front-loaded and the parts sum exactly. Hand-typing four amounts is how a schedule ends up a cent
short and a confirm gets refused for reasons nobody can see.

**Mutability is by lifecycle, not by confirm (D88).** Line money freezes at confirm
(`trg_OrderLine_ImmutableAfterConfirm`, error 51003). The schedule must not, because re-dating a
future uninvoiced instalment is an ordinary commercial act:

- a **`Scheduled`** row may be re-dated, re-amounted, split or removed, provided the per-company sum
  still ties;
- an **`Invoiced`** row is immutable except for `AmountPaid` / `Balance`, `SentAt`,
  `ExternalSystem` / `ExternalInvoiceRef`, and `Status` advancing to `Paid` / `WrittenOff`.

This is where Jeremy's reversal policy gets a permanent home: *unsent* is `SentAt IS NULL`.

---

## 5. Part B — the ledger change

1. **Add `UnbilledReceivable` to `GL_ROLE`** (`GLAccountResolver.ts:34`). Follow `GiftCardLiability`:
   tolerate it failing to resolve and **record the fallback rather than failing silently**. The
   fallback is AR — the entry stays correct and balanced, just coarser — and the resolver already has
   the shape for saying so.
2. **Split the booking debit** (`OrderJournalEntryFactory.ts` around `:291`). Debit Unbilled instead
   of AR **when the order carries schedule rows with a future due date**; unchanged otherwise. An
   instalment already due at booking — the common first instalment — debits AR directly, so the
   ordinary single-payment order emits exactly the entry it does today.
3. **Emit the reclass at invoicing**, not on a forward-dated entry at confirm (D89). Forward-dating
   would preserve the lovely "ledger holds the future, no job" property, but it would make AR appear
   on the due date whether or not anyone invoiced — and the due-with-no-invoice worklist (§6.3), which
   is the control finance relies on today, would then be reporting on something the ledger had already
   assumed. Reclassifying at invoicing means **AR only ever arises from a document that exists.** It
   costs one more JE-writing call site, and that site has to exist anyway because somebody must
   generate the invoice.

**Seed the GL account links.** The role is useless without an account behind it per company. This is
a data task (`GLAccountLink` rows at company level, per accounting's D12) and it belongs with Johanna,
not in the code.

---

## 6. Part C — invoicing and documents

### 6.1 The schedule row is where invoice identity lives (D87)

"No Invoice record" is right and should survive. It survives *because* the invoice is re-derivable
and identical every time. Instalments break that: `DocumentNumber` is computed from position
(`InvoiceBehavior.ts:331`), so adding, removing or re-dating a row shifts numbers on invoices
customers already hold, and their AP departments can no longer match them.

The resolution keeps both properties:

- The **invoice stays a presentation** — of `(order × schedule row)` instead of `(order)`. Still no
  `Invoice` table, still derived, still re-renderable.
- The **instalment is a record**, because it is an authored commitment — a date and an amount the
  customer agreed to — not a derivation.
- **Identity attaches at invoicing and freezes**, which is the repo's own rule 3 ("derived money is
  materialised and then frozen") applied one level out.

Proposed numbering: `ORD-1234-1`, `-2` for single-company instalments; `ORD-1234-A1` where a company
split and instalments both apply. **Craig to confirm against what Bill.com and Business Central accept
as an invoice number during the transition** — this is the kind of thing that is cheap to change now
and expensive after the first customer has one.

### 6.2 What the document shows

Full order value, this instalment demanded. The existing ladder must still tie
(`ListSubtotal − Discounts + Charges + Tax === Gross`), with the instalment's amount presented as the
amount due rather than as a different gross. The residual-row mechanism already in `BuildDocument`
handles the arithmetic honestly and should not be bypassed.

**Absence of schedule rows means one implicit instalment**, synthesized in the derivation layer. There
is then no `if (hasSchedule)` branch in the document code and no backfill against historical orders —
the special case is designed out rather than handled.

### 6.3 The due-with-no-invoice worklist

The control Jeremy says they rely on falls straight out: rows with `Status = 'Scheduled'` and
`DueDate` inside the billing window. Ship it as `Orders.GetBillingWorklist`, alongside the existing
`Orders.GetOverdueWorklist`, so it is an operation with a surface rather than a report somebody
remembers to run.

---

## 7. Part D — ageing and payment application

- **Overdue.** An order is overdue if **any** unpaid instalment's due date has passed. One module —
  `packages/Entities/src/overdue.ts` — carries the rule for SQL, TypeScript and the browser, and
  `overdue.test.ts` fails if a clause survives in one half and not the other. Contained change, and
  the test is the reason it stays contained.
- **Payment application.** Add a nullable `PaymentLine.OrderHeaderPaymentScheduleID`. Default
  behaviour is oldest-due-first, which is what happens in effect today; the column exists so a human
  can direct a cheque at a specific instalment, which is common in practice ("this is for the 2027
  payment"). `AmountPaid` / `Balance` roll up by trigger, following `trg_PaymentLine_RollupTotals`.
- `trg_PaymentLine_ImmutableAfterCapture` means a mis-assignment is corrected by reversal, not by
  re-pointing. That is consistent with everything else here and should not be relaxed.

---

## 8. Part E — outbound invoice delivery (Bill.com)

**Craig: confirm where this lives and what currently triggers it before starting.** It was not
readable from the session this plan was written in. What follows is the contract it has to satisfy;
adjust the mechanics to the code that exists.

### 8.1 The hazard, which is the reason this section is not optional

If the integration fires **on order Confirmed for the order's value**, then the day instalments exist
it will invoice a customer for an entire multi-year term on day one. That is the same failure as §1,
arriving through a different door and reaching the customer rather than the balance sheet.

**The trigger must move from "order confirmed" to "schedule row enters the billing window."** For an
order with no schedule, the two are identical and nothing changes — which is what makes this a safe
change to make early rather than late.

### 8.2 The contract

- **Input is a schedule row**, not an order header: its frozen `DocumentNumber`, its `Amount`, its
  `DueDate`, and the rendered document for `(order × instalment × company)`.
- **Write back onto the row**: `ExternalSystem`, `ExternalInvoiceRef`, `SentAt`. Today's CDP
  implementation persists the Bill.com invoice id to no entity at all — it survives only inside a
  run-log JSON blob — so "what is this invoice's Bill.com id?" is not answerable from the database.
  That must not carry over.
- **`SentAt` is the audit fact**, and it is what makes D88 enforceable and Jeremy's "unsent is the
  test" a query rather than a judgement call.

### 8.3 Where it should plug in

Orders already has the seam: `BaseDeliveryChannel` (`packages/CoreEntitiesServer/src/BaseDeliveryChannel.ts`)
is explicitly document-agnostic — *"Nothing below knows what an invoice is"* — with `DeliverableDocument`,
`DeliveryAddressing`, `DeliveryResult`, a mandatory `PreviewOnly` honour, and one shipped
implementation (`Email`). `Orders: Send Document` composes render → resolve → decide → deliver over
it. **If the Bill.com integration can be expressed as a second registered channel, that is where it
belongs**, and `Orders: Send Document` then works for it unchanged.

If it cannot — because it is a batch push rather than a per-document send — then it should read the
worklist from §6.3 and write back per §8.2, and the seam stays unused. Craig's call once he has the
code in front of him.

### 8.4 Two things not to carry over from CDP

CDP is the conversion **source** and is being retired; its Bill.com step is a cautionary reference,
not a template. Two properties in particular:

- It **flattens the schedule before sending** — `explicitPayments[]` is expanded into N independent
  invoices by an LLM prompt (`contract_processing.ts:4291`), each posted flat with a single `dueDate`
  and `subtotal === total`, terms hardcoded `"NET_30"` on the customer. The schedule never reaches
  Bill.com as a schedule. Under this plan the schedule row is the unit, which makes that expansion
  unnecessary rather than automated.
- Its **future-send-date capability is not used**: `sentDate` is declared once and never written, and
  the sending step is a TODO stub. Whatever future-dating happens today is manual in the Bill.com UI.
  Creating the invoice when the row enters the window removes the need for it.

---

## 9. Part F — percentage-of-completion

### 9.1 Why it is not a fourth driver

The three shipped types answer *"given what we know at booking, when is this earned?"* and are
evaluated exactly once, inside the booking transaction, with every resulting entry written
forward-dated (`RevenueRecognition.ts`, `OrderJournalEntryFactory.ts:391-438`). Accounting's D15 is
the same statement from the other side: *"no schedule tables, no materializer, no daily job."*

Percentage-of-completion answers a different question — *"given what we now know about progress, how
much should be earned to date?"* — and the answer is not knowable at booking. It cannot be expressed
as `BuildSchedule(context) → entries` without the method lying about its own contract.

It also cannot be staged and then edited: accounting's staged entries are immutable once batched, and
D15's sanctioned mechanism for change is *"correcting orders whose entries NET against what's
staged."* Which is exactly what §9.2 does — this is D15-native, not an exception to it.

### 9.2 Cumulative catch-up

Record an **observation**; compute the entry as the difference from what is already recognised:

```
target = LineAmount × CumulativePercentComplete
delta  = target − recognizedToDate

delta > 0   Dr Deferred Revenue / Cr Sales            (|delta|)
delta < 0   Dr Sales            / Cr Deferred Revenue (|delta|)   ← mirrorIf, the existing idiom
delta = 0   no entry — a legitimate outcome, not a failure
```

The backward-slide case — 50% one month, 40% the next — **is not a feature**. It is what the
subtraction does. There is no reversal path to build, no special case to test, and no way for the two
to drift apart. That is the repo's own "special case → out of existence" principle applied to the part
most likely to be got wrong.

Three further properties worth having:

- **Self-correcting.** A bad observation is corrected by the next one; nothing needs unwinding.
- **Ties exactly at completion.** At 100%, `target = LineAmount`, so the final catch-up lands the
  remaining cent regardless of rounding history.
- **Reuses the existing reversal mechanics.** `mirrorIf` swaps Dr/Cr and keeps amounts positive, which
  is what accounting's `CK_JEL_OneSide` requires.

**Do not use `Accounting.GenerateJournalEntryReversal` here.** It stamps `EffectiveDate = today`,
which for a forward-dated staged entry produces a reversal dated before the entry it reverses.
Netting forward is both the correct mechanism and the documented one.

### 9.3 Shape

```sql
CREATE TABLE ${flyway:defaultSchema}.OrderLineProgressMeasurement (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderLineID             UNIQUEIDENTIFIER NOT NULL,
    MeasurementDate         DATE             NOT NULL,   -- the period this observation governs
    PercentComplete         DECIMAL(7,4)     NOT NULL,   -- CUMULATIVE, 0..1
    MethodCode              NVARCHAR(40)     NOT NULL,   -- ManualAttestation | CostToCost | UnitsDelivered | MilestoneWeighted

    -- quantitative inputs, kept for audit even though PercentComplete drives the entry
    MeasureNumerator        DECIMAL(18,4)    NULL,
    MeasureDenominator      DECIMAL(18,4)    NULL,

    -- provenance
    AttestedByUserID        UNIQUEIDENTIFIER NULL,
    SourceEntityID          UNIQUEIDENTIFIER NULL,       -- where a derived number came from
    SourceRecordID          NVARCHAR(400)    NULL,
    Notes                   NVARCHAR(MAX)    NULL,

    -- result, stamped when the entry is written
    RecognizedToDateBefore  DECIMAL(18,2)    NULL,
    RecognizedToDateAfter   DECIMAL(18,2)    NULL,
    RecognitionAmount       DECIMAL(18,2)    NULL,       -- the delta; NEGATIVE on a backward slide
    JournalEntryID          UNIQUEIDENTIFIER NULL,
    Status                  NVARCHAR(20)     NOT NULL DEFAULT 'Draft',
    CONSTRAINT PK_OrderLineProgressMeasurement PRIMARY KEY (ID),
    CONSTRAINT UQ_OLPM_Period UNIQUE (OrderLineID, MeasurementDate),
    CONSTRAINT CK_OLPM_Percent CHECK (PercentComplete >= 0 AND PercentComplete <= 1),
    CONSTRAINT CK_OLPM_Status CHECK (Status IN ('Draft','Posted'))
);
```

**A posted observation is immutable, and corrections happen forward.** You do not restate a period
that has been recognised and swept into a batch; you observe again in the current period and let the
catch-up absorb it. That is both the accounting-correct answer and the only one compatible with
accounting having no period-close machinery to reopen (D2). Enforce with a trigger, in the style of
the existing immutability triggers.

`RecognizedToDateBefore` / `After` are materialised for the audit chain, and a check asserts they
agree with the sum of posted recognition entries for the line — the same belt-and-braces the invoice
ladder already uses.

### 9.4 Where the number comes from — and why not from `bizapps-tasks`

Jeremy's sharpest point in the thread is that *"there is no feedback loop of any kind from delivery to
Finance on how far along a project is."* He is right, and it is a process gap rather than a schema
gap. `bizapps-tasks` does not close it:

- **No Project entity.** A "project" is a convention — a root `Task` with `ParentID IS NULL`. No name,
  number, owner, customer, contract or budget of its own.
- **No time or effort log.** `Task.HoursActual` is a single hand-entered scalar with no history, no
  author, no date and no consumer anywhere in the codebase. So no *input* method — cost-to-cost or
  labour-hours, the ones auditors prefer — has a source.
- **No money anywhere in the schema.** No contract value, budget, cost, rate or currency column.
- **`PercentComplete` is an `INT`**, `Math.round`ed at every rollup tier, freely hand-editable, with
  no approval, no lock and no immutability once a period is recognised.
- **`OnComplete` fires from two independent dispatchers**, so anything wired to it must be idempotent.

Driving revenue off a task checkbox would also mean that closing tickets moves revenue — a control
weakness before it is an accuracy problem.

**So the observation is an attestation, not a measurement (D90).** The number may be derived from
anywhere — including a cost-to-cost calculation once time logging exists, which is on the tasks
backlog — but a named person signs it, and the attestation is what posts. That makes every entry
explainable and every reversal attributable, which is what you want the first time a project slides
backwards and someone asks why revenue moved.

**Version 1 is a monthly attestation screen**: every open POC line, its last observation, and a field
for this period's. Owned by the delivery lead, on the close calendar. That is a real feedback loop, and
it does not need automation to exist — it needs an owner and a cadence. `bizapps-tasks` can carry the
recurring close task itself, which is the right use of it.

### 9.5 The driver seam

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

`RevenueRecognitionType` gains `ScheduleBasis`, CHECK-constrained to `AtBooking | OnMeasurement` —
following the repo's preference for value lists over booleans that decay (44 columns are already
constrained this way). A POC type is `IsDeferred = 1` + `ScheduleBasis = 'OnMeasurement'`, and the
branch at `OrderJournalEntryFactory.ts:391` becomes:

```ts
if (revRec.IsDeferred && revRec.ScheduleBasis === 'AtBooking' && !isGiftCard)
```

so a POC line books `Dr Unbilled / Cr Deferred Revenue` and stages **no** recognition entries. Small
blast radius — `IsDeferred` has only two real branch points today (`:291`, `:391`).

New operation **`Orders.RecordProgress`**, shaped like `CancelSubscriptionOperation`: one transaction,
logical failures returned inside the output rather than thrown, and a `Preview` flag (as
`SpawnRenewals` has) so finance can see the entry before it posts. It emits through the existing
`Accounting.CreateJournalEntries`, which joins the caller's transaction — **no new accounting API.**

Entries are typed `RevenueRecognition`, which orders already seeds, so they ride accounting's existing
monthly sweep (`.accounting-post-subscriptions-monthly.json`, cron `0 0 3 1 * *`, `AutoPost: true`)
with no scheduling work at all.

---

## 10. Work breakdown

Delivery sequence. Everything here is in scope; the ordering is about what unblocks what, and what
the conversion needs first.

| # | Work | Touches |
|---|---|---|
| **W1** | Migration: `OrderHeaderPaymentSchedule`, `PaymentLine.OrderHeaderPaymentScheduleID`, rollup + immutability triggers. New `V` migration, never the baseline | `migrations/`, CodeGen output |
| **W2** | `UnbilledReceivable` GL role + fallback-with-record; company-level `GLAccountLink` seeding runbook for Johanna | `GLAccountResolver.ts`, `metadata/`, docs |
| **W3** | Booking-entry split — Unbilled when a future-dated schedule exists, AR otherwise | `OrderJournalEntryFactory.ts` |
| **W4** | Schedule authoring helper + the tie-at-confirm invariant | `OrderEntityServer.ts`, a new behaviour module |
| **W5** | `Orders.IssueInstalmentInvoice` — freeze `DocumentNumber`, stamp `InvoicedAt`, emit the reclass JE, advance status | new operation + metadata |
| **W6** | `Orders.GetBillingWorklist` | new operation + metadata |
| **W7** | Per-instalment document rendering | `InvoiceBehavior.ts`, `InvoiceBuilder.ts`, `InvoiceDisplay.ts`, `invoice-renderer.ts` |
| **W8** | Per-instalment ageing; payment application to a named instalment | `packages/Entities/src/overdue.ts`, `PaymentLineEntityServer` |
| **W9** | Bill.com: move the trigger to the schedule row; write back `ExternalInvoiceRef` / `SentAt`. **Confirm location first** (§8) | MJ integrations repo + `DeliveryBehavior.ts` |
| **W10** | `ScheduleBasis` on `RevenueRecognitionType`; `OrderLineProgressMeasurement`; `ProgressRecognitionDriver` family; `Orders.RecordProgress` | migration, `RevenueRecognition.ts`, `OrderJournalEntryFactory.ts`, new operation |
| **W11** | Attestation screen; POC product type + rev-rec type metadata | `packages/Angular/`, `metadata/` |

**W1–W3 are the conversion dependency.** Boston cannot write the Active Contracts importer until the
columns are settled, and the ledger change is what makes the imported long-dated obligations correct
rather than a new gross-up.

**Send Jeremy the column template from §4.1 as soon as it is agreed.** He asked for it explicitly and
Danny is back 9/16; it lets accounting build the spreadsheet once rather than twice.

---

## 11. Authoring notes — the traps in this repo

- **Never edit the baseline**, above or below the CodeGen banner. New `V` migration, named
  `V<yyyyMMddHHmm>__v<app-version>__<Description>.sql`, timestamps strictly increasing
  (`docs/database-migrations.md`).
- **The migration must ship its CodeGen output.** `mj app install` runs migrations and nothing else —
  no CodeGen step, no metadata step — so a bare `CREATE TABLE` gives every host a table with no API.
  Follow the existing `*__CodeGen_Scoped_SQL_Objects.sql` precedent; `scripts/append-codegen.sh` takes
  a migration argument, and its own header explains why running it against the wrong target is
  unrecoverable.
- **Rollup triggers must early-return on zero-row statements.** SQL Server fires AFTER triggers for
  statements affecting zero rows, and CodeGen's `__mj_UpdatedAt` backfill is exactly that — touching a
  table-type variable there deadlocks inside the migration's own transaction. Copy the guard from
  `trg_PaymentLine_RollupTotals` (`V202607061432…:2904-2909`) verbatim.
- **A migration that reads `__mj.Entity` must skip cleanly when the row is absent** — CodeGen runs
  after migrations, so a clean install has no entity rows yet.
- **Metadata reaches a host only via `*__Metadata_Sync.sql` at release.** The new rev-rec type, the GL
  role and both new remote operations exist for no customer until a release carries them. Generate that
  migration from a **fresh** database — a dev push emits `spUpdate*`, which the generator refuses.
  Nothing in CI catches a pending metadata change with no migration behind it.
- **Write TypeScript against generated types only after CodeGen has run.** No `.Get()` / `.Set()`
  bridging in the meantime.
- **A PR adding a migration needs a changeset with at least a `minor` bump** (`npx changeset`).
- **Issue #179** — `OrdersEngine`'s product cache never refreshes, so the new `RevenueRecognitionType`
  will not take effect until MJAPI restarts. This will bite whoever first configures a POC product.

---

## 12. Test plan

Existing bundles to extend, in `packages/IntegrationTests/src/checks/`: `invoicing`, `order-booking`,
`revenue-recognition`, `payment-terms`, `payments-rollups`, `returns`. New bundles for the schedule
and for progress measurement.

Adding a bundle requires updating **`registry-parity.test.ts`** — `scripts/assert-check-count.mjs`
fails the build when fewer checks ran than the registry declares, and the unit suite asserts against
the same source so the two cannot drift into agreeing on a wrong number.

Checks that must exist, because each one is a way this can be silently wrong:

1. A schedule that does not tie **refuses the confirm** — and the error names the shortfall.
2. An order with no schedule books **exactly the entry it books today**. This is the regression that
   protects every existing order.
3. A future-dated schedule books Unbilled, not AR; the first instalment due at booking books AR.
4. Invoicing an instalment moves exactly that amount Unbilled → AR, and twice does not move it twice.
5. `DocumentNumber` frozen at invoicing **survives a later edit to a sibling `Scheduled` row**.
6. An `Invoiced` row refuses an amount or date change; a `Scheduled` row accepts one while the sum ties.
7. A payment applied to instalment 2 leaves instalment 1 unpaid and the header rollups correct.
8. An order is overdue when any unpaid instalment is past due, and not overdue when none is.
9. POC: 40% → 70% → 55% → 100% produces four entries summing exactly to the line amount, with the
   third **negative**, and the fourth landing the remaining cent.
10. A POC line stages **no** recognition entries at booking.
11. `Orders.RecordProgress` with `Preview: true` writes nothing.
12. A posted observation refuses modification.

---

## 13. Acceptance criteria

- A multi-year instalment contract converts as **one order for the term** with N schedule rows, and
  its long-dated obligations appear in **Unbilled, not AR**.
- A schedule row with no invoice behind it **surfaces on its own** when it enters the billing window —
  no tracker, no diary note, nobody remembering in December 2028.
- Reversing an unsent invoice is a query (`SentAt IS NULL`), not a judgement call.
- An order with no payment schedule behaves **identically to today**, in the ledger, the document, the
  ageing and the payment path.
- A POC project's revenue moves forwards and backwards with attested progress, and every entry names
  the observation and the person who signed it.
- `pnpm run verify` green: unit, build, integration, and the check-count gate.

---

## 14. Confirmations needed from finance — none of them block starting

1. **One contract-asset role or two?** Strictly, an unconditional right to consideration is a
   receivable and a conditional one is a contract asset; a future instalment on a contract we must
   still perform against is conditional, so both cases are the same account. Finance may still want
   them presented separately. Written for one; splitting later is additive. **Johanna.**
2. **The GL accounts behind the role**, per company. Data task, needed before W3 reaches a live
   database. **Johanna.**
3. **Invoice numbering format** for instalments, against what Bill.com and BC will accept. **Jeremy /
   Craig.**
4. **That the paper facts live in contracts and the money facts in orders**, with nothing recorded
   twice (§3.1). **Jeremy.**

---

## 15. Adjacent, and deliberately not in this PR

- **A terminal batch status that does not release its members.** Andrew's ask, Amith agreed to an
  issue. Accounting's `Cancelled` today runs `TearDownSummaryAndUnlock` and returns every member to
  `Pending`, where the nightly sweep picks it up again — the opposite of what a conversion batch needs.
  Belongs in `bizapps-accounting`, with a required reason and the batch still visible in the list
  (Jeremy's amendment).
- **Escalation.** `Contract.AnnualIncreasePercent` exists only because orders has no escalation
  concept; renewals price at then-current product pricing and finance reconciles by hand (contracts
  D-1). A multi-year instalment schedule makes this more visible, not less. Worth filing.
- **Issue #34 (`OrdersCompanyProfile`).** Per-company payment-terms defaults are already dead; a
  per-company default billing cadence would want the same home.
- **Renewal scheduling** (§2.1) — configuration, not code, and not this PR.
