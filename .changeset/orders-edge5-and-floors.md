---
'@mj-biz-apps/orders-entities': patch
---

Move to MJ `6.1.0-edge.5`, and raise the cross-repo dependency floors that were resolving to ancient releases.

69 `@memberjunction/*` pins move `^6.1.0-edge.4` → `^6.1.0-edge.5`.

**The floors are the real fix.** `@mj-biz-apps/accounting-*` was declared `>=0.1.0`, and as a *peer*
dependency pnpm resolved it to the lowest satisfying version — `accounting-server@0.1.0`, whose own MJ
dependencies are `edge.3`. So a tree that declared edge.5 everywhere still pulled **48** MJ packages at
edge.2/3/4 through one ancient sibling. `@mj-biz-apps/tasks-entities` was worse: pinned **exactly** at
`1.2.3`.

Floors now match what is actually published, which is the convention this repo already stated when it
moved to edge.4 ("app dependency floors to the latest releases, read from npm at cut time"):

| | was | now |
|---|---|---|
| `accounting-*` | `>=0.1.0` | `>=0.5.0` |
| `common-entities` / `common-ng` | `>=0.1.0`, `>=5.35.0` | `>=5.37.0` |
| `tasks-entities` | `1.2.3` (exact), `^1.2.3` | `>=1.4.1` |

Verified after a clean install: `accounting-actions` resolves 0.5.0 (was 0.1.0), a single
`@memberjunction/core` at edge.5, build 6/6, and 1441 unit tests passing.

Some MJ packages still resolve at edge.3/4 through `common-ng@5.37.0` and `accounting-*@0.5.0`, which
are themselves published against older edges. That clears when those repos republish — their edge.5
bumps are open alongside this one.
