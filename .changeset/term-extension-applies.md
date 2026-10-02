---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

An approved Duration concession now extends its term (bc-aidp-next-golive#221, case B).

Approving the concession applies the extension in the same transaction:
- The term's `EndDate` and its line's `ServicePeriodEnd` move to the new end.
- Every staged `RevenueRecognition` entry dated on or after the effective date is mirrored on its own date, and what those entries were going to recognise is spread again from the first of them to the new end, using the term's own driver and cadence. There is no catch-up and no receivable entry.
- Access grants that follow the term run to the new end.
- An `Extended` subscription event names the concession and pairs each offset with the entry it offsets.
- A task is assigned to every active holder of the acknowledgment role except the requester, carrying the old and new schedules.

The renewal follows the new end because `SpawnRenewals` reads the latest term.

An extension is refused, both when it is recorded and when it is approved, if:
- the term's renewal is already placed;
- an entry it would offset is already in a journal-entry batch;
- no acknowledgment role is configured (the new `AmendmentAcknowledgmentRole` setting, empty by default); or
- nobody but the requester holds that role.

`Orders.AmendArrangement` previews an extension without writing anything, or records it. A change of amount is refused for now.

A booked term's dates can still be changed only through this path. The server subclass `SubscriptionTermEntityServer` admits the amendment's own write and no other.
