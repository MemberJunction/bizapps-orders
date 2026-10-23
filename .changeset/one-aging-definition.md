---
"@mj-biz-apps/orders-ng": patch
---

The Orders dashboard and Customer A/R age open balances by the same rule.

The dashboard's first aging tile read "Current (0-30 days)" and swept in everything up to thirty days past due, so overdue money was reported as "Due or recently invoiced" while Receivables showed the same balances as 1-30 days late. The totals agreed and only the labels disagreed, which is the hardest kind to notice, because each page looks right on its own. The two also broke the top end differently: 61-90 and 90+ on the dashboard, 61+ on Receivables.

`AgingBucketOf` now states the rule once, beside the bucket type both screens already shared. Current means NOT YET DUE, then 1-30, 31-60 and 61+ days past due. An order with no due date has no age and counts as current.

The dashboard's tiles follow the four buckets the shared aging bar draws, which is also what its colour ramp was validated for.
