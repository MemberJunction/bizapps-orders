---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Go-live fixes: a Confirmed order header, and a company's last schedule row on one, refuse DELETE (51019, 51020); the confirmation stamp is server-owned and put back if booking rolls back; a $0 line on a booked order keeps its money; Bill.com finds an existing customer by account number, creates one only when allowed, and tells finance when an invoice is ready; per-order "Check for payments now"; the payment webhook writes on its own provider; a settled checkout intent is not moved back; approval roles, permissions and the Senior Finance (AR) override grant; and smaller concession, review-task, renewal and pricing fixes.
