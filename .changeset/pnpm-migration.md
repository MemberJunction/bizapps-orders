---
"@mj-biz-apps/orders-entities": patch
---

Migrate the workspace from npm to pnpm and remove the MJAPI/MJExplorer dev harness,
mirroring bizapps-tasks and bizapps-accounting. No published package's code, types,
metadata or migrations change — build tooling only, hence a patch.

`packageManager` moves to `pnpm@10.33.0`; npm-only files/keys are dropped; CI workflows
move to pnpm; the load-bearing workspace settings mirror MJ core (`linkWorkspacePackages`,
`onlyBuiltDependencies`). The npm `overrides` move to pnpm-workspace.yaml with the stale
`@memberjunction/core|global ^5.50.0` pins corrected to `^6.1.0-edge.1` — those stale pins
were orders#60's root cause, and the `apps/` tree they were holding together is deleted here.
The npm-era `link:local` / `postinstall` / `.mj-links.json` local-linker is deleted: MJ 6.x
workspace linking is how cross-app source dependencies resolve now. `mj:migrate` gains
`--schema __mj_BizAppsOrders --dir ./migrations` (bare `mj migrate` silently applied
nothing — same fix as tasks and accounting).

**No pnpm-lock.yaml is committed, deliberately.** The workspace root's devDependencies pin
`@mj-biz-apps/accounting-server` and `@mj-biz-apps/accounting-engine-base` for the
integration harness, and no `@mj-biz-apps/accounting-*` package has ever been published —
standalone registry resolution 404s, which link:local + the stale npm lock previously
masked (CI red since 30 July, orders#60). A valid lockfile becomes possible when accounting
publishes, or when CI moves to the MJ-workspace build. Until then install-based CI remains
blocked — pre-existing, now stated instead of hidden.

Verified: all six packages build green as workspace members against MJ next
(6.1.0-edge.1 + MJ#3717) alongside bizapps-common, bizapps-tasks and bizapps-accounting.
