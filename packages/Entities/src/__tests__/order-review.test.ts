import { afterEach, describe, expect, it } from 'vitest';
import {
    AddMonths,
    DecideReviewRole,
    DecideReviewStanding,
    EvaluateOrderReviewTriggers,
    HostOrderDealLink,
    OrderReviewChanges,
    OrderReviewConfigProblem,
    OrderReviewEnabled,
    OrderReviewExemption,
    IsSystemOrderOrigin,
    ParseOrderReviewTriggers,
    RegisterOrderDealLink,
    RenewalPriceEdits,
    ResolveOrderDeal,
    ReviewedFieldsInChanges,
    ReviewerUserIDs,
    SYSTEM_ORDER_ORIGINS,
    ServiceMonthsExceed,
    type OrderDealLink,
    type OrderReviewConfig,
    type OrderReviewFacts,
    type ReviewAuthority,
    type ReviewDecisionFacts,
    type OrderReviewLineFacts,
    type ReviewTaskFacts,
} from '../order-review';

/**
 * ORDER REVIEW BY TRIGGER (bc-aidp-next-golive#320 §5): the rules, without the database.
 *
 * An order confirms without review unless it hits a trigger a host switched on. These pin each trigger,
 * the configuration that must refuse rather than pass quietly, where a review stands, and who gets it.
 */

const ALL_ON: OrderReviewConfig = {
    Triggers: ['NoDeal', 'PriceVariance', 'ChangedAfterDealOrReview', 'OverThreshold', 'ServicePeriod'],
    TotalThreshold: 25000,
    MaxMonthsToServiceStart: 13,
    MaxLineServiceMonths: 12,
    ReviewerRole: 'Senior Finance (AR)',
    EscalationRole: 'CFO',
};

const config = (over: Partial<OrderReviewConfig> = {}): OrderReviewConfig => ({ ...ALL_ON, ...over });

const line = (over: Partial<OrderReviewLineFacts> = {}): OrderReviewLineFacts => ({
    LineNumber: 1,
    IsComponentOrReversal: false,
    RenewsSubscriptionID: null,
    UnitPrice: 100,
    EngineUnitPrice: 100,
    IsConfiguredPrice: true,
    PriceStated: true,
    HasApprovedConcession: false,
    RenewalPriceEdited: false,
    ServicePeriodStart: '2027-01-01',
    ServicePeriodEnd: '2027-12-31',
    ...over,
});

const facts = (over: Partial<OrderReviewFacts> = {}): OrderReviewFacts => ({
    HasDeal: true,
    NetTotal: 10000,
    Today: '2026-10-18',
    Lines: [line()],
    ...over,
});

const triggersOf = (hits: { Trigger: string }[]) => hits.map((h) => h.Trigger);

describe('ParseOrderReviewTriggers', () => {
    it('switches everything off when unset or empty, which is how every install starts', () => {
        expect(ParseOrderReviewTriggers(undefined)).toEqual({ Enabled: [], Unknown: [] });
        expect(ParseOrderReviewTriggers('')).toEqual({ Enabled: [], Unknown: [] });
        expect(ParseOrderReviewTriggers(' , ')).toEqual({ Enabled: [], Unknown: [] });
    });

    it('reads a list regardless of case and spacing, once each', () => {
        expect(ParseOrderReviewTriggers('nodeal, Over Threshold ,NoDeal').Enabled).toEqual(['NoDeal', 'OverThreshold']);
    });

    it('reports an entry that names no trigger instead of dropping it', () => {
        expect(ParseOrderReviewTriggers('NoDeal,OverThreshhold')).toEqual({ Enabled: ['NoDeal'], Unknown: ['OverThreshhold'] });
    });
});

