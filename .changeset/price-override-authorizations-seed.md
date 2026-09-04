---
"@mj-biz-apps/orders-entities": minor
---

Ship the three price-override Authorizations to hosts.

`metadata/authorizations/.price-override.json` declares `MJ.BizApps.Orders.Price.Override` and its
two children, but metadata is a dev-time source — the install engine never reads that directory, so
records reach a host only through a migration. Without one the price-override permission checks
would find no authorization to test against anywhere but the developer's own database, and
`scripts/check-release-seed-coverage.mjs` blocked the release saying exactly that.

The seed guards on **ID or Name**, because `__mj.Authorization` carries `UQ_Authorization` on
`Name`: on a host that created these via `mj sync push`, MJ assigned its own IDs, so an ID-only
guard passes and the insert then trips the unique constraint. The children resolve their parent by
name rather than by the literal ID for the same reason.
