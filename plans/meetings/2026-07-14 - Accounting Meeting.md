Accounting Meeting-20260714_121423-Meeting Transcript
July 14, 2026, 5:14PM
26m 18s

Marcelo Torres started transcription

Marcelo Torres   0:03
The integration thing is kind of not in the first iteration either, anyway, but yeah, I understand, and I'll check with Jeremy on like what it's like to push something to business control and what, you know, if he has any concerns about that, I don't think he will. Okay, so that's the first thing.

Robert Kihm   0:07
Yeah.
Yep.
Yeah, but what we used to do is we would like export it to a CSV, like in the days, like before, like it was just like, here's a CSV in a format, but you know, thank God it imported into the general ledger. Obviously, things have progressed a long time since that, and so a REST API is a good point. MCP servers could be used to.

Marcelo Torres   0:27
Okay.

Robert Kihm   0:40
I like rest, you know, in the sense that it's going to be more efficient and more accurate, or is MCP obviously a little non-deterministic?

Marcelo Torres   0:45
Yep.
Yeah, I prefer the rest too on that. So the timing thing, the fact that it batches, and that's going to become one entry, and so all the dates get consolidated. The concern there is like, what if a batch grabs a forward dated entry?
You know, like, let's say, and we mentioned this before with the filtering thing, and part of this is on the accountants themselves, but...
I had two very like kind of specific questions. The first was like, do you want to design the revenue recognition system to...
put in the entries at a scheduled time instead of forward dating them all at once so that people don't accidentally grab forward dated entries? Or do we just want to say like, hey, we're trusting the accountants not to go batch up something in the future?

Robert Kihm   1:40
The latter.

Marcelo Torres   1:40
Or we, I mean, we could have some, okay, the latter.

Robert Kihm   1:43
Yeah, just create them.

Marcelo Torres   1:45
OK.

Robert Kihm   1:45
It's up to them to handle that there and like, and how they're handling future dated stuff and how they want to do it. It's just, it's so much simpler, like, and not relying on like a scheduled task that wakes up every day or whatever and says, hey, are there any new entries to post right now? It's just, it's fragile and stuff like that. So I would say just.

Marcelo Torres   2:00
Mhm.

Robert Kihm   2:06
Generate them.

Marcelo Torres   2:08
Okay, yeah, that I think that may be some kind of guard there's something that comes in once the whole lap is done. Okay, that was my big concern with the timing thing was just that we lose that data. But if we can trust the accounting team, so that's good. The other thing,

Robert Kihm   2:23
Yeah, and like we want to build a user interface that makes it easy for them to do the right thing and harder to do the wrong things. So, like thinking about the user experience and some intelligent defaults on things and, you know, allowing them to configure it the way they like. I like generally, I would say...

Marcelo Torres   2:28
Uh-huh.

Robert Kihm   2:42
You know, and Jeremy will have a more informed opinion on this, but to me, like the first thing that comes to mind is like, if I'm going into the batch UI and I'm like, hey, I want to batch up all these journal entries, I'm going to be like, I want all the unbatched journal entries up to a certain day, right? And maybe it's.

Marcelo Torres   2:53
Uh-huh.
Yeah.

Robert Kihm   3:01
today at 5 P.m. Maybe it's everything up to yesterday, which means everything that didn't happen or that did happen before the start of today. So one of the really interesting things from the user interface perspective and the querying is timestamps.

Marcelo Torres   3:21
Mhm.

Robert Kihm   3:21
So...
You know, when you think of when a user enters like an end date, and so let's just say today, the 14th, right? If it's the 14th today, and I say my end date is the 14th.
You know, me as a human thinks everything that happened on the 14th and before that. So that would be 1159, 59999999, right? And so it's basically, it's a less than tomorrow. Like that's what it is, right? Like from a SQL standpoint. If you don't...

Marcelo Torres   3:48
Mhm.

Robert Kihm   3:59
It like SQL by default, if you just provide it 12, 7, 14, so July 14th, it thinks it's midnight.
And so that's like the very beginning of the day. And so like, those are some of the things that need to be, like are challenging. If the, I don't know what we're doing on journal entries. Are we doing a date only or are we doing a date and time for the posting? Yeah, so the, and it's gonna be UTC.

