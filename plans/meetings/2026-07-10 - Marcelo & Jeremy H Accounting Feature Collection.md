> ✅ PROCESSED 2026-07-10 → distilled into `2026-07-10-decisions.md` (accounting + orders companion). See `_PROCESSED.md`.

Accounting Feature Collection Meeting-20260710_132842-Meeting Recording
July 10, 2026, 6:28PM
34m 2s

Jeremy Hunnewell   0:04
And so be using Voice of 10.

Marcelo Torres   0:05
Oh shoot, wait, actually, hold on. I'm sorry, I started a recording, but maybe I should...
Just.

Jeremy Hunnewell   0:11
Person.

Marcelo Torres   0:12
OK, yeah, just let me come back and use the AACSB valuable.

Jeremy Hunnewell   0:15
Yeah, yeah. And if you ever, I mean, I give to an export or we can do this as many times as you need or want. So this is just a, this is 1 view, but we'll zoom into one minute, but it has.

Marcelo Torres   0:15
Okay.
Yeah.

Jeremy Hunnewell   0:29
A number, and this is a little bit funky here. Well, let's zoom in. We send our invoices to the customer via bill.com.

Marcelo Torres   0:39
On.

Jeremy Hunnewell   0:40
That bill.com sync requires that an invoice have
An external seeing it here, zoom out now, um.
Oh.
What's going on with this?
Is that too small?

Marcelo Torres   1:13
An external document number.

Jeremy Hunnewell   1:15
Yeah, do you see X?

Marcelo Torres   1:17
I can see it behind it, but I can't see.

Jeremy Hunnewell   1:19
Yeah, I don't know why I saw it on the screen. I'll show it, maybe we can do another one I can make. So if you don't, when you're, my computer does not like me screen sharing, that's probably part of the problem right now.

Marcelo Torres   1:21
Right back to.
But.
Sorry.

Jeremy Hunnewell   1:33
Posting dates important, due date is important. Now, this is on an invoice, which is, I guess, basically the same thing as an order, just it's the document version of it.

Marcelo Torres   1:42
Yeah.

Jeremy Hunnewell   1:46
Customer.
some identifier, right? And in this case I have two identifiers. And the reason I have two identifiers is because of bill.com. If it doesn't have an external document number, it won't sync to bill.com.

Marcelo Torres   1:51
Weir.
Okay.

Jeremy Hunnewell   2:02
We currently have a system that when you draft an invoice, it has one numbering system.
And that's sequential. And when you post it, it gets a new number, which is sequential among the posted invoices. And I believe the reason there is that you could have like drafts and cancellations and you could reverse or delete things before they're posted without breaking the sequential order on your.

Marcelo Torres   2:19
Mmh.

Jeremy Hunnewell   2:31
your posted invoices. That's not something that we use as a control. Maybe it should be, but we have a great variety of invoice number nomenclature. I mean, you can just see over here this external document number in the background, right? So some of this is because we were working with Ari and Sohan to develop some automation.

Marcelo Torres   2:39
And something.
Mhm.

Jeremy Hunnewell   2:50
And so they we developed some the code here, ISPE is probably related to the customer name. Betty Bott is the company, the date, AUD for Australian dollars, right? So we have, we were embedding some.
indicators in the name and other times that we made it in our system and right it was 102422 and so this is the 422nd invoice that was drafted in our right before being posted and then it converted to from a 102 number to a 103 number or maybe it's a 100 and.
1400 and 20 seconds. And yeah, anyway, this is not now on, they're on different numbering sequences. So the external number is this 103478, and I can't see right off where this 2611 is. Anyway, so they have, they need an external document number. It could absolutely be the same as the document number.
But if the data, I don't know how the data flow is going to work. If orders get pushed to Business Central, then get pushed to Bill.com, they will need that external document number.
They don't need to. We could push directly to bill.com, presumably from whatever systems we have.

Marcelo Torres   4:07
Yeah, I imagine.

Jeremy Hunnewell   4:07
Um...

