# Checkout public URL + Open App `serverExtensions` auto-load

Work that has not started. Use this file as the implementation checklist.
Two PRs, same scope, no extras:

| Repo | Branch | Target | What |
|---|---|---|---|
| MemberJunction/MJ | `an-dev-70` | `next` | Auto-load Open App `serverExtensions` from packages listed in the host `mj.config.cjs` |
| MemberJunction/bizapps-orders | `an-dev-12` | `next` | Declare those extensions on `@mj-biz-apps/orders-server`; add `GET /checkout/:slug` vanilla host |

Do **not**: generalize `/f` + `/c` into a core slug-host framework; add an Explorer `/checkout/:slug` route; ship a custom-element checkout bundle; build LXP entitlements / claims E2E; edit historical migrations; commit MJ `mj.config.cjs` `dynamicPackages`; switch omnibus branches.

---

## Concurrence (MJ side)

Yes. An installed Open App is the entry in the **target MJ environment's** `mj.config.cjs` → `dynamicPackages.server[]` (written by `mj app install`, or the local-dev equivalent). That entry already has the npm package name (`PackageName`) and optional `StartupExport`. `createMJServer` already `import()`s those packages (so `@RegisterClass` fires). It does **not** collect their `serverExtensions`, and `serve()` only initializes `configInfo.serverExtensions` from the **host** config.

The host Zod schema does not include `dynamicPackages`, so that section is stripped from `configInfo`. Discovery therefore happens in `@memberjunction/server-bootstrap` from the raw cosmiconfig result (the same place `RESOLVER_PATHS` are collected), not from `configInfo`.

"URL" here is the npm package locator (`PackageName`, resolved from the host that named it) — not an HTTP fetch of a running Open App. Introspect the resolved package:

1. **Runtime (preferred):** named export `MJ_SERVER_EXTENSIONS` on the imported server module.
2. **Static fallback:** `package.json` → `memberjunction.serverExtensions`.

Then merge with the host `serverExtensions[]`. Host `DriverClass` wins (RootPath, Settings overlay, `Enabled: false` disables a discovered extension). Slack/Teams-style host-only extensions still work. Operators do **not** copy Open App extension blocks into the host `mj.config.cjs`.

---

## Out of scope (explicit)

- [x] ~~Generic MJ public-slug host for `/f` and `/c`~~ — Forms keep `BaseServerMiddleware` + `<mj-form>`; checkout stays on `OrdersCheckoutEdge`.
- [x] ~~Explorer guest checkout route~~
- [x] ~~Custom-element / IIFE checkout widget bundle~~
- [x] ~~Turnstile widget on the vanilla page~~ (initialize still fail-closes if the widget requires it)
- [x] ~~`mj app install` writing `serverExtensions` into the host config~~ — auto-load replaces copy-paste
- [x] ~~Entitlements, LXP API, identity-claim E2E~~

---

## MJ checklist (`an-dev-70`)

### 1. Pure collect / merge in `@memberjunction/server-extensions-core`

- [x] Add `normalizeServerExtensionConfigs(raw, options?)` — skip entries missing `DriverClass` or `RootPath`; default `Enabled: true`, `Settings: {}`.
- [x] Add `extractServerExtensionsFromModule(mod)` — read `mod.MJ_SERVER_EXTENSIONS`.
- [x] Add `mergeServerExtensionConfigs(discovered, host)`:
  - identity is `DriverClass`
  - later discovered package replaces an earlier one (ClassFactory last-wins)
  - host overlay: `Enabled` / `RootPath` from host when provided; `Settings` is `{ ...discovered, ...host }`
  - host-only DriverClasses append
  - host `Enabled: false` keeps the entry so the loader skips it (does not fall back to the discovered one)
- [x] Export from `index.ts`. Document the Open App convention in the package README.
- [x] Unit tests covering: empty/null, invalid entries, export missing, host-only, discovered-only, Settings overlay, RootPath overlay, disable-from-host, duplicate DriverClass last-wins, order (discovered then new host).

### 2. `serve()` consumes discovered extras

- [x] Extend `MJServerOptions` with `serverExtensions?: ServerExtensionConfig[]` (discovered list, **not** the merged result).
- [x] In `serve()`, `mergeServerExtensionConfigs(options?.serverExtensions ?? [], configInfo.serverExtensions ?? [])` then `LoadExtensions`.
- [x] Direct `serve()` callers with no option keep today's host-only behavior.
- [x] README: Open App packages in `dynamicPackages.server[]` auto-load; host `serverExtensions` is override + host-only (Slack/Teams).

### 3. Bootstrap introspects installed Open Apps

