---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

Progress attestation follows finance's books-closed-through date instead of posted batches (bc-aidp-next-golive#316). `Orders.RecordProgress` reads the line's company's `AccountingCompanyProfile.BooksClosedThroughDate` once per call and refuses a measurement date on or before it, on preview and post and on a supersede, with the message "This month has already been closed by finance. Please contact them to proceed." If that date cannot be read, the attestation is refused; a line with no company, no profile or no date has nothing closed. A supersede's reversal is dated on the replaced observation's own date, or on the first open day when finance has closed that month, and the message says why it moved. The replacement's catch-up always posts on the date entered, so `CatchUpDate` equals `MeasurementDate` whenever there is a catch-up. The supersede no longer reads journal entry batches. The attestation screen's supersede text matches. This needs the accounting release that adds `BooksClosedThroughDate`.
