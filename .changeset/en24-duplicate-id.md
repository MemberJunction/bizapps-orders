---
"@mj-biz-apps/orders-integration-tests": patch
---

The payment-hold waiver check is now `entitlements.EN27`. It shared `entitlements.EN24` with the OnPaidInFull check, and the registry keeps one check per Id, so the OnPaidInFull check never ran. The registry-parity test now reads the check files and fails when two checks declare the same Id.
