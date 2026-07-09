> ✅ **PROCESSED / READ — 2026-07-09** by the accounting-engine-dev agent. Distilled into
> `plans/2026-07-09-robert-meeting-decisions.md` (+ accounting companion); plans, QUESTIONS (Q12–Q19), BACKLOG
> (Tasks 32–35), and BUGS updated; code shipped (moving-window presets on Batch Status + Order History; order
> naming). See `_PROCESSED.md` for the index.

Accounting Meeting-20260709_121044-Meeting Recording
July 9, 2026, 5:10PM
38m 34s

Ian Zygmunt started transcription

Robert Kihm   0:03
But it's a broader scope, right? Especially when it's biz apps common and it's like person is intended to be like, you know, your customers, your prospects, people, like all of those things. Whereas.

Marcelo Torres   0:07
Mm-hmm.

Robert Kihm   0:15
The CFO in the Accounting app, I don't think would ever be anything other than external, right?
So, or excuse me, be anything other than internal. Excuse me, I correct that. So, like, it's kind of, it's the scoping level, right, of like, what is the universe of, you know, valid users? And I would think that it's either employees or users, and I think employee makes a lot of sense.

Marcelo Torres   0:25
Yeah, yeah, okay, right.
You're good.

Robert Kihm   0:44
But if we're using roles, like roles are tied to users.
But it sounds like in the company accounting profile, the way we're controlling it is in this company, this is the CFO, so the ultimate reviewer of things.

Marcelo Torres   1:01
The.

Robert Kihm   1:01
I would just think, yeah, that should either be a join to the employee table or it should be a join to the user table and I think employee is the correct one.

Marcelo Torres   1:16
I kind of lean, you know.
I guess my thinking here is like...
We probably want something that's like a role is token.
Detected.
Actually, it might not be, I guess. I don't really know the system works.
Yeah, that, that's I, I'm just thinking like...
My mind goes to security with these kind of things. Like who can change this linking on the accounting company profile? How do we manage those permissions? And I really just don't even know anything about that system. And I can go try to figure it out. I just

Robert Kihm   1:45
Mhm.

Ian Zygmunt   1:47
Just like, you know, okay, I'm going to provide like that.

Robert Kihm   1:49
S.

Ian Zygmunt   1:53
I really just don't even know anything about that system, and I can go try to figure it out. I just...

Marcelo Torres   1:58
I don't even know, like, if that's the correct way to handle this thing, because...

Ian Zygmunt   2:00
If that's the correct thing, because...

Marcelo Torres   2:03
Whoever is the CFO can pretty much write to the general ledger.
Which means it's a.

Ian Zygmunt   2:08
That's it.

Robert Kihm   2:08
Yep.

Ian Zygmunt   2:12
It's a robot.

Robert Kihm   2:12
Well, and you know, again, in a big company, the CFO is probably not going to be the reviewer on a lot of these things. So it's interesting that we've actually like coded something to say, you know, who's this? So it says the CFO approver. So, and I guess that's what it is. It's like the CFO has designated this person, you know, as the approver for this. So it's not necessarily the CFO.

Marcelo Torres   2:12
It's a real like...

Ian Zygmunt   2:19
But.

Robert Kihm   2:34
which I think is fine.
From a security standpoint, when you're talking about entity records, you are talking about users and roles and what permissions they have on it, right? You can give them, you know, CRUD permissions, and then you can go a step further with row-level security to filter, like, hey, you know, you actually are...

Marcelo Torres   2:54
Mm.

Robert Kihm   2:58
an Admin for the Betty company, and you can do all the things in the Betty record for the accounting company setup, but you can't do it for the other companies. Whereas somebody else might be like the admin, like the Accounting Admin role maybe has access to everything.
right? And so they're going to have like CRUD permissions on, you know, that entity and they can do those records and there's not going to be any row level security filters blocking them or reducing their footprint. So yeah, you think about these ideas of regular accounting users, accounting admins, maybe more granular for like some companies you get to do this and other companies you don't.

Marcelo Torres   3:18
Yeah.

Robert Kihm   3:39
So, in a really large setup, yeah, like you, the Betty, you know, you would be the Betty CFO approver.

