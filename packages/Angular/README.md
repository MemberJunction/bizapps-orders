# `@mj-biz-apps/orders-ng`

**Angular components for BizApps Orders** — generated entity forms plus any hand-authored UI.

## Status: generated forms only

`src/lib/generated/` contains a CodeGen form component per entity, driven by the same metadata that
produces the entity classes — including field descriptions lifted from the migration's extended
properties. Do not edit them; see the Entities package README for the regeneration cycle.

No bespoke components ship yet. The back-end engine came first by explicit sequencing: pricing,
promotions, charges, tax, subscriptions, payments and the ledger are built and covered by 177
integration checks, and the UX pass follows.

## When you do build UI here

Three things this app's rules make non-optional:

**Refusals carry a reason, and it is worth showing.** Every guard returns a message written to be
read by a person — which price rules collided, which cap was exceeded, why no tax was charged. Do
not replace them with a generic error toast; they are the most useful thing the server produces.

**A zero is ambiguous and the reason disambiguates it.** Tax has four ways to be zero — untaxable,
no nexus, buyer exempt, no jurisdiction — recorded as a zero-amount `OrderLinePriceComponent`. A UI
that shows only the number is hiding the answer to the question the user is about to ask.

**Prices decompose.** `OrderLinePriceComponent` is a per-line trail: base, rules, adjustments,
charges, tax, each with a running total and a link to what produced it. Any "why is this £847.32?"
affordance should read that rather than recompute.

## Preview before you commit

`Orders.PreviewPrice` runs the **real** pricing pipeline without writing. Use it for quotes and
"what would this customer pay" screens rather than estimating client-side — a preview that diverges
from the invoice is worse than no preview, because people trust it.
