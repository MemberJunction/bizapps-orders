# `bizapps-accounting` is a hard requirement

**Short version:** BizApps Orders cannot book an order or a payment without BizApps Accounting. Every
package that uses accounting declares it as a mandatory peer dependency. Accounting has been on npm
since 2026-08-21, so a plain `pnpm install` resolves it from the registry. The old "when accounting
publishes" to-do is closed; see [what is left](#what-is-left-of-the-publish-to-do) for how each item
ended.

---

## Why it is a hard requirement

Orders is the AR subsidiary ledger. It *writes journal entries* on two main paths:

| What | Where | Calls accounting |
|---|---|---|
| Confirming an order books revenue, one JE per line | `OrderEntityServer.Save` | yes |
| Capturing or refunding a payment books the cash leg: one entry for the receiving company, plus one for each company on another legal entity that owns a line on the order | `PaymentHeaderEntityServer.Save` when the payment moves into Captured or Refunded; `PaymentLineEntityServer.Save` for an allocation added to a captured or refunded payment | yes |

Issuing an instalment invoice, recording progress on a percentage-of-completion line and extending a
booked term book entries too.

On the server, accounting's engine is reached through
`packages/CoreEntitiesServer/src/AccountingBridge.ts`, which **statically imports**
`AccountingEngineBase` from `@mj-biz-apps/accounting-engine-base`: GL account resolution, legal
entities, and `ResolveIntercompanyAccounts` for the intercompany pairs an allocation needs.
(`DimensionDefaultResolver.ts` also imports one helper, `pickActiveLinkIndex`, from the same
package.) The entries themselves go to accounting's `Accounting.CreateJournalEntries`
remote operation, resolved by key when the booking runs. There is no conditional, no feature flag,
and no degraded mode. Without `accounting-engine-base` the package fails at module load; without
accounting's server package loaded, the first booking fails because `Accounting.CreateJournalEntries`
is not registered.

An order that confirms without a ledger behind it is the failure this codebase is most careful
about — it reconciles perfectly against itself while the revenue simply never existed. The
intercompany path is deliberately unforgiving for the same reason. From `PaymentAllocationFactory`:

> *A MISSING PAIR IS FATAL. There is no fallback account, because a guessed intercompany account…*

and from `PaymentHeaderEntityServer` and `PaymentLineEntityServer`, when accounting returns fewer
entries than were drafted:

> *The cash leg is incomplete; refusing to commit.*

Both are correct. Failing loudly at the moment money would otherwise be mis-booked is the design.

---

## How the packages declare it

Accounting is a mandatory `peerDependency`, so the host installs one copy, with a matching
`devDependency` that anchors local builds and tests. That is the dependency model in
[`CLAUDE.md`](../CLAUDE.md). Each package's `package.json` is the source of truth; today:

| Package | Accounting peers (`>=0.21.0`) | devDependencies |
|---|---|---|
| `packages/CoreEntitiesServer` | `accounting-core-entities-server`, `accounting-engine-base` | the same, exact `0.21.2` |
| `packages/Server` | `accounting-engine-base`, `accounting-entities`, `accounting-server` | the same, exact `0.21.2` |
| `packages/Angular` | `accounting-engine-base`, `accounting-ng` | the same, exact `0.21.2`; plus `accounting-entities` `>=0.21.0` for type-only imports |
| `packages/IntegrationTests` (private) | `accounting-engine-base`, `accounting-server` | the same, as `>=0.21.0` |

`packages/Entities` and `packages/Actions` import no accounting package (the Entities tax resolver
reads accounting's tax entities by name, so it needs accounting's schema, not its packages).
`mj-app.json` declares the app dependency `mj-bizapps-accounting` at `>=0.21.0 <1.0.0`.

## What is left of the publish to-do

This doc used to carry a to-do for the day accounting published. Accounting has published; this is
where each item stands:

1. **Re-declare accounting in the root `devDependencies`.** Not needed: with the helper kept (item
   2), the root harnesses resolve accounting through `packages/IntegrationTests`, which declares it.
2. **Delete `test-harnesses/resolve-app-packages.mjs`** and return its callers to bare imports. Not
   doing, by decision (#583): the helper stays, and `integration.mjs`, `booking-live.mjs`,
   `invoice-live.mjs`, `seed-demo-data.mjs` and `seed-review-data.mjs` keep importing accounting
   through it.
3. **Set `auto-install-peers=true` in `.npmrc`**, the common/accounting family baseline. Done.
4. **Confirm a bare checkout installs from the registry.** Done in practice: the lockfile resolves
   accounting from npm, and CI runs `pnpm install --frozen-lockfile` and `build:packages` on a fresh
   runner.

---

## Local development

`pnpm install` resolves accounting's packages from npm through each package's devDependency, so a
checkout of this repo alone installs, builds and runs the unit tests. To change accounting and orders
together, link both repos into one MJ 6.x parent pnpm workspace (mjdev's parent-workspace topology,
or any pnpm workspace that lists them as members), and build accounting before orders.

The root `test-harnesses/*.mjs` scripts import accounting through
`test-harnesses/resolve-app-packages.mjs`, which resolves it from `packages/IntegrationTests`, the
package that declares it; the repo root declares no accounting package.

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

- `packages/CoreEntitiesServer/src/AccountingBridge.ts` — the engine import and the shared booking helpers
- `plans/archive/bizapps-orders-master.md` — D13 (intercompany), D18 (capture entry), D80/D81
- `plans/archive/intercompany-balancing.md` — the shape of the due-to/due-from legs
- `test-harnesses/resolve-app-packages.mjs` — how the root harnesses resolve accounting
