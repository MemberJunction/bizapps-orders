Accounting UI Review-20260720_112826-Meeting Transcript
July 20, 2026, 4:28PM
38m 54s

Marcelo Torres started transcription

Marcelo Torres   0:03
I just started the transcript, so I'm going to probably just repeat what you said so I get it. Okay, yeah. Okay, so what I'll do is that deep linking helper, I'll make sure that goes into...

Matt Chriest   0:06
Sure.
Yeah, yeah.
Mhm.

Marcelo Torres   0:16
Um...
I'll make sure that's as reusable as possible. And then getting it into MJ base. So you want an MJ core. Do I PR that? Do you want to handle that? How do you want to do that? I can PR it. I just want to make sure you don't want to handle it yourself.

Matt Chriest   0:19
Mhm.
No, yeah, you go ahead and PR it. Obviously, with that being said, you know, based upon today's conversation, we might want to just have Amith or whatever take a look, just, you know, because obviously this is going to be introducing additional functionality that doesn't currently exist. So we just want to make sure that Amith is on board with that. But from my standpoint,

Marcelo Torres   0:31
Okay.
I agree.

Matt Chriest   0:50
This is this is going to correlate with some UI UX stuff that I have in my mind globally of like just making it more easily navigable from one application to the next, whether maybe even be a breadcrumb navigation. Again, I don't know if that's going to be a one-to-one use case, but I think this is going to be a good.

Marcelo Torres   1:02
Mhm.

Matt Chriest   1:09
catalyst to kind of make the application as a whole be a little bit more navigable. So I'm all on board with that, being like a global, yeah.

Marcelo Torres   1:17
Yeah, well.
I can try to find, I don't know if I've actually implemented any of the cases where I would be able to do it.

Matt Chriest   1:25
Mhm.

Marcelo Torres   1:27
Yeah, no, I haven't. Okay. So, all right, so that's good to know. I'll make sure that that gets worked up and then put into a PR. It might be a little bit till then, but that's okay. Well, I also have this system.

Matt Chriest   1:31
Mhm.
Sure, yeah.
Huh?

Marcelo Torres   1:41
Um, with tabs.

Matt Chriest   1:44
Mm.

Marcelo Torres   1:44
and workspaces. So this is one of the UI things I wanted to run by you. Basically, when you have an order, it's a lot, it's huge. You have a ton of different options to fill in. And if you're working on one, you don't want to lose it. So I built out this workspace draft system like this.

Matt Chriest   1:49
Sure.
Mhm.
Yeah.
Okay.
Mm.

Marcelo Torres   2:03
There's a couple things here. So the first, the biggest thing is like...
Let's say I want to open up a...
Let's say I'm looking at an order, right? And I want to open a journal entry on the order. Right now, my only real method to do that is basically to link back over to Accounting and open up Accounting. But to get back to orders to exactly where it was, there's no back button. Well, theoretically there is, but there's a, you'd have to use the browser's back button and the performance on that.

Matt Chriest   2:14
Huh?
Yes, that, yes, yes.

Marcelo Torres   2:31
We're not guaranteeing, I'm sure.

Matt Chriest   2:33
Yes.

Marcelo Torres   2:34
So...
Like when we're thinking about this cross app functionality, I think it's something that really needs to be kind of drilled down on. This is like the start of that. This is the first idea there, which is to have orders. One thing, so like the Claude's question on this is basically.

Matt Chriest   2:40
Mm-hmm.
Yes.

Marcelo Torres   2:53
Um...
This is like a framework, the workspace tab framework. These are the orders are stored in your session, obviously, because they're just in the UI. There's nothing like on the back end here. The question is, do we want to kind of...
Maybe this isn't something for me to do down, but I think we should maybe look at bringing this framework into MJ and supporting it, or something else that I can standardize here as well. Basically, like if you're interested in kind of attacking that problem, I think this could help. But at the same time, if you ever do attack that problem,
I think it applies here too, so I just wanted to let you know and kind of get your thoughts.

Matt Chriest   3:31
Yeah, and that's kind of actually that sort of dovetails to like my previous comment. Like that's one of the things that I want to work on this quarter is like what happens when a user is in one application and then needs to go to another app or like, you know, if you click on a record, it opens up the record and you kind of lose your place.
like the main navigation and navigating MJ as a whole needs to be rethought and refactored so that people don't lose their place, so that people can have a very good user journey and a good flow of like, okay, I clicked on this, but there's always an escape hatch to go back.

Marcelo Torres   3:54
Yes.
Yeah.

Matt Chriest   4:10
or a way in which, again, we do have this functionality, but it's not very user-friendly of, hey, let me open this in a new tab, right? So that I can have like both apps open, like in two different windows, like, you know, within MJ Explorer. And again, maybe you're not, yeah, so we do have that functionality, it's just nobody knows.

Marcelo Torres   4:25
Yes.

Matt Chriest   4:29
to do it, right? Like if you were to, I think, hold down shift and click on an add item, that would theoretically open in a new tab.

Marcelo Torres   4:38
Well, it doesn't happen here, but I don't know if that's...

Matt Chriest   4:38
So.
Yeah, so you see, again, this is a problem too, is then you like kind of lose, like, once you go in another, you know, it's just, yeah, and you can split it, so you can drag that and you can put it into two windows, like, yeah, you see what I mean?

