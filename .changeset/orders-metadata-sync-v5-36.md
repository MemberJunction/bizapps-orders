---
'@mj-biz-apps/orders-entities': minor
---

The 5.36 Metadata_Sync ships the eight settings and the task type that metadata/ added since 5.35: the order review settings (`OrderReviewTriggers`, `OrderReviewTotalThreshold`, `OrderReviewServiceStartMonths`, `OrderReviewLineTermMonths`, `OrderReviewerRole`, `OrderReviewEscalationRole`), the refund approval settings (`RefundApprovalThreshold`, `RefundApproverRole`) and the `ORDERS_ORDER_REVIEW` task type. A host that upgrades by migration gets the same rows as one that ran `mj sync push`, with the checks off until the settings are filled in. It has a Postgres counterpart.
