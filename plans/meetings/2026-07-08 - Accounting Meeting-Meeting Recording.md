Accounting Meeting-20260708_120251-Meeting Recording
July 8, 2026, 5:02PM
32m 6s

Marcelo Torres started transcription

Robert Kihm   0:03
Well, there you go. I just, I'm telling you right now that I'm just, I'm having, you know, Claude analyze the repos and one of the comments is, this is a strong 24 hours.

Marcelo Torres   0:04
It's good.
Um...

Ian Zygmunt   0:14
Yeah.

Robert Kihm   0:15
Yeah.

Marcelo Torres   0:16
Yeah, well, it looks like that because it's about 48, but I'll take it. I'll take it. I mean, I pushed the entire engine changes there. So yeah, let me try to share the right screen here so we can get going with.
Some questions, and then some...
Some demo. So this is a, and I'll ask the questions as well, but this is the question file. I've just had it right in some open questions as we go. So this is a good one. It's basically.
When?
Right now in our system, when you get an order into confirmed, it will book the journal entries.
But Amith set up this flow for the order status, where it goes like...
quoted, maybe pending, confirmed, posted, and then something else. You know what, I'm talking like I don't know what it is.

Robert Kihm   1:15
Batched is the last one.

Marcelo Torres   1:17
Let me just pull this up real quick. Batched is the last one. Yeah.

Robert Kihm   1:19
Batched is batched is the absolute lock, right? Batched is it's gone to the GL.

Marcelo Torres   1:24
Yeah, and that's straightforward. Batched, like I'm not confused on where that goes. I'm pulling up the demo right now just so I can look at it and make sure I'm doing the right thing. I'm sorry.

Robert Kihm   1:30
Yeah.
Mhm.

Marcelo Torres   1:37
But we're having some confusion here on the orders is there's a confirmed and a posted status. And right now, what I'm trying to figure out is posted, okay, it's been put into a batch, or is posted something to do with the way the orders are handled, or is that just the journal entry has been created for this?
You know.

Robert Kihm   1:58
Yeah.

Marcelo Torres   1:59
It was my understanding.

Robert Kihm   1:59
Yeah, I need to, I need to go look in that, like to exactly what that flow is, but like very confident that you know, batched is the one that goes to the GL. I would say everything before batched is it's in the accounting sub-ledger once it's been created, you know, those entries have been created pending, you know, it's the first status it sounds like, and that one's the one that you know, it can have some changes to it, like, hey, they're still tweaking.

Marcelo Torres   2:13
Yeah.

Robert Kihm   2:24
in the order and things like that, and it's gonna update based on that. And then.
And then, you know, posted, I would expect, like, that's where you're not expecting any changes to the orders. Maybe there is some type of an exception process, but then batched is like, that should not change because what is in the GL as the summary needs to be tied back to the details.

Ian Zygmunt   2:32
****.

Robert Kihm   2:49
And so that's the thing that, you know, it goes, oh, it was included in this batch. This batch included these entries with these values. And it's like, yes, that's exactly the same values that I can go look at the details on that order and they haven't changed.

Marcelo Torres   3:04
Yeah.
I mean, so Amith did confirm to us that once it hits confirm, the journal entry is locked. As far as like, no, I'm sorry, once it hits confirm, the order itself is locked, so it won't change. So at that point, we make the journal entries. It's just going from that.

Robert Kihm   3:12
K.
Mhm.
Ajay.

Marcelo Torres   3:26
Confirmed to that posted section that I'm not really sure about yet, but...

Robert Kihm   3:31
So confirmed posted to batch.
Is that like that seems to be like, what's the difference between posted and batched?

Marcelo Torres   3:36
I, I'm.
I wish I had my notes right now. I don't have, I took physical notes, like, and I don't have them. I don't know, Ian, do you have notes on this? What were the, what were the...
The different statuses Amith gave us for orders, so we can all make sure we're on the same page on that.

Ian Zygmunt   3:56
I think I have it pulled up. Give me one second. It's in the it's in the repo.

Marcelo Torres   3:56
Um...

Robert Kihm   4:00
So, it was this.
And is this on the order? Is the status you're talking about? It's not like...

