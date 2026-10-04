---
'@mj-biz-apps/orders-core-entities-server': minor
---

A payment schedule now belongs to the order's company: new rows are stamped with the order header's CompanyID and together bill the whole order, whatever company owns each product. The ledger stays per product company: `CompanySlices` divides each row among the companies whose lines it bills, tying both ways, and the booking switch, the cash split, the deposit release and the instalment billing entry all read the schedule through it. Issuing an instalment on a multi-company order posts one billing entry per product company under one document number, with no company letter. Renewal orders get one schedule row for the whole order. Rows written per company by an order that had already issued an instalment keep working as before.
