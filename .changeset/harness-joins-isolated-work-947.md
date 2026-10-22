---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

The integration checks that complete a checkout (SR46, SR52 and SR53) pass again (#947). Since the
checkout capture moved onto its own provider (#928), it wrote on another connection, outside the
transaction each check holds and rolls back, and waited on that transaction's locks until the 60 s
request timeout. `JoinCallerTransaction` is a new test seam: inside it, `WithIsolatedProvider` runs its
work on the caller's provider, and `InRolledBackTransaction` runs each check inside it. The seam is
scoped to one async call chain, and production never enters it, so outside it `WithIsolatedProvider`
behaves as before.
