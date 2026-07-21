Accounting Meeting-20260721_130741-Meeting Recording
July 21, 2026, 6:07PM
29m 12s

Marcelo Torres started transcription

Robert Kihm   0:03
items, but then when you need it, it does, you know, type of thing. So it's basically like this idea of optimizing for the common path and like, you know, reducing noise where you can, but then still providing the ability pretty easily when you need to do something like a do to do from. So.

Marcelo Torres   0:13
Mhm.

Robert Kihm   0:23
I don't know what the best approach is to that.
It's almost like, you know, like a toggle that, you know, is like a due to, due from entry or whatever, and then it, like, you know, maybe it's not another column in there that you need, but it's something that maybe appears on the row below as the counter entries to save space. Matt might have some better ideas on that.

Marcelo Torres   0:49
Yeah, well, I mean...
We'd have to store some kind of account data on that. It'd be pretty easy to gray out the do to do from. It's just that none of the account types like indicated. So we'd have to do something. I'm just checking the ERP or ERD and I'm not seeing.
Yeah, I mean, so it's none of the account types support due to do from. I can't support it. It's just something I deferred because I, you know, one thing I'm kind of deciding to do as we go through, and you can correct me on this obviously if I'm wrong, is basically I'm going to trust Jeremy and the accounting team to handle a little bit of that validation as far as like.

Robert Kihm   1:27
Yep.

Marcelo Torres   1:28
Just to save UI time, save UI work time. But it is on the backlog and it will get done. Because I agree with you, that's important.

Robert Kihm   1:34
Yeah, and again, I don't know if it needs to be in the schema, it just needs to be like in the user interface. Like, you know, if obviously if it has, you know, the counter, then you know it is that, and you know, your user interface should display it. If it's not, when they're creating a new line, you probably don't show it most of the time, but then like there's a little toggle that says, oh, I need the counter entry.

Marcelo Torres   1:43
Ohh.

Robert Kihm   1:54
you know, something like that. So again, it can be, you know, we don't need to have like a whole bunch of like codified stuff inside of like metadata and tables and things. It may, you know, we may come up with a reason for it, but you know, in my mind, it's just things like, you know, most of the time you don't need this, so don't show it. It's like, oh.

Marcelo Torres   1:55
Oh, okay. Okay.

Robert Kihm   2:15
But this time I do need it, and so you like click it, or if it's already there, then you know they need it, so then you display it.

Marcelo Torres   2:23
Okay, I'll take a look at that. I think we'll circle back on this and I'll talk more about it when we get there. So I got only three questions today, and I'm sorry I didn't send these to you. I got them really late last night, and I only consolidated this morning. But I think they are, these are fairly answerable questions, so I'm not super concerned.

Robert Kihm   2:29
Yep.
Mmh.

Marcelo Torres   2:44
And I understand them today a little bit better than I did yesterday.
The first one is the category model that I sent you that message about. Basically, I noticed in your response that you suggested categories should be shared across companies and then each company has its own entry in the category, which is actually a model that I considered.
But my concern with it was simply if I...
If I enter a category as like Company A and I create a new one, right, like I create a new name for a category, Company B will now see that in their dropdown, but it won't work for them until they add to it. So it's going to be a little bit weird. And obviously, like we could create some system that is like, okay, have Company B enable.

Robert Kihm   3:22
Mm.

Marcelo Torres   3:33
that category before they see it. But the larger concern that I had was that...
The permissions don't allow a shared category object, really.

Robert Kihm   3:44
So, my, like, my intent wasn't to say, like, I think, I think products need to be at the company level. I think product categories need to be at the company level, you know, and so if we've got, and then do we have GL categories? Is that what we're talking about here?

Marcelo Torres   3:46
like our category. Okay.
No, we were talking about categories like regular ones. I think likely what happened is the way that the doc got written and interpreted differently.
Um...

Robert Kihm   4:09
Got it.

