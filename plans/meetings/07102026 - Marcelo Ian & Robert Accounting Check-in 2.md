> ✅ PROCESSED 2026-07-10 → distilled into `2026-07-10-decisions.md` (accounting + orders companion). See `_PROCESSED.md`.

Accounting Check-in-20260710_154212-Meeting Recording
July 10, 2026, 8:42PM
31m 5s

Marcelo Torres started transcription

Robert Kihm   0:03
with you. And then in July 10th, 2027, the contract says, yeah, there's an auto renewal and it's going to renew at $105,000 because we do a 5% bump in that. So the contract has all of that information in there. In the Blue Cypress Data Platform, contracts with contract terms. So the contract terms

Marcelo Torres   0:21
That was.

Robert Kihm   0:28
term would be like right now a year, like in this case, in this example, hey, my first contract term is now till January or July 9th, 2027. Then there's another contract term that's going to get created with this auto renewal or when they manually renewed, but it would then create another contract term for July 10th.

Marcelo Torres   0:32
Mhm.

Robert Kihm   0:49
at that new amount. And then once we get up to the point where it's like, oh yeah, it's time to turn that into an order right now, it's like, and it's time to turn that into an invoice. Like that's the thing that then is going to be, you know, the thing that gets the payment is like, that's the invoice part of it. And then in the stuff that Soham is talking about with contract automation, like.
there's a whole bunch of jobs that run to say like, hey, like 365 days ahead of time, we're going to create a new contract term for those auto renewals as like a pending state to know, to basically say this is forecasted to come in. And then when we get to like 100 days, like we turn it into a different state. So it goes from 4, I think it goes from forecasted.

Marcelo Torres   1:27
Mhm.

Robert Kihm   1:33
to pending, and then finally it becomes real and active on July 10th. You know, 2027, the new contract term becomes active and the old contract term is ended.

Marcelo Torres   1:45
Yeah.
Okay.
So, so sort of...
My, my, what I'm missing right now is just where we fit into that kind of workflow, especially when it comes to LXP. So, if we're trying to pick up like...

Robert Kihm   2:05
So LXP doesn't have contracts, basically, I think generally, you know, these for the LXP where they're like signing up and giving us their credit card right away, like it's immediately, we might create a contract for it, but I think it immediately goes to an invoice in our system and in this new system it would go to an order.

Marcelo Torres   2:09
Uh-huh.

Robert Kihm   2:23
And if they're giving us their credit card, it's an order and a payment that happens right away too.

Marcelo Torres   2:27
Yeah.
So we need to handle invoices. Well, okay, I'm sorry, that's a bad word. We need to handle orders, but an order is really an invoice. If it's getting fulfilled immediately, it's getting fulfilled immediately, but tracking that is so important. So our system handles invoices and payments. Now,

Robert Kihm   2:37
Second.
Yeah.
Yeah.
Yep, yeah, and in the new app, it's basically orders that you've created is the same as what invoices are today. Like, we're replacing what we call invoices in the AIDP today with orders, and then, you know, payments are payments.

Marcelo Torres   3:04
Not to get you into semantics here, but should we leave it as invoices? I mean, if we're going to have it, well, I guess the real question that I have, it's not to do with that. It's are we going to be reaching out to clients if they're behind on payments from the orders app? Are we going to be like managing renewals and all this kind of stuff? Okay. Okay.

Robert Kihm   3:12
Kihm.
Yes, yes.
Yes.

Marcelo Torres   3:23
It's just, to me, this seems like they are invoices. I guess we just prefer orders in this case.

Robert Kihm   3:29
Yeah, they are equivalent terms, like, you know, like...

Marcelo Torres   3:32
Okay.

Robert Kihm   3:35
We're calling them orders now. I think Business Central called them invoices. You know, we're just, we call it an order entry system. And so, like, I think orders is, you know, it is a different term, but it's basically equivalent to an invoice.

Marcelo Torres   3:50
Yeah, I mean...
I'm going to explain it as an invoice tracking system, an invoice management system, because I think that's how that's how that's how Jeremy would understand that.

Robert Kihm   3:56
But.
Be careful, because, like, we're...
That's how Jeremy, yeah, understands Business Central today. But Jeremy's also been following along with the designs and contributing to it. So like orders is fine. Like just know that yes, we have a term today that we call invoices. We're replacing it with a new system and in the new system, it's called orders.

