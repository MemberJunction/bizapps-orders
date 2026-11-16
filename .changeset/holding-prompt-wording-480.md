---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The order line prompt for a product the customer already has is reworded as a question (golive #480): "Is this line a renewal of that subscription, or a new one?" The choices are now "Renew <subscription>" and "Create new subscription", each showing the dates it gives the line, and the hint under them says when renewing will run on different dates from the ones entered. Wording only: what confirm does with each answer is unchanged.
