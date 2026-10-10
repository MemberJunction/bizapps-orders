---
"@mj-biz-apps/orders-core-entities-server": minor
---

Referral programs (golive #268). A Duration concession naming an active `ReferralProgram` of the order's company, on a term bought by a renewal line, adding no more than the program's `DaysPerReferral`, is Approved by the program with no Sales Authority or approver. More days, or an inactive program, route as usual. Naming a program on a term that is not a renewal, on a non-Duration concession, or without the Referral reason category is refused.