Marcelo Torres   4:46
Wait, oh my god, wait, you're right. What?
I mean, that's insane. Wait, that's huge. That's incredible functionality.

Matt Chriest   4:56
Yeah.
Right, but nobody knows how to use it though, right? That's the problem.

Marcelo Torres   5:00
Yeah, I mean, I've never, there's no tutorial, there's nothing.

Matt Chriest   5:02
Yeah, exactly. So again, this is good.

Marcelo Torres   5:04
Are you kidding me? I mean, this is, this is, this is like this fixes like my entire problem.

Matt Chriest   5:08
Yeah, and then you can, and again, this is kind of like VS Code where you can stack it on top if you want. You can, you know, you can, it's flexible in such a way where, you know, you can make it be the way you want it to be. Now, again, this, the execution is there, but the, well, the execution is halfway there. Making it user-friendly so people are aware of that.
And as well as, you know, just some of the finer nitty-gritty details to make it like seamless. I think it needs to, yeah.

Marcelo Torres   5:36
I mean, this changes my entire view of MJ as a tool. Like this makes MJ Explorer actually useful to me.

Matt Chriest   5:41
Yeah.
Yeah, yep, so.

Marcelo Torres   5:45
I could build like dev tools in here and they'd be useful.

Matt Chriest   5:47
Yeah.
Yeah, so it's just it's just being aware of this and building on top of it. Again, this is clunky. I mean, again, I think the way it works is fine. It's just, you know.

Marcelo Torres   5:51
This is crazy.
Yeah.
Yeah, I mean, I should be able to drag these down to here, drag them across, like, but I mean, right, nitpicks in the fact, in the fact of like someone has to build all that, it's easier for me to say it.

Matt Chriest   6:03
Right, right.
Right, but again, it's very, it's very, a lot of small details that add up to a big thing that we just need to kind of flush out. So that's something that is on my, this is just, this is 1 facet of like the larger picture of like making the navigation a little bit more accessible and more user-friendly and more importantly, just more intuitive, right?

Marcelo Torres   6:14
Mhm.

Matt Chriest   6:29
Like, I mean, this is that intuitive at all. I literally had to tell you to do this. There's no way you as a user would figure, yeah. And that's horrible users.

Marcelo Torres   6:30
Yeah.
I would never have thought.
I mean, it makes sense based on like, I've used a Windows computer report and how ShiftClick works, but like, I would just never have expected an app to handle this.

Matt Chriest   6:42
No, there should.
No, there should be some sort of tutorial or even some sort of like tool tip where like it suggests it, you know, and implies it.

Marcelo Torres   6:49
Yeah.
There needs to be some kind of indicator. There needs to be a window button, actually, just to the right, right here. You know how VS Code has that split button?

Matt Chriest   6:53
A 100%, 100%.
Yeah.
Hundred percent, yeah, you're right, yeah.

Marcelo Torres   7:00
If you add that split button in, then users will use the feature and then you could have a hover on the split button that says shift click. One other thought, I'm sorry, go ahead.

Matt Chriest   7:06
Yeah, yeah, and...
No, go, no, go, go for it.

Marcelo Torres   7:12
Oh.
Let me just write that down.
So I noticed just looking at this, when I click over to here, right, this is in Accounting.

Matt Chriest   7:23
Kihm.

Marcelo Torres   7:24
Oh, it actually did. Okay, that's cool. Oh, this is interesting. So when you change the tab, it changes the top bar. But when you click into, it doesn't track like which window is active. If I click into this tab, it doesn't change the top bar. But if I change it, it will. So I mean, that's pretty crazy. Yeah. So that might be something to consider, like change the top bar to the active window.

Matt Chriest   7:30
Mmh.
Yes, yeah.
Correct.
Yeah, yeah.
Yeah, so this is.
Yeah, I know the top bar as a whole is something I kind of want to.

Marcelo Torres   7:50
Yeah.

Matt Chriest   7:50
think about too. Like I don't like it.

Marcelo Torres   7:51
I agree, it's almost like you should be able to put apps in there or something.

Matt Chriest   7:54
Partially, yeah, it just, I don't know, it's just...
I have a few thoughts and I'm still kind of just sort of digesting like a better way of maybe presenting it. Yeah, and then, you know, with that being said.

Marcelo Torres   8:05
Mhm.

Matt Chriest   8:13
Like, you know, again, this, this, this is me going on the record since we're recording it, like, um, you know...

Marcelo Torres   8:18
Yeah, yeah, dude, it's it just it goes in there, it goes in there.

Matt Chriest   8:21
Yeah, since we're since, so we probably want to use container view ports rather than media query view ports for these applications. That's something I started doing, but I haven't fully done. What I mean by that is, and again, I don't know if you are aware of this or not, but you know, with media queries, you're querying like the view port.

Marcelo Torres   8:27
Okay.
No.

Matt Chriest   8:41
pixel width, you know, so for example, old mobiles, 768 pixels. Since we're using these tabs, we want to do containers so that.

Marcelo Torres   8:48
About.

Matt Chriest   8:50
So that when you have two tabs like this, the left bars.

Marcelo Torres   8:51
Oh, yeah, because this five dash bar should, uh-huh.

