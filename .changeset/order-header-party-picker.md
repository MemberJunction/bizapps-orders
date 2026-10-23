---
"@mj-biz-apps/orders-ng": minor
---

The order header's Ship to and Bill to organization and person lookups use the shared fast party picker (`bizapps-party-field` from `@mj-biz-apps/common-ng` 5.56.0): nothing is listed until two characters are typed, then one prefix search finds people by last name, display name, email or email domain and organizations by name, legal name or website domain. Requires `@mj-biz-apps/common-ng` >= 5.56.0.