Marcelo Torres   4:21
The day and time.
My understanding didn't plan.

Robert Kihm   4:28
Right? So I think we talked about in the conversations, like there being a time zone for the core business. So for us, it would be central US, right? So that's important because that translates everything into, okay, you know, when I say the 14th, it's everything before.

Marcelo Torres   4:38
Yeah.

Robert Kihm   4:48
You know, we go to the 15th in the central time zone, so all these time stamps with UTC, some it's gonna pull in data in the database that has a 7:15 date on it, because you know UTC is ahead, right? UTC is like goes to midnight before we go to midnight.

Marcelo Torres   5:00
Mhm.

Robert Kihm   5:07
Um...
So that like some of that, I just, I'm getting into some nuances here for like, those are things that can trip you up as you're building the SQL and you're like, oh, I'm just going to take, you know, the end date as it's entered by the user. And a lot of times that stuff needs to be translated into, well, no, it needs to be like, you know, it's like, it's central time. So central time.
you know, gets translated into UTC, and then that's the end date filter that I'm using. And if they give you a time, then you use the time. If they don't give you a time, I think you don't assume midnight, you assume everything on that day.

Marcelo Torres   5:45
Yeah, end of day.

Robert Kihm   5:47
And so getting back to my long story of when I go to the batching interface to say, hey, I want to create a new batch, a new journal batch. To me, a lot of it would be, let's just say it's today. I want every transaction, it defaults to today's date, and I want every unbatched transaction before today's date.

Marcelo Torres   5:48
Yeah.
Yeah, I mean, I think I'll include time and default time to be what would create that effect. But basically just that creates visibility for the end, so they know, okay, this is going to go to the end of the day. And then we can definitely do some defaults too that match that kind of stuff, like the end of week, the current end of month, to everything before yesterday, or like up to the beginning of this day, like those kind of things.

Robert Kihm   6:14
Help.
Yep.

Marcelo Torres   6:31
would be really nice too.

Robert Kihm   6:33
But that, I think there's something very useful there, whether it's Jeremy or one of those, one of the people on his team, like whoever does like batching today, like, you know, how do they do it? Right? What do they do? You know, what does it look like to them? And I don't know how much they do right now in the current system, but like,

Marcelo Torres   6:43
Mhm.
Ohh.

Robert Kihm   6:57
watching how they work can be really informative for the UI, especially to be like, oh, okay, well, since that's the default, you do it. And then, you know, kind of ask them some questions of like, what other ways do you think, you know, this is how we do it, you know, how standard is what we do.
What are some other ways that you could think of people doing it? Like, do most people like start batching in the morning for everything that happened yesterday and before? And that's how they do it. Or do they like batch at like 5.01 P.m. on a business day and you know, everything up to...
You know, 5:00, you know, gets included in it, like those types of things, and uh...
I like to think about, you know, what the user interface looks like for that and how configurable and, you know, like there's a lot of things in MJ about saving the user preferences and remembering what they had before. So there's something there about, oh, well, you know, we configure it so that we're always batching, you know, up to 5 P.m.
on the current day or where we default our badge to yesterday or the end of the week or, you know, who knows, the end of the month, right? Whatever it is, like learning what that is for them and then the system just like behaves that way. It's like a good user interface, right? It's like, oh.

Marcelo Torres   8:11
Okay.

Robert Kihm   8:20
You know, I don't have to think about it. It knows what I want to do. I very rarely have to change my defaults.

Marcelo Torres   8:20
Yes.
Yeah, that's my goal. I think...
getting the feature set in is, it's tricky because I want to just get like a UI that can handle the full feature set and then start shaping it into something that's good. Just because I need to verify that things actually work as well. But yeah, no, I agree with you. I mean, one of my things on my backlog is to sit down with Jeremy.
and have him walk me through, here's my regular path for closing out, you know, here's how I handle invoices, here's how I close out the AR, like those kind of things. So I can start modeling that as well.
It's just with the time we have, you know.

Robert Kihm   9:04
Sounds good.
Yep.

