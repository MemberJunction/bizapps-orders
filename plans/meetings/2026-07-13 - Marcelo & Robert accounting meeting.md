> ✅ PROCESSED 2026-07-13 → distilled into `2026-07-13-robert-meeting-decisions.md` (D1 scheduled-JEs date-driven → MOD-11; D2 periods research; D3 company-owns-order tension; D4 process). (File renamed from "2026-13-2026 - …".)

Accounting Meeting-20260713_121133-Meeting Transcript
July 13, 2026, 5:11PM
22m 36s

Marcelo Torres started transcription

Robert Kihm   0:04
It's good.

Marcelo Torres   0:09
Okay.
Let me pull up question stock real quick. I had an important one.
All right, yes, so I wanted to mention.
There's a there's kind of a weird thing that's coming up.
with the accounting periods. So Amith removes them. And the other day you mentioned limiting, like where someone can make a journal entry.
based on the closed and open accounting periods. And I realized with removing the accounting periods, we are basically relying only on the batches as indicators of what time span is open and closed, which is fine. It's just, and again, this is something to flag. It's not something that's going to prevent us from making an MVP.
When we get to...
Like, like, basically, if you want to close Monday through Friday, which your last journal entry is the middle of Friday, and you make a batch and it picks up all those journal entries, unless we have the filter system and we want to go actually like parse those filters and determine the time span in the filter, which we can, we can build a time span into the batch.
basically. That's fairly easy to do, I think. But until we do that, we don't have a closing. And then if we do build the time spent into the batch, we're pretty much accepting that that's treated like the closed period, which I think is fine. It's just something that needs to be added in.

Robert Kihm   1:39
What were the notes around him removing accounting periods?

Marcelo Torres   1:45
Um, I actually have them. I just read this over.
His reasoning was because journal entries have become multi-company. Because when you make an order, you can enter products from multiple companies. Your journal entry can span companies.

Robert Kihm   2:10
Mm.

Marcelo Torres   2:12
And so closing a period at one company might touch journal entries that are at another company.
On.
Yeah.
To be honest, I don't think that problem gets much easier with batching. It just...
It's basically like if you wanted to have some kind of way to like truly say this period is closed at all companies and will never be batched again, you'd have to at period close, make multiple batches, covering every company that has an entry in that journal entry.

Robert Kihm   2:42
Mhm.

Marcelo Torres   2:43
On.
Yeah, the the company, the layer.

Robert Kihm   2:47
And so, so accounting periods were tied to companies.
So each company would have an accounting period and it could be different accounting periods, right?
Um...
Which makes sense.
And...
When you...
So you're batching things.
And you're batching things for a company.
When you have a company, when you have an order that has products from different companies.

Marcelo Torres   3:23
It's it's.

Robert Kihm   3:30
Does it create different journal entries for each company on that order?

Marcelo Torres   3:36
Yeah, this is, this is the, that's a very important question. So my understanding right now is no, but the company split, like, like that issue is not the only problem, the only thing to consider with company divisions. And I think, I think it probably should, to be honest. It almost would make more sense to me. But right now it does not.
And I think, like, by meets design, it does not.
Um...
So, I, I, okay, okay, that was confusing. That was a terrible way to word that. No, it does not. It does not.

Robert Kihm   4:02
Does a company own an order?
So, a company, so...
So there's no company ID on order. Like that is the like, hey, this is a Betty order. This is like for us, is it just like, are we assuming it's like an enterprise-wide order?

Marcelo Torres   4:23
That's interesting.
Because actually I think there may be a company ID on orders, yeah.

Robert Kihm   4:26
Because I think that there's got to be a company, right?
Yeah. So like that to me would be the company owns an order, but an order could have products from multiple companies, but the company owns the order and that I believe would be the context of the journal entries are in that company. And then when there are products for other companies, that's where like the intercompany stuff comes in, right? Where you have do to do froms.

