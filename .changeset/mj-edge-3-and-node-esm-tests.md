---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-actions": patch
"@mj-biz-apps/orders-ng": patch
---

Move to MemberJunction 6.1.0-edge.3, and get the Angular suites running again.

The workspace was on a half-applied edge.2 line: `@memberjunction/ng-hierarchy-tree` was pinned to
`6.1.0-edge.2` while the peer ranges asked for `^6.1.0-edge.1`, and the two `@mj-biz-apps/common-*`
dependencies were pinned to `5.33.2`, which predates the components this package imports. Both now
point at versions that exist and agree: MJ at `6.1.0-edge.3`, common at `>=5.35.0`.

Eight Angular test suites could not even load, and had been invisible while CI was failing earlier
in the job. The cause is not in this repo: every BizApps `*-ng` package declares `"type": "module"`
but ngc emits extensionless relative specifiers (`./lib/generated/generated-forms.module`). Node's
ESM resolver rejects those, so the failure is an `ERR_MODULE_NOT_FOUND` naming a file that is
present in the tarball. Bundlers resolve them, which is why the Angular build is green and only the
Node-side runner trips. `vitest.config.ts` now inlines the `*-ng` packages so Vite resolves them
instead of Node — the real modules stay in the graph, so the class-registration assertions still
test real registrations rather than a stub.

Verified: 31 packages build clean; 64 test files, 1232 tests pass.
