# Plan: bring the Orders UI onto MJ's standard components and layers

**Status:** not started. **Priority:** low. Do it when time permits, within roughly 30 days of 2026-10-07.

## Why

The August standards pass ([`UI-STANDARDS-REVIEW.md`](../UI-STANDARDS-REVIEW.md)) fixed the visible defects:
- banners became `<mj-alert>`;
- buttons moved to `mjButton`;
- the kit started shipping.

It deferred three structural items (backlog 11a–11c) into the UI layering work in PR #23. **PR #23 was closed unmerged on 2026-08-11**, so those items currently have no home. This plan gives them one.

None of this is a defect users can see today. It is drift from MJ's standards, and the cost lands later:
- class collisions with MJ;
- components MJ fixes that Orders doesn't inherit;
- widgets that can't be reused outside the Orders Explorer surface.

## Where things stand (measured on `next`, 2026-10-07)

**Already on MJ components:**
- `<mj-alert>` ×44
- `mjButton` ×43
- `mj-tab-nav`, `mj-left-nav`, `mj-dropdown`
- `mj-page-layout` / `mj-page-header`
- `mj-empty-state`, `mj-stat-badge`

**Still drifting:**

| Item | Today | MJ standard |
|---|---|---|
| Global stylesheet | `styles/orders-kit.css`, 841 lines, attached globally via `ViewEncapsulation.None` on the section shell | Component-scoped styles plus `--mj-*` tokens; no global sheet |
| `mj-` class prefix | ~70 app classes in the kit use MJ's prefix (`.mj-chip`, `.mj-panel`, `.mj-slide-in`, `.mj-table`, …) | App classes use an app prefix (`mjo-`); the `mj-` prefix belongs to MJ |
| Slide-in panels | `.mj-slide-in` (hand-rolled) | `mj-slide-panel` |
| Select / typeahead | `.mj-select`, `.mj-typeahead` | `mj-dropdown`, `mj-combobox` |
| Split panes | `.mj-split` | `angular-split`, MJ's standard splitter |
| Collapsible panels | `.mj-panel` | `mj-accordion-panel` (or `mj-card` for non-collapsing panels) |
| Chips | `.mj-chip--*`, `.mj-filter-chip` | `mj-stat-badge`, `mj-filter-chip` |
| Empty states | `.mj-empty` alongside one real `mj-empty-state` | `mj-empty-state` everywhere |
| Loading | ~8 custom spinners (`fa-spin`, `.mj-spinner`, `.mjo-*__spinner`); zero `<mj-loading>` | `<mj-loading>` only |
| Tables | 26 hand-built `<table>`s | `mj-entity-data-grid` for record lists; hand-built is fine for document-shaped tables |
| Print rule | Kit's `@media print` hides `.mj-page-header` globally, so printing **any** Explorer page drops MJ's header | Scope print rules to the Orders invoice document |
| Layering | One Angular package (`@mj-biz-apps/orders-ng`), no `mjUILayer` | Split into `orders-ng-widgets` (L1/L2, `widgets`) and `orders-ng` (L3, `surface`), as Collaboration does |

**Genuinely Orders-specific UI that should stay bespoke:** the money strip, aging bar, status stepper, decomposition ladder, invoice document, fast-entry line cards and timeline. These are not to be replaced. They are to be moved: from the global kit into the components that render them, with `mjo-` classes.

## Approach: one slice at a time

The review warned that a 40-file mechanical sweep "teaches nothing and reviews badly." So work one vertical slice per PR, each fully converted and reviewable on its own. Suggested order, from least risk to most:

1. **Print scope.** Scope the `@media print` block to the invoice document. Tiny, and it fixes a real cross-app side effect.
2. **Loading.** Replace every custom spinner with `<mj-loading>`. Mechanical, low risk.
3. **Empty states and chips.** Convert `.mj-empty` → `mj-empty-state`, and `.mj-chip*` / `.mj-filter-chip` → `mj-stat-badge` / `mj-filter-chip`.
4. **Overlays and inputs.** Convert `.mj-slide-in` → `mj-slide-panel`, `.mj-select` / `.mj-typeahead` → `mj-dropdown` / `mj-combobox`, `.mj-panel` → `mj-accordion-panel`, `.mj-split` → `angular-split`. Check focus and keyboard behavior on each.
5. **Record-list tables.** Move list-style tables to `mj-entity-data-grid`. Leave document-shaped tables (invoice, ladder) as they are.
6. **Domain components.** For each bespoke component (money strip, aging bar, stepper, ladder, invoice, line card, timeline), move its rules from `orders-kit.css` into the component's own styles and rename `mj-*` → `mjo-*`.
7. **Retire the kit.** When `orders-kit.css` is empty, delete it and remove `ViewEncapsulation.None` from the section shell. Keep `kit-classes.test.ts` (every template class must have a rule) and point it at component styles.
8. **Layer split.** Extract presentational and composite components into `orders-ng-widgets` (`mjUILayer: "widgets"`, no `@angular/router`, no `@memberjunction/ng-shared`), and mark `orders-ng` as `surface`. The checkout widget is the first candidate, since it already behaves like L1/L2. Run `mj standards check`. This is the slice PR #23 attempted, so reuse its learnings.

Steps 1–5 are independent and can be done in any order. Step 7 depends on 3–6. Step 8 can start any time, but is easiest after 7.

## Done when

- `orders-kit.css` is gone, and no app class uses the `mj-` prefix.
- No custom spinners; `<mj-loading>` only.
- `npm run check:ui` and `mj standards check` both pass with Orders' packages declaring `mjUILayer`.
- Printing a non-Orders Explorer page keeps MJ's header.
- Mockups (`/mockups`) are still the visual reference, so do a visual check of each slice against them.

## References

- [`UI-STANDARDS-REVIEW.md`](../UI-STANDARDS-REVIEW.md): the August findings and Marcelo's rulings
- [`docs/ui-architecture.md`](../docs/ui-architecture.md): binding UI rules for this repo
- MJ `guides/UI_LAYERING_GUIDE.md` and `packages/Angular/Generic/ui-components/README.md`
- BizApps Collaboration's `ng-widgets` / `ng` split: the reference layering
