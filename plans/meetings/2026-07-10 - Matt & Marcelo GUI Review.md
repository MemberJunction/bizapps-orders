> ✅ PROCESSED 2026-07-10 → distilled into `2026-07-10-decisions.md` (accounting + orders companion). See `_PROCESSED.md`.

Accounting GUI Review-20260710_113642-Meeting Recording
July 10, 2026, 4:36PM
25m 13s

Marcelo Torres started transcription

Marcelo Torres   0:03
The filtering, the filtering system, and like putting that into some kind of drop-down referencing admin on that, that's something I should definitely consider.

Matt Chriest   0:10
Yeah, yeah, like just trying to find like grouping and consolidating. Yeah, and then like, yeah, like.

Marcelo Torres   0:11
Um...

Matt Chriest   0:18
Just, yeah, like just kind of trimming it up just so that it doesn't take up so much real estate, just because we we have we we can't have the presumption that people will be always viewing this like on a 1080p monitor. They might be viewing this on, you know, a laptop monitor that might be a little bit more less.

Marcelo Torres   0:30
Matt.

Matt Chriest   0:36
resolution. And then eventually figuring out also, and again, a lot of these people are not going to be using this on mobile, but that's also something just that I'm always trying to kind of consider is like, you know, will somebody want to view this information on mobile? So how do we kind of translate all of this stuff to be a little bit more compact?

Marcelo Torres   0:38
Four, 13, the stream.
Agree.

Matt Chriest   0:57
Um...
But other than that, that's what I have for this page. If you want to, well, actually, before I forget, one of the comments you made earlier was about...

Marcelo Torres   0:59
Um...
Right.
Yes, so.

Matt Chriest   1:15
What was it again? It was a...

Marcelo Torres   1:17
Can we, do you, if you want, we can cover that an hour. We could reserve like 10 minutes at the end of the meeting to talk about tables. Okay, yeah. I was going to ask to do that because I have some very interesting ideas there.

Matt Chriest   1:21
Yeah, yeah, let's do that, yeah, yeah, sure, sure, yeah.
Yeah, sure. Okay.

Marcelo Torres   1:29
Um...

Matt Chriest   1:32
So, yeah.

Marcelo Torres   1:32
Anyway, yeah, so any other UI stuff we should cover? I mean, so I'll say like this batch approvals page, I'm not a lover. You know, like no sorting, no dropdowns, it needs to be added in. I'm almost considering adding it here, but I know we don't have this dropdown in our tables right now in our grid because we're using AG grid.

Matt Chriest   1:36
Yeah.
Mhm.
Mhm.

Marcelo Torres   1:52
or community edition, we don't have the, what is it, something master, master, master view or whatever, right? And so like, I don't want to bring it in here because I'm not sure if we're going to have that feature. That's a feature I want to add. I can talk more about that later. The JEs, so a lot of my stuff is the same thing. And this is actually really a tension that I'm finding. So.

Matt Chriest   1:52
Yes.
Look up.
Okay.
So.

Marcelo Torres   2:13
Our system generally prefers viewing things in an AG grid.

Matt Chriest   2:18
Mhm.

Marcelo Torres   2:19
or doing something like this with dropdowns. It has been my finding. But I'm in accounting, so there's a couple issues, right? Like dropdowns can't be sorted, and accountants like are familiar with the table. My sort of thinking has been to lean into that table kind of architecture, but.

Matt Chriest   2:22
Right.
Mhm.
Mhm.
Yes.
Uh-huh.

Marcelo Torres   2:38
Getting like, that's some feedback that I think, obviously I'm going to ask Jeremy as well, but from a UI perspective, I mean, you can kind of tell me, where should I be leaning with this? Like, do I maybe just keep this kind of drop down thing, but add some kind of filtering and we're making a new element? Or do we lean into the table and just enhance it a little bit?

Matt Chriest   2:56
Yeah, I mean...
AI.
I think it's important, especially like when you're like developing an app like such as this, is to have like a consistency of views so that like when somebody goes from one page in the app to another, they're not trying to reorientate themselves with what they're trying to like.

