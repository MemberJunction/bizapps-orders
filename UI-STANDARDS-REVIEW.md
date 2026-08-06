# Orders UI — MJ standards review

Findings from converting the Orders UI to MJ components/tokens (2026-08-03), and the
items that need a decision rather than a fix. Amith's UX design is the spec throughout —
nothing here changes a flow, a control or product copy.

## Two root causes, both "the CSS was never there"

### 1. The kit was never loaded (fixed)

`orders-kit.css` (32 KB, the whole component kit) was **never loaded by a real MJ
Explorer**. It was `@import`ed by `mockups/assets/app.css` and by this repo's own
`apps/MJExplorer/src/styles.scss` harness — so mockups and Amith's local harness looked
right while the actual app rendered as unstyled text: no cards, no chrome, overlapping
footers. `ngc` only ships stylesheets a component references, and nothing referenced it.

**Fixed** by attaching it to `MJOSectionShellComponent` via `styleUrls` +
`ViewEncapsulation.None`, so Angular carries it wherever the app mounts with no host-app
wiring. This also makes PR #23's stylesheet relocation unnecessary.

The `stylesheet-wiring` guard passed throughout because it asserts against
`REPO/apps/MJExplorer/src/styles.scss` — the relic harness, not the real Explorer.
**It should be repointed or deleted.**

### 2. Half the kit was only ever written in the mockups (fixed)

`orders-kit.css` opens by promising it is the canonical source *"so the mockups and the
shipped UI cannot drift."* They drifted. The entire **§16 LAYOUT HELPERS** block —
`small`, `muted`, `tiny`, `strong`, `mono`, `row`, `wrap`, `spacer`, `sec-label` — was
authored **only** in `mockups/assets/app.css` and never migrated into the kit the app
ships. The markup referenced those classes **267 times** and every one resolved to
nothing: every caption rendered at full body size in full-strength ink, and every `.row`
collapsed from a flex row to a block stack.

This is why Amith's mockups look right and the shipped app looked flat — the mockups
carried a typography layer the app simply did not have. **Ported verbatim** into the kit
(the px sizes are his values, kept as-is; the design is the spec).

Three smaller instances of the same thing, also fixed: 51 `mjo-*__note` captions across
14 hooks had **no rule anywhere**, so each sat flush against the element above it; the
Customer A/R page referenced five layout hooks (`__grid`, `__row`, `__block`, `__total`,
`__note`) that were never written, so its lower cards stacked full-width instead of
pairing and each order/amount pair ran together as one line; and `.is-num` on the five
money inputs was undefined, so typed amounts left-aligned against right-aligned totals
beside them.

**Guarded going forward:** `pages/__tests__/kit-classes.test.ts` fails if any
app-owned class in a template has no rule in any stylesheet or `styles:[]` block.
Verified by reintroducing the bug — it goes red and names all 23 affected files. This
class of defect is invisible to both the compiler and a render test (the element exists
and the class attribute is correct), which is exactly why it shipped.

### 3. Sub-pages could not scroll (fixed)

`mj-left-nav-content` deliberately forces every **direct** child to
`flex / height:100% / overflow:hidden` via a `::ng-deep >` rule, which outranks a sub-page's
own `:host { overflow:auto }`. Projected straight in, every page became a fixed-height box
with overflow hidden — on Catalog, 1808px of content in a 702px box, so the *Product types*
and *Categories* headings were clipped and **unreachable** (a mouse wheel cannot scroll
`overflow:hidden`; only `scrollIntoView` could, which is why a naive check looked fine).

MJ's own answer is `mj-page-body-interior` — named in that rule's `:not()` exemption list and
self-declaring `flex:1 1 auto` + `overflow-y:auto`. Wrapping `<ng-content>` in it inside the
section shell restores scrolling for every section in **one** change, with the sub-pages as
grandchildren so their own `:host` layout applies as written. Verified with a real mouse wheel.

## Why there is a CSS "kit" at all — and it is not standard MJ

