---
"@mj-biz-apps/orders-core-entities-server": patch
---

Concession approval tasks find each approver's Person through the user's own People link first: `LinkedEntityRecordID`, when the user's `LinkedEntityID` is People or an IS-A subtype of it. `People.LinkedUserID`, which bizapps-common deprecated and a platform that binds users through a People subtype leaves empty, is the fallback for users without that link. Before, an approver bound only through a People subtype resolved to no Person, so recording a concession that needs approval was refused.
