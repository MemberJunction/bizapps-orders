# Reviewing the data

The integration checks leave nothing behind — every one of the 217 runs inside a transaction that
always rolls back, which is what makes them independent and re-runnable. To look at real rows, seed
them deliberately:

```bash
node test-harnesses/seed-review-data.mjs      # clears earlier runs, then commits 8 scenarios
node test-harnesses/purge-fixture-data.mjs    # removes everything again
```

The seeder walks the **same** `OrderEntityServer.Save()` pipeline the checks do. Nothing about the
data below is hand-written; it is all engine output.

> **Re-running the suite after seeding is fine.** The fixture clears the one thing it shares across
> runs (charge-type GL links) at setup, and its teardown now removes committed orders properly. Both
> of those were broken until the seeder existed to expose them — see the note at the end.

## What was seeded, and why each one is there

| # | Order | Shows |
|---|---|---|
| 1 | a plain sale, taxed | the baseline: one line, one company, one balanced entry |
| 2 | two companies on one order | per-line company resolution, two ledgers from one document |
| 3 | an annual subscription | `Subscription` + `SubscriptionTerm`, deferred revenue |
| 4 | an event ticket | a service period taken from the **event**, not the line |
| 5 | the everything-order | line promo + order promo + shipping + layered CA tax, together |
| 6 | a **return** of one unit from (1) | the reversal path: mirrored entry, tax given back |
| 7 | a paid order | `PaymentHeader`/`PaymentLine` and the rollups they drive |
| 8 | an **overpaid** order | a negative balance — i.e. account credit available to spend |

---

## 1. Start here: every order, one row each

```sql
SELECT h.OrderNumber, h.OrderType, h.Status, h.TotalGross, h.AmountPaid, h.Balance, h.PaymentStatus,
       (SELECT SUM(LineTotalNet) FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = h.ID) AS Net,
       (SELECT SUM(LineTax)      FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = h.ID) AS Tax,
       (SELECT SUM(ChargeAmount) FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = h.ID) AS Charges
  FROM __mj_BizAppsOrders.OrderHeader h
 ORDER BY h.OrderNumber;
```

**What to look for.** `TotalGross` should equal `Net + Tax + Charges` on every row — the header is
materialized by trigger from its lines and never authored. The everything-order shows `Net` of 320
against 400 of goods, because 80 of promotions came off before tax was computed. The return carries
negative everything. The overpaid order shows a negative `Balance`, which *is* the account credit —
there is no separate credit-memo table (D-CREDIT).

## 2. The line detail behind one order

```sql
SELECT l.LineNumber, p.Name AS Product, c.Name AS OwningCompany,
       l.Quantity, l.UnitPrice, l.DiscountPct, l.DiscountAmount,
       l.LineTotalNet, l.LineTax, l.ChargeAmount, l.LineTotalGross,
       l.ServicePeriodStart, l.ServicePeriodEnd
  FROM __mj_BizAppsOrders.OrderLine l
  JOIN __mj_BizAppsOrders.Product p ON p.ID = l.ProductID
  JOIN __mj.Company c ON c.ID = l.CompanyID
 -- Scenario 2, the two-company order. Selected by SHAPE rather than by number: order numbers
 -- restart from 1 on every rebuild, so a hard-coded 'ORD-000005' goes stale the first time the
 -- schema changes.
 WHERE l.OrderHeaderID = (
         SELECT TOP 1 h.ID FROM __mj_BizAppsOrders.OrderHeader h
           JOIN __mj_BizAppsOrders.OrderLine l2 ON l2.OrderHeaderID = h.ID
          GROUP BY h.ID HAVING COUNT(DISTINCT l2.CompanyID) > 1)
 ORDER BY l.LineNumber;
```

`CompanyID` is a **denormalized copy of the product's company**, stamped at save time (D6) so the
line records who owned the product when the transaction happened, even if ownership later moves. On
order 2 the two lines belong to different companies — that is the point of it.

## 3. Every journal entry balances, per company

This is the invariant that matters most. Run it over the whole database:

```sql
WITH e AS (
  SELECT je.ID, je.EntryNumber, gl.CompanyID,
         SUM(jel.DebitAmount) AS Debits, SUM(jel.CreditAmount) AS Credits
    FROM __mj_BizAppsAccounting.JournalEntry je
    JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = je.ID
    JOIN __mj_BizAppsAccounting.GLAccount gl ON gl.ID = jel.GLAccountID
   GROUP BY je.ID, je.EntryNumber, gl.CompanyID)
SELECT COUNT(*) AS Entries,
       SUM(CASE WHEN Debits <> Credits THEN 1 ELSE 0 END) AS Unbalanced
  FROM e;
```

`Unbalanced` must be **0**. Note the comparison is exact, not "within a cent": a penny that does not
reconcile is a penny somebody has to find later.

## 4. What the everything-order actually posted

