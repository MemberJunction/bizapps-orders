---
'@mj-biz-apps/orders-ng': patch
---

Receivables subscription panel: coverage terms and history show their dates, the revenue
recognition card shows the subscription's real recognition journal entries (the same waterfall as
the subscription form), and the renewal countdown runs to the latest term end instead of the
subscription's final-service date. Term dates show the stored calendar day in every time zone. The
renewal warning follows the renewal engine's rules (lead days from the subscription or its type,
Active or Trialing only). A user without journal entry read permission sees a message instead of an
empty recognition card. Recognition entry lines load in one query.
