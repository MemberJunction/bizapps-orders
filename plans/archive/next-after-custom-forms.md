# Next work — after the custom forms / NetLines train

Written 2026-08-14 after PRs merged:

- Orders #65 / #66 / #67 (one Order Header form, confirm-after-draft, accounting tab)
- Accounting #66 (`NetLines` on engine-base, debit-then-credit)
- MJ #3809 (explorer grid toolbar chrome)

This is a review-and-sequence doc, not a schema change. The master plans remain the authority for *decisions*; several of them are stale on *status*.

---

## Where we actually are

**The order-taker path is real now.** One Order Header form, lines on the unsaved header, confirm-after-draft books, accounting tab shows a rolled-up journal *or* the per-line grid, System Metadata is off the four custom forms. Fast Entry / full editor are off the rail.

**The engine stack was already ahead of the UI.** Booking, pricing, promotions, charges/tax, payments, IC legs, subs, returns, entitlements, gift cards, fulfillment ops — covered by the integration suite. Master-plan §18 “NOW = per-line booking” is historical.

**Accounting is a working subledger with a mock ERP.** JE workspace (create), batch workspace (preview / build / approve / dispatch), slide-in detail, intercompany *lookup*. It is not a GL, and reports are still stubs.

**What shipped after this note:** Confirm is a toolbar verb (`RunConfirm` / `ConfirmEligibility`), not a Status dropdown. Check/ACH reference lives on the header Payment tab (`InitialPaymentReference`). Fast Entry / editor **pages are gone** from Angular (mockups remain). Bill-to / ship-to persons copy each other when the other side is empty and stamp the longest-lasting active Employee org. Event/membership facts render on the line card.

### Rulings 2026-08-14

- **Rolled-up journal UX — approved.** No more rollup work this cycle (no source-line drill, no status/batch on the card).
- **Do not put booked order JEs in the Accounting workspace.** Workspace stays create-only. Drill-in from the order tab can stay the generated / slide-in form. Deferred.
- **No Fast Entry.** One form. Delete Fast Entry / editor / workspace after the check-number field lives on the header form. Do not rebuild two lanes.

---

## Recommended sequence

Do these in order. Each is independently shippable.

### 1. Close the holes the new form opened (this week)

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 1 | **Check / ACH reference on Payment tab** | Fast Entry just learned this; the live form only has type + amount. Check confirm will fail again. | S | `order-header-form` Payment tab + `InitialPaymentReference` already on the entity |
| 2 | **Confirm as a verb, not a Status dropdown** | Status-as-select is how people confirm *and* how they pick illegal states. `PaymentStatus` is a rollup — offering it as an edit is a foot-gun. Draft offers Confirm; booked offers reversal / refund (U16). | S–M | Details tab + toolbar; hide `PaymentStatus` as an input |
| 3 | **Pull `next` on all three repos and confirm the link path** | Orders tab imports `NetLines` and `ShowNewButton`. Dev-link must resolve the merged packages. | S | Host workspace; rebuild EngineBase + ng-base-forms + orders-ng |

### 2. Finish the form the mock already signed (next)

Mock: `mockups/orders/order-line-extensions.html`. Proposed, not built.

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 4 | **Org-first party picker** | Bill-to / ship-to are the first thing an order taker does, and they are still two generic record links. Org → people of that org via Common `Relationship` → “Not on this list — search everyone.” Logic belongs on the shared entity / a query helper, not an Angular service. | M | Header bubbles; Common Relationship read |
| 5 | **Weave `EventOrderLine` onto the line card** | Event products are first-class catalog. Attendee name/email must be created **before** confirm — attaching an IS-A child to an already-Confirmed line hits the immutability trigger. Qty>1 (one attendee per unit) stays deferred, as the mock says. | M | `order-lines-editor` + `EventOrderLine` same ID as the line |
| 6 | **Stated facts on the line** | Event dates from `EventProduct`; membership term “decided at confirm.” Show them; do not prompt. | S | Same editor |

Then **delete Fast Entry / editor / workspace** (agreed). Size M. Do this *after* the check-number field is on the header form so we are not deleting the only place it still works.

### 3. Accounting — later, not this cycle

Rolled-up journal **approved as shipped**. Do not expand it.

