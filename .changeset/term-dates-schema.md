---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Schema for shifting or shortening a booked term (#507). Order Concessions gain two delivery forms, `Shift` (start and end moved by the same number of days) and `Shorten` (a later start or an earlier end), and four date fields, `PriorStartDate`, `PriorEndDate`, `NewStartDate` and `NewEndDate`, recorded only on those forms; `CK_OrderConcession_TermDates` holds the rules for each. Subscription Events gain the `Rescheduled` and `Shortened` event types. `ConcessionDeliveryForm` follows the new forms. The code that records and applies a shift lands separately.
