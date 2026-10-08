---
"@mj-biz-apps/orders-entities": minor
---

Orders gain two columns for VAT location evidence from self-serve checkout: `IPCountry`, the country of the buyer's IP address, and `CardIssuingCountry`, the country of the issuer of the card that paid. Both are ISO 3166-1 alpha-2 codes and nullable; the IP address itself is never stored.
