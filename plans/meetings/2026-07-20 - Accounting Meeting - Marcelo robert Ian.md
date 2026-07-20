Accounting Meeting-20260720_120924-Meeting Transcript
July 20, 2026, 5:09PM
41m 0s

Marcelo Torres started transcription

Marcelo Torres   0:04
So, so the idea is right, we've talked about.
We've talked about.
scoping by company, you know, and we have every product's owned by a company, each order is owned by a company. One thing with that is just if an order is owned by company A, but it has a product from company B, my assumption was that a user who's only in company B can still see that order. They just can't like confirm it, they can't.
do actions on it, but they still can see the data from it.
Which I thought?

Robert Kihm   0:43
I think practically that's how it's going to be configured. Like if people are going to be able to order products from different companies, they're going to have some permissions on different companies. And like, I think you're right about the ownership of like, yeah, you can see it, but you probably can't make changes to it because it's outside your company context.

Marcelo Torres   0:46
Yeah.
Aaron.

Robert Kihm   1:02
Maybe you could make changes to like that specific order line, add comments to it or something. I don't know. Like, because you could do something like that. But I think, you know, the ownership overall is the company that's specified on the order. And they're just, they just happen to like be selling one of the other company's products.
I could see an argument where you could even say you might configure it so that they don't have permissions to see it. That it's the company, the original company that owns it all, and they're the ones that have to go through it. But practically, and especially in the Blue Cypress, you know, system,

Marcelo Torres   1:31
Mhm.

Robert Kihm   1:42
people who are creating those orders are going to have permissions on all the companies that have products in that order.
Like that's the way like that that person would have permissions on all the companies.

Marcelo Torres   1:49
Yeah.
I mean, that's where my question is about the permission system. That really highlights the kind of flexible rules permission system that I've been kind of noodling on because this kind of case is just one of those perfect examples where it's something you would want configurability for. Like in Blue Stypress, obviously, you want to see under company orders and maybe in other companies as well, but like
Maybe you don't want to see that if you're in a different company. So it's kind of like it is something to just think about as far as when we're developing that role system, what kind of functionality it needs to support.

Robert Kihm   2:29
Are there any notes around order fulfillment when there is an order that has products from multiple companies and how fulfillment works? Is there anything in the plan that talks about that?

Marcelo Torres   2:41
Um...
To be honest, at this point, I'd have to go look through, but it's my understanding, no. So that's a very similar case that I don't think has worked out, which is like, if company A fulfills their end of an order, but company B doesn't, what happens? And who's responsible for fulfilling an order owned by, you know, company A? But like, let's say it's got physical products from company B.

Robert Kihm   2:46
Yeah.

Marcelo Torres   3:03
Do they have to ship it? Does the company have to ship it? Does the company need to communicate to them that they need to ship it? My understanding for fulfillment was always that fulfillment would only happen when the underlying order lines are fulfilled. And so I think one thing I did do some
thinking on and probably needed to ask you about is basically, do we want per line fulfillment? My thinking is yes. It's almost like, okay, yeah.

Robert Kihm   3:29
Yes, yes, I think that's true, and then there is the idea of...
So it's per line fulfillment. So here's the caveat on that. In the past, the way this has been handled is if you cannot fulfill everything on an order, you end up splitting the order. So in that case, it's not per line fulfillment, it is per order fulfillment, but you have to fulfill the entire order.

Marcelo Torres   3:39
Uh-huh.
Mm.

Robert Kihm   3:55
And then you would separate it out to say like, oh, well, you know, these are the things that we can ship today, and then actually split it into a separate order for like the follow on products. That's pretty typical. Where, and you might notice that with like Amazon and stuff like that, if you like ordered a bunch of stuff and some of it can ship right away.

Marcelo Torres   4:06
Yeah.

Robert Kihm   4:18
Usually what they'll do is they'll basically like ship what they have, charge you for that piece of it, and then charge you for the rest of it when the other pieces come in. I don't recall if Amazon like actually separates those into separate orders, but effectively that's what it is where you're like making it so that it's like, oh, I can do products one and two on this order, but three is

Marcelo Torres   4:35
Yeah.

Robert Kihm   4:41
back ordered for another month, I'm not going to hold everything off, you know, and ship it all at once. So I can't fulfill everything, but I can fulfill two of the three. Now, there are times where you're also given a choice, like as a customer, to say, like, no, I want all of these things shipped together. And then it wouldn't fulfill the other two. It would keep the order all together, and it would wait until everything could be fulfilled.

Marcelo Torres   5:00
Mhm.

Robert Kihm   5:06
So that that is something that you know happens in order entry systems.

