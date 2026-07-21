# GOLDEN-PATH VALIDATION — everyday-use readiness (cross-app campaign)

> Created 2026-07-20 (Marcelo directive). **Cross-app** (accounting + orders); lives beside
> `ROADMAP-lxp-launch.md`. Derived tracker — the plan chain + the code are the authorities; edit freely.
> Sources: two read-only code+ledger sweeps 2026-07-20 (accounting steps 1/2/3-acctg; orders steps 3/4).

## Why this exists
The order-entry **golden path** must work for **everyday use**, not just backend-green. Backend tiers
(1–3) prove the transaction paths persist; they do **not** prove each page only accepts valid input and
blocks bad input at both layers. Marcelo already hit a **breaking bug in the order-creation form** —
proof that backend-green ≠ usable.

## Acceptance bar (every page, every rule)
**The frontend allows ONLY valid input (blocks/disables invalid entry) AND the engine enforces the
same rule on the backend (engine fn or DB trigger).** A backend-green test that never drove the UI form
does NOT pass. Every rule needs BOTH columns green.

## Sequence (bottom-up — we work our way up to Orders)
1. **Journal Entries** (accounting) ← START HERE
2. **Batching** (accounting) — side quest
3. **Products · Categories · Company accounts** (orders + accounting)
4. **Orders** (orders) — the anchor
5. → then new features

## Legend
`FE` = frontend blocks/disables invalid input · `BE` = engine fn / DB trigger enforces it ·
`✅` both green · `🚨` FE gap (user can submit invalid → server rejects post-round-trip, or silent) ·
`⚠BE` backend gap (rule the UI assumes, nothing enforces) · `⏸` deferred (honest, not a bug) ·
`[ ]` = a validation/fix action still to do · `[x]` = done.

---

## STEP 1 — JOURNAL ENTRIES (accounting) — **START HERE**
Pages: `je-workspace.page` (manual create) · `journal-entry-detail-panel` + JE `*Extended` form (detail/reverse) · `je-console`.

**Work done:** manual-JE create workspace, pure rule seam (`je-draft`/`je-rules`), detail slide-in + reversal, ledger console. Backend `pipeline.ts` (5 pure stages) + `AccountingEngine.CreateJournalEntry` (atomic TG) + entity-server hooks. Validated: T1 EngineBase 39/39 · CoreEntitiesServer 87/87 · je-draft 31/31 · T2 balance/immutability/reversal bypass-proven · T3 engine-op-client 8/8 · T4 je-workspace render 1/1 · T5 je-console 3/3.