Marcelo Torres   4:17
All right. I will follow that. And then...
So the only concern, like I mentioned, is maintaining the information access for Jeremy.
Obviously, we can rewrite an entire report system, but...
You know, he's using Power BI to create some of these reports. He's got pretty detailed pooling.

Robert Kihm   4:37
Yep.

Marcelo Torres   4:40
Obviously, I don't know where you fall on that. I mean, if we put this system into use and he loses access to information about LXP still.

Robert Kihm   4:40
Yeah, it's gonna.
So...
No, no, he won't. Like we can't do that, right? The requirement is that that stuff has to be equivalent information. It may be that we end up still, there might be a couple of things that happen out of this. Like if we're not ready to cut over to the new system, like it'll continue using the old system until we're ready to cut them over to the new one. Like that might be a de-risking thing we do with LXP.

Marcelo Torres   4:52
Right.
Mhm.

Robert Kihm   5:13
But regardless, like let's say the bigger picture, like switching over the finance team to use this new order entry application.
Jeremy is not going to sign off on it until he has the reporting that, you know, he needs to do, and it may be Power BI that does that. It may be, you know, something else. Like the good news is, it's all in the SQL database, you know, the Power BI stuff, like he's driving it from like invoices, the invoices entity right now. He's driving some stuff from contracts. Well, contracts isn't going away.
We'll probably port over contracts to the new system, and you know invoices now will like point to like, "Hey, well now instead of invoices, you're gonna use orders. Yeah, there's some different field names and all these things, but here's how you generate the data." The key driver behind all of this is the current system that Jeremy is using.
is very fragile and he's using a system that has, well, I get some information from Business Central and then I get some information from the AIDP and I get some information from here and it's like, none of it is like that reproducible and it's very time dependent. Like if you run your report at 4:00 versus running it at 5:00.

Marcelo Torres   6:16
Yeah.

Robert Kihm   6:21
You know, it's like, oh, well, there's been a difference in here. And it's like, well, if you're running it off of like closed periods and things like that, it's like, you know, those things shouldn't be changing. You know, when you like the whole point of this thing is like the BC data platform is going to become the system of record.
for orders and payments and subscriptions and we're going to run the business from that. Business Central will still be the general ledger and like the GL reporting and stuff like that can still happen in Business Central and still will happen in Business Central because we're not building a GL. But the subledger stuff, all of that stuff, like Amith main driver on this stuff is like.
When Jeremy is creating his reports that the senior leadership team uses to run the business, like those are reproducible and they're not like coming from a formula field inside of a linked spreadsheet that has like 6 levels deep that somebody broke the link to, so like the calculation's wrong, like we...
That's why there's all of this stuff around writing in pen and like having all of this stuff to be like, I need to be able to reproduce this. If I do like this time window, like I know that that time window and I run the report a week later on the same time window, I'm going to get the same results.

Marcelo Torres   7:34
Yeah, and I definitely, I definitely agree with that. I think, you know, the reason that I'm kind of in this meeting is because...
the report system is becoming a requirement for cutover. The payment system is becoming a requirement for cutover. And, you know, like, again, targeting a week from now, that's not happening. I can just tell you, I can, even if I could, you know, let me not go too deep into it. The report system is going to be very complex.

Robert Kihm   7:48
Mhm.
Mhm.
Yeah.
Help.

Marcelo Torres   8:04
I don't think I can build that. And if that parity is required for him to use the system, I can guarantee you we're not going to have it by Friday. There's just zero chance.

Robert Kihm   8:11
Right. Well, again, like, we're not cutting over on Friday, right? At the very earliest, we cut over on August 17th.

Marcelo Torres   8:18
Okay, I'm sorry. Yeah, I need to get that out of my head.

Robert Kihm   8:20
Yeah, there's a whole bunch of stuff you need to deliver as soon as possible to LXP so they can build off of it, right? Because they're going to be like the consumers of, you know, like...
They're going to be the consumers of this, you know, too, and...

Marcelo Torres   8:35
Yes.