Marcelo Torres   5:10
Yeah, I mean, my thinking for that would be we would create, like, we actually treat orders as sort of a list of order lines, and then we create fulfillment groups that are just kind of a list of IDs, and then each fulfillment group has its own sort of fulfillment criteria. If we wanted to handle that within one order, I'm guessing that's kind of the data structure Amazon goes with.
I'm not going to be able to do that immediately. That's going to be something that I have to wait on. But at least understanding what I'm working towards is good, because there's a lot of decisions that go into designing that structure well.

Robert Kihm   5:42
Well, I think part of what's interesting though is like when you charge someone, often it's related to the fulfillment of it.

Marcelo Torres   6:02
Mm.

Robert Kihm   6:02
fulfilled than shipping. So that's where you do like one and two and you're like, oh, well, that's for $250 out of the $350 order. I'm now, you know, I'm fulfilling that order. I'm charging them $250 and there's going to be a separate charge later for $100.

Marcelo Torres   6:04
Well...

Robert Kihm   6:23
having it as a separate order, like where you basically have your original order with the two products and then you've created a new order with the third one would handle that for that type of charging. The fulfillment itself probably could work with a fulfillment group and things like that that you're talking about. I don't know about the

Marcelo Torres   6:25
Yes.
Okay.

Robert Kihm   6:43
like issuing a charge for it when we're doing like, you know, Stripe payment processing and things like that.

Marcelo Torres   6:50
Yeah, I mean, I think for LXP, we're going to go with the one order system no matter what. And if, you know, we need to instruct the accounting team to split orders based on fulfillment, that's something they can totally handle. Just because like that's not in the MVP and my understanding of what we're selling for LXP, it's all instant fulfillment anyway. So.

Robert Kihm   6:55
Mhm.
Yes, for what, for what's getting sold through it, everything else would be manual.

Marcelo Torres   7:09
Um...
Yeah.
Okay.

Robert Kihm   7:14
So there will be these larger orders that get created, but they can be handled separately for now.

Marcelo Torres   7:20
So...
There's a few. There we go. OK.
So this is kind of a you and Jeremy question.
So, so there's alright, so, so basically...
When you have an order line.
It's owned by a company, because it's a product owned by a company, right? And right now, the way we design it is you select an account for that product, either by setting it directly on the product, setting it in a category, or setting it at the company level. That's our kind of tree there. The
This is not this question, but it's just come to my mind. I think this question is pretty straightforward and solved. The complexity is like, so right now, the question is basically, should we allow any other company to collect revenue for the product? And I think you may have already answered this, but basically the idea is if I have an order line for product A,
and it's owned by company A, should I ever be able to connect an account to product A that's owned by company B?
And the idea is like, if the order is owned by Company B, does the revenue go to Company B, or does the Accounts Receivable go to Company B, or does it go to Company A? That's the question right there. Now.

Robert Kihm   8:43
So in the, so typically what this is, is that in an order that has products from multiple companies, the order, the orders owner, that company is the owner of the Receivable.

Marcelo Torres   8:56
Mhm.
Okay.

Robert Kihm   9:00
And then you get due to do froms.
So basically, if you owe, if like it's $150,000 order, your company has $100,000 product, and then there's a $50,000 product, you're collecting $150,000 and you're the company, it's your Receivable, you're responsible for collecting that $150,000.

Marcelo Torres   9:07
Yeah.
Uh-huh.
Yep.

Robert Kihm   9:23
but you owe the other company $50,000. And that's where the due to do froms are going to come.

Marcelo Torres   9:31
OK.
That's good. I'll have to redirect on that. I think I'm slightly off on that.

Robert Kihm   9:35
Yeah.
I think that is in the implementation. Like, again, you know, looking at this for that question, it's like the README master plan talks about the, you know, AR is the whole amount and then intercompany AP to each sister, but that's not what's in the code right now.

Marcelo Torres   9:55
Sorry, yeah, yeah.

Robert Kihm   9:57
Yeah, and that's and that's fine, so yeah.

Marcelo Torres   9:58
I think.
I probably got a little, I probably got a little mixed up with like just the order line being owned by a company and stuff like that, but good to clarify.

Robert Kihm   10:09
Yep.

Marcelo Torres   10:10
Um...

Robert Kihm   10:10
Yeah, when you think about it, like maybe this is helpful. So I think it's helpful in my mind is like this idea of ownership, like.
For us, it's going to be BCHQ, right? For a lot of these things where there's a multi-company involvement, like it's BCHQ, but BCHQ is. And so the order contract, all of these things, everybody's dealing with BCHQ. And let's just say like they've got Izzy, they've got Skip, they've got some symmetry stuff.

Marcelo Torres   10:23
Mhm.

