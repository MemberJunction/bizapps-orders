---
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-actions": patch
---

Move the invoice, payment-intent and document-send actions into the server package

They lived in `orders-actions` but depend on server-side entity behaviour, so the order → journal
entry path could not be reached end to end from a running instance. Relocating them alongside the
code they call makes that path reachable; the action bodies are unchanged.
