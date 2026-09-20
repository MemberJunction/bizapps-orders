---
"@mj-biz-apps/orders-core-entities-server": minor
---

A company billed by instalment books its value at invoice, not at confirm (D91, golive #240).

Confirming an order used to raise the whole contract's value on the balance sheet the day it was signed. For a three-year contract billed annually that meant three years of receivable — or, under the superseded D89, three years split between AR and a contract asset — before anyone had billed a penny. Either way Deferred Revenue came to mean "contract value" rather than "billing ahead of performance", and both sides of the balance sheet carried contracts nobody had invoiced.

Now the order and its schedule stay in the subledger and the GL records what actually happened: billed, collected, earned. A company with live payment-schedule rows raises no value entry at confirm; the same entry is raised once per instalment, at invoicing, for that instalment's slice, credited to Deferred Revenue. An up-front line still earns at booking, so it posts `Dr Deferred / Cr Sales` — today's credit side with the AR debit replaced by Deferred — and a deferred driver's staged releases are untouched. Between billing and recognition a contract's Deferred runs to a debit balance, and that balance is the contract asset; presenting it as Unbilled Receivable is a period-end reclass, not a second running account maintained by the booking code.

Both moments build their journal lines through one function, `BuildValueEntryLines`, and read a line's money through one function, `LineAmounts`. That is the point: if confirm and invoicing each computed what a line is worth they would drift, and the drift would still balance, which is the failure this area keeps producing. `EmitInstalmentReclassEntry` becomes `EmitInstalmentInvoiceEntry` in a renamed module; its call site inside `Orders.IssueInstalmentInvoice` is unchanged, and idempotency still comes from that operation's status guard.

Two penny-level rules worth knowing about. An instalment's `Gross` is **derived** from its sliced net and discount, never sliced on its own — `net + discount = gross` has to hold inside each slice, and three independent roundings do not preserve it (net 1000.01, discount 111.11, three instalments: 333.35 + 37.04 = 370.39 against a sliced 370.38). And cash taken before a bill raised no receivable, so a row's `AmountPaid` is deducted pro-rata from both the AR debit and the Deferred credit; a row prepaid in full posts no entry and still takes its document number.

An order with no payment schedule — dues, events, and everything the go-live conversion brings in — books exactly what it booked before, asserted on the entry's shape rather than its totals. `GL_ROLE.UnbilledReceivable` stays as the written-down cross-repo name but is resolved by nothing in orders. A gift card sold to a company billed by instalment is refused with an explanation rather than guessed at.
