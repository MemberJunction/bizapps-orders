---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
---

Resolve and store `OrderHeader.DueDate` from payment terms (D83)

Nothing derived a due date. `DueDate` was only ever what a caller passed, `PaymentTermsType` had no
rows, and `Orders.GetOverdueWorklist` returned zero rows against 67 orders carrying an unpaid
balance — a collections screen reporting a quiet afternoon because its only input was null on every
row.

Adds a resolution walk (the third of this shape after GL accounts and price): stated `DueDate` →
stated `PaymentTermsTypeID` → the buyer's `CustomerPaymentTerms` → the selling company's
`AccountingCompanyProfile.DefaultPaymentTermsTypeID` (which existed and nothing read) → due on
receipt. Resolved once at confirm and STORED, so aging, the worklist and the invoice all read one
date instead of deriving three.

Terms are deliberately not per-product: they are a property of the deal, and an order carrying a
Net 30 and a Net 60 product has no coherent answer.
