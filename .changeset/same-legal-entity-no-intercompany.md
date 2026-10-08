---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-server": patch
---

Intercompany is between legal entities, not companies (golive #313). A Division, Department or Branch uses the books of its legal entity (`AccountingEngineBase.LegalEntityFor`, bizapps-accounting 0.21.0).

- Payment allocation: cash collected for a line of a company on the same legal entity books no Due To / Due From. The line's receivable is credited in the collector's entry, tagged with the line's dimensions. Between different legal entities the `IntercompanyAccountMatch` is looked up by the legal-entity pair, so the match rows for the legal entities cover every company under them.
- Account resolution: a Division's line resolves its legal entity's GL accounts. The company default is looked for on the Division's own company record, then on its legal entity's, and the D6 cross-company check compares against the legal entity.
- A Division with no parent, a parent with no profile, or a loop refuses booking with a message naming the company.
- The "intercompany entries will be created" hints on the allocation grid and the account-credit page count legal entities.

Requires BizApps Accounting >= 0.21.0: every `@mj-biz-apps/accounting-*` dependency is `>=0.21.0`, so one copy of `accounting-engine-base` loads.
