# Adversarial order cases — bizapps-orders

Authored 2026-08-04 as an adversarial test design. **All catalog data below already exists in the
instance DB** (created by this pass, every name prefixed `ADV `). Nothing existing was modified;
`DEMO *` products, orders and subscriptions were left untouched.

You build each order **through the UI** and check reality against the *Expected* block. Every
expectation is written so it can be checked in SQL.

---

## 0. Setup facts this doc relies on (verified in the DB, 2026-08-04)

| Fact | Value |
| --- | --- |
| Companies with a full GL mapping | `DEMO Publishing Co` (code `CDCD570A`), `DEMO Partner Press` (code `ED977AE4`) — roles **Cash, Accounts Receivable, Deferred Revenue, Sales** |
| Third mapped company | `BOOK-MSCVRY6Q Co A` (code `CVRY6Q32`) — same 4 roles |
| Company with **no GL accounts and no AccountingCompanyProfile** | `BOOK-MSEYE34X Co A` |
| **No company has a `Sales Discounts` GL link** | ⇒ every discount is silently netted into revenue (see C2/C3) |
| `IntercompanyAccountMatch` rows exist | only `DEMO Publishing Co ⇄ DEMO Partner Press` (both directions). **No pair involving `BOOK-MSCVRY6Q Co A`.** |
| JE number format | `JE-{CompanyCode}-{FiscalYear}-{seq:000000}`, per company **and per fiscal year** |
| Booking JE type code | `OrderBooking`; deferred release JEs are `RevenueRecognition` |
| Suggested customer | org **DEMO Riverside Library** (`842E2DF6-4F73-434E-93EE-22FF7BA40283`) unless a case says otherwise |
| Assumed order date | today, **2026-08-04** (if you use a different date, shift all date expectations by the same delta) |

### Catalog created for these cases

All in category `ADV Catalog (…)` of the named company.

| Product | Company | Price rule | Notes |
| --- | --- | --- | --- |
| ADV Plain Widget | Publishing | PerUnit 100.0000 | baseline |
| ADV Penny Item | Publishing | PerUnit 0.0500 | sub-cent rounding |
| ADV Freebie | Publishing | PerUnit 0.0000 | zero-value line |
| ADV Unpriced Consulting | Publishing | **none** | priced by hand |
| ADV Ambiguous Price Widget | Publishing | two PerUnit rules, both Priority 100 (110 / 130) | tie |
| ADV Banded Widget | Publishing | PerUnit 50 (qty 1–5), PerUnit 40 (qty 10–100) | gap at 6–9 |
| ADV Expired Price Widget | Publishing | PerUnit 70, EffectiveTo **2026-07-31** | expired |
| ADV Metered Access | Publishing | **PricingModel `Usage`** 5.0000 | unimplemented model |
| ADV Flat Service Pack | Publishing | **Flat** 100.0000 | flat ÷ qty |
| ADV Case Pack Books | Publishing | **Package** 120.0000, PackageQuantity 12 | pack + remainder |
| ADV Rounding Sub 1000 | Publishing | PerUnit 1000.0000 | sub, `AnnualRolling` (ExtendExisting, 12 mo, monthly recognition), EvenOverTime |
| ADV Seat Sub Corporate | Publishing | PerUnit 300.0000 | sub, `CorporateSeat` (**RejectDuplicate**, scope Organization, BenefitModel Individual) |
| ADV Monthly Sub | Publishing | PerUnit 30.0000 | sub, `MonthlyRolling` (ExtendExisting, 1 mo) |
| ADV Deferred No Period | Publishing | PerUnit 65.0000 | **AllBackEnd, not an event, no subscription** |
| ADV Tiny Event | Publishing | PerUnit 25.0000 | EventProduct: 2026-09-15 09:00→17:00, **Capacity 1, RequiresAttendeeInfo = 1** |
| ADV Bulk Pallet | Publishing | PerUnit 99999.9999 | large-number precision |
| ADV Cross-Co Category Widget | Publishing | PerUnit 60.0000 | its category `ADV Cross-Co Category` is **deliberately GL-linked to Partner Press's Sales account** |
| ADV Discontinued Widget | Publishing | PerUnit 90.0000 | `Status = 'Discontinued'` |
| ADV Expired Window Widget | Publishing | PerUnit 80.0000 | AvailableTo 2021-12-31 |
| ADV Future Widget | Publishing | PerUnit 85.0000 | AvailableFrom 2030-01-01 |
| ADV Press Widget | **Partner Press** | PerUnit 75.0000 | second company |
| ADV Press Sub | **Partner Press** | PerUnit 240.0000 | sub in a second company |
| ADV Third Co Widget | **BOOK-MSCVRY6Q Co A** | PerUnit 50.0000 | third company |
| ADV Unmapped Co Widget | **BOOK-MSEYE34X Co A** | PerUnit 20.0000 | company has **no GL accounts at all** |