Marcelo Torres   4:09
Wait, oh, this is interesting.
You're saying if we're using Bill.com to create invoices.

Jeremy Hunnewell   4:17
Not to create them, I just send them.

Marcelo Torres   4:17
When the order comes.
Send them.
But...
That actually, that actually adds some significant.

Jeremy Hunnewell   4:27
I don't know if we are right, 'cause the...

Marcelo Torres   4:28
Because if we're batching journal entries, you're not going to be able to send an invoice from your side.

Jeremy Hunnewell   4:32
Yeah.
But you might be able to...
Send the data to bill.com directly, right? There's APIs, there's we may not need to sync via.

Marcelo Torres   4:42
Yeah.

Jeremy Hunnewell   4:45
Is essential.

Marcelo Torres   4:47
But at that point, I would then have to handle on the orders, sending the bill.com invoice, and then we have the thing of like, now you need to use orders to manage that.

Jeremy Hunnewell   4:59
Yeah, somehow we need to get an invoice to the customer, right? So at the end of the day, if we don't get that invoice to that customer, they're not going to pay us. And so whether that's via Business Central or direct to Bill.com, we could find another solution for sending invoices, but Bill.com does a lot of other things for us, and we're actually moving more of our...

Marcelo Torres   5:00
instead of having it all in one place.

Jeremy Hunnewell   5:19
Finance stack to Bill.com, probably. We're testing out the Bill Cash account I mentioned. We're testing out them for time and expense, not time, but expense reporting.

Marcelo Torres   5:22
Mhm.

Jeremy Hunnewell   5:30
I need to make sure the APIs are available because our current bank does not have good APIs. We were going to have a tough time getting timely cash information out, which was the impetus for this exploration of other options.
So maybe put a pin in how we actually generate the invoice for a second. Other things we need, posting date, because that's when it lands on our books, right? That generates the AR as of 77. This could be back in time, this could be in the future. That decides when the AR becomes AR.
Due date is on the invoice and hopefully is what we get paid by. And is also a, you know, something we measure against. We have a weekly AR process where we're
Sending overdue invoice data to business leaders, let them know what the status is, and we, you know, it triggers our follow-up.

Marcelo Torres   6:31
Hold on.

Jeremy Hunnewell   6:36
This is a renewal because we invoice the posting date is so far before the due date. We are invoicing renewals 3 months generally. Cimatri may be different. They may be business by business nuances, but for Betty bought where we are here, we are invoicing three months ahead of renewal.
Sometimes we get paid way ahead of the renewal, which is why we do it, so we can get their cash.
Ohh.

Marcelo Torres   7:01
Yeah.

Jeremy Hunnewell   7:03
We've got the account number. This could be controlled by a product and in the AISDR.
When we build the contract or right, we we we don't enter a contract, we don't enter a GL number, we are entering a product, in this case, Betty Box SAS Knowledge Assistant. This is a subscription, so this is a...

Marcelo Torres   7:21
The.
You build, you do this in the AI DV already.

Jeremy Hunnewell   7:28
All contracts exist in the AIDP. Yeah, so.

Marcelo Torres   7:32
How do you create them?

Jeremy Hunnewell   7:35
We have some cloud stuff. We have the contract automation that Ari and built and so on manages, or we can go in and manually do it. There's a contracts module.
Um...

Marcelo Torres   7:47
Why? I didn't even know what told me about this. I didn't even know you guys were doing it. That's like half of what we need to do for order is probably much better build.

Jeremy Hunnewell   7:50
Yeah.
Um...
Yeah, well, we might not. I think there, there's been just some discussion of rebuilding it because of reasons that I didn't fully comprehend, but Robert and Amith kind of nodded.

Marcelo Torres   8:10
Well...

Jeremy Hunnewell   8:12
Well, let's zoom back. We'll come back to that in a second. But the, but we need a GL number, whether that's developed via product or not. In this one, in this case, it is the deferred revenue because this is the annual contract. So other data on here that's been helpful is having the contract period.

Marcelo Torres   8:30
Uh-huh.