describe('OrderReviewConfigProblem', () => {
    it('has nothing to say when review is off', () => {
        expect(OrderReviewEnabled(config({ Triggers: [] }))).toBe(false);
        expect(OrderReviewConfigProblem(config({ Triggers: [], ReviewerRole: null }))).toBeNull();
    });

    it('accepts a complete configuration', () => {
        expect(OrderReviewConfigProblem(ALL_ON)).toBeNull();
    });

    it('refuses a trigger with no reviewer role: nobody could review the order', () => {
        expect(OrderReviewConfigProblem(config({ ReviewerRole: null }))).toMatch(/OrderReviewerRole/);
    });

    it('refuses OverThreshold with no threshold rather than never firing it', () => {
        expect(OrderReviewConfigProblem(config({ TotalThreshold: null }))).toMatch(/OrderReviewTotalThreshold/);
        expect(OrderReviewConfigProblem(config({ Triggers: ['NoDeal'], TotalThreshold: null }))).toBeNull();
    });

    it('refuses a misspelt trigger, even with everything else off', () => {
        expect(OrderReviewConfigProblem(config({ Triggers: [] }), ['OverThreshhold'])).toMatch(/'OverThreshhold'.*not a trigger/);
    });
});

describe('OrderReviewExemption', () => {
    const renewal = { RenewsSubscriptionID: 'sub-1' };
    const sale = { RenewsSubscriptionID: null };

    it('reviews a direct order, and treats a blank origin as direct', () => {
        expect(OrderReviewExemption({ Origin: 'Direct', ReversesOrderHeaderID: null, Lines: [sale] })).toBeNull();
        expect(OrderReviewExemption({ Origin: null, ReversesOrderHeaderID: null, Lines: [sale] })).toBeNull();
    });

    it('leaves checkout and provider-payment orders alone, by the exact Origin those processes write', () => {
        expect(OrderReviewExemption({ Origin: 'Widget', ReversesOrderHeaderID: null, Lines: [sale] })?.Kind).toBe('NotDirect');
        expect(OrderReviewExemption({ Origin: 'ProviderPayment', ReversesOrderHeaderID: null, Lines: [sale] })?.Kind).toBe('NotDirect');
    });

    it('reviews any Origin it does not know, rather than reading "not Direct" as exempt (PR #912 review)', () => {
        // Origin is free text with no CHECK constraint; each of these used to skip review.
        for (const origin of ['x', 'DIRECT-ish', ' Direct x', 'widget', ' Widget', 'CheckoutWidget', 'Deal']) {
            expect(OrderReviewExemption({ Origin: origin, ReversesOrderHeaderID: null, Lines: [sale] })).toBeNull();
        }
        expect(IsSystemOrderOrigin('Widget')).toBe(true);
        expect(IsSystemOrderOrigin('Direct')).toBe(false);
        expect([...SYSTEM_ORDER_ORIGINS]).toEqual(['Widget', 'ProviderPayment']);
    });

    it('leaves a reversal alone', () => {
        expect(OrderReviewExemption({ Origin: 'Direct', ReversesOrderHeaderID: 'o-1', Lines: [sale] })?.Kind).toBe('Reversal');
    });

    it('treats an order of renewals only as renewal-only, and a mixed order as reviewed', () => {
        expect(OrderReviewExemption({ Origin: 'Direct', ReversesOrderHeaderID: null, Lines: [renewal, renewal] })?.Kind).toBe('RenewalOnly');
        expect(OrderReviewExemption({ Origin: 'Direct', ReversesOrderHeaderID: null, Lines: [renewal, sale] })).toBeNull();
    });
});

