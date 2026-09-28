---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": patch
---

An order confirmed by hand with no payment schedule, whose service starts further out than its invoice lead, now gets one `Scheduled` instalment per company for that company's whole line gross, due on the earliest service start less the lead (orders #342). Under D92 that books no receivable at confirm; the instalment is billed from the billing worklist when it falls due. The lead is the new nullable `ProductCategory.InvoiceLeadDays`, inherited from the nearest ancestor category that states one, else the new Orders setting `DefaultInvoiceLeadDays` (30). Orders that carry their own schedule, lines with no service period and reversal orders are unaffected. New pure helpers `ResolveInvoiceLeadDays` and `DefaultScheduleRows` in `PaymentScheduleBehavior`.
