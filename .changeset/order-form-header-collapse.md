---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

The custom Order Header form can collapse to customer + date + money so a large order gives its lines the vertical space. The expanded/collapsed preference lives in UserInfoEngine and applies only when opening an existing order — a new record always starts expanded. Leftover related (charges, adjustments, payment intents/lines) are inclusion None because the custom form already owns those surfaces.