Robert Kihm   10:39
They don't necessarily care about that, especially at the payment side of things and the contract. They want to deal with BCHQ. There's like, they want to write a single check and they're like, oh, I need to go talk to Izzy to get that money. I need to go talk to Skip to get that money. No, no, no, no. Like the whole purpose of this is

Marcelo Torres   10:45
Mmh.
Yeah.
Yeah.

Robert Kihm   10:58
BCHQ is making this really easy. You know, you just talk to us about this piece of it. Now, when you start getting into the implementation outside of the financial aspect of it, obviously they're going to be talking to the Izzy team, they're going to be talking to the Skip team, but from the contracts and order processing, you know, ARAP type of thing, it's all about providing one
company and one face to talk to. And so think about it that way. They own it. Therefore, they care about the $150,000. BCHQ is responsible for getting it. Betty's going to be like, hey, where's my money? But they're not going to go to the customer. Where's my money? It's BCHQ. It's like, hey, you owe us 50 grand. Where is it?

Marcelo Torres   11:20
Okay.
Right.
Yeah.

Robert Kihm   11:39
Especially, especially if they find out that the customer's paid it.

Marcelo Torres   11:43
Yeah.
Okay. I will make sure to honor that. And the same question kind of applies to sales tax. Like if, you know, if company A is selling company B's product, is company A responsible for remitting the taxes or do they just transfer the amount to company? Okay, cool. No. And then the second question here is exactly, I kind of mentioned this before.

Robert Kihm   11:58
Yes.
Yeah.

Marcelo Torres   12:05
or do we limit a products linked accounts to only be within that company? Like, I'm never able to say, oh, and this this will like.
Yeah.
This is, so to build like a special exception system might be down the line. I have, you'd have to go like edit the journal entries. I have no idea. I wouldn't build that into orders. But the question is just like, right now, a category doesn't really require anything. It just replaces a type of account.
But it doesn't split by the company level. If we want to do categories that have come like products from different companies, then we need to split at the company level. And maybe that's actually, so that's kind of an underlying question here is, do we want categories to be company specific?

Robert Kihm   12:58
Yes.

Marcelo Torres   12:59
Okay.

Robert Kihm   13:01
Categories, yeah, products.
Products need to be owned by a company. Product categories need to be owned by a company. You might be able to say there's like a, you know, this ability to inherit stuff, but I think generally, no, your product catalog is at the company level.

Marcelo Torres   13:08
Test.
Okay.
Yeah.
Good.

Robert Kihm   13:24
The the Accounting question is a really interesting one, so the account.

Marcelo Torres   13:29
Mm-hmm.

Robert Kihm   13:31
So I'm just trying to think through this right now and I don't know if the plan documents this.

Marcelo Torres   13:36
And.

Robert Kihm   13:38
But again, similar to the AR account and things like that, it's going to be based on the company that owns the order because like that's the receivables, right? The receivables is going into that.

Marcelo Torres   13:43
Yeah.
Yeah.

Robert Kihm   13:55
So, from a product standpoint, if Company A sells Company B's product.
What account are you putting?
the order journal entries in, and I'd have to say it's got to be company A has to have some tracking accounts for company B. And again, there would be this probably due to do from, you know, to actually transfer to say like, hey, you know, this, we're tracking it in company A, but company B is going to get

Marcelo Torres   14:14
Yeah, it's got to be companies.
Yeah.
Ohh.

Robert Kihm   14:30
some compensating entries because you know

Marcelo Torres   14:32
I think the question is.
I mean, the the real thing is like, does Company B take the deferred revenue entry, or do they both? I guess they both have to take a deferred revenue. Yeah.

Robert Kihm   14:43
Yeah, they both do like related to the do to do froms, yeah.

Marcelo Torres   14:47
Mhm.

Robert Kihm   14:48
Yep.

Marcelo Torres   14:49
Okay.
And okay, cool. And then so the product stays linked to its account.

Robert Kihm   14:52
So, I think, I think with that in mind, like...
You, you basically...
When you're creating the journal entries, like you're filtering by company for the accounts at product, product category, and then going up to the company that owns the order. And so if they haven't specified specific company accounts at the product level or the product category level, you're going back to the product account.

Marcelo Torres   15:03
Yeah.
Yeah.

Robert Kihm   15:21
at the company level, right? Company A, not Company B, but Company A, because Company A is the one who owns the order. But you could.

Marcelo Torres   15:23
Yeah.
Yeah.
Well, we still have to have...
Company B still has to have like its own accounts for the deferred revenue on its side.

Robert Kihm   15:36
Right.

Marcelo Torres   15:38
But yes, I see what you're saying. Well, it's my thinking that you'd never be able to, so like Company A is always going to receive the Accounts Receivable entry. And then all of the do-to-do forms will be created between Company A, which owns the order, right? And then Company B, C, D, whatever other companies on the order.