```sql
SELECT gl.Code, gl.Name, c.Name AS Company, jel.DebitAmount, jel.CreditAmount, jel.Description
  FROM __mj_BizAppsOrders.OrderLine ol
  JOIN __mj_BizAppsAccounting.JournalEntry je ON je.ID = ol.JournalEntryID
  JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = je.ID
  JOIN __mj_BizAppsAccounting.GLAccount gl ON gl.ID = jel.GLAccountID
  JOIN __mj.Company c ON c.ID = gl.CompanyID
 WHERE ol.OrderHeaderID = (
         SELECT TOP 1 h.ID FROM __mj_BizAppsOrders.OrderHeader h
           JOIN __mj_BizAppsOrders.OrderLine l2 ON l2.OrderHeaderID = h.ID
          GROUP BY h.ID HAVING COUNT(DISTINCT l2.CompanyID) > 1)
 ORDER BY c.Name, gl.Code;
```

Two companies, two sets of entries. A cross-company entry cannot exist at all — accounting derives
an entry's company **from its accounts**, which is why the intercompany legs are per company rather
than one entry spanning both (D12/D66).

## 5. The reversal, next to the sale it unwinds

```sql
SELECT h.OrderNumber, h.OrderType, l.Quantity, l.UnitPrice, l.LineTotalNet, l.LineTax,
       l.ReversesOrderLineID
  FROM __mj_BizAppsOrders.OrderLine l
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = l.OrderHeaderID
 WHERE l.ReversesOrderLineID IS NOT NULL
    OR l.ID IN (SELECT ReversesOrderLineID FROM __mj_BizAppsOrders.OrderLine WHERE ReversesOrderLineID IS NOT NULL)
 ORDER BY h.OrderNumber, l.LineNumber;
```

The return is **one** of the two units sold, so its net and tax are half the sale's, negative. Four
defects lived on this path and every one of them still produced a balanced ledger — the line used to
store `0`, and the tax used to be kept rather than refunded. Compare the two rows' `LineTax`: the
proportion is the assertion.

To see the mirror rather than a negation — sides swapped, **amounts positive**:

```sql
SELECT h.OrderNumber, gl.Code, gl.Name, jel.DebitAmount, jel.CreditAmount
  FROM __mj_BizAppsOrders.OrderLine ol
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = ol.OrderHeaderID
  JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
  JOIN __mj_BizAppsAccounting.GLAccount gl ON gl.ID = jel.GLAccountID
 WHERE h.OrderType IN ('Sale','Return')
   AND (ol.ReversesOrderLineID IS NOT NULL
        OR ol.ID IN (SELECT ReversesOrderLineID FROM __mj_BizAppsOrders.OrderLine WHERE ReversesOrderLineID IS NOT NULL))
 ORDER BY gl.Code, h.OrderNumber;
```

No `DebitAmount` or `CreditAmount` is ever negative. Accounting rejects negative amounts outright,
so a naive `-amount` reversal does not fail a balance check — it fails to post at all.

## 6. Tax, layer by layer

```sql
SELECT h.OrderNumber, ct.Code AS ChargeType, oc.Description,
       oc.BasisAmount, oc.Rate, oc.Amount, oc.ComputedAmount
  FROM __mj_BizAppsOrders.OrderCharge oc
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = oc.OrderHeaderID
  JOIN __mj_BizAppsOrders.ChargeType ct ON ct.ID = oc.ChargeTypeID
 ORDER BY h.OrderNumber, oc.Sequence;
```

Tax is modelled as a **charge**, not a column, because real jurisdictions layer (D71). Every layer
computes on the same `BasisAmount` — the goods plus non-tax charges, and never other tax. Compounding
tax on tax is unlawful in every US jurisdiction, so the taxable base is tracked separately from the
running total.

And **why** each line was or was not taxed — a zero is the same number for four different reasons:

```sql
SELECT h.OrderNumber, l.LineNumber, pc.ComponentType, pc.Amount, pc.Description
  FROM __mj_BizAppsOrders.OrderLinePriceComponent pc
  JOIN __mj_BizAppsOrders.OrderLine l ON l.ID = pc.OrderLineID
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = l.OrderHeaderID
 ORDER BY h.OrderNumber, l.LineNumber, pc.Sequence;
```

## 7. Promotions and how they were split

```sql
SELECT h.OrderNumber, pr.Code AS Promotion, pt.Code AS Kind, pr.AppliesAt,
       COUNT(*) AS Shares, SUM(a.Amount) AS Total, MIN(a.Amount) AS Smallest
  FROM __mj_BizAppsOrders.OrderAdjustment a
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = a.OrderHeaderID
  JOIN __mj_BizAppsOrders.Promotion pr ON pr.ID = a.PromotionID
  JOIN __mj_BizAppsOrders.PromotionType pt ON pt.ID = pr.PromotionTypeID
 GROUP BY h.OrderNumber, pr.Code, pt.Code, pr.AppliesAt
 ORDER BY h.OrderNumber;
```

An order-level promotion is **allocated down to lines** — each share is its own `OrderAdjustment`
carrying an `OrderLineID`. So `Total` is the invariant to read, and `Smallest` must be positive:
allocation uses largest-remainder precisely so no line ever absorbs the drift and inverts.