Jeremy Hunnewell   8:32
That's going to help whoever is.
defining when this should get converted to revenue, whether that's a human or a machine. This is all helpful to communicate to the customer, right? Because this data, this is a line, this is, there could be multiple lines here. This is 1 line on this invoice. It's kind of a line on the invoice to the customer, and they, so they should know what they're buying.

Marcelo Torres   8:51
Mhm.

Jeremy Hunnewell   8:56
And that, in this case, they're buying a subscription for this time period.
It's got a price. In this case, it looks like it's been increased by, you know, 4 or 5% for maybe one or two years, because it probably started at, you know, 48,000 or 50,000. Who knows what the number was originally? We could find out. So the customer name.
Ohh.
Yeah, and so, sorry, the data elements for...
A contract are all going to be.
In the finance.
Contracts.

Marcelo Torres   9:44
No.

Jeremy Hunnewell   9:51
I don't know.
Showing anything, so let's go back out, let's go to contracts.
Well, it's not showing me anything.
Finance.
Sports.

Marcelo Torres   10:17
Yeah.

Jeremy Hunnewell   10:19
I don't spend a lot of time in here myself, so I don't know if you have some navigation tips.

Marcelo Torres   10:19
Contract plan.
I, I, I don't, um, if you're hitting contracts and not seeing anything, it probably means there's nothing there that's like under your personal, but if you hit plus, if you go back and hit the plus button.
Yeah, this is a new one.

Jeremy Hunnewell   10:38
Sure.

Marcelo Torres   10:38
I.
It should show you the.

Jeremy Hunnewell   10:41
I should see all of them. I don't know why I'm not. So right, company name.

Marcelo Torres   10:45
There you go, it changed your daughter.

Jeremy Hunnewell   10:47
So company, that means our company. So is it Betty Bott? Is it Rasa? So Blue Cypress Company, which entity is this going to get directed to? Account is the customer account.
Contact name, sales rep name, which I don't use.

Marcelo Torres   11:04
Oh, you're kidding me, bro.

Jeremy Hunnewell   11:08
Am I ruining your day or making it better?

Marcelo Torres   11:10
No, you're making it much better, trust me. This is like so, I'm so happy I saw this now. If I saw this in a week, I would be...

Jeremy Hunnewell   11:17
A contract.
Um...
So, yeah, some high-level details about the account. I actually don't know. This looks different to me.

Marcelo Torres   11:23
Be gone.

Jeremy Hunnewell   11:32
entry level manual, we have an automated version. Auto renew is important because that is going to define if it will generate a new
a new invoice requirement in nine months, right? Because it will renew in a year and we are invoicing it three months ahead of time. So in nine months, we're going to get a ping or this is going to be on our schedule to send out. Cancellation days. And this is all defined by the agreement, right, about the contract behind the deal.
whether it's 3, 4, 5%.
Ohh.
I don't really want to make one, so there changes.
I don't know why I can't see. What if I went to here? I probably just didn't have a good view turned on.
I hope that you.
Wild.

Marcelo Torres   12:27
Okay, so your contracts have a contact. Is billing the system that handles actually sending the contract, like having the e-mail that it needs to go to or something like that?

Jeremy Hunnewell   12:38
So...
No, it it what defines that is when you have a.
Um...
Today, how that works is the the.

Marcelo Torres   12:54
This is incredible.

Jeremy Hunnewell   12:57
Contract has to have a customer. If it's a new customer, we have to go create a customer. If it's an existing customer, we can tab that customer. That customer within Business Central, because right, the flow is from Business Central to Bill.com. It doesn't matter what it says on the AI ID key. Hopefully they match, but things like I don't attend to the sales.

Marcelo Torres   13:13
Uh-huh.

Jeremy Hunnewell   13:17
wrapped, but we handle that differently. I would like to get it all under one roof.

Marcelo Torres   13:22
Yeah, the orders should hopefully consolidate that.

Jeremy Hunnewell   13:25
Yeah, so like a customer record then has to exist somewhere. And that's the account in the AI IDP that already exists, but does it have good data? I don't, some of them are old or there's duplicates or, you know, we had one issue where somebody booked a referral under.

