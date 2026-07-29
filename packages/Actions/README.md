# `@mj-biz-apps/orders-actions`

**MJ Actions for BizApps Orders** — the seam through which agents, workflows and the Explorer UI
invoke order behaviour.

## Status: scaffolded, not yet populated

The package builds and is wired into the CodeGen pipeline, and generated action subclasses land in
`src/generated/`. No hand-authored actions ship yet.

That is deliberate. Multi-step order behaviour is currently exposed as **remotable operations** in
`@mj-biz-apps/orders-core-entities-server` — `Orders.PreviewPrice`, `Orders.ApplyAccountCredit`,
`Orders.RefundPayment`, `Orders.CancelSubscription`, `Orders.SpawnRenewals` — because they are called
by code, need typed inputs and outputs, and return structured refusals rather than prose.

## When to add an Action instead of an operation

Reach for an Action when the caller is an **agent or a human-facing workflow** rather than code:
when the invocation should be discoverable in metadata, when parameters want describing in natural
language, or when it belongs in an agent's toolset.

Reach for a **remotable operation** when the caller is code, the contract is typed, and refusals are
structured. Most of what this app does is that.

An Action that wraps an existing operation is a thin adapter — parse, delegate, format. Do not
reimplement the rules; they live in the engines for a reason.
