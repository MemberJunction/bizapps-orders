---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The order form's Payment tab re-reads the payment schedule after a save, so a first save no longer leaves it on "Loading payment schedule…" until Refresh or Confirm. `LoadPaymentSchedule` sorts on instalment number then company, which settles the order of two rows sharing a number on an order part-invoiced before the per-company rows were collapsed. An instalment that is invoiced, paid or written off but has no journal entry now reads "No entry posted" instead of "Not raised"; "Not raised" is kept for an instalment canceled before invoicing.
