Accounting Meeting-20260716_122016-Meeting Transcript
July 16, 2026, 5:20PM
31m 24s

Marcelo Torres started transcription

Robert Kihm   0:03
That's why I do put those comments in there to be like, "Hey, man, tell me that Claude's just gone down the wrong path," and it's like, 'cause I don't necessarily have enough time to get into the nuance. I try to, I want to. I tend to spend more time on migrations, the schema that's getting created, 'cause that's pretty easy for me to understand.

Marcelo Torres   0:15
Mhm.

Robert Kihm   0:24
and think about like foreign key links and performance and other things like that one I feel pretty good about. Sometimes the nuance of like, yeah, I forgot about that little thing. I'm hoping that Claude picks up on those.

Marcelo Torres   0:43
Yeah, I think like...
I do try to do that kind of stuff, like give it, give it, generally, if something's a little weird, I'll tell it like, hey, this looks a little off. Sometimes it just doesn't, sometimes it doesn't, it doesn't get it. And sometimes, you know, it's one of those things where like, I do need to just pass it off for review. But yeah, I appreciate.
The idea of giving that human review first and being honest about what is AI generated is something that I'll be using when I'm sharing feedback and like documents for feedback in the future.

Robert Kihm   1:18
Yeah, and sometimes you're just like, hey, in the interest of time, because then I can just say, you know what, Marcelo, I'll take more time before I take a look at this. And other times I'll be like moving it forward and, you know, and it doesn't have to be an all or nothing too. It can be like, hey, like five of these things got, you know, I feel pretty confident in these other five are the questionable ones and I've

Marcelo Torres   1:24
Mhm.

Robert Kihm   1:38
I'm leaning on Claude heavily on this. And like, and then I could say like, you know what, go spend some more time on this before, you know, we talk about it further. But yeah, like basically what you're doing is just giving information. And if I don't like, you know, what I'm seeing, I'll give you the feedback to say like, hey, please go spend some more time on this.

Marcelo Torres   1:41
Okay.
Okay.
Yeah, obviously I have those questions, and I think a lot of them are things that really require some debrief thought.

Robert Kihm   2:10
Okay.

Marcelo Torres   2:10
especially like I think the tax system in there, some stuff for Jeremy as well. The biggest things.
Design-wise, coming up, or...
Well, we had the decision on do we want to like start doing roles and visibility or are we just deferring that? The tax system, that's a big one. We want to make it happen.

Robert Kihm   2:32
Mm.

Marcelo Torres   2:37
I think foreign exchange is deferable, but...

Robert Kihm   2:37
So.
So...
So I think right now, what you're working on, they are deferred today, type of thing. And what I would say is, like, you should say, these are on hold until I get answers to these things.

Marcelo Torres   2:47
Uh-huh.
Yeah.

Robert Kihm   2:55
but they're not necessarily deferred out of what the deliverable is. It's just like, can't, you know, like they're basically stuck at that point. Or it's like, I'm going to like work around this stuff for now. I'm not going to incorporate it. You know, this is still a requirement, but you know, these, they, it's not going to proceed until we get answers on these things.

Marcelo Torres   2:59
Yes.
Yeah.
That's how I'm treating it at the moment.

Robert Kihm   3:22
K.

Marcelo Torres   3:23
Um, yeah, I'm working through.

Robert Kihm   3:25
What's the best way to provide you answers to these things and those shared questions and orders questions and accounting questions? How do you want the feedback?

Marcelo Torres   3:33
That's interesting.
Yeah, I mean.

Robert Kihm   3:38
You want it in a separate markdown document?

Marcelo Torres   3:41
I think, yeah, I think a separate markdown, a separate markdown document would be best. If you can tell, and this is like not a requirement, if your AI uses those IDs for the questions, that's great. That would make it easy for Mind to Matt back to what's going on. And yeah, I mean, honestly, some of these can probably be.

Robert Kihm   3:51
Yep.
Yep.
Yep.

Marcelo Torres   4:01
I mean, yeah, the answers to these can be should be easy to generate with AI.

Robert Kihm   4:05
Yep.

Marcelo Torres   4:06
On.
And they also like...

Robert Kihm   4:07
So, I'll, yeah.

Marcelo Torres   4:09
I'm sorry. No, go ahead. They also link to actual like features on the feature list in the repo. Like they have references in there. So if you are trying to get more information, generally feeding it to an AI that has the branch could give more info, but also like just asking me and I can get more context. I've tried to have enough context to understand what's going on.