Marcelo Torres   9:07
But yeah, okay. And then the second thing that I that the second thing I wanted to discuss was.
So right now, Amith originally had this plan for multi-company journal entries. And as I mentioned to you last night, that doesn't work with our current locking system.
There's.
One way to support that, which would be to drop the status to the journal entry line.
entry level. That's a terrible entity name. Like journal line entry. I don't think we should do that.
But it's an option, and I wanted to run it by you.

Robert Kihm   9:50
So, tell me that again, so...

Marcelo Torres   9:52
Yeah, so right now...

Robert Kihm   9:53
We don't support multi-company entries right now.

Marcelo Torres   9:57
No, because if you think about the way locking works, you have to lock the whole journal entry, and so you'd be locking journal entries across companies whenever you batch. And that's a real problem.

Robert Kihm   9:57
So.

Marcelo Torres   10:12
Right now what we do is when we have an order with three companies, we make 3 journal entries.
And that was actually in the orders master plan, but in the Accounting Master Plan, Amith wanted a multi-company entry.

Robert Kihm   10:22
Snider.
So walk me through that right now since I don't have it in front of me, but what the original plan was for a multi-company entry.

Marcelo Torres   10:32
Mhm.
Yes.
So his idea, I don't really know how it worked, to be honest with you. Our system, like the structure of our system fundamentally doesn't really support it. It's just something he mentioned multiple times. And I think the idea he had was basically that for an entry, you could have multiple company IDs on it. And then the different accounts within that entry would.
let you know what company each account referred to or each line referred to. And I mean, the immediate issue is just when you lock that, you just locked an entry in three different companies.

Robert Kihm   11:05
I.

Marcelo Torres   11:09
And there's actually like other issues too because it's just like...

Robert Kihm   11:12
So, when he, when he said that, yeah, when he said that, was there also conversations about, like, do to do from, like, if you do that and you actually had a journal entry that supports, you know, entries on in on different companies?

Marcelo Torres   11:26
Right.
Mm-hmm.

Robert Kihm   11:30
then you don't need to have do to do froms anymore.
Like the whole purpose of the whole purpose of do to do froms is I posted it to my general, I posted it to my order sub ledger, right? Me being Betty, let's just say in this example, I was the I was the company on the contract, Betty sold Izzy.

Marcelo Torres   11:35
Yeah, you would flatten.
Mmh.

Robert Kihm   11:54
So I sold them Betty and I sold them Izzy. And so I spent $100,000 on Betty and then I had a $50,000 add-on on Izzy, $50,000 transaction.

Marcelo Torres   12:11
Yeah.

Robert Kihm   12:12
No, Daddy, Daddy said, oh.

Marcelo Torres   12:16
I think I understand your drift here, or where you're coming from. Basically, if you've got the D2D froms, but everything's in the same journal entry, they just flattened. And it's even hard. Yeah, I think that's just another layer of complexity. Basically.

Robert Kihm   12:29
Yeah.
Help.
The whole purpose of D2D friends was to address the problem that you're talking about though. It's like I post everything to Betty. I post $150,000 to Betty. I post $150,000 to the accounts that I'm tracking.

Marcelo Torres   12:43
Oh.
They're also to support.

Robert Kihm   12:47
But that I am good.

Marcelo Torres   12:51
Ohh.
Hello.

Robert Kihm   12:56
I'm here.

Marcelo Torres   12:57
Okay, sorry, it was it was glitching. They're also meant to support like the real case where someone pays 150 to Betty, but 50 of that is due to another company. Like that's the real underlying cause.

Robert Kihm   13:02
Yeah.

Marcelo Torres   13:12
As an order, we actually split the order into...
its own journal entry for each company because it actually has revenue due to each company. But when the payment comes in.
the way that it's applied could be in one big payment, like where the money actually goes through the Stripe system determines how we create that entry and where the due to do from entries come in.
But there is a real problem there, which is that we currently flatten our journal entries. And if you flatten journal entries with two companies, and there's due to, due from entries in there, they're going to flatten to 0. And so it's just like you'd have to have a special case for that. It really just makes sense to have one company per journal entry, to be honest with you.
Just makes a lot more sense. I just wanted to make sure you didn't have a...
A real objection to it.

