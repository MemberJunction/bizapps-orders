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

**A real pnpm-lock.yaml is committed.** Two things previously made that impossible: the
workspace root's devDependencies pinned the unpublished `@mj-biz-apps/accounting-*`
packages (for the root integration harnesses), and pnpm 10's default
`autoInstallPeers: true` turns even optional peer ranges into fatal registry 404s. The
root no longer declares the unpublished packages — the harnesses resolve accounting
through `packages/IntegrationTests` (which declares them as optional peers) via
`test-harnesses/resolve-app-packages.mjs` — and `autoInstallPeers: false` is set with the
reasoning in-file. Accounting staying unpublished is accepted WIP: install-based CI now
installs cleanly from a bare checkout; the build leg that needs accounting stays red until
it publishes.

Verified: all six packages build green as workspace members against MJ next
(6.1.0-edge.1 + MJ#3717) alongside bizapps-common, bizapps-tasks and bizapps-accounting.
