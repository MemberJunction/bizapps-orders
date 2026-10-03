---
'@mj-biz-apps/orders-core-entities-server': minor
---

A typed promotion code that belongs to a member promotion is refused at the public checkout, so a member price needs a verified token. `BaseCheckoutMemberDiscountResolver` gains `IsMemberPromotionCode`; `/draft` asks every registered resolver before pricing a typed code and refuses one any of them claims. The base implementation claims every code, so a host's resolver must override it to name its own codes, or typed codes stay off at every checkout.