Marcelo Torres   4:10
But yeah, my apologies. That's what I thought we were doing. I just wanted to verify.

Robert Kihm   4:15
Yeah, no, I think for product category, it's like, it's at the company level. Like, even if they have like the same, let's just say, t-shirts or whatever, and it's like, you know, you have five companies, you're going to have 5 t-shirt categories. They're just going to be t-shirts for each of the companies. And this idea of like crossing them, no.

Marcelo Torres   4:25
Mhm.

Robert Kihm   4:34
It's just like each company is going to have their own product catalog and their own categories for organizing that catalog.

Marcelo Torres   4:41
OK.

Robert Kihm   4:41
I don't see a lot of value in the share.

Marcelo Torres   4:44
Yeah, neither do I. What I have done is I'll collapse them visually if they're the same name. But other than that, yeah.
Um...
So, on Accounting, there's two questions here.
The first is like, basically, right now we don't actually guard accounts changing. So we link with a foreign key to the account object, right? But if someone were to go and change the type of the account, it would just like invalidate a bunch of journal entries.
Well, okay, so this, this is...
I don't think we need to worry about this right now.
It's something that came up.

Robert Kihm   5:29
You probably don't need to worry about it right now, but most likely what you're going to do is once a GL account is used, you're going to lock it in some ways. Like you can probably change the name of it, but you're not going to change the type. You're not going to change, you probably won't change the number. But this is a really good conversation to have with Jeremy.

Marcelo Torres   5:34
OK.
Okay.
I agree.

Robert Kihm   5:50
Amith might have some ideas in it too, but like generally you would lock it once it's used. So they could do as many changes as they want until it gets used in a journal entry. And then once it's used in a journal entry, you're kind of like, yeah, you're locked in at this point. You know, we're not going to let you.
or we're going to be very limited in what you can change at that point.

Marcelo Torres   6:13
Okay.

Robert Kihm   6:13
Because, as you said, it invalidates, you know, historical data and stuff like that. So, what they would do is they would create a new account and kind of retire the old ones, and like, and so like the old ones are deprecated, they're not really used on any of the go-forward things, but they're still there from a history standpoint.
and the new account would be created and take its place.

Marcelo Torres   6:35
I was thinking of tracking the retirement date on those accounts.
because we need to know, like first the JE, when it was actually retired, if someone brings in a new account with the same number, but they've changed it on the ERP side. When we get to this, I was thinking we should probably add that field. Does that make sense?

Robert Kihm   6:56
Well, you could. And then the other part of it, isn't there this concept of like start and end dates on some of the like product accounts, company accounts and things like that where you say like, oh, which one am I supposed to select? And up until June 30th, it was this account. And now the revenue account is starting July 1 is this account.

Marcelo Torres   7:18
It's on the link. So it's on the GL account link.

Robert Kihm   7:20
OK.
Yep. So you've got that. And then yeah, I guess you could, you know, say that it's retired and then at that point, like your links couldn't have any dates after that, something like it.

Marcelo Torres   7:34
Done.
Okay.
And that that sounds good.
So, I also have a Kergen thing, and this is a little bit outside the scope, but it's a problem I'm kind of noticing.
When I so so I would suggest that we add the ability to use an include list for schemas on open apps. And my reasoning for this is that right now open apps, right now Cogen in general, only excludes certain schemas and includes everything else.
Which?

Robert Kihm   8:07
Mhm.

Marcelo Torres   8:08
When you run Cogen.
with no open apps is like, that's the intended behavior on the instance, the main MJ core, because we want to pull in everyone's external schemas. But for open apps, it's not. It's actually the reverse. We just want to include the open app schemas.

Robert Kihm   8:21
Yep.

