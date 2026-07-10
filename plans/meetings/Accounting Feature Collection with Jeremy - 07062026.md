Accounting Feature Collection Meeting-20260710_130930-Meeting Transcript
July 10, 2026, 6:09PM
19m 18s

Marcelo Torres started transcription

Jeremy Hunnewell   0:03
get a payment, we have to apply that payment to that customer account in order to offset the accounts receivable. You could just book it directly to accounts receivable, but then you're never have you.
Um...
It's not as good, right? Because now I can do, right now within Business Central, I can run an aging on my open Accounts Receivable and I can see which customers owe me how much money. If I don't book it properly, if I do book the invoice to that customer, but I just book the receipt back generically without applying it to that customer, it looks like that customer has a $0 balance, but also that they owe me.
Seventy-six dollars, right? Like, depending on net there, or my AR would be net is proper, but it looks like that customer owes me seventy-six dollars, so...

Marcelo Torres   0:40
Yeah.
So, so, basically, you're I'm sorry.

Jeremy Hunnewell   0:48
Yeah, I think, go ahead.

Marcelo Torres   0:50
Your concern is like Business Central won't have the customer's information to be able to say, here's what each customer owns if we do this batching.

Jeremy Hunnewell   1:01
I think that, so I want to make sure that the batching doesn't lose that $76 of AR, depending on how it gets transmitted, it's not $76 of AR, it's $22 of AR for customer A and $30 of AR for customer B, right? That we don't lose the...
the customer component of that in the transaction, in which case I don't know if it's the same thing, maybe it's no longer a batch. Maybe we just need the individual transactions.
Or maybe we don't need Business Central to have that level of detail. Maybe it just needs to be, you know, we are shifting away from Business Central as sort of the source of truth for some of this data. So if AR is being managed elsewhere, if you just have a net AR number that we have the breakdown somewhere else, I don't need it to exist in both places.

Marcelo Torres   1:42
Well...
Well, we definitely do want Business Central to be, Business Central is the final source of truth. Like if this data were to be lost, your records in Business Central should be correct. Now, do they keep the same data fidelity? No. But so this idea of splitting them up by customer, that's not impossible, actually. It might require a little bit of looking in this schema. I'd have to go see if that's actually like.
enabled today and it would be pretty easy to enable or if not. But the goal with these batches, and I know it doesn't really show up here because you only have one company, but the goal with these batches is we would split it up by company, obviously. We're going to split it up by account. We're going to split it up by dimension.
Splitting up by customer wouldn't be impossible. And when I say split up, I mean, this is all treated as one batch of journal entries on the our side, the accounting like biz app side. But when it gets sent to the general ledger, it's going to be sent as a bunch of separate entries that happen at one time.
Um...

Jeremy Hunnewell   2:51
Okay, so Business Central is going to need to maintain and part of our project is to make sure that it maintains the same level of detail that it effectively always has. It's just the data flow is changing.

Marcelo Torres   3:04
I, you know, I can't answer that on what Amith's intentions were. I can tell you, like, like, you know, if you kind of work with me for a second, you are the customer, right? Like, BC Accounting and other accounting in our sort of set of companies is the first customer, and we want our customer to use our product.

Jeremy Hunnewell   3:08
Yeah.

Marcelo Torres   3:24
So if you're telling me, hey, I have customers in BC, I really like that functionality, enables a bunch of other stuff I can integrate with it, and that's something that matters to you, then that's like you're the customer, you know what I mean?

Jeremy Hunnewell   3:37
So I hear you, I hear you. What I'm saying though, and I think maybe as we work more together, this will become clear, is that the reason I care is so that I can get a detailed report of who still owes me money. And that doesn't have to come out of Business Central, right? That has to come from somewhere.

Marcelo Torres   3:45
About.
Right.
Yeah.

Jeremy Hunnewell   3:57
So I'm more concerned with the output than the fact that it's in Business Central. I, yeah.

Marcelo Torres   4:01
Okay, so...
We'll handle that in payments. In the order system, we're going to create a payment system. And so the order system will track, hey, what company or what person bought this? Who is the customer? Obviously, it doesn't right now. I'm working on it. But who is the customer? That will be tracked on the order side of things.
There are concerns though with that. So it's like...
Basically, all of these things, you know, Business Central we can trust because it's Microsoft, we're never losing that data. When you start moving it into these apps, it becomes very important that you maintain this data. So like, you know, like now, I mean, if we have a journal entries on our accounting app like this,
That's gap records, and, like, I don't know what rules we need to follow for that, but it'd be good to know that too, because, like, if I tell you I can assume the responsibility of something, but we don't actually have the reliability.