### The check-me SQL (run after every confirmed order)

```sql
DECLARE @ord nvarchar(40) = 'ORD-000123';   -- the order you just confirmed

SELECT h.OrderNumber, h.Status, h.CompanyID, ch.Name HeaderCo, h.OrderDate, h.TotalGross, h.ConfirmedAt
FROM __mj_BizAppsOrders.OrderHeader h JOIN __mj.Company ch ON ch.ID = h.CompanyID
WHERE h.OrderNumber = @ord;

SELECT l.LineNumber, p.Name Product, c.Name LineCompany, l.Quantity, l.UnitPrice,
       l.DiscountPct, l.DiscountAmount, l.LineTotalNet, l.LineTotalGross,
       l.ServicePeriodStart, l.ServicePeriodEnd, l.SubscriptionID, l.JournalEntryID
FROM __mj_BizAppsOrders.OrderLine l
JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = l.OrderHeaderID
JOIN __mj_BizAppsOrders.Product p ON p.ID = l.ProductID
JOIN __mj.Company c ON c.ID = l.CompanyID
WHERE h.OrderNumber = @ord ORDER BY l.LineNumber;

-- every JE touching this order's lines, with its legs
SELECT je.EntryNumber, jt.Code EntryType, co.Name JECompany, je.EffectiveDate,
       l.LineNumber, g.Code Acct, g.Name AcctName, jel.DebitAmount, jel.CreditAmount
FROM __mj_BizAppsOrders.OrderLine l
JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = l.OrderHeaderID
JOIN __mj_BizAppsAccounting.JournalEntry je
     ON je.LinkedRecordID = CAST(l.ID AS nvarchar(50))
     OR je.ID = l.JournalEntryID
JOIN __mj_BizAppsAccounting.JournalEntryType jt ON jt.ID = je.JournalEntryTypeID
JOIN __mj.Company co ON co.ID = je.CompanyID
JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = je.ID
JOIN __mj_BizAppsAccounting.GLAccount g ON g.ID = jel.GLAccountID
WHERE h.OrderNumber = @ord
ORDER BY l.LineNumber, je.EffectiveDate, je.EntryNumber, jel.DebitAmount DESC;

-- balance proof per JE
SELECT je.EntryNumber, SUM(jel.DebitAmount) Dr, SUM(jel.CreditAmount) Cr
FROM __mj_BizAppsAccounting.JournalEntry je
JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = je.ID
WHERE je.ID IN (SELECT l.JournalEntryID FROM __mj_BizAppsOrders.OrderLine l
                JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID=l.OrderHeaderID WHERE h.OrderNumber=@ord)
GROUP BY je.EntryNumber;

-- subscriptions + terms produced
SELECT s.SubscriptionNumber, sc.Name SubCompany, p.Name Product, s.Status, s.StartDate, s.EndDate,
       t.TermNumber, t.StartDate TermStart, t.EndDate TermEnd, t.Amount, t.IsProrated, t.ProrationFactor
FROM __mj_BizAppsOrders.Subscription s
JOIN __mj.Company sc ON sc.ID = s.CompanyID
JOIN __mj_BizAppsOrders.Product p ON p.ID = s.ProductID
LEFT JOIN __mj_BizAppsOrders.SubscriptionTerm t ON t.SubscriptionID = s.ID
WHERE s.OrderLineID IN (SELECT l.ID FROM __mj_BizAppsOrders.OrderLine l
                        JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID=l.OrderHeaderID WHERE h.OrderNumber=@ord)
   OR t.OrderLineID IN (SELECT l.ID FROM __mj_BizAppsOrders.OrderLine l
                        JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID=l.OrderHeaderID WHERE h.OrderNumber=@ord)
ORDER BY s.SubscriptionNumber, t.TermNumber;
```

**Universal invariants** — check on *every* successful case, in addition to the per-case block:

1. Every JE balances: `SUM(DebitAmount) = SUM(CreditAmount)`.
2. Every JE is single-company, and that company equals the **line's** company (not the header's).
3. `OrderLine.CompanyID` = `Product.CompanyID`, per line.
4. Every line with a non-zero net has a non-null `JournalEntryID`.
5. `OrderHeader.TotalGross` = `SUM(OrderLine.LineTotalGross)`.
6. `SUM` of all a line's booking-JE debits = that line's `LineTotalGross` (this is the one that catches the rounding bugs).

---

# Round 1 — cheapest, most likely to fail (single line, expect a REFUSAL)

Each of these is one line on one order. The point of the round is that the **failure must be clean**:
a clear message, `Status` still `Draft`, **zero** `JournalEntry` rows, zero `Subscription` rows, and no
half-written order. Note the order number: if a burned `OrderSequence` number leaves a gap, that is a
finding on its own.