Marcelo Torres   13:26
That's the goal.
Okay.
And then we connected to the order.

Jeremy Hunnewell   13:44
The acronym which existed, but there was the real account when the business ended up sending an invoice came out under the full name of the company.
So a company name has to have, for our system, it has to have an identifier. So this company number is going to have a name.

Marcelo Torres   14:00
Okay.

Jeremy Hunnewell   14:03
It needs an e-mail.
It needs an address. It doesn't need, I don't think there's requirements, but it ought to have a good address because I do some reporting for tax reasons. I want to know where the customer is for end of year reporting and our taxes. We don't collect taxes on anything or anybody, and that's probably something that
I need to attend to. There may be jurisdictions where the things we're selling are taxable and we should be collecting sales tax.

Marcelo Torres   14:33
Very, we don't like the instance.

Jeremy Hunnewell   14:37
We don't collect any sales tax today.

Marcelo Torres   14:39
Do we pay sales tax? We just don't have to because we're not taxed and they're not taxed.

Jeremy Hunnewell   14:39
Ohh.
Well, so sales tax, so I'm talking sales tax on something, you know, when you go buy groceries and you pay 10 cents on every dollar in New Orleans, right? That sales tax that Whole Foods is collecting and remitting to Louisiana or Orleans Parish or whoever the taxing authority.

Marcelo Torres   14:48
Her.
Bye.

Jeremy Hunnewell   14:58
I am in Louisiana. Well, I'm unaware of the jurisdiction by jurisdiction.
requirements on what we sell. There are systems and platforms out there that could help, but we haven't gone down that path. This is a project. So we need the capability in the platform to be able to collect and remit.

Marcelo Torres   15:07
Right, right.
Yeah.

Jeremy Hunnewell   15:18
sales taxes on, right? Instead of us selling it for 50,000, we might have to sell it for 55,000, keep 50,000 ourselves, put 5,000 in a bucket and remit it to Illinois or whoever, wherever that customer is at some point. We might.

Marcelo Torres   15:32
But we just kind of take the hit on taxes right now.

Jeremy Hunnewell   15:35
Right now, I'm just, yeah, we're we're flying under the radar, hopefully.

Marcelo Torres   15:41
I'll say that, dude. I'll say that on video. I'll say that. We need to delete this. What?

Jeremy Hunnewell   15:46
Right.
As far as you are aware, we don't have, as far as I'm aware, we don't have any taxes that we actually owe.
So, these are red stars, which I would thought may means it's required, but we obviously have saved this customer record without it, so...
So I don't know. There have been...

Marcelo Torres   16:09
This is a lot, dude.

Jeremy Hunnewell   16:11
Yeah, we'll have another conversation another time, I'm sure. But Ari and I worked for a while because he was having some trouble getting his automation that he was building in Cloud Code to create customers in some of our Business Central instances. Our Business Central instances are not.

Marcelo Torres   16:28
Not mine.

Jeremy Hunnewell   16:30
uniform in their setup, in their parameters. And it mattered, I learned and have since forgotten, like what these things matter. The default and the general business posting group and the customer posting group, these things matter for that, for getting the sync to work, for getting Claude to create a customer and then create an invoice against that customer.
Um...

Marcelo Torres   16:53
So, okay.

Jeremy Hunnewell   16:55
So, so just to close the loop, I need an invoice to have an e-mail, and that e-mail currently I only have room for one, but then if you go into bill.com, you can create as many as you want, and you can copy, you know, CC people, so we're limited, we have kind of this...

Marcelo Torres   17:02
Ohh.

Jeremy Hunnewell   17:13
bottleneck. Since we're pushing things via Business Central to Bill, there's only one e-mail address that can ride with that data on a sync. Once that customer is created, I can go add additional e-mail addresses, but I have to do that manually in bill.com today.

Marcelo Torres   17:19
Ohh.
We can fix that on the other side.

Jeremy Hunnewell   17:31
Yeah.

Marcelo Torres   17:33
Ha.

