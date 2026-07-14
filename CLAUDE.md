# BizApps Orders — development guide

A **MemberJunction Open App**: the product catalog + order lifecycle. Its defining behavior is the
**accounting integration** — when an order first transitions to `Confirmed`, it books a balanced
journal entry into **BizApps Accounting** via the `Accounting.CreateJournalEntry` remote operation.
Built for AM-7 step 5 (see `plans/2026-07-02-engine-meeting-amendment.md` §3–5, `erd-orders-target.md`).

## Repository structure
```
mj-app.json            - manifest (schema __mj_BizAppsOrders; depends on mj-bizapps-accounting)
migrations/            - Skyway migrations (B202607061431 baseline: ProductType/Category/Product/Order/OrderLine)
packages/
  Entities/            - @mj-biz-apps/orders-entities   (CodeGen entity subclasses — do not hand-edit generated/)
  CoreEntitiesServer/  - @mj-biz-apps/orders-core-entities-server
                         · orderJournalDraft.ts  — PURE Dr/Cr assembly (offline-unit-tested)
                         · OrdersEngine.ts        — catalog cache + ResolveAccount (product→category→company)
                         · OrderEntityServer.ts   — books the JE on first Confirmed
  Actions/             - @mj-biz-apps/orders-actions
  Server/              - @mj-biz-apps/orders-server  (bootstrap → MJAPI; startupExport LoadBizAppsOrdersServer)
  Angular/             - @mj-biz-apps/orders-ng      (bootstrap → MJExplorer; generated entity forms = the basic UI)
test-harnesses/        - server/order-to-je.ts (live integration) + testing.md (coverage matrix)
```

## Critical rules (same as MJ + accounting — see the instance root CLAUDE.md for the full list)
1. **No commits without explicit approval; never ask; never push.** (This app is being developed on a
   `feature/` branch in the bizapps-orders repo per Marcelo's standing authorization — commit as work
   progresses, NEVER push, NEVER merge to another branch.)
2. **No `any`; no `.Get()/.Set()`** for typed fields; derive value-list unions from the entity (rule 2c).
3. **Never edit `src/generated/`** — CodeGen owns it. After a schema change: migrate → codegen → commit
   the regenerated code with the migration.
4. **Never edit an applied migration** — add a new `V*` file.
5. **BaseSingleton** via `super.getInstance<T>()`; **functional decomposition** ≤30–40 lines;
   **PascalCase** public members.
6. **Single-copy invariant** — `@memberjunction/*` are peers. Cross-app deps on
   `@mj-biz-apps/accounting-engine-base` + `accounting-core-entities-server` are the intended integration seam.

## The integration (how an order becomes a JE)
`OrderEntityServer.Save()` → if `Status==='Confirmed' && !JournalEntryID`:
`OrdersEngine.buildDraftForOrder` resolves each line's revenue account (Sales/Deferred Revenue, via
`AccountingEngineBase.ResolveLinkedAccount`: product link → up the category tree) + each company's AR
account (company-default link), assembles a balanced draft (`orderJournalDraft.ts`), and books it via
`new CreateJournalEntryOperation().Execute(draft, {user})`. Success stamps `JournalEntryID` +
`ConfirmedAt` (idempotency guard). Failure BLOCKS the Confirm + logs (never silently unbooked).

## Schema shape (amendment §3)
Product/Order carry **NO GL columns** — accounting's polymorphic `GLAccountLink` points AT Product /
ProductCategory / Company rows. `Order` has **no CompanyID** (multi-company via each line's resolved
`GLAccount.CompanyID`) and **no currency** (FX deferred). Cross-app refs (CustomerOrganizationID,
JournalEntryID) are **soft** (no FK).

## Dev loop (dev-linked into accounting-engine-dev)
```sh
# from the instance worktree root (~/MJDev/instances/accounting-engine-dev/mj):
mjdev app build accounting-engine-dev bizapps-orders     # rebuild sub-packages
mjdev run accounting-engine-dev api                       # restart MJAPI to pick up server dist (no HMR)
# schema change → mjdev app setup accounting-engine-dev bizapps-orders  (migrate → codegen → build)
```
Tests + run recipes: `test-harnesses/testing.md`. MJ's own CLAUDE.md (instance root) is the highest
authority for anything MemberJunction.