Robert Kihm   8:37
One of the things...
That I think you need to also get in your head, and maybe, maybe you do, maybe you don't, but I'm concerned you, I was like...
LXP is going to install like this application, right? And LXP has its information about orders and payments.
There's also the BC data platform that's going to install the orders and accounting and payments and subscriptions, and...
LXP is going to flow a bunch of information into Blue Cypress from their system into our system, right? Like the LXP system is going to be focused on LXP and what it's doing. And it's all for Sidecar as an implementation of it. But the other thing about LXP is
LXP is this is, you know.
could end up being its own product company where Sidecar is one of the organizations that's purchased it and is running themselves in LXP. And we could sell, you know, to other companies that say, I need a learning experience platform. And it's like, okay, well, you will sign up, you know, in our LXP platform, you'll send us money. And now we're, now they're a customer of LXP.
And you know, let's just call the business LXP. Similar to what happens with Izzy right now, like Izzy, you know, INTA signing up and like, there's only one instance of Izzy, you know, and every customer that purchases it has that information in there for like INTA and INTA has a subscription and eventually, you know, there will probably be like...
You know, some more order entry functionality in Izzy, and that stuff will flow into Blue Cypress through an integration. Again, that problem's not a solved problem right now, but like, so like that, like think of them as like you have a customer in LXP and they're gonna be probably the first user of it, and like, and then our.
financial system at least Cypress is going to be like the second customer or a parallel customer with it.

Marcelo Torres   10:41
Okay.
Who can I talk to that does accounting at LXP?

Robert Kihm   10:49
It's going to be our finance team.

Marcelo Torres   10:52
It'll be okay, that's good, that's good. So that's what I'll be building for as far as the accounting side. And the order side I will discuss with Ethan the features that he needs me to integrate with. I just want to, you know, the reason I think this has been, you know, I've been having so many meetings and there's so much that I'm talking about is

Robert Kihm   11:02
Yep.
The.

Marcelo Torres   11:12
You know, I'm experiencing a lot of future growth, let's call it. You know, the original statement of an AR sub-ledger, we've now added a report system. We've now kind of updated orders to handle, you know, the order system is almost integrated with the payment system. It kind of needs it.

Robert Kihm   11:15
Help.

Marcelo Torres   11:30
And it.

Robert Kihm   11:30
Yes, yes, 100%.

Marcelo Torres   11:33
Um...
You know, I just want to ask, are there any other systems you anticipate that I'm going to need to make?
Because I know you want me to get like a baseline in, but having a baseline and not knowing, like my baseline is not a waste of time, but there's so many changes I have to make that it's going to be very difficult to use a lot of what I've already done.

Robert Kihm   11:41
See.
Yeah.
Okay.

Marcelo Torres   11:57
I'm just...

Robert Kihm   11:57
Hopefully client code will rip through a lot of this stuff for you. But yeah, orders, payments, you know, as part of orders, like the type of products, which is like subscriptions and subscription management is a huge part of this, right? So like, like how long is this subscription for? And it's like, oh, well, this is an annual subscription.
You know, and so for like the order line, you know, when a subscription gets purchased, you know, there's going to be an extension on the order line linked to like, hey, this is the purchase of that subscription. And what is the like, hey, I purchased it today. So it's good from Friday 2026 to.
July 9th, 2027, that's my subscription term. And so like there is going to be an entry that tracks that to say like, hey, Robert's got a subscription that goes from this term to this term. Why is that important? Well, you know, because we want him to renew next year. And then the other thing is like, and it's deferred revenue, like over the year, like we're going to be recognizing this.
the $100 that Robert gave us at like 10 bucks a month or whatever. And the, and so yeah, like the subscription management piece of it's really important as part of the deferred revenue.
We probably can kick a lot of the product stuff down the road other than some of this deferred revenue settings and building that out, but like pricing and all of that stuff probably can. You've mentioned taxes. I do think we need to find a way to track taxes. Taxes may not be that different than like order lines in a way.
In that, you know, they are basically just items that have, you know, costs or charges associated with them that need to get tracked, and they, and they all roll up to the grand total, so...

Marcelo Torres   13:41
Mhm.

