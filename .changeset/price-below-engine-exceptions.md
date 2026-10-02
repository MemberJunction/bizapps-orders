---
"@mj-biz-apps/orders-core-entities-server": patch
---

Record a booked line priced below its engine price with no approved concession as a finance
exception (golive #279).

- The booking save raises `PRICE_BELOW_ENGINE_UNAPPROVED` through `Accounting.RaiseFinanceExceptions`,
  inside the booking transaction, for each line whose stated price is below its engine price by more
  than any Approved concession on it covers. The amount is the uncovered value; the exception is
  keyed on the order line and dated the business day of the confirm. Nothing is refused: this
  records the bookings the confirm gate lets through, such as a save with no context user.
- The lines are judged by the confirm gate's own evaluation (`FindUncoveredLinePrices`), so bundle
  components, reversals, the engine's own price and a named list pick raise nothing.
- The type's configuration is read through `Accounting.GetFinanceExceptionTypes`; a missing or
  inactive type raises nothing. Accounting is consulted only when a line needs raising.
- A raise that fails fails the booking, so an exception is never silently lost.