Ian Zygmunt   4:04
Ohh.

Marcelo Torres   4:06
Yeah, this is the status on the order, not on the journal entry.
So the journal entry does have, okay, here we go. Yeah, there's a journal entry batch which has like the pending, proof, sent, posted, failed, and canceled. But that's the journal entry batch. What we're actually looking at is the order itself has its own flow.

Robert Kihm   4:19
Mhm.
Yep.

Marcelo Torres   4:27
Um...
Here we go, this is going to be a...
Draft, quoted, confirmed, posted, fulfilled, and voided. Those are the different flows. I'll bring this over here.

Ian Zygmunt   4:38
Yeah, but he said we were changing something on some.
Hold on, can you see what it looks like again? I just remember him saying that, like, we were basically changing and we gotta keep them locked. Ohh, what was it?

Marcelo Torres   4:53
Confirmed was the locking point for orders because that's that confirmed is the contract is signed. That's where the journal entries get created.

Robert Kihm   4:55
Okay.

Ian Zygmunt   4:56
Yes.

Marcelo Torres   5:02
Pardon me?
The concern, the confusion was basically...
After, you know, I'm just looking at it like, I'm guessing posted is the journal entries. And for now, I'm probably going to keep it that way. Where posted is just, okay, we received confirmation that the journal entries are in, you know. But I just wanted to check and see if there was any confirmation there.

Ian Zygmunt   5:15
Yeah.
Mm.

Robert Kihm   5:27
So confirmed you're generating the sub-ledger entries posted, I would say yes, it's most likely the batch. I'm asking Claude to go check the notes and things to see if it comes up with anything different. But I think that's

Marcelo Torres   5:41
Yeah.
See, my issue with that kind of thing is like, this is kind of a linear flow right now, except for voided. Voided can only come from drafted and quoted. But he presented this to us as a linear flow. But hosted being, you know, like an order can be fulfilled before it's batched.

Robert Kihm   6:01
Yep.
Yep.

Marcelo Torres   6:04
But it's very unlikely that an order is going to be fulfilled before it's posted, unless it's immediately fulfilled, in which case you need to flow to post it first to get those journal entries in, and then you can do the fulfilled flow. And the fulfilled flow is going to be like marking movement from deferred revenue to non-deferred, to like realized revenue.
Revenue or whatever the the revenue account.
Like.
I think my logic, you know, I feel like the logic there is sound for posted to be the journal entries end.
I just...
Yeah, I just don't have anything on it, so...

Robert Kihm   6:43
Yeah.
Yeah, I think that's a that's a legit comment is like, does it?
Can it be fulfilled before it's posted, right?

Ian Zygmunt   6:54
Yeah.

Robert Kihm   6:55
And what does that mean? Like, do you, you know, is it all additive, right? Basically to say like, oh yeah, it got posted and then it got fulfilled, but fulfilled means posted. But what if it got fulfilled, but it hasn't been posted? You know, if that's the case, if you can have that, then you basically need two fields.

Marcelo Torres   7:08
Yeah.

Robert Kihm   7:16
Right, you know, you would have to have that because, like, one can happen without the other, like, they're not, you know, dependent on each other.

Marcelo Torres   7:18
Yeah.

Robert Kihm   7:28
I'm just doing some research on this to see what he was thinking about around posted and fulfilled.

Marcelo Torres   7:35
Yeah, certainly good, and I apologize. I mean, I I had... Oh, wait, I see it. Hold on.

Robert Kihm   7:42
Should be.

Marcelo Torres   7:45
Side of working at home, I guess.
Not worth it.

Robert Kihm   7:50
Yeah, one thing about working from home too, just give me a heads up on this stuff ahead of time when you're planning to work from home. Just because I need to know where you guys are and technically you should be in the office. And so it's an approval process ahead of time to be like, hey, I need to work from home today and just, you know, send me the note or if an emergency comes up or whatever,

Marcelo Torres   7:55
Oh.
Uh, I'm sorry.

