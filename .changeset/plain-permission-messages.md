---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Permission refusals no longer show authorization names, setting keys or rule types. Each one says what the person cannot do and who can; when an authorization is not installed, its name and the fix go to the server log (bc-aidp-next-golive#493). Messages that send a person to Finance or an administrator now ask politely ("Please request this from Finance.", "Please contact your administrator.").
