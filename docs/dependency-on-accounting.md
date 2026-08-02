# `bizapps-accounting` is a hard requirement, not an option

**Short version:** BizApps Orders cannot book an order or a payment without BizApps Accounting.
It is a **mandatory peer dependency**. If you are looking at a manifest that says otherwise, the
manifest is wrong.

---

## Why it is mandatory

Orders is the AR subsidiary ledger. Two of the things it does are *write journal entries*:

| What | Where | Calls accounting |
|---|---|---|
| Confirming an order books revenue, one JE per line | `OrderEntityServer.Save` | yes |
| Capturing or reversing a payment books the cash leg | `PaymentLineEntityServer.Save` | yes |

`PaymentLineEntityServer` **statically imports** `AccountingEngineBase` and calls
`ResolveIntercompanyAccounts` on every allocation. There is no conditional, no feature flag, and no
degraded mode. An order that confirms without a ledger behind it is the failure this codebase is
most careful about — it reconciles perfectly against itself while the revenue simply never existed.

The intercompany path is deliberately unforgiving about it. From `PaymentAllocationFactory`:

> *A MISSING PAIR IS FATAL. There is no fallback account, because a guessed intercompany account…*

and from `PaymentLineEntityServer`, when accounting returns fewer entries than we drafted:

> *The cash leg is incomplete; refusing to commit.*

Both are correct. Failing loudly at the moment money would otherwise be mis-booked is the whole
design.

## What was wrong before

`peerDependenciesMeta` marked every `@mj-biz-apps/accounting-*` peer as `optional: true` in both
`packages/CoreEntitiesServer` and `packages/Server`. That is a claim the code contradicts: npm would
happily install orders without accounting, and the failure would surface at the first booking rather
than at install time.

The marking was never a design statement. It was a workaround for accounting being **unpublished** —
it is resolved through a sibling-checkout symlink (`scripts/link-local-apps.mjs`), and a CI runner
running `npm ci` cannot fetch it from the registry. A CI workaround had been wearing a dependency
declaration's clothes.

The `optional: true` entries are now gone. The peers are mandatory and say what is true.

## The interim: why there is an `.npmrc`

npm 7+ installs peer dependencies automatically, so a *mandatory* peer it cannot fetch fails the
whole install:

```
npm error code E404
npm error 404 '@mj-biz-apps/accounting-core-entities-server@>=0.1.0' is not in this registry.
```

The repo root carries an `.npmrc` with `legacy-peer-deps=true`, which stops npm auto-installing
peers. The dependency is still declared and still mandatory — npm just stops trying to download
something that does not exist yet, and the symlink script wires up the sibling checkout on
postinstall as it always has.

**This is not permission to run without accounting.** A genuinely absent package fails at module
load, because the import is static.

### On publish day

1. Publish `bizapps-accounting`.
2. Delete `/.npmrc`.
3. `npm install` — confirm the `@mj-biz-apps/accounting-*` peers resolve from the registry.
4. Delete this section and the `.npmrc` note above it.

Until then, `npm install` at the repo root works unchanged; nobody needs to pass a flag by hand.

## Local development

Unchanged. `.mj-links.json` declares the sibling checkout and `scripts/link-local-apps.mjs` symlinks
it on postinstall. You need `bizapps-accounting` checked out next to this repo **and built** —
`npm install && npm run build` in that repo first, or orders will not typecheck.

## Configuration that must exist before money moves

Being installed is necessary and not sufficient. Accounting also has to be *configured*:

- **Intercompany account pairs** for every ordered company pair that a payment can span. A payment
  received by one company against another company's order produces due-to/due-from legs, and a
  missing pair is fatal by design. Seed the pairs before any cross-company payment is captured —
  this is a data task, not a code task, and it bites during migration when historical orders carry
  their original billing companies.
- **GL account resolution** for the accounts the order and payment factories ask for.

## Related

- `plans/bizapps-orders-master.md` — D13 (intercompany), D18 (capture entry), D80/D81
- `plans/intercompany-balancing.md` — the shape of the due-to/due-from legs
- `.mj-links.json` and `scripts/link-local-apps.mjs` — how the sibling checkout is resolved
