---
'@mj-biz-apps/orders-core-entities-server': patch
---

Saving the card at checkout for renewals writes it through the wallet's embedded Payment Detail, so the wallet's save no longer fails with "Company cannot be null". A renewal charge whose payment provider is inactive or not configured is no longer logged as an unknown-outcome failure, so the order is not held and a later pass charges it once the provider is fixed.
