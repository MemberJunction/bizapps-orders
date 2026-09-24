---
"@mj-biz-apps/orders-entities": patch
---

Keep the order-line edit veto registry in MJ's global object store instead of a module-scoped
variable, so every copy of `orders-entities` loaded in one process shares one registry.

Before this, a host that resolved two copies of the package could register the veto into one and
look it up in the other, and the veto would never run. That forced cross-repo consumers to pin this
package exactly. They can now depend on it with a range. `RegisterOrderLineEditVeto` and
`HostOrderLineEditVeto` keep their signatures.
