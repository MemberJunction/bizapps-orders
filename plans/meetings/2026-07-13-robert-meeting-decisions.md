# 2026-07-13 — Robert meeting: decisions & flags (periods + scheduled JEs)

Distilled from `2026-07-13 - Marcelo & Robert accounting meeting.md` (22m transcript, this folder).
Working decisions doc, NOT authority — items land as MOD/UPD/question updates per the planning system.

## D1 — Scheduled journal entries are DATE-driven, created up-front at booking (→ accounting MOD-11)

Robert (matching Amith's later direction per Marcelo: "create a journal entry at a specific time"):

- When the order's JEs are booked **and can no longer change**, create **ALL** the scheduled journal
  entries immediately, **each bearing its own recognition date**. Example: $1,200 annual subscription
  sold 2026-07-13 → $1,200 books to Deferred Revenue + **12 scheduled entries of $100 dated 7/13, 8/13,
  … 6/13/2027** (each a Dr Deferred Revenue / Cr Revenue transfer).
- **Event-shape deferral:** one scheduled entry, 100% on the event date (e.g. Aug 1). "It's the
  subscriptions longer than a month that end up with multiple fractional transfers."
- **Batching picks scheduled entries up by DATE WINDOW** ("batch the July transactions, including the
  deferred-revenue transfers… only pick up the ones that are in July") — recognition is **not** a
  period-close materialization event.
- Historical model note: a **"scheduled transaction group"** held a subscription's scheduled entries
  (≈ our orders-side `RevenueRecognitionSchedule` envelope).
- Marcelo: confirmed + adopted ("so much simpler… a much better approach").
- **Resolves accounting CA-2** (the materialization-trigger gap left by MOD-1). Formalized as **MOD-11**;
  orders **UPD-2** enriched with the dated-entry semantics. Robert's caveat: "my understanding based on
  history, not necessarily the most up-to-date" — flag anything contradicting Amith's rulings back to him.

## D2 — Periods (Q18/CA-1): still OPEN; Robert researching Amith's rationale; batch-as-lock rejected

- Robert wants to **read Amith's reasoning himself** before ruling: "point me to where those changes
  happened… I need to research why he made those calls." → Deliverable: the surviving record is the
  **change ledger CH-1** (`~/MJDev/reports/accounting-engine-meeting-changes/CHANGES.md`, copied into
  this folder as `2026-07-02 - engine meeting change ledger (recreated) [CH+AM].md`) + the baseline
  revision header (`migrations/B202605281200`, "REVISION 2026-07-06"). ⚠ The raw 07-02 transcript
  (`meeting-with-marcelo-t-amith-n-and-ian-z.md`) was **lost** with the deleted `accounting-engine-work`
  instance and has not been re-supplied — Marcelo could not locate the recording during this meeting.
- Robert's substantive position (input, not a ruling yet): **batches must NOT be the period lock** —
  batching locks the batched JEs, but nothing stops NEW entries landing in a "closed" span; the real
  close is the accounting-team event ("we published June's reports — June never changes again;
  corrections post to July"). He wants the accounting team able to lock a period explicitly, separate
  from batching. Marcelo agrees batches "just aren't meant for that."
- Marcelo's interim observation: with periods removed we're effectively relying on batches as the
  open/closed indicator; a batch time-span could be built and treated as the close — **parked** until
  Robert's research lands. **No period-guard code** meanwhile (unchanged).

## D3 — ⚠ TENSION FLAGGED (no decision): company-owns-order + per-company JEs vs the as-built multi-company JE

Robert's mental model: **a company owns each order** (CompanyID on Order), the order's JEs live in that
company, and other companies' products ride in via **intercompany due-to/due-froms** — i.e. **separate
JEs per company**. The as-built design (Amith 07-02, CH-2 / orders MOD-3) is the opposite: **one
multi-company JE**, NO CompanyID on Order/OrderLine, company per line via `GLAccount.CompanyID`. Marcelo
noted the as-built is Amith's deliberate design (and himself leaned "it probably should" split per
company). **Robert is researching Amith's 07-02 rulings before any ruling** — this is the same research
thread as D2 (periods removal is DOWNSTREAM of multi-company JEs: CH-1's rationale rests on CH-2).
→ Orders QUESTIONS **Q2 updated**; NO plan/schema change until ruled. If CH-2 were ever reversed, it
would cascade widely (booking draft, balance checks, MOD-3, batch splitting) — surface loudly.

## D4 — Process rulings

- **Transcripts in the public repo: OK** (Robert: not too concerned; content stays high-level; no
  encryption; keep committing — "appreciate you bringing it up").
- Marcelo → Robert cadence: send the **questions list** (done — the reordered QUESTIONS.md);
  send **"next-24-hours intent" notes** for sanity-check ("I don't want to block you — work ahead");
  surface **plan risks + dates**; next **demo ~end of Tuesday** targeting master-plan alignment.
- Standing directive: **reconcile this transcript with the plans and surface contradictions** → this
  doc (D3 is the headline contradiction; D1 the headline confirmation).