## C1 · Unpriced product, no price typed
**Seam:** the "priced by hand" path + the `RefuseUnpricedLines` default when no `OrderCompanyPolicy` row exists (there are **zero** rows in that table).
**Build:** ADV Unpriced Consulting × 1. Leave UnitPrice untouched/blank. Confirm.
**Expected:** confirm **FAILS**. Message names the line and says it cannot be priced ("no price rule was found for this product, and no UnitPrice was supplied"). 0 lines persisted with a JE, 0 JEs, order not `Confirmed`.
**Prediction:** the UI may pre-fill UnitPrice `0` and *send* it. A sent `0` counts as a **stated price**, so the refusal is bypassed and you instead get a silently free line with **no JE at all** (see C7). That's the bug: a hand-priced product that the user forgot to price ships for free instead of being refused.

## C2 · Ambiguous price rules
**Seam:** two applicable rules at equal priority.
**Build:** ADV Ambiguous Price Widget × 1.
**Expected:** confirm **FAILS** — "Pricing is ambiguous: 2 rules apply to quantity 1 on 2026-08-04 and share priority 100…". No JE.
**Prediction:** the UI probably resolves a price anyway when the line is *added* (picking whichever row came back first, 110 or 130) and only blows up at confirm — so the user sees a price on screen that the system then refuses. Worse variant to check: if the add-line preview silently picks one and confirm accepts it, the order books a non-deterministic price.

## C3 · Quantity that falls between price bands
**Seam:** `MinQuantity`/`MaxQuantity` coverage gap.
**Build:** ADV Banded Widget × **7**.
**Expected:** confirm **FAILS** — no applicable rule for quantity 7.
**Control runs (must succeed):** qty 3 → UnitPrice 50.0000, `LineTotalNet` 150.00. qty 12 → UnitPrice 40.0000, `LineTotalNet` 480.00.
**Prediction:** the failure message will list *why each rule was rejected* but the UI may show it as a generic save error; also watch for qty 5 vs 6 boundary (5 must price at 50, 6 must fail).

## C4 · Expired price rule
**Seam:** effective-dating, evaluated as of the order date.
**Build:** ADV Expired Price Widget × 1 (rule ended 2026-07-31, order date 2026-08-04).
**Expected:** confirm **FAILS** (rule exists but does not apply).
**Prediction:** the product looks priced everywhere in the UI (it has a `ProductPrice` row) and only fails at confirm. Also test the mirror: **backdate the order to 2026-07-15** → the same product must now price at 70.0000. If the resolver compares the bound in UTC and the "as of" in local time, a boundary order dated exactly 2026-07-31 will flip.

## C5 · Usage-based pricing model
**Seam:** an unimplemented pricing model reachable from ordinary catalog data.
**Build:** ADV Metered Access × 1.
**Expected:** confirm **FAILS** — "Usage-based pricing is not implemented".
**Prediction:** the failure is a raw `Error`, not a validation result, so the UI may show a stack-ish/opaque message. Nothing should be persisted.

## C6 · Deferred revenue with no service period
**Seam:** `AllBackEnd` recognition on a product that is neither an event nor a subscription — nothing supplies `ServicePeriodStart/End`.
**Build:** ADV Deferred No Period × 1.
**Expected:** confirm **FAILS** — "…needs a service period, but this order line has no ServicePeriodStart/ServicePeriodEnd".
**Prediction:** if the UI exposes service-period fields, filling them by hand should make it succeed (Dr AR 65.00 / Cr Deferred Revenue 65.00 + one `RevenueRecognition` JE on the period end). If it does **not** expose them, this product is unsellable through the UI at all — a catalog configuration that no user can recover from.

---

# Round 2 — money that is quietly wrong (these will SUCCEED; the numbers are the finding)

## C7 · Zero-value line
**Seam:** a line with no economic legs.
**Build:** ADV Freebie × 1. Confirm.
**Expected:** confirm **SUCCEEDS**. 1 line, `UnitPrice` 0.0000, `LineTotalNet` 0.00. **Zero journal entries** for that line, `OrderLine.JournalEntryID` **NULL**. `OrderHeader.TotalGross` = 0.00.
**Prediction:** the order UI will show a "journal entry" section that is empty or errors, and any downstream "posted?" check that tests `JournalEntryID IS NOT NULL` will treat this order as forever unbooked. Also: re-saving the order will keep re-attempting to book this line.
**Extra:** add ADV Plain Widget × 1 to the same order → expect exactly **1** JE (100.00) for a **2-line** order. Any code that assumes `#JEs == #lines` breaks here.