Robert Kihm   8:09
and you just need to do it. Just send me a note saying, hey, this came up and I need to do it. Just because, especially, you know, I get questions and it won't happen this week because I mean, he's not in the office, but like, hey, you know, is this guy working from home today? And I'm like, yeah. And he said, did you approve it? Yeah. It's like.
You know, otherwise it's like, you know, because basically it's going to happen if Amith is looking for you in the office and wants to be with you. But generally, it's just a good practice. Like you guys are supposed to be in the office during core business hours. And when you need to work from home, like we got flexibility. I just need to know about it. And I need to know about it ahead of time. So I can say, yep.
good or if something else comes up to say like, hey, like we need you in here at least for a couple hours for something.

Marcelo Torres   8:56
Yeah, I'm sorry, that's completely on me. I'll make sure that happens next time. This was a, I had a stomach bug and, you know, fighting through that. So, not expected, but totally understand.

Robert Kihm   8:59
Yep. Cool.
Yeah, no, I legit reason, just let me know. And I appreciate people, especially if you're not feeling good and the rest of the team appreciates, you know, like if you're not feeling good to like, you know, hey, I'd like to stay home because I might be infectious. Like, yep, good, good, good reason.

Marcelo Torres   9:09
Will do. I apologize.

Ian Zygmunt   9:16
Yeah.

Marcelo Torres   9:22
Yeah.

Robert Kihm   9:23
Take the team out, bad bad bad things happen, especially as especially Ian would be really bad because he's going on vacation next week.

Marcelo Torres   9:26
Yeah.

Ian Zygmunt   9:31
Yeah, you can't even stick this week.

Marcelo Torres   9:32
Yeah, bro, I can't have that happening.
All right, we'll make sure that happens.

Robert Kihm   9:39
Yep.

Marcelo Torres   9:43
So I pulled my notes and it posted he wanted that to just be that the journal entries are in. So I'll make that update. I apologize. I thought I left that notebook at work.

Robert Kihm   9:53
That's okay. You are prepared.

Marcelo Torres   9:54
Um...
Okay.
There's a few more of these than I expected. That's on me. All right, I have another pretty straightforward one. It's not in my list, but it's pretty straightforward. The...
Prices right now, we don't store prices in the product table. And it's like it wasn't in the schema. It's not just like a dismissed, like this was just missed in the plan. It wasn't considered. To me, I would assume that you guys want that to be stored in the product table, but I don't actually know how you do pricing. So I'll show you.

Robert Kihm   10:30
Mhm.

Marcelo Torres   10:38
What it looks like right now?
Is stop.

Robert Kihm   10:43
So it's going to be, I will guarantee you, it's going to be more complex than...

Ian Zygmunt   10:43
It.

Robert Kihm   10:48
Just a single price in the product table that might be a default price, but there will be things like it was priced from this from January to February, then we change the price, and you know, and then there could be like, you know, different attributes, you know, that have pricing, like...

Marcelo Torres   10:53
Huh.

Robert Kihm   11:09
Does the model for product support like matrix-based products? Like, you know, this is, you know, the 2026, you know, Blue Cypress T-shirt, and then there's like, and then there's a medium, and there's a small, and there's a large, but they all kind of like inherit from the, like...
the root product, but then there's like, you know, this is a small blue version of that t-shirt. Like, is there anything in the model that supports that?

Marcelo Torres   11:37
No, not right now. No.

Robert Kihm   11:39
Okay. So right now, there are individual products, you know, so like there would be a small blue, you know, 2026 Blue Cypress T-shirt. And that could have like a set price, but usually there is like, you know, a table that's like price history and things like that, but it'd be like,

Marcelo Torres   11:49
Yeah.

Robert Kihm   11:57
You know, go find the price based on certain attributes.
Um, let's see this.
So one thing, just going back to fulfilled and posted, it sounds like we are going to need to separate that.

Marcelo Torres   12:10
Uh-huh.
Okay.

Robert Kihm   12:15
So like, there is probably an order status and then there's like an order like financial status, something like that, you know, related to, you know, one is related to the fulfillment side of things and the other is related to the GL entries, you know, and so it almost says.

Marcelo Torres   12:29
S.
Mhm.

