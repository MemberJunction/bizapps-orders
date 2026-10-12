# `@mj-biz-apps/orders-actions`

**MJ Actions for BizApps Orders** — the seam through which agents, workflows and the Explorer UI
invoke order behaviour.

## Status: generated action subclasses only

The package builds and is wired into the CodeGen pipeline, and generated action subclasses land in
`src/generated/`. Hand-authored actions do not live here.

They live in `@mj-biz-apps/orders-server` (`packages/Server/src/custom/`), each anchored by a
`Load*Action()` call in `LoadBizAppsOrdersServer()`, with their `Action` rows in `metadata/actions/`.
The reason is the browser bundle. This package is declared `shared` in `mj-app.json`, so MJExplorer
installs it too and everything it imports reaches the browser. Most of the hand-authored actions
import `@mj-biz-apps/orders-core-entities-server`, which pulls in `@memberjunction/storage` and
through it Node's `stream`; esbuild cannot bundle that for a browser, and MJExplorer failed to build.
`src/index.ts` states the rule: an action that touches the database or any server package belongs in
`packages/Server`.

Nine of the thirteen actions have a job in `metadata/scheduled-jobs/`, several of them as the
scheduler's way into an operation. Every job except Dispatch Outbound Events ships `Disabled`, so it
runs only once someone enables it. Multi-step order behaviour itself is exposed as
**remote operations**: one row each in `metadata/remote-operations/`, a generated typed base in
`@mj-biz-apps/orders-entities`, and the implementation in `@mj-biz-apps/orders-core-entities-server`.
They are called by code, need typed inputs and outputs, and return structured refusals rather than
prose.

## When to add an Action instead of an operation

Reach for an Action when the caller is an **agent or a human-facing workflow** rather than code:
when the invocation should be discoverable in metadata, when parameters want describing in natural
language, or when it belongs in an agent's toolset.

Reach for a **remotable operation** when the caller is code, the contract is typed, and refusals are
structured. Most of what this app does is that.

An Action that wraps an existing operation is a thin adapter — parse, delegate, format. Do not
reimplement the rules; they live in the engines for a reason.
