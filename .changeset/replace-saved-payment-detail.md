---
'@mj-biz-apps/orders-entities': patch
---

Changing the Receiving Company or the tender on a saved draft payment that already has instrument details (a reference number, card or bank fields) no longer fails with "Cannot use the ROLLBACK statement within an INSERT-EXEC statement". A saved payment detail is a snapshot the database refuses to edit; the payment now gets a new detail carrying the same instrument fields with the corrected company and tender, and the saved detail is left unchanged.
