---
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-entities': patch
---

Both built-in checkout clients now complete Cloudflare Turnstile, so a widget can set `requireTurnstile` (#592). Before, neither `<mj-orders-checkout>` nor the fallback page sent a token, and every initialize and complete answered 403. The edge's 403 now names the site key (new `TurnstileSiteKey` edge setting, paired with `TurnstileSecretEnvVar`); the clients render the challenge, retry once, and get a fresh token for each later initialize or complete. The checkout page's CSP allows `https://challenges.cloudflare.com`. An edge that requires Turnstile without a site key fails closed with a 503.