Robert Kihm   12:36
Sounds like we're going to need to separate those. So like you can have a draft order, you can have a quoted order, you can have a confirmed order, and then you would have a fulfilled order.
or voided and then I wonder if we then have like a financial status.
And then, what would it be? It...

Marcelo Torres   13:00
Yeah.

Robert Kihm   13:01
It would be like you're not generating the GL entries until posted, right?
No, you're not dinner until confirmed.

Marcelo Torres   13:08
So.
That confirmed they get generated. Posted was meant to be.

Robert Kihm   13:12
So once an order status goes to confirmed, they get generated.
Um...
And then that order can still be fulfilled.
Or it could be voided.
And then, so once you have the financial status, it would be...
Basically, like...
There's an existence and then there's posted.

Marcelo Torres   13:45
Posted is, yeah, yes. Well, even even then, it would the financial status would just be theoretically.

Robert Kihm   13:49
So.

Marcelo Torres   13:55
I guess, yeah, created could be in there, but like...
The time between creating and posting JEs is so short.
Um...

Robert Kihm   14:07
Not necessarily, because you might not batch date. Like you could batch often, but you might not batch often, right? You could actually batch weekly or you could batch.

Marcelo Torres   14:07
It might just be worth it.
Well...
Well, posted wasn't meant to be connected to batching. Now, if we did a financial status, and I'm seeing where you're coming from with this, if we did a financial status, we might want to include batched in there, but posted was just meant to be, is the journal entry in the accounting system. Well, you know, at least from the way I read it.

Robert Kihm   14:21
Okay.
So, what's confirmed then?

Marcelo Torres   14:38
Confirmed is is an so yeah, it's a these things are overloaded. Confirmed is the order has been confirmed with the client. Posted is the order is now posted in our accounting.

Robert Kihm   14:45
OK, so, so confirmed, so confirmed triggers the posting operation, so that's why you're saying the time between it is so short.

Marcelo Torres   14:51
Yes.
Yes.

Robert Kihm   14:55
Right. OK, so confirmed to posted. So if that's true, then it probably is sequential and dependent, right? Because like confirmed to posted, unless it fails, like you're not going to go to fulfilled. Like you can't fulfill an order that hasn't been posted, basically. Like that would be the rule.

Marcelo Torres   15:05
Yeah.
Right.

Robert Kihm   15:17
So, maybe it's not, you know what I mean? So, so maybe this is okay, and then, and then you could go posted and and voided.

Marcelo Torres   15:22
Yeah.

Robert Kihm   15:28
And I guess you could go void it at any state, and...
and it wouldn't really matter. You could go draft and voided. You probably wouldn't go draft avoided. You probably just delete it. Same with a quoted one, because you probably wouldn't void it. Once it's confirmed, it can only be voided, right? So confirmed, posted, fulfilled, like that has to be voided.

Marcelo Torres   15:51
Well, actually, the way Amith described that to us, draft and quoted were the only things that could float avoided. Now, I'm not saying that's right. I'm just, I mean, I see what you're saying. It's like, why would you not just delete those? But I think he had meant it to hold those. His idea behind that was confirmed and fulfilled.

Robert Kihm   16:00
Okay.
OK.

Marcelo Torres   16:11
I mean, confirmed and posted can never be voided because at that point, it's a contract.

Robert Kihm   16:15
You would create a reversing entry. So that's the, okay. So that's where he's going, confirmed as pencil to pen.

Marcelo Torres   16:19
Yeah, yes.
But see, I like the way you're thinking though, because there is a problem here with the overloading of this order flow and the financials. Like a person who's just managing orders and just selling a product is going to look at post it and wonder what that even means. They're going to want to be able to just say, okay, I have an order. I need to fulfill this order. Let me do that.
and let someone else handle the financial behind that. So it is a little bit weird, I agree.

Robert Kihm   16:48
But it's fine, like confirmed posted like.
You know, that's a training issue more than anything, and like the UI is going to just have to present the ones that are ready for it.

Marcelo Torres   16:55
Uh-huh.