Marcelo Torres   3:40
Yeah, I mean...
What's important to me is like, do we have an existing role system that I need to look into here? Like companies are going to be marking someone as Admin and that's the person that I should limit editing this field to, or is there nothing there and I need to kind of build that out so this makes sense.

Robert Kihm   4:03
You have users and roles, so users and user roles with the roles table as like, that's the standard MJ security functionality. That's going to, you know, can you create records in this end? Do you have access to this entity at all? Can you read anything in there? Can you create records? Can you update records? Can you delete records?

Marcelo Torres   4:10
Mhm.
Okay.

Robert Kihm   4:24
Um, those are that, that's the very base level permission on entities, and that's all tied to users.
If you need to build out something beyond that specific to accounting, that should have been called out in the plan unless we missed it. Otherwise, you should expect that it's using users, roles, user roles, and the entity permissions, and then if necessary, row-level security within that.
So, explore that and what and what that provides you, and then say, like, I still have concerns about, you know, more granular permissions than that.

Marcelo Torres   4:55
It.
So yeah, my thinking just goes towards the user, right? The company is our client. So the question is sort of, I use this role system, no worries there. Do I need to create a new set of roles within for accounting that we expect the front-end user to create on setup? And then that becomes sort of
something I need to document.

Robert Kihm   5:25
I would expect the app to create, you know, specific roles to the application. So the open app would be like, hey, this app has these roles. So like at a minimum I could see like an accounting user and an accounting admin, right? And then whether there's like more than that, you know, like a super, you know, super type of admin or like some other

Marcelo Torres   5:28
Okay.

Robert Kihm   5:49
in between roles, be like, here's your basic permissions that an accountant would need. Here's like an accounting manager or like elevated permissions, and then there's the admin, which is the super user. Like those are the ways that you think about it. And I think when we install an open app, like most open apps would have.
roles that they're adding that are like, so MJ ships with very generic roles, right? UI, developer, integration, and the default settings are things like everybody gets access to UI and UI pretty much has read access to everything and then it has some.
additional permissions for like, you know, hey, you're writing history entries, log entries, you've got your user views and things like that. You can create and update and delete your user views. So UI has permissions to those. And then.

Marcelo Torres   6:45
Mm.

Robert Kihm   6:45
When a user gets created, there's a bunch of defaults that say, hey, like when a user logs in, it's the first time they've logged in, they're allowed, we're going to create like they're basic, like in the way that we've configured our systems by default, you're added to the UI role right away.

Marcelo Torres   7:03
Yeah.

Robert Kihm   7:03
you can configure it to have like, you know, applications that they're enrolled in right away too. Like those are things that you can control at like a global level for an installed MJ Explorer.
For.

Marcelo Torres   7:18
OK.
Okay.

Robert Kihm   7:20
Like, that's like.
Those are very broad permissions, right? Like, we don't want that for most applications.

Marcelo Torres   7:26
Yeah, I...
I'll create my own tree of rules within Accounting and handle that.

Robert Kihm   7:36
And so, yes, in that case, like your app in the migration files, you know, should create those, right? And it's laying those things down. It's like, oh, I've created a bunch of rules in the table and they're, you know, for the accounting app. And then we'll do the same thing for order entry.

Marcelo Torres   7:54
Yeah, and as it.

Robert Kihm   7:55
And then the question is like, do we need more granular permissions than what is available? But crud permissions plus row level security is pretty powerful. And then there's probably rules within, you know, hey, you need to be an accounting Admin to change this status field to this value, or you need this role to be a batch approver type of thing.

Marcelo Torres   8:18
Yeah.
And I'll help Claude with that, and also we'll backlog a setup process, so there's something to kind of explain to users, the roles you need to set, and we'll have settings screen as well.
Okay, I have a few open questions.
Oh.
reversals right now are filed at the date of the creation of the reversal. When we had talked last time about batching, we mentioned that you might want to be able to cherry pick a reversal into a batch.

Robert Kihm   8:45
Yes.

Marcelo Torres   8:52
But...
You know it that that just it it really strikes me as off to have sort of sort of discontinuity in the batches that we're sending to the general ledger, so I just wanted to like come back and and really verify whether you want that functionality or not.
Um...
In kind of gap world, I don't know enough, but my mind tells me that, like, it should really be a continuous flow of journal entries.
Um...
But again, I don't know. And maybe this is a question you need to revert right over to Jeremy.

