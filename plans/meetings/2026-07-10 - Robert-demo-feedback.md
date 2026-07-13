# Robert Accounting and Orders Demo Feedback
Thanks for creating this. It's great to see the functionality being built and to be able to provide feedback as we iterate to build it out. Some initial reactions:
## Orders
Compose Order: 
When you're creating an Order, it will be the thing you're focused on so it should take up the space available.
Lots more fields needed on the Order like the Customer (Organization and Contact), Order Date, Order Status, Billing and Shipping Addresses.
Moving Status: You should be able to skip some of the Status values. Like going right to Confirmed or Draft to Confirmed without hitting Quoted. 
How much validation is in place to verify that Orders / Journal Entries  are valid based on their current state?
Related: What happens if the Product / Product Category / Company Account Maps is missing something.
On the Order Line, how is it determined that it's Deferred Revenue? For Deferred Revenue, is there anything in place to generate the Journal Entries to transfer the Deferred Revenue into recognized Revenue over time?
We need a Void button different than a trashcan because trashcan means delete to me.
## Products
Need more information here around Revenue Recognition and Requires Fulfillment. Physical products require fulfillment and that will be part of the logic when saving a Committed Order to know if it can be moved automatically to Fulfilled. 
Rev Rec when deferred will need at least two types: One is a single date, like an Event Date, where the Revenue is recognized 100% on the Event Date. Another is a Subscription with different Periods like Annual, Quarterly, Monthly and then store dates with the Order Line (or the related Entity with Subscription information)
 