**It is not.** No other open app has one: accounting has 24 stylesheets but they are all
**component-scoped** (`shell-rail.component.css`); orders has a single 707-line **global** sheet.
MJ's standard is component-scoped styles + `--mj-*` tokens + `ng-ui-components`, and accounting
follows it (67 `ng-ui-components` references vs orders' 14).

The kit exists because of a **misdiagnosis**, recorded in its own header:

> *"These were shimmed in `mockups/assets/app.css` on the assumption that MJ supplies them at
> runtime… **It does not.** Loading the real app proved it: chips, banners, tabs, panels, the
> table frame and the slide-in were all completely unstyled in MJ Explorer."*

MJ **does** ship those — as **Angular components**, not as global CSS classes: `alert` (banners),
`filter-chip` / `stat-badge` (chips), `tab-nav` (tabs), `accordion` / `slide-panel` (panels and the
slide-in). Writing `<div class="mj-banner">` gets you nothing because the styling lives inside
`<mj-alert>`. The conclusion drawn was "MJ doesn't supply this," when the reality was "MJ supplies
it as a component we didn't use." Of the six families named, only the **table frame** is genuinely
absent from MJ.

**Bringing it in — roughly 40 of ~120 rule families are duplicates** of something MJ ships
(`.mj-banner`→`mj-alert`, `.mj-chip`/`.mj-filter-chip`→`mj-filter-chip`/`mj-stat-badge`,
`.mj-tab`→`mj-tab-nav`, `.mj-panel`→`mj-accordion`/`mj-slide-panel`, `.mj-split`→`mj-splitter`).
The rest is genuinely domain UI (money strip, status stepper, aging bar, invoice document,
decomposition ladder, fast-entry line cards) and should move from the global sheet into the
components that render it — that is the MJ shape, and it removes the need for a global sheet at all.

**⚠ Urgency this creates.** Attaching the kit via `ViewEncapsulation.None` (root cause 1) fixed the
app but made all 707 lines **global**, and the kit deliberately squats MJ's `mj-` prefix. Four class
names now collide with MJ's own: `mj-input`, `mj-filter-chip`, `mj-btn`, `mj-page-header`.
**`.mj-input` was a live conflict** — MJ ships it globally in `input/input.scss` and the kit
redefined it with different metrics (13px/6-10px/radius-md vs MJ's 14px/8-12px/radius-sm/38px), two
global rules of equal specificity with the winner decided by stylesheet **load order**. MJ happened
to be winning, which is luck, not design. **Fixed** by deleting the kit's copy and deferring to MJ
(verified: kit rules now 0, MJ's still winning). The remaining three are latent — `mj-filter-chip`
only bites if the app ever renders a real `<mj-filter-chip>`, and `mj-page-header` is inside an
`@media print` block that would hide MJ's header when printing **any** Explorer page. Those are in
the decision table.

## Fixed

| Item | What it was |
|---|---|
| Kit never shipped | see above — the cause of nearly every visual complaint |
| Designer rationale as UI copy | 6 instances ("Bars rather than a line…", "Rollups are trigger-maintained…" — the latter occupying a KPI card slot beside TOTAL/BALANCE) |
| Chart looked broken | 1.5% floor ≈ 1px at 84px tall, so six empty days read as a rendering failure. Added an axis + a distinct muted zero-tick |
| Empty money-strip cell | `ShowStatus` defaults `true`; a draft has no `PaymentStatus`, so an empty chip rendered in its own bordered column |
| BALANCE label ran inline | a `:last-child` flex rule meant for the status cell landed on BALANCE once the status cell stopped rendering |
| Footer overlap | sticky bar had no `z-index`/elevation, so cards bled through it |
| 29 buttons | `class="mj-btn mj-btn--x"` → `mjButton variant="x"`, per MJ's explicit rule |
| Empty state | hand-rolled → `mj-empty-state` |
| §16 helpers missing | 267 applications of `small`/`muted`/`row`/… resolved to nothing — see root cause 2 |
| 51 unstyled note captions | `mjo-*__note` had no rule in any of its 14 hooks; notes ran into the element above |
| Customer A/R layout | 5 referenced hooks were never written — cards stacked, order/amount pairs ran together |
| Money inputs left-aligned | `.is-num` undefined on all 5 money fields |
| Aging legend wrap | single `gap` shorthand left wrapped rows tighter than the note below, reading as two unrelated pairs |
| 3 more rationale captions | Payments ×2 and Customer A/R — the Payments/Receivables/Catalog sections were unreachable during the first pass |

## Decisions — RULED by Marcelo 2026-08-03

| # | Ruling | Status |
|---|---|---|
| 1 | **neutral == info; map it.** *"banners are meant to be banners and get attention a bit even if they're just info."* | ✅ **DONE** — all 43 banners are now `<mj-alert>`; 17 neutrals became `info`. `.mj-banner` deleted from the kit. `neutral` variant filed upstream as a **minor, non-blocking** ask. |
| 2 | Keep the KPI tile bespoke for now; find out if MJ has an analogue; log to both backlogs. | ✅ **DONE (filed)** — MJ **does** have one, unshared: `app-kpi-card` + `KPICardData` in `Explorer/dashboards/src/AI/`, plus d3 `time-series-chart` / `performance-heatmap`. `mj-stat-badge` is an inline **pill**, not a card, so it does not fill the gap. Filed upstream + orders backlog **11a**. |
| 3 | Move the bespoke components out of the global kit into components; token pass may wait for the PR-23 rework. | 📋 **PLANNED — backlog 11b.** Deliberately folded into the UI Layering adoption (below) rather than done ad hoc. |
| 4 | The `mj-` prefix squat is not defensible: *"is there ever a case in good mj design where we would introduce this instability? I do not think so."* | ⚠️ **PARTLY DONE** — the one **live** conflict (`.mj-input`) is fixed by deferring to MJ. The 89-class `mj-*`→`mjo-*` rename is backlog **11c**, folded into the same slice pass. |
| 5 | Swap the hex values to MJ analogues if there are any. | ✅ **ANSWERED** — 3 of the 4 aging-ramp steps **already are** MJ tokens. The 4th cannot be: MJ's error ramp stops at `-700`, and measured against `error-500` the 61+ step scores **dE 26.6** as `#991b1b` vs **16.3** as `error-700` — below this ramp's own documented 19.8 floor. Substituting would silently break a validated CVD ramp, so I filed for `--mj-color-error-800` instead. |
| 6 | Keep the mockup as reference for now; port only what is appropriate; do not create bad MJ design. | ✅ **NOTED** — mockup retained. Only §16 was moved (it was the drift source); nothing else ported. |
| 7 | Swap to MJ tokens; ask for `--mj-text-xxs` if needed — but sub-12px worries me for accessibility. | ✅ **DONE, and we should NOT ask for the token.** `small` 11.5px and `tiny` 10.5px both now resolve to **`--mj-text-xs` (12px)**. 12px is the practical legibility floor (Material and Apple HIG bottom out at 11–12px for *non-essential* labels) and `small` here carries **amounts, counts and statuses on 120 elements** — shrinking data below the floor is the exact case the floor exists for, and a token would institutionalise it. Hierarchy now comes from **colour and weight**, which keep the distinction at a legible size. |
| 8 | Leave for now; I will decide as I see them. | ⏸ Untouched. |
| 9 | Label the unlabelled data; hover at minimum, plus a human-readable value (8k) on the bar. | ✅ **DONE** — added `FormatCompact` (`$1k`, `$1.3k`, `$25k`, `$1.3M`; `—` for zero) with 6 unit tests. Value now sits above each bar; the exact figure stays on hover **and** in the aria-label. Bars scale against an inner track so the labels do not compress the scale. |

### The bigger frame — MJ issue #3404 (UI Layering)

Items 3 and 4 are both really *"stop being a special case."* MJ now has a standard for exactly this,
and **bizapps-orders PR #23 is one of its two worked examples** — with you as an assignee:

```
L3  Explorer surface   entity forms + resource/dashboard components; owns NavigationService; NO domain logic
L2  Composite widget   assembles L1; MAY read data, ONLY via ProviderToUse; NEVER navigates
L1  Presentational     props in, events out; zero data access
L0  Domain runtime     pure TS, no Angular at all
```

Moving the kit into components (3) and the `mjo-` rename (4) **are** the L1/L2 split. Doing them as a
separate sweep now would collide with that work and, in the issue's own words, *"a 40-file mechanical
sweep teaches nothing and reviews badly."* So both are staged as one-slice-at-a-time work under the
layering adoption — which also changes my earlier read of PR #23: it is not a stylesheet relocation,
it is the layering worked example.

## Original decision detail (for reference)



| # | Item | Why it is not a mechanical fix |
|---|---|---|
| 1 | **43 banners → `mj-alert` — all-or-nothing** | `MJAlertVariant` is `info \| success \| warning \| error`; there is **no neutral**, and 17 of the 43 are `--neutral`. Mapping those to `info` turns quiet grey explainer notes blue app-wide and makes the UI louder. **I did not convert the other 26 either, deliberately** — `.mj-banner` and `mj-alert` are near-identical in layout but differ in font size (12.5px vs `--mj-text-sm` 14px) and bottom margin, and `subscriptions.page.ts` stacks a neutral, an info and a warning banner *on one page*. Converting 26 of 43 would put two visibly different banner systems side by side — worse than either consistent state. **So the neutral answer gates the whole set.** Three options: (a) add a `neutral` variant to `mj-alert` upstream and convert all 43 — best, matches MJ's "extend the library" guidance; (b) map neutral→info and accept a louder UI; (c) keep all 43 on the kit's `.mj-banner`. |
| 2 | **KPI stat card** | MJ's `mj-stat-badge` is an inline pill (`inline-flex`, `radius-full`, `text-xs`) — a chip, not a card. There is **no MJ equivalent** for the dashboard KPI tile. Keep bespoke, or propose adding one to `ng-ui-components` (MJ's own guidance: extend the library rather than fork it). |
| 3 | **Decomposition ladder, aging bar, stage stepper, money strip** | Genuinely app-specific; MJ ships nothing comparable. Recommend keeping them but moving their CSS out of the global kit into component `styles:[]`. |
| 4 | **The `mj-` prefix on 203 kit classes** | **Deliberate, not accidental** — the kit's header says so: *"These share MJ's `mj-` prefix deliberately, so a reader cannot tell whether `mj-money-strip` came from the framework or from us… The cost is a possible future collision."* Worth an explicit ruling: keep, or rename to `mjo-`. |
| 5 | **9 hardcoded hex values** | The aging ramp (`#64748b/#f59e0b/#ef4444/#991b1b`), chosen by running MJ's palette validator for colour-vision-deficiency separation, plus `#fff` in a print rule. Violates the no-hardcoded-colour gate but is a real design decision — promote to named tokens rather than delete. |
| 6 | ~~§16 duplicated in the mockups~~ | **DONE** — removed the 43-line duplicate from `mockups/assets/app.css`, which already `@import`s the kit, leaving one definition in the file both consumers share. |
| 10 | **Global `@media print` hides MJ chrome** | The kit's print block does `.mj-page-header { display:none !important }`. Now that the kit is global, printing **any** Explorer page — not just an Orders invoice — would hide MJ's header. Needs scoping to the orders document, but the right scope depends on the intended print surface, so I left it. |
| 11 | **Retire the global sheet** | The real fix behind items 2–4: move the ~40 duplicate rule families onto MJ components and the domain ones into the components that render them, so no global sheet (and no `ViewEncapsulation.None`, and no prefix collisions) is needed. This is the "bring it in line with MJ" work — sizeable, and worth planning rather than improvising. |
| 7 | **Font sizes are px, not tokens** | `.small` is `11.5px` and `.tiny` `10.5px` — Amith's values, ported verbatim. MJ's nearest are `--mj-text-xs` (12px) / no 10.5 equivalent. The CI gate only covers colour, so this is not a violation, but snapping to tokens would shift every caption in the app. Your call. |
| 8 | **4 explanatory banners kept** | "Why this cannot double-bill", "The catalog is the behaviour root", "Orders held only by fulfillment", holder-vs-beneficiary. Unlike the rationale copy I removed, these explain **system behaviour** a finance user needs, not design decisions — so I left them. They are wordy; trimming them is a product-copy call, which is yours. |
| 9 | **Day-bars chart has no value labels** | With the demo data one day holds all $1,000, so it renders as a large unlabelled block. The component itself is sound (axis, zero-ticks, hover titles, aria). The app's own aging bar states *"every segment carries its amount"* — applying that here would be consistent, but it is a design change, not a defect fix. |

## Context for whoever picks this up

- Orders styles components very differently from accounting: **170** inline `styles:[]` blocks
  but only **2** `styleUrls`, with shared chrome hoisted into one global sheet. Accounting uses
  29 `styleUrls` + 57 inline and references `ng-ui-components` **67** times vs orders' **14**.
- `.mj-btn` was **not** in the kit — buttons already used MJ's global `button.scss`. The
  conversion to the directive is the sanctioned form, not a repair.
- Tokenisation was already good: **683** `var(--mj-*)` uses, 0 `rgba()`, 9 hex.
