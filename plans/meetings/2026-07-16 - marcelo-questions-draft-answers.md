# Draft answers to Marcelo's consolidated questions (2026-07-16)

> **Author:** Robert Kihm (drafted with review of local plan docs — edit before sending)
> **Covers:** every question addressed to Robert in `SHARED-QUESTIONS.md`, `ACCOUNTING-QUESTIONS.md`,
> `ORDERS-QUESTIONS.md`. Questions owned by others (Q19 Jeremy, Q9 Amith, OC12 Jeremy, Q25/HS1
> Ian+Matt) are not answered here, with two exceptions noted at the end where I have context that
> helps the owner answer.

## Summary of rulings

| Q | Ruling (short form) |
|---|---|
| Q22 | **Option A upgraded — `UserCompanyRole` grant table** (per-company roles; only Accounting Approver approves), security-grade admin-only entity |
| Q24 | Principle confirmed; audit columns now, approval workflow deferred, HR-sync-into-grants agreed |
| Q6 | **Single-company batches RULED (P2+P3)** → one approval task per batch; **enforce approver identity before non-dev**; manual-JE gate **confirmed yes** |
| Q7 | See = app role + company grant (RLS); Act = approver role + company grant — confirm at A2 co-design |
| Q3 | **Bless the as-built ID contract**; numbers remain the ERP wire format only |
| Q21 | **Option B's durable shape, skip A entirely**; engine = buy not build; launch-tax is an explicit finance call (Jeremy/John) |
| OS7 | Review blocked — need the draft schema file; review criteria + provider-model reconciliation below |
| Q2 | **Yes — add `Order.CompanyID`** (S1 amendment; `Product`/`Subscription.OwningCompanyID` renamed to match); resolution walk gains a company-default rung, tripwire stays |
| OF4 | Renewals spawn **Draft** at launch; `RenewalSpawnStatus` per type/plan (Draft/Quoted/Confirmed); cadence question **superseded by P5** |
| OQD | Email render first; cutover = **open invoices without existing GL JEs** transfer to Orders (Jeremy identifies the set) |

---

## Q22 — Company-visibility mechanism: **Option A, upgraded — a `UserCompanyRole` grant table (per-company roles, not just visibility)**

**Ruling.** Go with (A), with one upgrade beyond what was asked: the link table carries a **role
per (user, company)**, not just a visibility bit — `UserCompanyRole`: UserID, CompanyID, RoleID
(Accounting Admin / Accounting Approver / Accounting User), IsActive, plus the Q24 audit columns;
unique on (UserID, CompanyID, RoleID) so a user may hold multiple roles in one company. This adds
a requirement the original question didn't state: **a user can hold different accounting roles in
different companies** — Accounting User in Company X, Accounting Approver in Company Y. The RLS
filter reads DISTINCT CompanyID from this table (visibility ignores the role); per-company
capability checks (approve this company's batch, admin this company's settings) read the role for
that specific company.

**Role semantics — deliberately NOT a linear ladder.** Accounting User is the base; **Accounting
Approver and Accounting Admin are siblings above it**, not rungs: Approver = User + record
approval decisions; Admin = User + administer that company's setup (mappings, config — **not**
company-access grants, which are Accounting Global Admin-only, see Q24) — **Admin does not
inherit approval authority**. Approval is attestation, a financial control whose
audit value depends on the decider being a designated authority (that's what `ApprovalCFOPersonID`
already encodes); Admin is operational capability, and an Admin can create manual JEs and build
batches, so letting the same role approve them collapses maker-checker. A CFO who also
administers holds both grants for that company — explicit and auditable per Q24. (This is where
we diverge from Izzy/Skip-Brain's `level >= minLevel` checks: fine for collaboration apps, wrong
for a financial control.)

**Precedent — this is how our own products already model it (verified in the local repos
2026-07-16):**
- **Izzy**: `OrganizationPersonRole` (PersonID, OrganizationID, RoleID, Level) with seeded levels
  Owner 100 / Admin 80 / Member 50 / Read Only 20; capability checks are per-org level thresholds
  (`IzzyMetadataEngine.HasMinimumRoleLevel(contactId, organizationId, minLevel)`).
- **Skip-Brain**: `Skip.OrganizationContact` (OrganizationID, ContactID, RoleID) against
  `ContactRole` levels Owner 100 / Admin 50 / User 10 — the same per-org-role junction shape.