Robert Kihm   9:30
So, I'm not, I'm not, yes, we definitely should get Jeremy's opinion on these things, yeah, but the...

Marcelo Torres   9:33
I'll write this to Jeremy.

Robert Kihm   9:38
But what I'm saying is, let's say you created a batch at 5 P.m.
right, for the day's transactions. And then you recognize that, oh, actually there was a reversal that needed to come in. And we did that at 6 o'clock.

Marcelo Torres   9:45
Mhm.
Okay.

Robert Kihm   10:06
Maybe there is a case where he would want that. I don't think so. I think it literally is things like, hey, I'm reviewing the batch. I noticed some issues. Let's get those things corrected. Get the team to like post whatever the correcting entries are on that same day, like, or whatever like period the batch is, if the batch is a week, like maybe we only batch once a week.

Marcelo Torres   10:10
But.

Robert Kihm   10:27
And it's like, hey, you're doing a bunch of things. And now I need to regenerate the batch. So I haven't committed it yet or anything like that. I'm still, this is an open batch. I'm just working through things. When I saw the first batch, it didn't seem to work out the way I expected it to, made some corrections, regenerated the batch. Now I'm happy with the numbers, post it.

Marcelo Torres   10:48
OK, understand. OK.
I'm sorry, just taking a note. So you also mentioned having the filters, right? That time span filter system, which, you know, that's not in yet. That's going to take, I think, a bit of a schema update, but it's definitely the right way to go. One question I had is, are we allowing arbitrary time spans? So you mentioned continuity.
Let's say the oldest journal entry that hasn't been batched was on Wednesday and I want to do Thursday to Friday right now in a batch. Am I allowing approval of that batch before?

Robert Kihm   11:20
Okay.

Marcelo Torres   11:27
you know, the Wednesday journal entries get batched and put in. So right now a batch is just everything you have, take it. What I could do is say, okay, everything from the oldest journal entry to a time period that you get to set, take that, which is, I think, what you're describing. Or what I could do is say,
Here's a start time and end time. Make a batch out of that and it kind of falls wherever it falls. It's arbitrary.

Robert Kihm   11:55
I think there does need to be control over this, and a lot of times it could be views that specify this, like I want to create a view that pulls in the list of records that I'm including in this batch. As part of that, it's like obviously there's criteria. It's like, well, you can't pick something that

Marcelo Torres   12:09
Amith.

Robert Kihm   12:15
You can only, your universe of choice is only the unbatched journal entries, right? But I do think, I think your default is probably what you just said, which is like everything that is unbatched, you know, up to a certain, you know, date time. I think that's probably the default.

Marcelo Torres   12:22
Right.
Right.

Robert Kihm   12:35
But then I do think, you know, we would say like, oh, well, you need to do something special, you know, that you're doing something, maybe you're doing some correcting entries after month end or something like that, and you want like a batch that's specific to that. I absolutely could see them just pulling in a set of entries that they want based on.

Marcelo Torres   12:42
Oh.

Robert Kihm   12:54
filters they've created. And I would say, like, if you can use the viewing system, leverage the viewing system for that, to say, like, this was the view that was run, that, you know, that said, this is what returned that data set, like, I think that's pretty powerful, because they have smart filters, they can be arbitrary at that point.

Marcelo Torres   12:59
Hello.
So I mean, I'm going to do it.

Robert Kihm   13:15
Um...
So that's the way I think about it.

Marcelo Torres   13:18
Yeah.

Robert Kihm   13:22
I'm going to go back and look at some of the another application that Amith and I, you know, built, you know, called Aptify and look at what it was doing for batching and re-familiarize myself with that to see like all of the capabilities that were there to see how arbitrary it was.

Marcelo Torres   13:28
Mhm.
I'll, I'll route.
I wrote this stuff over to Jeremy too. I'll talk with him today. He's just in the office. And I'll also get him to give me a feature list, you know, so I can, because I'll get the feature list from Ethan, I'll get the feature list from Jeremy. I have a much bigger, better roadmap, and you probably won't be able to have to deal with as many of these questions. The other thing,

