---
"@mj-biz-apps/orders-entities": patch
---

The Credit Card tender now books its processor fee as its own journal entry at capture (Dr Processing Fee / Cr Cash), so cash reads net of the gateway's fee and the fee reaches the Processing Fee account (bc-aidp-next-golive#460). The seed row in `metadata/payment-types` carries `BookProcessingFeeInline = 1` to match the value set directly in AIDP Next production on 2026-11-11; it reaches a host through the next release's Metadata_Sync migration.
