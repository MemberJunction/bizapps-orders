---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

Order lines can now be frozen by the app that owns the record they were derived from.

A line saved through a grid is validated by Orders' own rules and nothing else. Orders knows that a
booked order takes corrections through reversal orders; what it cannot know is that some other app
has a reason of its own to freeze the line.

The case that prompted this (bc-aidp-next-golive#206 item 1): Sales closes a deal, the deal locks
because a contract was derived from its terms, and the order's lines are exactly what that contract
was derived from. A tester added a line to a Won deal through the "What's being sold" grid and it
saved, because the deal's lock only runs when the DEAL is saved.

**A seam rather than a lookup.** The obvious fix is for the order line to look up the deal. It is the
wrong one: this package does not depend on Sales, and Sales depends on it. Reaching for
`MJ_BizApps_Sales: Deals` here would invert the dependency chain and bake one consuming app's concept
into the app every other consumer builds on. So Orders asks — `RegisterOrderLineEditVeto` — and the
app with the stake answers.

**Creates, updates AND deletes.** `refuseNewLineOnBookedOrder` returns early on `IsSaved`, because
Orders' own booked rule is about adding to a booked order. A deal lock is not: a line that already
exists is what the contract was derived from, so changing it after the close is the damaging case.
`Delete()` never calls `ValidateAsync`, so it is overridden too — otherwise the grid's delete button
would be the one way through a lock that refuses everything else, and deleting that line is the worst
of the three, not the least.

**A vetoer that throws has REFUSED.** Letting the exception escape would surface as an unhandled
error on a grid; swallowing it and allowing the edit would let a frozen line change because the thing
guarding it was briefly unreachable. Both paths resolve through one function so that case cannot be
written correctly in one place and backwards in the other, and the refusal names the fault and says
what did not happen.

The registry is empty by default, so a host that does not run Sales pays nothing and refuses nothing.

**Nothing registers into it yet, and that is why this merges first.** Sales resolves
`orders-entities` from npm, so the Sales side cannot call `RegisterOrderLineEditVeto` until this has
shipped. Inert on every host until it does; golive#206 item 1 is not closed until Sales registers one.

**Orders own writes go past the check.** It is asked on every save of a line, and Orders saves lines
constantly after a deal is won — fulfilment, the journal entry id once the order books, bundle
quantity ripples, the reversal line on a subscription cancel. The vetoer is handed an order id, a
line id and create/update/delete, so it cannot tell those from a person typing in a grid; the
distinction is made where it is known, by `MarkAsOrdersOwnWrite`. The deal close itself was never
affected, because the deal server confirms the order before writing the Won status — everything
after the close would have been.

**The vetoer is handed a user.** It has to read something to answer, and on the server that read
needs one. It matters more than usual because the seam fails closed: a vetoer that throws for want of
a user would refuse every line edit on every order.

20 tests. Six of them drive `OrderLineEntityServer` itself rather than the registry, which is how a
refused DELETE was found to throw instead of refusing: it assigned onto `LatestResult`, and core
returns null from that getter on an entity that was loaded and never saved — while typing it
non-null, so nothing caught it.
