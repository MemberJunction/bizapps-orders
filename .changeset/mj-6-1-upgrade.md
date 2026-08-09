---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-actions": minor
"@mj-biz-apps/orders-ng": minor
---

Upgrade MemberJunction from 5.50 to 6.1.0-edge.1, and declare four dependencies that were resolving
by accident.

The upgrade itself is clean: none of the APIs removed in 6.x — `BeginISATransaction` /
`CommitISATransaction` / `RollbackISATransaction`, `BaseEntity.ProviderTransaction`,
`PropagateTransactionToParents()` — had a single call site here. The 21 `BeginTransaction()` sites
use the depth-counted primitive that survives and is now what IS-A chains use too.

All five repos move together because `BaseEntity` became generic in 6.x (`BaseEntity<unknown>`), so
a package still on 5.x consuming an entity class built against 6.x fails to compile.

**Four undeclared dependencies surfaced**, each previously satisfied by a stale repo-level
`node_modules` left over from a pre-workspace `npm install`. Once that hoisting was removed they
stopped resolving, which is the correct behaviour and would have broken any standalone consumer too:

- `@memberjunction/actions`, `@memberjunction/actions-base` and `@memberjunction/templates` are
  imported by `packages/Server` (the invoice, payment-intent and send-document actions) and were
  declared nowhere. Added as peer dependencies, matching that package's convention for MJ packages.
- `@angular/cdk` is imported by the workspace tab strip in `packages/Angular` and was declared
  nowhere. Added as a peer at the `>=21.0.0 <22.0.0` range the rest of the workspace uses.

Also declares `vitest` at the repo root, where `vitest.config.ts` lives. It was declared only in
individual packages, so the repo-wide suite could not be launched from the root.

Verified: 31 packages build clean, and the full unit suite passes — 39 files, 1062 tests.
