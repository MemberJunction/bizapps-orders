---
"@mj-biz-apps/orders-integration-tests": patch
---

New `billcom-rail` integration bundle (BR1–BR18) covers the Bill.com invoice rail against a real database, with Bill.com replaced by an in-memory stub behind the rail's gateway seam. It runs the send sweep, re-send, cancel, payment poll (preview, capture, watermark, part, multi-order, scheduled and unmatched payments) and the webhook handler, and checks that the send and poll jobs ship Disabled and in Preview.