Robert Kihm   15:38
Yes.
The.
Yes.

Marcelo Torres   15:58
But it's going to be created against their revenue accounts or their Receivable accounts.
Actually, we create against there to do to do from, but the offset that with the deferred revenue be right.

Robert Kihm   16:12
So is due to do from only for?
AR.

Marcelo Torres   16:20
It's for any intercompany transaction, as I understand it.

Robert Kihm   16:23
Right.

Marcelo Torres   16:25
Ohh.

Robert Kihm   16:26
And so definitely, that's the payment, right? So like the AR, you know, is like AR in company A with a due to due from for the to company B to say like, hey, we owe you money. We're going to have to pay you money for this. So I get the ARAP type thing. Is that it? Is everything else?

Marcelo Torres   16:34
Madhav.
Yes.
Yeah.

Robert Kihm   16:50
at the product company level, right? Like the order line company.

Marcelo Torres   16:54
Well, it's interesting.
Because it's like if you do a subscription.
This company, company A tracks that subscription, obviously. So you just get forward data journal entries with do to do from and such to company B.
Um...
But I mean, the tricky part is, well, that's kind of an interesting question, because if company, like company A creates the order, it sells a subscription product from company B.
Now you could be like 2 to three years out if that product auto-renews. Company A is still tracking the subscription, but Company B is receiving these due to due from payments. But the tricky part is like, how does Company B in its books see that it has that recurring revenue? Because it's going to see it as revenue from B.

Robert Kihm   17:39
Bring.

Marcelo Torres   17:41
from like Company A.

Robert Kihm   17:42
Bring up the bring up the section of the plan that talks about due to do from and the intercompany transactions.

Marcelo Torres   17:48
Madhav.

Robert Kihm   17:53
You can certainly go into more detail with this with Amith this afternoon, but I need to refresh my memory about intercompany transactions. And if it's only AAPA and everything else, like the revenue and everything is back to the original company that owns the product.

Marcelo Torres   17:53
One moment, sorry.

Robert Kihm   18:12
This may be simpler.

Marcelo Torres   18:15
Mhm.

Robert Kihm   18:17
Because they're tracking the revenue against, it's Company B's revenue. It's not BCHQ's revenue. It's BCHQ's Receivable. And they're going to, and they have an AP entry that they have to pay Company B.

Marcelo Torres   18:31
Uh-huh.
And.
I'm not really, I don't actually know where this is in the plan.

Robert Kihm   18:58
OK.

Marcelo Torres   18:59
Um...
A lot of the intercompany stuff.
Good being here.
There we go. All right. So this is what I have under your company. Like, crucially, this is not in the original master plan.
Um...
There's.
There's this.
Schedule journal entries, maybe banner, so this, so this is this is where you happen in your company, actually, I'm sorry.

Robert Kihm   19:57
To do from payment generates all legs. So this is pointing me more towards ARAP.
Demons generates the intercompany balancing lags, order posts, each company's initial journal entry. Accounting does not generate, does not.

Marcelo Torres   20:14
It's overloaded, right?
It's handling cache and...
revenue. Well,

Robert Kihm   20:23
Plus the revenue part is the part I'm not sure about. Yes, the cash part, the AR and cash. I'm just not sure about the revenue piece.

Marcelo Torres   20:25
The revenue's confusing.
And that part is tricky because like...
You want?
This is almost a question for Jeremy: Do you want Company A to be recognizing revenue for a sale of Company B's product? Or do we want, like, how do we get both companies to recognize that revenue, or like, how do we handle that system?

Robert Kihm   20:49
Yeah, we don't want both companies to recognize the revenue, right? Like that would be double reporting. So I think it's all going to be under the company that owns the product. Like the $50,000 is $50,000 towards Betty over the year.

Marcelo Torres   20:53
Right, yeah, yeah.
Mhm.

Robert Kihm   21:04
And I think if that's the case, that simplifies this. So the do to do froms is really about the AP, excuse me, the AR, that then when the money gets received, and this is why it talks about payments in the payments system owning this.

Marcelo Torres   21:04
Right.
Uh-huh.

Robert Kihm   21:21
So, I'm just actually...

Marcelo Torres   21:22
Well, actually, that's the thing is I think due to do from...
Also has to handle cache, right? Because how do we handle cache transfers?

Robert Kihm   21:29
Right. Well, that's the balancing part of it. That's the AR. So, like, AR gets cancelled out when you get the cash, right? So, when the order gets created for $150,000, you get you have an AR, you know, Accounts Receivable, $150,000, so immediately that goes up.

Marcelo Torres   21:33
Okay, yeah, yeah.
Right. My bad. I'm sorry.