Marcelo Torres   8:25
And I've seen a couple problems. I've seen a problem only in development, though. I want to be clear, this is only in development, where when an open app is foreign keyed into another, Cogen will traverse that. Now, I'm going to turn that option off, but I think it kind of highlights the complexity we're getting into here with open apps. And
If we're going to run codegen with open apps installed, this issue will bite again because parents in the dependency tree can't be preemptively excluded.
You just, you can't exclude every single other open app that's going to exist on the system.

Robert Kihm   9:01
Well, that's what we're doing with Skip right now in the Skip client. Like there's an exclude schema on the Skip client that gets added by the Skip open app to like the MJ config file.

Marcelo Torres   9:14
Yeah, but.

Robert Kihm   9:15
Again, I'm just using that as one example, like, so that's there, and then I guess you would like the way you would do it today is like, as you install each open app, you'd stack that into the excluded schemas.

Marcelo Torres   9:26
But it's really just an exclude hiding what is an include behavior. And I don't think it'd be hard. I mean, it should be very easy to add, not to replace, but to add an include list option.
Where code Jim will just, we can have code Jim either default to the exclude or include list.

Robert Kihm   9:42
So where's the include? Like what's the context where you're running code Gen. where you need this include?

Marcelo Torres   9:50
So, right now, it's a development context, but, as you already mentioned, when you're running CodeGen on Skip, you now need to exploit schemas, and I'm just saying, like, from my perspective, as we add open apps and as the complexity increases and as people's development environments become more complex, because right now...
If I want to develop orders, I have to have accounting installed. But I can't even run Cogen on orders without having accounting installed. And even if I use MJ App install, I still would have to add the exclusion to orders. And the thing is, that's fine, but what if I want to have in the same instance like tasks or something that's not a direct dependency of orders?
which actually tasks is, but like if I installed committees, if I installed any open app that's not a dependency, the exclude would not be preloaded into orders and it would not pick it up when I run code Gen. And so we introduced the capability for real bugs to be pushed. It's just.

Robert Kihm   10:44
It would it would pick it up when you're running code Gen. when you're developing the orders app.

Marcelo Torres   10:50
Yes, if you have them all linked together, right? So like, think about the realistic development situation for orders. Orders depends Accounting and it depends MJ Common and it depends MJ Biz Apps task. You have 3 open apps installed next to it. So you already have an instance with multiple open apps installed. It's likely that a developer in that scenario is going to say, oh, I need to develop committees. Let me just install it next to this.

Robert Kihm   11:00
Mhm.

Marcelo Torres   11:11
Right, and now they've they've unintentionally, without knowing it, just broken all their code, Jen, and like their apps will no longer build because of this.

Robert Kihm   11:13
To.

Marcelo Torres   11:19
Um, well, that's not necessarily true, but...

Ian Zygmunt   11:21
This seems like more like a MJ app install. Like when you install an app, it should automatically include that in the exclude schema. So that way that doesn't happen in development.

Marcelo Torres   11:30
Help.
Okay, okay. I mean, yes, right? Like that solves the problem, but that's a bad design pattern. What we're doing here is...

Ian Zygmunt   11:36
Yeah, but that's just how codegen works is we have each schema own its own codegen, and if you're going to be using other ones, you need to exclude it.

Marcelo Torres   11:41
Okay, okay, all right, all right.
Right, but the problem is, what about if I have external schemas? What if I put the demo data in? Like, like what you're doing is you're saying, let me add a, let me add a requirement for every single install versus let me handle this requirement once on its own in a process that each developer can handle and guarantee.

Ian Zygmunt   11:46
Yes.
Short.
Process.

Robert Kihm   12:02
But, but how do we so?

Ian Zygmunt   12:03
Why would we just not put it in app install?

Robert Kihm   12:06
So how do we, so Marcelo, my question to you is, if you have an environment that has, so you built it on MJ, you've got your biz apps common, you've got Accounting and orders and let's just say tasks and all of these things on there.

Marcelo Torres   12:09
Please do.

Ian Zygmunt   12:09
The.