Marcelo Torres   3:08
Uh-huh.

Matt Chriest   3:16
digest informational wise, right? So like I would almost, I think it would be.
In my opinion, it would probably make more sense. And again, this is not always going to make sense. There's going to be different types of contexts. But when you have like a view such as this, where you have a table, where you have a bunch of pending statuses and all that stuff, and do you mind going back to the other page that you were referencing with the dropdown?

Marcelo Torres   3:38
Yeah.

Matt Chriest   3:41
like maybe having it so that they behave and look the same. Now, when it comes to needing to see more information, like the dropdown, like if you go back to the other page, the batch status, do you have anything where you need to like expand? I guess you do have the carrots to the left, right? Okay, you do, okay.

Marcelo Torres   3:46
Agree.
Yeah, yeah.

Matt Chriest   4:00
Um, I mean...
It would, in my opinion, it would just make more sense just to make them consistent. So like when you go from one page to another, you're seeing the exact same type of view as a user, it's just familiarity. You know what I mean? Obviously, there's going to be different columns and stuff like that, but I think, you know, consolidating it would be my...

Marcelo Torres   4:15
I agree with that.

Matt Chriest   4:23
preferred choice.

Marcelo Torres   4:24
Yeah, and obviously like the styling on all of this needs to change. This is not, this table is not in line with our regular styling, but I can align it more with like, I think we opened, I don't know if it was admin or data provider or something. Oh, like the trial, even the trial balances, like this AG table, that's kind of where we want to go. That's where I'm going to take it.

Matt Chriest   4:31
Mhm.
Mmh.
Right.

Marcelo Torres   4:42
I think.

Matt Chriest   4:43
Yeah.
Yeah, and yeah, and I was going to say, if you find yourself having like work against the grain or whatever, like let me know too, because again, I mean, just for your knowledge, like one of the things, I mean, I guess just as a quick background, like since you've only been here, I don't even know how long. Have you been here for like a month? Maybe 2? Yeah, a month, yeah.

Marcelo Torres   4:46
But yeah, OK.
A month, basically, yeah.

Matt Chriest   5:05
MJE Explorer has like existed before I started here and I've been here for a year, right? And it's been rapidly iterated. Like there's just been so many developers doing things and it was kind of redesigned at one point. But as you probably can imagine with AI, like.

Marcelo Torres   5:10
Yeah.

Matt Chriest   5:22
every developer approaches it differently and now we're kind of at a point where it's just a bunch of hodgepodge of like different ways that people are doing things and like now what I'm doing is like I'm I have a massive amount of technical debt that I'm trying to try to go through where like I mean yeah I

Marcelo Torres   5:29
Mhm.

Matt Chriest   5:42
AI is great, but like I also would like to kind of do some best practices where like.
Let's consolidate, like, let's not reinvent the wheel every single time, you know, we're creating new apps. Like, let's make the tables right, right? Let's make different views for the table so that the same table could be used for different use cases, right? Like, where's the standardized card, right? Where's the standardized search spot? You know what I mean? So, like, what I've really been trying to do.

Marcelo Torres   5:50
Yes.
Aubree.
Yeah.

Matt Chriest   6:11
is trying to provide those things. Now, you know, I'm only one person and like I'm kind of, I have a lot of different things going on, so I've been trying to chip away at that. But one of the things I want to try to maybe do this quarter is, you know, if you find something more like, hey, like I, there's this thing that I'm always, that I'm, you know, Claude and I are always reiterating and redeveloping like over and over again, like why?
can't we have like a shared component, right? That's the stuff I'd love to hear. Like if you ever find yourself in that predicament, feel free to like, you know, reach out to me or, you know, I'm more than happy if you want to kind of, you know, you know, propose a shared component. That's also great too, because I would really love to kind of shy away from like,
Just again, just reinventing the wheel, like every single new application we develop.

