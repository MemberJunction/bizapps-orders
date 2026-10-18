/**
 * Order review by trigger on the server (bc-aidp-next-golive#320 §5): the confirm gate, the change hook,
 * and who a review task goes to. No database: the provider and its views are an in-memory fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

const pricing = vi.hoisted(() => ({ ResolveLinePriceStanding: vi.fn() }));
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    ResolveLinePriceStanding: pricing.ResolveLinePriceStanding,
}));
vi.mock('@mj-biz-apps/tasks-entities', () => ({}));
const people = vi.hoisted(() => ({ byUser: new Map<string, string>() }));
vi.mock('../person-user-link.js', () => ({
    ResolvePersonIDsForUsers: async (userIDs: readonly string[]) =>
        new Map(userIDs.filter((id) => people.byUser.has(id.toLowerCase())).map((id) => [id.toLowerCase(), people.byUser.get(id.toLowerCase())!])),
}));
vi.mock('../PaymentGatedAccess.js', () => ({ BusinessDay: async () => '2026-10-18' }));

const { RegisterOrderDealLink } = await import('@mj-biz-apps/orders-entities');
const { OrdersSettings, ORDERS_SETTING } = await import('../OrdersSettings.js');
const { CheckOrderReviewAtConfirm, CheckOrderReviewOnChange } = await import('../OrderReview.js');
type ReviewOrderInput = import('../OrderReview.js').ReviewOrderInput;
type ReviewLineInput = import('../OrderReview.js').ReviewLineInput;

// ─── The fake database ──────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const ENTITY_IDS: Record<string, string> = {
    'MJ_BizApps_Orders: Order Headers': 'E0000000-0000-0000-0000-000000000001',
    'MJ_BizApps_Orders: Order Lines': 'E0000000-0000-0000-0000-000000000002',
    'MJ_BizApps_Orders: Order Concessions': 'E0000000-0000-0000-0000-000000000003',
    'MJ_BizApps_Common: People': 'E0000000-0000-0000-0000-000000000004',
    'MJ_BizApps_Tasks: Tasks': 'E0000000-0000-0000-0000-000000000005',
    'MJ_BizApps_Tasks: Task Types': 'E0000000-0000-0000-0000-000000000006',
    'MJ_BizApps_Tasks: Task Links': 'E0000000-0000-0000-0000-000000000007',
    'MJ_BizApps_Tasks: Task Assignments': 'E0000000-0000-0000-0000-000000000008',
    'MJ_BizApps_Tasks: Task Activities': 'E0000000-0000-0000-0000-000000000009',
    'MJ_BizApps_Tasks: Task Decisions': 'E0000000-0000-0000-0000-00000000000A',
    'MJ_BizApps_Tasks: Task Decision Outcomes': 'E0000000-0000-0000-0000-00000000000B',
    'MJ: Roles': 'E0000000-0000-0000-0000-00000000000C',
    'MJ: User Roles': 'E0000000-0000-0000-0000-00000000000D',
    'MJ: Users': 'E0000000-0000-0000-0000-00000000000E',
    'MJ: Record Changes': 'E0000000-0000-0000-0000-00000000000F',
};
let tables: Record<string, Row[]>;
let seq = 0;
const uuid = () => `F0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** Enough of an ExtraFilter to answer this module's reads: `Field = 'x'`, `Field = 1`, `Field IN (...)`, joined by AND. */
function matches(row: Row, filter: string | undefined): boolean {
    if (!filter) return true;
    return filter.split(/\s+AND\s+/i).every((clause) => {
        const eq = /^\(?\s*(\w+)\s*=\s*'?([^']*?)'?\s*\)?$/.exec(clause.trim());
        if (eq) return String(row[eq[1]] ?? '').toLowerCase() === eq[2].toLowerCase() || (eq[2] === '1' && row[eq[1]] === true);
        const inList = /^(\w+)\s+IN\s+\((.*)\)$/i.exec(clause.trim());
        if (inList) {
            const values = inList[2].split(',').map((v) => v.trim().replace(/^'|'$/g, '').toLowerCase());
            return values.includes(String(row[inList[1]] ?? '').toLowerCase());
        }
        return true;
    });
}