Jeremy Hunnewell   4:49
Yeah.
Yeah, OK. So, so in just so I know Amith is big on batching. I don't know exactly know why he's big on batching, but he, he, we had a lot of conversations about batching.

Marcelo Torres   5:12
Uh-huh.

Jeremy Hunnewell   5:13
I have gotten away from batching in some instances, for example, with Concur, right, our expense reporting module or process system. I used to say, okay, Betty bought spent $10,000 on

Marcelo Torres   5:26
Okay.
Yeah.

Jeremy Hunnewell   5:33
It got reimbursed $10,000, employees got reimbursed $10,000 for travel in April. And then the problem was that the business was coming back and like, well, what did we spend it on? And I'd have to go to some secondary system, I'd have to like pull a report, I'd have to go get a spreadsheet, and I'd have to be able to tell. I think, I mean, I think we're giving, again, what I care about is giving my customers, right, the Betty Bot management.

Marcelo Torres   5:52
Right.

Jeremy Hunnewell   5:58
the users of the consumers of this information, the visibility to the detail that they need to manage their business. And how I'm currently solving that is with detail in Business Central because I have Power BI reporting, pulling that data into something that can be shared. If
or when I know that the goal is to get more of a financial planning and analysis layer on top of all this. So if Betty bought managers can go over there and look and see what.
where they sent their cash and what the, why, right, then that's great. I don't need it to be in Business Central. I do need the total to be in Business Central. I need the Business Central to be accurate, but if I run a P&L or a balance sheet, I need that to be accurate, but I don't necessarily need the detail. As long as it's relatively easy to get and
you know, to your point, reliable and persistent.
Um...
So, I don't know, and and ran right, just uh, yeah.

Marcelo Torres   7:00
Yeah.
The one thing that might be useful, and I don't want to give you more work, yeah, is to have some kind of list of the things that you want to be able to create. I wish I could like not ask you for that. I just don't know what you actually are doing.

Jeremy Hunnewell   7:07
Hmm.
No.
Yeah.

Marcelo Torres   7:23
And I mean, if you just send me a bunch of examples of reports, that's great. I can feed those to Claude. It can tell me, here's what it's pulling. Like, it's not, it doesn't necessarily need to be a big time commitment from you. But I do, I do not know, like, you know, when you're talking about a P&L statement or where is the money going to, where is it being spent.
Obviously, we're kind of an AR only system and orders and payments and AR handling system, but like...

Jeremy Hunnewell   7:46
Yeah.

Marcelo Torres   7:50
You know, one of the things the system is meant to have is dimensions so we can see what product was making this much money, what product was making that. So the dimension is kind of meant to sub.

Jeremy Hunnewell   7:57
Hi.

Marcelo Torres   8:05
Wow, what's the word? Substitute for those kind of...
Like if you want to be able to say a customer.
did this. That's kind of a dimension on the data, right? It's another way that you want to divide and split the data.

Jeremy Hunnewell   8:18
Mhm.

Marcelo Torres   8:21
And I think the idea is to make that kind of system configurable.
Um...
The trick is like...
You get to a point where you're almost just creating something that was already there.
And I kind of think that's what Amith wants. I'm not going to lie. I can't really tell.

Jeremy Hunnewell   8:46
Yeah, so, so I think I mean Amith has a vision and he knows the requirements and he he sees a lot of the reports, so I I'm not worried about us getting there eventually. I I am worried, not worried, I just want to make sure we're aligned in terms of.

Marcelo Torres   8:47
That.
Okay.

Jeremy Hunnewell   9:04
Really, where does the detail live is the question, right? Do we need that detail in business central? And I don't think we do as long as eventually we can get to the point where if I need the detail, it's not like...

Marcelo Torres   9:07
Yes.

Jeremy Hunnewell   9:18
Twelve steps into, like, some, you know, shared drive subfolder with an Excel report, right? Hopefully, it's like, and I, if it's all in the AIDP or whatever we're calling it these days, then we should be able to, I could always spin up a report or ask Skip or Claude or something, right?

Marcelo Torres   9:36
Yeah.
Well, how long? I mean, the real question out of curiosity is how long it takes you to make a report right now, right? Because, like, if it takes you, you know, a minute, we don't want to increase that to five or 10 with skip.
Use Power BI for that.