Marcelo Torres   7:00
Yeah, but I wanted to ask about this screen, and I, like, I will address all of those concerns. Trust, we will, we will, we will get into that. I just want to focus on UI a little bit. I wanted to ask about this screen. So, I got a couple concerns. The first is this: you're scrolling infinitely, and...

Matt Chriest   7:01
Yeah.
Yeah.
Yeah, yeah.
Yeah, I do.
I do not like this. I don't. I do not like the screen to be honest with you, yeah.

Marcelo Torres   7:16
Okay, tell me what I need to do, because you're the guy. I'm listening to you, seriously.

Matt Chriest   7:19
It.
Yeah, no, no, no, no, yeah, and this is this is a type of situation where I, again, like this is I need to kind of study this because, like, you can what I don't like right now is that everything is just bundled up in one column, right? I mean, right now, I mean, obviously, posted has has more information, right? It's just, it's just so...

Marcelo Torres   7:32
Yeah.
And it almost always will on this order screen.

Matt Chriest   7:37
Yeah, and it's just really imbalanced, right? Like, you could, so again, I gotta kind of really orientate myself of what I'm really looking at, right? So okay, so this is orders, this is all the status of the orders, right? Okay, and...

Marcelo Torres   7:53
Yeah.

Matt Chriest   7:57
Okay, so is the statuses ever going to change or is this pretty much more or less set in stone, like a number of statuses?
Like, you know, like, perfect.

Marcelo Torres   8:07
Nothing's really set in stone here, unfortunately, but this is supposed to be. This is supposed.

Matt Chriest   8:11
Yeah, okay.
I mean, it's not gonna grow, it's not gonna grow double.

Marcelo Torres   8:14
Consider them very, very, very, very unlikely to change, like rarely changing, yes.

Matt Chriest   8:18
Okay, okay, yeah. I mean, if it changes by one or two, I'm more concerned, like, is it, I mean, is it gonna grow from like, was it one, two, three, 4, 5 statuses at 15? Probably not, right? Okay, okay, okay, just making sure.

Marcelo Torres   8:27
No, no.
Yes.

Matt Chriest   8:33
So honestly, what I would probably do, I mean, this is a very cheap opt out, but like, I mean, this is just what I have just right off the top of my head is like, maybe group each of these statuses from the, from the, like, just instead of, right now you're making it vertically, like, you know, all of them are vertical side by side, just stack them on top and.

Marcelo Torres   8:43
Uh-huh.
Uh-huh.

Matt Chriest   8:57
put them in accordions. And then if you open up each status, they're grouped that way. And then make sure that each status, like, okay, so for kind of like what you were sort of doing with the tables, but don't use the tables. Use, I think there's a component called MJ accordion, if I'm not mistaken. So what you would do is you would.

Marcelo Torres   9:14
Okay.

Matt Chriest   9:16
you know, the accordion itself, all you would see is confirmed with a number of confirmed orders, right?

Marcelo Torres   9:24
Mhm.

Matt Chriest   9:24
You click on it, expands all the orders. Now the important thing you want to do with this, and again, I'm not 100% sure if the MJ accordion has this, but set a max height of the accordion so that, yeah, so that it scrolls. So like when you open the accordion, it doesn't take up the entire viewport. It only takes up like say,

Marcelo Torres   9:35
Yeah, pagination, right?

Matt Chriest   9:45
250 pixels or whatever that number is, just so you can scroll while still being able to see the other accordion items that you can easily click on that to then expand that. Does that make sense? Now, the only caveat with that is that you're not going to, you're no longer going to have the bird's eye view.

Marcelo Torres   9:54
Yeah.
Mhm.

Matt Chriest   10:04
that you have on this one, because right now you can kind of see the number of orders, but I would argue that the number itself next to each accordion would already indicate the amount of order. You don't need to see them stacked on top of each other to know what the statuses are, because if you see that 28.

Marcelo Torres   10:07
Yeah.

Matt Chriest   10:24
You know that there's going to be 28, you know.

