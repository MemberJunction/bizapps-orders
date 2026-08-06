---
"@mj-biz-apps/orders-integration-tests": patch
---

Build the app packages in CI before running the tests

CI ran `npm ci` then `npx vitest run` with no build in between. `registry-parity.test.ts`
imports a workspace package by name, whose `main` points at a `dist/` that `npm ci` does not
produce — so the file failed to RESOLVE and never executed.

The reported shape was the dangerous part: ~989 passing plus a red X, which reads as a known
failure rather than as 76 tests that are not running. The same command locally reports 1065,
and the difference is exactly this one file.

That matters because of WHAT does not run. `registry-parity` is the anti-vacuity floor — it
asserts exact per-bundle check counts and cross-checks the four places a bundle name has to
agree, because adding a bundle without a Test record, or a Test record that never joins the
suite, both leave the integration suite passing with strictly less in it. Both have happened.
The floor was being enforced nowhere.

Second reason, independent of the test: CI could not catch a BUILD break at all. package.json
and package-lock.json disagreed about `@types/express` for 24 commits and every `npm ci`
failed — nobody noticed, because the check was already red for the other reason. A
permanently-red check stops being read, and then it stops working.

Uses `build:packages`, not `build`: it compiles the six `@mj-biz-apps/orders-*` packages the
tests import and skips `mj_api` / `mj_explorer`, which are MJ's apps and would add Angular
build time for no coverage here.