Jeremy Hunnewell   10:09
No, not if I can help it. Power BI is pretty fragile, but there's it's also one thing that it's currently our best solution for is.

Marcelo Torres   10:10
Okay.

Jeremy Hunnewell   10:19
consolidated reporting because we have so many entities that instead of going into Business Central and pulling them one by one and trying to switch them together, Power BI is currently the platform I can go to and just, you know, click on different entities up at the top and say which ones I want included or excluded.

Marcelo Torres   10:27
Mm-hmm.

Jeremy Hunnewell   10:39
and I can have a consolidated view.

Marcelo Torres   10:39
See you both.
You build the reports manually.

Jeremy Hunnewell   10:44
Somebody did. I, these Power BI reports were here when I got here. Business Central has some reporting, but it's very clunky and you need to update it. Like if you, I just added a new general ledger account because we're opening some new cash accounts within bill.com. More info than you need, but we have, we are, and so I need a new general ledger account.

Marcelo Torres   10:48
Okay.
That's probably good to know.

Jeremy Hunnewell   11:05
And I know I haven't done it yet because it's a pain in the ****. I have to go into Jude's each instance and I have to say, hey, Rasa, hey, Betty Bot, hey, Blue Cypress, when you generate a balance sheet, also include this new account that wasn't previously on your list.
Power BI is better than that. Power BI looks for a type of account and pulls everything, then it grabs like the number. So Power BI is decent at that.
So, I...
Yeah.

Marcelo Torres   11:40
So your biggest day-to-day thing as far as the accounting system is, is the data accurate? Is it up to date? And can I easily make reports on it?

Jeremy Hunnewell   11:41
Yeah.
Um...
Hey, I'm hesitating because I don't often say, hey, I need some new reports. I need visibility. What I need is to making sure we have good visibility to good data.

Marcelo Torres   12:00
Well, when you say make a report, you don't mean like, in my mind, I'm thinking, okay, a document comes out and when you need to update that document, you can make another one. But to me, it sounds like a report in your mind is like a view.

Jeremy Hunnewell   12:12
It depends. It depends. There are some things that are generated in like Excel exports. There are some things that we are, I'm working with Claude to pull from different sources and generating a PowerPoint. And all, yeah, these things should be views in a system, but today they're for those things.

Marcelo Torres   12:16
OK.
Okay.

Jeremy Hunnewell   12:32
But I also know that your focus, I mean, that's like an aggregation of expenses and revenue and cash and invoicing and Accounts Receivable and and and right. And so we're trying, we're pulling a lot of different threads. And so I don't want to.
Go too far beyond the scope of what we're trying to guys, what I understand we're trying to accomplish with the orders module.

Marcelo Torres   12:55
Yeah, well, I mean, I mean, so I think what we need to know then is...
For now, at least. I think reporting and visibility being in this system, that's a good goal, but it's not going to be happening super soon. So for now, the thing I need to know is I'm going to be batching this data to you. That's the way I've been told to do it. But the dimensions that I use for those batches.

Jeremy Hunnewell   13:16
Yep.

Marcelo Torres   13:19
are up to me and up to you. So if you have like, and by dimension, it means like, all right, no dimensions is like you get a single journal entry for each account. It doesn't tell you what company it's for. It doesn't tell you like what product it's associated with. It doesn't tell you any of that.
right? But we automatically do split those journal entries up by their company and their account, which is obvious. But the dimensions are up to you. So if you want to say like, okay, I need the product, I need the customer, I need like those specific things that you need the journal entries for, like divided by that data you need, let me know that and then I'll make sure that gets in there.

Jeremy Hunnewell   13:55
Okay.

Marcelo Torres   13:58
And then we'll update down the line when we have like a feeling of converting over. I almost feel like we never will because, you know, like this is just the account receivable. You've got a bunch of other accounts to manage that aren't AR or revenue or deferred revenue. And you probably want to be able to create general expense reports.

Jeremy Hunnewell   13:59
Yeah.
Ha.

Marcelo Torres   14:18
And general, you know, income reports and that kind of stuff, and drill down that data.

Jeremy Hunnewell   14:24
Yeah, there's always in the more capabilities we have, the more data or the more reporting I'm going to want and the more different slices I'm going to want.

Marcelo Torres   14:30
Yeah.