**je-workspace is the STRONGEST form in the app** — every invariant is blocked FE + engine + trigger:
| Rule | FE | BE | State |
|---|---|---|---|
| ≥2 lines, one-side-only, amounts>0 | blocks (`draftIssues`/`lineIssue`) | pipeline + `CK_JEL_OneSide` | ✅ |
| Balanced Σdr=Σcr | blocks + live strip | `checkDraftBalance` + `trg 50001` | ✅ |
| Single-company (MOD-12) | blocks *by construction* (picker only offers picked company's active accounts) | pipeline `MULTI_COMPANY_DRAFT` + `trg 50025` | ✅ |
| Account exists+active / dimension valid | blocks (picker lists only valid) | `validateAccounts`/`validateDimensions` | ✅ |
| EffectiveDate present | blocks | pipeline + NOT NULL | ✅ |
| Manual JE → CFO approval before batch (C.8) | no gate (honest footnote) | none | ⏸ deferred (DEFERRALS) |

**Gaps / to-do:**
- [x] **Drive the create form with invalid input** — DONE 2026-07-21. New tier-4 `je-workspace-validation.dom.test` drives the REAL form component through every invalid-input class and asserts the Create button is truly `disabled` in the DOM (empty · no-company · unbalanced · <2 lines · no-date · no-account) AND that valid input ENABLES it, AND that the account picker structurally offers only the company's ACTIVE accounts (cross-company/inactive/unknown unbuildable) + clears on company change. **Both layers green:** FE gate = tier-4 (component) + tier-1 `je-draft` 31/31; BE enforcement = tier-1 EngineBase pipeline 39/39 (UNBALANCED/MULTI_COMPANY/ACCOUNT_UNKNOWN/INACTIVE/MALFORMED) + DB triggers 50001/50019/50025 (documented tier-2) + engine-op-client 8/8 (documented tier-3; live re-run blocked by pre-existing stray test JEs — see finding below). **JE create path = everyday-use validated.**
- [ ] **Reverse-eligibility inconsistency** — `journal-entry-detail-panel` allows Reverse on ANY status; the `*Extended` form only shows it for `GLPosted`. Confirm intended; align the two surfaces. (Separate JE item — not the create path.)
- [ ] **`je-console` `EffectiveDate` renders in browser zone** (default `| date`) → off-by-one in negative-offset zones. FE display bug (ISSUES.md, still open). Fix to UTC.
- ✅ **BE re-run now LIVE-green (2026-07-21):** engine-op-client **8/8** on the real client (unbalanced→UNBALANCED, unknown-key refused, duplicate-debit merge) after clearing the stray JEs (entity-layer delete, sanctioned path — 0 Pending remain). So the JE create path is both-layer LIVE-validated, not just documented.
- ⚠ **OPEN FINDING — order-to-je teardown gap (harness, not a product bug).** The 2 cleared JEs (`JE-O2JA*` Pending PaymentReceipt) were un-torn-down because the order-to-je teardown deletes JEs by `OrderID`, but a **payment-capture JE has no OrderID** (PaymentID-linked) → missed. Fix: order-to-je-fixture teardown should also clean payment JEs by runTag, so this residual can't recur. (Small orders-harness fix; not done yet.)

---

## STEP 2 — BATCHING (accounting)
Pages: `batch-workspace.page` (build) · `batch-dispatch-dashboard` (approve/reject/dispatch) · `batch-status`.

**Work done:** batch builder (server Preview/Build), CFO approve/reject/dispatch/regenerate inbox, all-batches list. Backend `BatchingEngine` + `TasksAppApprovalGate` (real CFO gate). Validated: T2 block2 28/28 · T3 batch-dispatch-client 20/20 + batching-scenarios-client 15/15 · T4 render · T5 batch-approvals + batching-reject.

**Solid (dual-layer):** balance-before-build, ≥1 included, stale-selection guard, decide-only-Pending, dispatch-only-Approved+gate, immutability after lock (`trg 50008/9/13/15`), reject preliminary-unlock.

**Gaps / to-do:**
- [ ] 🚨 **Criteria panel may not constrain the server build** — `batch-workspace` sends `Criteria.CompanyIDs`/entry-type/include-exclude, but ISSUES.md (2026-07-16) warns these were NOT in `BuildBatchOptions` (server sweeps the whole Pending pool). **Verify preview == build**; if the panel doesn't actually filter the build, it silently lies. (Top batching risk.)
- [ ] ⚠BE **Approver separation-of-duties** — `hasApprovedDecision` (TasksAppApprovalGate.ts:218) checks *a* terminal Approved decision exists; verify it enforces the decider is a configured CFO **and not the builder**. Possible missing SoD.
- [ ] **BUG (MEDIUM, BUGS.md):** reject→rebuild may produce no new batch — rebuild-after-reject unproven. Reproduce + fix.
- [ ] **BUG (LOW, BUGS.md):** dispatch inbox card doesn't live-update after Approve (needs manual Refresh). Engine/DB correct; reactivity gap.
- [ ] **`batch-status` StartDate/EndDate render in browser zone** (ISSUES.md, still open). Fix to UTC.
- [ ] No-CFO company: Build fails only at server with a banner (minor FE gap; Q28 backlog to surface which companies lack a CFO pre-Build).
- ⏸ Multi-currency batch totals meaningless (sums across differing functional currencies) — deferred (DEFERRALS); note, don't fix now.

---

## STEP 3 — PRODUCTS · CATEGORIES · COMPANY ACCOUNTS

### 3a. Company accounts (accounting)
Pages: `gl-accounts.page` + `coa-dashboard` (TWO GL create/edit surfaces) · `company-setup-dashboard` · `account-links.page` · `dimensions.page`.

- **`gl-accounts.page`** — strong client `validateDraft`: company/code/name required, **per-company unique code**, same-company parent, cycle guard, retire-via-IsActive. `⚠BE`: same-company-parent + multi-node cycle are **frontend-only** (DB blocks only self-parent).
- [ ] 🚨 **`coa-dashboard` GL create dialog has WEAKER validation than `gl-accounts.page`** — its `validate()` checks only 4 required fields: **no unique-code check, no cycle guard** (parent picker excludes only self, not descendants). A duplicate code or descendant-as-parent submits and fails opaquely at the DB. **Strongest accounting create-form suspect.** → **Consolidate both surfaces on `gl-accounts.page`'s `validateDraft`, or add the missing guards to `coa-dashboard`.**
- [ ] ⚠BE **Add backend enforcement for same-company-parent + multi-node cycle** (currently FE-only; a non-UI write persists a bad tree).
- [ ] 🚨 **`account-links.page` is READ-ONLY** — yet it's the page users are **deep-linked to on a Confirm failure to "fix the link."** There is **no create/edit affordance** — you can't actually fix an unmapped role here. High-signal structural gap. → add a create/edit path (form host) for GLAccountLink.
- [ ] 🚨 **`dimensions.page` is READ-ONLY** — no create/edit of Dimension/DimensionValue. → add create/edit (form host) if dimensions are user-managed.
- [ ] **`company-setup` delegates identity edit to the generated form** — verify the generated form actually blocks `CompanyCode` regex (`CK ...CompanyCodeFormat`) + `FiscalYearStartMonth/Day` ranges client-side; these CHECK-only rules likely fail only at DB. Also: **no in-app create-company path** in this dashboard.
- Solid: CFO assignee must have a linked MJ User (blocked); default-GL pickers list only the company's accounts (FE structural; `⚠BE` company-coherence is FE-only).

### 3b. Products (orders)
Pages: `product-workshop.page` · `product-types.page`.
- Solid: Name required, ProductType required (blocks entirely when none exist), enum dropdowns, GL-link role+account required, bookability preview + Confirm blocks unresolvable (headline integration works).
- [ ] 🚨 FE pre-block missing for DB-CHECK-only rules: **availability window (To≥From)**, **no self-successor** → raw constraint error post-round-trip.
- [ ] `product-types`: **name uniqueness** not pre-checked (dup fails at DB round-trip).

### 3c. Categories (orders)
Pages: `categories.page` (roster/tree) · `category-workshop.page` (create/edit + GL link + membership).
- Solid: Name required, GL-link required, product membership = MOVE (model-enforced ≤1 category).
- [ ] 🚨 **no self-parent / no cycle** not FE-validated (parent picker doesn't exclude descendants; DB blocks only self-parent) → cycle submittable.
- Note: `ProductCategory.CompanyID` (company-owned categories) is **S1 schema work** (roadmap V1.1, Q38 answered) — not yet built; the enforcement rules land with S1.

---

## STEP 4 — ORDERS (orders) — the anchor
Pages: `order-editor.page` (order+lines create/confirm) · `payment-entry.page`.

**Work done:** the anchor editor (tabbed, shared money math, client price resolution, save-in-one-TG, Confirm via `Orders.ConfirmOrder`), payment form + oldest-first application. Backend deeply covered: T1 draft/lifecycle/pricing/payment · T2 order-to-je 24/24 · T3 order-to-je-client 31/31 (real client). T4 render+bind 1/1 each — **not** form-input-validation drives.

**Solid (dual-layer):** ≥1 line, product required, qty>0 (FE stricter than DB), unit price≥0, **discount %↔fraction boundary defended both directions** (ruled OUT as the bug), service-period order, order-date required, start-status can't be Posted/Fulfilled/Voided, Confirm never a client status-write, booked-order immutability, totals by construction.

**Gaps / to-do (the everyday-use holes):**
- [ ] 🚨🚨 **THE LIKELY BREAKING BUG — customer-required not enforced in the form.** `orderDraftIssues` gates only order-date + ≥1 line; it **never checks `CustomerOrganizationID`**, which the backend requires at Confirm (`orderBooking.ts:71`). With start-status = **Confirmed**, Save **persists a Draft first, then Confirms** — so a customer-less order leaves an **orphaned Draft** + a red "Confirm blocked" banner. The customer field is a **raw UUID text box** with no picker, so there's no way to satisfy the rule the UI never surfaced. → enforce customer in `orderDraftIssues`/`CanSave`/`CanConfirm` + give it a real picker. **(Confirm this is the bug Marcelo hit.)**
- [ ] 🚨 **All party/reference fields are raw free-text UUID inputs** (customer, sales-rep, contract, approval-task, reverses-order) — FK'd ones fail opaquely post-round-trip; the soft customer ref persists garbage. → real pickers with existence validation.
- [ ] 🚨 **"(required)" reversal-reason label is cosmetic** — nothing enforces it (not FE, not a DB CHECK). → enforce when Reverses-order is set, or drop the misleading label.
- [ ] Deferred line: service period shown but **not required** → rev-rec silently degrades. Consider requiring it for Deferred lines.
- **`payment-entry`** — solid; over-application guard is FE-only (no BE re-verify) — acceptable per over-pay-allowed design; note only.

---

## Cross-cutting
- **Every page in this campaign is a hand-rolled editor pending the UPD-11 forms migration** (deferred + convert-on-touch, `DEFERRALS.md`). As we fix a page's validation here, **converting it to the MJ form host is the natural way to get input validation "for free"** — fold the two efforts where it fits (the form host enforces required/typed/enum at the field level).
- **Two divergent create surfaces are themselves a risk** (GL accounts: `gl-accounts.page` vs `coa-dashboard`). Prefer one validated path per entity.
- **Display bugs (money/date zone)** still open on je-console + batch-status + erp-mapping + account-links (ISSUES.md) — fix as we touch each.

## How to use this tracker
Work top-down. For each page: (1) confirm the ✅ rows still hold by DRIVING the form (valid + invalid input) — not just re-running backend tiers; (2) close every 🚨 (FE) and ⚠BE gap; (3) tick the box. A page is "everyday-use ready" only when every rule is FE-blocked AND BE-enforced and a test drives the form with invalid input and sees it blocked.