Robert Kihm   4:10
No, go ahead.

Marcelo Torres   4:34
But I still think on some of these it's a little slim.

Robert Kihm   4:38
OK.

Marcelo Torres   4:40
Um...
But yeah, just a just a separate Mark time talk is the best one then.

Robert Kihm   4:49
I did have some good conversations with Jeremy earlier in the week too, just talking about accounting. He was unclear about what batches were, you know, and he understands them better now. Like he was like, you know, thinking that all the journal entries would end up in Business Central and it's like, nope. It's like the detail only exists in the sub-ledger. The sub-ledger is our order system.

Marcelo Torres   4:57
The.
That's good.

Robert Kihm   5:10
you're going to get the net and that's what's going to get posted and you do it. And he's like, okay, yep, that makes sense. I understand that now. And you know, we talked about all the, you're going to have links to tie it back to that sub-ledger. So all of those summary entries, like you're going to be able to then reproduce them to say, like, here's the all the journal entries that went into it, you know, all of this stuff.
Because we're locking it down, we'll still, you know, be there, and you know, so he understood that, and there was some, there was one other item that we had been talking about this week, too, that put some clarity on it for him, too. Ohh, it was, I think, conversations around the company batches.

Marcelo Torres   5:46
But.

Robert Kihm   5:50
Like, so a company is tied to a batch, so you're going to have a batch per company. And I saw that he had responded to that yesterday, I think, or the day before, or was like, yeah, this gives us more control, right? Like the fact that we can, you know, batch them separately, different schedules, stuff like that. Different approvers, you know, was the other one.

Marcelo Torres   5:51
Mhm.
Yes.
Mm.

Robert Kihm   6:11
That's one area that I'm also planning to spend more time on is like that security visibility. So for you, it's like you're blocked on that right now, but I'm going to spend more time on it and come up with this is what I think is the path for it.

Marcelo Torres   6:28
Yeah. Okay. Yeah, that one's tricky. That's a real, that's a real, yeah.

Robert Kihm   6:35
Yeah, I'm going to throw it at Izzy a little bit too. Like, I'm going to have it say, hey, I think that we do something similar in Izzy for like roles at organization levels. And we might do it for Skip too. So I might throw it at some others to say, like, see if you can see if you can find what Izzy is doing and like, how does that.

Marcelo Torres   6:43
Mhm.

Robert Kihm   6:54
map to what we need to do here.

Marcelo Torres   6:58
Yeah.
I think Ian pointed me to Izzy for something else as well, like, oh, pagination. So, so there's a lot in Izzy. I think that's kind of unique and well-designed.
Support from here.

Robert Kihm   7:14
Okay, what if anything do you need like in the next hour or two while I'm working on other things? Is there something I can unblock you on?

Marcelo Torres   7:15
Okay, yes.
So.
No, the next hour or two for me is going to look like literally just working through this UI update plan and getting that actually in so I can give a demo and show the results of what I've done. I think like, you know, those mock-ups, I've had some real, like, I've revamped the UI, I've added a sidebar to it, handling the navigation better, we have a lot more pages.

Robert Kihm   7:34
Yeah.

Marcelo Torres   7:45
On.
I've had a lot of features on the.
API and server side. And so now I just need to get those into UI and actually validate them and get that to where it's working.

Robert Kihm   7:57
OK.
Have you tried the me suggestion with Payable where you throw like, you know, say generate like 4 world class UIs, you know, that and then, you know, so that I can make a decision on which ones, which one I like or which were things I like from A&B&C?

Marcelo Torres   8:15
Yeah, I had it, you know, taken.
Sort of my feedback. I definitely, I scoped it a lot with the taskbar on the side and that kind of stuff and just had it stick with the MJ. But yeah, I had it generate up a few different UI options, dashboards and stuff like that and started picking out, okay, here's the elements I like, here's that I don't. Man, it is fast too, those mockups. It's crazy how fast you can write HTML.

Robert Kihm   8:28
Mhm.
Yeah, I love it.

Marcelo Torres   8:41
Like, it's, yeah, it was that was that was a great suggestion because that saved a lot of time iterating through some things, but also I'm just kind of at this point where it's like it needs to be in the UI and we have a limited number of elements to work with anyway, to be honest, so starting with those and then building out, I think.

