# Adopting MJ's Entity Action workflow extensions

> **Status:** Tracking doc — nothing to build here yet.
> **Upstream:** MemberJunction/MJ **[#3408](https://github.com/MemberJunction/MJ/pull/3408)** · [design plan](https://github.com/MemberJunction/MJ/blob/claude/sales-deal-management-app-ueporb/plans/entity-action-workflow-extensions.md)
> **Blocked on:** that PR merging *and* its engine work landing (the PR ships schema + plan only).

---

## 1. What is changing in MJ core

`EntityAction` — MJ's generalized hook for running an Action off an entity's
create / update / delete / validate — is becoming the **workflow-hook substrate for every app on
the platform**, so no app needs to invent its own.

It already does more than its schema suggests, and this is worth knowing regardless of this PR:

| Invocation | Where it fires | Semantics |
|---|---|---|
| `Validate` | `OnValidateBeforeSave` | **A real blocking gate** — a non-`Success` result fails the save |
| `Before*` | `OnBeforeSaveExecute` | Awaited, result discarded (cannot veto) |
| `After*` | `OnAfterSaveExecute` | Fire-and-forget |

And because **`Execute Agent` is just an Action**, any binding can already run an agent — a
deterministic **flow agent** (visual editor, `Action`/`Prompt`/`Sub-Agent`/`ForEach`/`While` steps,
per-step retry and error behaviour) or a **loop agent** where judgement is genuinely needed. The
house shape is a flow agent with a `Sub-Agent` step calling a loop agent.

**What #3408 adds:**

- **`EntityAction.ScopeEntityID` + `ScopeRecordID`** — bind a workflow to *one configuration record*
  rather than to every record of an entity. This is the important one: it means **no app ever grows
  a column per type per event**, and a configuration record can surface "the workflows bound to me"
  as a real relationship instead of something buried in filter code.
- **`EntityAction.Sequence`** — deterministic ordering when several bindings share an event.
- **`EntityActionParam.ValueType = 'Entity Object Data'`** — passes `entity.GetAll()` instead of the
  live `BaseEntity`. Use it for anything that serializes, above all `Execute Agent`'s `Data` payload:
  a `BaseEntity` serializes to `{}` because its fields are getters, so the agent silently receives
  an empty payload with no error anywhere.
- Two seeded reusable `ActionFilter`s — **"field changed"** and **"field changed *to* value"** — so
  transition detection stops being hand-rolled. Without them `AfterUpdate` fires on *every* update,
  and "status *is* X" instead of "status *changed to* X" re-fires on every later save.
- `After*` routed through `QueueManager` so failures are durable and retryable rather than logged
  and swallowed.

**Authoring is pure metadata** — `metadata/entity-actions/`, with `relatedEntities` for invocations,
filters and params. No schema and no code in the consuming app.

---

## 2. What this means for BizApps Orders

Orders has the richest lifecycle in the family and currently expresses all of it in server-side
entity code — `OrderEntityServer.Save()`, `PaymentHeaderEntityServer`, the remote operations. That
is correct: booking journal entries and applying cash are *not* configurable workflow.

What `EntityAction` adds is the **configurable layer on top** — the things an operator wants to
change without a release. Dunning cadence, welcome sequences, fulfilment notifications, internal
alerts on large or unusual orders.

The dependency direction is fine: hooks live in core, so Orders takes on nothing new.

## 3. Suggested bindings

| Entity + invocation | Scope | Work | Purpose |
|---|---|---|---|
| `OrderHeader` · `AfterUpdate` (status changed to `Confirmed`) | a `ProductType` or `Company` | Flow agent | Fulfilment kickoff, welcome sequence, internal notification |
| `PaymentHeader` · `AfterCreate` | a `PaymentType` | Action | Receipt, reconciliation alert |
| `PaymentHeader` · `AfterCreate` (reversal types) | a `PaymentType` | Flow agent | Refund / chargeback handling — `PaymentType.IsReversal` already distinguishes these |
| `Subscription` · `AfterUpdate` (status changed to a cancelled value) | a `SubscriptionType` | Flow agent | Save/win-back motion, entitlement revocation checks |
| `OrderHeader` · `Validate` | a `Company` | Action | Operator-configurable pre-confirm checks that sit *above* the built-in sales rules |
| `EntitlementGrant` · `AfterCreate` | a `ProductType` | Action | Provisioning notification for consumers that poll |

## 4. Notes specific to this repo

**Keep the boundary.** Booking, pricing, tax and cash application stay in entity-server code and
remote operations. `EntityAction` bindings are for *side effects* — notify, provision, escalate,
enrich. A binding must never be load-bearing for the ledger: `After*` is fire-and-forget today and
queued after #3408, so it is explicitly not part of the all-or-none transaction that `ConfirmOrder`
guarantees.

**`ProductType` and `SubscriptionType` are natural scope records.** Both already carry behaviour
defaults, so "the workflows that run for Membership products" belongs on the `ProductType` form.
This is exactly what `ScopeEntityID`/`ScopeRecordID` is for, and it saves Orders from ever adding
`ProductType.OnConfirmedAgentID`.

**Transition filters matter more here than anywhere else.** An order's status changes several times
across its life and orders are saved repeatedly. "Status *is* Confirmed" would re-fire on every
subsequent save — including the ones that stamp `JournalEntryID`. The seeded "field changed to
value" filter is not a nicety here.

---

## 5. What to do now

**Nothing.** This is a tracking doc so the idea is not lost and so this repo's plans reflect where
workflow hooks are going. When #3408 merges and its engine work lands:

1. Confirm the bindings in §3 are still the right ones.
2. Author them as metadata under `metadata/entity-actions/`.
3. Build the flow agents they dispatch to.
4. Delete this file, or fold it into the repo's main plan.

## 6. Two rules to carry into the design

- **Synchronous bindings should be Actions, never agents.** `Validate` and `Before*` run inside the
  caller's transaction. A loop agent's duration is unbounded and holding a transaction open for it
  is not acceptable. Agents belong on `After*`, which is async.
- **A flow agent should create human work and finish** — it should not hold a run open waiting for
  a person. Use `MJ: AI Agent Requests` when the answer resumes the same run (minutes to hours), and
  a **bizapps-tasks** Task when it is durable, assignable work someone owns (days to weeks).

---
_Generated by [Claude Code](https://claude.ai/code)_