## C8 · Flat price divided by quantity
**Seam:** `Flat` pricing is stored as a per-unit price.
**Build:** ADV Flat Service Pack × **3**.
**Expected:**
- `UnitPrice` = **33.3300** (`money(100/3)`), `LineTotalNet` = **99.99**, `LineTotalGross` = 99.99.
- 1 JE: Dr AR **99.99** / Cr Sales **99.99**. Balanced.
**Prediction:** the customer is billed **99.99 for a flat-100 item** — a penny leaks on every flat-rate line whose quantity doesn't divide the amount. Try qty 7 as well (`100/7` → 14.2900 → 100.03, i.e. it can also over-bill).

## C9 · Package pricing with a remainder
**Seam:** whole packs + partial pack.
**Build:** ADV Case Pack Books × **13** (PackageQuantity 12, Amount 120).
**Expected (documented rule):** extended = 120.00 + 1 × 10.00 = **130.00**; `UnitPrice` = 10.0000; `LineTotalNet` 130.00; 1 JE Dr AR 130.00 / Cr Sales 130.00.
**Also run:** qty **6** → expected 60.00 (half a pack at per-unit) — **or** 120.00 if partial packs round *up* to a full pack. Record which. qty **24** → 240.00.
**Prediction:** the remainder unit price is derived as `Amount / PackageQuantity` = 10 exactly here; with a package amount that doesn't divide evenly (not in this catalog) the same front-loading rounding as C13 appears. The likelier defect is qty 6: buying half a case should almost certainly not cost a full case, but the "whole packs" wording suggests it might floor to 0 packs + 6 units = 60.00 while a purchasing manager expects 120.00 — confirm which the business wants.

## C10 · A discount that vanishes from the ledger
**Seam:** no company in this DB has a `Sales Discounts` GL account linked, and the code silently nets the discount into revenue when the role won't resolve.
**Build:** ADV Plain Widget × 1, **DiscountPct = 25%**.
**Expected:**
- Line: `UnitPrice` 100.0000, `DiscountPct` 0.2500, `LineTotalNet` **75.00**.
- **Exactly 2 JE legs**: Dr AR **75.00**, Cr Sales **75.00**. There must be **no** leg to any discount/contra-revenue account.
**Prediction (the finding):** gross revenue is understated by 25.00 and the discount is invisible to accounting — no warning, no log, no error. Any "gross sales vs discounts given" report reads 75.00 of sales and 0.00 of discounts. Verify the silence: nothing in the API log should mention the missing `Sales Discounts` role.

## C11 · Sub-cent divergence between the line and the ledger
**Seam:** the order line and the journal entry compute "net after discount" with the rounding in **different places**.
**Build:** ADV Penny Item × 1, **DiscountPct = 50%** (0.0500 gross).
**Expected — the invariant to check, not a specific number:** `OrderLine.LineTotalNet` **must equal** the JE's AR debit.
- Line arithmetic: `round(0.05 × 0.5)` → **0.03** (or 0.02 if the rounding is float-naive).
- JE arithmetic: `0.05 − round(0.05 × 0.5)` → **0.02**.
**Prediction:** they differ by a cent — the order says the customer owes **0.03**, the ledger says AR **0.02**, and the JE *still balances*, so nothing anywhere reports the break. Scale it: run ADV Penny Item × **1000** at 50% (gross 50.00) and compare `LineTotalNet` to the AR debit again; if the divergence is per-line-total rather than per-unit it stays a single cent, if it's per-unit it becomes 10.00.

## C12 · Very large amount
**Seam:** `UnitPrice decimal(19,4)` × large quantity collapsing into `decimal(18,2)` through float arithmetic.
**Build:** ADV Bulk Pallet × **9999** (99999.9999 each).
**Expected:** `LineTotalNet` = **999899999.00** (exact product 999,899,999.0001, rounded to 2dp); JE Dr AR 999899999.00 / Cr Sales 999899999.00; `OrderHeader.TotalGross` = 999899999.00.
**Prediction:** float64 loses the low digits before the round, so you may see `999899999.00` ± 0.01, or a value that no longer matches `Quantity × UnitPrice` computed in SQL. Check with:
```sql
SELECT l.Quantity, l.UnitPrice, l.Quantity*l.UnitPrice AS ExactSql, l.LineTotalNet
FROM __mj_BizAppsOrders.OrderLine l WHERE l.ID = '<line id>';
```
Second run to try: ADV Bulk Pallet × **0.0001** (fractional quantity is legal — `decimal(18,4)`) → gross 10.00; a fractional quantity on a *goods* line should probably not be allowed at all.