describe('EvaluateOrderReviewTriggers', () => {
    it('lets an ordinary deal order through', () => {
        expect(EvaluateOrderReviewTriggers(facts(), ALL_ON)).toEqual([]);
    });

    it('fires nothing when every trigger is off, whatever the order looks like', () => {
        const wild = facts({ HasDeal: false, NetTotal: 1e9, Lines: [line({ ServicePeriodStart: '2030-01-01', ServicePeriodEnd: '2035-01-01' })] });
        expect(EvaluateOrderReviewTriggers(wild, config({ Triggers: [] }))).toEqual([]);
    });

    describe('NoDeal', () => {
        it('fires for an order with no deal', () => {
            expect(triggersOf(EvaluateOrderReviewTriggers(facts({ HasDeal: false }), config({ Triggers: ['NoDeal'] })))).toEqual(['NoDeal']);
        });
    });

    describe('PriceVariance', () => {
        const on = config({ Triggers: ['PriceVariance'] });
        const direct = (l: Partial<OrderReviewLineFacts>) => facts({ HasDeal: false, Lines: [line(l)] });

        it('fires for a direct line priced away from the catalog, above or below', () => {
            expect(triggersOf(EvaluateOrderReviewTriggers(direct({ UnitPrice: 120, IsConfiguredPrice: false }), on))).toEqual(['PriceVariance']);
            const below = EvaluateOrderReviewTriggers(direct({ UnitPrice: 80, IsConfiguredPrice: false }), on);
            expect(below[0].Reason).toContain('80.00 against a catalog price of 100.00');
        });

        it('does not fire when an approved concession covers the line, including one on the rep\'s own authority', () => {
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 96, IsConfiguredPrice: false, HasApprovedConcession: true }), on)).toEqual([]);
        });

        it('does not fire for the catalog\'s own price, a named list pick, or a price within a penny', () => {
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 100, IsConfiguredPrice: true }), on)).toEqual([]);
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 100.004, IsConfiguredPrice: false }), on)).toEqual([]);
        });

        it('does not fire with nothing to compare against, or for a line the engine prices at confirm', () => {
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 5, EngineUnitPrice: null, IsConfiguredPrice: false }), on)).toEqual([]);
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 5, IsConfiguredPrice: false, PriceStated: false }), on)).toEqual([]);
        });

        it('leaves bundle components and reversals alone', () => {
            expect(EvaluateOrderReviewTriggers(direct({ UnitPrice: 5, IsConfiguredPrice: false, IsComponentOrReversal: true }), on)).toEqual([]);
        });

        it('leaves a deal order\'s prices to the deal: a change to them is ChangedAfterDealOrReview', () => {
            expect(EvaluateOrderReviewTriggers(facts({ HasDeal: true, Lines: [line({ UnitPrice: 5, IsConfiguredPrice: false })] }), on)).toEqual([]);
        });

        it('fires for an edited carried-forward renewal price, deal or not, and not for an unedited one', () => {
            const edited = line({ RenewsSubscriptionID: 'sub-1', RenewalPriceEdited: true });
            expect(triggersOf(EvaluateOrderReviewTriggers(facts({ Lines: [edited] }), on))).toEqual(['PriceVariance']);
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [line({ RenewsSubscriptionID: 'sub-1' })] }), on)).toEqual([]);
        });
    });

    describe('OverThreshold', () => {
        const on = config({ Triggers: ['OverThreshold'] });

        it('fires above the threshold and not at it', () => {
            expect(triggersOf(EvaluateOrderReviewTriggers(facts({ NetTotal: 25000.01 }), on))).toEqual(['OverThreshold']);
            expect(EvaluateOrderReviewTriggers(facts({ NetTotal: 25000 }), on)).toEqual([]);
        });

        it('says the total and the threshold', () => {
            expect(EvaluateOrderReviewTriggers(facts({ NetTotal: 30000 }), on)[0].Reason).toContain('30,000.00 is above the review threshold of 25,000.00');
        });
    });

    describe('ServicePeriod', () => {
        const on = config({ Triggers: ['ServicePeriod'] });

        it('fires for a start more than 13 months out, and not for one exactly 13 months out', () => {
            const far = line({ ServicePeriodStart: '2027-11-19', ServicePeriodEnd: '2028-11-18' });
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [far] }), on)[0].Reason).toMatch(/more than 13 months out/);
            const edge = line({ ServicePeriodStart: '2027-11-18', ServicePeriodEnd: '2028-11-17' });
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [edge] }), on)).toEqual([]);
        });

        it('fires for a line covering more than 12 months, and not for a full year', () => {
            const long = line({ ServicePeriodStart: '2027-01-01', ServicePeriodEnd: '2028-01-01' });
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [long] }), on)[0].Reason).toMatch(/more than 12 months/);
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [line()] }), on)).toEqual([]);
        });

        it('ignores a line with no service period, and bundle components', () => {
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [line({ ServicePeriodStart: null, ServicePeriodEnd: null })] }), on)).toEqual([]);
            const component = line({ IsComponentOrReversal: true, ServicePeriodStart: '2030-01-01', ServicePeriodEnd: '2032-01-01' });
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [component] }), on)).toEqual([]);
        });

        it('honours configured limits', () => {
            const sixMonthsOut = line({ ServicePeriodStart: '2027-05-01', ServicePeriodEnd: '2027-10-31' });
            expect(EvaluateOrderReviewTriggers(facts({ Lines: [sixMonthsOut] }), config({ Triggers: ['ServicePeriod'], MaxMonthsToServiceStart: 3 }))).toHaveLength(1);
        });
    });

    it('reports every trigger an order hits', () => {
        const hits = EvaluateOrderReviewTriggers(
            facts({ HasDeal: false, NetTotal: 50000, Lines: [line({ UnitPrice: 50, IsConfiguredPrice: false, ServicePeriodEnd: '2028-06-30' })] }),
            ALL_ON,
        );
        expect(triggersOf(hits)).toEqual(['NoDeal', 'PriceVariance', 'OverThreshold', 'ServicePeriod']);
    });
});