Marcelo Torres   10:26
So, I mean, the idea here, and I'm not saying it's right or wrong, is that for the front-end user, for the user of the order system as a salesperson, right, they might manage 20, 30, 40, 50 orders, right?

Matt Chriest   10:30
Yeah.
Mhm.
Yep.
Yeah.

Marcelo Torres   10:43
This kind of flow might be a little more native to them as far as progressing the order. Progressing the order with the accordions is what I'm concerned about. You know, like once I hit next, now I've lost it, I have to open the next accordion and where is it in there. But the concern that I have here, so I think what I need to do, what needs to happen for this easily off the bat is a time span.

Matt Chriest   10:49
Yeah.
I see.
I get it. I get it, yeah.

Marcelo Torres   11:03
That has to happen, because, but then this search thing, and and we I need to talk about this search. So, is this search searching? So, like the problem with this kind of view is pagination and search, like the accordion solved that problem because pagination is easy. Search is real, is a real, is a real.

Matt Chriest   11:05
Mhm.
Yeah.
Mhm.

Marcelo Torres   11:22
****** though, because like if I'm searching the database, I mean, I guess we create an index on the names or something like that, a search index.

Matt Chriest   11:29
Mhm.

Marcelo Torres   11:30
to optimize, but like how are we optimizing search so that it, because right now, obviously, it's local. So this feels great, right? But what about when I have 1000 records over long periods of time, right? And then the issue with this screen, as you pointed out, is like, as the records increase, it's terrible. Like if you're this CFO and you have a million...

Matt Chriest   11:36
Yeah.
Yeah, right, right.

Marcelo Torres   11:49
million orders that you're looking at under you because you want to go see the history of your last, you know, three batches. How the hell are you dealing with that? And I almost think like the order history page needs to be for that. And this order management page might need to even be taken down to just.

Matt Chriest   11:54
Mhm.
Yeah, like...

Marcelo Torres   12:06
Posted, fulfilled, confirmed, quoted, and then like default to seven days or like leave default to like a week or a month.

Matt Chriest   12:10
Yeah, yeah.
I agree, I agree. There should be some sort of encapsulation of like the time, like the time range, right? Like you shouldn't see all orders, you should only see like the most relevant orders. And you know what, this view kind of reminds me of, I don't know if it was Azure, it was...

Marcelo Torres   12:19
Uh-huh.

Matt Chriest   12:33
There was this like once, like this like Admin tool might have been, I don't know if it was, I can't remember what it was, but I do, I do remember seeing something similar to like to this where, what was that?

Marcelo Torres   12:38
AAPA.
Hello?
Trello.

Matt Chriest   12:49
Yes, Trello and then, yeah, yes, yes, where like there was tasks, yeah, yeah.

Marcelo Torres   12:50
Yeah.
These Kanban boards over there.
These aren't draggable, they need to be, but actually they don't need to be, but yeah.

Matt Chriest   12:57
Yeah, yeah, yeah.
They don't need to be, yeah, yeah. Click on a click on one of those really quick. I wanted to see the behavior.

Marcelo Torres   13:05
Oh yeah, sorry, didn't share that.

Matt Chriest   13:07
Okay, so this, I don't, what I think would be more, would be better for this is that there should be a panel. I think it's, I forgot what the exact name of this is. It's called like the MJ panel or something like that. Actually, if you go on the other screen to your right hand side, where you have the users, you might be able to see that in action. Click on, like click on.

Marcelo Torres   13:19
Mm.
Yeah.

Matt Chriest   13:31
The edit button, like in agent administration. Yeah, like that. Oh, because never mind. That's not the panel.

Marcelo Torres   13:36
Olu.
Well, you know what, you know what, I might have it. Is it this?

Matt Chriest   13:42
No, it should be more like a side panel that slides from the right that overlays the content. Yeah, kind of like that. It's not exactly that, I don't think. I mean, it looks obviously weird because of the... Right, right, right.

Marcelo Torres   13:51
Okay.
Okay.
Under the header, and yeah, it's weird.
On.

Matt Chriest   14:00
Just give me one sec. I just want to point you to where...

