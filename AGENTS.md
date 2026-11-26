# BizApps Orders — Agent Instructions

Read [`CLAUDE.md`](CLAUDE.md) first — it is the authoritative guide for this repository (commands, UI architecture, incremental migrations, SQL safety, release lines, MJ version policy, and CodeGen rules). Also read MemberJunction's root `CLAUDE.md` / `AGENTS.md`.

## Critical Rules

- **Strict TypeScript:** ZERO `any` types (`: any`, `as any`, `<any>`) and ZERO lazy `unknown`. ZERO `BaseEntity.Get()` / `.Set()` — use generated entity properties and derive value-list unions (`Entity['Field']`).
- **Singletons:** Always extend `BaseSingleton<T>` (or `BaseEngine<T>`) from `@memberjunction/global` / `@memberjunction/core` — never manual `static _instance`.
- **Angular:** Modern `@if` / `@for` / `@switch` control flow, `inject()`, `standalone: false` on NgModule components. Follow [`docs/ui-architecture.md`](docs/ui-architecture.md) — no data-access service layer wrapping `BaseEntity` or Remote Operations.
- **No cross-package re-exports:** Each package exports only what it defines.
- **SQL Safety:** Never use inline regex `.replace(/'/g, "''")`. Use `EscapeSQLString` (`@memberjunction/global`) and `RequireUUID` / `RequireUUIDs` / `RequireDate` (`@mj-biz-apps/orders-entities` / `CoreEntitiesServer/src/sql-guards.ts`).
- **Migrations & CI:** Incremental `V` migrations only — never edit a merged migration and never modify protected `ci/` files. Add a `.changeset/*.md` file for package changes targeting `next`. Merge PRs with merge commits (`--merge`), never `--squash`.

## 5-Rule BizApps Performance & Caching Standard

1. **`BaseEngine` (`OrdersEngine`) for Bounded Reference & Catalog Metadata:** Read `*Type` tables, `Payment Providers`, `Order Company Policies`, `Price Lists`, `Price Tiers`, `Products`, `Product Prices`, `Product Categories`, `Product Bundle Items`, `Dimension Defaults`, and `Event Products` synchronously from `OrdersEngine.Instance` after `LoadOrdersEngine(provider, user)`. Never re-query them with ad-hoc `RunView`s per mount.
2. **Multi-Provider & Impersonation Safety:** `OrdersEngine` overrides `ProviderToUse` to follow the active provider passed to `Config()` / `Metadata.Provider`, evicts & reloads on client-side (`ProviderType.Network`) user switches (never on server `ProviderType.Database` per-request `contextUser` changes), exposes `InvalidateCache()` / `IsConfiguredForUser()`, uses `CacheLocal: true` only on global non-RLS reference metadata (`CacheLocal: false` on any RLS-filtered entity), and gates optional reads on `EntityInfo.GetUserPermisions(user)?.CanRead`.
3. **Mandatory `rv.RunViews([...])` Single-Request Batching:** Never fire `Promise.all([rv.RunView(...), rv.RunView(...)])` or independent sequential `await rv.RunView(...)` calls. Batch independent reads into one `rv.RunViews([...])` call (`RunView.FromMetadataProvider(provider)`, `LoadOverviewBatch`, or `RunViewsBatch`) with `ResultType: 'simple'` and narrow `Fields` whenever mutation is not needed.
4. **Bounded Container Caching Only:** Never globally cache unbounded transactional tables (`Order Headers`, `Order Lines`, `Payment Headers`, `Subscriptions`, etc.) or arbitrary `ExtraFilter` SQL views. Only bounded container bundles with `BaseEntity` invalidation + `Invalidate*()` + persona-switch eviction are permitted.
5. **RLS-Safe Two-Step Entity Reads:** Never write raw SQL subqueries against RLS-filtered base views (`vw*`) in `ExtraFilter`; read the RLS-protected entity via `RunView` first and filter the target with `ID IN (...)`.

## Verification

```bash
pnpm run build
pnpm run test:unit
```