Robert Kihm   13:43
Yeah, I think that's great.

Marcelo Torres   13:59
You mentioned backdating orders last meeting. I just wanted to check if that's something that you want to allow us to do. Because I mean, obviously, you can't have someone backdate into a closed period, but even outside of that,
It's just something to confirm.

Robert Kihm   14:17
Yeah, I think so. But you can confirm that with Jeremy for how often like that would be necessary. But like, I think again, where I'm coming from is, let's say an integration failed. Let's say LXP like didn't send, you know, a batch of orders to us, like, like, like record them at the right time because like.

Marcelo Torres   14:34
Uh-huh.

Robert Kihm   14:37
I don't know, Stripe was failing or whatever, and then all of a sudden they got corrected, and then we got these things in there. Like backdating in order is like when you save an order, you can, like it's got an order date on it, right? So like we can say like, hey, this order came in on the 10th.

Marcelo Torres   14:52
Mhm.

Robert Kihm   14:57
You know, or like, it's the 9th today, so this order came in on the 8th, even though it's the 9th today, you know, it actually was processed on the 8th, so we want it to be processed with its order date as the 8th.
And the challenge there would be the closed period that you just mentioned. It's like if we've closed off the month of June, say like, and that's what Jeremy's team is working on right now. They're doing a month end close, right? They're trying to get all the expenses in and process everything as part of June because they're going to do their reports and
then close off the June period. At that point, we wouldn't want to continue posting things to June. They're going to get posted in July.
I think there are, and I believe the plan talks about this, there are going to be exceptions from time to time where something extraordinary happens. And then the question is, do we have a process, a set of rules to say, well, this is how you handle the extraordinary circumstances? Hey, you know, this should have been in June, but we're posting it in July.
it's a correcting entry, you know, what are the rules for that? Jeremy is absolutely the person to validate those rules and say, what extraordinary circumstances should be handled? What can we, like, you know, what do we just say like, oh yeah, that's just going to be a July thing and it would flow through with July dates and that's the way we would do it.
So like ask him those questions about, hey, this is the normal processing. What happens when, you know, you've closed off June and something comes in that should have been processed in June? How do you handle that? And then say, okay, this is how it fits into our plan.

Marcelo Torres   16:45
Okay.
Yep. So I got a couple of things to take to him. And I'll make sure to start asking kind of what are the extreme cases, what are the edge cases that you have to handle.

Robert Kihm   17:03
But I think, you know, there are some good rules like, you know, we should be talking about the guards for like you've closed off June. And if somebody tries to enter an order in June with a June date at that point, do you say no?

Marcelo Torres   17:03
Yep.

Robert Kihm   17:15
right? It's like, sorry, June is closed. Like, does it flow to the order guard? Is it flowing through like just to the journal entries? I think it's both. I think you're putting those protections on there to say, sorry, this period's closed.
I believe in the plan there is a discussion about extraordinary circumstances like the exceptions. So review that too, like maybe look for exception in the plan or, you know, like entries to close periods, you know, something like that. What happens after a period closes? Look in the plan for that.

Marcelo Torres   17:39
Okay.
All right, we got 2 minutes. I can go through this flow because we actually, you know, didn't do the freaking thing on. Sorry. There's a lot going on here, man. I'm just trying to get as much data and planning as I can.

Robert Kihm   18:02
And we can, we can meet more than this too, right? Like, you don't, you're not limited to this half hour. If you're making progress on stuff and then like the afternoon and a few hours, you're like, "Hey man, like I've got a bunch of stuff, I've got some answers and I need some more. Like, let's go over this stuff. Like, let's meet."

Marcelo Torres   18:19
Oh.
Okay, I can set up that. The real blocker right now is...
Obviously, I need to, I want to polish things, but I need to understand the user and the feature list for the user. I can't really polish out. I struggle to polish accounting without understanding the use cases as well, but...

Robert Kihm   18:35
Mhm.
Yep.
Meet with Jeremy, go over, like meet with Jeremy and like have it walk him through this process that you've got and say like, and ask him the questions like, what's your process look like? Here's what we're thinking, you know, and obviously you're naive in this and you're like, I'm not an expert in any of this stuff. I, you know, this is what the plan tells me and how we're building it out.