Marcelo Torres   4:31
Um...
Yeah.

Robert Kihm   4:54
Yeah, so that's the way that's been done. Yeah, yeah.

Marcelo Torres   4:54
Yeah, so his plan is saying you make different ones. Yeah.
Okay, so then I don't know why he thinks that this...

Robert Kihm   5:00
And.

Marcelo Torres   5:04
I guess he just thought like the period doesn't make sense.
But like even in the orders master plan, you do create, as you were saying, you create those separate journal entries, so why would it be a problem?
On.

Robert Kihm   5:18
Yeah, I need to go, like if you can point me towards like where those changes, like those commits happened with him, like I need to go reach, I need to go research why he like made those calls. Like, because to me, yeah, okay. Yeah, that's the challenge. Do we have a transfer for that meeting? Or was that the unrecorded one?

Marcelo Torres   5:18
I think.
It was in a meeting.
Haha.
That.
We do.
No, no, we do. That was the meeting on 2026-07-02 and I actually have it in the repo.

Robert Kihm   5:46
Okay.

Marcelo Torres   5:48
I can give you the branch, or I could show you the file. I, I, yeah, yeah, I agree with you. It's definitely something to go look at. I, I was just, yeah, it's...
Yeah, it's on in the token too. Let me share the um branch with you.
What?

Robert Kihm   6:12
I know you're working in your own branch on this stuff. Is there, are there any concerns that you have about committing like the plan files and the transcripts and things like that into whatever the default branch is?

Marcelo Torres   6:13
And honestly.
Yeah, I've been thinking about that. It's a little weird, right?
Because we want, on the one hand, we want like...
We want them to...
last, especially the master plan, but like, I mean, I have literally like meeting transcripts, like days of meeting transcripts, and that's not really.

Robert Kihm   6:46
Mhm.

Marcelo Torres   6:49
That's not really like...
public information level type of thing.

Robert Kihm   6:55
Oh, this is a public app. You're right. Yep, that is an excellent call.

Marcelo Torres   6:58
So it's up to, it's what you think. I mean, whatever you say, I'll do.

Robert Kihm   7:02
But like, but being on a branch that's committed, like that stuff's still in the public repo.

Marcelo Torres   7:07
Yeah.
I mean, yeah, but I don't really know how to handle it otherwise. I really don't want to have a huge corpus of like very valuable planning data that just dies if my computer crashes.

Robert Kihm   7:17
Yep, no, I get it.
Yep.

Marcelo Torres   7:21
Um...
I mean, we could consider encryption.

Robert Kihm   7:23
No.

Marcelo Torres   7:26
I really don't know how else to handle this.

Robert Kihm   7:27
You know, I'm not too concerned about it. I am a little bit concerned about it if we're talking about specific Blue Cypress issues. But I don't know that we get that detailed on anything. I don't think we get any confidential information really in there.

Marcelo Torres   7:39
Mm.

Robert Kihm   7:47
maybe a little bit of insight into how we do our business when we talk about it, but we're usually talking about it at a pretty high level. But I appreciate you bringing that up. It's a public repo, and I'm so used to working on private repos. I'm just like, throw it all in there.

Marcelo Torres   7:49
That's how we do.
Yeah, yeah, yeah.
Yeah.
I mean, everything is committed. That's the...

Robert Kihm   8:09
Yeah.

Marcelo Torres   8:10
That's the current, like...
And I've actually been trying to build a better planning structure because I realized...
That was that was really my fault, was I was not managing it very well, and there's so much input coming in. And I think I've got that now. From that, I'm trying to kind of reorient a little bit. Let's see.
Okay.
Thank you for not having.

Robert Kihm   8:50
So it's in the Accounting app, right? That transcript.

Marcelo Torres   8:56
It should be under.

Robert Kihm   8:56
Okay.

Marcelo Torres   8:58
Plans.
It's probably going to be...

Robert Kihm   9:08
And which branch are you in?

