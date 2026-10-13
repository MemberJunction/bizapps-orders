---
"@mj-biz-apps/orders-integration-tests": patch
---

New `billcom-rail` integration bundle (BR1–BR20) covers the Bill.com invoice rail against a real database, with Bill.com replaced by an in-memory stub behind the rail's gateway seam. It runs the send sweep, re-send, cancel, payment poll (preview, capture, watermark, part, multi-order, scheduled and unmatched payments) and the webhook handler. It checks that the send and poll jobs ship Disabled and in Preview, that a poll asked to record cash records nothing while its job is Disabled and only previews while it is in Preview, and that each invoice a payment touched is refreshed with its own due amount.