Matt Chriest   8:55
Yeah, it needs to be responsive for the window as opposed to the viewport. So that's something that again, it's not there, but I just want to go on record saying because that's something that we should consider to make this really, yeah.

Marcelo Torres   8:57
Okay.
Right.
Wow.
Well, yeah, and I mean...
I can use that in any new elements, but yeah, that's a great idea. Yeah, that's such a cool.

Matt Chriest   9:15
Yeah.
Yeah, yeah.

Marcelo Torres   9:19
Yeah, and I mean, having these tabs where this is a cool system, like, is that making that approach optimal? Um, and what you were saying about the nav bar too?

Matt Chriest   9:20
Yes.
Yeah, yeah, it needs to be.

Marcelo Torres   9:28
I feel you. Like I don't know what it is, but I feel you on it.

Matt Chriest   9:29
Yeah.
Oh yeah, because now the nav is conflicting, right? So for example, the left hand tab you have open, the all batches, that's so cramped. Like if we were, you know, since it's in a two column slot, we should be querying the view, the width of the tab that's open so that the left nav is hidden. There's like some sort of hamburger button that you can expand it.

Marcelo Torres   9:35
Uh-huh.
Yeah, I see you.

Matt Chriest   10:07
Yeah, yeah, but yeah.

Marcelo Torres   10:09
Actually, I am. Oh, I'm sorry. Yeah, go ahead.

Matt Chriest   10:12
No, no, that's all I have.

Marcelo Torres   10:14
I was actually, that's one of the things I wanted to ask you about is adding, so I thought about a lot of ways for this because I thought the same thing as you. My first thought was actually auto collapse, but it doesn't really make sense with like a nav bar like this. So the thought that I came to was to have the arrows at the bottom where you just click it and it'll shrink, click it to bring it back out.

Matt Chriest   10:27
Yes.
Yeah.
Yeah.

Marcelo Torres   10:34
And that's like, and by default it's open, but you still have that collapsing behavior when the screen gets small, which you've got built in there, which is super cool. One thing I will say though is like, I noticed like once it's collapsed, I don't know how to get it back.

Matt Chriest   10:35
No.
Yes.
Mhm.

Marcelo Torres   10:50
On.
Oh, it's right there. Oh, that's great. That's great. This is going to be interesting. I have to figure out how, why this looks the way it does. See, that's the other thing though.

Matt Chriest   10:53
Yeah.
Well, yeah, and that's the thing. This is, I will say, like, this is not developed well for mobile. And again, we have to keep in mind that nobody would ever use, or nobody can ever use the tabs, like the Windows for mobile. This is only reserved for desktop, like the multiple.

Marcelo Torres   11:06
It's not supposed to be.
Yeah.
I mean, even then, no one's using this on mobile. Like this page right here, you can develop this for mobile as much as you want, like reviewing journal entries. Good luck. On a phone screen, good luck. It's a separate app. You'd have to build a separate specialized interface. But

Matt Chriest   11:19
Yeah.
Mhm.
Yeah.
Yeah.
Yeah, and that's something that Amith has kind of been toying about is having like a dedicated mobile app for MJE, which is going to strip down a lot of stuff. But again, that's not something that we have to worry about right now.

Marcelo Torres   11:41
It be on that.
That's a lot.
One thing also, like, you know, you were thinking about this top bar. I noticed, if you notice, like, it's not on this one, but...

Matt Chriest   11:50
Mhm.

Marcelo Torres   11:55
If you noticed, I've shrunk this top bar down as much as possible.

Matt Chriest   11:58
Mhm.

Marcelo Torres   11:59
One thing that, like, to me, there's a lot of dead space happening with this, and then I mean the tabs, and then this, the tabs are honestly, these are very thin. Like, this is about as thin as you can get that. But, like, just connecting to that thing you said with the nav bar feeling weird, it's like this is, this is like a fifth, an eighth of my screen, maybe. And then you add this sidebar, and I can't collapse it, and you lose a lot of screen.

Matt Chriest   12:06
Mm.
Mhm.
Mm-hmm.

Marcelo Torres   12:22
with our nav resources. So just something that I've been thinking about.

Matt Chriest   12:27
Yeah, I, yeah, and that's the thing is, like, I, I, I did like a Chrome update recently. The problem, what I, one of the things I've been trying to tackle is, and again, just for your edification, is that, like, we have all these developers developing various apps, not using like a set, like standardized.

Marcelo Torres   12:28
On.
Mhm.

Matt Chriest   12:46
like information architectural pattern, you know, so like, you know, you go on one application, it's completely different from another application. So one of the things I try to do, and again.

Marcelo Torres   12:50
Yes.

Matt Chriest   12:57
especially with AI, things are in reverse, right? Like we should have done like a UI, UX like mock up and design before building out this entire application, but it is what it is, right? Like it's too late now. Now it's like we're in a tremendous amount of technical debt with this. So what I've been trying to do, and again, I'm not fully on board with this, but.

Marcelo Torres   13:07
Mhm.
Yeah.

Matt Chriest   13:19
I need to start somewhere is if you like, if you don't mind, go to like a different application. So like open up maybe Admin. Yeah, Admin.
So like, yeah, so this is 1 variation. So we have the left navigation, right, then we have the top bar. If you maybe go to actions as another application, if you don't mind.

