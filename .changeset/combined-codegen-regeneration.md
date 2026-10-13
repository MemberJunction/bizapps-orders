---
'@mj-biz-apps/orders-entities': minor
---

The collected migrations for term dates, overlap reasons, amount changes, VAT location evidence and seat counts carry CodeGen output regenerated against a database built from migrations, so each later migration's views and procedures keep the columns earlier ones added. A new heal migration ships the Order Headers geo-embed view and the CHECK-constraint validators no migration installed; the regenerated validators have new names.