Robert Kihm   21:48
by $150,000. Like, oh, you know, I've got that much in there. You've received nothing yet. When the payment comes in for $150,000, that's where you go and say, okay, I've received $150,000 in cash.

Marcelo Torres   22:05
Mhm.

Robert Kihm   22:05
And then, and the balancing entry is out of AR. So AR, you know, goes down, right? And your cash goes up. And then, then you also have to say, but that $150,000 in cash isn't all mine. I get $100,000 of it. And then I owe, you know, Izzy.

Marcelo Torres   22:09
Yes.
Yeah.
Right.

Robert Kihm   22:25
the $50,000. So like that's where the due to do from comes in.

Marcelo Torres   22:29
And then you take the cache against the due to, and on the other side you take the due from against cache and you receive it. Okay, that makes sense.

Robert Kihm   22:35
Right. Because you're basically, you know, probably it's not all in the same bank account. So in a lot of cases, there's going to be a transfer of that $50,000 to the other company's bank account.

Marcelo Torres   22:47
Yeah.

Robert Kihm   22:49
Yeah, so this is ARAP. Yeah, so I have refreshed my memory on that. So the good news is like all the product account and their revenue accounts and things like that, all the other things other than like the AR and like cash account, those things, those things are at the company level and it's at the company that owns the product.

Marcelo Torres   22:49
Yeah, I think.
Oh.
Yeah.

Robert Kihm   23:11
So that order line for Company B, the revenue entries, the product account, things like that, all of that's going to be Company B's accounts.
It's the, and then when the, and so it's just the AR and then the do to do from for the AP account. That's all you need to worry about. So that does simplify things.

Marcelo Torres   23:23
Yes.
Mhm.
Yeah, but so let me just, because that was, let me make sure I understand this correctly. I just, if you let me restate it. The company that owns it, they handle their own revenue, and then they also do the due to do from, and like Company B would get an entry for due to do from, and then it would also get, it would mark that as like,
its own AR or whatever, but it would mark that against its own deferred revenue.

Robert Kihm   24:01
Repeat that part.

Marcelo Torres   24:02
Company A marks the deferred revenue for the products under Company A, and there's a due to do from, and Company B marks that against its deferred revenue for its own products.

Robert Kihm   24:12
No, so.

Marcelo Torres   24:13
Okay.

Robert Kihm   24:15
So, let's go back to the $100,000 in Company A, who owns the order, plus $50,000 in Company B for the one order line.

Marcelo Torres   24:20
Yes.
Test.

Robert Kihm   24:27
Your revenue slash deferred revenue is all going to be for $50,000 is going to be all under Company B in the Company B Accounts. Your $100,000 for the Company A product is going to be under Company A.

Marcelo Torres   24:43
Okay, so that confuses me because like the reason we chose to be able to override products accounts is like, let's say I want to have a physical items revenue account. Like it's, you know, now let's say like I have a product in company B, it's a physical item, so I overload its account. But

Robert Kihm   24:53
Yep.

Marcelo Torres   25:04
That account, that revenue account is never going to see revenue now, it was recognized in Company A.

Robert Kihm   25:09
It's not recognized in Company A. That's what I'm telling you. I'm telling you that...

Marcelo Torres   25:11
Okay, I'm okay. Okay. I'm sorry. I'm misunderstanding.

Robert Kihm   25:15
Yeah, that's okay. All I'm telling you is like the intra-company stuff that you care about is all AR and cash and this AP like to transfer the money between them. It literally is about the money, right? And that's it. So

Marcelo Torres   25:21
Uh-huh.
Uh-huh.
Yes.

Robert Kihm   25:33
Disconnect, so disconnected from revenue and the product Accounts. So that this is the and this is what simplifies things a lot. So again, yes, you're going to have $150,000 in AR that's owned by Company A. You're going to have

Marcelo Torres   25:36
Okay.

Robert Kihm   25:52
$100,000 that you get to keep, you're going to have $50,000 in the due to, like due to Betty is going to be $50,000. But all of the things for related to the Betty products that got sold for that $50,000, the product accounts and the revenue accounts are all Betty's.

Marcelo Torres   25:55
Mhm.
Yes.

Robert Kihm   26:12
So Betty's deferred revenue is going to go up by $50,000 across whatever accounts are on those products. And if it's deferred revenue, like you're going to have the scheduled transactions and all of those other things, the scheduled journal entries, all of that stuff is all under Company B's accounts, all under Betty's accounts.

Marcelo Torres   26:18
Well...

Robert Kihm   26:33
The only thing that's not is going to be that due to, due from in the sense that I got $150,000 in AR for company A. I'm going to get $150,000 at some point. And when I get that $150,000, I'm going to transfer that.