Marcelo Torres   18:44
Yeah.
The.
Yeah.

Robert Kihm   19:02
And then you go and he can say, yeah, this makes sense, or I don't know, you know what that is. We would do this typically. And he'll have it from a business central perspective too. So like, it'll be really good to say like, oh yeah, that makes sense to me, or I need more information about this.

Marcelo Torres   19:13
Mhm.
That will be really helpful.
That's true. Yeah, that that input will be good. I'll set up a meeting with him. Okay, one minute Demo. We can create an order here, different products. We'll book that order.
That'll come over into Accounting under the journal entries. And one thing is right now I haven't.
really done a good job of allowing these to be sorted and viewed, which is just a, this is a, you know.
a thing to work on, but this is, as you can see, is a pending order over here.
I guess this might be a deferred item. I'll have to check.
This number doesn't look right, but I also just...
And I have to have to test some of this and go over here, build a batch.
I guess it wants to do that in batch status.

Robert Kihm   20:09
Is it going to like remember their settings too, like for like wanting to look at batch status? Chances are they're not going to care about like all of them. You know, they're going to care about the pending ones, right? And then maybe they're going to look at approved ones over the last week or whatever. And if they set some defaults.

Marcelo Torres   20:21
Yeah.

Robert Kihm   20:29
So like one of the things in the user interface might be things like last week, you know, last day, last week, last month. I don't, you can ask Jeremy for what like his defaults would be, but those ones would be kind of nice settings for like, they're moving windows. So as opposed to like you got your from and to, which is really good to have, but like.

Marcelo Torres   20:45
Mhm.

Robert Kihm   20:50
I'm less concerned about it remembering that default setting than I am, like, hey, every time I come in here, I want to look at my last period of time that I'm batching in, basically, like the last week or the last day, right? If I'm batching every day, like, you know, here's what's happened. Or, you know, maybe it's like everything since the last time I batched, you know, like.
Like, but for me, it's going to be pending. It's going to be most of the ones that I care about. And then maybe I care about approved in the last week because those are the things I'm looking at. For if you're posting, I guess if you're like, you know, you've got the batch and you're like needing to move them to posted, like, I guess you're looking at pended and then pending ones.
and then very quickly reviewing them, and then, okay, I need to post. Like, that's the good one for Jeremy to be like, oh, and this is how we would work through this. So this is how the user interface helps me. And then think about it, like, and then what would you want to see tomorrow when you come back to this? Like.

Marcelo Torres   21:33
Mhm.
Yeah, okay.

Robert Kihm   21:52
So when you created that order, you did it, was it created in a state that automatically was at the point where it was like, oh yeah, this is journal entries that need to be created?

Marcelo Torres   21:52
On.
Yeah, so right now those orders are automatically going to confirmed. And I've actually, I've got the scaffolding as you can see for moving things through. But I also need to be, I need to have the ability to name orders.

Robert Kihm   22:05
Uh-huh.

Marcelo Torres   22:17
Um...
But I just wanted to represent the very basic, like, and you can actually take a look at the order history, too.

Robert Kihm   22:29
Yeah, same thing on that. It's going to be about the filters that they, what are the ones they care about, right? Like, you know, this week's orders, these are the open orders, like once they're fulfilled, we probably don't care about them too much, but some people would.

Marcelo Torres   22:30
Basically, I wanted to.
Yeah.
No, I mean, that matters.

Robert Kihm   22:47
And then part of this, too, is like this is where you get into interesting roles, right? I don't know if the orders plan talks about this, but like fulfillment. So fulfillment is as simple as like the Amazon order that they pack up the box, like that's fulfillment, right? Like there are physical products that need to get shipped, like the magazine goes out the door or the

Marcelo Torres   23:04
Yeah.

Robert Kihm   23:09
the t-shirt, you know, the whatever it is, like that order needs to be fulfilled. So someone is touching this to like put it together and say, okay, box, is that a shipping label created? That order is now fulfilled. So that role, they are very much going to care about all the orders that are ready for fulfillment.

Marcelo Torres   23:25
Amith.