Marcelo Torres   14:04
Yeah, no worries.

Matt Chriest   14:07
Do do do do.

Marcelo Torres   14:12
I think consistency is Las Vegas weakness.

Matt Chriest   14:15
Yeah, and if that's, yeah, you're telling me. So yeah, that's kind of where I'm headed at is like that's if you want to see more details about something, I think that would be the best, like the more appropriate kind of component to use.

Marcelo Torres   14:16
Fortunately.
I have the panel that slides up on the side, I think.

Matt Chriest   14:31
Yeah, yeah, because right here, again, it kind of serves the same purpose. It's just like, I don't know, like.
Just again, just kind of just make just.

Marcelo Torres   14:42
The scroll bar is not moving over. Yeah, yeah, okay.

Matt Chriest   14:45
Right, yeah.
Yeah, just again, just more for consistency.
Because, yeah, right now, like you have the, like the, you have a card within like a panel and it's like, and even the other, you had like another, an example too of like a modal popping out. I'm sorry, I wasn't really paying close attention to what you were doing to trigger that.

Marcelo Torres   14:52
Well...
Right.
No, no, no.
You're good. It's a lot going on. I'm not at all concerned. I'm trying to think about, I know where I did it, right here.
Is this what you're talking like?

Matt Chriest   15:18
So that's great. That is great. There's another one that was like a little bit more in depth.

Marcelo Torres   15:23
Yes, yeah, yeah, yeah. Okay, um, I know, I know what you're talking about. Let me try to find it.
Oh, wait, here. Carter account has it. Yeah, so this. Nope, not this. Not this. I fixed that already. Here, this is an example. Well, this is a this is a whole different problem. That's not it.

Matt Chriest   15:37
Yeah, that's good. That's good.
Yeah, that's a whole different one. Yeah, that's like a record.

Marcelo Torres   15:47
That's work in progress. Don't just ignore it for now. It happens over here. This right here.

Matt Chriest   15:54
Yes, yes.

Marcelo Torres   15:57
So I don't want this. I don't like it. What happened is, you know, Claude, I asked, basically, I asked it to create these views using tokens, like known elements, and it was like, oh, it has this. You can use this. And I was like, okay, just go for it. Just go for whatever, because I just want something to view. Like, I just want to be able to see visibility.

Matt Chriest   15:58
Okay. Okay.
Uh-huh.
Yeah, yeah.
Mhm.

Marcelo Torres   16:17
But yeah, so this is just so Claude knows, this is the open an accounting button on the order detail in the orders page. Yeah, that's that I want that to open in actually Accounting, like move over there. It's just that right now, I just haven't had time to do it. So, okay,

Matt Chriest   16:24
Mhm.
Okay.
Carter.
Okay.

Marcelo Torres   16:36
I appreciate your feedback. I think we'll end up meeting again, to be honest.

Matt Chriest   16:39
Yeah, yeah, I, yeah, and honestly, and I actually, I think what would also be helpful too is if you, I think you've already, did you already shared the the the branch and or repo with me, right?

Marcelo Torres   16:48
Demo recording. Rico? It should be shared. If it's not, let me make sure that happens.

Matt Chriest   16:50
Yeah.
Okay, because what I'll do too is I'll kind of just do a quick kind of, and this is kind of what I've been doing with Barnett too is like.
Like, it's not more, I mean, there's obviously UI things, but the user experience is also something that I kind of want to, like, you know, give my two cents up on. And that just kind of takes a little bit of time for me to kind of digest all this information. You know what I mean? Like, it's just, and also, I don't know anything about accounting whatsoever.

Marcelo Torres   17:08
I have to do this later.
I agree, I totally understand.

Matt Chriest   17:20
Like, I, so I don't really know exactly what works for accountants. Is this, I mean, this is just for a regular old accountant, right? Like this product? Like, okay.

