---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

A product's Accounting tab now shows an "Effective accounts" block: for Sales, Deferred Revenue, Sales Discounts, Sales Returns and Allowances and Accounts Receivable, the account an order line books to and whether it comes from the product, its category or a parent category, its product type, or the company default, with roles that resolve nowhere flagged. It reads a new read-only remote operation, `Orders.ExplainProductGLAccounts`, which runs the same walk confirm books through.
