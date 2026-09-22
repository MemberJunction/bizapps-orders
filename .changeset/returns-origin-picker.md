---
'@mj-biz-apps/orders-ng': patch
---

A return can be started from the UI.

golive#250. The Returns page rendered its origin card only when `Origin` was set, and `Origin` came
only from `@Input() OriginOrderID` — which a repo-wide search finds in exactly one file, the page
itself. Nothing ever set it. So the page showed *"Select an order to return / Choose the original
order to start a return"* and offered nothing to choose with, and a confirmed order could not be
returned from the app at all. O-US4 had no user-facing route.

The approved design had the answer: `mockups/orders/return.html` carries a block commented
`<!-- origin picker -->` with a "Change origin order" control. The origin DISPLAY was built and the
origin SELECTION was not. This finishes it — the picker in the empty state, the button on the origin
card — rather than inventing an affordance.

**Not fixed in the section shell**, which the issue offered as a lead. `orders-sections` hands a
cached page its record by name, and the suggestion was to add a case for `OriginOrderID` beside
`OrderID`/`RecordID`. But `PendingRecordID`'s only writer is `openRecord()`, which has **no callers**:
orders open as Explorer record tabs through `openEntity` now. A case added there would never execute,
and would read as a fix in review.

Only BOOKED orders are offered, because that is what a return reverses — `IsBooked` is *"journal
entries exist and the receivable is real"*, and `ReversalResolver` skips Draft and Voided on the
server. Offering anything else would offer a choice the server refuses. Filtered server-side:
`MJOGetOrdersOptions` records a real performance bug from fetching everything and filtering in the
browser.

Three things fixed on the way, all in the code this touches:

- **`ngOnChanges`**, because `ngOnInit` runs once. A page handed its order after construction kept
  showing the previous origin for ever, which made the input-driven route broken by construction.
- The origin is loaded **by `OrderHeaderID`** instead of reading every order and `.find`-ing one —
  the exact bug that options doc records against fast entry's customer picker.
- **`notposted` renamed to `booked`.** It had no callers and named `Posted`, a status that has not
  existed since the order lifecycle collapsed (KI-27).