Robert Kihm   17:01
Like technically you could fulfill it as soon as it's confirmed.
And I, and I guess you know.
I think we keep this right now as it has to go through each stage. Like once you get to confirmed, it has to go to posted before it goes to fulfilled.
And I think that's just a rule that we put in there. And we could put business logic in place that says, hey, if they want to go to fulfilled and it's not posted yet, you have to post it. Like there could be something in there, right? Like you could basically say like, and then what you would do is you would move it to post it and then you'd.
and then you'd fulfill it. Like we could put that, and the user interface could basically automate that piece of it. But I think what you don't want to do is you probably don't want to have it go to fulfilled if the journal entries haven't been created yet.
You know, just, just to just because that's the rule that we put in place, but you can put processes in place that automate those, you know, that that thing. I get what Amy is coming from, so drafted and quoted, you could delete, but if they wanted to keep a record around it and...

Marcelo Torres   18:02
Yeah.

Robert Kihm   18:20
and keep that as history, they would move it to voided, or they could delete them. But once it's confirmed or posted, you have locked that order. It is staying there. The way that you do it is you create a reversing, like you basically create a credit order, and it's basically going to be like a negative one of that product. And
That's going to be the refund track that way. And it's basically double entry accounting at that point. That's the PEN part of it, where you can't remove what's in PEN. You have to reverse it.

Marcelo Torres   18:51
Yeah.
Yeah.

Robert Kihm   18:56
Okay, this was helpful. Yeah, appreciate the context you're providing there.

Marcelo Torres   19:01
Yeah, of course. Yeah, I know. I appreciate you answering the questions here. It's just, it's a complicated system and there's stuff we haven't, you know, you can't plan at all.

Robert Kihm   19:07
Yeah.
Yep, as you're saying, just like with pricing, right?

Marcelo Torres   19:13
Yeah, that, I think, I think that's, yeah, we'll come back to that and it'll be fun, I'm sure, when taxes come around, probably.
Um...
I'm sorry, I'm looking through the questions. I told it to add 2 questions to a file for me for later. I have 10. So, you know, as happens.
Oh, okay, yeah, this is the other one. Rejecting batches. So right now, what's happening with the batch, and I think I have the answer to this. I just want to make sure it sounds right to you. When something gets batched, the entries get locked.
But we need approval. So here's the issue, right? If I lock the entries, the way the database is designed, they don't unlock. Like that's it. They're done. So what I can do is gate locking those entries on the task.
But now we have the reverse issue of, the issue is like, if I lock the entries and put them in a batch and I make a approval task and the user rejects that task, they're now locked. So it's not like they can just go back. And we can't just create, I mean, we could do some weird thing with creating new JEs.

Robert Kihm   20:37
How are you locking the entrance?

Marcelo Torres   20:41
So there's a trigger in the actual database. Once you create this like locked flag, it's done. Like it's not, it's immutable at that point.
I can, I can read into this a little bit more, but my understanding is simply you lock the entries by flipping a flag, and once that happens.
They're pretty much gone.

Robert Kihm   21:11
So when you're approving a badge.
where you would say things like, oh, this doesn't look right, hey, we need to go back and dig into this, or it didn't include certain things. Maybe we need to make sure we created some reversing orders, you know, and then we regenerate the batch, right? And then that would be like for approval, so.

Marcelo Torres   21:27
Yeah.
Yes.

Robert Kihm   21:36
Um...
Yes, there needs to be a way to either you don't apply the lock. There is levels of locking, which is like, hey, it's preliminary locked because the batch hasn't been approved yet. But if as long as it is approved, it's like, you know, you know, it.

Marcelo Torres   21:48
Uh-huh.

Robert Kihm   21:57
Until it is approved or rejected, it is effectively locked. And then if they approve it, which should be the default flow, right, the golden path is that it should go flow through to approval, the lock remains, but there needs to be a way to say like, oh, it got rejected, I need to.
you know, remove the locks. If you put locks in place, you need to remove them because effectively, without being denied, that batch really doesn't exist from a financial standpoint, right? Like for your orders, because now in the notes and what you've been talking about,
What happens after a batch has been rejected? Do they then get to, like, is there a regenerate batch? So it's still the same batch, but it's the ability to regenerate it and create the summary entries again.