Marcelo Torres   13:37
Mhm.
Yeah, that's a cool one.

Matt Chriest   13:45
So as you can, okay, so here's the problem, right?
is that some application, and again, I'm trying to find a consistent home for each and every single item, right? And I'm more focused on the top nav bar. So where it says actions overview, health and activity for all of your whatever, you see a lot of the actions have like a bar, like a button.

Marcelo Torres   13:55
Ohh, Jesus!
Okay.

Matt Chriest   14:08
That's always reserved to the right hand side. Then we have the filters and then we have the search bar. I'm just trying to find like a consistent pattern where each application's search is 1 in one place, the filters is in one place. If there's like an add button is in its own place. I'm just basically trying to find slots that so that when you go from one application to the next, you're not trying to like scan the page to figure out.

Marcelo Torres   14:26
Uh-huh.

Matt Chriest   14:31
where that is. And again, I'm not saying this is perfect. This has a lot to be desired. I think the first thing I'm just trying to do is just declutter things, find a home for something, and then perhaps fine tune. Because I agree with you. Right now, as you can see, there's a lot of dead space above the filters and the search bar.

Marcelo Torres   14:49
Mhm.

Matt Chriest   14:51
The reason why there's a there's a lot of dead space.

Marcelo Torres   14:52
I mean, actually, just all of this.

Matt Chriest   14:55
Yeah, again, the cards don't really serve much purpose. And that's another thing where I'm trying to, again, there's a lot of work that I need to do, right? Like those cards should be.

Marcelo Torres   15:01
Right. Well, it's hard because you got people changing stuff, you know, all the time.

Matt Chriest   15:05
Yeah, yeah, it's kind of playing, it's whack-a-mole, honestly. And it also just time, like, because I'm kind of working on other projects, but yeah, that's the thing I'm wanting to clean up. We have all these applications that have these top cards, 500 total actions. Like, that doesn't need to take up 150 pixels. That could just be a...

Marcelo Torres   15:08
Yeah.

Matt Chriest   15:25
That could be like a pill that's above like the header, you know, and then that can bring everything up and then you can actually see the things you want to see. You know what I mean? So there's a lot of work that I want to do, but this feedback that you're giving me is, I love it. Like, I love hearing your take.

Marcelo Torres   15:28
Mhm.
Yeah.

Matt Chriest   15:44
because again, people, I'm only one person, right? I see what I see, but hearing other people's perspective really.
It's helpful and it also kind of almost validates the things that I've also noticed myself. Like I'm not imagining it, right? Like other people are noticing the same things I'm noticing. So keep it coming. Like anything that you see, I can't promise I'll get it, do it right away, but it's, you know.

Marcelo Torres   16:08
Mm.

Matt Chriest   16:12
Knowing the pitfalls and just some of the things that you know I'm not hearing, it's just it's just good feedback, so...

Marcelo Torres   16:19
Yeah, well, I mean, and first, like definitely to say, you've done an incredible job. Like this, this is, this is the amount of tokens that are in here, the use cases you've covered. I mean, most of my stuff is modeled off of yours. So I'm very, like, I'm very impressed. And like the advice, the feedback I give is not to.

Matt Chriest   16:32
Mmh.

Marcelo Torres   16:39
Hear that down at all.

Matt Chriest   16:40
Oh no, no, I don't think it, I don't take that any way whatsoever. Like I, I love hearing that feedback, you know, like it's great.

Marcelo Torres   16:47
Yeah, so, so yeah, so I think the biggest thing for me is just that space right now. Like, like each of these cards, I wouldn't even trust these as things that the user would regularly click on. They could be, but I mean, it indicates when you hover, but you got to think about a non-technical user, and then like...

Matt Chriest   16:53
Mm-hmm.
100%. I think it's pointless.
Yeah.

Marcelo Torres   17:07
got this here and this here. So that's what I've been trying to cut down. Over here, you'll notice like I flattened that. I noticed you had meta tag options. I moved it. And the reason I did this was just because like this is like a full extra line and it's not really doing anything. But on a smaller screen, this is tricky. Understanding that is tricky.

Matt Chriest   17:10
Yeah.
Mhm.
Yeah.
Yeah.
Well, yeah, and I think that's the thing I'm trying to reconcile is like...
That's a whole bigger thing that I want to maybe even get your feedback upon and as well as other developers is like we need to standardize what's available for each app. Like, you know what I mean? Like, dude, like what I'm trying to figure out what I mean by that. Like.

Marcelo Torres   17:35
Mm-hmm.
like standardized the summer statistics and stuff.

Matt Chriest   17:45
Right, and like what's available. And like, again, the problem that I'm facing is like, each app has totally different features that may or may not exist from one app to another. So how do we cater each app to have a familiar information architecture while still being able to be like autonomous, you know?

Marcelo Torres   18:02
Well...
Yeah, I think I think some of that is.
you know, this kind of thing. So like maybe like this draft shell, right? Maybe you create the shell, but then inside here is always a form, right? But one thing I will say that I've noticed is like, so I don't know if you've noticed here, I have this slide in. This is a custom slide in. It's like, I think the existing.

Matt Chriest   18:13
Huh?
Right.
Mhm.
Okay.