## C13 · Same product twice on one order
**Seam:** duplicate-product handling; positional mapping of JE results back onto lines.
**Build:** ADV Plain Widget × 1, then **ADV Plain Widget × 1 again** as a second line.
**Expected:** 2 lines (LineNumber 1 and 2), each `LineTotalNet` 100.00; **2 separate JEs**, each Dr AR 100.00 / Cr Sales 100.00, with **different** `EntryNumber`s and **different** `JournalEntryID`s stamped on the two lines. `TotalGross` 200.00.
**Prediction:** the two lines are stamped by *position* from the accounting result array — if the two identical lines get merged anywhere (UI "increase quantity instead of adding a line", or a de-dupe on save) you'll see 1 line at qty 2, or 2 lines sharing **one** `JournalEntryID`. Either is a finding.

---

# Round 3 — subscriptions (the richest seam)

## C14 · Subscription rounding, and where the remainder lands
**Seam:** even-over-time allocation of an amount that doesn't divide by the number of periods.
**Build:** ADV Rounding Sub 1000 × 1, for **DEMO Northgate Schools** (a customer with no ADV subscription yet). Order date 2026-08-04.
**Expected:**
- **1** Subscription, company **DEMO Publishing Co** (the *line's* company), Status `Active`, StartDate 2026-08-04.
- **1** SubscriptionTerm: TermNumber 1, 2026-08-04 → **2027-08-03**, Amount **1000.00**, `IsProrated` 0.
- `OrderLine.SubscriptionID` non-null and pointing at it; `ServicePeriodStart/End` = the term dates.
- **1 booking JE**: Dr AR 1000.00 / Cr **Deferred Revenue** 1000.00 (*not* Sales).
- **N `RevenueRecognition` JEs**, one per month, each Dr Deferred Revenue / Cr Sales, dated the 4th of each month starting 2026-08-04.
- **Invariants (these are the real assertions):** `SUM(all recognition amounts) = 1000.00` **exactly**; every slice except the **first** is identical; the **first** slice is the largest (it carries the remainder).
- Concretely, for N = 12: **83.37**, then 11 × **83.33**. For N = 11: **90.90**, then 10 × **90.91** — record which N you get.
**Prediction:** two things to look for. (1) The rounding remainder is front-loaded into **period 1**, not the last period — month 1 recognizes 83.37 where every accountant expects 83.33 with the stub at the end. (2) The slice dates are computed with **local**-time date math over UTC-midnight term dates, so in a negative-UTC-offset environment a monthly slice can land on the **3rd** instead of the 4th, and a month-end start (try a **backdated order on 2026-01-31**) clamps oddly (Feb 28 → then sticks to the 28th).

## C15 · ⭐ The same subscription product **twice on one order**
**Seam:** the extend-vs-create decision is made for **all** lines *before any* subscription is written, and the lookup only sees the database. This is the sharpest case in the document.
**Build:** one order, **two lines**, both **ADV Rounding Sub 1000 × 1**, for **DEMO Riverside Library** (which has no ADV subscription yet).
**Expected (what the code will do):**
- **2 Subscriptions**, two different `SubscriptionNumber`s, both company DEMO Publishing Co, both Status `Active`.
- **1 term each**, and both terms are **2026-08-04 → 2027-08-03 — fully overlapping**.
- The two lines carry **different** `SubscriptionID`s.
- 2 booking JEs (Dr AR 1000 / Cr Deferred 1000 each) + 2 × N recognition JEs. Order `TotalGross` 2000.00.
**Expected (what the configured business rule says should happen):** `AnnualRolling` is `ConcurrencyMode = ExtendExisting` — the second line should have **extended** the first into **one** subscription with **two sequential terms** (2026-08-04→2027-08-03 and 2027-08-04→2028-08-03).
**Prediction:** you get two concurrent duplicate subscriptions covering the same year — the customer paid for two years and received one year twice. Check it directly:
```sql
SELECT s.SubscriptionNumber, t.TermNumber, t.StartDate, t.EndDate, t.Amount
FROM __mj_BizAppsOrders.Subscription s JOIN __mj_BizAppsOrders.SubscriptionTerm t ON t.SubscriptionID=s.ID
JOIN __mj_BizAppsOrders.Product p ON p.ID=s.ProductID
WHERE p.Name='ADV Rounding Sub 1000' ORDER BY s.SubscriptionNumber, t.TermNumber;
-- 2 rows with identical StartDate/EndDate = the bug
```

## C16 · `RejectDuplicate` that doesn't reject
**Seam:** the same blindness as C15, but on a subscription type whose whole purpose is to refuse duplicates — plus subscriber-scope validation.
**Build:** one order, **two lines**, both **ADV Seat Sub Corporate × 1**, bill-to the **organization** DEMO Riverside Library (no named person).
**Expected — two possible outcomes, both findings:**
- **(a)** Confirm **FAILS** on subscriber scope: this type is `SubscriberScope = Organization` but `BenefitModel = Individual`, so it needs *both* an organization and a named person. If so, this product is unsellable to a plain org customer — and the error should say so plainly.
- **(b)** If it confirms (e.g. the UI supplies a person, or a person is inferred from an org relationship): **2 Subscriptions** are created despite `ConcurrencyMode = RejectDuplicate`, each with one term 2026-08-04 → 2027-08-03, 300.00 each. `TotalGross` 600.00.
**Prediction:** (b). `RejectDuplicate` is only consulted against subscriptions **already in the database**, so it cannot see its sibling line. The guard that exists specifically to prevent double-selling a seat is bypassed by the simplest possible user action: clicking "add" twice.
**Follow-up (do this second):** place a **separate, later** order with **one** ADV Seat Sub Corporate line for the same customer → *now* the reject should fire and the confirm should fail. If order #1 created two subs and order #2 is refused, the inconsistency is the report.

## C17 · Legitimate extension, then a double extension
**Seam:** term chaining — `next start = latest term end + 1 day` — read once, applied twice.
**Build (three orders, in sequence, same customer = DEMO Riverside Library):**
1. Order A: ADV Monthly Sub × 1.
2. Order B: ADV Monthly Sub × 1.
3. Order C: ADV Monthly Sub × 1 **and** ADV Monthly Sub × 1 (two lines).
**Expected:**
- After A: 1 Subscription (company DEMO Publishing Co), 1 term, TermNumber 1, **2026-08-04 → 2026-09-03**, Amount 30.00. Booking JE Dr AR 30.00 / Cr Deferred Revenue 30.00; 1 recognition JE of 30.00 (1-month term, monthly recognition).
- After B: **still 1 Subscription** (`ExtendExisting`), now with **2 terms**; TermNumber 2 = **2026-09-04 → 2026-10-03**, Amount 30.00. Order B's line `SubscriptionID` = the same subscription.
- After C: **still 1 Subscription**, with terms 3 and 4 — *correct* behaviour is 2026-10-04→2026-11-03 and 2026-11-04→2026-12-03.
**Prediction for C:** both lines read `LatestTermEnd = 2026-10-03` before either writes, so you get **two terms both starting 2026-10-04**, and both computing `TermNumber = 3`. Either you'll see **two rows with TermNumber 3** (duplicate term numbering, overlapping coverage, the customer's 2 months of purchase collapse into 1 month of coverage), or a **unique-constraint violation** that fails the confirm after all the JEs were built. Both are reportable; note which.
```sql
SELECT t.TermNumber, t.StartDate, t.EndDate, t.Amount, COUNT(*) OVER (PARTITION BY t.SubscriptionID, t.TermNumber) DupTermNo
FROM __mj_BizAppsOrders.SubscriptionTerm t JOIN __mj_BizAppsOrders.Subscription s ON s.ID=t.SubscriptionID
JOIN __mj_BizAppsOrders.Product p ON p.ID=s.ProductID WHERE p.Name='ADV Monthly Sub' ORDER BY t.TermNumber;
```