Robert Kihm   8:47
Very cool.
Yep.

Marcelo Torres   9:00
But yes, I thought it was a really good suggestion. And that's what those mock-ups are. They're sort of the idea for what I'm going to be including.

Robert Kihm   9:07
Yeah, I shared that with, oh, I shared that with the Align team this morning. I met with the Align team and they were working on a UI for this, you know, AI powered analytic system. And they were like, oh, well, we've got a UI person who's, you know, is putting together some designs. And I'm like, well, let me tell you about something that we've done in Member Junction that we've had some really good results on. It's like,

Marcelo Torres   9:29
Yes.

Robert Kihm   9:31
We've used Payable, maybe you could, maybe you need it, maybe Opus would be fine, and it's like, you know, just tell it to go, like, create like three or four world-class UIs, you know, with different approaches, and and then you know you'll be impressed with what it comes with the output. I don't know how a UI/UX designer, you know, necessarily is gonna react to that stuff, who's like somebody who's good at it.
I love it because I don't like writing HTML and CSS. I'm not good at it. It takes me a really long time to get it working. And as you said, it's like this thing's so dang fast at writing this stuff. And it's responsive and all of these other things too. It's like, even when I was coding this stuff, I was...
always struggling with like, oh yeah, we'll do responsive later. You know, we'll do accessibility later and stuff like that. It's like, no, you know what, this thing, just tell it to do with that. And it just does it.

Marcelo Torres   10:18
Uh-huh.
Um, yeah, telling, telling a developer to use AI or a designer is definitely...
Interesting, but yeah, yeah, I mean, it's it is really nice. I feel you, dude. I feel like I'm actually getting something done.

Robert Kihm   10:40
Yeah.
Well, trust me, the most controversial one is my daughter, the screenwriter.

Marcelo Torres   10:48
Oh gosh, yeah.

Robert Kihm   10:48
My conversations with AI with her are, you know, she's pretty much as far in the, you know, AI as the devil. And which is great. It's great to have like a conversation with her about it. And it's like, on the creative side, I get it. You know, for it like, like you as a writer, you shouldn't be having it write scripts for you.

Marcelo Torres   11:06
Uh-huh.

Robert Kihm   11:11
That being said, I bet you can use it for some brainstorming and some critiques of what you've written. I bet you'd be useful for that. And then I just think it is just a tool that's going to be used for pre-visualization. It's going to be used for backgrounds and stuff like that. It just is.
Right, I, you know, and I'm like, this is the world that you're going into, like, you know, be part of, you know, setting how it's going to work and protect the creative stuff as much as you can.

Marcelo Torres   11:30
Yeah.
Yeah, that's a yeah, real challenge there. That's a world I it's.

Robert Kihm   11:46
And then.
Yeah, and then my son on the is is on the, you know, on the SpaceX side, we think, oh, well, surely they're like super far forward on this stuff. And it's like, no, they're still figuring this stuff out. I'm telling him that like, you know, spend your 15 minutes a day like experimenting with AI and how you can use it to solve problems and like bring that back to your team.

Marcelo Torres   11:53
Huh, huh.

Robert Kihm   12:09
Like, they're still doing the things like his manager was basically like, hey, we want you guys to be more comfortable with AI. So why don't you spend like some time this week, like building, you know, building something in AI. And they were like building games, like little simple games that they were, you know, doing to get more comfortable with. And I'm like,

Marcelo Torres   12:26
Ohh.

Robert Kihm   12:28
wow, you know, even SpaceX, you know, obviously this is just one team within SpaceX. It's like, but, and then, you know, it's going to be really interesting to see Grok, you know, like this Grok model with four five is the first one that used cursor inputs and cursor data for training. And

Marcelo Torres   12:31
That's really surprising.

Robert Kihm   12:47
And so far, it's looking pretty good in a lot of ways.
where before it's been woefully behind. And so, like, obviously, they've got their own internal version of Grok. You know, so at SpaceX, where it's like, that's the one that, if that model gets really good, then they're going to be able to use it with their proprietary data. Like, there's a whole bunch of stuff that he can't.
you know, load in, right? Because it's like, I can't put this in Claude. I can't do that. But in their internal grok model, they should be able to do that stuff.

Marcelo Torres   13:23
Yeah.
I don't know, man. I feel like...
They are building rockets though, you know.

Robert Kihm   13:29
Yep.