Marcelo Torres   9:11
The featured J.E. entry engine.

Robert Kihm   9:14
Yeah.

Marcelo Torres   9:16
I didn't have very good.

Robert Kihm   9:21
Yeah.

Marcelo Torres   9:23
Automation in the beginning of this.

Robert Kihm   9:27
Wizard.

Marcelo Torres   9:28
Yeah.

Robert Kihm   9:41
Where's the 702?

Marcelo Torres   9:43
I don't know. I didn't really have good management stuff, but...

Robert Kihm   9:48
Love you.
So you should be able to grab that transfer from the meeting and you put it in there unless it's in here already somewhere else. Yeah.

Marcelo Torres   9:54
Yeah.

Robert Kihm   9:58
A...

Marcelo Torres   10:02
I think you're at it.

Robert Kihm   10:03
Just, like, I do want the...

Marcelo Torres   10:03
Please.

Robert Kihm   10:07
I just want to understand what his thoughts were on dropping accounting periods, because it seems like it should be important for that. If we are going to support locking of a period, like locking of a set of like, hey, you can't go back here. These numbers should always stay the same. We're not going to be making changes to June anymore.
as of June 13th, right? We shouldn't be doing anything else in June. And because, like we basically what it is, is like when the accounting team issues their reports, you know, they print out these reports and do their month-end reporting and like, you know, report it to the senior leadership team.

Marcelo Torres   10:33
Mhm.

Robert Kihm   10:50
At that point, those reports shouldn't change anymore. It's like, this is what we published. We've locked our accounting periods. That means these numbers should stay the same. If we need to fix anything, we're fixing it in July, basically saying, hey, we needed to make some corrections because we already closed June. But up until the point where you closed June, it's like,
You can do whatever you want. It's one of the reasons why, I don't know if you've seen any of the emails that go out, but where Tyler or somebody else is like, hey, get your expenses in. It's the end of the month now, and they're trying to close it as soon as they can into the next month.
And part of that is like, well, let's make sure we captured all the expenses in June, in the month of June. And so they're like, get these things in so that we can do our reporting and then basically close off June. And if you didn't get your stuff in, then sorry, it's going to get rolled into July. So it's not the.
It's not the best place for it, but at the same time, it's like, we'll do, we'll get most of the information in there and do the best with what we've got.

Marcelo Torres   11:55
Yeah.

Robert Kihm   11:58
But that's the locking piece of it. It's like the accounting team says there will be no more changes in this period anymore. That's what accounting periods have been used for. It's possible that he's like, well, maybe we're not worried about locking things down right now, or there's another way to lock it down. I'm not, I don't like batches being the lock-in.

Marcelo Torres   12:19
Mhm.

Robert Kihm   12:19
Like batches lock the journal entries that have been batched. That's true, but not necessarily that you couldn't put additional things in that period, right? They're like, oh, yeah, we just had a transaction that came in on the last day of June. And, you know, we didn't catch it at the time, but we haven't locked a June yet. So
We're going to create those entries. They're in June 30th, and we'll create another batch just with those things in it. And I could still post it, but as soon as I lock June, I couldn't do that in June anymore.

Marcelo Torres   12:52
Yeah.
I agree.

Robert Kihm   12:58
But he's usually, he's usually got a reason in his head for like why he's doing it. It's like, oh, we don't need this right now. I just need to know what his reasons were.

Marcelo Torres   12:59
I agree with you, yeah.
Yeah, I'm trying to find.
Um, and I, and I agree with you that that is that's the best the problem with batches is like.
Uh, they're just not meant for that, to be honest. This is straightforward, um, and yeah, do you want the accounting team to be able to walk that separately?

Robert Kihm   13:19
Yep.

Marcelo Torres   13:24
And.
I'm not even, I'm not seeing this meeting. I remember having it, and I remember actually doing a recording.
During the meeting, like we were sitting, we were sitting in his office, and this is the second meeting we did. The first one I didn't actually record correctly, and so...

