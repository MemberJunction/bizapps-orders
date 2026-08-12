# `bizapps-accounting` is a hard requirement — and the manifests do not say so yet

**Short version:** BizApps Orders cannot book an order or a payment without BizApps Accounting. It is
a hard requirement in code today. The `package.json` files still mark it `optional: true`, which is
**wrong and known**, and there is a dated to-do below to fix it. Do not read the manifest as
permission to run without accounting.

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

## ☐ TO-DO: make the peer dependency mandatory when `bizapps-accounting` publishes

**Trigger:** `@mj-biz-apps/accounting-*` is published to npm.
**Owner:** whoever runs the accounting publish.
**Why it is not done already:** see the next section.

Delete the `peerDependenciesMeta` blocks that mark accounting optional — **five entries across two
files**:

```jsonc
// packages/CoreEntitiesServer/package.json
"peerDependenciesMeta": {
  "@mj-biz-apps/accounting-engine-base": { "optional": true },          // ← delete
  "@mj-biz-apps/accounting-core-entities-server": { "optional": true }  // ← delete
}

// packages/Server/package.json
"peerDependenciesMeta": {
  "@mj-biz-apps/accounting-server": { "optional": true },        // ← delete
  "@mj-biz-apps/accounting-entities": { "optional": true },      // ← delete
  "@mj-biz-apps/accounting-engine-base": { "optional": true }    // ← delete
}
```

The `peerDependencies` entries themselves already exist and are correct; only the optional markings
come out. If a file is left with an empty `peerDependenciesMeta`, remove the key entirely.

Then: `pnpm install` at the repo root, confirm the peers resolve from the registry with no 404,
regenerate `pnpm-lock.yaml`, and delete this whole to-do section plus the one below it. At that
point `autoInstallPeers: false` in `pnpm-workspace.yaml` (and its justifying comment) can be
revisited too — it exists precisely because the optional accounting peers are unresolvable.

### Why it is deferred rather than done

Accounting is not published. pnpm 10's default `autoInstallPeers: true` turns every peer range —
optional or not — into an install instruction, so an unpublished peer is a fatal registry 404 and
no lockfile can be generated. `pnpm-workspace.yaml` sets `autoInstallPeers: false` for exactly this
reason (the reasoning is in-file). A *mandatory* peer would put us right back there: it would block
every developer and every CI run for the sake of a manifest claim, during a build window where
nobody can afford it. The optional marking is the lesser wrong of the two while the package is
unpublishable, and it comes out the day that stops being true.

(Historical note: the npm-era version of this problem was npm 7+'s peer auto-install, and an
earlier revision worked around it with `legacy-peer-deps=true` in `.npmrc` — removed deliberately,
for the same reason we now put the pnpm setting in `pnpm-workspace.yaml` with its reasoning
attached rather than in a config file nobody reads twice.)

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
package that declares them as optional peers.

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