Robert Kihm   14:06
So when you create an order that has products from different companies on it, would you create 2 journal entries?

Marcelo Torres   14:11
Uh-huh.
Yes.
And again, that's for locking. That's for locking purposes.

Robert Kihm   14:20
Okay, so you have two different journal entries. They're both tied to the same order, but they go to different companies and they can be batched separately.

Marcelo Torres   14:21
Because.
Test.
Yes, that's the important part.

Robert Kihm   14:33
Okay.

Marcelo Torres   14:34
It can also be marked as fulfilled separate. Well, actually, no, that the fulfilled is an orders thing. Don't even worry about that. Yes, the batch thing is what's important.

Robert Kihm   14:41
Yes.
Yeah, yeah.
You're segmenting it that way, so...

Marcelo Torres   14:47
Mhm.

Robert Kihm   14:50
Logically, as I'm sitting in the car, not looking at the screen, you know, yes, I think what you're saying makes sense. So I would, what I would say is write it up and say, like, this is what I want to do. I want to create multiple journal entries for a multi-company order. And each one is going to, you know, each journal entry is tied to a single company.

Marcelo Torres   14:53
Is this the?

Robert Kihm   15:10
they can be batched separately and you know that that's the value of it. And post that in the channel that has Jeremy and Amith in it. And so that they are like, basically what you're saying is I intend to do this and move forward in that direction.

Marcelo Torres   15:22
This is.
Well.

Robert Kihm   15:30
And then let them say, wait, here's why you shouldn't do that. But wait, but you've described it to me and your logic makes sense to me.

Marcelo Torres   15:34
Yeah.
And I have one more thing if you have a few minutes, and then we're in the end of time. Okay. So with that single company approach, you have multiple journal entries per order. Right now, the orders are designed to just have one journal entry ID field that tracks the associated journal entry.

Robert Kihm   15:44
I do.

Marcelo Torres   15:59
Now, journal entries themselves all reference the order with a soft key. So the question is, do you want me to have orders also reference their journal entries with an actual foreign key constraint?

Robert Kihm   16:14
So then you create like an order journal entries entity that is the order ID and then a journal. Yeah.

Marcelo Torres   16:19
I have to have a link, yeah.
I think that's the way to go though, yeah. But I just want to make sure.

Robert Kihm   16:25
Yeah, that's the way to do it if we're going to support multiple journal entries for order.

Marcelo Torres   16:31
OK.
On.
Okay.
Just writing that down. All right. But yeah, that was everything I had today as far as like big pressure questions.
I think the thing that's going to create.
Real complexity as time goes on.
The thing that's going to be the biggest, like...
UI and UX aim point where we have to develop something good is the timing.
But I also think like, it's not, it's very easy to create a system that the accountants can handle themselves. It's just how much do we want to automate on that side. But otherwise, yeah, I think this is good. And I'm going to bring in Ethan's input. I'll message you if I have any questions later today. I know you'll be out of commission, so like, no worries there.

Robert Kihm   17:16
Yep.

Marcelo Torres   17:25
I think I have a pretty good baseline understanding of the plan now and everything that needs to happen.

Robert Kihm   17:26
Yeah.
Thank you.
Yeah, so just what I would say is like iterate on this stuff, like state the things and the changes that you want to make. Like this journal entries one's a really good one. You can state that, you know, if it's already in the plan, you don't need to restate it, but like you are creating the forward-looking deferred revenue transactions. So these scheduled journal entries, you're creating them all at the same time that you're creating the.

Marcelo Torres   17:42
Mhm.

Robert Kihm   17:58
the order entries, right? When you've got these deferred revenue items, you're creating your order journal entries, you're going to create the schedule journal entries as well for the deferred revenue. And if it's a year-long subscription, you're going to create those 12 months of transactions forward dated, and it's going to be up to

Marcelo Torres   18:02
Yes.
Ohh.

Robert Kihm   18:17
the batch for what you include. If that's in the plan, you don't need to restate it. You're just implementing the plan as is. Anything that diverges from the plan, you should stay in that channel and say, like, here's where I'm diverging and here's why. And then, you know, what I would say is, as soon as you can, like show some