Robert Kihm   12:26
Help.
How does CodeGen know what you're developing for?

Marcelo Torres   12:34
Wait, I'm confused.

Ian Zygmunt   12:34
So, I'm confused, so he's basically saying, like, when he has like orders and say he has other open apps that...
He's also going to use in whatever MJ instance since codegen looks at the database and now we have tables and schemas for tasks, orders, whatever, it's going to generate all the codegen unless exclude schemas in there, right? And you're saying it's not preloaded and exclude schema. So if someone runs codegen without knowing that, they're basically screwing up their entire codegen because now they're going to generate code for.

Marcelo Torres   12:55
Yes.

Ian Zygmunt   13:04
entities that they want to or that they don't own.

Marcelo Torres   13:05
Well...
And the dangerous case is that it worked. And now they're pushing to a PR and the PR is breaking. I mean, we don't even, we actually don't even check.

Ian Zygmunt   13:08
Yes.

Marcelo Torres   13:15
We don't even validate that the app runs after migrations on our PRs. I'm not even sure if we would validate that case. Right, where somebody runs codegen, it generates the codegen for other apps, because those migrations would modify the database, but they shouldn't do it in a breaking way, because we don't test with the other open apps installed. So it actually would go through the open app PR system.
It would publish and then you'd install it and it would break because there'd be overlapping migrations.
if they didn't test it correctly on their local machine. I mean, there's just like, it's just that is that is a failure case. And by adding a bunch of excludes for everything, we're creating an anti-pattern, right? We're using a blacklist where a white list is what we really want. In the instance, we want the blacklist.
because we want to bring in external schemas when a company installs their own data. In the open apps, we never want to do that. And so like the case where a company installs their own data, if one of our production engineers chooses to run code Gen. for some reason, they're going to find that it doesn't work and then they have to go fix the schema excludes and all this other stuff.
It's like, why are we?
You know, the developer should be handling that. They're the ones who know the situation. An include list handles it. I mean, if you think about how the exclude list works in CodeGen right now, an include list is probably 10 to 20 lines maximum. You're just reversing a filter with an if statement. And we choose a default. We probably default to exclude and only include if the include list is there.

Robert Kihm   14:48
So, Marcelo, again, I ask you the question. It sounds like the use case that you're working on is you are developing in the orders open app right now.

Marcelo Torres   15:01
Yes.

Robert Kihm   15:01
And so when you code Gen. you only want to generate for the database objects that are in the orders schema.

Marcelo Torres   15:13
Yes.

Robert Kihm   15:13
Right.
So.
Are you, when you run code Gen. do you just want to switch that says include the schema, only the schema?

Marcelo Torres   15:26
Well, I mean, we can just add a list to the config.

Robert Kihm   15:27
Because otherwise, like in your code base, how does it know? Like, where's your config file? Where's your configuration setting with this include list?

Marcelo Torres   15:34
Right here, right here. MJ config dot CJS, we just add an include list. We just put it right next to exclude schema.

Ian Zygmunt   15:43
Here we just.

Marcelo Torres   15:43
Right here, we would just under it, we do include schemas.
And we just prioritize exclude schemas. So by default, it takes the exclude, and the person would have to replace the exclude with an include list. That's it. Cojen just automatically reads that config. It's already there. I mean, the architecture is here for it.
You don't do that.
What I'm saying is Cogent should support both. What I'm saying is we have an overload of concerns. Cogent is supporting open apps and it's supporting the main instance. The 2 operate very distinctly. They do not operate the same. And if we want to support both of them, we should design the system to support both of them. Right now, we're kind of hacking the system with the
huge. I mean, look at my exclude list right here. It's one, two, three, 4, 5, 6, 7. Schema is long already. And this is orders. But I mean, like, what if I depend on orders? 8 schemas, 9 schemas, 10 schemas. That's not like that's an anti-pattern, right? We're hacking something that was designed for the main instance to work for open apps.
And by using an include list, I mean literally I would replace this entire thing with one schema.
You know, I mean, open apps are just fundamentally different. There's a lot of problems we have to solve with them. And this is a common thing in MJ where something will be a little bit overloaded.
But I just think we should account for it. We should just accept if we're going to overload code Gen. which we should, because it's too complex to recreate twice. We should accept that it's overloading.

