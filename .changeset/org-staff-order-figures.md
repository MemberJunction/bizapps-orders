---
'@mj-biz-apps/orders-ng': minor
---

The Organization form's Staff section (from `@mj-biz-apps/common-ng`) now shows order figures for the organization's staff: Staff LTV with how many staff have bought, Staff orders with open and overdue counts, active subscriptions and the last staff order date, plus Orders and LTV columns on each staff row. `OrdersStaffContributor` registers against Common's `OrganizationStaffContributor` plug-in point and uses the same definitions as the person header's `Party Order Lifetime` query: an order counts unless Voided, LTV is the sum of `TotalGross`, open means overdue or a balance due, and a subscription counts when its Status is Active. Needs the `@mj-biz-apps/common-ng` release that adds the Staff section.