Jeremy Hunnewell   17:34
But then we also need good data on the front end, like who's defining, you know, the person who signs the contract may not be the person who's going to pay the bill, right? And so hopefully our salespeople are saying, you know, Fred signed it, but send the invoice to Susie or to AP at or to wherever, right? And sometimes we.

Marcelo Torres   17:39
Ohh.

Jeremy Hunnewell   17:53
You know, I don't know how this scales, but right now it's, you know, we send it, we haven't heard from in a while, so we send a follow-up or we ask our business leader to send a follow-up, like, oh, you need to send it to this other address, right? It's been for three months, it's been sitting in like, you know, purgatory.

Marcelo Torres   18:09
Okay, okay, okay. So, so I need this schema, like I, I.

Jeremy Hunnewell   18:10
That's right, but...

Marcelo Torres   18:17
Okay, I'm sorry. I need a way to have your schemas, even if it's just like a screenshot of this and you blank the data, that's like enough for me. I just need, because I'm going to tell you right now, like the stuff you're describing with contacts and the invoices and we're not even close. Like we are not even remotely in the neighborhood.
of this level of functionality. And it's, I mean, it's needed. Like you can't send an invoice without an e-mail. We don't even have emails. We don't, we, I haven't heard the word e-mail. Like we don't have emails in our schema. And it's just basic stuff.

Jeremy Hunnewell   18:48
Do you do you need it? Yeah, so it doesn't, but once the customer's created, you don't need to tell me that e-mail every time you send me an order, right? I need to create it once.

Marcelo Torres   18:57
Yeah, but we don't have a customer entry like that. I mean, I'm...

Jeremy Hunnewell   19:00
But what?
If we assume that customer exists, you just have to tell me the customer, and then I already have all the data for a customer, right? You need to say this is C00060 or American Society for Nutrition, ASN, and they just ordered $75 worth of Betty Bott. Great, I've got all the information already.

Marcelo Torres   19:11
Yeah.

Jeremy Hunnewell   19:22
If you say, hey, we got a new customer, well, that's a different workflow. Now I got to go figure out how to build that account and get the data and create the customer. If we are going via.

Marcelo Torres   19:23
Right.

Jeremy Hunnewell   19:35
I mean, I think I would need that anyway, but if we're going via Business Central to bill.com, if it's AIDP to Business Central to bill.com, then yes, we would need that before we can even send the invoice.

Marcelo Torres   19:46
Yeah, I mean, I mean, just like looking at what you're telling me, it kind of blows up a lot of our current ideas as far as, like, okay, what they want right now is someone creates an order, we create the journal entries. Now, how that order translates over to your system, they haven't told me. But I'm looking at your system right now, and I mean,
If I'm not misunderstanding it, it kind of needs to come with the journal entry. It kind of needs to come as one entry per order, basically.

Jeremy Hunnewell   20:15
Oh.

Marcelo Torres   20:16
like as an invoice.

Jeremy Hunnewell   20:18
Yeah, I mean, I need to break it somehow. I need to, if we want customer level data in Business Central, it can't be hidden within a batch. I need, I need, if, yeah, if we just need, so what can be batched is deferred revenue entries.

Marcelo Torres   20:32
Right.
Gotta come in.
And.

Jeremy Hunnewell   20:39
to convert them for deferred revenue to revenue.
I don't necessarily can. Well, if you got here, let's go look at.

Marcelo Torres   20:42
The question is, I mean, why?
At that point.

Jeremy Hunnewell   20:52
Let's look at Blue Cypress. So imagine you we've got 100 customers or 1000 customers or 20 and we are going to contract.
They all have different revenue scheduled, right? Somebody started in January, somebody started in February.
We could have individual, let's just let's look at Betty.
Um...
This is.
Um...
Let's look at June. I guess where May is pretty close, but we could skip there. So here's June's revenue.

Marcelo Torres   21:36
Right.

Jeremy Hunnewell   21:37
Right, we have term start and end. We have number of months of the of the.
of the agreement. This is an odd one at 2 1/2 years. Often there, you know, get a lot of 12, got 11. And this is how many, what percent has been recognized or how far into the agreement are we?