- [x] After a successful `importFromHost` in `loadDynamicAppPackages`:
  1. `extractServerExtensionsFromModule(mod)`
  2. if empty, resolve the package's `package.json` from the host anchor and read `memberjunction.serverExtensions`
  3. normalize; skip `Enabled: false` **package** entries (already skipped); collect in `dynamicPackages.server[]` order
- [x] Pass collected list as `options.serverExtensions` to `serve()`.
- [x] Missing package still must not crash boot (existing contract).
- [x] Unit tests in ServerBootstrap: enabled app export reaches `serve` options; disabled app does not; no-export + package.json fallback; no-export and no package.json → empty extras; missing package still boots; host merge is **not** done in bootstrap (serve does it).

### 4. MJ packaging

- [x] Changeset: patch `@memberjunction/server-extensions-core`, `@memberjunction/server-bootstrap`, `@memberjunction/server`.
- [x] Do **not** commit `mj.config.cjs`, metadata JSON, or CodeGen SQL already dirty on this branch.

---

## Orders checklist (`an-dev-12`)

### 5. Publish extension metadata on `@mj-biz-apps/orders-server`

- [x] Export `MJ_SERVER_EXTENSIONS` (webhook + checkout edge; same DriverClass / RootPath as this repo's `mj.config.cjs`).
- [x] Mirror the array under `package.json` → `memberjunction.serverExtensions` (static introspection).
- [x] Re-export from `packages/Server/src/index.ts`.
- [x] Unit test: export shape, DriverClass names, RootPaths, matches package.json.

### 6. `GET /checkout/:slug` vanilla host on `OrdersCheckoutEdge`

- [x] Register `GET ${root}/:slug` next to the existing POSTs (still pre-auth).
- [x] Reserved slugs (`initialize`, `draft`, `payment-intent`, `complete`) → 404 HTML, not a host page.
- [x] Unknown / inactive distribution → 404 HTML.
- [x] Valid Active distribution → `text/html; charset=utf-8`, `Cache-Control: no-store`.
- [x] Pure renderer (`checkout-host-page.ts`): slug and API root only via escaped `data-*` attributes; boot script is a static string (Forms host-page XSS rule).
- [x] Boot script talks **only** to existing POSTs (`initialize` → `draft` → `payment-intent` if required → `complete`). No amount/price/provider in request bodies.
- [x] Same-origin POSTs from this page must pass the widget `allowedOrigins` gate (allow when `Origin` host matches `Host`; allowlist remains for cross-origin embeds).
- [x] CORS `Allow-Methods` includes `GET`.
- [x] If initialize returns `productId` (or SKU-resolved id written back onto Configuration), the page can draft a line. Write resolved `productId` back in `discoverExtensionFields` so SKU-only widgets work.
- [x] Paid checkouts: if `stripePublishableKey` is in the sanitized config, load Stripe.js and confirm the intent; otherwise explain that card capture needs that key (or an embed). Zero-dollar completes without a card.
- [x] Rate-limit GET (same limiter, distinct key).
- [x] `RegisteredRoutes` includes `GET ${root}/:slug`.

### 7. Orders tests + docs + packaging

- [x] Unit tests for: HTML escaping / no raw slug in `<script>`; reserved slug; GET 200/404/503 with mocked RunView + UserCache; same-origin vs allowlist; route registration; `MJ_SERVER_EXTENSIONS`; SKU → `productId` write-back.
- [x] Update `docs/checkout-widget-and-session-architecture.md` § embedding: public URL is MJAPI `GET /checkout/:slug`, not Explorer.
- [x] Changeset: patch `@mj-biz-apps/orders-server` (and `@mj-biz-apps/orders-core-entities-server` if the productId write-back lands there).
- [x] Do **not** commit `.env.pre_it*`, `apps/`, or host `dynamicPackages`.

---

## Local verification

- [x] MJ: `pnpm exec vitest run` in `packages/ServerExtensionsCore` and `packages/ServerBootstrap`.
- [x] Orders: `pnpm exec vitest run` for the new Server tests plus CheckoutSessionService productId write-back.
- [ ] After MJ packages build, a host whose `dynamicPackages.server[]` includes `@mj-biz-apps/orders-server` loads `OrdersCheckoutEdge` **without** copying that block into host `serverExtensions`. (Needs a rebuilt MJAPI on this MJ branch — not run as a live boot in this PR.)

---

## PR notes

- MJ PR depends on nothing from Orders (framework is generic).
- Orders PR is useful on current MJ (host still *can* list `serverExtensions` by hand) and becomes copy-paste-free once the MJ PR is running.
- Stay on `an-dev-70` / `an-dev-12`. Do not retarget or rename branches.