Robert Kihm   23:30
but haven't yet been fulfilled. And then once they're fulfilled, they don't care about them anymore. So that's going to be interesting. There's probably a role around that for people who have like that type of like, I am the order fulfiller. There's also going to be rules around orders that like if there is no product that requires fulfillment.
then it can be automatically moved to fulfilled type of thing, right? Because it's like that stage, you know, there is no, it's an electronic product. Maybe we e-mail them the code and that's the fulfillment of the order. And when that action occurs, that's where you can flip it to fulfillment. So
That might, I don't know if that's in plan yet, and if, and it's probably not necessarily MVP functionality, but like those are some of the things that will happen with orders is like for us.
There's very little fulfillment that's going to need to happen, right? Like for us, it's probably contract signed, you know, which then generates the order. The order is automatically fulfilled. Like, hey, they just bought Izzy.

Marcelo Torres   24:40
Yeah.
So, that's one of the things that actually I had an open question about, and I just we just didn't get around to is is when fulfillment actually happens, but if that I mean if fulfillment is contract signed, then...

Robert Kihm   24:50
Yeah.

Marcelo Torres   24:55
We've got 3 statuses that pretty much go boop, boop, boop, done, you know.

Robert Kihm   24:59
Yep. Yeah. And when it's like that, when it's like electronic stuff, if it's like, you know, it is going to be like that, really the fulfillment is that, think of it as like, I just ordered something from Amazon. It's not fulfilled until the product's in stock and they put it in a box, they create the shipping label and it's ready to go to the shipper.

Marcelo Torres   25:13
Uh-huh.

Robert Kihm   25:21
And basically, it's like in that state of going out the door, that order's been fulfilled at that point.

Marcelo Torres   25:28
So my thinking was that fulfillment was kind of the indicator of like...
At some point, we need to talk about fulfillment and deferred revenue and how they relate, and if we want a user to be the only one that moves something into fulfillment or we want an automatic.
But for now, I think I've got enough to go with until the next day.

Robert Kihm   25:50
So what I would say is fulfillment, it's interesting.

Marcelo Torres   25:54
Mhm.

Robert Kihm   25:56
You can get a link between fulfillment and deferred revenue in the sense that you are not supposed, it's not really revenue.
Okay, here's the thing. So there is when you charge somebody for something, like when you charge someone's credit card, you are not supposed to charge them for a physical product until you've shipped that physical product, right? That's the general rule on things. Some vendors actually break that rule and they charge a credit card right away.

Marcelo Torres   26:23
Ohh.

Robert Kihm   26:30
They can probably do that if they say it's the deposit and we're requiring 100% payment out front. But generally, you know, you shouldn't be charging them until you have the product in hand and then you can ship it. That would typically be that you keep the order in like that.
draft status or a pending status and then, oh, we've got the product now. You could move it to, what is it, posted at that point? What is it? Sorry, I forget what the status is.

Marcelo Torres   26:53
Uh-huh.
Confirmed into posted, it's all good, and they flow.

Robert Kihm   27:03
Is it confirmed? Is that what it is? So, like...

Marcelo Torres   27:05
Yes, but I mean, this is just waiting to, these two, you can treat them as the same thing. Post is the journal entries are in. So it's the same thing.

Robert Kihm   27:08
Yeah.
Yeah.
Yep. So like you would probably keep it in like, you know, quoted status or whatever when we don't have the product like, like it wouldn't, it certainly wouldn't move to fulfilled for a physical product until you have the product in hand. It goes in a box and the shipping label's been created and you've arranged for the shipper to pack it up. Like that's fulfilled for sure.

Marcelo Torres   27:28
Mhm.

Robert Kihm   27:35
At that point, that's when you should recognize the revenue for that, because that's the delivery of value. The other deferments are things like, hey, I'm signing up for a conference. That conference, like AACSB annual, AACSB annual happens in August, we've already paid.

Marcelo Torres   27:42
Right.

Robert Kihm   27:54
to attend that conference. And so AACSB has the cache.
But they, and so they can record the cash, but it's all deferred revenue right now until that event happens. The day of that event starting is probably the day that they recognize 100% of the, yep, that conference has started, we're delivering value for it. You might say that it's not until the end of the conference.

Marcelo Torres   28:18
Yeah.

Robert Kihm   28:20
that you've fulfilled all the value, and you could defer that.
for an annual subscription, then you are delivering something over 12 months, and then you can record deferred revenue as you're going through that annual period.