Marcelo Torres   13:30
Like, how good can you get an AI to build stuff for rockets? I don't know, you know.

Robert Kihm   13:30
Yeah, well, to...
I know we're having it design proteins and, you know, and pick, you know, drug candidates. So, you know, same old, same old. It's like, I don't want AI making the final decision on this stuff, but, you know, inspired by, I have no problem with. Speaking of which, Starship.

Marcelo Torres   13:40
And that's true.
That's true.

Robert Kihm   13:55
13 could launch today. That's 545 the window opens central time.

Marcelo Torres   13:59
But...

Robert Kihm   14:06
Is that right? Yeah, 545 Central Time. And this is the first one that my son has actually been inside of installing something.

Marcelo Torres   14:17
Wait, in the rocket? Oh, that's crazy.

Robert Kihm   14:18
Yeah, like inside of Starship. Yeah, he's been inside that. And there's a there is some components. If you ever watch any of the video of like started with 12, like they have the Pez dispenser, which is this door that opens up and then they have this, you know, rack that launches things. He installed some installation.

Marcelo Torres   14:36
Pretty cool.

Robert Kihm   14:39
insulation, you know, close to the door on the PEZ dispenser. So on 12, he was like, yeah, you see those lines right there on the video? Like, those are the things that, you know, my team and, you know, I designed and helped to install. And so, yeah, but he was not inside it for 12. The last one that went out, but for 13, he was inside. So.
It's very cool.

Marcelo Torres   15:03
I didn't know Space Shep was doing. Are they successfully launching starships now?

Robert Kihm   15:09
Yeah, they haven't, so they're all suborbitals so far. There's never been one that's actually launched into orbit. They were largely successful with what is called version three. So 12 was the first version three of Starship. And, but there was a couple things that they wanted to do in the last test that didn't like.

Marcelo Torres   15:13
Mm.
Mhm.

Robert Kihm   15:28
There was more problems with the Super Heavy booster than there was with Starship. Super Heavy booster came back a little faster than they wanted it to, which basically is their rockets didn't relay properly. And but and then one engine didn't.

Marcelo Torres   15:32
Mhm.
This.

Robert Kihm   15:48
Like, I think one engine stopped earlier than expected on Starship. And so they wanted to do a relight in orbit, so relighted the engines to test some things, and they postponed that. So they're trying to do those things on this launch. But Starship 12, the last one, did end up in the Indian Ocean where they expected it to be.
it landed on target and they were able to do their payload deployments like they wanted to. This is like, they're actually going to, they've always been mock-ups of the Starlink satellites in the launches they've done so far. They're actually going to push a couple real Starship.

Marcelo Torres   16:11
School.
Mhm.

Robert Kihm   16:28
or excuse me, Starlink v3 satellites in this one, but because it's suborbital still, I don't think that they're expected to stay in orbit. So, but they're moving along, and either 14 or 15 should be the first orbital if they're getting what they want.
And then they're really trying to ramp up the launch faster, like, you know, up the cadence so that they're doing these things. You know, right now, the last one was in May, this is July. I think they want to get, they want to get to like really frequent launches, but I think they're trying to get to like monthlies this year because my son was basically like, yeah, just looking at what the

Marcelo Torres   16:48
Pretty sick, man.

Robert Kihm   17:10
what the cadence is on these things, they really want to ramp it up.

Marcelo Torres   17:13
Mhm.
Monthly launch resistance thing, like...

Robert Kihm   17:15
Help.

Marcelo Torres   17:18
It's just surprising that we have so much stuff that we want to put in space.

Robert Kihm   17:19
Because.
Yeah.
And, well, yeah, Musk wants to have up to a million satellites, and if he gets his, he gets data centers in space and things like that.
A lot of sci-fi you can read about that or you can watch the movie Wall-E and see like what the stuff is in orbit.

Marcelo Torres   17:35
Help.
Yeah.
I do wonder about that all the time.

Robert Kihm   17:42
Yeah.
But I do, I like the goal of, you know, being multi-planetary as a species. Like, I don't think it's necessarily something that's going to happen really soon, but, you know, I do like, you know, redundancy. The single point of failure is like, you know, like we're done, right? Like, you know, something bad happens and Earth is no longer inhabitable. Like,

Marcelo Torres   17:51
Mm.

Robert Kihm   18:07
were done as a species. It would be nice to have an option beyond that at some point.

Marcelo Torres   18:13
I mean, I guess.
We're not like...
I don't know, bro.

