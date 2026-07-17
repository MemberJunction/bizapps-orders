User Feedabck over the week 07-12
1) Accounting periods / document date / API question
Agreed on dropping accounting periods from the app — batch-time selection is the right call.
 
One clarification I want to make sure is baked into the design: document date shouldn't be what determines which period a JE lands in. In BC, document date is purely informational (it just carries the reference date from the source document — invoice date, etc.). It's posting date that drives the accounting period a transaction posts to. So when you say the batch determines "where the resulting consolidated JEs land," that selection needs to set posting date, not document date. Worth double-checking the field mapping before this gets built out, since getting those two crossed would put entries in the wrong period without anyone noticing until close. And of course Due Date is another date data point but that is driven by the agreement / contract term. 
 
On the API question — yes, it's feasible, and it's really the only supported path since BC SaaS doesn't allow direct DB writes. Our existing scripts (Python on our side, though the same applies to PowerShell) authenticate via Azure AD OAuth using the client credentials flow, then post to BC's REST/OData web services. Journal batches specifically go through the standard API v2.0 endpoints — companies({id})/journals({journalId})/journalLines or generalJournalLines. I'd skip the CSV step and build straight against the API; happy to share our tenant/app registration setup so you're not starting from scratch.
 
One addition: given we're going to be posting into 9+ BC companies, it may be worth standardizing how each tenant/company is configured (posting groups, number series, dimensions, journal templates/batches) before wiring up the integration. Right now there's some inconsistency company to company, and that inconsistency will turn into API edge cases you have to special-case per entity. Standardizing the config up front would make the integration meaningfully simpler and more maintainable. I can own that but will need to do some research and learning to figure out what differs company to company and how to fix it. 
 
3) Deferred revenue via forward-dated JEs
I'm fine with this approach — writing forward-dated JEs and letting batches pick them up based on a filterable date range is a reasonable and fairly standard way to stage deferred revenue recognition. Flexible filters with sensible defaults sounds right.
 
One thing to plan for: what happens to already-staged forward-dated entries when a contract changes or cancels mid-stream. If revenue rec entries are pre-written months or years out, you'll need a clean process to find and remove/adjust the orphaned future entries tied to that contract so they don't get swept into a batch and posted incorrectly. Not a blocker, just want to flag it so it's part of the design rather than something we discover later.
 
Journal Entries have an EffectiveDate field which is labeled the Accounting date. For Orders, I assume the EffectiveDate would be the day the Order Date. When creating a Journal Entry Batch record, which summaries Journal Entries and will often include Journal Entries over many EffectiveDate values. Say, batching a week of Journal Entries. We don't have a Posting Date on the Journal Entry Batch. We have BatchedAt, SentAt and AcknowledgedAt. Jeremy Hunnewell, would you set a Posting Date when generating the Batch? What determines the Posting Date?
 
Agree with Jeremy about standardizing company configuration. Simple and consistent is better.
 
For the forward-dated JEs for Deferred Revenue when a contract change or cancels mid-stream, I believe we'll only generate for an Order which would be for a single Contract Term and, if it's a subscription the Rev Rec would occur over the Term, usually a year. When a renewal Contract Term is created, a new Order will be generated with new Rev Rec entries for that Term. If the Subscription is changed during the Term, there would be a correcting Order for the change so new Rev Rec entries would be generated, leaving the previous ones in place and netting out to the correct amount.
 
On the Posting Date question — I wouldn't put a Posting Date on the Batch itself. A batch spanning a week (or any window) of EffectiveDates is going to cross period boundaries often enough (month-end, definitely) that forcing one Posting Date across the whole batch would misstate which period each transaction actually belongs to. That's the same issue I flagged with document date on the Order side — the accounting period needs to be driven by the date on the individual transaction, not by when it happened to get grouped/sent.
 
So: Posting Date should be set per Journal Entry line at posting time, equal to that JE's EffectiveDate, carried straight through to BC's Posting Date field on each line. BC natively supports a single journal/batch containing lines with different posting dates, so there's no technical reason to collapse them to one date. BatchedAt/SentAt/AcknowledgedAt are process timestamps — they track where the batch is in the pipeline, not what period it hits, and I don't think they need to.
 
