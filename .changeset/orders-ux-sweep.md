---
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": patch
---

Orders UI/UX fixes.

- Order lines: subscription lines take a Term end; the "Before this can be confirmed" list notes a line whose stated length differs from its type's term; held-product choices and the after-confirm notice name the end that is kept. Bundle lines whose bundle contains a subscription take a Term start.
- A rep can enter a manual discount above their Sales Authority cap: it is saved held and marked "Needs approval", and confirm waits for an approved concession. A line charged nothing once its concession is taken off is a Scope concession. A fully discounted deferred line books no zero-amount revenue releases. A price typed as 0 suggests a 100% discount instead.
- A refused booking says in plain words which line to change; accounting's codes go to the server log.
- Send to Bill.com shows on every order using the Bill.com rail and is enabled only on a saved, confirmed order; otherwise it is greyed out with the reason as its tooltip. The reason is recomputed after a save or refresh.
- A captured payment shows what it was applied to instead of the allocation workbench; By Journal Entry renders; overdue days count business days; the open-orders Date column shows the order date.
- The fulfilment queue, the external invoicing worklist and the invoice rail report a failed read as an error instead of an empty list; an invoice unit whose history cannot be read is not sent.
- The subscription Overview lists read newest first, and a stale reload no longer overwrites newer cards; Cancel subscription is disabled while the form is in edit mode.
- The Override Explanation box shows only on an overridden line price.
- The checkout element stops sending events, polling and redirecting once its host removes it; payment and completion calls already started still finish.
- Styles read only `--mj-*` tokens MemberJunction 6.1.5 defines, checked by a unit test. The kit's print rules, filter chip, select and timeline rules no longer restyle MemberJunction pages outside Orders; loaders and empty states use MemberJunction's components; app chips take the `mjo-` prefix.
- A migration puts the Event Order Line Attendance Status values in CodeGen's order on databases built from migrations. The Referral Programs list shows Company and Is Active by default.
