/**
 * The confirm gate's payment timing check (5, bizapps-orders#1097): a new sale whose timing departs from due on
 * receipt at confirm needs an approved Timing concession recorded for the order as it stands.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});
vi.mock('../calendar-day.js', () => ({ CalendarDayOrToday: async () => new Date('2026-07-01T00:00:00Z') }));
vi.mock('../OrdersSettings.js', () => ({ OrdersSettings: { Load: vi.fn(), DelayedStartToleranceDays: 30 } }));

const { FindUnapprovedConcessions } = await import('../ConcessionGate.js');
const { DescribePaymentTiming, PaymentTimingFactsOf } = await import('../PaymentTiming.js');

const ORDER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NET30_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3309';
const provider = {} as never;
const user = { ID: 'user-1' } as never;
const RULE = { ID: 'timing-rule', Name: 'Payment timing', ApprovalRequiredRoleID: 'approver-role' };

type Row = Record<string, unknown>;

/** Answers each RunView by entity. Saved lines are read as none: the order's lines are held in memory. */
function database(opts: { rules: Row[]; concessions?: Row[]; schedule?: Row[] }) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => {
        const name = params.EntityName;
        const results = name.endsWith('Sales Rules')
            ? opts.rules
            : name.endsWith('Order Concessions')
              ? (opts.concessions ?? [])
              : name.endsWith('Payment Terms Types')
                ? [{ Name: 'Net 30', NetDays: 30 }]
                : name.endsWith('Order Header Payment Schedules')
                  ? (opts.schedule ?? [])
                  : [];
        return { Success: true, Results: results };
    });
}

/** A saved new-sale line at its engine price, held by the caller. */
const line = (start: string | null) => ({
    ID: null,
    LineNumber: 1,
    ParentOrderLineID: null,
    ReversesOrderLineID: null,
    ProductID: 'product-1',
    OrderHeaderID: ORDER_ID,
    Quantity: 1,
    UnitPrice: 0,
    ProductPriceID: null,
    PriceStated: false,
    ServicePeriodStart: start,
});

const gate = (lines: Row[], header = { PaymentTermsTypeID: NET30_ID as string | null }) =>
    FindUnapprovedConcessions(ORDER_ID, lines as never, true, provider, user, header);

beforeEach(() => {
    mockRunView.mockReset();
});

describe('the payment timing check', () => {
    it('is off while no PaymentTiming rule is active', async () => {
        database({ rules: [] });
        expect(await gate([line('2027-01-01')])).toEqual([]);
    });

    it('holds a new sale on Net terms with a delayed start', async () => {
        database({ rules: [RULE] });
        const [problem] = await gate([line('2027-01-01')]);
        expect(problem).toContain('its payment timing needs approval');
        expect(problem).toContain('more than 30 days after 2026-07-01');
        expect(problem).toContain('Net 30 (30 days)');
        expect(problem).toContain('no approved Timing concession is recorded');
    });

    it('passes an order due on receipt that starts within the tolerance', async () => {
        database({ rules: [RULE] });
        expect(await gate([line('2026-07-15')], { PaymentTermsTypeID: null })).toEqual([]);
    });

    it('passes an order whose approved Timing concession matches its facts', async () => {
        const facts = DescribePaymentTiming(PaymentTimingFactsOf([line('2027-01-01')], { Name: 'Net 30', NetDays: 30 }, []));
        database({ rules: [RULE], concessions: [{ Status: 'Approved', DeliveryForm: 'Timing', TimingFacts: facts, ComputedValue: 0 }] });
        expect(await gate([line('2027-01-01')])).toEqual([]);
    });

    it('holds an order whose approved Timing concession was for other dates', async () => {
        const facts = DescribePaymentTiming(PaymentTimingFactsOf([line('2026-12-01')], { Name: 'Net 30', NetDays: 30 }, []));
        database({ rules: [RULE], concessions: [{ Status: 'Approved', DeliveryForm: 'Timing', TimingFacts: facts, ComputedValue: 0 }] });
        const [problem] = await gate([line('2027-01-01')]);
        expect(problem).toContain('was for other dates or terms');
        expect(problem).toContain('Withdraw it and record a new one');
    });

    it('reports a Pending Timing concession once, as awaiting approval', async () => {
        database({
            rules: [RULE],
            concessions: [{ Status: 'Pending', DeliveryForm: 'Timing', ReasonCategory: 'Other', ComputedValue: 0 }],
        });
        const problems = await gate([line('2027-01-01')]);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('awaiting approval');
    });

    it('leaves an order of renewal lines alone', async () => {
        database({ rules: [RULE] });
        expect(await gate([{ ...line('2027-01-01'), RenewsSubscriptionID: 'sub-1' }])).toEqual([]);
    });

    it('refuses when two PaymentTiming rules are active', async () => {
        database({ rules: [RULE, { ...RULE, ID: 'other', Name: 'Other' }] });
        expect((await gate([line('2027-01-01')]))[0]).toContain("2 SalesRules of type 'PaymentTiming' are active");
    });
});
