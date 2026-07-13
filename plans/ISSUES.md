# ISSUES — bizapps-orders (plans-level)

Known problems and open questions about the plan or the built system that must not be lost.
Entry: `### [OPEN|RESOLVED] <title> — <date>` with source + status. Convention:
`~/MJDev/shared-plans/repo-planning-system.md` §5.1. (Suspected mjdev-tool bugs go to
`~/MJDev/MJDEV-ISSUES.md`; MJ-core bugs to `~/MJDev/MJ-UPSTREAM.md`.)

---

### [RESOLVED — for now] Closed-period guard has no substrate — 2026-07-10 → 2026-07-13
- Backdating is allowed and "the only guard is a closed period" (MOD-9), but accounting removed
  `AccountingPeriod` (accounting MOD-1) — nothing exists to guard against. **RESOLVED-for-now
  (Marcelo 2026-07-13, Amith-doc confirmation): follow the removal — backdating ships UNGUARDED;
  batches land in the ERP's active period.** Reopens only if Robert's research overturns the removal
  (his position — batches must not be the lock — is recorded in
  `meetings/2026-07-13-robert-meeting-decisions.md` D2 + postscript). Mirrors orders CA-3.
