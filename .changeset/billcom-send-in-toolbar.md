---
"@mj-biz-apps/orders-ng": patch
---

Move the order's "Send to Bill.com" button from the collapsed External invoicing panel at the foot of the form into the form toolbar, in the slot Confirm order holds before the order is booked. The External invoicing panel keeps the invoice rows, the warning that blocks a send, and the actions on a selected invoice, and opens after a send so the result is in view.

Overlapping loads of the External invoicing panel (a save, the toolbar's Refresh, an action's own reload) no longer let an older load overwrite a newer one's invoice rows and Send state.