Marcelo Torres   21:58
And this is all data you're pulling out of BC Business Central.

Jeremy Hunnewell   22:00
This is, this is not, this is data from the AIDP with start dates, end dates.
And then it's doing some math. And so Power BI is doing some, has some logic that does not exist in the AISDR. So we need to get it out of there. We are, we currently manage it between a Power BI report and a spreadsheet, which, you know, is not awesome. But that spreadsheet.
Let's see if I can find month end, 2026, Betty Bop.
Deferred revenue.
We used, when I showed up, we didn't have the spreadsheet. We'd gotten away from the spreadsheets where we're using these, but the data wasn't great because a human entered some of it or forgot to turn something off or double entered something or, right, all the things.
And so anyway, I think you could have however many entries this is on a given month. I'm not opposed to that, but Amith keeps talking about batching. Maybe we need to have a chat with Amith. It would be tidier on the GL to have one entry, but I don't know who cares.

Marcelo Torres   23:12
So, so yeah, I mean, what, what?
What I'm wondering here is what's the pain point?
Right, because to me, from what I'm hearing from you, I'm not hearing a pain point that this system solves. I'm just hearing that I'm rewriting stuff. But what I am hearing is a possibility that this makes entry from the salespeople a lot easier and much more accurate and reproducible and useful to you.

Jeremy Hunnewell   23:29
Well.

Marcelo Torres   23:39
The question really comes in with that batching, right? It's like, what's the upside of the batching?

Jeremy Hunnewell   23:39
You, you?
Yeah, I think it reduces.
360 something lines to one on a given month.

Marcelo Torres   23:56
Well, Business Central doesn't let you do that already. You should just be able to reduce the number of dimensions you're splitting up by, right?

Jeremy Hunnewell   23:56
Up.
Well, I have.
We do. So somebody's like, this is, but we're not doing it in an automated way. So this is what you're building should be automation of manual processes. So I'm describing the manual processes today. Yeah, we make one entry that recognizes the month's worth of revenue.

Marcelo Torres   24:18
Right.

Jeremy Hunnewell   24:26
I could, if we're talking just specifically talking about revenue recognition.

Marcelo Torres   24:30
You do.

Jeremy Hunnewell   24:32
converting deferred revenue to revenue, if we have, that makes sense as a batch to me. That's what we, that's how we do it today, is we say, here's one line item.

Marcelo Torres   24:35
Okay.

Jeremy Hunnewell   24:43
recognizing X dollars of revenue.
moving it from deferred revenue to revenue.

Marcelo Torres   24:46
Well, the idea is, I think the idea from Amith side is that you don't have to do that. You don't have to balance up at the end of the month. You're looking at the balance the whole time.

Jeremy Hunnewell   24:55
Huisman.
Yeah, that that should be. I mean, it could be right. It doesn't even have to be a.
You could potentially do it daily, right? Like, I don't it would be maybe a little silly or weekly or something, but you, you know, there...
Monthly is probably the right number.
Ohh.

Marcelo Torres   25:22
Well, I think, I think what I'm what I'm what I'm but.

Jeremy Hunnewell   25:22
And there's a bigger, so the real thing, so I don't know if this is important, but to back us up, there is a weekly process that I used to do personally and now manage, Danny does, which is a cash flow model, which is taking

Marcelo Torres   25:33
Mhm.

Jeremy Hunnewell   25:38
a pile of different inputs from different sources, including upcoming renewals, because we're invoicing these three months ahead of time, so we know what's going to expire when. We're looking at our HubSpot data to figure out what the sales folks thinks in the pipeline. We've got our budget data for the carry beyond when the pipeline is reasonable to kind of guess at what the future holds. We've got our history, we've got our actuals.
Right, again, we're triangulating on like all of these different.
data points and we are trying to
into the future and say, what's our cash position today? What's our cash position going to be in the future? This is an Excel model. It's intense. We have, you know, eight different businesses. There used to be more. It's fragile. It's broken. You know, we deleted a...
number accidentally and it blows the whole thing up. So this started with Amith suggesting that we could have that.
exist within the AIDP and it could be automated, right? And that's what is, I think, become now the FP&A.