Robert Kihm   18:21
He.

Marcelo Torres   18:23
I feel like there's this.
Humanity has this weird, really weird like obsession with like surviving things, you know, like it just makes sense, like it's it's the most sensible thing, but it's just also like...

Robert Kihm   18:30
Yeah.

Marcelo Torres   18:37
We got to make sure the cost that we pay for that isn't is is is balanced.
Yeah.

Robert Kihm   18:48
Instead of trying to find like the next place.

Marcelo Torres   18:51
Yeah, but I do think it's a cool goal. It definitely, it definitely inspires some really incredible innovation.

Robert Kihm   18:52
Like.
Yep.

Marcelo Torres   18:58
I gotta get that out.

Robert Kihm   18:58
Yeah, you, yeah, if you, if you ever get Apple TV and you like any of this stuff, For All Mankind is a really interesting series.

Marcelo Torres   19:10
Yeah.

Robert Kihm   19:11
It's an alternate history where the Soviets landed on the moon first and beat the Americans. And so it generates like, you know, a much bigger space race. And so it ends up with, you know, going to the moon, having a colony on the moon, having and then getting to Mars and having a colony on Mars type of thing.
And what they do is like they start in the 60s and then each season that they have, they have a time jump. So it kind of goes from the 60s, I think, to like the 80s and then the 90s and then the 2000s. And then like the last season, season six, they're doing will be
2020 is basically getting up to current time.
And that shows like the innovation that's happened since then. Because, and then, and then there's all these little things that change in the history too, like John Lennon not getting assassinated or Al Gore winning instead of George Bush, you know, in one of the elections that was really contentious at the time. And so there's some funny things about that.

Marcelo Torres   19:59
That's kind of cool.
Ohh.

Robert Kihm   20:19
So like one of the things without John Lennon getting assassinated, it's like there's headlines like, you know, the Beatles reunion concert or John Lennon and Jay-Z do a concert or something. And it's like, oh, that's kind of cool.

Marcelo Torres   20:27
Ohh.
Yeah.
That's funny, yeah, that's interesting.

Robert Kihm   20:37
Yeah. All right. Well, you keep building. Focus on that demo. I'm going to get you questions. I'll put it in a markdown document and share it. Take a look at that stuff. Have AI take a look at that. Tell me more about what you need to move forward on this. I like your plan and I intend to.

Marcelo Torres   20:50
The.

Robert Kihm   20:57
you know, this is the direction going forward in, and that gives us an opportunity to highlight, okay, you know, you've made a decision here. Let's make sure we sign off on that. Or, you know, or basically by default, we're signing off on it, but we'll correct it if it needs to be.

Marcelo Torres   21:13
Yeah.
I, um, yeah, I'm gonna work to do that, and I'll read your feedback.
Uh, I'm just, I'm just, I'm just, man, I'm locked in. I'm really, my mind is on getting through, getting this demo out. I just want to get it done, man. I want some feedback. I want some some progress, so...

Robert Kihm   21:24
You liked it.
Yep.
I appreciate that. And again, I appreciate you being like tenacious on this and just, you know, keep moving forward. That's what we want on this. It's not going to be perfect. It's going to be a little painful from time to time. But it's really cool what we're seeing already and the progress that we're making, even though it's slower than what we want.

Marcelo Torres   21:47
Bye bye.

Robert Kihm   21:51
It's fine. Like, you know, when we climb the mountain and, you know, we look down and see what we've accomplished, like, this is going to be awesome. I will tell you right now, this is going to be an awesome story for you to tell people of like, oh yeah, you know, and first couple months I like designed an order entry and accounting system.

Marcelo Torres   22:06
The.

Robert Kihm   22:09
And they're going to go, and like whenever you're talking to people and they're going to go, what? What do you mean? It's like obviously really simple, right? It's like, no, let me tell you about some of the nuances in this. It has foreign currency support. It has deferred revenue and revenue recognition. And it's like their eyes are just going to go, my God, how did you do that?

Marcelo Torres   22:10
Yeah.

Robert Kihm   22:29
It's like, you know, and you're gonna have an awesome story to tell.

Marcelo Torres   22:29
Yeah.
Yeah, it's been fun. I call some of my friends, you know, and we talk about work and I'm like, yeah, they have me building in like, like a real accounting system, not like a like on app. Like this is like, this like is going to do real money things. I'm like, this is scary. But yeah, no, it's fun. It's A lot.

