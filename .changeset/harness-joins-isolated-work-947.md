---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

The integration checks that complete a checkout (SR46, SR52 and SR53) pass again (#947). Since the
checkout capture moved onto its own provider (#928), it wrote on another connection, outside the
transaction each check holds and rolls back, and waited on that transaction's locks until the 60 s
request timeout. `JoinCallerTransactionForTests` is a new test seam: inside it, `WithIsolatedProvider` runs its
work on the caller's provider, and `InRolledBackTransaction` runs each check inside it. The seam is
scoped to one async call chain, and production never enters it, so outside it `WithIsolatedProvider`
behaves as before.

The seam is exported only from a new `./testing` subpath
(`@mj-biz-apps/orders-core-entities-server/testing`), not from the package root. The package now has
an `exports` map (`.`, `./testing`, `./package.json`): the root exports what it did before, minus the
seam, and a deep import into `dist/` is no longer resolvable.