Robert Kihm   13:48
Right, I remember that, and I remember that, I remember the follow-up, yeah.

Marcelo Torres   13:50
That, that, like, specifically, I was like, I checked the Mike and made sure. I don't know where this is. I don't know how this is.

Robert Kihm   14:03
What other questions do you have while we're waiting for that one? Let's see if we can find it.

Marcelo Torres   14:07
Yeah, I'll try to find that.
Um...
Thank you.
Okay.
Yeah, so, so there's the master plan writes that deferred revenue should be recognized at it should be materialized.
When the period is closed.
Um, which I guess kind of depends on this, but again, like that's one of those things where it's like...
First, first, I want to confirm that.
You know.
Basically, there's a whole lot of...
The scheduling system for scheduled payments.
Is kind of...
weird once you remove the accounting periods.
Because.
It was originally written in that scheduled payments would kind of be materialized as periods close.
But in talking with Amith more, it kind of became more like, well, create a journal entry at a specific time.
which to me makes sense. And I think I just wanted to confirm that.
And then the same thing kind of occurs with deferred revenue. Like they are basically the same thing, the scheduled journal entry and the deferred revenue. Deferred revenue is going to be done through a scheduled entry. But they become the same thing where it's like...

Robert Kihm   15:45
Yeah. That's really good because you started talking about scheduled payments and now you're talking about scheduled entries and scheduled entries is what we're talking about here. Yes, how it's been done in the past that I've been working with is you create scheduled transactions.

Marcelo Torres   15:49
Madhav.
Entries.
Yes.
Mhm.

Robert Kihm   16:07
And we use this concept of a scheduled transaction group that had scheduled transactions or scheduled journal entries. And why you would have a group is for the subscriptions, where if you had an annual subscription,
and you are recognizing revenue monthly. So let's just say that I purchased a subscription today for a year, so from July 13th, 2026 to basically July 12th, 2027.
So.
$1200. So I paid $1200 for my subscription. I get a year's worth of service. So we need to recognize that delivery, that revenue over a year. So in the first month, this month, on July 13th, we can recognize $100.

Marcelo Torres   17:03
Mhm.

Robert Kihm   17:04
So there should be a journal entry that actually, so in your, in the order when it gets created, it's going to be $1,200, right? And $1,200 is going to get booked to deferred revenue.

Marcelo Torres   17:13
Right.

Robert Kihm   17:17
Right? That's what's going to be. Now, the scheduled journal entries are going to get created, and there's going to be 12 of them. And those journal entries are going to be starting on July 13th, 2026, and then August 13th, and then September 13th, and da, da, da, da, until June.

Marcelo Torres   17:34
Uh-huh.

Robert Kihm   17:39
2027, June 13th, or excuse me, not June. Yes, it is June. June 13th will be the last one. That's the 12th one. And so basically $100 each time. And so that, and those are the transfers from deferred revenue into the revenue account.

Marcelo Torres   17:49
Mhm.
Yes.

Robert Kihm   17:58
Right? So that's what happens and those scheduled journal entries get created. Once that order, once the orders journal entries have been created and they can't be changed anymore, right, then that's when the scheduled transaction should be created for that too. So those all exist.

Marcelo Torres   18:11
Yes.

Robert Kihm   18:19
But when you're batching them, you're not batching. You're batching usually like, oh, I need to batch the July transactions, including the deferred revenue transfers in these scheduled journal entries. And I'm only going to pick up the ones that are in July, leaving all the other ones that are still out there. So that's the way that that works.

Marcelo Torres   18:30
Mhm.
And.
Okay, that makes way more sense.

