# plans/ — planning system

This folder follows the repo planning system (`~/MJDev/shared-plans/repo-planning-system.md`, adopted
2026-07-10). Read that doc before adding or changing anything here. The short version:

| Path | What it is |
|---|---|
| `MASTER-PLAN.md` | **The central source of truth.** Write-forward-only: closed text is never edited/deleted. New scope = appended Extensions (`Status: OPEN` while drafting → `CLOSED` when work begins). Top of file: Contradictions & Ambiguities ledger (CA-*). |
| `MASTER-PLAN-MODIFICATIONS.md` | Append-only MOD-* ledger of changes to closed master-plan text. Each MOD has a reciprocal ⚠ inline marker at the superseded section. **Precedence: MOD > Extension > original text.** |
| `action-plans/` | `ActionPlan - <Summary of Actions>.md` — the ONLY docs work is executed from. Header cites the §/MOD/EXT they implement. Move to `completed/` when done. |
| `completed/` | Finished (or abandoned) action plans. |
| `meetings/` | Transcripts + distilled per-meeting decision notes (incl. the 07-02 engine-meeting amendment). **Meetings are inputs, never authority** — a decision only becomes the plan as a MOD or Extension. |
| `supporting-documents/` | Reference material that is neither plan nor meeting (ERDs, analyses, external-system exports). |

**Migration map (2026-07-10)** — old paths → new, for stale references in older docs:
- `plans/bizapps-orders-master.md` → `plans/MASTER-PLAN.md`
- `plans/erd-orders-target.md` → `plans/supporting-documents/erd-orders-target.md`
- The master plan's legacy 🚦 authority banners → formalized as `MASTER-PLAN-MODIFICATIONS.md` MOD-1..9 (banners retained in place as history).