function fakeEntity(name: string): Row {
    const entity: Row = {
        NewRecord: () => undefined,
        Save: async () => {
            entity.ID = entity.ID ?? uuid();
            entity.__mj_CreatedAt = ++seq;
            const { NewRecord: _n, Save: _s, LatestResult: _l, ...fields } = entity;
            (tables[name] ??= []).push(fields);
            return true;
        },
        LatestResult: null,
    };
    return entity;
}

const provider = {
    EntityByName: (name: string) => (ENTITY_IDS[name] ? { ID: ENTITY_IDS[name], Name: name } : undefined),
    GetEntityObject: async (name: string) => fakeEntity(name),
} as unknown as IMetadataProvider;
const USER = { ID: 'AAAAAAAA-0000-0000-0000-0000000000A1', Name: 'confirmer' } as UserInfo;
const ctx = { Provider: provider, User: USER };

// ─── People and roles ───────────────────────────────────────────────────────────────────────────

const ORDER_ID = 'B0000000-0000-4000-8000-000000000001';
const REVIEW_TYPE = 'C0000000-0000-4000-8000-000000000001';
const ROLE_REVIEWER = 'D0000000-0000-4000-8000-000000000001';
const ROLE_CFO = 'D0000000-0000-4000-8000-000000000002';
const REVIEWER_1 = 'AAAAAAAA-0000-0000-0000-0000000000B1';
const REVIEWER_2 = 'AAAAAAAA-0000-0000-0000-0000000000B2';
const CFO = 'AAAAAAAA-0000-0000-0000-0000000000C1';
const PERSON = (userID: string) => `P${userID.slice(1)}`;
const OUTCOME_APPROVED = 'O0000000-0000-4000-8000-000000000001';
const OUTCOME_REJECTED = 'O0000000-0000-4000-8000-000000000002';

function seed(creatorUserID: string = USER.ID): void {
    tables = {
        'MJ_BizApps_Tasks: Task Types': [{ ID: REVIEW_TYPE, Code: 'ORDERS_ORDER_REVIEW' }],
        'MJ_BizApps_Tasks: Task Decision Outcomes': [
            { ID: OUTCOME_APPROVED, Code: 'Approved', IsTerminal: true },
            { ID: OUTCOME_REJECTED, Code: 'Rejected', IsTerminal: true },
        ],
        'MJ: Roles': [
            { ID: ROLE_REVIEWER, Name: 'Senior Finance (AR)' },
            { ID: ROLE_CFO, Name: 'CFO' },
        ],
        'MJ: User Roles': [
            { RoleID: ROLE_REVIEWER, UserID: REVIEWER_1 },
            { RoleID: ROLE_REVIEWER, UserID: REVIEWER_2 },
            { RoleID: ROLE_CFO, UserID: CFO },
        ],
        'MJ: Users': [REVIEWER_1, REVIEWER_2, CFO, USER.ID].map((ID) => ({ ID, IsActive: true, Name: ID })),
        'MJ: Record Changes': [
            { EntityID: ENTITY_IDS['MJ_BizApps_Orders: Order Headers'], RecordID: `ID|${ORDER_ID}`, Type: 'Create', UserID: creatorUserID, ChangedAt: 1 },
        ],
    };
    people.byUser = new Map([REVIEWER_1, REVIEWER_2, CFO].map((id) => [id.toLowerCase(), PERSON(id)]));
}

/** An existing review task on the order, decided or not. */
function existingReview(status: string, decision?: { outcome: string; by: string }, assignees: string[] = [PERSON(REVIEWER_1)]): string {
    const taskID = uuid();
    tables['MJ_BizApps_Tasks: Tasks'] = [...(tables['MJ_BizApps_Tasks: Tasks'] ?? []), { ID: taskID, Name: 'ORD-1: order review', Status: status, TypeID: REVIEW_TYPE, __mj_CreatedAt: ++seq }];
    (tables['MJ_BizApps_Tasks: Task Links'] ??= []).push({ TaskID: taskID, EntityID: ENTITY_IDS['MJ_BizApps_Orders: Order Headers'], RecordID: ORDER_ID });
    for (const p of assignees) (tables['MJ_BizApps_Tasks: Task Assignments'] ??= []).push({ TaskID: taskID, AssigneeEntityID: ENTITY_IDS['MJ_BizApps_Common: People'], AssigneeRecordID: p });
    if (decision) (tables['MJ_BizApps_Tasks: Task Decisions'] ??= []).push({ TaskID: taskID, OutcomeID: decision.outcome, DecidedByPersonID: decision.by, DecidedAt: ++seq });
    return taskID;
}

