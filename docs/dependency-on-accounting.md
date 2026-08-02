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

Then: `npm install` at the repo root, confirm the peers resolve from the registry with no `ERESOLVE`
or 404, and delete this whole to-do section plus the one below it.

### Why it is deferred rather than done

Accounting is not published. npm 7+ installs peer dependencies automatically, so a *mandatory* peer
it cannot fetch fails the entire install — verified:

```
npm error code E404
npm error 404 '@mj-biz-apps/accounting-core-entities-server@>=0.1.0' is not in this registry.
```

That would block every developer and every CI run for the sake of a manifest claim, during a build
window where nobody can afford it. The optional marking is the lesser wrong of the two while the
package is unpublishable, and it comes out the day that stops being true.

There is no workaround flag in this repo. An earlier revision added `legacy-peer-deps=true` to a root
`.npmrc`; it was removed deliberately. A repo-wide npm setting that silently changes resolution for
*every* dependency is a large, invisible lever to pull for one temporary problem, and a documented
to-do is easier to find and to close than a config file nobody reads twice.

### What the marking is NOT

It was never a design statement. Accounting is resolved through a sibling-checkout symlink
(`scripts/link-local-apps.mjs`) because it is unpublished, and a CI runner running `npm ci` cannot
fetch it from the registry. A CI constraint has been wearing a dependency declaration's clothes.

---

## Local development

`.mj-links.json` declares the sibling checkout and `scripts/link-local-apps.mjs` symlinks it on
postinstall. You need `bizapps-accounting` checked out next to this repo **and built** — run
`npm install && npm run build` there first, or orders will not typecheck.

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
- `.mj-links.json`, `scripts/link-local-apps.mjs` — how the sibling checkout is resolved