describe('OrderReviewChanges and RenewalPriceEdits', () => {
    const none = { HeaderFieldsChanged: [], LinesChanged: [], LinesAdded: 0, LinesRemoved: 0 };

    it('finds nothing in a save that changes nothing reviewed', () => {
        expect(OrderReviewChanges(none)).toEqual([]);
        expect(OrderReviewChanges({ ...none, HeaderFieldsChanged: ['Notes', 'Description'] })).toEqual([]);
        expect(OrderReviewChanges({ ...none, LinesChanged: [{ LineNumber: 1, Fields: ['Description'], RenewsSubscriptionID: null }] })).toEqual([]);
    });

    it('names bill-to, company, line price and service dates, and lines added or removed', () => {
        const changes = OrderReviewChanges({
            HeaderFieldsChanged: ['BillToOrganizationID', 'CompanyID'],
            LinesChanged: [{ LineNumber: 2, Fields: ['UnitPrice', 'ServicePeriodStart', 'ServicePeriodEnd'], RenewsSubscriptionID: null }],
            LinesAdded: 1,
            LinesRemoved: 2,
        });
        expect(changes).toEqual([
            'the bill-to organization and company changed',
            "line 2's price and service dates changed",
            '1 line was added',
            '2 lines were removed',
        ]);
    });

    it('finds an edit to a renewal line\'s price, and not to an ordinary line or a renewal line\'s dates', () => {
        const edits = RenewalPriceEdits({
            ...none,
            LinesChanged: [
                { LineNumber: 1, Fields: ['DiscountPct'], RenewsSubscriptionID: 'sub-1' },
                { LineNumber: 2, Fields: ['UnitPrice'], RenewsSubscriptionID: null },
                { LineNumber: 3, Fields: ['ServicePeriodEnd'], RenewsSubscriptionID: 'sub-2' },
            ],
        });
        expect(edits).toEqual(["line 1's carried-forward renewal price was edited"]);
    });
});