Marcelo Torres   18:28
look, uses this format, I like can't use this. Like, I mean, I can use this. Okay, this does work, but I've got a lot of issues with it. The first is like, okay, if it's doing a query, there's a loading icon right here. If it's, if half of it is collapsed, the whole thing will move to like these buttons are never in the same location.

Matt Chriest   18:32
Mhm.
Uh-huh.
Yeah.
Mhm.

Marcelo Torres   18:49
That's that's an issue.
And it's just like UI wise, there's a lot of, again, like there's, it's not.
Like, this is not, this is not like, there's this weird space here. Now, the tricky part is like, you have these accordions and obviously, like, again, this is one of those things that it's like, you built this as a baseline and it works very, very well as a baseline. As like a, I need a fill-in, that is the perfect thing. So I can't dislike it because this, I don't know how to standardize this yet.

Matt Chriest   18:59
No, sorry.
Yeah.
Mhm.

Marcelo Torres   19:18
And so that is a real problem with the slide ends. But I've been trying to build elements and like the whole goal is a tighter design.
On.
language. Because of accounting being so information dense, I'm trying to get all the space I can for these tables. Like if you look like a journal entry right here, right? It's like just huge, all the amount of information that's getting covered. Oops, sorry. So

Matt Chriest   19:33
Yeah.
Huh?
Yeah.
Mm-hmm.
Not, yeah, I hear you.

Marcelo Torres   19:47
So I've been trying to cut like every bit of space I can so I can get more views here, more this view. I'll probably have to change this layout. A couple of things. So obviously the workspaces, this is something I'm going to try to standardize, but it's tricky because they're all different.

Matt Chriest   19:52
Yeah, mhm.
Yeah.
Mmh.

Marcelo Torres   20:11
I like its like customizability. One thing, so there's two things. When I talked with Soham, he suggested that I actually put the filter buttons right here. And he actually has that in CDP. What's the link for CDP?

Matt Chriest   20:15
Mmh.
Uh, cdp.bluecypress.io, I think.

Marcelo Torres   20:36
If I'm signed in, I might not even be logged in in that case. I have to do it another time.
But like, so there is a feature for that in AG grid that we have access to, we just need to enable it. And so it'd be nice to be able to put the filter icons there. And the other, and I can do that on my side, it just, it creates, I'd have to create an overlay. And so I off put it because like, there's other stuff to do. The other thing is, it's.

Matt Chriest   20:45
Mhm.
OK.
Mhm.

Marcelo Torres   21:01
impossible to indicate right now which rows are not filterable and which ones are. So every row right now is filterable, but when you get into journal entries, like you can't do that. You have to limit it based on indexes. Like I'm not going to filter on status. I'm not going to store, sorry, not filter, store on status because like.

Matt Chriest   21:05
Yeah.
Yeah.
Okay.

Marcelo Torres   21:20
I just have it right here. Actually, I do sort on, I should be starting on date based when I start. Like, I can I can change the status through like the query, right? So, you know, if you want to see a certain status, just query the certain status and then sort the way you want.

Matt Chriest   21:29
Mm.

Marcelo Torres   21:36
But right now, that's not indicatable. And so this kind of chart where you have these arrows, this like, there is an option to set this icon in AG grid as well. But like seeing how like this has no arrow, this has no arrow, although this does sort it, like this chart is by no means perfect, which is having the ability to say, hey, you can sort this column.

Matt Chriest   21:43
Yeah.
Mm-hmm.

Marcelo Torres   21:57
Hey, you can't sort this column; that, um, that's good for, like...

Matt Chriest   21:58
Hundred percent, yeah.

Marcelo Torres   22:02
Visual language.

Matt Chriest   22:04
Yep, I agree.

Marcelo Torres   22:07
The workspace thing, I think I wanted to get some feedback on if you thought this could be made better, improved, maybe using forms. I don't know how forms work, so I don't know what I can and can't use them for. And B has told me to use them.

Matt Chriest   22:20
Okay.

Marcelo Torres   22:23
So I guess I guess I'll look into it, but do you know anything about it?

Matt Chriest   22:23
Um...
I, I don't, I, I, the forms are kind of the area where I'm kind of a little bit less knowledgeable on. I mean, I'm, I'm, yeah, I mean, I'm, I have a high level overview of a lot of things. I don't really fully understand the details of each.

Marcelo Torres   22:34
Totally understandable.

Matt Chriest   22:44
Piece different functionality, but the forms is the, I would say, is the least knowledgeable thing about MJ that, that, that, yeah, sorry.

Marcelo Torres   22:53
Okay.
I think, no, it's okay. I think, like, you know, the forms, Amit says, are a way to build, like, entry and viewing items for different entities automatically. So I think they could be, I'll look into them and I'll let you know what I find. They could be good to leverage for, like, making some kind of standardized set of dialogues and views.

Matt Chriest   23:09
Okay.

Marcelo Torres   23:16
that we can then share across the apps. Because what I've created here is AI calls it, it's a real UI, I think it's like a view detail view schema or something like that, or like master detail schema where you have like one overall view of everything. And then you can, I mean, it again, it doesn't happen here, but you can like open it up into the workspace.

Matt Chriest   23:18
Mmh.
Mm-hmm.

