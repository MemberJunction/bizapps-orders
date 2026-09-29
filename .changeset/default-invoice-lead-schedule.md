---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": patch
---

An order confirmed by hand with no payment schedule, whose service starts further out than its invoice lead, now gets one `Scheduled` instalment per company for that company's whole line gross, due on the earliest service start less the lead (orders #342). Under D92 that books no receivable at confirm; the instalment is billed from the billing worklist when it falls due. The lead is the new nullable `InvoiceLeadDays` on `Product`, `ProductCategory` and `ProductType`, resolved most specific first: the product, its category, each ancestor category, the product type, else the new Orders setting `DefaultInvoiceLeadDays` (30). A database check keeps each at zero or more. Orders that carry their own schedule, lines with no service period, reversal orders and orders paid at confirm (a payment entered on the order, or an online checkout) are unaffected. New pure helpers `ResolveInvoiceLeadDays`, `DecideDefaultSchedule` and `DefaultScheduleRows` in `PaymentScheduleBehavior`.