Marcelo Torres   26:43
Mhm.

Robert Kihm   26:53
back to Betty. But so the cash part of it is the important thing to say like, Betty, we owe you $50,000 and then Betty's going to get that $50,000 at some point. All of the rest of the stuff Betty already knows about in their accounts and is tracking it for the revenue accounts for the like the COGS accounts for product.

Marcelo Torres   27:14
Okay.
Okay, that makes sense. I think there's still...
Some some cases that, like...
Are a little bit interesting, like, like, um...
If company, if it's an instant revenue recognition, right, but we'll take the revenue against the due to due from, we won't recognize the revenue until the cash transfer on Company B's side.

Robert Kihm   27:44
No.
So revenue, so what I would say in your head is revenue has nothing to do with due to do from.

Marcelo Torres   27:46
Okay.
Okay, okay. I guess what I'm missing then is like, I'm on Company B's side. I have a due from entry. What is it balanced against?

Robert Kihm   28:07
So, when the...
So of the $150,000, when the $50,000 comes in, excuse me, when the order is created and the journal entries are created for the $150,000, your company A gets the full amount into the Accounts Receivable account.

Marcelo Torres   28:13
Uh-huh.
Yes.

Robert Kihm   28:30
And Accounts Receivable is an asset. So think about that. Like you are not worried that I can't record this revenue until I get the money for it.

Marcelo Torres   28:30
Mmh.
Yes.

Robert Kihm   28:41
It's a little bit more complicated than that in the sense of you shouldn't recognize the revenue until you fulfill the order. But let's just say it's instant fulfillment, digital product, right? You are taking this and yes, at the time. And let's say you're getting the cash a second later, right? Like you're getting the credit card payment. So

Marcelo Torres   28:47
Yeah.
Uh-huh.

Robert Kihm   29:01
But the way our system works is everything hits AR. So $150,000 in AR immediately. And let's say you immediately received the 150 or like second after you received the $150,000 payment. Like you hit AR, but then very quickly you took that money out of AR and you put it in cash.

Marcelo Torres   29:16
Uh-huh.
I.

Robert Kihm   29:23
right? Because, and that's a second journal entry, right? That's the payment side of things where it's like order entry doesn't care about the payment side at all. It doesn't care about the cash account or anything. Order entry cares about hitting AR. Payments is going to clear it out of AR and put it into cash. So even in an instant fulfillment situation, you are always hitting AR in orders.

Marcelo Torres   29:24
Mhm.

Robert Kihm   29:46
And, uh, and then you're just clearing it out almost immediately.

Marcelo Torres   29:46
So, so.
The thing that I'm having trouble with, and I wish I could, like, I wish I had a place I could draw, so I could show you this. Basically, so you have, so you start with Company A, it gets an order, 150 goes into its AR, that's an asset. Now it's going to have a liability that's offsetting that, a due to liability of 50,000 to Company B.

Robert Kihm   29:57
This is.
Mhm.
Help.

Marcelo Torres   30:13
And that liability is going to offset against AR.
Right, or I guess it offsets.
This might be, this is probably Jeremy question, probably in a Jeremy territory here, but like...

Robert Kihm   30:26
So, you're so...

Marcelo Torres   30:28
So the question I'm having is like on Company B's side, its asset is going to be the due from. That's A $50,000 asset. Unless that asset is offset against the liability, and then there's a separate entry to give it AR and revenue, then that asset has to offset against revenue.

Robert Kihm   30:45
So, so Betty's gonna have an intercompany A.R. entry for 50K.
And DCHQ, as the company A, is going to have the offsetting AP entry.
As the do too, so like...

Marcelo Torres   31:00
What is AP is?

Robert Kihm   31:03
Accounts Payable.

Marcelo Torres   31:04
Okay, yes, yes.

Robert Kihm   31:05
So we owe, so of the $150,000 that hit our Accounts Receivable in Company A, we are going to have also an entry for AP for $50,000 to Betty, and then Betty's going to have a $50,000 AR that's due from.

Marcelo Torres   31:13
Hello.
50,000 AP, okay.

Robert Kihm   31:24
DCHQ.

Marcelo Torres   31:25
Okay, so that's the question. So Betty has an actual, it's an account called Due from BCHQ, right? That account's going to say 50,000.

Robert Kihm   31:31
Yep.
Yep.
Yes.

Marcelo Torres   31:35
then what's on the other side of that line is the thing that's confusing me because I don't know what goes there. And you're saying they're also going to have an intercompany AR account that they're going to put against revenue.
and what's missing for me.

Robert Kihm   31:48
Don't think so, so just do not talk about revenue right now; we're talking about AR and cash.

