---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-actions": patch
"@mj-biz-apps/orders-ng": patch
---

Move to MemberJunction 6.1.0-edge.3, and make `orders-ng` loadable by Node.

The workspace was on a half-applied edge.2 line: `@memberjunction/ng-hierarchy-tree` was pinned to
`6.1.0-edge.2` while the peer ranges asked for `^6.1.0-edge.1`, and the two `@mj-biz-apps/common-*`
dependencies were pinned to `5.33.2`, which predates the components this package imports. Both now
point at versions that exist and agree: MJ at `6.1.0-edge.3`, common at `>=5.35.0`.

`orders-ng` shipped ESM that only a bundler could load. It declares `"type": "module"`, but its
build was `ngc` alone — and `tsconfig.angular.json` sets `"moduleResolution": "bundler"`, which
permits extensionless relative specifiers and emits them verbatim. Node's ESM resolver rejects
those, so `import('@mj-biz-apps/orders-ng')` failed with `ERR_MODULE_NOT_FOUND` naming a file that
was present in the package. 274 of the 346 relative specifiers in `dist` were affected, 19 of them
emitted by ngc itself for template component references, which no source-level change can reach.

The fix is the one the rest of this workspace already used: run `tsc-alias -f`
(`--resolveFullPaths`) after the build. The other five `orders-*` packages build with
`tsc && tsc-alias -f` and have zero extensionless specifiers; the Angular package builds with `ngc`
and was the only one that skipped it. Adding it takes `dist` to 0 extensionless and 0 unresolvable
specifiers with no source changes.

Test-side, eight Angular suites could not load at all, and had been invisible while CI was failing
earlier in the job. Same root cause, in dependencies rather than here: every BizApps `*-ng` package
has this defect (`accounting-ng` 218 specifiers, `common-ng` 81, `tasks-ng` 64). `vitest.config.ts`
now inlines those so Vite resolves them instead of Node — the real modules stay in the graph, so
unlike the `accounting-engine-base` alias beside it, nothing is stubbed and the class-registration
assertions still test real registrations.

Verified: 31 packages build clean; 64 test files, 1232 tests pass.
