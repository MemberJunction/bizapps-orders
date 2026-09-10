---
"@mj-biz-apps/orders-ng": patch
---

Shows the order accounting tab gross, over every origin, with an As-of date and a date-basis toggle.

The rolled-up view netted debits against credits per account and then dropped any account that came out at zero, with no idea what date anything was effective. On an event order the forward-dated recognition entry cancelled the booking credit, so the Deferred Revenue row disappeared and the screen read `Dr AR 895 / Cr Sales 895` — revenue on screen for an event that has not happened. It now sums debits and credits separately and keeps every account, so the money is visibly parked in deferred revenue and released into sales.

Both views also now gather entries from every origin that affects the order — order lines, their subscription terms, payment allocation lines and the payment header fee entry — rather than from order lines alone, which had been hiding every membership recognition entry and every payment entry. A payment shared across orders shows its fee entry in full on each, labelled rather than pro-rated. An optional As-of date (blank by default, meaning the whole life of the order) and an Effective/Posting date basis apply to Rolled up and By line together, and By line now lists each entry unnetted with its batch, batch status and posting date. The Rev-Rec waterfall is unchanged.
