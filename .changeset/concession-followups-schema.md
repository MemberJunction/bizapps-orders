---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Schema for concession follow-ups (golive #281, #268). `RequiresSaleApproval` (nullable bit) on Product Types, Product Categories and Products, for products that always need an approver's sign-off; NULL inherits Product -> category chain -> type. `OrderConcession.SignedAmendmentReference` records where a concession's signed contract amendment is kept. New `ReferralProgram` entity (company, name, `DaysPerReferral`, active) and `OrderConcession.ReferralProgramID`. Schema only; the behaviour ships separately.
