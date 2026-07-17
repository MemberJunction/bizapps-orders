# Proposal: Single-Company JEs, Single-Company Batches, No Accounting Periods

> **Date:** 2026-07-14
> **Author:** Robert Kihm (BizApps Orders / Accounting)
> **Audience:** Amith (architecture sign-off), Jeremy Hunnewell (finance sign-off)
> **Purpose:** Record five structural changes to the JE → batch → ERP pipeline, with the reasoning, so each of you can agree or push back on specific items. Each proposal states what changes, why, what it replaces, and the trade-offs.

## Sign-off summary

| # | Proposal | Needs sign-off | Status |
|---|---|---|---|
| P1 | No accounting periods in the Accounting app; **Posting Date travels per JE** (= its `EffectiveDate`), never per batch | Jeremy | ✅ **Agreed as amended** (Jeremy, 2026-07-15) |
| P2 | Single-company Journal Entries; multi-company orders emit multiple JEs | Amith | 🟡 Open |
| P3 | Single-company Batches; each company batches on its own schedule | Amith + Jeremy | 🟡 Open (new — follows from P2's reasoning) |
| P4 | Deliver batches to Business Central via API; CSV export first for validation | Jeremy (BC feasibility) | 🟡 Open |
| P5 | Deferred revenue as forward-dated JEs; changes/cancellations via correcting Orders that net against staged entries | Jeremy | ✅ **Agreed** (Jeremy, 2026-07-15) |
| OQ-1 | Closed-period rule: JE posting date falls in a closed BC period — hold for review vs. auto-roll to first open date | Jeremy (finance rule) + Amith | 🔴 Open — business decision, must be explicit in the design |

---

## P1 — No accounting periods in the Accounting app; Posting Date travels per JE *(agreed as amended)*

**What changes.** The Accounting app will not maintain its own period calendar. Business Central remains the sole authority on open/closed periods.

**How the posting date works (amended per Jeremy, 2026-07-15).** The original proposal had the batch builder select a document date for the consolidated entries. Jeremy's correction, adopted here: **no Posting Date on the batch.** A batch spanning a week (or any window) of `EffectiveDate`s will cross period boundaries often enough — month-end, certainly — that forcing one date across the whole batch would misstate which period each transaction belongs to. Instead:

- **Posting Date is set per Journal Entry, equal to that JE's `EffectiveDate`**, and carried straight through to BC's Posting Date field on each line. BC natively supports a single journal/batch whose lines have different posting dates, so there is no technical reason to collapse them to one date.
- `BatchedAt` / `SentAt` / `AcknowledgedAt` are **process timestamps** — they track where a batch is in the pipeline, not what period it hits.

**Design consequence for netting.** Summary lines must not net across posting dates, or the per-JE date is lost. The netting key becomes **GLAccount × dimension-combo × `EffectiveDate`**. Slightly less consolidation around month boundaries — correct periods in exchange.

**Why.** Maintaining a period calendar in the subledger duplicates BC's, and the two will drift. The accounting period is driven by the date on the individual transaction, not by when it happened to get grouped/sent. Period control is a GL concern.

**What it replaces.** The `AccountingPeriod` entity as a validation gate ("verify the timestamp is not inside a locked period"), the "materialize at period close" trigger for scheduled entries (see P5), and the earlier "document date chosen at batch time" idea.

### OQ-1 — Closed-period rule *(open — needs an explicit decision)*

Raised by Jeremy: what happens when a batch includes an `EffectiveDate` that falls in a BC period we've already closed? **BC will reject a posting date in a closed period.** We need a rule:

- **Hold** — pull that JE out of the batch for human review; the rest of the batch proceeds.
- **Auto-roll** — move the posting date forward to the first open date, keeping the original `EffectiveDate` on record.

This is a business decision, not just a technical one — it must be explicit in the design rather than assumed. **Needs: Jeremy (which rule finance wants) + Amith (default engine behavior).**

---

## P2 — Single-company Journal Entries *(Amith)*

**What changes.** Revert `JournalEntry` from multi-company (company per line, no header company) back to **one company per JE**, with `CompanyID` on the JE header. A multi-company order emits **multiple JEs — one per company involved** — all referencing the same order via `OriginOrderID`.

**Why — two independent reasons:**

1. **Status/locking granularity.** The JE is the lowest-level entity with a `Status` field. With multi-company JEs, locking one JE locks entries in multiple companies simultaneously. Mitigating that with line-level locking would make batch-eligibility searches more complex and less efficient.
2. **Companies batch on different cadences.** Different companies can have different open periods in the GL and different batching schedules. A JE spanning companies cannot be batched for one company without dragging the other along — Company A's postable entries get trapped behind Company B's closed period or slower schedule.

**What it replaces.** The CH-2/CH-3 multi-company JE rework from the 2026-07-06 engine meeting (company derived per line via `GLAccount.CompanyID`, per-company balance-on-lock trigger 50019).

**Cost.** More JE rows per multi-company order (one per company). Auditability is preserved: all of an order's JEs share `OriginOrderID`, so drill-through from the order still reaches every leg. Notably, **the Orders master plan already assumes this model** — "for multi-company orders, the generator emits multiple JEs (one per Company involved)" (bizapps-orders-master.md §9) — so this re-aligns Accounting with Orders rather than introducing a new pattern.

**Question for Amith:** agree to revert to single-company JEs with `OriginOrderID` as the cross-company tie?

---

## P3 — Single-company Batches *(Amith + Jeremy — new)*

**What changes.** Batches become single-company too:

- `JournalEntryBatch` gains a header `CompanyID`. `buildBatch(companyId, ...)` gathers that company's Pending JEs only, on that company's own schedule (posting dates travel per JE, per P1).
- `JournalEntryBatchLineItem.CompanyID` is **dropped** — every line shares the header's company, so the column becomes genuinely redundant. The netting key collapses to GLAccount × dimension-combo × `EffectiveDate` (per P1).
- The per-company footing trigger (error 50023) collapses into the overall footing check (50014) — they become the same assertion.
- The send-time per-company split disappears: one batch = one consolidated JE (per document date) into BC.
- The "¶44" rule ("an order's JEs land in exactly one batch") is rewritten: a multi-company order's JEs land in **one batch per company**, tied together through the JEs' `OriginOrderID`.
- Open question OQ-F in `BatchingEngine.ts` resolves: no flat per-line company grouping and no batch-group element — **the batch itself is the company group**.

**Why.** This is the batching-side consequence of P2's reason #2. Under the current design, `buildBatch()` gathers *all* Pending JEs across companies into one batch and `sendBatch()` posts per-company summary JEs **all-or-nothing**. If one company's BC period is closed — or it simply batches monthly while another batches weekly — every company's entries stall inside the shared batch. And with P1, the subledger has no period calendar to pre-screen with; BC is the only authority, *per company*. (P1's per-JE posting dates move the *period* question down to individual entries — see OQ-1 — but the cadence and all-or-nothing arguments stand on their own.)