Jeremy Hunnewell   14:32
Something we are doing in Business Central relatively recently is using some of those dimensions to do things like
Um...
Was this invoice a renewal invoice or was this a new sale? Or at Sidecar, we have a conference we put on in November called Digital Now.
And so, as opposed to, you know, and this could be a product, I suppose, but right, we do ticket sales or sponsorships, and we have expenses, and that's more where, like, if I put a deposit down on a hotel, I would like to know that that's for digital now, so that if I want to be able to run a report to say how...

Marcelo Torres   14:58
Uh-huh.

Jeremy Hunnewell   15:14
What's our digital now piano, right? I want to just look at the performance of digital now. And so that would be a dimension that...

Marcelo Torres   15:17
Okay.

Jeremy Hunnewell   15:23
Is not, I don't know if we're great at using them all the time. I don't know. I think, even depending on who's doing the the the entry, it it may it may matter.

Marcelo Torres   15:30
Uh-huh.
One of the nice things here is we can create default dimensions for products, which can be a useful, that can be a place of value for you if we know which dimensions we need to manage on my side.

Jeremy Hunnewell   15:47
Yeah.
Sometimes that's an evolving list, but...

Marcelo Torres   15:53
Well, so let's take like a...
So we know we're dealing with orders, right?
Um...
So the stuff I'm going to be giving you is going to be your deferred revenue, revenues, accounts receivable, and intercompany balancing actions. That's like the biggest kind of categories of stuff I'm going to give you.

Jeremy Hunnewell   16:16
Say it one more time.

Marcelo Torres   16:16
Because I'm only handling someone, I'm only handling someone by something, right? So the biggest things I'm touching are going to be accounts receivable, deferred revenue, revenue, and intercompany balancing transactions, that kind of stuff. Because when we get to payments, someone might pay one company, but payments is going to say, okay, no, this isn't right. It needs to go here, you know?

Jeremy Hunnewell   16:20
Yep.
Yeah.

Marcelo Torres   16:38
Um, and I mean, I mean, I can pull my chart of accounts here.

Jeremy Hunnewell   16:38
In Youngberg.
Your distinction is.

Marcelo Torres   16:42
Let's see.

Jeremy Hunnewell   16:48
Revenue and versus deferred revenue is based on the products, right? Whether it goes to A or B.

Marcelo Torres   16:53
It's.
Yes, it's based on the product. And we also have an opportunity to do scheduled revenue realization. So like for a subscription, like a one year purchase, or we would schedule out a month by month.

Jeremy Hunnewell   17:06
Okay, so that was my next question. Is it just about booking it to deferred revenue or are you also doing them the general, the monthly entry to recognize the proper portion out of deferred revenue?

Marcelo Torres   17:17
We're supposed to handle that as well.

Jeremy Hunnewell   17:20
Okay.

Marcelo Torres   17:22
Which?
I mean, we have an idea for how to do it, but how to make that entry clean for a person who's doing the products, you know, how to hook that data to their product. I'm still working on that.
But what it's, okay, so what it's sounding like to me is the data that you want me to kind of hook to a product, and we don't even need to call it dimensions. You want the customer.
And.
Obviously, you need the product itself, like the journal entry for that product should tell you what product it is, who bought it.
We already have the company in there, and the account is inherent to a journal entry.
Is there anything else that you specifically want me to kind of give you as other sort of, like our default is just company and account, so other data on top of that.

Jeremy Hunnewell   18:26
It's, yeah, hard to know what isn't right. It's hard for me to see what isn't there, maybe. Um, I know that's a good question. Um.

Marcelo Torres   18:30
Of course.

Jeremy Hunnewell   18:39
I can't think of anything right now, yeah.

Marcelo Torres   18:40
I mean, if you can, if you, if you need it, if you can open your system and see it, that's that'd be great. I don't know if I don't know what your system looks like. I don't know if it's something you can actually pull.

Jeremy Hunnewell   18:48
Yeah, so.

Marcelo Torres   18:51
This is basically just columns in a table we're talking about here.

Jeremy Hunnewell   18:54
Yeah, yeah.

Marcelo Torres   18:55
On.

Jeremy Hunnewell   18:56
So I can share this is.

Marcelo Torres   18:59
Yeah, that'd be great.

Jeremy Hunnewell   19:03
Um...
This is our, this is Betty Bob, and we're looking at a list of posted sales invoices.

Marcelo Torres   19:07
OK, set.