const reviewTasks = () => (tables['MJ_BizApps_Tasks: Tasks'] ?? []).filter((t) => t.TypeID === REVIEW_TYPE);
const assigneesOf = (taskID: unknown) =>
    (tables['MJ_BizApps_Tasks: Task Assignments'] ?? []).filter((a) => a.TaskID === taskID).map((a) => a.AssigneeRecordID);

// ─── Settings and orders ────────────────────────────────────────────────────────────────────────

function settings(values: Partial<Record<keyof typeof ORDERS_SETTING, string>>): void {
    const all: Record<string, string> = {
        OrderReviewTriggers: '',
        OrderReviewTotalThreshold: '',
        OrderReviewServiceStartMonths: '',
        OrderReviewLineTermMonths: '',
        OrderReviewerRole: 'Senior Finance (AR)',
        OrderReviewEscalationRole: 'CFO',
        ...values,
    };
    for (const [key, value] of Object.entries(all)) OrdersSettings.SetOverride(key, value);
}

const reviewLine = (over: Partial<ReviewLineInput> = {}): ReviewLineInput => ({
    ID: 'L0000000-0000-4000-8000-000000000001',
    LineNumber: 1,
    ParentOrderLineID: null,
    ReversesOrderLineID: null,
    ProductID: 'R0000000-0000-4000-8000-000000000001',
    OrderHeaderID: ORDER_ID,
    Quantity: 1,
    UnitPrice: 1000,
    ProductPriceID: null,
    DiscountPct: 0,
    RenewsSubscriptionID: null,
    PriceStated: true,
    LineTotalNet: 1000,
    ServicePeriodStart: '2027-01-01',
    ServicePeriodEnd: '2027-12-31',
    RenewalPriceEdited: false,
    ...over,
});

const order = (over: Partial<ReviewOrderInput> = {}): ReviewOrderInput => ({
    OrderHeaderID: ORDER_ID,
    OrderNumber: 'ORD-1',
    Origin: 'Direct',
    ReversesOrderHeaderID: null,
    Lines: [reviewLine()],
    ...over,
});

const NO_CHANGE = { HeaderFieldsChanged: [], LinesChanged: [], LinesAdded: 0, LinesRemoved: 0 };
const dealLink = (dealNumber: string | null) => ({
    DealForOrder: vi.fn(async () => (dealNumber ? { DealID: 'deal-1', DealNumber: dealNumber } : null)),
});

beforeEach(() => {
    seed();
    vi.spyOn(OrdersSettings, 'Load').mockResolvedValue(undefined);
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
        let rows = (tables[params.EntityName ?? ''] ?? []).filter((r) => matches(r, params.ExtraFilter));
        const order = /^(\w+)(\s+DESC)?$/i.exec(params.OrderBy ?? '');
        if (order) rows = [...rows].sort((a, b) => (Number(a[order[1]] ?? 0) - Number(b[order[1]] ?? 0)) * (order[2] ? -1 : 1));
        if (params.MaxRows) rows = rows.slice(0, params.MaxRows);
        return { Success: true, Results: rows, ErrorMessage: '' } as never;
    });
    pricing.ResolveLinePriceStanding.mockResolvedValue({ EngineUnitPrice: 1000, IsEnginePrice: true, IsNamedListPick: false });
});

afterEach(() => {
    OrdersSettings.ClearOverrides();
    RegisterOrderDealLink(null);
    vi.restoreAllMocks();
});

// ─── The confirm gate ───────────────────────────────────────────────────────────────────────────

