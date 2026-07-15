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
| `mockups/` | Ephemeral working area for mockup cycles. **Empty (or absent) between cycles** — that is the health check. A selected mockup is superseded by its action plan and deleted; frame improvements fold into `shell/` first. |

## Component inventory (sharing / MJ-base tracking)

Every deliberate UI component this app adds (beyond generated forms) gets a row, so sharing and
MJ-base candidacy are decided on record, not memory — updated at each ui-dev-loop close.
Homes: this app · `bizapps-common` (genuinely cross-app UI) · `bizapps-tasks` (approval substrate)
· **MJ base** = flag for Matt (components any MJ app would want — surface flagged rows to him).

| Component | Home | Status | Consumers | MJ-base candidate? |
|---|---|---|---|---|
| Status stepper (fixed stages, legal-skip moves, disabled+tooltip) | this app (ruled 2026-07-15) | Planned | ORD compose form (only real consumer today) | **YES — flag Matt** (generic state-machine stepper) |
| Money/totals strip (TotalGross/AmountPaid/Balance/status chip) | this app (ruled) | Planned | ORD form tabs + A/R views | maybe later (too small to abstract yet) |

Consumed-not-owned: the accounting-homed domain trio (waterfall viewer, GL-resolution preview,
Customer A/R base view) and the framework-clean set parked in accounting (approval inbox, list
scaffold, role directive, deep-link helper) are inventoried in accounting's
`design-docs/ui-design/README.md`; transfer targets in accounting `plans/TRANSFER-BACKLOG.md`.

## Standing design record

Screen inventory, navigation map, and app-specific chrome decisions get recorded in this file as
the UI wave lands them — present-tense, updated as part of each UI change's Definition of Done.
Until the first ui-dev-loop cycle closes, the current custom surfaces are: OrdersConsole,
OrderHistory, OrdersManagement, ProductCatalog, ProductCategoryTree dashboards
(`packages/Angular/src/lib/custom/`) plus generated MJ entity forms for every entity.