## C18 · Quantity > 1 on a subscription
**Seam:** quantity means "seats" to a buyer and "money" to the code.
**Build:** ADV Monthly Sub × **10**, for a customer with no ADV Monthly Sub yet (use DEMO Northgate Schools).
**Expected:** **1** Subscription, **1** term, TermNumber 1, 2026-08-04 → 2026-09-03, **Amount 300.00**. One booking JE Dr AR 300.00 / Cr Deferred Revenue 300.00. `OrderLine.Quantity` = 10.0000.
**Prediction:** the seat count is **lost** — 10 seats were billed and exactly one subscription with no quantity attribute exists downstream. Nothing in `Subscription`, `SubscriptionTerm`, or (check it) `EntitlementGrant` records "10". Also check `EntitlementGrant` rows for this line: if grants are quantity-aware they should show 10; if there are 0 rows, entitlement is simply not provisioned.
**Variant:** ADV Monthly Sub × **2.5** (fractional quantity is legal) → Amount 75.00 and one subscription. A half-seat subscription is nonsense that the system accepts.

## C19 · Subscription in a second company on a mixed order
**Seam:** the subscription must belong to the **line's** company, not the header's (the previously-fixed bug — re-verify it under a *mixed* order, which is the configuration that made it visible).
**Build:** one order: line 1 ADV Plain Widget × 1 (Publishing, 100.00), line 2 **ADV Press Sub × 1** (Partner Press, 240.00).
**Expected:**
- 2 lines; `CompanyID` = DEMO Publishing Co and DEMO Partner Press respectively.
- **1 Subscription**, `CompanyID` = **DEMO Partner Press**, `SubscriptionNumber` allocated normally, 1 term 2026-08-04 → 2027-08-03 Amount 240.00.
- **2 booking JEs**: `JE-CDCD570A-2026-…` Dr AR 100.00 / Cr Sales 100.00; `JE-ED977AE4-2026-…` Dr AR 240.00 / Cr **Deferred Revenue** 240.00.
- Plus N recognition JEs **in Partner Press** (`JE-ED977AE4-…`), summing to 240.00.
**Prediction:** watch the **recognition** JEs specifically — the booking JE company was the fixed bug, but each forward-dated recognition JE also has to pick up the line's company. If any recognition JE carries `CDCD570A`, revenue is being released in the wrong legal entity, months after anyone would notice.