- **CDP** (ATS company-scoped login, live since 2026-06-10): runs the role-per-company variant —
  a dedicated `ATSCompanyUser` MJ role + an RLS filter keyed User→Employee→CompanyID. It works for
  its case (external users who each belong to exactly one company), and its ADR documents the
  operational hazards we would inherit at N companies × 3 role levels.

**Why not derive access via User → Employee → Company?** (The obvious alternative — CDP's ATS
filter literally does `CompanyID IN (SELECT e.CompanyID FROM vwEmployees e JOIN vwUsers u ON
e.ID = u.EmployeeID WHERE u.Email = '{{UserEmail}}')`.) Three reasons:
1. **Cardinality.** MJ core `Employee.CompanyID` is single-valued — one Employee row belongs to
   exactly one Company, and `User.EmployeeID` points at one Employee. A shared-services accountant
   employed by BCHQ who works five subsidiaries' books cannot be represented. CDP's case works
   because each scoped user needs exactly one company; our accountants are the opposite case — the
   app-wide company-scope selector exists precisely because they work across companies.
2. **Employment ≠ book access.** "Who employs you" and "whose books you may work" are different
   facts that sometimes coincide. Keying financial visibility off Employee makes an HR data edit a
   security event — the exact failure mode Q24 rules out (Employee/Person rows are editable by
   people who should not be able to change who reads company books).
3. **Per-company roles don't fit the path anyway.** Even a multi-company Employee junction would
   give visibility only; the "User in X, Approver in Y" requirement still needs a role column per
   (user, company) — i.e., the grant table.

**How it composes with MJ's machinery (verified in the MJ repo).** `Role`/`UserRole` carry no
scope columns — an MJ role assignment is global, so "Accounting Admin" as an MJ role cannot mean
"admin of Company X only." Consequence: keep the MJ role layer minimal. One **Accounting** role
carries the entity CRUD permissions with RLS filters attached on all four operations (MJ
`EntityPermission` has separate Read/Create/Update/Delete RLS filter slots, so writes are covered
by the same mechanism), filter text:
`CompanyID IN (SELECT CompanyID FROM UserCompanyRole WHERE UserID = '{{UserID}}' AND IsActive = 1)`
(the `{{UserID}}` token substitution is real — `RowLevelSecurityFilterInfo.MarkupFilterText`
templates any scalar `UserInfo` property). Optionally a second, deliberately unscoped
**Accounting Global Admin** MJ role for cross-company operators — visibility and administration
only; it carries **no approval authority anywhere** (break-glass = grant yourself Accounting
Approver for that company, which leaves a Q24 audit trail). Everything finer-grained —
approve/reject, per-company admin — is an engine/app check against the grant table's role,
because MJ RLS gates *rows*, not per-company *capabilities*.

**One documented footgun to govern (from CDP's ADR):** MJ's RLS exemption rule — a user holding
ANY role that grants a permission with no filter attached is fully exempt from RLS on that entity.
CDP's ATS design forbids co-assigning broad roles (UI/Developer) for exactly this reason. Our
deployment rule: audit that no other role grants unfiltered read/write on company-scoped
accounting entities; Accounting Global Admin is the single deliberate exception.

**On Marcelo's ownership concern** — unchanged, and the research strengthens it: MJ roles + entity
permissions still gate every capability per the D1 decision ("no bespoke permission system"); the
grant table is one securable entity answering one question — "which companies, in what role, may
user U touch" — and it's the *only* place that fact lives. Izzy and Skip-Brain each own exactly
this table without it becoming a system to maintain.

---

## Q24 — Grants + governance (same sitting as Q22)

1. **Principle confirmed.** Company-access grants are explicit, admin-managed security records —
   editable **only by Accounting Global Admin**. Per-company Accounting Admins cannot edit grants,
   not even for their own company: if they could, a company Admin could grant themselves
   Accounting Approver and defeat the Admin-cannot-approve control (Q22). Grants are never derived
   or auto-synced from Person/CRM/HR data — the audit Marcelo's team did (LinkedUserID
   re-pointable, Relationship rows are customer-facing, Employee has no login link) is exactly
   why.