Marcelo Torres   31:53
Okay, okay, so they have their they have their due from entry on the Betty side. What is on the other side of that line? What's the offsetting?

Robert Kihm   31:59
Right.
That do from that do from is the AR.

Marcelo Torres   32:04
Yes, OK.

Robert Kihm   32:04
So due from is Accounts Receivable. Betty, Betty has a $50,000 in Accounts Receivable that is due from BCHQ.

Marcelo Torres   32:15
Okay, I understand.

Robert Kihm   32:15
BCHQ has a due 2 for $50,000 to an AP account to Betty. So that's the balance.

Marcelo Torres   32:19
Against their AAPA.
What is Betty's? What is Betty taking that due from account against?
Like, what's the what's the what's the liability that's getting picked up there?

Robert Kihm   32:35
Betty doesn't have a liability on that.

Marcelo Torres   32:38
Well, yeah, the due from is a $50,000 asset, right?

Robert Kihm   32:41
Right.

Marcelo Torres   32:42
So there's got to be an offsetting $50,000 liability.

Robert Kihm   32:42
The.
Right, and that liability is on the is on the BCHQ side.

Marcelo Torres   32:46
That's.
What?

Robert Kihm   32:53
Because BCH BCHQ owes that money.

Marcelo Torres   32:58
No, no, no, no. Well, okay, I'm sorry. I must be misunderstanding here. If Betty has a $50,000 asset due from, with no offsetting liability, their books will be on balance. In my mind, the offsetting liability has to be deferred revenue or some kind of revenue account.

Robert Kihm   33:05
Right.
Right, so that intercompany AR for Betty, there is going to be a deferred revenue because the product or Betty, the company has that. So yes, and if it's an immediate deferral, then it's a sales account, it's a revenue account, it doesn't have to be deferred revenue. So yes, you're correct on that.

Marcelo Torres   33:18
Mhm.
Okay.
Okay.
You have the AP, and you're going to have the AR in the main company, Company A, and then you're going to have AP and the due to.
And then a company B, you're going to have the due from and some kind of revenue account. And then this is okay.

Robert Kihm   33:48
Right, so 150,000, so BCHQ or Company A, $150,000 in AR.

Marcelo Torres   33:52
Got it now.

Robert Kihm   33:55
$100,000 of that is revenue in that account, right? So $100,000, $50,000 remaining is going to be the intercompany due to Betty. So there's that, that's all balanced, right? And then on the Betty side, you're going to have the intercompany AR due from.

Marcelo Torres   34:00
Mhm.
Yep.

Robert Kihm   34:16
Right? So due from BCHQ, $50,000. And then if it's deferred revenue, then you'll have the deferred revenue account. If it's immediate fulfillment, then it could be the whatever revenue account set up on the product, product category, or Betty, the company.

Marcelo Torres   34:33
Yeah, OK. I understand that I that I got it written down because it's just that's important to know because when I when I write the order creation system, it's got to do that. It's got to do it correctly.

Robert Kihm   34:42
Yep.
Yep.

Marcelo Torres   34:45
Okay.
Cool. Thank you for taking the time. I'm sorry.

Robert Kihm   34:49
And that, and that, and the good news about that is, again, you don't have to worry about, like...

Marcelo Torres   34:52
Mhm.

Robert Kihm   34:55
$50,000 in BCHQ related to revenue that we're tracking, that then we're transferring that revenue over to another business that you don't need to worry about. The only thing that's really doing the transfers is really this AAPA thing, and so that simplifies things a lot, so that, and it also.

Marcelo Torres   35:09
Yeah.

Robert Kihm   35:14
simplifies things on the journal entry creation because you're creating those Betty journal entries, you know, to say like, you don't like there doesn't need to be a, hey, BCHQ is selling a Betty product, so there needs to be a product count in BCHQ related to that Betty product that then gets transferred at some point over to.
You know, Betty and its product account, it's like, no, at the time that you're creating the order with that Betty product on there, the Betty product is getting, that's the account that's being used.

Marcelo Torres   35:42
Mhm.
Yeah.
All right. I have some...

Robert Kihm   35:51
And Ian said is exploding right now.

Marcelo Torres   35:55
Yeah, I know. I feel for them. I got, we were already overtime.

Robert Kihm   36:00
Like, and I thought Izzy secure messaging was difficult and ticketing.

Ian Zygmunt   36:05
Yeah, yeah, this accounting thing is a whole other level.

Marcelo Torres   36:07
Ohh.
We're already over time. I have this external expectations doc, which is kind of a compiled list of what I believe are the expectations, or well, to be honest, what Claude believes are the expectations. I can give it a better review. I've shared that with you guys. If you'd like, I can run it through here. I think the biggest thing is just on Jeremy's side, standardizing.