Robert Kihm   13:46
We may track that, you know, in separate tables, but we also may be able to extend order lines and like use a type on order lines to be like, hey, you know, there's a 10% tax in Louisiana, you know, so it's like the $200.00 plot max subscription is $220, right? And it's like, and there's a, there's like basically.
a tax line item for 20 bucks. And you know how we show that in the user interface, maybe we extract it so that you've got your order lines in one area and then the tax lines are like aggregated into a tax area. But like that's all user experience, but like, you know, at the end of the day, like, you know, it could just be an order line of a specific type.
And that might be the way to start doing it as like a way to get this like, hey, I got my $220 $200 product, $20 in taxes. And you know, you might even create like, you know, as the quick and dirty, you know, first iteration of it is like, there's a product ID for Louisiana state tax.

Marcelo Torres   14:33
Um...
Okay.
On.
Ohh.
Okay.

Robert Kihm   15:06
And then, you know, I know we talked about multi-currency support eventually, right? So multi-currency is another area that's in there. Again, do we need it on day one? No, we don't.

Marcelo Torres   15:07
We're going to need the BC integration.

Robert Kihm   15:17
There's like the plan talks about sales rules and a whole bunch of other things that are like, you can't buy this product until you've done these things and all sorts of things. Again, I don't think we need to worry too much about that intercompany flow. I do think it's something that's near term, if not like MVP, like fast follow after to be like,
because one of the visions of this stuff is, INTA just purchased Izzy, Rasa, a Sidecar Learning Hub subscription. Those are three different companies, but it's one order, the products are from the different companies, and then all the do to do froms kick in at that point. So that one's gonna be pretty soon.
you know, to handle those complex orders.

Marcelo Torres   16:02
Yeah.

Robert Kihm   16:03
Talked about subscriptions, talked about payments. I'm just quickly going through the BizApps orders master plan.

Marcelo Torres   16:08
Yeah, please.

Robert Kihm   16:13
No invoice entity, the posted order is the AR primitive. That's what we talked about. So that is the terminology flip. A credit memo is an order with a negative balance. Yeah, that makes sense. Payment line is a junction between a payment and an order. One payment can clear multiple orders. One order can be partially cleared by multiple payments. So like, hey, I'll give you 100 bucks today and I'll pay you.
Another 100 bucks next week.
Product revenue recognition types in there plus tax calculation at order line time via BizApps Accounting. There's a tax calculation provider. Yeah, so that's actually nice. They want to actually throw off to like an Avelo or I believe it's Avelos or some other tax provider that says here's the shipping address. So that's why shipping address is also important for an order.
A product tax category, the customer tax profile, we get per jurisdiction tax breaks down, we store on order line. Hey, cool, I'm actually in line with that. I like it when that coincidence happens. A contract reference is optional, so there is this idea of an order.contract ID, so it ties back to the contract, but...

Marcelo Torres   17:02
Mhm.
Yeah.

Robert Kihm   17:20
You don't have to have a contract to have an order. So, and they say the Sidecar example, one-time e-commerce purchases don't have it. So, you know, that's kind of cool. That's 2 currency plus.
Yeah, currency plus currency spot rate, you know, so that's supposed to be part of it. Stripe is the day one payment provider.
Yeah.
Yeah, like Marcelo, one thing I'll tell you is like, this is...
an incredibly complex system. The good news is, it's a lot of rules, the rules themselves are all pretty well-defined. There's just a heck of a lot of them and how they stack together to add that complexity. It's not like we have to come up with a new theory of how to do things. All of these things are pretty well understood for complex systems.

Marcelo Torres   18:08
Mhm.

Robert Kihm   18:19
But yeah, it's just difficult when it's that hard, when there's that many of them. I think Amith's vision of a lot of this stuff was that we could throw Fable and Workbench at it to basically go and iterate over this thing over several days to be like, hey, this is what you need to go build.
build all the things and it's just gonna build it and it's gonna fail, it's gonna build it, it's gonna fail, it's gonna, you know, you're gonna check in on it, you know, a few times a day to basically give it guidance to say like, yeah, you've got these parts, I see that they're done, that's good. Okay, we're missing these things now, like you gotta go and make adjustments and build that stuff. That's the only way that this gets done in a really short period of time.

Marcelo Torres   19:04
Yeah.

Robert Kihm   19:04
So like he's really good at that and how he set up his systems to go run for days to come up with like, and like he guides it along, you know, several times each day to get to a very complex end product. I'd say this one is even more complex than most of the things that he's tackled.

