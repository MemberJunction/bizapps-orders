# Intercompany balancing entries — design

> **Status: BUILT (2026-07-26).** Schema, triggers and resolution shipped in
> [`bizapps-accounting` PR #25](https://github.com/MemberJunction/bizapps-accounting/pull/25)
> (merged); the payment-side legs ship in this repo. Covered by the `intercompany` bundle
> (IC1–IC12) plus 27 mutation-verified unit tests. What remains unbuilt is **settlement** (§8) —
> the balances accumulate correctly and nothing clears them, which is deliberate and named.
> **Parent plan:** [`bizapps-orders-master.md`](./bizapps-orders-master.md) §9, D13.
> **AR grain:** SETTLED — A/R is **per company, per line**. The seller-of-record alternative is
> withdrawn, not deferred, so this design rests on a closed decision rather than an open one.

---

## 1. Why this exists, and what is broken today

D13 rules that orders create **no** due-to/due-from at booking: *"you don't know about intercompany
anything until you get cash."* Each line's journal entry is a complete single-company story, and the
intercompany legs arise on the **payment** side.

The booking half of that has been built and proven since early on (`order-booking` OB1–OB9). **The
payment half was NOT, and its absence was a correctness bug rather than a missing feature.** It is
now built; the description below is kept in the past tense because understanding the failure is what
justifies the shape of the fix.

Payment capture booked `Dr Cash / Cr AR` in the **receiving** company only. So when Company A
received cash that settled a line owned by Company B, we:

- debited A's cash — correct, the money is there;
- credited **A's** accounts receivable — **wrong**, A never had that receivable;
- left B's receivable outstanding forever — **wrong**, the customer has paid.

Both companies' books were misstated by the same amount, in opposite directions, with nothing to
reconcile them.

> ⚠️ **The integration suite did not catch this, and that is the lesson worth keeping.** Every check
> in `payment-ledger` used a single-company order, so `PL3` ("AR nets to zero") passed while the
> multi-company case went silently unexercised. A bundle that read as comprehensive coverage of the
> cash leg had a hole in exactly the place this document addresses.
>
> The entry **balanced**. That is the defining property of this whole area: every wrong answer here
> is a balanced, posted, plausible-looking entry, so no assertion about the ledger footing will ever
> find one. The `intercompany` bundle therefore asserts **whose books** each amount landed on — and
> re-introducing the original bug fails 10 of its 12 checks.

---

## 2. The shape

**One journal entry per (payment line × company).**

This is the same provenance rule booking already uses — an `OrderLine` produces a JE, and the JE
points back at the line — extended to the payment side: a `PaymentLine` produces N JEs, where N is
the number of distinct companies owning lines on the order that payment line settles.

For a single-company order, N = 1 and this collapses to exactly what is built today. Multi-company
is the general case, not a special one.

Each JE stays **single-company**, which is not a stylistic preference: accounting derives an entry's
company from its accounts (their CH-2), and D6 hard-blocks cross-company account mapping. An entry
spanning companies could not be booked at all.

### The two sides

| Company | Role | Lines |
|---|---|---|
| **Receiving** — where the cash landed | `Dr Cash` for the whole payment-line amount; `Cr AR` for its *own* share; `Cr Due To <other>` for each other company's share | one JE |
| **Each other company** on the order | `Dr Due From <receiving>`; `Cr AR` for its share | one JE each |

The receiving company may own **no** line on the order at all — a shared-services entity collecting
on behalf of others. Then its entry is `Dr Cash / Cr Due To …` with no AR line, which is correct and
must be supported rather than treated as an error.

### Why the credits stay separate

`Cr Due To B 200` and `Cr Due To C 300` are two lines, not one netted `Cr Due To 500`. Aggregation
can happen downstream in reporting; what cannot be recovered downstream is *how the number was
computed*. Each line carries a description naming the counterparty and the basis, so an auditor
reading the entry sees the derivation rather than a total.

---

## 3. Worked examples

### 3.1 Two companies, paid in full

**Order 123** — total $300

| Line | Product | Owning company | Amount |
|---|---|---|---|
| 1 | Product A | Company A | $100 |
| 2 | Product B | Company B | $200 |

Payment made out to **Company A**, deposited to Company A's cash account. One payment line of $300
against order 123.

**Payment Line 1 → JE #1 — Company A**

| | Account | Debit | Credit |
|---|---|---:|---:|
| | Cash | 300.00 | |
| | Accounts Receivable | | 100.00 |
| | Due To Company B | | 200.00 |
| | **Total** | **300.00** | **300.00** |

**Payment Line 1 → JE #2 — Company B**

| | Account | Debit | Credit |
|---|---|---:|---:|
| | Due From Company A | 200.00 | |
| | Accounts Receivable | | 200.00 |
| | **Total** | **200.00** | **200.00** |

Company A holds the cash and owes B $200. Company B's customer receivable is gone, replaced by a
receivable from A. Both entries balance; the pair reconciles.

### 3.2 Split payment across two multi-company orders

**Order 345** — total $600

| Line | Owning company | Amount |
|---|---|---|
| 1 | Company A | $100 |
| 2 | Company B | $200 |
| 3 | Company C | $300 |

**Order 456** — total $800

| Line | Owning company | Amount |
|---|---|---|
| 1 | Company A | $100 |
| 2 | Company C | $200 |
| 3 | Company D | $500 |

A single payment of **$1,000** arrives to **Company A**, split:

| Payment line | Order | Amount | Coverage |
|---|---|---:|---|
| 1 | 345 | $600 | full |
| 2 | 456 | $400 | 50% — pro-rated |

#### Payment Line 1 — order 345 paid in full

**JE #1 — Company A**

| Account | Debit | Credit |
|---|---:|---:|
| Cash | 600.00 | |
| Accounts Receivable | | 100.00 |
| Due To Company B | | 200.00 |
| Due To Company C | | 300.00 |
| **Total** | **600.00** | **600.00** |

**JE #2 — Company B**

| Account | Debit | Credit |
|---|---:|---:|
| Due From Company A | 200.00 | |
| Accounts Receivable | | 200.00 |

**JE #3 — Company C**

| Account | Debit | Credit |
|---|---:|---:|
| Due From Company A | 300.00 | |
| Accounts Receivable | | 300.00 |

#### Payment Line 2 — order 456 paid 50%

The payment line names no order line, so each company's share is pro-rated at 50%.

**JE #1 — Company A**

| Account | Debit | Credit |
|---|---:|---:|
| Cash | 400.00 | |
| Accounts Receivable | | 50.00 |
| Due To Company C | | 100.00 |
| Due To Company D | | 250.00 |
| **Total** | **400.00** | **400.00** |

**JE #2 — Company C**

| Account | Debit | Credit |
|---|---:|---:|
| Due From Company A | 100.00 | |
| Accounts Receivable | | 100.00 |

**JE #3 — Company D**

| Account | Debit | Credit |
|---|---:|---:|
| Due From Company A | 250.00 | |
| Accounts Receivable | | 250.00 |

Six journal entries from one payment. Every one balances; every one is single-company; every one
points back at the payment line that caused it.

---

## 4. `IntercompanyAccountMatch`

The lookup that makes the above possible: which account is "Due To B" *on A's books*, and which is
"Due From A" *on B's books*.

```sql
CREATE TABLE <schema>.IntercompanyAccountMatch (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),

    -- ORDERED pair. A row means: "when SOURCE collects cash owed to TARGET".
    -- The reverse direction is its own row, because the accounts differ and a
    -- single row holding all four would make it easy to read the wrong one.
    SourceCompanyID UNIQUEIDENTIFIER NOT NULL,
    TargetCompanyID UNIQUEIDENTIFIER NOT NULL,

    -- The liability on the COLLECTING company's books. Must belong to SourceCompanyID.
    DueToGLAccountID UNIQUEIDENTIFIER NOT NULL,
    -- The receivable on the OWED company's books. Must belong to TargetCompanyID.
    DueFromGLAccountID UNIQUEIDENTIFIER NOT NULL,

    IsActive BIT NOT NULL DEFAULT 1,

    CONSTRAINT PK_IntercompanyAccountMatch PRIMARY KEY (ID),
    CONSTRAINT UQ_IntercompanyAccountMatch UNIQUE (SourceCompanyID, TargetCompanyID),
    -- A company cannot owe itself; that would be a same-company entry, not an IC one.
    CONSTRAINT CK_IntercompanyAccountMatch_NotSelf CHECK (SourceCompanyID <> TargetCompanyID)
);
```

### Dimensions: a child table, not JSON

```sql
CREATE TABLE <schema>.IntercompanyAccountMatchDimension (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    IntercompanyAccountMatchID UNIQUEIDENTIFIER NOT NULL,
    -- Which SIDE the dimension applies to: the Due To line or the Due From line.
    Side NVARCHAR(10) NOT NULL,             -- 'DueTo' | 'DueFrom'
    DimensionID UNIQUEIDENTIFIER NOT NULL,
    DimensionValueID UNIQUEIDENTIFIER NOT NULL,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_IntercompanyAccountMatchDimension PRIMARY KEY (ID),
    CONSTRAINT UQ_IntercompanyAccountMatchDimension
        UNIQUE (IntercompanyAccountMatchID, Side, DimensionID),
    CONSTRAINT CK_IntercompanyAccountMatchDimension_Side CHECK (Side IN ('DueTo','DueFrom'))
);
```

Amith's instinct against JSON here is right, and there is precedent: accounting already models this
exact shape as `GLAccountLinkDimension` (`GLAccountLinkID`, `DimensionID`, `Sequence`). Mirroring it
keeps hard FKs to `Dimension` and `DimensionValue`, makes "which pairs use cost-centre 400"
answerable in SQL, and means the dimension-validation code accounting already has applies unchanged.
JSON would buy future flexibility at the cost of every guarantee we have been holding to.

### Integrity rules the database cannot express

Two rules span tables, so they belong in entity-server validation, not a `CHECK`:

1. **`DueToGLAccountID` must belong to `SourceCompanyID`, and `DueFromGLAccountID` to
   `TargetCompanyID`.** A mis-set pair books an intercompany balance into the wrong entity — the
   worst possible failure, because both entries still balance and nothing looks wrong.
2. **A configured pair should have its reciprocal.** (A→B) without (B→A) is legal — B may never
   collect for A — but it is more often an oversight. Warn rather than refuse.

### Missing pair is a HARD FAILURE

If A collects for B and no active (A→B) row exists, the payment **must be refused**, exactly as
D12 refuses a booking whose GL role cannot resolve. Booking a plausible-looking entry to some
default account is how misstatements survive audits.

---

## 5. Where the table lives

**Recommendation: `bizapps-accounting`.**

It is a mapping between GL accounts and dimensions — accounting's model, not orders'. Accounting
owns `GLAccount`, `GLAccountRole`, `GLAccountLink`, `Dimension`, `DimensionValue`, and this table
FKs to three of them. It is also reusable: any app posting intercompany entries (an AP module, a
payroll app) needs the same lookup, and putting it in orders would make those apps depend on orders
for something that has nothing to do with orders.

The cost is coordination — it is Marcelo's repo, and this lands alongside the `EntryType`
generalisation already raised as bizapps-accounting#24.

**Pragmatic fallback if that blocks:** build it in orders and migrate later. Recorded as a fallback
rather than the plan, because the same reasoning that says `EntryType` should not be owned by orders
says this should not be either.

---

## 6. Allocation: order-level versus line-level payment

`PaymentLine.OrderLineID` **already exists and is nullable**, so line-level application is schema-
supported today and unused.

| `OrderLineID` | Meaning | Company count |
|---|---|---|
| set | this payment line settles that specific order line | exactly one → one JE, no IC legs |
| null | this payment line settles the order | pro-rated across companies → N JEs |

Amith leans toward keeping line-level targeting, and it is worth keeping: the "complex" case is
actually the *simpler* one to book, because a single order line has a single company and generates
no intercompany legs at all. It also expresses real situations — a customer disputing one line while
paying the rest.

### The constraint that keeps it tractable

**For a given order, either every payment line names an order line, or none does. Mixing is
refused.**

Without that rule, pro-rating an order-level payment must account for whatever line-level payments
have already been applied, and the allocation stops being a function of the order and becomes a
function of payment history and ordering. The rule costs little — an order is normally paid one way
or the other — and removes an entire class of ambiguity.

### Rounding

Pro-rating rarely divides evenly. **The largest share absorbs the remainder**, so the allocated
amounts always sum exactly to the payment line. This differs deliberately from rev-rec, which
front-loads into period 1 (§4.6) — there the first period is the natural home; here the largest
company is the one where a cent is least visible.

### Line-level balance

Do **not** store a per-line balance. It is derivable, and a stored rollup on the line would need its
own trigger and its own reconciliation with the header's. The pro-rating basis is
`OrderLine.LineTotalGross`, which is already there.

---

## 7. What must also work

- **Refunds unwind the intercompany legs.** `Orders.RefundPayment` creates negative `PaymentLine`
  rows, so if IC generation is driven off the payment line — which it is — the mirrored entries fall
  out automatically. This needs asserting, not assuming.
- **Partial refunds** un-apply proportionally across companies by the same rule as allocation.
- **A refund routed to a different company than the original capture** is out of scope; flag it.

---

## 8. Settlement — named, not built

`Due To` / `Due From` accrue. The actual cash movement between entities is a separate, later event
that clears both sides. There is no settlement mechanism, and this design does not add one; the
balances simply accumulate and are visible per counterparty.

That is the correct scope for now — but a system that accrues intercompany balances with no way to
settle them will eventually need one, and it should be a deliberate follow-on rather than a surprise.

---

## 9. Open questions

1. **Timing: capture or settlement?** This design raises the IC legs at **capture**, when cash
   lands. The alternative — raising them only when entities actually settle — leaves the receiving
   company's books overstated in the interim. Capture is the right call under per-line AR, but it
   deserves Jeremy's confirmation.
2. **Does the receiving company's AR line disappear entirely when it owns no line?** Yes under this
   design (§2). Worth confirming that is acceptable presentation for a shared-services collector.
