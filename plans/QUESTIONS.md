# QUESTIONS — bizapps-orders (plans-level question stock)

> Structured per the questions convention (`~/MJDev/shared-plans/questions-convention.md`):
> stable append-only body + two derived indexes; entry template modeled on Q22/Q24. **A question
> lives in exactly ONE file** — this repo's active questions are currently homed in the instance
> stock (`~/MJDev/instances/accounting-engine-dev/QUESTIONS.md`), created there during this
> development wave; the indexes below link across (convention rule 8). NEW repo-scoped questions
> raised outside an instance context get appended HERE as `OQ1`, `OQ2`, … in the template format.

## Index — by priority

| Ask order | Q | Ask | Status |
|---|---|---|---|
| 1 | [Q21](../../../../../../QUESTIONS.md#q21)* | Robert — order tax structure (Option A vs B; LXP ~30-day clock) | OPEN ★HIGH |
| 2 | S7 coupons schema review (action plan) | Robert — bless/amend Coupon + CouponRedemption | OPEN HIGH |
| 3 | [Q2](../../../../../../QUESTIONS.md#q2)* | Robert — order owning-company field + company revenue default | OPEN (narrowed) |
| 4 | C.12 order numbering (BACKLOG roster) | Jeremy — single vs dual sequence + ExternalDocumentNumber semantics | OPEN |
| 5 | F4 renewals + cadence (BACKLOG roster) | Jeremy/Robert — renewals spawn Draft vs auto-Confirm · Amith — rev-rec cadence | OPEN |
| 6 | [Q10](../../../../../../QUESTIONS.md#q10)* | Marcelo — branch strategy + diverged main (internal) | OPEN |

\* homed in the instance stock: `~/MJDev/instances/accounting-engine-dev/QUESTIONS.md`
(relative links resolve from this worktree; distribution copies:
`~/MJDev/reports/team-questions-2026-07-16/`).

## Index — by feature

| Feature | Open questions gating/shaping it |
|---|---|
| B.3 coupons | S7 schema review (Robert) |
| C.1/J.1 order company shape | Q2 |
| C.12 order numbering | Jeremy (roster) |
| G.5/G.6 renewals · G.2–G.4 rev-rec | F4 items (roster) |
| K.1 tax structure | Q21 ★ |
| D.7 invoice delivery · N.2 cutover | park-with-owners items (roster; see distribution doc) |
| (cross-cutting / process) | Q10 |

## Questions (append-only body — repo-scoped entries)

_None yet. Template (Q22/Q24 model):_

```markdown
<a id="oq1"></a>
### OQ1 · <title> — ask <person> — added <date>
- **Status:** OPEN
- **Who to ask:** …
- **Features:** <FEATURE-LIST IDs>
- **Background (self-contained):** …
- **What motivates this now:** _(optional)_
- **Fixed constraints (not up for debate):** _(optional)_
- **The question for <person>:** (1) … (2) …
- **Context to share:** …
- **Additional context (for a verifying agent):** …
- **Answer:** _(pending)_
```