Marcelo Torres   22:47
Oh, that's a good point.

Robert Kihm   22:52
Or is it like, no, like that's a rejected batch and we have to create a new batch?

Marcelo Torres   22:57
So.
I'll be honest, I don't even think we have that level of complexity in the plan. My idea for it was when they reject the batch, the journal entries just go back into the ledger. But there is something to be said for maybe somehow tracking that rejected batch and allowing someone to add in a few journal entries to it.

Robert Kihm   23:13
Yep.

Marcelo Torres   23:23
Like maybe they want to just pick up a few corrected journal entries and add it.
Um...
There's a lot, there's a lot of thinking that could go there because you could also just make it so that like a batch that's waiting on approval can have entries added to it. But you also have the other question, the opposite question, which is like, if I create, let's say I want to, I need a reversing entry. I'm like, I forgot to create a reversing entry for this item. I create the reversing entry, I add it to the batch.
Now I have an item that's like, like...
Here's my batch entries. Here's some random journal entries that came in normally, and here's my reversing entry. I pull this up into the batch. There's like a little bit of a temporal disconnect in there. And I don't know how accounting works, if we want that or not, or if we can even accept that.

Robert Kihm   24:09
So, so here.
I'm not an expert and I didn't stay in a Holiday Inn Express last night, but from my history on things, the way that I believe this should work is when you have a batch that has not been approved yet, that is something that you are working on and you can throw everything that's been included in that batch out.

Marcelo Torres   24:24
Uh-huh.

Robert Kihm   24:35
you can regenerate it with whatever entries you decide, right? So like, you're like, somebody looks at it and decides that it's rejected and it's like, nope, we're not going to move forward with this. You need to go back and like suck in some other entries. And it could be like, you know,
Oh yeah, like, you know, three more float in because like maybe somebody was like, I wanted to get the jump on it and I did it at 5:00, but you know, we had this order that came in at six. And you know, basically when you're batching, there's like this idea of, okay, what should be included in this batch? And it's all your candidate list is all the things that have not yet been batched because anything that's been batched.

Marcelo Torres   25:13
Yeah.

Robert Kihm   25:19
is and is and is even in you shouldn't have multiple batches open at the same time for like orders, but like let's just say anything that has been included in a batch so far is not a candidate. Everything that's unbatched is a candidate, and then you're going to create some filter, right? Like

Marcelo Torres   25:27
Huh.

Robert Kihm   25:39
hey, I'm batching this for last week. I'm batching this for everything that's in the system today. Maybe you would say that. It's like, I want everything batched up. Like, you know, and so like to the up-to-the-minute, I want everything in. More typically, it's probably going to be like some time bound, like I'm batching on Monday morning for everything that came in until Sunday night, something like that.

Marcelo Torres   25:47
Uh-huh.
Uh-huh.

Robert Kihm   26:02
And then maybe somebody goes in and it's like, oh, yep, so I created this batch. I looked at it. There's something missing in here. Hey, you didn't do that credit for Widget Co. Let's get an order in there.

Marcelo Torres   26:08
Yes.

Robert Kihm   26:20
dated yesterday and for the credit memo and get that in there and let's make sure we include that in the batch. At that point, you regenerate the batch. So whatever you did, like that basically said, hey, go gather me all of the orders that need to be batched.
you would now like regenerate it and it would then pick up that order. So your filters, however you're doing that, you'd want that included and then it regenerates the summary entries and includes that new one in the batch. So that's typically how it would happen. So this idea of I've got an open batch record, it's open, it hasn't been approved yet.

Marcelo Torres   26:52
Yeah.

Robert Kihm   27:00
There should be like a regenerate, like, you know, it goes out and searches for all the things that based on the criteria you provide to include those in the batch.

Marcelo Torres   27:10
Okay.

Robert Kihm   27:12
And then once it gets approved, it's like locked and there are no changes to that. But up until that time, you could have like...
a lock as long as that thing could be reversed, but once it's in a badge that's been approved, there is no reversal of that lock.
On the order and on the order journal entries, does that make sense?

