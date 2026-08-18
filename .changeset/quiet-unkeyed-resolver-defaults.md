---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Default price/tax/secret resolvers are intentionally registered with no ClassFactory key. Mark those registrations so Explorer/MJAPI stop warning at boot, and probe for a plugin key before CreateInstance so the walk does not fall back (and warn) on every Product/Category/Company miss.