Marcelo Torres   17:29
Yeah, I mean, I'd like to, before we run out of time, shift over to talking about those tables, because you've got 4 minutes. And I appreciate your feedback. I have another meeting after this, so I'm sorry. And yeah, we'll schedule more stuff. Like I will schedule more stuff with you. So what I wanted to talk about, last night I went through the, I was going over the performance stuff.

Matt Chriest   17:36
Yes.
Yeah, yeah, absolutely. Yeah, let's talk about tables. Yeah, sure.
Yeah, sure.

Marcelo Torres   17:49
And I think there's a lot that we can do very easily. So right now we have this existing thing called a key set. It's...

Matt Chriest   17:49
Oh.
Mm.

Marcelo Torres   17:58
It's designed to...
Here we go. So it's key set pagination. It's live on the server right now, and it's constant time pagination. So instead of using an offset, where each time the query invalidates the server has to load all those elements, it literally just says, give me this key in the next 25 elements after. And because you're already indexed by the key,
It's indexed, it's constant time. That system has a stub right now for a composite key set based system that uses an index on a different item in the table and the primary key as the tiebreaker to basically order by any item in the table and give you constant time pagination. And that pagination
Won't have skips and stuff when you're scrolling, it won't duplicate rows. So that's the first thing I want to add into our tables if we can. And I like to have the plan. Like this is a written plan. Payable did this. I've spent a couple hours like working up this plan to do this. I really want to do it. Okay, that's the first thing. The second thing is these table dropdowns.

Matt Chriest   18:50
Yeah.
Ohh.
OK, yeah.
Mhm.

Marcelo Torres   19:02
I think they're really nice. I know we don't pay for AG enterprise, but I'm thinking like we just create these ourselves. Because if you're looking at something like this, right, you know, I couldn't, Claude immediately made its own thing. I couldn't find an AG version, even when I told it to do this, it immediately went off the AG table and did its own thing.

Matt Chriest   19:08
Mhm.
Mhm.
Yeah.

Marcelo Torres   19:22
That we're gonna have to get smart about handling, you know, updates and not invalidating requests, but I think there's just a lot of performance to be gained there from handling that system. And then the other thing is, right now we haven't, it's a...
Set visible. So we have this set visible thing, which right now we keep all our pages alive in the background, but we don't manage if they're visible or not. And so we're running updates on those pages in the background. That's my understanding. I'm not 1,000,000% on that. What the set visible system is designed to do, it's already architected in.

Matt Chriest   19:52
Okay.
Okay.
Done, yeah.
Hmm, okay.

Marcelo Torres   20:18
of this is we're using this key set thing, we're using this set visible. What I want to build is a...
live dashboard class, a base live dashboard class. It integrates this set visible thing. And what it does is it automatically builds in the queries to update data on the page, receives the pushes from the database and updates based on those and does that intelligently. Because if you'll notice, all my things have this refresh.
But what happens is like I change something in here and it updates things on the page. Now I could go code every button to manually refresh the page. Why? Like that's not good design. Like I'm not going to go do that. So if I just spend a couple extra hours, I can create this system. So the parts of this system that need to happen here is

Matt Chriest   20:49
Yeah.
Yeah, right.
Right, right.

Marcelo Torres   21:09
We need to make sure that like if I push to the server, it pushes back to the same session somewhere else. Oh, and there's a third thing, by the way, I'm sorry. The third or fourth thing is right now we have a WebSocket event that fires, an event that fires when we reconnect to a WebSocket, no pages listen to that. What I'm going to do is have my system listen to that.
And it will mark everything as dirty when you reconnect to a web socket, so you don't have any stale data sitting there. And these like four things together should manage your runtime, your lifetime. So the step visible with automatic reporting through the live-based live dashboard with the response to that web socket, you know, ping.

Matt Chriest   21:31
Mmh.

Marcelo Torres   21:47
And then that should kind of just manage your data lifetime for you and make it much more efficient. And then with this pagination system, this keystep pagination system on the servers, you're not waiting for a new query. So like that's the downside of AG tables. If you go, I mean, like, I don't know where to find one.

Matt Chriest   21:47
Mm.