Marcelo Torres   18:28
But.

Robert Kihm   18:38
you know, something meaningful in the demos, like, even if it's only like 2, three minute demo, just like, hey, I wanted to show you some of these things that, you know, based on feedback I've changed and how things are working, like, just post those. Like, you know, even if you do like one thing and it's like, hey, this is just two or three minutes, and then, you know, a few hours later, it's like, and here's the next thing.

Marcelo Torres   18:53
Yeah.

Robert Kihm   19:01
You know, those things are pretty easily digestible and then you get feedback along the way.

Marcelo Torres   19:06
Yeah, so I mean, and I think it's definitely not, it's an adaption thing, it's tough. My preferred strategy is kind of to get a good, really good plan in place and then have Quad make it. So, but also, I mean, there are just a lot of features from Master that I'm missing. So right now I'm doing like a large revamp.

Robert Kihm   19:24
Help.

Marcelo Torres   19:27
And then the next demo should be like a lot of changes. It's just that might not be until Wednesday. I'm trying for tonight, but I just, it's tough.

Robert Kihm   19:32
Okay.
Okay.
Yep.

Marcelo Torres   19:39
I know, I know, I know, that's not ideal. I'm trying to work on how I approach doing the internal changes.

Robert Kihm   19:47
Like, if you're getting good results out of Claude, then that's fine. Yeah.

Marcelo Torres   19:47
This, this one's just, there's a lot of changes deep here, okay?
All right.

Robert Kihm   19:54
There's a balance in there somewhere, and you're almost never going to hit it spot on. You're going to be like, I waited too long for this, or, oh, you know, I didn't wait long enough. It's, you know, we're not looking for perfect here, or we're looking for progress. There's a reason why progress over perfection is a core value for us.

Marcelo Torres   20:09
Yeah, I mean.
My personal goal is to hit Ethan's requirements by Friday if possible. And I know that's not a cutover point, like not a hard cutover. It's just, it's the goal. I don't think it's realistic as far as the integration goes, which is hitting, these are the features that need to be in the UI in the database, the stuff that I can control very easily.
that I would like to have it possible by Friday.

Robert Kihm   20:37
Good.

Marcelo Torres   20:38
Yeah.

Robert Kihm   20:39
Yep, I'll just, I'll just keep us up to date on, like...
you know, how it's going for like that deadline. It's like, and I'm telling Ethan the same thing. It's like, this is a big risk item, and that's okay to say that it's a big risk item. It's like, you don't need to worry about offending anybody or anything. It's much better to be honest about this stuff and disclose it and give people options on things.

Marcelo Torres   20:47
Yeah.

Robert Kihm   21:02
And like, that's where the alternatives come out, right? Where it's like, people are like, well, you know, here's a faster way to do this. Or, hey, let's do something else. If we don't know about it until it's like, you know, past the deadline, then that's the part where we start thinking about it. But if we start thinking about risks earlier, it's like, it gives us a lot more flexibility.

Marcelo Torres   21:06
Mhm.

Robert Kihm   21:21
and there's more time for alternatives.

Marcelo Torres   21:24
Okay, yeah, I'll make a, I'll make a post. I'll be straightforward about the risk and where I see that right now, after I read over Ethan stuff, so maybe in like 20 minutes, and I'll also get those changes, and I think that's a good idea.

Robert Kihm   21:34
Sounds good.

Marcelo Torres   21:37
Yeah.

Robert Kihm   21:37
Yeah, and I'll spend some more time looking at that channel too, because I know that there was that, there was a bunch of things where my name was listed on it to be like, what do you think about this? What do you think about that? It's like, I need to spend some time thinking about taxes. And when you said FX, when you said FX earlier, was that foreign exchange?

Marcelo Torres   21:42
That's a lot.
Ohh yeah, have fun with that.

Robert Kihm   21:56
Is that what you were thinking?

Marcelo Torres   21:56
Yeah, foreign exchange. Yeah, just abbreviates.

Robert Kihm   21:58
Got it, so like the spot rates, yep.
Cool, just wanted to make sure.

