---
'@mj-biz-apps/orders-core-entities-server': patch
---

`@memberjunction/integration-engine-base` is now a caret range (`^6.1.0-edge.5`), like every other MemberJunction dependency. The exact `6.1.0-edge.5` pin installed a second copy of MJ core next to a host's own (6.1.4 on AIDP), and CodeGen then failed on every core entity with `newObject.BindProvider is not a function`.
