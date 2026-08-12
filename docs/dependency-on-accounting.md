# `bizapps-accounting` is a hard requirement — and the manifests now say so

**Short version:** BizApps Orders cannot book an order or a payment without BizApps Accounting. It
is a hard requirement in code, and since the pnpm migration the manifests declare it as a
**mandatory peer dependency**. The remaining accommodation for accounting being unpublished is
`auto-install-peers=false` in `.npmrc` (installers don't try to fetch peers from the registry) plus
the harness resolver shim — both come out the day accounting publishes; see the to-do below.

---

## Why it is a hard requirement

Orders is the AR subsidiary ledger. Two of the things it does are *write journal entries*:

| What | Where | Calls accounting |
|---|---|---|
| Confirming an order books revenue, one JE per line | `OrderEntityServer.Save` | yes |
| Capturing or reversing a payment books the cash leg | `PaymentLineEntityServer.Save` | yes |

`PaymentLineEntityServer` **statically imports** `AccountingEngineBase` and calls
`ResolveIntercompanyAccounts` on every allocation. There is no conditional, no feature flag, and no
degraded mode. A genuinely absent package fails at module load.

An order that confirms without a ledger behind it is the failure this codebase is most careful
about — it reconciles perfectly against itself while the revenue simply never existed. The
intercompany path is deliberately unforgiving for the same reason. From `PaymentAllocationFactory`:

> *A MISSING PAIR IS FATAL. There is no fallback account, because a guessed intercompany account…*

and from `PaymentLineEntityServer`, when accounting returns fewer entries than we drafted:

> *The cash leg is incomplete; refusing to commit.*

Both are correct. Failing loudly at the moment money would otherwise be mis-booked is the design.

---

## ✅ DONE: the peer dependencies are mandatory (pnpm migration, 2026-08)

The `optional: true` markings are gone — accounting is declared as a plain mandatory
`peerDependency` in `packages/Server`, `packages/CoreEntitiesServer` and
`packages/IntegrationTests`. This is safe *before* accounting publishes because
`auto-install-peers=false` (`.npmrc`) means installers never try to fetch peers from the registry:
an unmet mandatory peer is a warning (`strict-peer-dependencies=false`), not a 404. Verified with a
full `pnpm install --frozen-lockfile` from the registry on a bare copy.

(History, for anyone reading old commits: the markings existed because the npm era auto-installed
peers — npm 7+, and pnpm 10's `autoInstallPeers: true` default — which turned an unpublished
mandatory peer into a fatal registry 404. Turning auto-install off removed the reason for the
markings, so the manifests could finally tell the truth: accounting is required.)

## ☐ TO-DO: when `bizapps-accounting` publishes

**Trigger:** `@mj-biz-apps/accounting-*` is published to npm.
**Owner:** whoever runs the accounting publish.

1. Re-declare `@mj-biz-apps/accounting-server` and `@mj-biz-apps/accounting-engine-base` in the
   root `devDependencies` (they were removed because an unpublished root dep blocks lockfile
   generation), and regenerate `pnpm-lock.yaml`.
2. Delete `test-harnesses/resolve-app-packages.mjs` and return its callers to bare imports — the
   shim exists only because the root cannot declare accounting.
3. Flip `.npmrc` `auto-install-peers` to `true` (the common/accounting family baseline).
4. Confirm `pnpm install --frozen-lockfile` from a bare checkout resolves everything from the
   registry, then delete this to-do.

### What the marking is NOT

It was never a design statement. Accounting is resolved through MJ 6.x workspace linking (both
repos materialized as members of one parent pnpm workspace) because it is unpublished, and a CI
runner doing a registry install cannot fetch it. A CI constraint has been wearing a dependency
declaration's clothes.

---

## Local development

Both repos are linked into one MJ 6.x parent workspace (mjdev's parent-workspace topology, or any
pnpm workspace that lists them as members) — that is how orders resolves accounting's packages
during development. You need `bizapps-accounting` in the same workspace **and built**, or orders
will not typecheck.

The root `test-harnesses/*.mjs` scripts are the one wrinkle: the repo root deliberately does not
declare the unpublished accounting packages (a root declaration would make the root unresolvable
from the registry and no lockfile could exist), so the harnesses import accounting through
`test-harnesses/resolve-app-packages.mjs`, which resolves via `packages/IntegrationTests` — the
package that declares them as peers.

## Configuration that must exist before money moves

Being installed is necessary and not sufficient. Accounting also has to be *configured*:

- **Intercompany account pairs** for every ordered company pair a payment can span. A payment
  received by one company against another company's order produces due-to/due-from legs, and a
  missing pair is fatal by design. Seed the pairs before any cross-company payment is captured. This
  is a data task, not a code task, and it bites during migration — historical orders carry their
  original billing companies, so payments collected under a consolidated entity will span pairs that
  never existed before.
- **GL account resolution** for the accounts the order and payment factories ask for.

## Related

- `plans/bizapps-orders-master.md` — D13 (intercompany), D18 (capture entry), D80/D81
- `plans/intercompany-balancing.md` — the shape of the due-to/due-from legs
- `test-harnesses/resolve-app-packages.mjs` — how the root harnesses resolve accounting
