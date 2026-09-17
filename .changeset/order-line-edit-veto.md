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

**The WHOLE-ORDER path is scoped to booking, not exempted.** A line reaches the database two ways: on
its own, which is what the deal form's grid does, and as part of the order graph, header and lines
together, which is what the deal workspace does. An earlier revision set the bypass unconditionally in
the graph loops, on the reasoning that it belongs wherever `BypassBookedCheck` is set. That put the
reported defect back on a different screen: the grid refused a line on a Won deal while the workspace
saved the whole order and was never asked. The two flags part company there — `BypassBookedCheck`
means "the header already ran the booked rule", which is true, and `BypassExternalEditVeto` means
"this write is Orders' own", which that loop cannot claim, since it runs on any header save with dirty
lines. It is now `this.bookingInFlight`: booking is Orders confirming its own order, and nothing at the
header level runs the external veto. `deleteRemovedLines` gets the same treatment — it set no bypass
at all, so a veto during a booking-time removal would have refused the close that creates the record
being protected.

**The vetoer is handed a user.** It has to read something to answer, and on the server that read
needs one. It matters more than usual because the seam fails closed: a vetoer that throws for want of
a user would refuse every line edit on every order.

29 tests. Six of them drive `OrderLineEntityServer` itself rather than the registry, which is how a
refused DELETE was found to throw instead of refusing: it assigned onto `LatestResult`, and core
returns null from that getter on an entity that was loaded and never saved — while typing it
non-null, so nothing caught it.

All three graph loops are covered, not just the one the defect was reported on. The save loop and the
removal loop are each driven for real, in both directions; the subscription loop is held by a
structural check, because reaching it needs a provider, a user and a decisions map, which would test
the harness rather than the rule. That check asserts the one property all three share and any fourth
loop would inherit: the bypass is never assigned unconditionally, which is the exact shape of the
defect found in review.

Writing those turned up a write this description was already claiming: the journal entry id, stamped
once the order books. `resolveOrderLineForStamp` walks UP the IS-A chain, so what gets saved is the
parent Order Line of an Event or Subscription line — an object no graph loop has touched, as is a line
loaded fresh because it was not in `this.Lines`. Nothing refuses it today, since Sales confirms the
order before writing the Won status and the freeze is not yet in place, but that is an ordering in
another repository and this write has no reason to depend on it. It is marked now, and driven.

Each of the six mutants — one per loop, dropping and inverting the removal loop's assignment, and
unmarking the stamp — fails the suite.
