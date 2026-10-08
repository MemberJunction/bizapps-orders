---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
---

Self-serve checkout records two pieces of VAT location evidence on the order beside its billing address (#480): the issuing country of the card that paid, as Stripe reports it, and the country of the buyer's IP address, read from a header the proxy or CDN in front of MJAPI sets. The header is named by the checkout edge's new `IPCountryHeader` setting; unset, no IP country is recorded. A checkout whose countries cannot be resolved still completes, with the value null.
