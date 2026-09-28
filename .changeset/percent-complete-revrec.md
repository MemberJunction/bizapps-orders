---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Percentage-of-completion revenue recognition (golive #241, plan Part F / D90, W10/W11). `RevenueRecognitionType.ScheduleBasis` (`AtBooking` | `OnMeasurement`; defaults to `AtBooking`, so the three existing types are unchanged) and the new `OrderLineProgressMeasurement` table — one attested observation of cumulative percent complete per line per period, immutable once posted. A `ProgressRecognitionDriver` family alongside the booking drivers, with `ManualAttestation` shipped. New operation `Orders.RecordProgress` posts the cumulative catch-up (`LineTotalNet × percent − the line's RecognizedToDate`) as a `RevenueRecognition` entry crediting Sales, debiting Deferred Revenue up to the line's deferred balance and Unbilled Receivable beyond it (D92 rule 2); a backward slide mirrors the same entry; a zero delta succeeds and writes nothing; `Preview` computes without writing. The operation advances the line's `RecognizedToDate` in the same transaction as the entry, and is gated on the order being confirmed rather than on the line carrying a booking entry, since a POC line on a company with a payment schedule books no value entry at confirm. `Orders.GetProgressWorklist` lists open POC lines with their last observation. Metadata: the Percentage of Completion rev-rec type and the Project / Implementation product type. Receivables rail gains a Progress attestation page.