Marcelo Torres   28:40
Right.

Robert Kihm   28:40
generally accepted accounting principles are usually like monthly buckets, are like what you do that in. And so, like the first day of the next month, you could recognize 1/12 of that. And that's generally accepted. You can go down to like the second if you wanted to, right? You could be like literally like
every day, every hour, every second, like, you know, 0.0003% or whatever of this has been reported.
You know that that's just ridiculous complexity in my opinion, but but yeah, those are the things that that you do, and like, and so...
You know, that's, and so that's disconnected from fulfillment, right? In the sense that you fulfilled that order, like when they registered for the conference and you took their money, like that order is fulfilled, that order is not changing, but you know, we have deferred revenue and we're not recognizing that revenue until the event actually occurs.
But there's nothing in the order that's going to change once that event actually happens.

Marcelo Torres   29:46
Okay.

Robert Kihm   29:47
It's Accounting entries.

Marcelo Torres   29:50
Yes.
That's good. We'll definitely end up doing some more.
I'll do some more thinking on this; it'll get worked out, but...

Robert Kihm   29:56
Yeah, and I'll do some reading on some of the old accounting functionality that Amith and I worked on and tell you more about, you know, what that allowed for batching and things like that.

Marcelo Torres   30:04
Mm.

Robert Kihm   30:09
Um...
I'm very interested to have your conversation with Jeremy and what he thinks about with, I know you had questions about out of order batching and things like that. And I think that's fine as long as the periods aren't closed, right? As long as you're batching into open periods, I don't know that you need to say like, you can't batch Thursdays before Wednesdays.

Marcelo Torres   30:20
Yeah.

Robert Kihm   30:32
I think, you know, generally you want that to be the behavior, just, you know, naturally progressing on things. But again, if the period's open, I think you give them control because that period hasn't been closed yet.

Marcelo Torres   30:47
Yeah.
I agree with that.
Yeah.
Yeah, that's generally the case. We do lock entries once they're pulled into a batch, but that's for a good reason.

Robert Kihm   31:02
So the way that we used to do it in Aptify LAN, this ERP association management system, think of it as a customer relationship management system, order entry payments, all of this, all of these entries is

Marcelo Torres   31:15
Mhm.

Robert Kihm   31:21
There were three things that contributed to journal entries. There were orders, there were payments, and then there were something called scheduled transactions.
Scheduled transactions is what I was just talking about with anything that's deferred. So these deferred revenue entries to say like, oh, well, you know, AACSB happens on August, you know, 17th or whatever day it happens, August 11th, something like that.
When I have my orders, I'm going to create the order, the order journal entries, and then I'm going to create scheduled transaction because my orders created things and put it into deferred revenue, right? And then I'm going to create a scheduled transaction on August 11th to move that amount out of deferred revenue into

Marcelo Torres   32:04
Madhav.

Robert Kihm   32:14
into sales, into real revenue. That's A scheduled transaction. There's one scheduled transaction on that day for that event. For the annual subscription, scheduled transactions would be created, one for each month, to basically recognize 1 12th of it. That's what happens. So those are the things that create journal entries.

Marcelo Torres   32:33
Mhm.

Robert Kihm   32:35
The way that we created a batch, so those batches, each batch was limited to a type. So orders and the journal entries linked to orders would have a batch. Payments, you know, and the journal entries linked to payments would have a batch. Schedule transactions would have a batch.

Marcelo Torres   32:47
Ohh.

Robert Kihm   32:55
A user didn't create a batch directly. A user would go to orders, create a view of the orders that they wanted to include in a batch, and then say, based on this view, generate a batch for that.
So it was arbitrary in the sense that they had total control over the filters that they used of which orders they wanted included in it. And obviously they needed to be orders that hadn't been already included in a batch, right? That was part of it. Like if they created a view that included orders that had already been batched, it would yell at them and say, you can't do this.
So there is that secondary validation in there. But we gave them control over, like, I just want this one order in a batch. I'm doing something very, very weird, but I just want to do that. They can do that. So that type of control, I think, is good. And we have a viewing system. So if they create a view,

Marcelo Torres   33:34
Yeah.
Yeah.
Okay.

