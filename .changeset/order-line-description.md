---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

An order line now has a Description field on its card in the Order form, for a product whose name does not say what was sold. The invoice and the invoicing rail already print a line's description after the product name; until now there was nowhere to type one. The field takes up to 500 characters and stores one line of text, is editable while the order is, and shows as text on the card afterwards.