Robert Kihm   17:23
So in your open app, in your open app repo, your mjconfig.cjs, you want to eliminate exclude schemas and only have it include schemas.

Marcelo Torres   17:34
To be honest, I mean...
Yes, functionally, yes. But the way we implement it on the code inside, we can handle that any which way we want.
On.
There could be a switch if you wanted it to be explicit.
In my mind, you could just do a default default to exclude. If the exclude isn't there, use include. That's a little bit less apparent to the developer and the user.
I, I just, I just think we can just replace it, and but, but again, like on the back end architecture of Cogen, we don't change anything about the exclude list; we just add a secondary path and maybe a variable that flips to use exclude versus use include.
Maybe, too.

Ian Zygmunt   18:19
It seems weird to me having these two different options, just because, like, if now for working on, like, the include makes sense, right? It's one schema, it's the only one you have to worry about. I'm talking about excluding a laundry list of 15 things, then when I then I go back, like, if a developer's switching back and forth between different repos and we have two different patterns that we follow now, and now we even include and we even exclude.
So then let's say they add another one, and now we got to go back to the exclude pattern. And now I have to remember all the different schemas that we have. Like it just seems like.
Out of that, I think.

Robert Kihm   18:49
But you only need to do that for...
MJ deployments.

Ian Zygmunt   18:55
Any MJ, but like all of our other open apps that I know, Izzy does the exclude schema. It seems strange to me, but like what would be a reason if include would be better for us in the instance of now we don't have to keep a laundry list of schemas involved so developers don't make mistakes and run code general things they don't want generated.

Marcelo Torres   19:03
So.

Ian Zygmunt   19:15
Why you can have exclude schema anymore then?

Robert Kihm   19:17
Because we don't control the client environment, we don't know what.

Marcelo Torres   19:17
That's actually a good point.

Ian Zygmunt   19:18
Siri.
Uh-huh.

Marcelo Torres   19:21
Yeah.

Robert Kihm   19:23
We know what should be excluded. We want everything else. But the open app is, we don't want anything other than the schema owned by the open app.

Ian Zygmunt   19:25
Uh-huh.
Okay, just.

Marcelo Torres   19:27
And just pass it to the...

Ian Zygmunt   19:34
Gotcha, OK.

Marcelo Torres   19:35
And to that point, the install process does load, does like auto fill the exclude schemas in MJ Core. It's just, do you want it to, like writing it to also fill the exclude in every other app? That's where I just feel like we're getting a little too far out. But also like with those two systems concerned, right?
We already have two systems. The main open app, the main instance, sorry, like MJ Core, it doesn't by default include any of the open app schemas in this exclude list. It's just its own specific schemas, and the open apps add to it automatically.
Right.
And so...
I mean, you could make the argument that populating every open app makes sense then, but the problem is that creates order dependency, right? Because, you know, if I install, I mean, that creates also the process then when I install, I also need to read and find every open app and populate my own exploit. I think it's just a very complicated process where this is a simple solution.

Ian Zygmunt   20:32
What if we just automated it to include in the MJ app install process? So that way now we're not supporting two different patterns and it's not something the developer has to worry about.

Marcelo Torres   20:42
I mean, dude, I'm giving you the automation. It's A one-line thing.

Ian Zygmunt   20:45
No, no, I'm saying I just think it's strange to support two different patterns.

Marcelo Torres   20:47
The include, the include, you don't need any complex automation. How do I detect what's an open app and what's not? How do I know what's an open app schema and what's not? What if my open app, okay, I'm sorry, I'll relax, I'm sorry. Like what if my open app uses 2 schemas, right? You've just created like a thing that extends with every edge case and include list handles everything at one point in time. It's just a cleaner pattern.