Marcelo Torres   19:21
Well...

Robert Kihm   19:22
Yeah.

Marcelo Torres   19:23
I mean, I used 30% of my weekly yesterday alone. I mean, I was literally running table, not table, I ran Opus, but I'm running it, I ran it non-stop. I had a task list and I would just go into the UI and go update this, update this, update this, update this. I do not mind sitting down, spending the hours of time it takes to create.

Robert Kihm   19:29
Okay.
Help.
Help.
But.

Marcelo Torres   19:44
to set up a decode plan that is necessary to run a looping model. Do I have the experience to think I'll get it right the first time? No, but I do. I mean, I have a good, I have a pretty good test harness. I run my models in that harness. Like, like I can try to do that kind of stuff, but.

Robert Kihm   19:51
Yeah.
Help.

Marcelo Torres   20:02
You know, like, I've got to go reconsider the schema now with the new information from Jeremy. And this kind of stuff, you know, we're just, we're just.

Robert Kihm   20:07
Uh-huh.
The.

Marcelo Torres   20:12
I understand the emphasis on building quickly, and I really want to, it's just...
There's so much information out there that I don't know and that isn't well represented in the schema yet. You know, last week Amith was like asking me when the schema would be done and I was like, eh. And then I'm now at the point where it's like, well, orders need to represent a lot more data than they do. Customers need to be more.
In depth, you know, Jeremy was talking about he needs multiple emails to be possible recorded on a customer, and then multiple points of contact. There's just a lot of things to get this to the point where it's a system that Jeremy can actually use. It's not in the plan, so I'm trying to collect that data.

Robert Kihm   20:53
So, one of the challenges, and maybe like maybe there is a lot more in the schema already that's not in that, that's not visible in the demo that you showed, but like, like I'm just looking at the master plan file right now, and you know several of the things that we've been talking about like are in there, like there's a bill to address, there's a ship to address, there's a customer person.
You know, there's a sales rep, there's an organization. So there are these links to biz apps common, like in the plan. So like it should be ripping through and like that should be part of the schema already, like if it used the plan to build this stuff out.

Marcelo Torres   21:21
Yeah.
I mean, I can.
Figure that out pretty quickly.

Robert Kihm   21:33
Like, look at, like, you know, again, I like the version I'm looking at, and I don't know if it's up to date or not, but it's like biz apps orders master, like, you know, I'm just looking at line 425, like 4.2 order plus order line, like start showing, like, you know, orders with multi-currency support inside it. And, you know, this is basically the schema definition right there.
And, you know, I still think there's going to be other stuff that comes out of it, but a lot of this stuff is there.

Marcelo Torres   22:03
Okay.
I'll have to give it another pass, I guess. You know, the first time I read through it, I will say it's hard to get, hard to understand the context for anything on the first look.

Robert Kihm   22:11
Yeah.
Yeah, yeah, trust me, man, I'm not beating you up about this, you know, and it's like, you know, this is a big one. That's why I think, you know, I did want to have these meetings and get the demos to have, like, it's a forcing function, if you like, where are you? Because, like, I'm not, trust me, I know you're working hard on this stuff, and I know you're doing lots of other things too.

Marcelo Torres   22:31
Mhm.
Yeah.

Robert Kihm   22:38
It's like, you know, hey, where, what works, what information do you need? You did a really good job reaching out to Jeremy and getting that. You are, you made a good call here having this meeting. I think, you know, we just need to do it more. Like, you know, and, and that's how we get through this. And it would go faster if Amith was here.

Marcelo Torres   22:52
Okay.

Robert Kihm   22:59
You know, because he has it in his head already, and he's like, "Oh, da, da, da, da," and I like, I'm like catching up on it, but I am wrapping my head back around this stuff, and the dust is starting to, you know, get knocked off, so I'm happy to do like a couple meetings a day if you find them useful.

Marcelo Torres   23:07
I'm not holding you, man.

Robert Kihm   23:19
to just keep kicking this thing forward.

Marcelo Torres   23:23
Yeah, I mean, I think I...
Yeah, I think we'll probably end up with probably two meetings A day. I don't really know. Some days I have enough to go on. I think after meeting with Jeremy, I'm going to probably try to meet with him again next week and just collect those requirements, read through the plan again. And now that I have kind of the understanding of, okay, this is what this needs to do. Let me look at it with new eyes and see if I'm missing something because I'm sure I am.

