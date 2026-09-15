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

14 tests.
