---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

A discount can be recorded on an order line.

`OrderLine` has carried `DiscountPct` and `DiscountAmount` since the baseline, the booking entry has
had a Sales Discounts leg driven by both since the baseline, and `SalesAuthority` has existed to gate
who may grant one. Nothing in the product could reach any of it: the only control on a line was the
price picker, and a price override is different economics. An override says the price was different;
a discount says the list price held and value was given away, and only the second is reportable as
discounting. The Sales Discounts account could therefore only ever hold figures the Business Central
conversion put there. That is MemberJunction/bc-aidp-next-golive#252.

The control is a Discount block inside the price editor, drawn apart from the price picker on
purpose. It takes a percentage or an amount — one concession expressed two ways, resolved to one
number by `ManualDiscountAmount` before anything judges it — a mandatory reason, and it shows what is
left to discount as you type. It writes no discount field. It stages an unsaved row on
`Order.Adjustments`, which is the channel `OrderEntityServer` already drains at save time, so the
concession goes through `AuthorizeManualDiscount` and leaves an adjustment row naming the line, the
reason, the authority that permitted it and any approver. A discount written straight onto the line
would produce the same number with none of that.

Four defects in the engine had to be fixed for that channel to work, none of which could surface
before something used it:

A discount aimed at ONE line silently became an order-level one. The pricing walk keys lines
positionally — an unsaved line has no key yet — so a caller naming a real `OrderLine.ID` matched
nothing, and an unmatched target fell through to the order-level branch and was allocated pro-rata
across every line on the order. `Orders.PriceOrder` had the same fault by a different route: its
input names a target by `LineIndex` and passed it through under a field the engine reads as an id.
Both spellings now resolve, and a line this order does not have is refused rather than widened.

The preview ignored `DiscountPct` outright. Both pricing paths computed a line's net as
`gross − DiscountAmount` while `OrderLineEntityServer` and the journal entry apply the percentage, so
a line carrying one was quoted at a figure the ledger would never book. Converted orders carry that
field today, so this was live before anything in the product could set it. Both paths now go through
`NetAfterDiscount`, which is the function the line itself uses.

A second discount replaced the first. The stamp assigns `DiscountAmount`, which is correct for a run
that decided every discount on the line and wrong for a manual one that knows only about the new
request — the stored figure was erased while the earlier adjustment rows survived describing money
the line no longer showed. The running total is now seeded with what the line already carries, so
concessions accumulate, and a second one is judged against what is LEFT rather than against the
original line value. Stacking to a free line one authorized slice at a time is no longer possible.

A discount larger than the thing it discounts was accepted. It floored the net at zero and, for a
zero or negative amount, failed at `CK_OrderAdjustment_Amount` — a constraint name, to someone who
had typed a number. Both are refused with a sentence now.

A fifth was the header-only shortcut in `OrderEntityServer.Save`, which asks whether the LINES are
dirty. Staging a request touches no line, so the flow a person actually runs — open a saved draft,
discount a line, save — skipped the drain, the authorization and the stamp, and handed the staged row
to the graph as an ordinary related record: an adjustment with no authority, no allocation and no
change to the line. The shortcut now also asks whether anything is staged. Staged CHARGES had the
same hole and are covered by the same clause; nothing caught either, because every existing check
composes an order and confirms it in one go, which always takes the full walk.

Two things are deliberately not here. Removing a discount that has already been saved needs reversal
semantics on the adjustment rows and is not in this change — the control removes a staged request
only. An over-cap discount is blocked on screen rather than escalated, because the approval routing
it would escalate into is MemberJunction/bc-aidp-next-golive#222 and does not exist yet.

**This ships inert without data.** `AuthorizeManualDiscount` refuses a user who holds no
`SalesAuthority`, on the rule that absence is not permission, so the control tells such a user what is
missing instead of offering a concession the save would refuse. Authority rows for the reps, and one
`SalesRule` of type `DiscountLimit`, are configuration someone has to create.