**Side benefit.** `TargetSystem` currently sits on the global batch, but nothing stops two companies from targeting different ERPs. Per-company batches make target-system-per-company work for free.

**Trade-offs (the honest part):**

1. **Approvals multiply.** The combined batch bought "one sign-off covers the whole batch run." Per-company batches mean one approval per company per run. This may be *desired* (different companies can have different approvers), but it is a workflow change finance should explicitly accept. — *Jeremy*
2. **Intercompany legs post at different times.** Company A's Due-From leg can reach BC before Company B's Due-To leg if their schedules differ. Each JE is self-balanced, so nothing is ever unbalanced — but consolidated intercompany eliminations will show timing mismatches between batch runs. This is a property of the design, not a bug; flagging it so it's accepted knowingly. — *Jeremy*

**Questions:** Amith — agree that batches follow JEs to single-company (this partially reverses the CH-3/CH-4 combined-batch ruling)? Jeremy — acceptable that approvals are per company-batch and that intercompany legs may post on different dates? *(Jeremy has noted alignment on standardizing company config; the two trade-offs above still need his explicit yes.)*

---

## P4 — Deliver batches to Business Central via API; CSV first *(Jeremy)*

**What changes.** Consolidated batch JEs are sent to BC through its API. For initial validation we may start with a CSV (or similar) export that finance can import manually, then switch the same batch payload to the API path.