Ian Zygmunt   21:03
So.
But we know what's an open app based off of the manifest. Like that's how we know what's an open app and what's not.

Marcelo Torres   21:11
That's true.
Again, it's just like now you're depending on the database for something that's known in advance. You're creating automation for something that's known in advance and can be tested in advance. That's the other thing. I can't test the interactions of 15 different open apps and validate that each of their installs is going to work and that it's all going to link together. And I don't want to. No one wants to do that. But I can test the input, like right here on my machine.

Ian Zygmunt   21:26
Matt.
This is gonna work.
Yeah.

Marcelo Torres   21:34
I can install open apps beside it, I can validate it, and then I can ship, and its code I know works.
And like in response to like different pattern.

Ian Zygmunt   21:40
Like response to like different patterns.

Marcelo Torres   21:43
This is an include list. Like this, what I'm managing here is an include list. It's just disguised as an exclude list. And the developer who gets into an open app isn't going to know that. They're not going to know that they need to use this as an include list because they're used to using it as an exclude in MJ. But if we denote it as an include list, put a switch variable that's very explicit.
you know, and document it when the developer comes over. We document it in the open app documentation in MJ too. When the developer comes over, they'll see it.

Robert Kihm   22:08
I don't even know of...
I don't know if you need to, I think.
Include wins.
Because include basically, in the absence of include, it's a wild card, it matches everything. And then once you put an include in there, that limits your list of schemas that you'll look at. And then exclude gets applied on top of that if it exists. And what you're proposing is in the open app repos, exclude doesn't need to exist.

Marcelo Torres   22:20
Yeah.
Uh-huh.

Robert Kihm   22:43
need the include list for what's in there. But well, actually, that's not, well, yeah, yeah, that would work because your include list is defining your universe. So you don't need to include, you know, you don't need to exclude under score under score MJ because your include list doesn't include it. So

Marcelo Torres   22:56
Mmh.

Robert Kihm   23:02
Yeah.

Ian Zygmunt   23:03
Would we need these?

Robert Kihm   23:04
I, so in the repo, when you're working in the open app repo, I can see the argument for an include list.

Marcelo Torres   23:09
Mhm.

Ian Zygmunt   23:12
Would we need these in our SaaS products now? Because they behave very similarly in that sense of you don't want to be creating code Gen. for schemas outside of what you own, and they operate almost identical to how these open apps operate.

Marcelo Torres   23:12
Yes.
Well, in theory, they should use the same conflict, right?

Ian Zygmunt   23:31
That's what I was saying, so we're saying includes just an open app thing, do we need to include include in our SaaS products as well?

Marcelo Torres   23:33
What?
I mean, it's a codegen thing, right? It's in addition to codegen that's a feature everywhere. And I think it's like, what's nice is that this system functions right now, it's a one-touch change. It's not a change right now. We don't need to go through all the open apps. We just change it on touch.
Um...
I mean, we saw the other day, I think like a build tail, prob build tail the other day did something like this, the next group thing.

Robert Kihm   24:10
Most likely, Izzy would, you know, fall into the same thing and the skip brain would fall into the same thing where you have the schemas that you want to include. BC SAS, you know, would follow the same thing. Like you want BC SAS only to generate stuff in BC SAS.

Marcelo Torres   24:24
Pretty much everything but MJ.

Ian Zygmunt   24:28
Yeah, that's why it makes me think it's like it's almost everything besides like client MJ instances. Yeah, since we don't know what they have.

Marcelo Torres   24:33
Yeah, that's, I mean, that's it.

Robert Kihm   24:34
Right.