Robert Kihm   33:53
of the things that they want to batch, then, you know, we should validate the contents of that view and then say, yep, those are the things we're putting in the batch.

Marcelo Torres   34:07
Okay.
Okay.
That sounds, that sounds good to me. It sounds like a lot of direction there.

Robert Kihm   34:13
But yeah.
Okay, yeah, and then talk to Jeremy about, like, you know, what's being built out, what it looks like, and, you know, then say, like, what is this, how does this feel? Like, what are you thinking? You know, does this make sense to you? What questions do you have? Like, how would, and then you ask him questions about it, and how would you be using this? Tell me more about, you know, what you do with invoices.

Marcelo Torres   34:17
Yeah, the the.
Yeah.

Robert Kihm   34:37
now, because invoices are very similar to what we're doing with orders, right? It's like, what does that look like? You know, what are your, how do you batch these things? Like, you know, what, how would you filter on these things? What are the extraordinary circumstances, right? Like, here's the golden path. We want to make it as simple as possible to do the golden path.

Marcelo Torres   34:57
Yes.

Robert Kihm   34:57
Now let's talk about the exceptions. What happens when you get something that really should have been in the last period, but you close that period? How do you handle it? And then how would we handle it in this new app?

Marcelo Torres   35:13
I thought I just thought about your the three types of things being.
We allow batches to hold any type of transaction, and then we split by company, dimension, and...
Something else, account. Do you want to split by type? Is that, or is that just, that's the old system we move into the new system? Okay.

Robert Kihm   35:32
I don't think so. I think let's go back to that plan, and I'm going to go review that plan in more detail. I think often you will do that based on how you filter those things, based on those different categories that you just mentioned. But I think that's up to them to do that. I don't think it has to be a limitation, like if they wanted to group things together.

Marcelo Torres   35:47
Okay.

Robert Kihm   35:56
You know, it's up to them to decide how they want to have those buckets and how and what their rules are. Generally, I think you do keep certain things separate and even more granular than what I just described, but I don't think we as app developers necessarily need to put...
arbitrary, like, oh, this is an order, only order journal entries can be in there, unless we explicitly put that in the path in the plan that says it would never be valid for us to do that.
So again, ask Jeremy about how he batches things together, like related to payments that come in versus orders. How does he separate them out? I think, you know, he might just use the groupings that you just talked about.

Marcelo Torres   36:47
Yeah, that'd be good to know.
Okay.

Robert Kihm   36:54
Yeah, as I said, like if you're blocked on things and you need some answers before you move forward on stuff, you know, let's just reach out and we can get together and have a quick conversation on something.

Marcelo Torres   36:54
Thank you for taking the extra time.
Yeah, I'll be, I'll be, I'll be proactive with doing that in the future. I think it's just a big system.

Robert Kihm   37:08
Cool, yeah, and then do that demo video, just be like, hey, here's all the things, and just like you were doing really quickly here, it's like, you know, you can say things like, hey, this is a preliminary interface, you know, you've talked to Jeremy, you're getting some more ideas, you've talked to Matt, obviously, you're working on those things, so.

Marcelo Torres   37:15
Mhm.
Yeah, that's actually a good thing to clarify. I mean, the interface is rough. The features is what I'm focused on. As far as getting that for LXP, my understanding is it's internal. They kind of expect to have a rough interface, but good features.

Robert Kihm   37:34
Yep.
Yep.

Marcelo Torres   37:43
OK, I mean, obviously, if I can do UI features, that's the that's the dream.

Robert Kihm   37:48
Yep. Yeah, we just need, we need the capability and like, again, it's internal, like, as long as we can do it, I think it's fine. And then it's working towards, okay, and what's frustrating about this? What do we need to improve? And that's how we iterate on it. But for, you know, LXP,

Marcelo Torres   37:50
All right.

Robert Kihm   38:07
Yes, I agree with that.

Marcelo Torres   38:09
Okay.

Robert Kihm   38:12
Cool.

Marcelo Torres   38:12
All right.
Cool. Thank you, Robert. Appreciate it.

Robert Kihm   38:14
Thank you, guys. You're welcome. Bye.

Marcelo Torres   38:18
But...
Ohh.

Marcelo Torres stopped transcription