Marcelo Torres   23:36
And I still haven't made that work. Lovely.
Just to go through a bit, like...
And these pages need work. One thing that I've noticed is like the cards are kind of interesting, right? So...

Matt Chriest   23:47
Mhm.

Marcelo Torres   23:55
And I've got like, I had this weird thing where I totally use different tables on different pages because I wanted some thoughts. I'm still, I still think this dropdown is really useful for the batches, but it's probably going to be something I push off just because I need to do features right now. But like one thing I noticed about the cards, right? So.

Matt Chriest   23:59
Mhm.
Mhm.
Hello.

Marcelo Torres   24:14
They look good, but then you have a table and I'm really confused about how to handle this. Because, so there's like two options, right? I could scroll the whole page, but then the filters scroll out of the page.

Matt Chriest   24:26
Mm-hmm.

Marcelo Torres   24:28
If the filters on the headers of the table, that's slightly different.
But like, what I want to do, I think, is I want the table to hit, I really want the table to cover all the way up to the bottom of the filters, like right here, and then cover all the way up to the sides and all the way down. And then I want it to be scrollable. And then the question is, do we also scroll the page and have the header locked to the top and the body scroll behind the header up there?
Because all the filters and sorting options are already there. It's just these like time-based, you know, from and to these components. But you'd be able to scroll them out of the way. Or if you're a user, is that going to feel really confusing? You know, I can't always tell. But handling this view, I think, getting it the most like space efficient.
That's really important for accounting. But the problem is like consistent visual language, right? So like if I bring this out to the edge, it's going to, I actually, I probably can bring it out to the edge, but now you have a card and a pane. It's a little bit weird, right?

Matt Chriest   25:19
Yeah.
Yeah, I, I, yeah.
I don't think so. I mean, I think it would look good like if like, yeah, like if the table had the same border radii as the card above and you know, I think it would look good if it was the same. I mean, you might want to have it a little bit indent to have to establish hierarchy so you know that like the above is, you know, that's a little bit better because that has a border radius. I don't know if it's the same border radius.

Marcelo Torres   25:46
Okay.

Matt Chriest   25:49
Um...

Marcelo Torres   25:50
But see, my issue is...

Matt Chriest   25:50
What I mean by the curve, yeah.

Marcelo Torres   25:52
My issue with that is, like, we have this padding right, and we have this border radius, and, like, for the filters, fine, you're not losing any data with this padding, but down here, like, I'm actually just losing viewable space, the more of this padding I have, but, like, again, like, great, terrible, terrible example on this table, right? But...

Matt Chriest   25:57
Yeah.
Mm-hmm.
Hundred percent.
Mhm.

Marcelo Torres   26:14
Like with this one, I mean...
You might get, you get the whole word of data in there if you take this padding out. The other thing is, and I don't know how to standardize this, but standardizing the row, having the rows auto fit, I'm going to have to look into.

Matt Chriest   26:21
Mhm.
Yeah, that should be, I know how to do that in CSS, I don't know how to do it in AG grid off the top of my head. But yeah.

Marcelo Torres   26:34
Sure, they have a feature for you.

Matt Chriest   26:36
Yeah, it should be like.
Payable layout. Again, I yeah, I haven't, I I am familiar with AG grid, but I don't know the ins and outs off the top of my head. Let's see. Oh, so let me let me directly answer your question in regards to like the sticky, or not the sticky, but potentially sticky, but like having that filters always be viewable.

Marcelo Torres   26:52
Uh-huh.
Uh-huh.

Matt Chriest   27:01
I do have a like I so like.
The way that I, again, this is like the MJ Chrome. So like, you know, we have the top MJ header, which is the general entities as well as the metadata. Underneath there, we have the left, the MJ left nav, and then the MJ left nav content. Don't quote me on the actual.

Marcelo Torres   27:13
Mhm.

Matt Chriest   27:22
precise terminology, just that's what it's called. Now within that is the, we should have the interior chrome, which would be the all journal entries. So that should be set up in a place where that is always like sticky, it's always there so that when you scroll.

Marcelo Torres   27:23
Right.

Matt Chriest   27:44
whether it be a table, whatever content you have below that, that's the content that's scrollable so that you never lose place of what's like with what is with the filters that are viewed right now. Like you don't want to lose your place on that, right? You always want to have access to the filters, right? Now.

Marcelo Torres   27:56
Okay.
Yes.

Matt Chriest   28:03
One of the things that I've been doing.
Which again, I think we sort of talked about this last time we were on a call, which again, I'm on the fence. I think that it's good in some cases, but in some cases it's not. It's consolidating the filters. Because right now with the filters you have right now, like you have so many filters in place, which are good, I think they're all legit.

Marcelo Torres   28:23
Mm-hmm.

Matt Chriest   28:25
But they're taking a lot of line, they're taking a lot of vertical space, right? Like, you know, like you have two rows of filters. How do we condense that, right? Like, should we condense it, right?

Marcelo Torres   28:34
Yeah, I mean.
get rid of all this, right? But yeah, yeah, I agree with you. There's a lot of filters.

Matt Chriest   28:38
Home.
Right, so like again.
Not seeing this as good or bad, but like one of the things I introduced was the MJ filter panel or whatever like that, where like it basically, if you want to filter, you have to click a filter button, then it displays all the filters in a dropdown.