Robert Kihm   22:55
And one of your friends is like, I've just spent two weeks working on a dialogue on a website.

Marcelo Torres   23:01
Yeah, well.

Robert Kihm   23:03
How are, how are your friends like doing like software development and their use of AI? Like, do you feel like they're getting opportunities to be pretty forward with these tools and what they're using, or are they pretty conservative about it?

Marcelo Torres   23:18
I actually don't know. And you know, it's something I should go pull for. The people that I end up talking to are not technical. They're like some of my friends from just like clubs and other stuff I used to do and then NBA. But they're, it's very funny because I'll tell them what I'm doing and they're like trying to build a website. And I actually had someone ask me like, hey, like,
Do you do websites? Like, can you go to one and I, and I literally in my head I was like...
Like, I don't even know what I would, how I would begin to tell this person how to build a website, but my friend was just like, "Dude, I can do that in like literally 30 minutes, like a static data page, like...

Robert Kihm   23:50
Yeah.

Marcelo Torres   23:53
30 minutes max. And I was like, I mean, I would just use Claude. Like, I don't know what to tell you. I would just use it purely to make it. So it is kind of funny that the dichotomy there, but I haven't seen the other side yet, what my other friends are doing. I imagine it's something like this, to be honest.

Robert Kihm   24:00
Help.
Yeah, Ian.
Talking to the tech fellow candidates and like still getting the, yeah, use it for code completion. And it's just like, oh God, there's so much more than that now.

Marcelo Torres   24:17
Yeah.

Robert Kihm   24:17
It's like you have not experienced what AI can do for you. Fairly, especially with cloud code, is like, that's a paid thing. Whereas I think OpenAI has been giving college students access to things. I think Gemini with Google and Gemini have been giving college students free access to things.
I think that's been really smart on those vendors' parts to get like people exposed to that. I think Anthropic should do something, you know, with college programs to get people into it. I think that would be really helpful.

Marcelo Torres   24:56
Yeah.
Well, you know, it's interesting, right? Because it's like anthropic.
Yes.
Anthropic doesn't have a lot of incentive to get.
college who were using, I think anthropic like legitimately is just at the edge of their capacity most of the time. So if you had a bunch of college students to that, plus like imagine how ****** the code teachers, the teachers are going to be. It's kind of funny to me, like the AI thing is good, but it's like if you're a CS.

Robert Kihm   25:16
Oh yeah, yep.

Marcelo Torres   25:29
college right now, I don't even know, like there's nothing you can do. I feel like there's literally nothing you can do. You can't detect AI generated codes, like it's...

Robert Kihm   25:35
Yeah.

Marcelo Torres   25:41
I mean, you can look at it and go, yeah, this person definitely didn't handwrite this, but it's tough. It's just, it's tough.

Robert Kihm   25:49
Yeah. Well, it's like, you know, see some of these professors doing it where they embed like white text in the instructions, like invisible text and things like that, that are basically like bombs for AIs. You know, there's some of those things that happen. But yeah, I like, again, it's kind of like, I think you need to embrace it and say like, what is this and what it's not.

Marcelo Torres   25:58
Yeah.

Robert Kihm   26:10
And then you probably need to get into like more in-person coding stuff, you know, or it's just like, you know, it's almost like the oral exams, you know, where you're getting into to like test certain things. But I think generally, the way software development's going, it is much less about hand coding things than it is going to be about like understanding.

Marcelo Torres   26:17
Yeah.
Mhm.

Robert Kihm   26:32
You know how to solve problems correctly, and how do you do that without doing some of this stuff yourself, like to understand, like, you know what you know these you know different data structures do and how they work and you know how an operating system works? Like, there's real benefits to that if you understand it, so that...

Marcelo Torres   26:40
Yeah.

Robert Kihm   26:53
You know, again, you treat AI as like a coding assistant, a coding intern, something like that, that you're like, yeah, you just did it wrong. You know, like, you know, like this solution that you came up with in this context is going to be inefficient and here's why. So like, you know, how do you get people trained that way?
to detect the problems, right? To be like, to be the code reviewer, to be the AI reviewer.

Marcelo Torres   27:13
Yeah.
You know, it's interesting because that might be something that...
kind of solves itself. You know, you mentioned like the emotional attachment to code thing. I think there's definitely like this new generation of people who are like me, I spent a lot of time doing real code. So I was like, I found that to be an enjoyable process over time, right? And something I was good at. And like, I was like, man, I'm happy that I'm like good at this, you know.

