# UI Layering in BizApps Orders

How UI is structured in this repo, why, and what is left to do.

> **The standard itself lives in the MJ repo:
> [`guides/UI_LAYERING_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/UI_LAYERING_GUIDE.md)**
> (introduced in [MemberJunction/MJ#3403](https://github.com/MemberJunction/MJ/pull/3403)). Read
> that first — it is the rule for every MemberJunction repo. This document is the orders-specific
> companion.

---

## 1. The four layers, in this repo

| Layer | Package | What lives there |
|---|---|---|
| **L0** domain runtime | `@mj-biz-apps/orders-entities` | Pure TS. `OrderDraft`, pricing/allocation math, the engine contracts. No Angular. |
| **L1** presentational widget | `@mj-biz-apps/orders-ng-widgets` | `panels/` — the vocabulary every screen is assembled from. Props in, events out. |
| **L2** composite widget | `@mj-biz-apps/orders-ng-widgets` | `pages/` (the screen composites) and `composites/` (record composites). May read data **through `ProviderToUse`**. Never navigate. |
| **L3** Explorer surface | `@mj-biz-apps/orders-ng` | `sections/` (the four `BaseResourceComponent` tabs) and `custom/panels/` (form panels). Owns `NavigationService` / `MJFormPresenterService`. |

Two hard boundaries:

1. **Nothing at L0–L2 may import `@angular/router`, `@memberjunction/ng-shared`, or any
   `@memberjunction/ng-explorer-*` package.**
2. **Nothing at L3 may contain domain logic or markup a widget should own.**

Both are checked:

```bash
npm run check:ui-layers        # repo-wide; opt-in per package via "mjUILayer" in package.json
npx vitest run                 # includes packages/AngularWidgets/src/__tests__/widget-layer-purity.test.ts
```

---

## 2. What the split actually fixed

This repo was already close. `panels/` were clean, PascalCase-typed standalone components, and
`MJOStageChangeRequestEventArgs` was already a correct cancelable event. The problem was not the
component design — it was that **all of it shared one package with `@memberjunction/ng-shared`**.

That single dependency made the boundary unenforceable. Any file in `@mj-biz-apps/orders-ng` could
inject `NavigationService` or extend `BaseResourceComponent`, and nothing would have said a word.
Splitting the package is what turns "we don't do that here" into a build failure.

The gate found two real problems the moment it was pointed at the code:

- **`MJOOrdersDataService` called `new RunView()` and `new Metadata()`.** The browser is not
  inherently single-provider, so a `providedIn: 'root'` service that constructs its own `RunView`
  silently binds the global default and ignores whichever provider its host was handed. It now
  carries a `Provider` property with a `ProviderToUse` getter falling back to the global — so
  single-provider apps are unchanged, and a multi-provider host can scope it.
- **`subscriptions.page.ts` did the same inline.** Now extends `BaseAngularComponent` and reads
  through `ProviderToUse` like every other data-reading component in the ecosystem.

A pre-existing test failure also got fixed on the way through: `render-after-load.test.ts` had been
failing on `MJOOrderEditorPageComponent`, which assigned loaded data after an `await` without
calling `detectChanges()`. That guard exists because the exact failure it describes — a frozen view
showing empty states that read as "no data" — already shipped once. It was a real bug, not a stale
test.

---

## 3. The forms layer, which did not exist

The rich orders UI was reachable only from the four Explorer **section tabs**. Drilling into an
Order record any other way — a search result, a related-entity grid, a link from a journal entry —
landed on the stock generated form: a field dump with no stage, no money strip and no lines. One
order, two different-looking screens depending on how you arrived.

`<mjo-order-summary>` (L2) plus `OrderSummaryPanel` (L3) closes that. Note **how**:

> **It is a `BaseFormPanel`, not a `*Extended` form override.**

The obvious move is a custom form registered against `MJ_BizApps_Orders: Order Headers`. Don't.
That replaces the generated form outright, which means copying its ~400-line template and
hand-maintaining it against every CodeGen run. MJ already solved this: generated forms emit
`<mj-form-panel-slot>` hosts, and a `BaseFormPanel` registered with
`{ entity, slot, sortKey }` metadata mounts into the *generated* form with no override and no
duplication. The generated form keeps regenerating; the panel keeps rendering.

That is the same instinct as everything else here — **check what the platform already does before
building a parallel version of it.**

The panel itself owns three things, and nothing else:

```typescript
public get SummaryHeader(): MJOOrderSummaryHeader | null { … }   // project, don't cast
public OnBeforeStageChange(e: MJOStageChangeRequestEventArgs): void { e.Cancel = true; … }
public OnRecordOpenRequested(e: MJORecordOpenRequestedEventArgs): void { this.forms.Open(…); }
```

The stage veto is worth reading twice. It is not a limitation — confirming an order books journal
entries, which is not undoable, so it goes through the pre-flight review the Orders workspace
provides. This surface has no pre-flight, so it must not offer the verb, **and it says so** rather
than rendering a disabled control with no explanation.

---

## 4. The event contract

Full rules in the MJ guide §6. The three broken most often:

1. **`After*` must not fire on the canceled path.** Hosts rely on it.
2. **`Before*` handlers must be synchronous.** `EventEmitter.emit()` runs synchronous listeners
   inline, which is the only reason the emitter can read `Cancel` afterwards. An `async` handler
   returns at its first `await`, sets the flag too late, and the veto silently does nothing.
3. **Don't invent a veto for something that cannot be vetoed.** Announcements (`Saved`, `Applied`,
   `Refunded`) have no `Before` pair — the work already happened.

`output-wiring.test.ts` deliberately reaches **across** the package boundary to check that every
page's request output is answered by a section. That is not a layering violation; the seam is
exactly what it protects. A dead button is just as dead when the two halves ship as separate
packages — more so, since neither package's own build sees both sides.

---

## 5. What is left

| Item | Why |
|---|---|
| **Payment + Subscription panels** | Same treatment as `OrderSummaryPanel`, for `MJ_BizApps_Orders: Payment Headers` and `Subscriptions`. The composites to embed mostly exist; they need a record-bindable view model like `MJOOrderSummaryHeader`. |
| **Editing from the Order record** | `<mjo-order-summary>` is read-oriented. Full editing needs `OrderDraft.FromInput()` hydration from a saved order + lines, which is real work with real correctness risk — do it deliberately, with integration coverage, not as a layering side effect. |
| **`pages/` are large** | Several are 400–650 lines and mix arrangement with loading. They are correctly *placed* now; splitting L1 presentation out of them is the next refinement. `fast-entry` (528) and `payment-entry` (649) first. |
| **`OrderHeader.OriginChannel`** | The origin chip renders nothing because the column does not exist. `MJOOrdersDataService`'s `lxp` preset reports the same gap. Schema decision, not a UI one. |

---

## 6. Rules of thumb

- **Check MJ first.** The cheapest widget is the one you do not write — and the cheapest form
  customization is a panel slot, not an override.
- **A widget that needs `NavigationService` is not a widget.** It is an L3 surface, or it needs an
  event.
- **`new RunView()` in a widget is a bug**, not a style issue — it ignores the `Provider` the
  component was handed. Use `RunView.FromMetadataProvider(this.ProviderToUse)`.
- **Project, don't cast.** `ResultType: 'simple'` returns untyped rows; casting them to an
  interface means a renamed column renders `undefined` instead of failing the build.
