---
"@mj-biz-apps/orders-core-entities-server": patch
---

Correct CI's stale figures and stop claiming changesets are enforced

The workflow described 217 integration checks and 250 unit tests; there are 366 and 999.
`migrations/_README.md` said a changeset was required "(CI enforces)" — there was no changeset
tooling in the repo at all, and the claim sat unenforced through several schema changes. The rule
above it claimed migration timestamps were CI-enforced too; no such check has ever existed either.
Both now state what is true, which is that they are review items.

Adds `@changesets/cli` configured against this repo's `next` trunk, and an ADVISORY warning
annotation on pull requests. Advisory rather than a gate on purpose: a red X on a documentation PR
with no version impact is a check people learn to ignore.
