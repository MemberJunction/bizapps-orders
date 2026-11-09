---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

Receivables company scope (#813): MJ's default `UI` and `Developer` roles no longer count as all-companies roles (every user holds `UI`, so the scope restricted no one), and a user with no finance role and no employee company now sees no companies instead of all of them, with a note on each Receivables page saying why. The role list lives once in `@mj-biz-apps/orders-entities` (`RECEIVABLES_ALL_COMPANIES_ROLES`) for the server worklists and the pages. The scheduled Bill.com send still sweeps every company when its job user is linked to no employee.