---

# Round 4 — multi-company, GL mapping, events, dates

## C20 · Three companies on one order
**Seam:** per-line company, three independent JE sequences, one header total spanning three legal entities.
**Build:** one order — ADV Plain Widget × 1 (Publishing 100.00), ADV Press Widget × 1 (Partner Press 75.00), ADV Third Co Widget × 1 (BOOK-MSCVRY6Q Co A 50.00). No initial payment.
**Expected:**
- 3 lines, `CompanyID` = the three different companies.
- **3 booking JEs**, one per line: `JE-CDCD570A-2026-######` (Dr AR 100.00 / Cr Sales 100.00), `JE-ED977AE4-2026-######` (75.00), `JE-CVRY6Q32-2026-######` (50.00). Each balanced, each single-company.
- **No intercompany legs anywhere** (no `Due To/From Affiliates` accounts touched) — booking is per company and self-contained.
- `OrderHeader.TotalGross` = **225.00**, and `OrderHeader.CompanyID` is whichever company the header was created under.
**Prediction:** the header total (225.00) is a number that belongs to no single legal entity — the order UI will show "total 225.00" and AR in Publishing is only 100.00. Also check the JE sequence numbers are contiguous *within* each company: the three companies must not share one counter.

## C21 · Three companies **plus an initial payment** — missing intercompany pair
**Seam:** payment allocation across companies requires an `IntercompanyAccountMatch` for each ordered pair; only Publishing ⇄ Partner Press exists.
**Build:** the same three lines as C20, but enter an **initial payment of 225.00** on the order.
**Expected:** confirm **FAILS** with an intercompany-pair error naming the missing (source, target) pair involving BOOK-MSCVRY6Q Co A. **Full rollback:** 0 JEs, 0 PaymentHeader rows, order not `Confirmed`, even though the three booking JEs had already been built.
**Control that must SUCCEED:** two lines only — ADV Plain Widget (100.00) + ADV Press Widget (75.00) — with an initial payment of **175.00**. Expected ledger:
- Publishing: Dr **Cash** 175.00, Cr **AR** 100.00, Cr **Due To Affiliates** (21900) 75.00.
- Partner Press: Dr **Due From Affiliates** (11900) 75.00, Cr **AR** 75.00.
- Plus the two booking JEs from before.
**Prediction:** the failing case leaves a burned `OrderSequence` number (check `NextSequenceNumber` before and after) or, worse, a `PaymentHeader` that survived the rollback. Also try a **partial** payment (e.g. 100.00 against a 175.00 two-company order) and check the pro-rata split rounds to the cent with the residue on the larger share.