| # | Item | Status |
|---|---|---|
| 7 | Drill a rolled-up row into source JEs | Deferred — rollup UX approved |
| 8 | Load a booked JE in the Accounting workspace | Deferred — workspace stays create-only |
| 9 | Status + batch on the rollup card | Deferred — rollup UX approved |
| 10 | Batch PostingDate picker | Later — D8 leftover, not form work |
| 11 | Batch this order’s JEs | Later — operational, not form work |

### 4. Hygiene that will otherwise waste a sprint

| # | Item | Why | Size |
|---|---|---|---|
| 12 | **Refresh living docs** | `orders-ux.md` still says “nothing is built.” Accounting `ARCHITECTURE.md` / `lifecycle-hooks.md` / master §16 still describe multi-company JEs, 12 `vw_*` views, ChartOfAccountsMapping. The next person will rebuild something that shipped. | S |
| 13 | **Wire `pnpm test` on Angular packages** | Scripts still say “No tests configured yet” while vitest files exist. Per-package CI would skip them. | S |
| 14 | **Accounting CI runs vitest** | Issue #47. Build-only CI is how NetLines-order would have shipped without tests. | S |
| 15 | **IsOverdue as an EntityField** | The layered view *exists*. Explorer cannot filter/sort it until CodeGen discovers the column. | S |
| 16 | **Review seed variety** | All 75 seed orders are Confirmed; fulfillment queue is empty; no PriceList / Intent rows. Demos look empty. | S |
| 17 | **`metadata-pending/journal-entry-types`** | Confirm accounting already seeded these. If the CHECK is gone and this folder never moved, every confirm fails. | S |

### 5. Named product gaps — decide before building

Do not start these without a ruling. They are real, and they are large.

| Item | Decision needed | Size |
|---|---|---|
| Event capacity / holds | §21b: capacity=1 sold 5 seats. Simple lock was rejected. What *is* the rule? | L |
| Subscription seat quantity | §21c: no quantity on the sub. | L |
| Sales-rule eval + approval routing | Schema exists; engine beyond `DiscountLimit` does not. Blocked on Tasks filter runtime for the one binding that *is* authored. | L |
| Intercompany *settlement* | Legs book on payment. Due To/From accumulate and never clear (`intercompany-balancing.md` §8). | L |
| Manual JE approval (C.8) | Jeremy #6. Do not ship fake Approve buttons. | L |
| Real BC / QBO dispatch | Mock poster is fine until a tenant is on the instance. | L |
| Statements / order splitting / Stripe sandbox | Master §22 “not built,” none is a surprise. | L |
| Reports gallery | Accounting rail is `<mj-shell-page-pending>`. Explicitly deferred. | L |

---

## What not to do next

- Do **not** rebuild Fast Entry + full editor. Agreed: one form. Update `orders-ux.md` instead of implementing U3.
- Do **not** add more netting. `NetLines` is the util. Rolled-up journal is approved.
- Do **not** teach the Accounting workspace to open a booked order JE. Deferred.
- Do **not** publish `@mj-biz-apps/accounting-engine-base@0.1.0` from `main` until a real release. Linking is the product until then.
- Do **not** flip entity-action bindings `Pending` → `Active` until MJ’s transition filter (`DidFieldChangeToValue`) exists.
- Do **not** treat `OrderLine.JournalEntryID IS NOT NULL` as “booked.” Zero-value lines correctly book nothing.

---

## Cross-repo dependencies

```
Orders form  ──imports──►  accounting-engine-base.NetLines
Orders grids ──binds───►  mj-explorer-entity-data-grid.ShowNewButton (and the rest of the chrome)
Orders booking ──calls──► accounting CreateJournalEntry / engine
Payments IC   ──calls──►  ResolveIntercompanyAccounts
```

If a host checkout has stale `next` on accounting or MJ, the order form will compile or look wrong in ways that are not Orders bugs.

---

## Suggested first morning

1. Pull `next` on MJ, accounting, orders. Rebuild EngineBase, ng-base-forms, orders-ng.
2. Payment-tab check reference (item 1).
3. Confirm button / hide Status + PaymentStatus as edits (item 2).
4. Then the picker + attendee weave (items 4–6), with `mockups/orders/order-line-extensions.html` as the spec — **waiting on mock approval**.
5. Delete Fast Entry / editor / workspace.