Marcelo Torres   22:06
But if you find an AG table somewhere,
you know, because mine aren't populated. This is my problem.

Matt Chriest   22:12
Ohh.
Oh, probably, yeah, okay.

Marcelo Torres   22:15
But you understand, like, if you find one, when you click the drop-down.

Matt Chriest   22:15
Okay.
Mm.

Marcelo Torres   22:21
Here, okay, perfect. When I store it, it's a new query. That was a new query that just happened. And like, yeah, sure, application entities, that's fine. But put me in the CDP with 2000 records, 20,000, it takes forever. That was my biggest gripe when I was using CDP. Everything is a new query. And every single time you hit the end of a page, it's a new query into the DB.

Matt Chriest   22:34
Yeah.
Mhm.

Marcelo Torres   22:40
And it's and it's not a it's not a like, I mean, like literally you can't even see it. This isn't even made based on infinite scroll. This is literally a new query every time and it's an offset query. So offset queries query everything before it every single time. And we have caching. We have an engine on the server side that caches, but it's like, this is not efficient. So.

Matt Chriest   22:41
Mm.
Okay.

Marcelo Torres   22:59
I want to build that.

Matt Chriest   23:00
Okay, yeah. I mean, I think you should do it. Like, I think, I mean, again, I don't fully understand everything you said, but like, I get your reasoning, I get what you're trying to accomplish. And I think that's a great goal. And I would back you up on that.

Marcelo Torres   23:03
But, but the...

Matt Chriest   23:19
For sure.

Marcelo Torres   23:20
Okay, so yeah, so the thing I'm going to need to do, and what's going to get tricky is this is going to be a bunch of changes in the GUI stuff and like some weird stuff in the tables. I don't know how weird it's going to get. I'm going to have to see, it might get weird and I have to like back off and try to change my approach.

Matt Chriest   23:38
Mhm.

Marcelo Torres   23:39
The other option, I don't know who, maybe you consider this, maybe someone else does, AG Table Enterprise provides a ton of features that might be worth having a look at. If you haven't looked at it, I'm not looking at it, I'm building my own thing, and then we'll come back. But it's just something to put on people's radar.

Matt Chriest   23:54
Yeah, OK.
Yeah, yeah. And honestly, I know that Amith was the one that kind of really drove the AG grid. So like, I think, you know, if you kind of like maybe set the stage much like you did with me, he would probably maybe even give you a little bit more information as to why perhaps there might be a reason why things are the way they are.

Marcelo Torres   24:03
Mhm.
Well...

Matt Chriest   24:17
But again, he might just be a good person when he gets back to like be like, hey, like this is my proposal. What do you think? And he might be like, hey, no, we can't do that because of XYZ. That again, he's 10 times smarter than I am. So he might have some reasoning behind why things are, but.

Marcelo Torres   24:23
Yeah.
That.
Agent grid is just, it's reliable. We're not rebuilding the wheel with it. It does everything we need it to do. And I think that was the impetus for it. But I mean, performance is, in this case, that's pretty much the user experience right there. Thousands of journal entry records accessible quickly, and then it.

Matt Chriest   24:36
Mm-hmm.
Right, right.
Yeah, agreed.
It is. You're absolutely right. Yeah.

Marcelo Torres   24:52
Goes to everyone.

Matt Chriest   24:53
What?

Marcelo Torres   24:53
Which is the goal?

Matt Chriest   24:55
Yeah, absolutely. I know you have to you have to drop off, right?

Marcelo Torres   24:59
Yeah, I do. I gotta go.

Matt Chriest   25:00
Okay, yeah, no worries. Well, thanks for reaching out and I'm sure we'll reconnect soon, all right?

Marcelo Torres   25:05
Yeah, and I appreciate your feedback. And yeah, I'll be in touch. We'll stay in touch.

Matt Chriest   25:07
Yeah, alright, alright. See you, Marcelo. Bye. See you as well. Bye.

Marcelo Torres   25:10
Have a good day, Matt. Nice to meet you.

Marcelo Torres stopped transcription
