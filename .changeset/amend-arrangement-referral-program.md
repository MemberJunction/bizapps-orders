---
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.AmendArrangement` takes an optional `ReferralProgramID` for a referral extension (#529). It is set on the Duration concession the operation records, so in-program days are approved by the program and applied in the call, and more days are recorded Pending. `Preview` reports the program and whether it would approve (`ReferralProgram`, `ApprovedByReferralProgram`). The program's rule now lives in one function, `CheckReferralProgram`, used by the concession and the operation.