Marcelo Torres   26:42
Mhm.

Jeremy Hunnewell   26:47
Uh, layer.

Marcelo Torres   26:49
I don't even know what that is.

Jeremy Hunnewell   26:50
financial planning and analysis. And I hope I'm not talking at school, but I think this is helpful to kind of orient. And so that's where I thought we were going and it was going to be a cash flow model, an automated cash flow model. And then he got excited and like, well, what if we kind of back up from there and instead of, you know, other manual things we're doing today,

Marcelo Torres   26:55
You're not.

Jeremy Hunnewell   27:10
His ambition is that we automate all, at most maybe, of the manual activities within the finance function. So, you know, this morning I spent a while wrestling with our Business Central because normally someone else does it, but Tyler, she's out.
for the next week. And I've given an intern, Vlad, but he's off on Fridays. And so I'm booking cash today, right? And so I'm looking in the bank and I'm saying, what cash should we get?
that invoice I just showed you, maybe, right? Maybe someone paid us that, let's say it was a $30,000 invoice. Okay, I got $30,000, so I have to go in, I have to book the journal entry, $30,000 debit to cash, credit to Accounts Receivable, but Accounts Receivable for that customer. And the way you do that in Business Central is tag it to the customer and it automatically flows to Accounts Receivable.
And then I have to go apply it against that invoice, because even that you could have, if you don't apply it against that invoice in Business Central, it'll still think the invoice is open. It still looks, thinks they owe you for that invoice, even if their account balance is 0. So net AR is correct, but that invoice looks like it's still open. Then I go to bill.com.

Marcelo Torres   28:22
You have to close it.

Jeremy Hunnewell   28:23
No, go ahead.

Marcelo Torres   28:24
You say you have to close the invoice.

Jeremy Hunnewell   28:27
Yeah, you have to, there's a function and there's something you do in Business Central called applying.
Yeah, you apply the payment against the invoice specific. So you can say, hey, it's not just that this customer.

Marcelo Torres   28:36
Okay, that's good. That's good. You subtracted.

Jeremy Hunnewell   28:39
Yeah, because the customer could have multiple invoices, they might pay half of it, they might pay two of them. And so there's no, the system doesn't automatically assume, like, okay, they used to owe 10, now they paid 5, now they owe 5. They want to know which invoices still. They, like, they, they, then Bill.com has another function that we also manage, but.

Marcelo Torres   28:53
Okay. Okay.
I gotta go at.

Jeremy Hunnewell   29:01
That's probably a different thing. But if some people pay us through bill.com, and then bill.com knows that that invoice has been paid, but other people pay us directly via ACH or sometimes a check. And so then we have to go into bill.com and mark that invoice as paid. So that, because we have some automation around reminders, and we don't want a reminder to go out for something someone's already paid.

Marcelo Torres   29:11
Uh-huh.
Right.

Jeremy Hunnewell   29:21
Um...
And that.
That will redo, then that, yeah, that has nothing to do with revenue. That's the cash collection side. That's AR.

Marcelo Torres   29:32
One thing you mentioned is when you book in a when you book AR, you book it to the customer. Does it flow to a separate account for that customer, or is it just going into your general AR account and tagging that customer? What shows up when you search them?

Jeremy Hunnewell   29:46
So if you don't, when you're booking the entry, when you do the journal entry, you can book it against Accounts Payable or Accounts Receivable. You can do the GL account number for Accounts Receivable, and it will book to that account, right? And it will reduce the Accounts Receivable by $30,000, in my example. But that...

Marcelo Torres   30:00
Uh-huh.

Jeremy Hunnewell   30:05
Customer won't get credit for it.
Right, so it'll look like the customer still has $30,000. Instead of booking it to a GL account, the way to do it is to book it to the customer account. And the customer account knows that if you book it to a customer account, it's going to offset Accounts Receivable. So it's going to end up as a credit to Accounts Receivable, but it will give that customer.