Marcelo Torres   27:34
Yeah.
Yes, it does. There's definitely a lot there. Like.

Robert Kihm   27:40
Yeah.

Marcelo Torres   27:46
Yeah, like, I mean, I don't want to get too into it because it's 1230.

Robert Kihm   27:50
Yeah, I actually need to run. I got another meeting, but send me the questions that you need answered. If you want me to review this doc, I'll go in it in more detail. Hopefully there's some helpful things in this transcript that help with some of this stuff, but let me know what else you need. For pricing,

Marcelo Torres   27:52
Okay.
Yes.

Robert Kihm   28:10
Um...
It's actually been specifically excluded from this plan for like the initial implementation. Like we're only setting pricing at the order line level. Like so basically what it is, is like there are no prices on products. The order is going to set the price for now. Eventually there will be, and it will be complicated, you know, with all of these things, but for now it's like you don't need to worry about it.

Marcelo Torres   28:21
Yeah, OK.
Sounds good. Yeah.

Robert Kihm   28:35
You just need to know that the order line will have a price on it. And how that price gets in there right now is basically going to be typed in by somebody or it's going to be set at the order line level and the product, and it's not going to get calculated from the product.

Marcelo Torres   28:52
Uh-huh.

Robert Kihm   28:53
So that I again, that's just the conversation I had with Claude. So like it was specifically excluded.
So yeah, I would just say like, you don't need to worry about that on the product. You could pull like the description, the name of the product and stuff like that for the product ID, but someone's going to enter the order line price. And then there's probably an extended price. It's like, you know, whatever quantity times price and stuff like that. There could be discounts, there could be tax amounts and stuff like that.
probably all of that stuff is just going to be like added to the order at the time it's generated. And eventually there will be a whole product pricing model with tax model and all that other stuff that gets built out.

Marcelo Torres   29:36
Yeah, okay. Yeah, in the future, because I know you need to go, we really need to, we need to discuss the batching and there's a lot of complexity there. But one thing we should really think about is like, I know, I don't remember who it was, there's somebody who wanted to start using this system soon. And

Robert Kihm   29:47
Yep.
LXP.

Marcelo Torres   29:55
One of my, I'm sorry.

Robert Kihm   29:56
Learning Experience Platform, LXP.

Marcelo Torres   29:58
Ellie, yeah, LXP. So one of my concerns is our approach right now is very much get a baseline, test, and then add features as we go. We're going to end up rewriting the schema. Like just from the stuff you've talked about batching, we're going to end up rewriting parts of the schema.

Robert Kihm   30:10
Yep.
Yep.
The.

Marcelo Torres   30:29
But that's, we've accepted that this is difficult, but the scheme is a concern.

Robert Kihm   30:29
The.
Yep. Surface the risks, right? But like part of this, we're probably not going to do it until we shake it out with them too. So like as much as we can anticipate and put the best thing forward, that's what we do. And they're going to also put it as a risk on their project that, hey, this stuff might not be ready for prime time.

Marcelo Torres   30:39
Okay.

Robert Kihm   30:50
right away. But that's why we just got to iterate through these things as fast as we can. And yeah, just do what you do, like surface these risks, like, hey, I don't know what happens here. I don't know what happens here. And like, yeah, we're going to make some changes. And we've basically got like another, you know, week and a half to do as much as we can with that.

Marcelo Torres   31:08
Yeah.

Robert Kihm   31:10
And then go from there, right? And so, like, you know, if we get to the end of next week and we're not ready for it, like, you know, that's when we need to be like telling them. It's like, yeah, we still think a bunch of stuff's in motion. And they might make a decision to say, like, well, we really like you to figure those things out before we take it on. And that might.
Push their product, their dates, too.

Marcelo Torres   31:34
Okay.

Robert Kihm   31:35
But yeah, all we can do is the best we can to work through this as quickly as possible, but we need to do it right.

Marcelo Torres   31:41
Yeah.
All right.

Robert Kihm   31:42
Yeah, sorry guys, I gotta run. Bye.

Marcelo Torres   31:44
Yep, all good. Thank you, Robert. I appreciate it. Dude, okay.

Marcelo Torres stopped transcription
