---
"@mj-biz-apps/orders-core-entities-server": patch
---

Checkout captures the payment on an isolated provider (#927). The page's completion and the
`payment_intent.succeeded` webhook capture the same session within a second of each other; on the
shared `Metadata.Provider` their transactions nested, and a rollback on one side undid the other's
payment, so a charged buyer ended up with no payment booked and no access. New `WithIsolatedProvider`
helper (MJ `CreateIndependentInstance`, the same pattern as MJ #5059).
