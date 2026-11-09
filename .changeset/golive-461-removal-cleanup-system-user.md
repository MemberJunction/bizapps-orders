---
'@mj-biz-apps/orders-core-entities-server': patch
---

Removing a line from a draft order, or deleting a draft order, no longer needs Delete permission on order lines and the rows their saves write (price components, dimensions, concessions, adjustments, allocations). The signed-in user's right is checked once at the order (Update on the order and its lines to remove a line, Delete on the order to delete it), and the cleanup then reads and deletes as the system user. A user without that right is refused before anything is changed.
