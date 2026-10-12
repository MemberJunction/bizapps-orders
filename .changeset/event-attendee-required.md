---
"@mj-biz-apps/orders-core-entities-server": minor
---

Enforce `EventProduct.RequiresAttendeeInfo`: an order refuses to book an event line of such a product unless it is quantity 1 with an attendee, and checkout refuses to open a payment intent until each ticket has an attendee with an e-mail. The Event product type now defaults the checkout widget to one attendee per ticket.