Marcelo Torres   28:59
Mhm.

Matt Chriest   29:00
you know, just to kind of serve, conserve space, right? Again, I'm not saying that's applicable. Maybe what we can do is we can maybe make another variation of the MJ filter bar where it.

Marcelo Torres   29:05
The.

Matt Chriest   29:16
It serves for more like advanced, like maybe we have a simplified version, which you saw in the previous page, and then maybe we have another one where it's an advanced filter option where instead of having everything stacked on top of each other, it can be in a grid such as what you already have it the way it is right now, but the way we...
What we could do is we could have it so that you can expand and collapse it so that when you want to see the builders you see it, if you no longer want to filter the content, you can expand it up to get rid of like the, you know, the 200 whatever pixels of, you know, vertical height and vertical space that we're dealing with right now.

Marcelo Torres   29:48
Is.
I think.

Matt Chriest   29:59
Yeah.
Mhm.
Mhm.

Marcelo Torres   30:15
Words like an app with a lot of data. You know, this is a solved problem. Like these are all, someone has solved this problem before for us.

Matt Chriest   30:17
Yeah.
Oh yeah, and I've seen it before, like I've seen it before, like hell, like even like maybe just having a filter button like we said we had before, but then just like since there's so many filters, like just having it slide like to the right using the MJ slide panel that you saw before, where it just has all the filters, you can filter it, and then just click out of it and then just see the table like.

Marcelo Torres   30:35
Mhm.

Matt Chriest   30:40
This, I think there's...

Marcelo Torres   30:41
Yeah, I mean, I would just put the filters in an accordion, right? Because it's less movement of your mouse and that's going to, I mean, a slide in is like it's more clicks to get to the same thing. If I have to click here and then click here.

Matt Chriest   30:48
Yeah.

Marcelo Torres   30:55
I don't know, I guess it probably works too, but...

Matt Chriest   30:55
Yeah, but if you, yeah, but if you do, if you do an accordion, then it pushes everything down and you can no longer even see the table.
Right.

Marcelo Torres   31:03
Yeah, oh, right, if it's that much space, I see what you're saying.

Matt Chriest   31:06
Yeah, yeah, yeah, so I'm just saying, like, I mean, this is a good, this is fine, like, I'm cool with that view, but, like, if, anyway, again, I, I, it's just, this, this, I think this kind of goes outside of just accounting, it's gonna be just something where, how do we handle this for any of the products, because this is not gonna be the, this is not gonna be the only app that's gonna...
You know.
It's gonna, we're gonna run into these same problems going forward with various other apps that we developed, so how do we wanna maybe, how do we wanna handle this on a global, like, you know, heuristic level? You know, so it's just something to think about that, you know, so I, I, I do like the concept of maybe having various other filter.

Marcelo Torres   31:42
Yeah.

Matt Chriest   31:46
components, like having the same filter component, but having different like options, like different view options, depending on the context. Like, do we have a simple filter? Do we have an advanced filter? Do we want to have it, like you said, in an accordion view? Maybe having it where there's like a little icon where you can just simply have it the way it is, but then just collapse it when you want to, right?

Marcelo Torres   32:07
Ohh.

Matt Chriest   32:07
I think there's just things to consider, and there's different options we can maybe go down just to make it a little bit more flexible for the various, you know, use cases.

Marcelo Torres   32:18
I agree with you. I think maybe something to kind of use a bit and see, but it's definitely a place of thought. One thing I wanted to get kind of some clarity on. So this is a, there's a very good, this is a good example. I have a few types of sort of editors.

Matt Chriest   32:24
Yeah.
Mm.
Mhm.
No.

Marcelo Torres   32:37
And I wanted, and I wanted to kind of get your thoughts. So, there's this, this, they're all, I call them like workshops, whatever, right? There's this, the product workshop, which I'm using. This, by the way, is the bare accordion element. If I end up using this, it needs a little bit of editing. So, like, right now, the arrow being on the right, it...

Matt Chriest   32:42
Mmh.
Mhm.

Marcelo Torres   32:56
It's actually fine, but like on a big screen, it's pretty visually confusing once you have the bare element. When you have the accordion element, it's not confusing because it's a card. But when you set it to bare, the arrow, like it would be nice if the arrow could move over and maybe like having a line across or something to indicate. And then the corners also just need to be rounded in this.

Matt Chriest   32:58
Yeah.
Mhm.
Mm.

Marcelo Torres   33:16
in this bare element, which is like, again, I might be using it wrong. Like maybe I need to match the background, but the highlight is definitely something to ground. This is one option that I'm not, I don't actually, I'm not a fan, but the other is this with the orders with these tabs. My issue with the tabs is like, again, hidden options. In both cases, it's hidden options.

Matt Chriest   33:24
Mhm.
Mm-hmm.

Marcelo Torres   33:37
But the other thing with the tabs is like, I don't know how you standardize this in a form. I don't know how forms maps to this. So my concern there is like, I mean, there's really no way around it because like when you add lines to this product, like you're going to have to have its own space for that.

Matt Chriest   33:43
Yeah.
Mm-hmm.