Marcelo Torres   22:03
Yeah.
Yeah, not excited for those two processes. I mean, I am, but like, those are big.

Robert Kihm   22:12
Yeah, it's wild.

Marcelo Torres   22:12
Um...

Robert Kihm   22:14
Like when you think about currency risk, so talk to Paul Christman at some point. He's the Rasa guy. And just say, Robert told me to ask you about, you know, currency risk or currency, you know, currency exchange.

Marcelo Torres   22:17
Bro, I don't even like...
No problem.

Robert Kihm   22:35
I believe it's him, and I hope I'm remembering it correctly and attributing it to him, but he basically made a decision about currency risk not being that big of a deal on a project that he was on. This was like not Rasa. This was like outside of Blue Cypress, but

Marcelo Torres   22:50
Uh-huh.

Robert Kihm   22:53
And the day they launched the product was the day of Brexit.
and like the disconnection of the pound from like the euro and stuff. And it was like a huge, you know, dip at that point. And it was like, it was like, you know, everything that they had said about the risk was like, oh, you know, what is it like 10%, you know, currency fluctuation at most or whatever, that's an acceptable risk. And it was like, I don't know, 25% or something ridiculous that day.

Marcelo Torres   23:01
Holy.
That's what I know.
All right.

Robert Kihm   23:21
It was whatever it was, it was an outsized thing, and it was like the one day, so, but...

Marcelo Torres   23:21
Jesus Christ!
Right.
What is that? Agent razor, bro? That's crazy.

Robert Kihm   23:31
But it's really interesting as a business, like, you know, completely outside of this discussion and what you're building is like, when you accept currency, different currencies, like the risks that you're taking on, and you know, when businesses really do this, there's like this whole thing about arbitrage, right, which is like risk management, where you're buying like futures and

Marcelo Torres   23:48
Okay.

Robert Kihm   23:51
and things like that to like, you know, basically cap your risk. So you're buying insurance to make so that it's like, well, we can accept up to like, you know, 5%, you know, and that's what we're we've we basically paid paid 5% so that we don't have more than 5%. And, you know, so it's the same thing with people who would take things like Bitcoin.

Marcelo Torres   24:07
Ohh.

Robert Kihm   24:13
Like, I'm going to take Bitcoin for this, you know, as a payment, and obviously Bitcoin can be pretty volatile too, or any of the cryptos. But it's like as a business, and you're signing on and saying, okay, well, this is a price this at $100 Canadian, and the Canadian currency just dropped 10% against the dollar. It's like you just lost 10%.
Giving everybody attempts that discount in Canada.

Marcelo Torres   24:35
Yeah.
Yeah, I mean, it's pretty wild. And it's like crazy. Some problems like this in time zones, I don't know how we haven't solved this yet. And taxes. We all do these things all the time, and they're still like incredibly difficult to program and hard to automate. It's just like, it's surprising. It's just surprising.

Robert Kihm   24:55
Yeah, and and we in JavaScript one and JavaScript state handling sucks. JavaScript state handling and it's and it's floating point numbers, you know, like two things and it's like, oh, we pinned ourselves to a language that has no issues.

Marcelo Torres   25:01
Yeah.
Yeah.

Robert Kihm   25:15
But at the end of the day, most of this stuff is not material, and it's something that can be dealt with.

Marcelo Torres   25:16
I mean.
Yeah, I mean, it's finite, but I think it's just, you know, I'll have to look at it a little later this week, hopefully, by the way I get there.
All right, well, I think I'm good to get back to what I need to do. I have a...
You got enough from this, if you um.
to get started on improvements. And from Ethan, I'm sure I'll have enough kind of add some improvements in and then keep moving forward with UI and feature additions, which is what I'm hoping to get through today.

Robert Kihm   26:02
Yep, yeah, send the questions out when you got them.

Marcelo Torres   26:07
Yep.
Well, then, alright.

Robert Kihm   26:09
Alright.
Have a good afternoon.

Marcelo Torres   26:14
You too, Robert. Have a good flight.

Robert Kihm   26:15
Thanks, bye.

Marcelo Torres   26:17
Play.

Marcelo Torres stopped transcription
