---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-server': patch
---

A confirmed order containing a subscription or membership line can be returned again.

Service-period inheritance for reversal lines landed separately and is already on `next`; this
carries the rest of what that defect needs.

The recognition CADENCE is now inherited too. The window says which months a reversal covers; it
does not say how they are cut, and that arrived separately through a map built only where terms are
created — a path a reversal never takes — so it fell back to one month. A quarterly or annual
subscription therefore unwound into more, smaller releases than it was sold with: the year netted to
zero while every month inside it was wrong, which no balance check can see. The cadence now comes
from the `SubscriptionTerm` the origin line bought rather than from the product's current rules, so
re-pointing a product at a different subscription type cannot restate an outstanding return. This
half also fixes `Orders.CancelSubscription`, whose reversal lines had the same gap.

Two further defects on the Return page, both found while tracing the first:

- Reversal lines were written with a POSITIVE quantity. The sign is the switch the journal entry
  factory reads to decide whether to mirror an entry, so a return booked the sale's entry — debiting
  the customer again for goods coming back — while the document was labelled a credit memo and the
  entitlements were revoked. Every other caller writes it negative.
- The per-line maximum ignored prior returns, because the page hard-coded them to zero. It now asks
  the new read-only `Orders.GetPriorReturns` operation, which answers from the same rule the server
  refuses an over-return with: reversals sum across orders, and Draft and Voided returns do not
  count. The server always enforced the real cap, so this was a display fault, not a hole.
