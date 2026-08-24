---
'@mj-biz-apps/orders-server': patch
---

Split the release into a version step and a publish step, so neither writes to a protected branch.

`version.yml` (new, on `next`) turns pending changesets into a reviewable "Version Packages" PR —
bumps, CHANGELOGs, the mj-app.json version and range, and a refreshed lockfile.
`release-readiness.yml` (new) gates the version PR and any PR to `main`. `publish.yml` keeps only
the publish half and refuses to run while changesets are pending.

Ported from bizapps-accounting, where the old flow published 0.2.0 to npm and then failed to write
the version bump back: `ci/commit_push.mjs` pushes straight to `main`, the `main-next-protect`
ruleset requires a pull request, and `github-actions[bot]` cannot be granted a bypass. This repo
carries the identical ruleset and would fail the same way on its first release.