## C22 · Category GL-linked to the wrong company
**Seam:** GL account resolution walks product → category tree → company, and a category is per-company but nothing validates that.
**Build:** ADV Cross-Co Category Widget × 1 (product belongs to **DEMO Publishing Co**; its category is deliberately linked to **Partner Press's** Sales account 40100).
**Expected:** confirm **FAILS** with a cross-company account error — "GL account … belongs to company …, but this books to company …. Cross-company account mapping is refused".
**Prediction:** the message blames the *account mapping*, not the mis-parented category, so an admin gets no pointer to the actual misconfiguration (a category assigned under the wrong company). Also worth checking: does the same misconfiguration silently affect **pricing** and **taxability**, which walk the same category tree?

## C23 · A product whose company has no chart of accounts
**Seam:** the "company exists in the picker but was never set up for accounting" case.
**Build (a):** ADV Unmapped Co Widget × 1, alone on an order.
**Expected (a):** confirm **FAILS** — "No GL account is linked for role 'Accounts Receivable'. Checked the product, its category tree, and the company default for company …". (`BOOK-MSEYE34X Co A` has no GL accounts and no accounting profile at all, so JE numbering would also have nothing to work with.)
**Build (b) — poison the well:** one order with **ADV Plain Widget × 1 (good, Publishing)** *and* **ADV Unmapped Co Widget × 1**.
**Expected (b):** confirm **FAILS**, and the **good line books nothing either** — 0 JEs total, order not confirmed, no `JournalEntryID` anywhere.
**Prediction:** this is correct-but-brutal behaviour: one badly-configured company on one line silently blocks an otherwise-valid multi-company order, and the error message names a *company GUID*, not a company name or the offending line number. Check whether the message identifies which line/product caused it — if not, that is the usability bug to file. Also confirm the rollback is total (no orphan `OrderHeader` in `Draft` with a consumed order number).

## C24 · Inactive / out-of-window products sell anyway
**Seam:** `Product.Status` and `AvailableFrom`/`AvailableTo` exist in the schema and are never read by the order path.
**Build:** one order with three lines — ADV Discontinued Widget × 1 (90.00), ADV Expired Window Widget × 1 (80.00, availability ended 2021-12-31), ADV Future Widget × 1 (85.00, available from 2030-01-01).
**Expected (what will happen):** confirm **SUCCEEDS**. 3 lines, 3 JEs (Dr AR / Cr Sales at 90.00, 80.00, 85.00), `TotalGross` **255.00**.
**Expected (what should happen):** every one of these lines should be refused, or at minimum warned, at add-line time.
**Prediction:** all three sell. The interesting sub-question is **where** they should have been stopped — if the UI's product picker filters on `Status='Active'` and the availability window, then the API is still wide open to any caller and only the UI is protecting you. Verify by checking whether these three products even appear in the picker; if they don't, note that the *server* still accepts them (which is the real finding).

## C25 · Event: oversold, deferred, and no attendee
**Seam:** event capacity, attendee capture, and back-end recognition.
**Build:** ADV Tiny Event × **5** (EventProduct: capacity **1**, `RequiresAttendeeInfo = 1`, 2026-09-15 09:00 → 17:00).
**Expected:**
- Confirm **SUCCEEDS** at qty 5 against capacity 1 — capacity is never enforced.
- Line `ServicePeriodStart` = 2026-09-15, `ServicePeriodEnd` = 2026-09-15 (stamped from the event).
- **1 booking JE**: Dr AR **125.00** / Cr **Deferred Revenue** 125.00.
- **1 `RevenueRecognition` JE** dated **2026-09-15** (the event end): Dr Deferred Revenue 125.00 / Cr Sales 125.00. Exactly one — `AllBackEnd` produces a single slice.
- **Zero `EventOrderLine` rows** despite `RequiresAttendeeInfo = 1`:
  ```sql
  SELECT COUNT(*) FROM __mj_BizAppsOrders.EventOrderLine e
  JOIN __mj_BizAppsOrders.OrderLine l ON l.ID = e.ID
  JOIN __mj_BizAppsOrders.OrderHeader h ON h.ID = l.OrderHeaderID WHERE h.OrderNumber = @ord;  -- expect 0
  ```
**Prediction:** all three gaps at once — you can sell 5 seats to a 1-seat event, no attendee is ever captured though the product demands it, and the ticket revenue defers correctly but with no per-attendee record to fulfil against. Also try **two separate orders** of qty 1 each: capacity is not counted across orders either.

## C26 · Backdating across a fiscal year
**Seam:** the order date is the accounting date, with no period-close check, and the JE number embeds the fiscal year.
**Build:** ADV Plain Widget × 1 with **OrderDate = 2025-12-31**.
**Expected:** confirm **SUCCEEDS**. Booking JE `EffectiveDate` = **2025-12-31**, `EntryNumber` = `JE-CDCD570A-**2025**-000001` (a **separate** sequence from FY2026 — the counter restarts per year, so this must not collide with or advance the 2026 numbering).
**Prediction:** a prior year is fully open for posting. Then run the sharper variant: **ADV Rounding Sub 1000 backdated to 2026-01-31** → the term runs 2026-01-31 → 2027-01-30 and the monthly recognition slices have to handle Feb 31 — expect the dates to clamp to the 28th and then stay on the 28th for every later month (so Mar/Apr/May recognize on the 28th rather than the 31st/30th), and check whether any slice lands in the wrong month entirely.

---

## Cleanup

Everything this pass created is name-prefixed `ADV ` and removable with:

```sql
-- inspect first; only run once the cases are done
SELECT * FROM __mj_BizAppsOrders.Product WHERE Name LIKE 'ADV %';
SELECT * FROM __mj_BizAppsOrders.ProductCategory WHERE Name LIKE 'ADV %';
SELECT l.* FROM __mj_BizAppsAccounting.GLAccountLink l
JOIN __mj_BizAppsOrders.ProductCategory c ON CAST(c.ID AS nvarchar(50)) = l.RecordID WHERE c.Name = 'ADV Cross-Co Category';
```
Delete order: `GLAccountLink` (the cross-co one) → `EventProduct` → `ProductPrice` → `Product` → `ProductCategory`. Orders/JEs/subscriptions created by the test runs must be cleaned before the products they reference.