Robert Kihm   18:40
And so, yeah, so that's the way that we have done it. So yeah, it creates all these journal entries that are scheduled, but it's not, you know, it's doing them based on time. Now there is the deferred revenue product that is like the event, which is like, hey, the event's happening on August 1st.
And it's still deferred revenue, but it's not a subscription. It's a much simpler deferred revenue transaction. It's like 100% on August 1st. So you're going to create a single journal entry for those transfers from deferred revenue into real revenue on August 1st as the revenue recognition date. And that one's just 100%. There's only one of them.

Marcelo Torres   19:06
Mm.

Robert Kihm   19:20
It's the subscriptions that are more than a month long that end up with the ones that, you know, have multiple transactions transferring a fraction each time.

Marcelo Torres   19:31
You're basically just like forward dating, like you're like you create the journal entry market. Okay, that is so much simpler than what I was thinking. I appreciate that. That is a much better approach to that system.

Robert Kihm   19:34
Yes.
Yeah.
Yeah, so again, what I would suggest you do is take the transcript from this meeting to, and all the things that I'm saying, we were saying, and just say, like, this is what came out of this meeting, reconcile this with what's in the plans, and, you know, surface any contradictions or highlights. And like, if you get any, like, definitely share those with me and we can discuss them.

Marcelo Torres   19:48
Uh-huh.
Yeah.
The Messenger.

Robert Kihm   20:05
Because I'm giving you my understanding based on like history and how I've done it in the past and not necessarily the most up-to-date of all the beatings. But yeah, I'll take a look at those things. But yes, now good that you're starting to think about the scheduled journal entries.

Marcelo Torres   20:09
Then.
Yeah.
Okay.
I have some other questions. I will send you a list that I need to go through them and make sure they need to actually be sent over. Those two are big ones. Yeah, yeah. And I think I'm going to just, I think I'm a better place, better place. I'm going to be focusing on getting like, what do I have?

Robert Kihm   20:28
Mhm.
OK.
Okay.

Marcelo Torres   20:45
what is in the master plan that I don't have that I need, getting up to date with the actual master plan. I'm hoping that, I'll probably do another demo like end of Tuesday. I'm hoping that demo to be much closer to where we actually are supposed to be. Yeah, that's the plan for now.

Robert Kihm   20:56
Mhm.
Help.
Yeah, and then, you know, highlight the risks of the plan that we talked about last week after you've thought about that. That's good too for the dates for like things and like, hey, I don't know, like this is what I can do. Here's the things that I'm really concerned about for what dates they are. Here's what I'm thinking for dates. And then if you want to,

Marcelo Torres   21:14
Mhm.

Robert Kihm   21:22
What might be helpful is similar to what you're doing is sending out questions to me like later today.

Marcelo Torres   21:28
What?

Robert Kihm   21:30
If you create the I intend to, like, you know, over the next 24 hours, this is what I'm working on. It's like, this is my plan, this is what I'm going to execute on. That's something that I can review too and like give you feedback. I don't want to block you on anything, so it's possible that.

Marcelo Torres   21:44
Okay, yeah.

Robert Kihm   21:49
You know, you'll still be working ahead on things, but I think that would be helpful too, to be like, oh, I plan to do this. And if it's a sanity check to say like, yeah, that makes sense to me, or like, hmm, wait, I thought you were going to be working on this based on what we talked about. That stuff would be helpful.

Marcelo Torres   22:05
Seven.
Okay. Yeah, I can do that. I think that'd be good.

Robert Kihm   22:11
Cool. All right. Yeah, let me know. I've got a couple of interviews this afternoon where I'll be busy for a couple of hours. They start at 3 my time. So I guess 2 o'clock your time. Hopefully they're good. They get some pretty good resumes. But other than that,

Marcelo Torres   22:26
Yeah.

Robert Kihm   22:30
I should be able to look at what you got.

Marcelo Torres   22:33
All right.

Robert Kihm   22:34
Cool. Thanks, Marcelo.

Marcelo Torres   22:35
Thank you, Robert. Look at it.

Robert Kihm   22:36
You're welcome. Bye.

Marcelo Torres stopped transcription
