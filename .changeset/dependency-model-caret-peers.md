---
"@mj-biz-apps/orders-actions": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-server": patch
---

MemberJunction and other BizApps packages are peer dependencies with caret ranges (`^6.1.5` for
MemberJunction, `^5.49.0` for common, `>=0.21.0` for accounting; no `~`, nothing in
`dependencies`), so a 6.2 host keeps one copy of each instead of installing a second tree. MemberJunction
devDependencies and the root `pnpm.overrides` use the same `^6.1.5` floor. Adds `check-dependency-model` to CI.
