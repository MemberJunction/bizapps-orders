# Decisions — 2026-07-09 Robert meeting (Orders)

Source: `plans/meetings/Accounting Meeting-20260709_121044-Meeting Recording.md` (Robert Kihm, Marcelo Torres,
Ian Zygmunt). Orders-relevant decisions. Precedence: **this doc > orders master plan** on the points below.
Accounting companion: `bizapps-accounting/plans/2026-07-09-robert-meeting-decisions.md`.

> Theme: **features over polish** for the internal LXP demo. **Jeremy** is the SME for the golden path + edge
> cases; Marcelo will demo the flow to him and gather a feature list (also from Ethan).

## D-O1 — Fulfillment ↔ deferred revenue: DISCONNECTED; rev-rec is driven by Scheduled Transactions (answers Q16)
Robert's full GAAP explanation of what "Fulfilled" means and how deferred revenue actually works:

- **Fulfillment = the delivery-of-value event, and it is DISTINCT from revenue recognition.**
  - Physical product: not fulfilled until the product is in hand, boxed, and a shipping label is created. You
    should not charge the card / recognize revenue until then; keep the order in **Draft/Quoted** until you have
    the product. Recognize revenue **at fulfillment** (delivery of value) for physical goods.
  - Electronic / contract: fulfillment can be immediate (contract signed → order auto-fulfilled). "For us it's
    probably: contract signed → generates the order → order automatically fulfilled."
  - **Auto-fulfill rule:** if no line in the order requires physical fulfillment, the order may auto-advance to
    **Fulfilled**.
- **Deferred revenue is NOT recognized at fulfillment.** Example: a conference registration is *fulfilled* when
  the attendee registers + pays, but the revenue is **deferred** until the event date. An annual subscription
  recognizes **1/12 per month** (GAAP monthly buckets; first day of the next month → recognize 1/12). "There's
  nothing in the order that changes once the event happens — it's accounting entries."
- **Scheduled Transactions** are the mechanism (Aptify model). Three things create journal entries: **orders,
  payments, and scheduled transactions.** A scheduled transaction moves an amount **out of Deferred Revenue into
  Revenue** on its recognition date — one per event (conference) or one per month (subscription). Orders create
  the initial JE + the schedule; the schedule (not the Fulfilled flip) does the recognition over time.
- **Impact on Q16 / Task 30 (Posted→Fulfilled):** the earlier intent — "Fulfilled recognizes un-scheduled
  deferred revenue" — is **superseded**. Recognition is owned by the schedule, not the fulfillment status.
  Fulfilled is a delivery-of-value event; for pure-electronic/contract orders it can be immediate. Keep the
  current Posted→Fulfilled UI (with its confirm dialog) but **do not** book a recognition JE on that flip —
  that belongs to the Scheduled-Transaction engine.
- **Accounting already plans this** as **AD-11 `ScheduledJournalEntry`** (materialize due schedules into Pending
  JEs: Dr Deferred Revenue / Cr Revenue). Robert's explanation validates that design; the rev-rec **methodology**
  (waterfall, monthly buckets) is owned by Orders/subscriptions upstream. → **plan + backlog** (rev-rec engine is
  a real workstream, "probably not MVP").

## D-O2 — Order naming (DELIVERED)
Marcelo: "I need to have the ability to name orders." ✅ **Done this pass:** the Orders Console compose card now
has an optional **Order name** field, stored in `Order.Description` on create. (No new column — reuses the
existing nullable `Description`.)

## D-O3 — Order roles / fulfillment role
Orders should seed its own roles (mirrors accounting D1) — notably an **order fulfiller** role: fulfillment staff
care about orders *ready for fulfillment but not yet fulfilled*, and stop caring once fulfilled. Also a rule that
an order with no physical/fulfillable product can auto-move to Fulfilled. → **plan + backlog** (needs the roles
workstream + Marcelo's role-tree design; not MVP).

## D-O4 — Order History / list filters
Same guidance as Batch Status: it's about the **filters the user cares about** (this week's orders; open orders;
fulfilled usually not, but some care). Moving-window presets apply here too.
- ✅ **Done this pass:** Today / 7 days / 30 days / Clear moving-window presets added to the Order History page.

## D-O5 — Backdating orders (allowed; gated on closed-period reconciliation)
Backdating is allowed — the order carries its own `OrderDate` (e.g. an integration failed and the order really
came in on the 8th), and the JE bears the order date. The only guard is a **closed period** (can't post into a
closed period). That guard is blocked on the accounting-side **periods-removed** reconciliation (accounting D4 /
QUESTIONS D-Q2). Confirm backdating frequency + exception rules with Jeremy (Q15).