Marcelo Torres   24:37
Yeah, I mean, you could use some kind of, what you could design is a wildcard system, like that's a variable that just reads the manifest, excludes all our schemas, and then goes for everything else. That would be cool too. I just like, when I approached this, I was thinking like, I always try to make the smallest change because I know people don't like hearing.

Ian Zygmunt   24:37
Yeah.

Marcelo Torres   24:56
Let's change code, Jen. So I came at it from the smallest angle, but I think that's another addition that would be probably very workable.
Soham.

Robert Kihm   25:09
I'm fine with supporting include schemas for the open apps and you can try it out with, you can add it to code Gen. and you can try it out with the Accounting and Orders app. And then as we get comfortable with it, you can tell everybody else that's working on an open app that's like, this is the way that you can do this.

Marcelo Torres   25:21
Yeah.

Robert Kihm   25:28
And there's no changes to, you know, what we deploy to clients in MJ Explorer for the in that in that repo, you know, that gets deployed when you're actually installing client MJ, which still uses the exclude schemas.

Marcelo Torres   25:29
Okay.
Yes.
Yeah.
OK, thank you. I appreciate. Yep, having that discussion. I know that stuff is really contentious, but I appreciate you pushing me because I also want to make sure it makes sense.
Um...
That's everything as far as like questions that I had.
Um...
One thing.
Robert, you asked me the other day to get you a list of like docs that I thought you might want to look at.

Robert Kihm   26:20
Mhm.

Marcelo Torres   26:21
I think only the external expectations is really important.

Robert Kihm   26:25
Right.

Marcelo Torres   26:26
That's kind of a...
Just A compiled list of what I think.
Other people, I what I what I what I what I'm expecting other people to do.
Yeah, I think it'd just be good to review. I don't know if some of these expectations are not in line with like what's realistic.

Robert Kihm   26:54
OK, we can do that.

Marcelo Torres   26:57
That, that's it; the rest is the rest is just again, sometimes.
Well, in reality, I talk a lot to bring in everything that's linked. So that
Huh.
This is our LS stuff. We'll get to that later.

Robert Kihm   27:17
Okay.

Marcelo Torres   27:17
Just, just so that I can, I can make sure I have the contacts.
I think that's about it. I appreciate it. I appreciate you. Yeah, yeah. I mean, that's it. I feel like I'm really making some headway now. Like, I actually feel like I'm able to go in and work and make changes and not have a new question. That's kind of a blocker, because I think previously a lot of the questions were like...

Robert Kihm   27:27
All right.
Thank you.

Marcelo Torres   27:43
image changing. And so I was very hesitant to make UI and just validate a bunch of stuff when I knew it was going to be pretty heavily changed later. But I think like in retrospect, maybe could have done some of that.
But I spent a lot of time going through the plans trying to understand.
How do we do this as well? So...
But I feel like I'm there, at least, at least with orders, at least with accounting. When we get to tax and FX, I'm sure we'll be having a good time again. Yeah.

Robert Kihm   28:17
Sounds good. No, I think definitely the conversations advancing on stuff and the questions you have are, you know.
at a higher level than they were before in a lot of cases. So like, you know, again, that means you have a good understanding of a lot of things and now you're getting to like, what about this specific thing and what about that? So yeah, I think that's good. And then I think, you know, Amith will, you know, definitely give you a lot of feedback on things and then, yeah, just

Marcelo Torres   28:28
Mmh.

Robert Kihm   28:46
you know, keep on that iteration of building and then demoing. Just like you showed us some stuff on this one, that was great. But like, yeah, record those videos and share them out for Jeremy to get his eyes on and me and Amith as well.

Marcelo Torres   28:50
Yeah.
Go then.
I go out today.

Robert Kihm   29:01
Cool.
All right.

Marcelo Torres   29:06
Alright.

Robert Kihm   29:07
Thank you.

Marcelo Torres   29:08
Thank you, Robert. Have a good day.

Robert Kihm   29:09
You're welcome. Bye.

Marcelo Torres stopped transcription
