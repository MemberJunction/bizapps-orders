# Meeting with Amith

## Bizapps accountign plug (Aka accountign engine) (used by orders to input JE's)

- have claude werite up tests that populate the db to test it
- the plugin must verify that Dr and cr entries balance out

Jnote: 1 JE is one CR or Dr 
!!! The engine needs to group entries together and verify them then apply them as an atomic transaction
there are two ways to do this and we prefer teh secodn
1) create a transaction for the entries, have db validate cr and dr balance
2) create a utility method that does that check then pass the group as a transaction to the db
	1) the utility method buidls the transaction and validartes the group rather than doing it hrough a resolver


Engine types
1) client side - example: AIEngineBase - purely metadata caching
2) Server side - example: AI engine - proxies metada so you can call on the server

todo: build the accountign engine:
1. Accoutnign engine base: client side metadata cache
2. accounting engine: server side that creates functions that can be called using remote process. MODEL FROM THE AI ENGINE

remote operation: "create journal entry" (or a similar name) that takes in entries

Orders will generate journal and entries and pass them to accountant using the engine
The journal entries from orders will always use the account number not the account ID and accounting, but the actual number from the general ledger that we also store an accounting. The dimensions will be created by orders and pass to accounting and the engine. We need to bring them over the engine. Will also need to verify the account exist. Convert the journal entry to be entered at that account and by convert I mean, sort of translate to pick up the ID for what we're gonna have to put the foreign key in that journal entry. It also needs to verify the timestamp is not inside of a locked. It also needs to verify that the credits and debits are balanced. It also needs to verify that the company exists an that the account exists obviously.
Orders will check the chart of accounts for the companies to find the account and it's account number, but it won't use the primary key. It will use the account number and orders will handle getting that right so on failure cases we would just need to alert or reservoir failed so the cases for the engine function is going to be a success, which is the easy one on that case we can consider returning the journal entry number so that orders knows which journal entry it just created if it wants to on failures, there's a few failure cases in the case that we failed because entries are imbalance and dis sent that back as a message or an error to orders in the case that we fail because the lock is closed we need to ask a meet if you can mark this as an open question and we will decide if we need to either automatically move to the next open period or if we need to alert the user and allow them to switch it over and then in the case where the account or company doesn't exist. We need to for both of those cases just alert orders that that's the issue. Basically we need a good error handling so that if something fails orders is why and can correctly handle it on their side we only handle converting the data into our journal entries and making sure it's valid on the accounting engine side.


## subscription management system
The subscription managing system, sits on the order side and tracks subscription payments, and revenue

## important note:
One important note is that orders will be referred to as orders but will also handle payments subscriptions, tax calculations, the product catalogue, and other connected systems. Because of this will sometimes refer to something called payments and that's just the payments package in order orders we referred to orders. It's an overloaded term, but I mean the actual orders open app and it's entirety or just the order system depending on the context generally it's safe to assume that it means the open app and if the thing that we were talking about are the capability we're describing fits into orders then that's probably the orders functionality of the open.

To add to this note, there will be a distinction within the order system across a few functionalities that will be in different packages. There's going to be a payment packages that handles the payments incoming and creates the Journal injuries that handle cash, but it is not going to handle deferred revenue or account receivable or the stuff associated with orders unless it's specifically receiving a payment that needs to affect that

The order section of the orders on the other hand will handle account receivable, deferred revenue, and stuff associated with the creation in order for something but not the actual payment for it.

There will also be a product catalogue that will handle mapping products to accounts as described below. There will also be a tax system that will be calculating taxes for different orders. Eventually, we would do foreign exchange, but right now we're deferring that so this is very important foreign exchange is deferred for now and this V1 outcome or output that we were looking for.

## orders
Orders will keep a product table and the general ledger account that those products map use so that would create a journal entry. You can map it to the right account. The table will have the product name. It's ID a foreign key to the ID of the account it needs to map to in the accounting system and the different dimensions that we should associate with a journal entry for that product. 
## product catalog
The product catalogue is a table that links products to their respected accounts as well as containing dimensions for their entries, so it will link a product to revenue account deferred revenue account account has both accounts and other associated accounts that need to handle is associated orders entries

## subscriotions are tracked in orders

## Chart of Accounts
The chart of accounts for now will synchronize every account from the general ledger. We will have account types associated with accounts. The big five account types are assets, liabilities, revenue, expenses, and equity. We may add sub account types later. Companies will always have certain general accounts or default accounts, such as a account receivable, deferred revenue, revenue, cash, and other such accounts that are outlined in the schema his default accounts will be used by defaulter product in less than specifies a different account in the product catalogue ruining

## who got the money?
Hey, we use payment types to track where a payment came from those types shall be associated with a certain association or company

## inventory/COGS
We are currently not worrying about cost of good sold and inventory that will come later, but it is deferred in V one for now

## Tax
Hacks has to be in V1 has mentioned before foreign exchange or FX is deferred.

Tax will require the tracking of a few things, and we need to track your restrictions based on the customer and vendor locations and determine which one applies to the transaction. We will likely use a third-party package to evaluate our tax calculations or to figure out what jurisdiction applies and calculate the right taxes. Note this is a place where we can evaluate open source options. Otherwise, we must have the infrastructure to apply tax in general, whether we support that through a third-party package or not.

We have to support the complexities of certain tax cases we sell to allow nonprofits so we would need to support detecting if someone is tax exempt or not. If they tell us they are tax exempt. We still need to be able to check that and make sure depending on that jurisdiction and the type of product that we do not have issues we're going to need at least a table of sales tax rate information that they ordered level to track tax exemptions, which means we'll have to have a organization tax exemption table at four E. one organization we're gonna build out the tax table overtime so it doesn't all need to be built up at the beginning, but this is just a quick idea of some of the stuff that we need to be built in taxes, taxes should not be phase one communicating to accounting should be phase one and testing those batching and making sure that the product chart works. That stuff should be phase one taxes is a little bit later down the line, even though it is in P1 overall.
We will likely have to have a table at the order level that tracks taxes applied to each product and the rules apply to each product. The system should be able to configure if those are applied as separate entries or if they are applied as a single entry and if they are applied to special tax accounts, depending on their type or all to one tax account that needs to be configurable to accommodate our customers

## order pipeline
Orders go through a phase pipeline there's a certain point in that pipeline at which they are considered locked and cannot be changed. Once that point is reached the journal entry for that order will be fired off to the accounting system. It will not be sent before we might want to have triggers to enforce this locking check back with a meet for that or Robert.

## Cencelations and cancelations after lock
Cancellations after the order lock and the journal entry become a canceling order that will have its own special order type and be filed into the accounting system as a reverting journal entry similar to how revert would be done in a get commit. It's important to note that orders might not want to revert the entire order. It might only revert part of it and that needs to be something that orders can count for because it can happen and will happen. maybe the customer returns one product or cancels one product due to it failing to meet their needs for some other reason but they keep the other product in that case you need to only cancel half the order.


