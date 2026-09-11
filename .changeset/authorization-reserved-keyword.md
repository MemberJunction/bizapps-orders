---
"@mj-biz-apps/orders-ng": patch
---

The Order Line form could not open once the price-override authorizations were seeded.

`overrideKindFromLiveRoles` filters `MJ: Authorization Roles` to find out whether the current
user may override a price. Its `ExtraFilter` referenced `Authorization` unbracketed, and
`Authorization` is a RESERVED T-SQL keyword, so SQL Server rejected the entire statement:

    Incorrect syntax near the keyword 'Authorization'.

The generated select list brackets the column (`[Authorization]`); only this hand-written
filter did not, which is why nothing caught it.

The bug has been present since the price-override feature shipped, but was unreachable: the
call is gated on `priceOverrideCatalogInstalled()`, so on a host without the authorization
catalog the query never ran. Seeding the three `MJ.BizApps.Orders.Price.*` authorizations
switches the path on — so the form breaks on exactly the hosts that adopt the feature.

`[RoleID]` and `[Type]` are bracketed in the same filter for consistency; neither is reserved,
so neither was failing.