## 8. Subscriptions and their terms

```sql
SELECT s.SubscriptionNumber, p.Name AS Product, s.Status,
       t.TermNumber, t.StartDate, t.EndDate, t.IsProrated, t.ProrationFactor, t.Amount
  FROM __mj_BizAppsOrders.Subscription s
  JOIN __mj_BizAppsOrders.Product p ON p.ID = s.ProductID
  LEFT JOIN __mj_BizAppsOrders.SubscriptionTerm t ON t.SubscriptionID = s.ID
 ORDER BY s.SubscriptionNumber, t.TermNumber;
```

Proration scales the **quantity**, never `DiscountPct` — a short first period is not a concession,
and routing it through the discount field would corrupt discount reporting and post the difference
to the Sales Discounts contra account, where it does not belong.

## 9. Payments and the rollups they drive

```sql
SELECT ph.PaymentNumber, ptype.Code AS Tender, ph.Amount AS PaymentTotal, ph.Status,
       h.OrderNumber, pl.Amount AS AppliedToOrder,
       h.TotalGross, h.AmountPaid, h.Balance, h.PaymentStatus
  FROM __mj_BizAppsOrders.PaymentHeader ph
  JOIN __mj_BizAppsOrders.PaymentType ptype ON ptype.ID = ph.PaymentTypeID
  JOIN __mj_BizAppsOrders.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = pl.OrderHeaderID
 ORDER BY ph.PaymentNumber;
```

`AmountPaid`, `Balance` and `PaymentStatus` are all **trigger-maintained** from the payment lines
(D41) — nothing in application code assigns them. A payment header's amount must equal the sum of
its lines; that is enforced in business logic rather than by constraint, so an over-application has
nowhere to hide.

The overpaid order is the interesting one: `Balance` goes negative, and that negative balance is
spendable on another order through `Orders.ApplyAccountCredit`.

## 10. Order numbers are gap-free

```sql
WITH n AS (
  SELECT OrderNumber,
         CAST(REPLACE(OrderNumber, 'ORD-', '') AS INT) AS Seq,
         ROW_NUMBER() OVER (ORDER BY OrderNumber) AS Rn
    FROM __mj_BizAppsOrders.OrderHeader)
SELECT MIN(Seq) AS First, MAX(Seq) AS Last, COUNT(*) AS Orders,
       MAX(Seq) - MIN(Seq) + 1 - COUNT(*) AS Gaps
  FROM n;
```

`Gaps` should be 0 for a freshly seeded database. An order number is an A/R document number, so the
counter is taken inside the caller's transaction: a confirm that rolls back **releases** its number
rather than burning it (D30). Taking numbers from a separate transaction — the obvious "safer"
design — would leave a permanent hole for every failed confirm.

## 11. Nothing orphaned

```sql
SELECT
  (SELECT COUNT(*) FROM __mj_BizAppsOrders.OrderLine l
     WHERE NOT EXISTS (SELECT 1 FROM __mj_BizAppsOrders.OrderHeader h WHERE h.ID = l.OrderHeaderID)) AS OrphanLines,
  (SELECT COUNT(*) FROM __mj_BizAppsOrders.OrderLine l
     WHERE l.OrderHeaderID IN (SELECT ID FROM __mj_BizAppsOrders.OrderHeader WHERE Status = 'Confirmed')
       AND l.JournalEntryID IS NULL) AS ConfirmedButUnbooked,
  (SELECT COUNT(*) FROM __mj_BizAppsOrders.OrderHeader h
     WHERE h.Status = 'Confirmed'
       AND h.TotalGross <> ISNULL((SELECT SUM(LineTotalGross) FROM __mj_BizAppsOrders.OrderLine
                                    WHERE OrderHeaderID = h.ID), 0)) AS HeaderDisagreesWithLines;
```

All three must be 0. `ConfirmedButUnbooked` is the one worth understanding: booking is all-or-none
inside the confirm transaction, so a confirmed line with no journal entry should be impossible rather
than merely unusual.

---

## A note on what the seeder found

Committing data exposed two bugs that 217 rolling-back checks could not:

- **The fixture teardown had never actually worked.** It could not clear a booked
  `OrderLine.JournalEntryID` (the immutability trigger refuses, correctly — a correction is a
  reversal, never an edit), and it was missing five child tables entirely. Because every check rolls
  back, teardown had only ever been asked to delete rows that were not there, and it "passed" by
  having nothing to do.

- **Charge-type GL links leaked between runs.** Every other link the fixture writes is scoped to a
  company it just created. Those are keyed by charge type — application metadata shared by every run
  — so a leftover set left two active links per type, and a later run's shipping and tax could post
  to an earlier run's accounts. It surfaced as composition's CX8 reporting a stranded receivable of
  2,902.59 belonging to a company the test had never created.

Both are fixed. Both are the same lesson: an isolation mechanism that makes tests independent also
hides everything that only goes wrong when data persists.