Marcelo Torres   33:57
And I can consolidate these tabs a little bit, but then...
This is the journal entry, which is like 1 main page. So I just wanted to get your thoughts, and this does have ad lines, but it does it inside of a box. I wanted to get your thoughts on like, do we go with a vertical approach, maybe even having like collapsible sections if we need to, or do we sort of lean towards a tab-based approach?

Matt Chriest   34:08
Mhm.
I mean...
I personally like the tab, but like...

Marcelo Torres   34:27
I agree.

Matt Chriest   34:29
Well, but let me ask you this: with the tab, are all of those tabs required? Like, are they like basically required, or like are they some of them optional?

Marcelo Torres   34:39
So...

Matt Chriest   34:39
Like...
I guess my point is like when we have something like this, yeah, like when we have something like this, like we need to be able to make sure the user knows when they can submit. And I assume the save order would be highlighted, like the button would be highlighted if you know all of the requirements are.

Marcelo Torres   34:47
Some of them are optional.
Mhm.

Matt Chriest   35:04
satisfied to be able to save the order.

Marcelo Torres   35:12
Yeah, I mean, my goal was to put like a little red dot on a tab that has something that's not correctly filled up. And I do need to go and audit like this system because already like, okay, this whole thing shouldn't scroll, that's a problem. But also just the details page must be filled out, right? The lines must be filled out and that happens every time. So it's like if you're going to do that.

Matt Chriest   35:16
Oh, okay. Yes, yes.
Yeah.
Mhm.
Hmm.

Marcelo Torres   35:32
You might as well just put these together almost. Or make like a first tab that you call like summary or something where everything they need is. Whereas this is like not as important. But I mean, it will be eventually. Eventually, most, if not all of this data is going to need to be filled out because why would I include anything that doesn't? There will be some optional data, but it's going to be very small.

Matt Chriest   35:34
Yeah.
Yeah.
I agree.
Mmh.
Yeah.

Marcelo Torres   35:54
But yeah, I mean, my plan was to put a little red dot right there, round this out, obviously. And

Matt Chriest   36:00
Mhm.

Marcelo Torres   36:02
mark all the different required fields.
But...

Matt Chriest   36:05
Yeah, I, yeah, that that was my that was my biggest concern, which is some sort of indication of, like, okay, like, you know, is this required or is not? Is it has it been filled out? Once it is filled out, like...
does the user have the wherewithal to be able to go to the next tab, which I think they do. But yeah, just having like a more of like a bird's eye view of like what is actually required, what's not, what's been filled out, what's been not been filled out, you know, like what needs, what still needs to be filled out. And then also just, you know, like I think what you've.
Touch based on is just making sure that the content within the tab is scrollable, so that the tabs are always visible, so that you know, was if the you know, if the tab content requires you to scroll down the page, that the tabs themselves remain in the same spot.

Marcelo Torres   36:52
Ohh.

Matt Chriest   36:56
So that's just going to be overflow, overflow attributes, just making sure that the y-axis is scrollable for the actual tab content itself.

Marcelo Torres   36:57
That's a good point.
Yeah.

Matt Chriest   37:08
And then the only other thing I would say is, sorry, go back to the tab one more time.

Marcelo Torres   37:15
Good.

Matt Chriest   37:17
Go to build the ship to or.
Yeah, that one. Okay.

Marcelo Torres   37:23
Yeah, this is not, it needs to be dropped down.

Matt Chriest   37:26
Yeah, yeah, and then.

Marcelo Torres   37:27
Or it needs to be right. Yeah, this needs work. Like, let's, like, don't, let's not take the fields here as things to give feedback on. They need work. I just wanted the visual language verified.

Matt Chriest   37:30
Okay. Okay.
Sure.
Okay.
Got it. Yeah, no worries.

Marcelo Torres   37:39
Um...
Okay, I think I have, I think I have a good amount of clarity. The big difference here is these tables versus, you know, cards and other apps, and I'm trying to balance that. And I'll check back in with you probably midweek once I get, because I'll standardize some stuff towards this. This view is really the one that I wanted to get validated.

Matt Chriest   37:45
Yeah.
Yeah.

Marcelo Torres   38:00
On.

Matt Chriest   38:00
I'm all about standardization and any help that you can, and you know, to give me to get us to be a little bit more standardized, I'm all for it. So I appreciate you kind of like taking that on and recognizing that. So that's awesome. I mean, that's awesome and very helpful.

Marcelo Torres   38:18
I'm glad I, I'm glad I can help.

Matt Chriest   38:20
Yeah, yeah.

Marcelo Torres   38:22
Okay.

Matt Chriest   38:23
Is there anything else?

Marcelo Torres   38:25
No, man, I really appreciate you taking the time. And I know it's like it's pretty busy, but like a packed meeting. We just keep going through stuff. But I just appreciate you giving me the review. Yeah, that's about it. I mean, trust me, I'll be back with other things, but this is a great start. This is really helpful.

Matt Chriest   38:35
Yeah.
Yeah, yeah, anytime. Yeah, don't hesitate to reach out if there's anything you need, right?

Marcelo Torres   38:45
All right. Well, thank you, Matt.

Matt Chriest   38:46
Awesome, cool. Anytime or so, I'll talk to you later, right?
Bye, bye.

Marcelo Torres   38:51
Bye.

Marcelo Torres stopped transcription
