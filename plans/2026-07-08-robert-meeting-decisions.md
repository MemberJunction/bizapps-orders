# Decisions — 2026-07-08 Robert meeting (Orders)

Source: `plans/meetings/Accounting Meeting-20260708_120251-Meeting Recording.md` (Robert Kihm, Marcelo Torres,
Ian Zygmunt). Distilled, orders-relevant decisions. Precedence: **this doc > the 2026-07-02 amendment > master
plan** on the points below. Accounting-side decisions (batch lock/reject) are in the accounting plan's companion
`2026-07-08-robert-meeting-decisions.md`.

## D1 — Order status "Posted" = the journal entries are in the subledger
- **`Posted` means: the journal entries have been created in the accounting subledger.** It is **not** batching
  and **not** GL-posting. (Batched = the GL lock — see accounting.)
- `Confirmed` is the lock point (contract signed; order becomes immutable — "pencil → pen") and **triggers the
  posting operation**, so `Confirmed → Posted` is effectively immediate (the JE booking is synchronous).
- **Keep the flow LINEAR for v1** — each stage is required in order: `Draft → Quoted → Confirmed → Posted →
  Fulfilled` (`Voided` only from `Draft`/`Quoted`). **An order cannot be `Fulfilled` before it is `Posted`.**
  Business logic MAY auto-advance a fulfill attempt through `Posted` first (UI presents only the ready actions).
- **Implication for the code (task #20):** once `OrderEntityServer` books the JE on `Confirmed`, the order should
  reach **`Posted`** (JEs are in). Nothing advanced it before; this is now unblocked. _(Whether Confirmed
  auto-advances to Posted on successful booking, or Posted is a distinct immediate step, is an implementation
  detail — the near-instant booking makes either fine; keep the two statuses distinct per Amith's flow.)_

## D2 — (Under consideration) split order-status vs financial-status — deferred
- Robert flagged that **fulfillment** and **financial (GL)** progress are independent concerns, so the single
  overloaded status list may want to become two fields: an **order status** (draft/quoted/confirmed/fulfilled/
  voided) + a **financial status** (created/posted/…/batched). He leaned toward keeping the single linear flow
  **for now** and revisiting. **Deferred — not for v1.** Tracked as QUESTIONS.md Q11 (Robert to finalize).

## D3 — Pricing is EXCLUDED from v1 — price lives on the order line, not the product
- **No prices on products.** The **order line carries the price** (`OrderLine.UnitPrice`, already in the schema),
  **entered/typed** by the user at order time — **not calculated** from the product. Products supply name /
  description / ProductID only.
- Future (not now): a full product pricing model — price history, effective-dated prices, attribute/matrix-based
  products (size/color variants inheriting from a root product), discounts, tax amounts, extended price
  (qty × price). All deferred. Confirms the current minimal schema is correct; the "no price on Product" gap is
  **intentional**, not an oversight.

## D4 — Void / reversal semantics (confirms the amendment)
- `Voided` is reachable only from `Draft`/`Quoted` (or just delete those). **A `Confirmed`/`Posted`/`Fulfilled`
  order is locked and cannot be voided** — corrections are made with a **reversing / credit order** (a new order
  with negative-quantity lines for the slice being reversed), i.e. double-entry "you can't remove what's in pen,
  you reverse it." This aligns with amendment S9 (partial reverts supported).
- Note: `OrderLine.CK_Quantity > 0` will need relaxing to allow negative-quantity reversal lines (BO-D10) when the
  reversal/credit-order flow is built.

## D5 — Reversing/credit orders feed batch regeneration (cross-ref accounting)
- When a batch is rejected/regenerated (accounting D1/D2), corrections often come in as **credit-memo orders**
  (e.g. "you didn't do that credit for Widget Co — get a credit order in there dated yesterday"). Orders' credit/
  reversing-order flow is the upstream source; the batch then re-gathers unbatched candidates.

## Risk noted (not a decision)
- **LXP** (Learning Experience Platform) wants to use this system soon. Marcelo surfaced that the **schema will
  need rewrites** (batching especially) as we shake it out. Robert: surface risks, iterate fast (~1.5 weeks),
  LXP carries the "not-ready-for-prime-time" risk on their side. Keep building baseline-first; expect schema churn.
