# Meetings — processed index (orders)

Tracks which meeting recordings in this folder have been read + distilled into decision docs. When you process a
new meeting, add a row (newest first) and prepend a `> ✅ PROCESSED` banner to the recording file itself.

| Meeting recording | Date | Status | Distilled into |
| --- | --- | --- | --- |
| `07102026 - Marcelo Ian & Robert Accounting Check-in 2.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | `2026-07-10-decisions.md` (this folder) §A–I. Orders=invoices=AR primitive; payments/Stripe/PaymentLine; subscriptions+deferred-rev; taxes; contracts/LXP/intercompany/multi-currency; SCHEMA-GAP directive (re-pass orders master, compare built vs plan). |
| `07102026 - Marcelo & Jeremy H Accounting Feature Collection.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | `2026-07-10-decisions.md` §C–H. Customer/contact schema (multiple emails, address, contacts, sales rep), external doc number (bill.com), posting/due dates, AR customer subledger + payment application, invoice numbering, deferred-rev cadence. |
| `07102026 - Matt & Marcelo GUI Review.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | UI direction (full write-up in the accounting companion `bizapps-accounting/plans/meetings/2026-07-10-decisions.md` §1). |

> Note: the 2026-07-10 domain decisions are ORDERS-heavy (orders=invoices, payments, subscriptions, taxes, customer schema),
> so the fuller domain write-up lives here; the accounting companion owns the UI/UX direction. The 2026-07-08/09 Robert
> meetings were distilled into `2026-07-08-robert-meeting-decisions.md` / `2026-07-09-robert-meeting-decisions.md` (this folder).

### 2026-07-11--Amith's Demo Feedback.md — ✅ PROCESSED 2026-07-11
Triaged per the planning system (Amith = master-plan-level authority, non-extension → MOD/UPD):
- Remotable-ops-for-big-work principle + singular transactional `CreateJournalEntry` + JE-logic-in-OrdersEngine
  → **MOD-5 enriched in place** (confirmations of as-built + the general principle).
- OrdersEngineBase/OrdersEngine split (AIEngineBase/AIEngine pattern) → **UPD-5** (+ ➕ marker at §3
  BO-D30) → feature action plan **F0**.
- UX (full-window tabbed order form; Accounting tab w/ JE; payments list + total/balance) → UI action plan
  §1/§8 updated; old UI Q2 resolved.
- His "please confirm" → answered in feature plan F0 (relay: yes as-built except the packaging split = F0).

### 2026-07-13 - Marcelo & Robert accounting meeting.md — ✅ PROCESSED 2026-07-13
Distilled → `2026-07-13-robert-meeting-decisions.md` (identical in accounting). Orders-side landings:
UPD-2 enriched (dated recognition entries, anniversary dates, created at booking-lock); feature plan F4.2
reworked to dated rows + CA-2 ungated; schema plan S3 ungated; Q2 ESCALATED (Robert's company-owns-order
model vs as-built CH-2 multi-company JE — research pending, no change). Accounting-side: MOD-11 (CA-2
resolved), Q18 progressed, change ledger imported for Robert.