describe('DecideReviewStanding', () => {
    const REVIEWER = 'AAAAAAAA-0000-0000-0000-000000000001';
    const OTHER_REVIEWER = 'AAAAAAAA-0000-0000-0000-000000000002';
    const CREATOR = 'AAAAAAAA-0000-0000-0000-0000000000C0';
    const decision = (over: Partial<ReviewDecisionFacts> = {}): ReviewDecisionFacts => ({
        Outcome: 'Approved',
        WrittenByUserID: REVIEWER,
        LinkedBeforeDecision: true,
        LinksAnotherOrder: false,
        ChangesSinceDecision: [],
        ...over,
    });
    const task = (over: Partial<ReviewTaskFacts> = {}): ReviewTaskFacts => ({
        Status: 'Completed',
        AssigneePersonIDs: ['person-1'],
        Decision: decision(),
        ...over,
    });
    const authority: ReviewAuthority = {
        Role: 'Senior Finance (AR)',
        EligibleUserIDs: [REVIEWER, OTHER_REVIEWER],
        CreatorUserID: CREATOR,
        Refusal: null,
    };
    const standing = (t: ReviewTaskFacts | null, a: ReviewAuthority | null = authority) => DecideReviewStanding(t, a);

    it('has no standing with no review', () => {
        expect(standing(null)).toEqual({ Standing: 'None' });
    });

    it('is open while the task is', () => {
        for (const status of ['Open', 'InProgress', 'Blocked']) expect(standing(task({ Status: status, Decision: null })).Standing).toBe('Open');
    });

    it('reads an open review assigned to nobody as not approved, so it is replaced rather than holding the order forever', () => {
        expect(standing(task({ Status: 'Open', Decision: null, AssigneePersonIDs: [] }))).toMatchObject({
            Standing: 'NotApproved',
            Reason: expect.stringMatching(/assigned to nobody/),
        });
    });

    it('is approved on an approving decision written by a holder of the routed role, whatever the ID case', () => {
        expect(standing(task()).Standing).toBe('Approved');
        expect(standing(task({ Decision: decision({ Outcome: 'ApprovedWithConditions', WrittenByUserID: REVIEWER.toLowerCase() }) })).Standing).toBe('Approved');
    });

    it('is not approved when rejected, cancelled or closed with no decision', () => {
        expect(standing(task({ Decision: decision({ Outcome: 'Rejected' }) }))).toEqual({ Standing: 'NotApproved', Reason: "its last review was decided 'Rejected'" });
        expect(standing(task({ Status: 'Cancelled' }))).toMatchObject({ Standing: 'NotApproved', Reason: expect.stringMatching(/cancelled/) });
        expect(standing(task({ Decision: null }))).toMatchObject({ Reason: expect.stringMatching(/without an approving decision/) });
    });

    it("does not take the order's creator's own approval, even when they hold the role (PR #912 review)", () => {
        const creatorIsReviewer = { ...authority, EligibleUserIDs: [REVIEWER, CREATOR] };
        expect(standing(task({ Decision: decision({ WrittenByUserID: CREATOR }) }), creatorIsReviewer)).toMatchObject({
            Standing: 'NotApproved',
            Reason: expect.stringMatching(/approved by the order's creator/),
        });
    });

    it('does not take an approval written by someone outside the routed role, whatever the task says (PR #912 review)', () => {
        expect(standing(task({ Decision: decision({ WrittenByUserID: 'AAAAAAAA-0000-0000-0000-0000000000FF' }) }))).toMatchObject({
            Standing: 'NotApproved',
            Reason: expect.stringMatching(/does not hold the role 'Senior Finance \(AR\)'/),
        });
    });

    it('does not take an approval whose writer the record-change log does not name', () => {
        expect(standing(task({ Decision: decision({ WrittenByUserID: null }) }))).toMatchObject({ Reason: expect.stringMatching(/record-change log/) });
    });

    it('does not take an approval without knowing who may give one, or when no one may', () => {
        expect(standing(task(), null)).toMatchObject({ Standing: 'NotApproved' });
        expect(standing(task(), { Role: null, EligibleUserIDs: [], CreatorUserID: CREATOR, Refusal: 'no escalation role is set' })).toMatchObject({
            Reason: expect.stringMatching(/no escalation role is set/),
        });
    });

    it('does not take an approval given to a task that was pointed at this order afterwards, or that covers another order too', () => {
        expect(standing(task({ Decision: decision({ LinkedBeforeDecision: false }) }))).toMatchObject({ Reason: expect.stringMatching(/linked to this order only after/) });
        expect(standing(task({ Decision: decision({ LinksAnotherOrder: true }) }))).toMatchObject({ Reason: expect.stringMatching(/linked to another order/) });
    });

    it('does not take an approval the order has changed since (PR #912 review, required 3)', () => {
        expect(standing(task({ Decision: decision({ ChangesSinceDecision: ["line 1's price changed"] }) }))).toEqual({
            Standing: 'NotApproved',
            Reason: "it changed after its review was approved (line 1's price changed)",
        });
    });

    it('does not ask for authority unless the decision approves', () => {
        expect(standing(task({ Decision: decision({ Outcome: 'Rejected' }) }), null).Standing).toBe('NotApproved');
        expect(standing(task({ Status: 'Open', Decision: null }), null).Standing).toBe('Open');
    });
});

describe('ReviewedFieldsInChanges', () => {
    it('names the reviewed fields a record change touched', () => {
        const json = JSON.stringify({ UnitPrice: { field: 'UnitPrice', oldValue: 1, newValue: 2 }, Description: { field: 'Description' } });
        expect(ReviewedFieldsInChanges(json, ['UnitPrice', 'Quantity'])).toEqual({ Fields: ['UnitPrice'] });
    });

    it('reads an empty record as no change, and an unreadable one as unreadable, which the caller counts as a change', () => {
        expect(ReviewedFieldsInChanges('', ['UnitPrice'])).toEqual({ Fields: [] });
        expect(ReviewedFieldsInChanges(null, ['UnitPrice'])).toEqual({ Fields: [] });
        expect(ReviewedFieldsInChanges('{not json', ['UnitPrice'])).toHaveProperty('Unreadable');
        expect(ReviewedFieldsInChanges('[1,2]', ['UnitPrice'])).toHaveProperty('Unreadable');
    });
});

describe('DecideReviewRole and ReviewerUserIDs', () => {
    it('routes to the reviewer role', () => {
        expect(DecideReviewRole({ ReviewerRole: 'Senior Finance (AR)', EscalationRole: 'CFO', CreatorHoldsReviewerRole: false })).toEqual({
            Role: 'Senior Finance (AR)',
            Escalated: false,
        });
    });

    it('escalates an order a reviewer created', () => {
        expect(DecideReviewRole({ ReviewerRole: 'Senior Finance (AR)', EscalationRole: 'CFO', CreatorHoldsReviewerRole: true })).toEqual({
            Role: 'CFO',
            Escalated: true,
        });
    });

    it('refuses with no reviewer role, or a reviewer-created order with no escalation role', () => {
        expect(DecideReviewRole({ ReviewerRole: null, EscalationRole: 'CFO', CreatorHoldsReviewerRole: false })).toMatchObject({
            Refusal: expect.stringMatching(/OrderReviewerRole/),
        });
        expect(DecideReviewRole({ ReviewerRole: 'Senior Finance (AR)', EscalationRole: null, CreatorHoldsReviewerRole: true })).toMatchObject({
            Refusal: expect.stringMatching(/OrderReviewEscalationRole/),
        });
    });

    it('never assigns the creator, and assigns each holder once whatever the ID case', () => {
        const CREATOR = 'AAAAAAAA-0000-0000-0000-00000000000C';
        const OTHER = 'AAAAAAAA-0000-0000-0000-00000000000D';
        expect(ReviewerUserIDs([CREATOR.toLowerCase(), OTHER, OTHER.toLowerCase()], CREATOR)).toEqual([OTHER]);
        expect(ReviewerUserIDs([OTHER], null)).toEqual([OTHER]);
    });
});

describe('AddMonths and ServiceMonthsExceed', () => {
    it('moves by calendar months, clamping to the month\'s last day', () => {
        expect(AddMonths('2026-10-18', 13)).toBe('2027-11-18');
        expect(AddMonths('2027-01-31', 1)).toBe('2027-02-28');
        expect(AddMonths('2028-01-31', 1)).toBe('2028-02-29');
        expect(AddMonths('2026-12-15', -12)).toBe('2025-12-15');
    });

    it('returns null for an unreadable day', () => {
        expect(AddMonths('not a day', 1)).toBeNull();
    });

    it('counts a service period inclusively', () => {
        expect(ServiceMonthsExceed('2027-01-01', '2027-12-31', 12)).toBe(false);
        expect(ServiceMonthsExceed('2027-01-01', '2028-01-01', 12)).toBe(true);
        expect(ServiceMonthsExceed('2027-03-15', '2028-03-14', 12)).toBe(false);
    });
});

describe('the deal link seam', () => {
    afterEach(() => RegisterOrderDealLink(null));

    it('holds nothing until something registers, and then every order counts as having no deal', async () => {
        expect(HostOrderDealLink()).toBeNull();
        expect(await ResolveOrderDeal(HostOrderDealLink(), 'order-1', null)).toBeNull();
    });

    it('answers with the registered link, and asks nothing for an unsaved order', async () => {
        const asked: string[] = [];
        const link: OrderDealLink = {
            DealForOrder: async (id) => {
                asked.push(id);
                return { DealID: 'deal-1', DealNumber: 'D-1' };
            },
        };
        RegisterOrderDealLink(link);
        expect(HostOrderDealLink()).toBe(link);
        expect(await ResolveOrderDeal(link, 'order-1', null)).toEqual({ DealID: 'deal-1', DealNumber: 'D-1' });
        expect(await ResolveOrderDeal(link, null, null)).toBeNull();
        expect(asked).toEqual(['order-1']);
    });

    it('does not swallow a link that cannot tell: "could not tell" is not "no deal"', async () => {
        const failing: OrderDealLink = {
            DealForOrder: async () => {
                throw new Error('deals could not be read');
            },
        };
        await expect(ResolveOrderDeal(failing, 'order-1', null)).rejects.toThrow('deals could not be read');
    });
});