describe('CheckOrderReviewAtConfirm: configuration', () => {
    it('does nothing, and reads nothing, while every trigger is off', async () => {
        settings({ OrderReviewTriggers: '' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toBeNull();
        expect(RunView.prototype.RunView).not.toHaveBeenCalled();
    });

    it('refuses on a misspelt trigger rather than ignoring it', async () => {
        settings({ OrderReviewTriggers: 'NoDeal,OverThreshhold' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/OrderReviewTriggers names 'OverThreshhold'/);
    });

    it('refuses when a trigger is on and no reviewer role is set', async () => {
        settings({ OrderReviewTriggers: 'NoDeal', OrderReviewerRole: '' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/OrderReviewerRole/);
    });

    it('refuses OverThreshold with no threshold', async () => {
        settings({ OrderReviewTriggers: 'OverThreshold' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/OrderReviewTotalThreshold/);
    });

    it('leaves checkout, provider-payment and reversal orders alone', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        expect(await CheckOrderReviewAtConfirm(order({ Origin: 'CheckoutWidget' }), ctx)).toBeNull();
        expect(await CheckOrderReviewAtConfirm(order({ ReversesOrderHeaderID: 'B0000000-0000-4000-8000-000000000009' }), ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(0);
    });

    it('lets a renewal-only order through with no review', async () => {
        settings({ OrderReviewTriggers: 'NoDeal,OverThreshold', OrderReviewTotalThreshold: '10' });
        expect(await CheckOrderReviewAtConfirm(order({ Lines: [reviewLine({ RenewsSubscriptionID: 'sub-1' })] }), ctx)).toBeNull();
    });
});

describe('CheckOrderReviewAtConfirm: raising a review', () => {
    it('sends a direct order to the reviewer role, assigning each holder by Person, and refuses the confirm', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        const refusal = await CheckOrderReviewAtConfirm(order(), ctx);

        expect(refusal).toMatch(/ORD-1 needs a review before it can be confirmed: it was entered directly/);
        expect(refusal).toMatch(/sent for review to 2 holders of 'Senior Finance \(AR\)'/);
        const [task] = reviewTasks();
        expect(task.Status).toBe('Open');
        expect(task.Description).toContain('entered directly');
        expect(assigneesOf(task.ID)).toEqual([PERSON(REVIEWER_1), PERSON(REVIEWER_2)]);
        expect(tables['MJ_BizApps_Tasks: Task Links']).toContainEqual(expect.objectContaining({ TaskID: task.ID, RecordID: ORDER_ID }));
    });

    it('lets a deal order with no other trigger through', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        RegisterOrderDealLink(dealLink('D-1'));
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(0);
    });

    it('fires OverThreshold on the net total, and not below it', async () => {
        settings({ OrderReviewTriggers: 'OverThreshold', OrderReviewTotalThreshold: '25,000' });
        expect(await CheckOrderReviewAtConfirm(order({ Lines: [reviewLine({ LineTotalNet: 20000, ID: null })] }), ctx)).toBeNull();
        expect(await CheckOrderReviewAtConfirm(order({ Lines: [reviewLine({ LineTotalNet: 30000, ID: null })] }), ctx)).toMatch(/30,000.00 is above the review threshold/);
    });

    it('fires ServicePeriod for a start more than 13 months out', async () => {
        settings({ OrderReviewTriggers: 'ServicePeriod' });
        const far = reviewLine({ ServicePeriodStart: '2028-01-01', ServicePeriodEnd: '2028-12-31' });
        expect(await CheckOrderReviewAtConfirm(order({ Lines: [far] }), ctx)).toMatch(/more than 13 months out/);
    });

    it('fires PriceVariance for a direct line off the catalog with no approved concession, and not with one', async () => {
        settings({ OrderReviewTriggers: 'PriceVariance' });
        pricing.ResolveLinePriceStanding.mockResolvedValue({ EngineUnitPrice: 1200, IsEnginePrice: false, IsNamedListPick: false });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/1,000.00 against a catalog price of 1,200.00/);

        seed();
        tables['MJ_BizApps_Orders: Order Concessions'] = [
            { OrderHeaderID: ORDER_ID, OrderLineID: 'L0000000-0000-4000-8000-000000000001', Status: 'Approved', DeliveryForm: 'Price' },
        ];
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toBeNull();
    });

    it('escalates an order a holder of the reviewer role created, and never assigns the creator', async () => {
        seed(REVIEWER_1);
        settings({ OrderReviewTriggers: 'NoDeal' });
        const refusal = await CheckOrderReviewAtConfirm(order(), ctx);

        expect(refusal).toMatch(/1 holder of 'CFO', since a holder of the reviewer role created it/);
        expect(assigneesOf(reviewTasks()[0].ID)).toEqual([PERSON(CFO)]);
    });

    it('never assigns the creator, even when they hold the escalation role too', async () => {
        seed(CFO);
        tables['MJ: User Roles'].push({ RoleID: ROLE_REVIEWER, UserID: CFO });
        settings({ OrderReviewTriggers: 'NoDeal' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/No active user other than the order's creator holds the role 'CFO'/);
        expect(reviewTasks()).toHaveLength(0);
    });

    it('refuses when a reviewer created the order and no escalation role is set', async () => {
        seed(REVIEWER_2);
        settings({ OrderReviewTriggers: 'NoDeal', OrderReviewEscalationRole: '' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/could not be decided.*OrderReviewEscalationRole/);
        expect(reviewTasks()).toHaveLength(0);
    });

    it('refuses rather than raise a review nobody can see when no reviewer has a Person (golive #326)', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        people.byUser = new Map();
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/active Person linked/);
        expect(reviewTasks()).toHaveLength(0);
    });

    it('refuses when the reviewer role does not exist', async () => {
        settings({ OrderReviewTriggers: 'NoDeal', OrderReviewerRole: 'Senior Finance' });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/role 'Senior Finance' named by the order review settings does not exist/);
    });

    it('refuses when the deal link cannot tell, rather than reading it as no deal', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        RegisterOrderDealLink({ DealForOrder: async () => { throw new Error('deals could not be read'); } });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/could not be decided\. deals could not be read/);
    });

    it('asks for a save first when the order hitting a trigger is not saved yet', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        expect(await CheckOrderReviewAtConfirm(order({ OrderHeaderID: null }), ctx)).toMatch(/Save the order without confirming it first/);
        expect(reviewTasks()).toHaveLength(0);
    });

    it('refuses when the review task type is not installed', async () => {
        settings({ OrderReviewTriggers: 'NoDeal' });
        tables['MJ_BizApps_Tasks: Task Types'] = [];
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/no 'ORDERS_ORDER_REVIEW' task type/);
    });
});

