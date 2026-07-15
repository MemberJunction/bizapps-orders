# plans/ — planning system

This folder follows the repo planning system (`~/MJDev/shared-plans/repo-planning-system.md`, adopted
2026-07-10). Read that doc before adding or changing anything here. The short version:

| Path | What it is |
|---|---|
| `MASTER-PLAN.md` | **The central source of truth.** Write-forward-only: closed text is never edited/deleted. New scope = appended Extensions (`Status: OPEN` while drafting → `CLOSED` when work begins). Top of file: Contradictions & Ambiguities ledger (CA-*). |
| `MASTER-PLAN-MODIFICATIONS.md` | MOD-* living collection (overlay) of changes that SUPERSEDE closed master-plan text — edited in place as decisions evolve, never self-contradictory (git = history; IDs never reused). Reciprocal ⚠ inline markers. **Precedence: MOD > Update > Extension > original text.** |
| `MASTER-PLAN-UPDATES.md` | UPD-* living collection of SMALL intent-preserving refinements/additions to existing sections — same editing rules. Reciprocal ➕ inline markers. |
| `BACKLOG.md` | Repo-level wanted-but-not-started work + `[decision needed]` items. Holding pen — promote to an action plan when picked up. |
| `ISSUES.md` | Known problems / open questions about the plan or built system, persisted so they aren't lost. |
| `action-plans/` | `ActionPlan - <Summary of Actions>.md` — the ONLY docs work is executed from. Header cites the §/MOD/EXT they implement. Move to `completed/` when done. |
| `completed/` | Finished (or abandoned) action plans. |
| `meetings/` | Transcripts + distilled per-meeting decision notes (incl. the 07-02 engine-meeting amendment). **Meetings are inputs, never authority** — a decision only becomes the plan as a MOD, Update, or Extension. |
| `supporting-documents/` | Reference material that is neither plan nor meeting (ERDs, analyses, external-system exports). |
| `FEATURE-LIST.md` | **Derived feature registry** (adopted 2026-07-15): stable outline IDs + statuses, generated from the plan chain; git-pinned derivation header = the staleness check. Never an authority — the plan chain wins. Convention: `~/MJDev/shared-plans/feature-list-amendment.md`. |
| `../design-docs/ui-design/` | **UI design layer** (standing/present-tense design is documentation, not a plan; `design-docs/` = hand-authored docs home, `docs/` reserved for generated output — ruled 2026-07-15): `README.md` (anchor + standing design record + component inventory), `UI-FEATURE-LIST.md` (coverage index over FEATURE-LIST), `style-kit/` (+ provenance pin), `shell/` (the one standing reference mockup), `mockups/` (ephemeral; **empty between cycles**). UI *plans* stay HERE in `action-plans/` (`ActionPlan - UI …`). Convention: `~/MJDev/shared-plans/ui-design-system.md`. |

**Migration map (2026-07-10)** — old paths → new, for stale references in older docs:
- `plans/bizapps-orders-master.md` → `plans/MASTER-PLAN.md`
- `plans/erd-orders-target.md` → `plans/supporting-documents/erd-orders-target.md`
- The master plan's legacy 🚦 authority banners → formalized as `MASTER-PLAN-MODIFICATIONS.md` MOD-1..9 (banners retained in place as history).