**Why.** The batch boundary is already designed as the ERP wire format — account **numbers**, not internal IDs ("BC knows nothing of our IDs", AM-4) — so the payload is the same either way; only the transport changes. CSV-first lets finance validate the consolidation and account mapping before we automate the write.

**Question for Jeremy:** do you know whether our BC environment exposes the journal-import API (and who holds credentials/permissions for it)? If you're unsure who owns this, a pointer to the right person is enough.

---

## P5 — Deferred revenue as forward-dated JEs *(agreed — Jeremy, 2026-07-15)*

**What changes.** Deferred-revenue recognition is written into the subledger as **forward-dated JEs** at the time the schedule is known (e.g., at subscription booking: twelve future-dated Dr Deferred Revenue / Cr Revenue entries). Batches pick up forward-dated entries only if the batch's date filter reaches that far forward. Batch creation gets flexible date filters with **sensible defaults** (e.g., default cutoff = today) so future entries are not swept up accidentally.

**Contract changes & cancellations — the correcting-order model.** Staged forward-dated entries are **never edited or deleted**. A contract change or cancellation produces a **correcting Order**, which emits new rev-rec entries that **net against** what is already staged. This resolves the orphaned-forward-dated-entries concern: the staged schedule is immutable history, and every correction is itself an auditable entry. (Consistent with the Orders master plan's reversal model, where cancellations are reverting orders — partial or full.)

**Why.** With P1 (no periods), the previous mechanism — schedule records "materialized" into Pending JEs at period close — has no period-close trigger to hang on. Forward-dated real JEs are simpler: the recognition waterfall exists as first-class entries from day one, visible and auditable, and batching becomes a pure date-filter question.

**What it replaces.** The `ScheduledJournalEntry` materialize-at-period-close design (BA-D25 / Orders BO-D11). If accepted, BO-D11 in the Orders master plan needs a corresponding rewrite (Orders still computes the waterfall; it just writes future-dated JEs instead of schedule records).

**Risk & mitigation.** The failure mode is a batch built with too-wide a forward filter recognizing revenue early. Mitigations: the default filter never reaches forward; building a batch with a future-reaching filter requires explicitly setting it; and the batch approval step shows the date range being swept.

**Status.** Jeremy has signed off (2026-07-15): the correcting-order approach fully addresses the concern he raised about orphaned forward-dated entries on contract changes or cancellations.

---

## If all five are accepted — implementation delta (for reference)

- Migration: `JournalEntry.CompanyID` header restored (P2); `JournalEntryBatch.CompanyID` added, `JournalEntryBatchLineItem.CompanyID` dropped, batch lines gain the per-JE `EffectiveDate`/Posting Date (P1/P3); `AccountingPeriod` gate removed (P1); trigger 50023 folded into 50014, per-company balance-on-lock 50019 becomes whole-JE balance (P2/P3).
- `BatchingEngine`: `buildBatch(companyId, dateFilter)` — no batch-level document date; netting key GLAccount × dims × `EffectiveDate`; BC payload carries Posting Date per line (= JE `EffectiveDate`); no send-split; OQ-F comment resolved (P3); date-filter defaults (P5); closed-period handling per OQ-1 once decided.
- Orders plan: BO-D11 rewritten to emit forward-dated JEs instead of `ScheduledJournalEntry` records, with correcting Orders netting against staged entries on change/cancel (P5); §9 JE-emission section confirmed against single-company JEs (P2 — already consistent).