describe('CheckOrderReviewAtConfirm: an order that already has a review', () => {
    beforeEach(() => settings({ OrderReviewTriggers: 'NoDeal' }));

    it('refuses while the review is open, without raising another', async () => {
        existingReview('Open');
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/cannot be confirmed until its review is approved/);
        expect(reviewTasks()).toHaveLength(1);
    });

    it('confirms on an approval by an assignee', async () => {
        existingReview('Completed', { outcome: OUTCOME_APPROVED, by: PERSON(REVIEWER_1) });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toBeNull();
    });

    it('still waits for an approved review once the triggers no longer fire (a reviewed order stays reviewed)', async () => {
        RegisterOrderDealLink(dealLink('D-1'));
        existingReview('Open');
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/until its review is approved/);
    });

    it('replaces a rejected review with a fresh one and refuses', async () => {
        existingReview('Completed', { outcome: OUTCOME_REJECTED, by: PERSON(REVIEWER_1) });
        const refusal = await CheckOrderReviewAtConfirm(order(), ctx);
        expect(refusal).toMatch(/its last review was decided 'Rejected'\. It was sent for review/);
        expect(reviewTasks()).toHaveLength(2);
    });

    it('does not take an approval recorded by someone the review was not assigned to', async () => {
        existingReview('Completed', { outcome: OUTCOME_APPROVED, by: PERSON(CFO) });
        expect(await CheckOrderReviewAtConfirm(order(), ctx)).toMatch(/approved by someone it was not assigned to/);
        expect(reviewTasks()).toHaveLength(2);
    });
});

// ─── The change hook ────────────────────────────────────────────────────────────────────────────

