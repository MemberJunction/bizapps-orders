# design-docs/ui-design/ — standing UI design (bizapps-orders)

The STANDING (present-tense) UI design layer for this app: what the UI is, plus the assets used to
design what it becomes. Convention: `~/MJDev/shared-plans/ui-design-system.md`. Split rules (ruled
2026-07-15): standing design artifacts live in `design-docs/` — the hand-authored documentation
home (`docs/` stays reserved for GENERATED doc output, per the MJ template's `/docs/` ignore); UI
**work** is planned and executed from `plans/action-plans/` (`ActionPlan - UI …`), keyed to
`plans/FEATURE-LIST.md` IDs.

| Path | What it is |
|---|---|
| `UI-FEATURE-LIST.md` | UI coverage index over `plans/FEATURE-LIST.md` (same IDs, never its own numbering): which features have a surface, which need one, loop status per row. |
| `style-kit/` | `mj-mock.css` — snapshot of MJ's design tokens + chrome classes — and `PROVENANCE.md`, the git pin to the MJ commit it was synced against (one-command freshness check at each mockup session). |
| `shell/` | The ONE standing reference mockup: the app frame every new mockup clones (into `mockups/`). Kit-derived; to be grounded against live Explorer screenshots at the first mockup session (banner in the file). |
| `mockups/` | Ephemeral working area for mockup cycles. **Empty (or absent) between cycles** — that is the health check. A selected mockup is superseded by its action plan and deleted; frame improvements fold into `shell/` first. **Current state (2026-07-16):** the round-2 set (17 linked pages) is APPROVED and converted to per-screen specs (UI action plan §13); RETAINED as the build agents' visual reference until that build completes, then deleted. |

## Component inventory (sharing / MJ-base tracking)

Every deliberate UI component this app adds (beyond generated forms) gets a row, so sharing and
MJ-base candidacy are decided on record, not memory — updated at each ui-dev-loop close.
Homes: this app · `bizapps-common` (genuinely cross-app UI) · `bizapps-tasks` (approval substrate)
· **MJ base** = flag for Matt (components any MJ app would want — surface flagged rows to him).

| Component | Home | Status | Consumers | MJ-base candidate? |
|---|---|---|---|---|
| Status stepper (fixed stages, legal-skip moves, disabled+tooltip) | this app (ruled 2026-07-15) | Approved (mockups 2026-07-16) — build pending | ORD compose form (only real consumer today) | **YES — flag Matt** (generic state-machine stepper) |
| Money/totals strip (TotalGross/AmountPaid/Balance/status chip) | this app (ruled) | Approved (mockups 2026-07-16) — build pending | ORD form tabs + A/R views | maybe later (too small to abstract yet) |

Consumed-not-owned: the accounting-homed domain trio (waterfall viewer, GL-resolution preview,
Customer A/R base view) and the framework-clean set parked in accounting (approval inbox, list
scaffold, role directive, deep-link helper) are inventoried in accounting's
`design-docs/ui-design/README.md`; transfer targets in accounting `plans/TRANSFER-BACKLOG.md`.

## Standing design record

Screen inventory, navigation map, and app-specific chrome decisions get recorded in this file as
the UI wave lands them — present-tense, updated as part of each UI change's Definition of Done.

**Current built surfaces (pre-wave):** OrdersConsole, OrderHistory, OrdersManagement,
ProductCatalog, ProductCategoryTree dashboards (`packages/Angular/src/lib/custom/`) plus generated
MJ entity forms for every entity. These migrate into the approved design below as the wave builds
(UI action plan §13.5 order).

### Navigation map (APPROVED 2026-07-16 — mockup round 2; per-screen specs: UI action plan §13)

Top-nav categories are Explorer app nav items (`DefaultNavItems`); each hosts the shared
collapsible **nav rail** (company scope chip at top) over dedicated single-purpose pages:

- **Orders** — Dashboard · All orders · Order editor · Status board | WORK: Fulfillment queue · Overdue worklist (badge) · Subscriptions & renewals
- **Payments** — Dashboard · All payments · Payment entry | WORK: Refunds & reversals · Payment methods
- **Products** — Catalog · Categories · Pricing · GL mapping
- **Reports** — Customer A/R · Overdue & dunning (crosslink to the worklist)

No FAB; no creation items in the rail (creation = top-right page button / workspace tab). JEs and
GL data are **never duplicated in orders** — order-side surfaces show read-only views with
"Open in Accounting ↗" deep links (the editors live in accounting).

### Element doctrine (ratified 2026-07-16 — shared with accounting; canonical text in accounting's
`design-docs/ui-design/README.md`)

Modal = single-record quick action passing the **encapsulation test**; page/workspace = default
for depth + anything criteria-driven or multi-record (Order editor = session-scoped draft tabs,
NOT DB-persisted in v1); slide-in = quick view of a related record; every modal/slide-in carries a
pop-out (↗) to its full-depth home; never two filter systems on one page; dashboard stats are
cheap counts or precomputed-on-schedule, never on-demand heavy aggregates.