2. **Governance — start with the audit trail, defer the workflow.** Ship now: `GrantedByUserID`,
   `GrantedAt`, `RevokedByUserID`, `RevokedAt`, `IsActive` (revoke = deactivate, never delete — the
   history is the audit). Defer: approval workflow on grants (admin-only edit is sufficient
   control at our scale; if we want it later it's a tasks-substrate approval like everything else)
   and formal expiry/review (an optional `ExpiresAt` column can go in now if it's cheap; a
   periodic "who has access to what" review report is a later add).
3. **HR-driven membership: agreed.** If the org ever wants it, it's a governed sync *into* the
   grant store with the same audit columns stamped by the sync. Access control never reads HR/CRM
   directly.

---

## Q6 — Batch-approval workflow shape

**First, a premise update — RULED (Robert, 2026-07-16): batches are single-company.** P3 of my
2026-07-14 proposal (`plans/2026-07-14-je-single-company-batching-proposal.md`) is adopted, and
with it its prerequisite P2 (single-company JEs — a batch with one header company cannot carry
multi-company JEs). Amith has not responded to the 07-14 sign-off request; the ask to him becomes
"flag any architectural objection now," not an open decision. Jeremy still owes explicit
acceptance of the two P3 trade-offs (approvals multiply per company; intercompany legs can post
on different dates) — bundled into the Q19 sitting (see notes below).

1. **One approval task per batch — which IS one per company.** Under single-company batches the
   "per batch or per company" fork dissolves; the task is assigned to that company's designated
   CFO by default (item 2 governs who may decide). For the record: had batches stayed
   multi-company, the right shape would have been one task per company with all-approved gating —
   the union-of-CFOs single task loses who-approved-what and lets Company A's CFO effectively
   sign for Company B.
2. **Enforce the decider — before anything beyond dev — with ONE enforcement path.**
   `recordDecision` accepts the decision only from a user holding the **Accounting Approver** role
   for that batch's company in the Q22 grant table — that check is the sole source of approval
   authority. `ApprovalCFOPersonID` remains only the **task-assignment default** (who the approval
   task lands on); provisioning ensures every designated CFO holds an Approver grant for their
   company, so the two never disagree. **Accounting Admin and Accounting Global Admin do NOT
   inherit approval** — approval is a designated financial control, and Admins can create manual
   JEs and build batches, so admin-approves would collapse maker-checker (see Q22 role semantics).
   The current any-linked-person behavior is acceptable as dev scaffolding only; this is a
   security control on financial postings, not a UI nicety.
3. **Manual-JE gate: confirmed yes.** CFO approval required before a MANUAL journal entry can
   batch. The lean-yes becomes a ruling; the approval-inbox + review-modal UI in the mockup is the
   right shape.

---

## Q7 — Batches/approvals visibility (carry into the A2 co-design)

Ruling to confirm at the A2 sitting, using the proposed role set:

- **See** the Batches/Approvals surfaces: any user with an accounting role in the Q22 grant table
  (Accounting Admin / Accounting User / Accounting Approver — renaming the mockup's "CFO Approver"
  for consistency), with rows RLS-scoped to their granted companies. Accounting Global Admin is
  unscoped.
- **Act** (Approve/Reject): **only** users holding the Accounting Approver role for *that company*
  (the designated CFO being the assigned default). Accounting Admin and Accounting Global Admin do
  not inherit approval (Q22 role semantics). Accounting Users can build batches within their
  company grants (per Marcelo's fixed rules) but cannot decide approvals — and note the roles are
  **per company** (Q22): the same person can be a User in one company and an Approver in another.
- Nothing is visible to users without an accounting role — the app-level gate comes first.

---

## Q3 — JE-draft account contract: **bless the as-built resolved-ID choice**

**Ruling.** There are two different boundaries here, with different identifiers — and nothing in
this ruling changes what Business Central receives:

- **Internal boundary — Orders → Accounting engine (`JournalEntryDraft`):** resolved **GLAccount
  ID UUIDs**. Both apps share the same database and metadata; Orders resolves the account through
  `GLAccountLink`, which stores the `GLAccountID` FK directly. This contract is the only thing Q3
  blesses.
- **External boundary — batch → Business Central:** **GL Account Numbers, never our record IDs.**
  The external GL knows nothing of the Accounting app's IDs (AM-4); the batch payload is the ERP
  wire format, and P4 of the 2026-07-14 proposal keeps it that way — the same number-keyed payload
  whether finance validates it as CSV or we deliver via the BC API.

**Why the internal contract uses IDs, and what the meeting note actually was.** The "code/number" line traces to Amith's early
engine meeting ("journal entries from orders will always use the account number… orders will
handle getting that right"). That instruction predates `GLAccountLink`, which stores the
`GLAccountID` FK directly — under the as-built resolver, passing a number would mean resolving to
an ID, converting back to a number, and having the engine re-translate to the ID: a lossy
round-trip that re-introduces the ambiguity numbers have (unique only per company chart) for zero
benefit. Amith's underlying intent — the engine independently validates that the account exists,
belongs to the right company, and is active — is preserved and should stay. Record as an amendment
and flag to Amith as an FYI since it formally revises his meeting-note instruction.

---

## Q21 — Order tax structure: **Option B's durable shape; skip A entirely**

This is already position-stated in my 2026-07-14 LXP response (A4) — restating as the ruling
Marcelo asked for:

1. **Structure: Option B, not A, not A→B.** Orders does **not** calculate tax; a third-party
   engine (Stripe Tax / Avalara class) does, behind the already-planned `TaxCalculationProvider`
   seam. Orders sends the inputs (ship-to address, `ProductTaxCategory`, customer tax/exemption
   profile) and records what comes back: `OrderLine.LineTax`/`LineTotalGross` rollups plus
   **`OrderLineTaxLine`** — one row per jurisdiction per line, as a *snapshot of what the engine
   returned*, not a rate authority we maintain. Option A (tax as a `Tax`-type order line) creates a
   fake catalog item, has no per-jurisdiction line breakdown, and unwinding it later is exactly the
   rework S1's `LineTax`/`LineTotalGross` pre-paid to avoid. Since the LXP checkout is
   Stripe-hosted, **Stripe Tax is the natural first provider** if launch needs tax — it attaches to
   the checkout we already use, so pulling it forward is small.
2. **Is tax launch-required for LH4I?** Not mine to decide alone — that's the explicit finance
   call (Jeremy/John) already flagged in the LXP response: launch either pulls Stripe Tax forward
   or ships tax-exempt/manual **as an explicit decision, not a default**. LH4I is 3 fixed digital
   tiers so jurisdiction complexity is low, but digital-goods taxability/nexus is a real question
   for Jeremy.
3. **Rate package: buy, not build.** The engine *is* the rate package; our jurisdiction/rate
   tables are reference/snapshot data. This removes the LXP A4 "build a sales-&-use-tax package"
   burden.

---

## OS7 — Coupons schema review: **blocked on the artifact; criteria stated now**

**I can't bless a schema I haven't seen** — `ActionPlan - Coupons (schema to UI).md` lives in the
accounting-engine-dev instance, not in my repos. Marcelo: please share the file (or drop it into
the orders repo) and I'll turn the review around.

**The design-fork context the review must reconcile.** My 2026-07-14 LXP response (A2) leans
**Option A for launch** — a `CouponProvider` model where Stripe owns configuration/application and
Orders records the outcome — with an Orders-native `Coupon` entity as the fast-follow for
non-provider channels. A drafted `Coupon` + `CouponRedemption` is the Option B shape; that's fine
*if* it also serves as the recording target for provider-applied coupons. So the review checklist:

1. **Provider traceability** — fields for provider, provider coupon ID, promotion-code ID, and the
   code string, so a Stripe-applied discount records into the same entities.
2. **Definition vs code split** — Stripe separates the discount definition (Coupon) from the
   customer-facing code (Promotion Code, with its own restrictions). Does the draft model both, or
   merge them with a recorded justification?
3. **Recording at both levels** — order-level (code, provider refs, total discount) **and**
   line-level `DiscountAmount` (providers prorate order-level coupons across lines; tax and GL
   operate on line amounts). `DiscountPct` alone can't capture fixed-amount or order-level
   discounts.
4. **Redemption constraints** — usage limits, per-customer limits, validity window, minimum
   amount, first-purchase-only; and explicit stacking rules.
5. **Doesn't block the Stripe-only launch path** — the schema freeze still waits on the two A2
   investigations (Stripe model mapping end-to-end; a second provider's differences) and the three
   open Sidecar/Ethan questions (coupon surfaces at launch, coupon shapes in use, LXP display/
   validate needs).

---

## Q2 — Company context on the Order: **yes, add the owning-company field**

1. **Add `Order.CompanyID` (S1 amendment; MOD-3 updated accordingly).** A company owns an
   order — it's the company that owns the customer relationship and the document, defaulted from
   the sales channel. Named plain `CompanyID` per our convention for header-level company columns
   (matches `OrderLine.CompanyID`, accounting's `JournalEntry.CompanyID`, and generic
   company-scoped tooling like the Q22 RLS filter); the extended property carries the semantics:
   *owning company — does NOT override line-level revenue ownership.* Note the master plan was
   never fully company-free: BO-D5 puts `CompanyID` on **OrderLine** (revenue ownership per line)
   and BO-D6 speaks of the order's "primary receiving Company." This header field makes that
   latent concept explicit; line-level revenue ownership for multi-company orders still comes from
   the line's resolved account. **Naming ruled for the whole schema:** `Product.OwningCompanyID`
   and `Subscription.OwningCompanyID` are renamed to plain **`CompanyID`** as well, with the
   owning-company semantics in each field's extended property. Verified no conflict: each table
   has exactly one `__mj.Company` FK, and customer organizations are a different entity with a
   different name (`CustomerOrganizationID` → `BizAppsCommon.Organization`) — so plain `CompanyID`
   always means the internal legal entity. Role-qualified names remain only where the role is the
   point (`Payment.ReceivingCompanyID`, `StoredValueAccount.IssuingCompanyID`,
   `IntercompanyFlow.FromCompanyID`/`ToCompanyID`).

2. **Resolution walk gains a final rung:** product → category tree → **owning-company default**.
   The company-level revenue default resolves against `Order.CompanyID` when no
   product/category link matches (this is exactly Amith's "Izzy" case — a small adopter maps one
   company default and every product books). If even the company-default link is missing, keep the
   current behavior: **fail loudly** — the unresolved-mapping tripwire in the GL-mapping mockup is
   right and stays.

---

## OF4 — Renewal spawn mode + rev-rec cadence

1. **Renewals (my half; Jeremy validates):** spawn as **Draft** at launch, per the plan default —
   Confirm is what books the JE, and a human confirming renewals is the right conservative start.
   The fuller shape behind that default:
   - **Spawn-status options** (from the BO-D8 lifecycle `Draft → Quoted → Confirmed → Posted →
     Fulfilled`/`Voided`): **Draft** = parked and editable, invisible to accounting until a human
     confirms; **Quoted** = "renewal offer issued, awaiting customer acceptance" — the classic
     association renewal-notice flow, where acceptance confirms; **Confirmed** = zero-touch, books
     the JE immediately. Model this as a **`RenewalSpawnStatus` setting** on
     SubscriptionType/SubscriptionPlan (BO-D31/BO-D40 pattern: type drives default behavior).
     High-volume self-serve channels (the LH4I tiers) will want Confirmed once we trust the
     pipeline; low-volume high-value B2B renewals stay Draft or Quoted.
   - **Accounting validation on promotion:** no per-order accounting gate by default — accounting's
     control point is batch approval, where the Accounting Approver reviews every JE before it
     reaches the GL. When a gate IS warranted, the pattern already exists: a tasks-substrate
     approval Task at the Draft→Confirm transition (approve → proceeds, reject → back to Draft),
     the same shape as the sales-rule, manual-JE, and batch approval gates, feeding the shared
     approval inbox.
   - **Per-order rule definition**, three layers, no new machinery: declarative defaults at the
     type/plan level (the spawn-status setting above); rule-triggered exceptions via the existing
     `SalesRule`/`SalesAuthority` engine (e.g., "auto-confirm only if the amount is unchanged from
     the prior cycle, else route to approval"); custom logic via the `ProductBehavior` plugin seam
     (BO-D38) for what the first two can't express.
   - **Terminology drift to reconcile:** master plan BO-D8 puts the pen-commit (and §9 the booking
     JE) at **Posted**, while the build books the JE at **Confirm** — align the vocabulary when
     recording this answer.
2. **Cadence (Amith's half) — the question is superseded.** P5 of my 2026-07-14 proposal
   (**agreed by Jeremy 2026-07-15**) replaces `ScheduledJournalEntry` + materialization with
   **forward-dated real JEs** written at booking and picked up by batch date filters. There is no
   materialization job to schedule, so "nightly vs continuous" has no referent. P2/P3 are now
   RULED (single-company JEs and batches, 2026-07-16 — see Q6); the residual Amith ask is only to
   flag any architectural objection. Marcelo: please sync the instance question stock against
   `plans/2026-07-14-je-single-company-batching-proposal.md`.

---

## OQD — Invoice delivery + open-AR cutover (parked; leans recorded)

1. **Delivery (with Amith):** lean **email render first** — the master plan §15 Q8 lean is a thin
   built-in send-via-email of the rendered posted Order, with an Action-plugin seam for anything
   else; bill.com becomes a delivery adapter when a channel actually needs it. Both, eventually;
   email is the smaller first build.
2. **Cutover (with Jeremy) — ruled:** transfer **open invoices only, and only those whose Journal
   Entries have NOT already been created in the General Ledger.** Those transfer to Orders, which
   generates their JEs through the normal pipeline — eventually batched to the GL like any other
   order. Importing an already-journalized invoice through that path would double-book it.
   **Ask for Jeremy:** identify which invoices in the BC Data Platform lack GL Journal Entries —
   that set defines the transfer scope. Companion question while he's at it: for open invoices
   already journalized in the GL, do they stay in the legacy system for collection, or come over
   via a JE-suppressed import? Timing rides aidp Stage 4.

---

## Notes on questions owned by others

- **Q19 (Jeremy, golden path + exceptions):** the three Robert-attributed stances inside it stand
  as recorded, with one amendment: (a) default batch filters — status **Pending** (+Approved last
  week) per D3, **amended by P5 (Jeremy-agreed 2026-07-15): the default date window cuts off at
  today and never reaches forward**, or batches would sweep forward-dated rev-rec JEs — Jeremy
  picks defaults within that constraint; (b) no hard batch-by-type restriction (D2) — stands,
  group via views/filters; (c) the no-subledger-lock quote (2026-07-13) — attribution confirmed.
  **Bundle the Jeremy sitting:** Q19's sub-questions (3)/(4) are the same GAAP-judgment cluster as
  the 07-14 proposal's **OQ-1** (closed-period rule: hold vs auto-roll), and Jeremy also still
  owes explicit yeses on the **P3 trade-offs** (per-company approvals multiply; intercompany legs
  can post on different dates) and the **P4** BC journal-import-API question — one sitting covers
  all of it. Note for (7): under P3, company drops out of the dimension list — the batch IS the
  company group; Jeremy's dimensions slot into the P1 netting key (GLAccount × dims ×
  `EffectiveDate`). Aptify batching re-read status: _(Robert to fill in before sending)_.
- **Q9 (Amith, GLAccountRoleID):** the engine action plan already records this decision as OQ-G —
  "ADD it — can't distinguish a record's Revenue link from its AR link without it." Amith's confirm
  should be a formality; point him at that OQ-G note alongside the migration.
- **OC12 (Jeremy, order numbering):** context worth attaching when he's asked — the master plan
  lean is a **single global sequence** (`ORD-{seq}`, §15 Q1) and BO-D45 makes `OrderNumber` *the*
  customer-facing document number (no Invoice entity), which argues single-sequence;
  `ExternalDocumentNumber` then stays what it was added for — external/bill.com identity — rather
  than a second internal sequence.

## Process flags for Marcelo

0. **The Q22/Q24 answers amend the A2 action plan.** The schema-alignment plan's first-iteration
   scoping ("Admin/Approver unscoped; User optionally scoped per deployment") is superseded by the
   per-company `UserCompanyRole` grant table and the sibling role semantics above — update the A2
   plan from these answers rather than reconciling two designs.
1. **Question-stock premises to refresh — and a build change:** Q6/Q7 assume multi-company
   batches with union-of-CFO tasks, and OF4 assumes a materialization job — both premises are
   superseded by the 2026-07-14 proposal doc (**P2/P3 ruled 2026-07-16: single-company JEs and
   batches**; P5 **agreed** by Jeremy 2026-07-15). Sync the instance QUESTIONS.md against it, and
   note the as-built batching/approval gate now needs the proposal's implementation delta (batch
   header `CompanyID`, `buildBatch(companyId, dateFilter)`, line-item CompanyID dropped, one
   approval task per company-batch).
2. **Artifacts I can't see:** the coupons action plan, `plans/research/A2-R1-R3-rls-and-person-linkage.md`,
   and `plans/TRANSFER-BACKLOG.md` are referenced in the question sheets but exist only in the
   accounting-engine-dev instance — none are in the repos I have. OS7 is blocked on the first;
   sharing all three would let the Q22/Q24 answers be verified against the actual research doc.
