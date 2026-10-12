---
'@mj-biz-apps/orders-entities': patch
---

A stated tax charge is recognised by its charge type's `Category = 'Tax'` instead of by its code containing "tax" (#562). A stated `VAT` now replaces the tax resolved from the ship-to address, as a stated `SalesTax` does, instead of being charged on top of it. A non-tax charge whose code contains "tax" no longer turns tax resolution off. The tax-type lookup is one exported helper, `ReadTaxChargeTypes`, shared by the walk, `ReadStatedTaxCharges` and `DeleteTaxCharges`.