Robert Kihm   23:33
Uh-huh.

Marcelo Torres   23:48
Um...

Robert Kihm   23:48
Yep.

Marcelo Torres   23:49
And then...

Robert Kihm   23:49
But yeah, I just keep showing the demos and like, you know, like just, you know, with the intent that this is like, hey, I'm just making progress on this as fast as I can and, you know, tell me where, like, hey, how come it doesn't do this? And what about this? And where's that? And it's like, you know, that's how we're going to get through it.

Marcelo Torres   24:08
Okay.

Robert Kihm   24:08
But I do think at least one more run through of this plan with the schema that's in here, I think that will, I'd be very interested for you to have Claude compare it to like what's in this plan file versus what is built. Because I think very quickly, like a lot more of that complexity is going to be in your schema.

Marcelo Torres   24:16
Mhm.
Yeah.
Yeah.
I think I think it's also it could just be possible that I don't I something's in the schema that I didn't know about, and I 'cause I just didn't have a good good idea of the features, so...

Robert Kihm   24:39
Yeah.
Okay.
The other thing is, that's interesting too, is like there in this schema, in this plan, it actually does pricing. Whereas like that other part of the document where it said, we are purposefully not doing pricing right now, but there is a bunch of stuff in the pricing. So the price list, the product price, the price tier, like

Marcelo Torres   24:44
Yeah.
Yeah.

Robert Kihm   25:04
the tax category, there's a bunch of information in here. There's the, oh, and then the different product types. So like there's the event product and the event order line. I'm assuming there's a subscription product in here too.

Marcelo Torres   25:14
Yeah.

Robert Kihm   25:19
Yeah, yeah, like what I would say is like, spend time like today and over the weekend, like on the schema, focus on that first, like building out that complexity, if you, and then compare it to what you what you know from meeting with Jeremy, tell me what you're missing, you know, or what you what you got questions about.
You know, I'll give you feedback and I think, you know, I think you'll make some pretty rapid progress, you know, in the next couple days.

Marcelo Torres   25:47
Yeah, so too, I feel, I feel meeting with Jeremy really clarified a lot, seeing the actual system we're building, that was so helpful.

Robert Kihm   25:52
Help.
Yeah, yeah. Yeah, the only thing I would say is like, yeah, too bad, like we should have done it earlier, but it's like, what's the best time to plant a tree 20 years ago? What's the second best time today? Because that's what we can control. So yeah.

Marcelo Torres   26:02
How can you know? Yeah.
Yeah.
Yeah, and I mean, look, you can't know what I don't know and what I know. And it's, yeah, it's one of those things where it's like you've done accounting for how many years too, and you've worked on systems like that. You know, you get to the point where it's difficult to even say like, oh, this is what I was learning when I started that. It's just so inherent.

Robert Kihm   26:27
Yeah, well, like tell somebody how to use a computer, right? How difficult it is for you to tell somebody to use a computer because you like, well, what do you mean you don't know how to click on a mouse? Like you click, what do you mean, what are you talking about? close the window. What do you mean close the window? What? What are you talking about? Like there's no, like the window's over here. Like I don't, you know, it's like, no, click on the little red dot.

Marcelo Torres   26:33
Yeah.
Yeah.
No, Alt Tab, bro.

Robert Kihm   26:47
What do you mean I click? It's like, yeah, most people you don't ever deal with that before, but like that's the type of thing, like I have so much knowledge over time about a lot of things. I'm like, oh, well, like surely that's understood by everybody. And it's like, yeah.

Marcelo Torres   26:59
Yeah.

Robert Kihm   27:00
That's why we talk about things. That's why we write detailed plans. And I will tell you one technique that's really useful in a lot of this stuff is when you talk about building something out, having the counter examples of this is not what we're building.

Marcelo Torres   27:07
Mhm.

Robert Kihm   27:16
Because that really fixes things in people's minds, because one of the challenges that we have talking with other people is, hey, you know, Ian, go write a ticketing system. And it's like, Ian's like, yep, totally, going to write a ticketing system. I wrote a ticketing system. It's like, Ian's ticketing system is very different than my ticketing system.

