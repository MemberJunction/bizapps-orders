---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-server": patch
---

A return or cancellation voids the original's unposted recognition instead of offsetting it (golive #378, golive #474).

- **Voids replace mirrors where nothing has posted.** When a reversing order line would book a recognition mirror that exactly cancels an origin entry still Pending in no batch, booking voids that entry through `Accounting.VoidPendingJournalEntries`, in the same transaction, and writes no mirror. Entries already batched or GL-posted keep their mirror, and so does a month taken back only in part (a partial return, a prorated month).
- **Voided entries drop out of what orders shows.** The subscription and term Deferred Revenue tabs, the order's journal rollup and the rev-rec schedule leave voided entries out; the subscription tab counts a voided month as taken back. Term shifts, extensions and amount changes no longer treat a voided entry as staged.
- **Needs accounting 0.29.0 or later** (the `Voided` status and the void operation); the accounting peer floors rise to it.
