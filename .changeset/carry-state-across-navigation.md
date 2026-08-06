---
"@mj-biz-apps/orders-ng": patch
---

Fix three "the button does nothing" bugs with one root cause

Pages are created imperatively through `ViewContainerRef.createComponent`, so anything that
should travel with a navigation has to be handed over explicitly. Nothing was.

- **Clicking an order in All orders did nothing.** `showPage` re-inserted the cached page
  and returned before passing the pending record — so it worked exactly once, before the
  editor had ever been visited, and was silently inert every time after.
- **"Open in full editor" did nothing.** The section received the emitted draft and
  discarded it, so escalation landed on an empty workspace with the half-typed order gone.
  It now adopts the same draft INSTANCE, which is what makes the handoff lossless.
- **"Take a payment" showed the previous payment.** The cached page came back with its
  state and nothing could blank it. Pages that can start fresh now expose `Reset()`; the
  cached view is asked rather than destroyed, so a part-typed order is still safe.

Also locks a captured payment read-only — three triggers make the database refuse edits, so
live fields were inviting typing that could never save.