describe('CheckOrderReviewOnChange', () => {
    const billToChange = { ...NO_CHANGE, HeaderFieldsChanged: ['BillToOrganizationID'] };
    const priceChange = { ...NO_CHANGE, LinesChanged: [{ LineNumber: 1, Fields: ['UnitPrice'], RenewsSubscriptionID: null }] };

    it('does nothing while review is off', async () => {
        settings({ OrderReviewTriggers: '' });
        expect(await CheckOrderReviewOnChange(order(), billToChange, ctx)).toBeNull();
        expect(RunView.prototype.RunView).not.toHaveBeenCalled();
    });

    it('sends a deal-created order to review when its bill-to changes', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        RegisterOrderDealLink(dealLink('D-1'));
        expect(await CheckOrderReviewOnChange(order(), billToChange, ctx)).toBeNull();
        expect(reviewTasks()[0].Description).toContain('the bill-to organization changed on an order deal D-1 created');
    });

    it('leaves a direct order with no review alone: NoDeal decides it at confirm', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        expect(await CheckOrderReviewOnChange(order(), billToChange, ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(0);
    });

    it('sends an approved order back to review when a price changes', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        existingReview('Completed', { outcome: OUTCOME_APPROVED, by: PERSON(REVIEWER_1) });
        expect(await CheckOrderReviewOnChange(order(), priceChange, ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(2);
        expect(reviewTasks()[1].Description).toContain("line 1's price changed after the order was reviewed");
    });

    it('notes a change on an open review instead of raising a second', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        const open = existingReview('Open');
        expect(await CheckOrderReviewOnChange(order(), priceChange, ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(1);
        expect(tables['MJ_BizApps_Tasks: Task Activities']).toContainEqual(
            expect.objectContaining({ TaskID: open, Description: expect.stringContaining("line 1's price changed") }),
        );
    });

    it('ignores a change that touches nothing reviewed, and an order outside review', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        RegisterOrderDealLink(dealLink('D-1'));
        expect(await CheckOrderReviewOnChange(order(), { ...NO_CHANGE, HeaderFieldsChanged: ['Notes'] }, ctx)).toBeNull();
        expect(await CheckOrderReviewOnChange(order({ Origin: 'CheckoutWidget' }), billToChange, ctx)).toBeNull();
        expect(reviewTasks()).toHaveLength(0);
    });

    it('sends a renewal to review when its carried-forward price is edited', async () => {
        settings({ OrderReviewTriggers: 'PriceVariance' });
        const renewal = order({ Lines: [reviewLine({ RenewsSubscriptionID: 'sub-1' })] });
        const edit = { ...NO_CHANGE, LinesChanged: [{ LineNumber: 1, Fields: ['UnitPrice'], RenewsSubscriptionID: 'sub-1' }] };
        expect(await CheckOrderReviewOnChange(renewal, edit, ctx)).toBeNull();
        expect(reviewTasks()[0].Description).toContain("carried-forward renewal price was edited");
        // ...and once it has a review, the renewal's confirm waits for it.
        expect(await CheckOrderReviewAtConfirm(renewal, ctx)).toMatch(/until its review is approved/);
    });

    it('refuses the save, saying why, when the review it needs cannot be raised', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        RegisterOrderDealLink(dealLink('D-1'));
        people.byUser = new Map();
        expect(await CheckOrderReviewOnChange(order(), billToChange, ctx)).toMatch(/was not saved: this change needs an order review.*active Person/);
    });

    it('does nothing for an order not yet saved', async () => {
        settings({ OrderReviewTriggers: 'ChangedAfterDealOrReview' });
        expect(await CheckOrderReviewOnChange(order({ OrderHeaderID: null }), billToChange, ctx)).toBeNull();
    });
});

// ─── The settings ───────────────────────────────────────────────────────────────────────────────

describe('OrdersSettings.OrderReview', () => {
    it('is off and neutral with nothing set', () => {
        settings({ OrderReviewerRole: '', OrderReviewEscalationRole: '' });
        expect(OrdersSettings.OrderReview).toEqual({
            Triggers: [],
            TotalThreshold: null,
            MaxMonthsToServiceStart: 13,
            MaxLineServiceMonths: 12,
            ReviewerRole: null,
            EscalationRole: null,
        });
    });

    it('reads the values a host sets', () => {
        settings({
            OrderReviewTriggers: 'NoDeal, PriceVariance, ChangedAfterDealOrReview, OverThreshold, ServicePeriod',
            OrderReviewTotalThreshold: '25,000.00',
            OrderReviewServiceStartMonths: '18',
            OrderReviewLineTermMonths: '24',
        });
        expect(OrdersSettings.OrderReview).toMatchObject({
            Triggers: ['NoDeal', 'PriceVariance', 'ChangedAfterDealOrReview', 'OverThreshold', 'ServicePeriod'],
            TotalThreshold: 25000,
            MaxMonthsToServiceStart: 18,
            MaxLineServiceMonths: 24,
            ReviewerRole: 'Senior Finance (AR)',
            EscalationRole: 'CFO',
        });
    });

    it('keeps the default for an unreadable month count and reads an unreadable threshold as unset', () => {
        settings({ OrderReviewServiceStartMonths: 'thirteen', OrderReviewLineTermMonths: '0', OrderReviewTotalThreshold: '$25k' });
        expect(OrdersSettings.OrderReview).toMatchObject({ MaxMonthsToServiceStart: 13, MaxLineServiceMonths: 12, TotalThreshold: null });
    });
});
