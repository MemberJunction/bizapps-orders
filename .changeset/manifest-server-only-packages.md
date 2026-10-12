---
"@mj-biz-apps/orders-entities": patch
---

`mj-app.json` now lists `@mj-biz-apps/orders-actions` under `server` instead of `shared`. They use server-only code (Node built-ins, or MemberJunction's actions, AI engine, storage or server packages), and `shared` installs a package into MJExplorer too. The Open App client bootstrap imports every `shared` package, so Explorer's browser build failed on a host with this app installed (`Could not resolve "node:crypto"`, `"node:net"`, `"stream"`). The server still loads them exactly as before.
