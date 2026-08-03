---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Add `CustomerPaymentTerms` — the terms a particular buyer negotiated

Date-effective and optionally scoped to one selling company, keyed on organization or person the way
`CustomerTaxExemption` and `CustomerPaymentMethod` already are. Not an IS-A extension of
`AccountingCompanyProfile`: that profile IS-A `Company` and describes the SELLER, whereas a buyer
here is an Organization or a Person — there is nothing to extend.

Seeds the six standard `PaymentTermsType` rows the walk resolves against; the table had none.
