---
'@mj-biz-apps/orders-server': patch
---

The checkout edge logs at startup when Turnstile is not configured, naming the missing setting (`TurnstileSecretEnvVar` or `TurnstileSiteKey`), so the gap shows before a widget that sets `requireTurnstile` answers 503. The checkout docs gain a step-by-step setup guide for a deployment, and `.env.example` names `CHECKOUT_TURNSTILE_SECRET` (#609).