One open question this raises: what happens when a batch includes an EffectiveDate that falls in a BC period we've already closed? BC will reject a posting date in a closed period. We'll need a rule for that (e.g., reject/hold that line for review vs. auto-roll it to the first open date) — that's a business decision, not just a technical one, so let's make sure it's explicit in the design rather than assumed.
 
Agreed on standardizing company config — glad we're aligned there.
 
On the deferred revenue point — the correcting-order approach (new Order + new Rev Rec entries netting against what's already staged, rather than editing/deleting prior entries) fully addresses the concern I raised about orphaned forward-dated entries on contract changes or cancellations. That's a cleaner model than what I had in mind. No issue on my end with #3.
 
I'm glad we are having this conversation now. Seems like data fidelity between systems is something we need to dig a little deeper on.  I am going to stick with my model for now since changing the batching strategy is fairly straightforward. I will keep an ear open to future changes.
Also, Jeremy Hunnewell do you know if the BC api allows the poster to set the posted date? Seems like something that would be based on when the entries are posted.
 
As far as I know, the posting date is simply a data element so should be able to be set to any date: past, present or future. Worth testing to verify but in the Business Central UI you can pick any date
 
Consolidated the notes here with the LXP document for the single company Journal Entry and single Company Batching. P2 and P3 are ones to review to confirm the changes here. P1 is removing Accounting Periods from the Accounting system, which has been accepted. P5 also changes to generating Rev Rec Entries with forward dated JEs at the time the Order JEs are created, this is a change from the plan where they were created when a Period was closed.
2026-07-14-je-single-company-batching-proposal.md
 
Sorry for the late message Robert Kihm. Please feel free to defer till tomorrow but I see that you're on.
 
I would like some feedback on the role management approach Robert Kihm probably best answered by you, but Jeremey may have relevant input here too as far as parity with an accounting system goes. 
 
We want to add per-user company scoping: a user should only see and work with records of the companies they've been granted access to. The MJ RLS system lets us filter row access based on a user's data; however, we do not have any secure structure in bizapps common that indicates a user's company. The current structure is informational not security-quality. 
 
Two parts:
 
1. Where should the user↔company access control live? My thought is a small dedicated table (UserCompanyAccess: user, company, active flag, granted-by/when) that is managed by admin users and links users with their allowed companies. The RLS filter, write checks, and batch rules all read the same table. The alternative is one role per company ("Accounting — Company X"), which avoids the new table but means the role list grows with every company and multi-company users carry multiple roles. Do you have a preference or another suggestion Robert Kihm. I may just not understand the role system, but this seems to indicate the need for a more flexible role system. Maybe somethign that can handle custom grants for each app (again, I am not sure if we already have that or not. Claude tells me no).
 
2. How should grants be established and governed? The platform has several places where a person and a company look connected (a contact's linked login, CRM relationships, the employee table) — but all of them are ordinary editable CRM-grade data, not tied to login identity. If access derived from them, an ordinary contact-record edit could silently change who can see a company's books. So the idea is: grants are explicit security records, editable only by admins — never derived or auto-synced from CRM/HR data (if we ever want an HR roster to drive access, it syncs into the grant store under governance rather than being read directly). Do you agree — and do you want anything more around grants like an audit trail, approval step, or periodic review/expiry?
 
Robert Kihm
Consolidated the notes here with the LXP document for the single company Journal Entry and single Company Batching. P2 and P3 are ones to review to confirm the changes here. P1 is removing Accounting…
Thank you for this. I will have Claude process it into my plans.
 
Here's my attempt to move the open items forward. There's some questions in here for Sidecar to answer as well as some research that we need to do with Stripe and Tax calculation engines.
2026-07-14-lxp-open-items-response.md
 
"The MJ RLS system lets us filter row access based on a user's data; however, we do not have any secure structure in bizapps common that indicates a user's company. The current structure is informational not security-quality."
 
We have the information about the User and it's link to a Company in core MJ with Users, Employees and Companies. Users has an EmployeeID linking the User to an Employee record. Employees has a CompanyID field that links the Employee to a Company.
 
Beyond Entity Permissions and Row Level Security, there is Access Control Rules that provide more granular access. I need to dig deeper on this. Regarding permissions to change the security records. We just need to make sure those are limited to Administrators. We're a little too open in the default setting right now but can tighten it up.
 
"We have the information about the User and it's link to a Company in core MJ with Users, Employees and Companies. Users has an EmployeeID linking the User to an Employee record. Employees has a CompanyID field that links the Employee to a Company."
 
It is my understanding that that info is not treated as privileged by the permission system and is not intended to be. I think you said it well when you say we are a little open. For most applications that's fine but for accounting a more accessible granular system is required. we can work this in a future plan. For the first release it is non-blocking.
 
Jeremy Hunnewell I'm chiming in here on the Posting Date thread above. This is an important topic and while the BizApps-Orders and BizApps-Accounting apps are not aware of your accounting periods in the GL system, Jeremy Hunnewell, we do have a singular Posting Date for a Batch in the BizApps-Accounting system. 
 
The reason is you get one journal entry when a batch is sent across. We do not send individual transactions, we aggregate and roll up to a single aggregated Journal Entry, so you never get individual JEs/dates into the GL system, you get one single journal entry.
 
For this reason, the posting date in the source system  BizApps-Orders is actually quite important and should match the date in the GL system.
 
Are we aligned on this? If not, I suggest a call with RK, JH, me and Marcelo to knock this one issue out.
 
I had a quick chat with Robert during our SLT huddle this morning and he clarified a couple of items for me, so I'm 100% on board with this approach and agree the Posting Date is a critical element and needs to match between systems. We'll just need to make sure it isn't trying to send a posting date to a closed period, so some kind of feedback loop where Accounting + Orders can know if a period is closed in Business Central, or an exceptions flagging process if it tries to post to a closed period, would be valuable. 
 
P3 (single-company batches): I'm fine with both trade-offs.
 
Approvals multiplying (one per company-batch vs. one per run) — that's actually a better control, not just a cost. Different entities can have different approvers, and per-entity approval is more consistent with how we'd want segregation of duties to work anyway rather than one omnibus sign-off covering everything.
 
Intercompany legs posting on different dates is the one I want a condition on, not a blanket yes. Since each JE is self-balanced, this isn't a GL imbalance — it's an in-transit intercompany reconciliation issue, which we already handle at close for other timing gaps. But it only stays manageable if the gap is small. Two asks: (1) for any companies with an active intercompany relationship, let's try to keep their batch cadences aligned (both weekly, not one weekly/one monthly) so the in-transit window stays short, and (2) our intercompany rec process needs to explicitly track "posted in source, not yet in BC" as a reconciling item type, not just treat it as a break. With those two in place, I'm good with P3.
 
P4 (BC API delivery): Yes — our BC environment exposes the journal-write endpoints (standard API v2.0: journals/{id}/journalLines and generalJournalLines), same API surface we already use for read access. Robert, I believe you approved the app registration we're currently using for that read access (Clara requested it earlier this year) — it's client-credentials based and currently has read-only permissions on ledger/company data. I'm happy to share that tenant ID and app registration if you want to extend its scope, but given this is a new write path into the GL, it's probably cleaner to stand up a separate, purpose-built registration scoped just to journal posting rather than widening the permissions on the one we use for reporting. Your call on which way you want to go.
 
OQ-1 (closed-period rule): Flagging that I answered this in my reply this morning, but the doc still shows it as open, so restating for the record: I want an exceptions/flagging process — the system should know when a period is closed in BC (via a feedback loop) and flag the entry rather than attempt to post blind. That's the "hold for review" option, not auto-roll. Robert, can you update the doc status on this one so it's not tracked as outstanding?
 
Marcelo Torres can get this incorporated into the master plan so that’s the plan of record, now they we have decisions on many of these
 