Marcelo Torres   30:27
Ohh.

Jeremy Hunnewell   30:29
Credit.
So there is a...

Marcelo Torres   30:31
So, there's two, there's two systems happening there.

Jeremy Hunnewell   30:34
Yeah, there's like a sub-ledger, right? So, the sub, so the the the ledger, so maybe I don't know if I mean, but let's assume the ledger is accounts Receivable, the sub-ledger is the customer sub-ledger, and so that customer has a running balance.

Marcelo Torres   30:37
Yes.
Yeah.
OK, go for it.
Right.
This is, I mean, this is this has been very informative.
I think we need to dig into more of these, you know, these manual workflows that you're trying to automate. Hearing about these is great. I think it'd be good to come back around and dig into those a little more. And then, you know, I was mentioning if you could share your schemas, I really mean like, if you can share the list of like, here's my invoices and show me all those rows, you know.

Jeremy Hunnewell   31:07
Yeah.
Yeah.

Marcelo Torres   31:21
And I, and like, like what I really will have to create on my side is a diagram of how your things connect, what's connecting to each thing, so that I can go into my code and I can say, as far as the AR side, just so I can go to my code and I can say, okay, here's how I need to model this, and I'm willing to do like...

Jeremy Hunnewell   31:34
Mhm.

Marcelo Torres   31:40
Look, like if you want to give me, I don't know what kind of access I could be given to this system that'd be like read-only and not showing me real data. But if there's a way to do that, that would be an alternative where you don't have to do as much work. And I can go kind of map the system. I just need like, basically like what you've described to me today is a very rich system.

Jeremy Hunnewell   31:48
Yeah.

Marcelo Torres   32:02
that I will not replace with the current plans I have and need to at least handle some components of. Like, I mean, this cash flow model, right? That's something we actually want to handle. We want to do payments. But if I want to automate that, then I also need invoices, I need customers, I need a...

Jeremy Hunnewell   32:15
Yeah.

Marcelo Torres   32:21
take the payments and put it against that customer's account and against that invoice. Those are things I just didn't know. No one told me.

Jeremy Hunnewell   32:27
Sure, sure. I'm glad we're having a chat. There is a way, so, so back, you know, we kind of went down this path a bit with Ari and gave him, I don't think he needs it anymore.

Marcelo Torres   32:30
Yeah.
First.

Jeremy Hunnewell   32:42
User access and so I can check with him and maybe I just or we'll get you a different seat, but there is definitely a way to get you access.
And then you can poke around and you can see, you should be able to see what you need.
Let me check with him to make sure he doesn't need that or want that anymore. And then I will...
whether based on his answer to that, will get you a seat. I'm also happy to work with you or to export things. I think the easiest thing would be for you to have your own access, not just easy on me, but I think also to, you know, kind of poke around and learn. I can export invoices and customer cards and other records. Claude.

Marcelo Torres   33:15
Yeah.

Jeremy Hunnewell   33:24
We have a bunch of Claude workflows that we might be able to still. Yeah, I might be able to ask Claude, tell me what I need to tell Marcelo so he can do these things. I might be able to get you a leg up.

Marcelo Torres   33:35
That would all be amazing. I got to go because I have another meeting. I'm sorry. I didn't expect this. I mean, I expected to run, but this is, we could schedule again because this is really helpful. And having access to the system, I think, would let me save you some time.

Jeremy Hunnewell   33:40
Yeah, yeah, alright.
Ha ha.
Yeah, let's do it.
Look, yeah, let me let me work on that and we'll reconnect.

Marcelo Torres   33:52
All right. Thank you so much, Jeremy. I appreciate you taking the time. Really, really, truly.

Jeremy Hunnewell   33:55
No, absolutely. How did you do it? Yeah, let's keep going.

Marcelo Torres   33:59
All right. Have a good day. I'll talk to you later.

Jeremy Hunnewell   34:00
See.
Sounds good too.

Marcelo Torres stopped transcription
