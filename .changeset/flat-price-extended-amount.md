---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

A Flat-priced line whose price does not divide by the quantity (Flat 100.00 at quantity 3, unit price 33.33) is now worth the flat amount everywhere, not 3 × 33.33 = 99.99 (#579). Pricing stores the rule's figure on the line, `OrderLine.ExtendedAmount`, and the line total, the charge, tax and promotion bases, the journal entry's discount split and the invoice's list amount read it. The invoice no longer prints a one-cent Adjustment or Discount row for such a line, and a draft line saved again or confirmed later keeps 100.00. Changing the quantity or unit price without re-pricing clears the figure, so the line goes back to quantity × unit price. Lines written before the column existed have no figure; the invoice lists one at its net when the gap to quantity × unit price is within rounding (half a cent per unit) and no discount is recorded.