Robert Kihm   36:22
Uh huh.
So that's in that zip file.
Okay.
Okay.

Marcelo Torres   36:47
And I've also got a roadmap in there. Now that probably could change.
And, um...
Yeah, just give it to Claude. It'll be able to go through and do the rest of the review. I think the most complicated stuff is what we talked about today, and I appreciate you taking the time to do that.

Robert Kihm   37:05
LM.

Marcelo Torres   37:05
This is a, this is a fun one.

Robert Kihm   37:08
Yeah, I'll...
I haven't done a deep dive on this, but I'm going to, I'll share what Claude came up from the review when I asked it, and then I'll also share the piece where I talked about the D2D froms and the intercompanies. And I think there's a pretty...

Marcelo Torres   37:20
Uh-huh.
The.

Robert Kihm   37:30
illustrative example in here. If you want to take a look at this and just confirm where you need me to dig in more, we can do that. And then, yeah, let's do that. And then I think meeting with Amith will be illuminating for you too. But

Marcelo Torres   37:32
Mhm.
Yes, I can do that.

Robert Kihm   37:49
Making progress on this.

Marcelo Torres   37:51
Yeah, I think...
It's just something that like I let kind of get in my way a little bit too much of it is just like it's getting scared of not knowing what to do. It's just tricky, man. I mean, like...

Robert Kihm   38:01
Uh huh.

Marcelo Torres   38:05
I'm afraid to develop ahead and then have to come back, but I think that's just something I'm gonna have to, I gotta accept. Like, well, that's life.

Robert Kihm   38:10
Yeah, just all I can say is just keep repeating to yourself, it's okay, right? And just like, it's okay to do it wrong because it's going to show us like, oh yeah, that's not right at all. It's like, fix that up. But again, remember, Claude's writing the code. Claude can be the one that gets mad at you. Like, I just, I gave you the answer and now you're telling me it's wrong. It's like,

Marcelo Torres   38:14
Yes.
Yeah.

Robert Kihm   38:32
You're not the person who has to be offended by it.

Marcelo Torres   38:36
Yeah.

Robert Kihm   38:37
And it's like, you know, and again, part of this is going to be your learning process too, or you're like, you know, and you're already doing it. It's like, well, this doesn't look right, or this hasn't clear in my head. And it could be that we just need to be better at explaining it, or it could be that you've actually uncovered a real hole.

Marcelo Torres   38:49
Mhm.
Got me.

Robert Kihm   38:58
And so like this, that's part of this process.

Marcelo Torres   39:02
Yeah, it's just this is like a big thing to plan. I don't think the explanation is the issue. I think the truth is there's so much depth here that you can't explain it all in one go. You can't get it all off the front. It's just so much. Yeah.

Robert Kihm   39:14
That's very true. Yeah. And that's, yeah, no, no arguments there.

Marcelo Torres   39:22
All right.

Robert Kihm   39:24
All right, I'll put this together and share it with you and you take a look at it and let me know if there's something else you need from me. And then hopefully Amith will get you some more of this stuff. And yeah, just, you know, keep building and like basically get to the point where you're creating journal entries, like creating these orders and having it create these journal entries with these scenarios we're talking about.

Marcelo Torres   39:31
OK.
Yeah.

Robert Kihm   39:45
And it's like, you know, it'll probably be like, hey, you've got an unbalanced transaction, or hey, something's, you know, missing here. But that'll be illuminating.

Marcelo Torres   39:55
Yeah, and one thing I want to like re-emphasize too is I said those packets and like, like I said, like, and you've just put me here and I will go and tell you what I like review on. Always, always, always feel free to like tell me like, hey Marcelo, this is like, this is ****. Basically like stop doing this because I do feel uncomfortable about it and I just want to make sure.
you don't feel like you're getting a bunch of docs to review with no real.
You don't feel like...
I'm just throwing stuff on you, basically. That is not the goal.

Robert Kihm   40:25
Yeah, I'm okay with it right now. The only, you know, feedback I have for you is like, yeah, I know you meant to send that earlier. So like having it last night, you know, to know ahead of this meeting would have been helpful. But again, this was still a productive meeting and we were able to get through it. Like I had it a few minutes ahead of time so I could start it running on these things.

Marcelo Torres   40:33
Yeah, yeah.

Robert Kihm   40:44
So it was still helpful, but yeah, a little bit earlier would have been better.

Marcelo Torres   40:49
Okay, yeah, I'll have it in advance every time.

Robert Kihm   40:52
Cool.
Alright, thanks.

Marcelo Torres   40:56
All right. Thank you very much, Robert. I appreciate it.

Robert Kihm   40:57
But.
You're welcome.

Marcelo Torres stopped transcription
