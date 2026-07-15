# docs/ui-design/ — standing UI design (bizapps-orders)

The STANDING (present-tense) UI design layer for this app: what the UI is, plus the assets used to
design what it becomes. Convention: `~/MJDev/shared-plans/ui-design-system.md`. Split rule (ruled
2026-07-15): standing design artifacts live here in `docs/`; UI **work** is planned and executed
from `plans/action-plans/` (`ActionPlan - UI …`), keyed to `plans/FEATURE-LIST.md` IDs.

| Path | What it is |
|---|---|
| `UI-FEATURE-LIST.md` | UI coverage index over `plans/FEATURE-LIST.md` (same IDs, never its own numbering): which features have a surface, which need one, loop status per row. |
| `style-kit/` | `mj-mock.css` — snapshot of MJ's design tokens + chrome classes — and `PROVENANCE.md`, the git pin to the MJ commit it was synced against (one-command freshness check at each mockup session). |
| `shell/` | The ONE standing reference mockup: the app frame every new mockup clones (into `mockups/`). Kit-derived; to be grounded against live Explorer screenshots at the first mockup session (banner in the file). |
| `mockups/` | Ephemeral working area for mockup cycles. **Empty (or absent) between cycles** — that is the health check. A selected mockup is superseded by its action plan and deleted; frame improvements fold into `shell/` first. |

## Standing design record

Screen inventory, navigation map, and app-specific chrome decisions get recorded in this file as
the UI wave lands them — present-tense, updated as part of each UI change's Definition of Done.
Until the first ui-dev-loop cycle closes, the current custom surfaces are: OrdersConsole,
OrderHistory, OrdersManagement, ProductCatalog, ProductCategoryTree dashboards
(`packages/Angular/src/lib/custom/`) plus generated MJ entity forms for every entity.
