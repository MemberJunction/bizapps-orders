
## POSTSCRIPT 2 (same day) — D3 RESOLVED: per-company JE split ADOPTED (orders MOD-11 / accounting MOD-12)

Marcelo reviewed the orders master plan and ruled: **split JEs by company at booking** — the master plans
already specified it (orders §5 JE A/B/C example + §7 "multiple JEs, one per Company"; accounting master
`JournalEntry.CompanyID NOT NULL`), Robert's model matches, and the decisive argument is **lock
fidelity**: locks are JE-grained, so one company closing/locking before another REQUIRES per-company JEs
(a multi-company JE cannot be half-locked). Amith's CH-2 (single multi-company JE) is REVERSED —
⚠ residual Amith sanity-check noted. NOT restored: booking-time intercompany legs (stay Payments-side,
MOD-5) and company columns on Order/OrderLine (MOD-3 stands; Q2's remaining half = order-ownership field
+ company-level revenue default, still with Robert).

> **UPDATE (later 2026-07-13):** Marcelo **LOCKED** the per-company-JE decision — a logical requirement
> (per-company close independence), no Amith gate; build proceeds now. Only a later Amith-ordered broad
> restructure would revisit it (considered unlikely).
