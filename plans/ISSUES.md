# ISSUES — bizapps-orders (plans-level)

Known problems and open questions about the plan or the built system that must not be lost.
Entry: `### [OPEN|RESOLVED] <title> — <date>` with source + status. Convention:
`~/MJDev/shared-plans/repo-planning-system.md` §5.1. (Suspected mjdev-tool bugs go to
`~/MJDev/MJDEV-ISSUES.md`; MJ-core bugs to `~/MJDev/MJ-UPSTREAM.md`.)

---

### [OPEN] Closed-period guard has no substrate — 2026-07-10
- Backdating is allowed and "the only guard is a closed period" (MOD-9), but accounting removed
  `AccountingPeriod` (accounting MOD-1) — nothing exists to guard against. Gated on the accounting
  repo's CA-1 reconciliation (QUESTIONS Q18 / D-Q2). Mirrors orders CA-3.
