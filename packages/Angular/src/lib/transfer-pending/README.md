# transfer-pending/ — parked framework-clean components

> **Parking discipline (non-negotiable).** Everything in this folder is **owed to another home** —
> `@memberjunction/ng-ui-components`. It is parked here so orders can use it now without blocking on
> the promotion, and for no other reason.

## Why there are two copies of this today

`bizapps-accounting` parks the identical `workspace-tabs/` framework in its own `transfer-pending/`.
**That duplication is deliberate, temporary, and is itself the argument for promoting it**: the moment
a second app needed the workspace card, the cost of not having promoted it became a copy. A third app
must NOT make a third copy — promote it instead.

The two copies are identical apart from this README. If you change one, change both or promote.
Tracked in `plans/archive/bizapps-orders-master.md` §21d.

## The rule that makes extraction cheap

**Nothing in this folder may import an orders entity, an orders service, or anything from `../pages/`,
`../panels/`, `../sections/` or `../services/`.** Only Angular, MJ core/base packages, and other files
in this folder.

That constraint is what keeps extraction a **file move + import rename** rather than a refactor. If you
find yourself wanting an orders type in here, the component doesn't belong here — either it is
orders-domain (put it beside its page) or the type needs to be an `@Input()` / a generic.

There is a test that enforces this: `src/__tests__/transfer-pending-purity.test.ts`. It fails the build
the moment a parked component reaches for an orders package. Don't weaken it — it IS the discipline. A
prose rule decays the first time someone is in a hurry.

## Check MJ first — the cheapest parked component is the one you don't build

Before parking anything new here, **search MJ's `ng-ui-components` / `ng-shared*` packages for the
idiom first.** A parked component is a debt owed to a future transfer; an MJ component is free. That
rule has already retired work in this app: the banners, tabs and inputs the orders kit used to
hand-roll are now `mj-alert`, `mj-tab-nav` and `mj-input`.

## What's parked here

| Folder | Target home | Why it is generic |
|---|---|---|
| `workspace-tabs/` | `@memberjunction/ng-ui-components` | A tab carries an opaque `State`; the framework moves tabs around and never inspects the payload. Accounting fills it with journal-entry drafts, orders fills it with order drafts, and neither app appears anywhere in the framework's types. |

## DESIGN RULE — size workspace content by CONTAINER, not viewport (Marcelo 2026-07-21)

Inside a workspace, **use CONTAINER units for sizing, never viewport units.** The workspace card
(`mj-workspace-card`) is declared a query container (`container-type: size`), so content sizes with
**`cqh` / `cqw` / `cqi`** — relative to the card, which is a **window/pane** in the inward (dock/split)
system. A `vh`/`vw` value sizes to the whole screen regardless of the pane the card sits in, so it
breaks the moment the card is in a split or a smaller window.

- ✅ `height: 55cqh;` (55% of the workspace card) · `max-height: 88cqh;`
- ❌ `height: min(45vh, 560px);` (viewport-relative — wrong in a pane)
- Fixed **px** floors/ceilings are fine as bounds (`min-height: 160px`); the *proportional* size is `cq*`.

This rule was written naming the order editor as a future surface. It now is one — the order
workspace obeys it.
