---
"@mj-biz-apps/orders-entities": minor
---

Migration `V202610131506` adds the value lists for External Invoices `Status` (Sending, Sent, Canceled, Failed) and External Payments `Disposition` (Captured, Held, Unmatched, Refused, Ignored, Reapplied, ReversalNeeded). A database built from migrations had neither, so it disagreed with the entity classes until CodeGen ran on it.
