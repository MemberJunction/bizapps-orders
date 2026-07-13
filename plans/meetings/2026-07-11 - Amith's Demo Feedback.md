Had some similar questions/comments as Robert Kihm after watching the video Marcelo Torres. Here are some added thoughts:
First, it's exciting to see this come together, nice work!
Regarding the way we package the logic, the process of creating the orders/order lines/journal entries/etc, we should make sure that we are using Remotable Operation for larger chunks of logical work if we want a simple encapsulated unit of work for something big. It is also fine to use BaseEntity sub-classes to create Order and OrderLine type records one at a time. 
It is critical that the Journal Entry/Journal Entry Line Items are created through a singular call to an AccountingEngine.CreateJournalEntry type of method so that we have a proper transaction wrapper.
The logic for the journal entry creation belongs in the OrdersEngine because that order engine is where we will know to look at the Product definition to look up its accounting rules (rev rec type per RK comment) as well as looking up its ProductGLAccount rows. We should be using metadata caching for the Product/GLAccount type info in the OrdersEngineBase (which we can wrap for easy access in the server-only OrdersEngine class that simply wraps the base class for convenience like AIEngineBase/AIEngine pattern). 
Please confirm that is the case
 
For UX, I favor:
A full window sized Order Form that a user can see everything and some kind of contemporary way of "tabbing" between sections like the BillTo ShipTo and various other bits, probably a tab for Accounting that would show the journal entry for the order. 
The top level order form should definitely show Payments total and balance and you should be able to see a list of all linked payments (could be zero to many).
Great start Marcelo Torres! 
 