Marcelo Torres   27:35
Mmh.

Robert Kihm   27:35
And you want as much overlap in the Venn diagram as possible between Ian's ticketing system and my ticketing system. Well, how do you do that? Well, you write plans, but one of the, like, I'm still, like, there's so many assumptions and things, so you put the counters in there, the negative statements to be like, and it's not this. So then all of a sudden people are like, oh.
Oh, well, I assumed it was that. Why isn't it that? And it's like, it generates a conversation. Like it's another way to force it. Like, and I found that that's really powerful compared to, here's all the things it is, because people fill in a lot of extra things, like, oh, well, that means that, and that means that, because surely like common sense says this is part of it. And then you say, and oh, by the way, it's not this.

Marcelo Torres   28:13
Yeah.

Robert Kihm   28:16
or it's not this today. And then Jeremy might say, well, yeah, I'm not going to sign off on it then.

Marcelo Torres   28:16
Yeah.
Yeah.

Robert Kihm   28:23
But he, because he just assumed that it was going to be in there and you assumed 100% it wasn't. And so that's where, you know, like sometimes it's like, and oh, by the way, I just want to state that we're not doing this right now, so that you give people the opportunity to say, yeah, yeah, you have to, sorry. And then you can say, great, well, the project's now extended.

Marcelo Torres   28:29
Right.
Yeah.

Robert Kihm   28:44
Yeah.

Marcelo Torres   28:47
All right.

Robert Kihm   28:47
Yeah, no, like the one thing I'll say is like, I appreciate you just be willing to just dive into this stuff and you're figuring it out as it goes along. I get that it's frustrating when you're not sure that it's the right thing and then you're told it's not the right thing and you got to go build something else. I don't know a faster way to do it.
you kind of have to do something to then say like, oh, well, yeah, I know I told you to do exactly that. I was wrong. Like, you know, now that I see it, it needs to be this instead. But I wouldn't have got to that until like we did it wrong. Like it would have taken me a lot. Oh, we should plan more and we should plan more. And like, there's a balance in there somewhere. Like, yes, you can.

Marcelo Torres   29:08
Yeah.

Robert Kihm   29:28
You can do it too early and it causes you a lot of extra work, but you could also do analysis paralysis and never start. And code is so cheap now to write in a lot of ways that it's like, and you didn't have to do it, so you're less emotionally invested in it than if you had actually typed it out.

Marcelo Torres   29:40
That's fair.
Ha ha ha.
Yeah.

Robert Kihm   29:48
It makes it easier to do that, like, oh, crap, like I just, like 90% of what I just wrote, I'm gonna throw it away. And it's like, yeah, but at least you didn't write it. Like, your clod can be bad at you, you know, for throwing out all their hard work. But, you know, and I will tell you, that was a real thing, like, where I would just have been, I was.

Marcelo Torres   29:57
Test.

Robert Kihm   30:06
****** at my product owner after I had spent a whole bunch of time building something and they're like, yeah, yeah, that's not it.
It's like, what do you mean that's not it? It's like, yeah, I built exactly what you told me. It's like, yeah, but at the end of the day, it doesn't solve the problem. And so you like, that's part of the maturity process too. Like that shit's going to happen, unfortunately. You try and do as much as you can, you know, to have the conversations, ask the good questions. But at the end of the day, sometimes you just like, okay, we're going to do our best guess at this.

Marcelo Torres   30:16
Right.

Robert Kihm   30:35
And then that's going to give us the rest of the information.

Marcelo Torres   30:39
Yeah, I appreciate you telling me that too. I'm definitely, I got to elect to win. Got to elect to win, so I appreciate it.

Robert Kihm   30:44
Yeah, you're welcome.
You got what you need to carry forward for a while?

Marcelo Torres   30:49
Yes, I think, I think with season, I think I'll make progress this weekend. It'll be good.

Robert Kihm   30:54
The.
Sounds good. I appreciate it. Looking forward to seeing the updates.

Marcelo Torres   31:00
All right. Well, thank you very much, Robert.

Robert Kihm   31:00
Thanks. You're welcome. Thanks, Ian. Bye.

Marcelo Torres   31:04
Have a good day.

Ian Zygmunt   31:05
Thanks, guys.

Marcelo Torres stopped transcription