Robert Kihm   27:37
Mhm.

Marcelo Torres   27:44
I've learned something. I think like when you have a bunch of kids who like they never really, they might do that as an educational exercise, but they're never really being like, oh, this is my skill. This is the thing I can do. You know, it's like, well, no, my skill is I can use AI to do it. You know, it might kind of help solve itself.

Robert Kihm   27:55
Yep.
Yep.
Yeah, yeah, well, again, like for us and the type of people that we want, you know, in the tech fellow role, for sure, is like, you kind of got to love this in order to be successful here, like love writing code or at least, you know, solving problems. And then the challenges, especially for people who have been doing this for a really long time.

Marcelo Torres   28:17
Mhm.

Robert Kihm   28:22
you know, who really love writing code and don't love being an AI babysitter, right? Or an AI reviewer. They don't like to do code reviews. Like if you don't like to do code reviews, like, and you are just like, I don't want to do, I don't want to review code for my team. It's like, yeah, that's kind of what developers do now with AI. AI is your team.

Marcelo Torres   28:44
Mhm.

Robert Kihm   28:46
and you're reviewing their code as opposed to writing your own. And I get people being upset about that.
And it's like, that's not what I signed on for. And I've been doing this successfully for years and got paid pretty good money to do it. And now I don't get to do it that much anymore, or I'm not going to get to do it for that much longer. And it's like, yeah, sorry, that's kind of what it is now.

Marcelo Torres   28:54
Yeah.
Yeah, I mean, it's...

Robert Kihm   29:10
You better embrace it or you find somewhere else, you know, I guess, you know, there'll be lots of places that are slow.

Marcelo Torres   29:14
You can always go down like more machine level.

Robert Kihm   29:17
Yeah.

Marcelo Torres   29:18
But yeah, yeah.

Robert Kihm   29:18
But even that, like, I like the more prescriptive it is on things like AI is probably going to do a pretty darn good job of it, like machine code now.
Yeah.

Marcelo Torres   29:29
I guess, yeah, I mean, I don't know, dude, those things kind of scare me because it's like, I think AI is great at getting something to happen, but is it good at doing it like the most efficiently? And like, I don't want Linux running slower because now it's all written by AI, you know what I mean? Like, that's...

Robert Kihm   29:38
Yes.
Yep, yep.
It's really interesting, like.

Marcelo Torres   29:44
Supposed to be a baseline.

Robert Kihm   29:46
Linus opinion on AI code and then also like on Rust. I was just reading something at a high level. Whereas like, you know, Rust has, you know, solved some problems, but like it doesn't solve logic problems. Like most of our bugs are like logic problems and like.

Marcelo Torres   29:55
Uh-huh.
Yeah.

Robert Kihm   30:05
those are the things that get us. Like, he likes AI for security reviews. He's like, you know, it's like, oh, well, it's really embarrassing that I found these things. And it's like, yeah, it is. And it sucks, but it's like, it's still good. It's like, you know, we got to find those things. Now it gives us an opportunity to fix them.

Marcelo Torres   30:11
Mm.
Yeah.
No, I definitely agree with that. Yeah, I think I think it's gonna be cool to see how, you know, like Russ is a cool.
really cool showing of like how the tool can fix a problem. It's gonna be really cool to see how we do that for the logic problems and like the next steps, you know, like fusing AI and coding language together.

Robert Kihm   30:40
Yeah.
Yep.

Marcelo Torres   30:45
It's a better way.

Robert Kihm   30:47
All right. Well, let me get on your questions. Reach out this afternoon if you need to. As I said, I've got one more scheduled meeting today, but the rest of my time, you know, I should be able to fit meetings in even if you just need a couple minutes.

Marcelo Torres   31:02
Yeah, thank you. Yeah, and I appreciate that. Let me know. Yeah, I'll keep a lookout for the questions. Hopefully, it's sort of praying to the cloud code guts to write the code and...

Robert Kihm   31:15
Yeah.

Marcelo Torres   31:17
Yeah, have some feedback.

Robert Kihm   31:17
Yeah, I think it will. All right. Thanks, Marcelo.

Marcelo Torres   31:19
Yep, see where I ever go.

Robert Kihm   31:21
Bye.

Marcelo Torres stopped transcription
