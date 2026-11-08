/**
 * An event whose product requires attendee information books one seat per line, each naming its
 * attendee, and checkout refuses to take payment for tickets without one each.
 *
 * The pure rules are tested directly. The order's use of them is tested through
 * `checkEventAttendees` with the reads mocked; `Object.create` matches the sibling order tests: it
 * holds the server entity without standing up metadata, with the generated accessors shadowed by
 * plain properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../AttendeeRequirement.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../AttendeeRequirement.js')>();
    return {
        ...actual,
        LoadProductsRequiringAttendees: vi.fn(async () => new Set<string>()),
        LoadLinesWithAttendee: vi.fn(async () => new Set<string>()),
    };
});

import { mjBizAppsOrdersEventOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { OrderEntityServer } from '../OrderEntityServer.js';
import {
    ExplainMissingAttendees,
    ExplainMissingCheckoutAttendees,
    LoadLinesWithAttendee,
    LoadProductsRequiringAttendees,
    type AttendeeLineFacts,
} from '../AttendeeRequirement.js';

const EVENT = 'E1C2D3E4-0000-4000-8000-000000000001';
const OPEN_EVENT = 'e1c2d3e4-0000-4000-8000-000000000002';
const WIDGET = 'a1c2d3e4-0000-4000-8000-000000000003';
const LINE_1 = 'B1C2D3E4-0000-4000-8000-000000000011';
const LINE_2 = 'b1c2d3e4-0000-4000-8000-000000000012';
const PERSON = 'c1c2d3e4-0000-4000-8000-000000000021';

const requiring = new Set([EVENT.toLowerCase()]);

function fact(overrides: Partial<AttendeeLineFacts>): AttendeeLineFacts {
    return { LineNumber: 1, ProductID: EVENT, Quantity: 1, Exempt: false, HasAttendee: true, ...overrides };
}

describe('ExplainMissingAttendees', () => {
    it('passes a seat-per-line order whose lines each name an attendee', () => {
        expect(ExplainMissingAttendees([fact({}), fact({ LineNumber: 2 })], requiring)).toEqual([]);
    });

    it('refuses a line selling several seats, whether or not it names one attendee', () => {
        const [message] = ExplainMissingAttendees([fact({ Quantity: 5, HasAttendee: false })], requiring);
        expect(message).toContain('Order line 1 sells 5 seats');
        expect(message).toContain('one line per attendee');
    });

    it('refuses a single seat with no attendee', () => {
        expect(ExplainMissingAttendees([fact({ HasAttendee: false })], requiring)).toEqual([
            'Order line 1 is for an event that requires attendee information and has no attendee.',
        ]);
    });

    it('reports every offending line', () => {
        const lines = [fact({ HasAttendee: false }), fact({ LineNumber: 2, Quantity: 3 })];
        expect(ExplainMissingAttendees(lines, requiring)).toHaveLength(2);
    });

    it('ignores events that do not require attendees and products that are not events', () => {
        const lines = [fact({ ProductID: OPEN_EVENT, Quantity: 5, HasAttendee: false }), fact({ ProductID: WIDGET, HasAttendee: false })];
        expect(ExplainMissingAttendees(lines, requiring)).toEqual([]);
    });

    it('ignores reversals and bundle components', () => {
        expect(ExplainMissingAttendees([fact({ Exempt: true, Quantity: -1, HasAttendee: false })], requiring)).toEqual([]);
    });

    it('matches product ids regardless of case', () => {
        expect(ExplainMissingAttendees([fact({ ProductID: EVENT.toLowerCase(), HasAttendee: false })], requiring)).toHaveLength(1);
    });
});

describe('ExplainMissingCheckoutAttendees', () => {
    it('passes one attendee with an e-mail per ticket', () => {
        const lines = [{ ProductID: EVENT, Quantity: 2, AttendeeEmails: ['a@example.com', 'b@example.com'] }];
        expect(ExplainMissingCheckoutAttendees(lines, requiring)).toBeNull();
    });

    it('refuses fewer attendees than tickets', () => {
        const lines = [{ ProductID: EVENT, Quantity: 5, AttendeeEmails: ['a@example.com'] }];
        expect(ExplainMissingCheckoutAttendees(lines, requiring)).toContain('each of the 5 attendees');
    });

    it('refuses no attendee at all', () => {
        const lines = [{ ProductID: EVENT, Quantity: 1, AttendeeEmails: [] }];
        expect(ExplainMissingCheckoutAttendees(lines, requiring)).toContain("attendee's name and e-mail");
    });

    it('refuses an attendee with a blank e-mail', () => {
        const lines = [{ ProductID: EVENT, Quantity: 2, AttendeeEmails: ['a@example.com', '  '] }];
        expect(ExplainMissingCheckoutAttendees(lines, requiring)).not.toBeNull();
    });

    it('ignores products that do not require attendees', () => {
        const lines = [{ ProductID: WIDGET, Quantity: 3, AttendeeEmails: [] }];
        expect(ExplainMissingCheckoutAttendees(lines, requiring)).toBeNull();
    });
});

type AttendeeCheck = { checkEventAttendees(): Promise<string[]> };

type LineStub = {
    ID: string;
    IsSaved: boolean;
    LineNumber: number;
    ProductID: string;
    Quantity: number;
    ReversesOrderLineID: string | null;
    ParentOrderLineID: string | null;
    ISAChild: mjBizAppsOrdersEventOrderLineEntity | null;
};

function line(overrides: Partial<LineStub>): LineStub {
    return {
        ID: LINE_1,
        IsSaved: false,
        LineNumber: 1,
        ProductID: EVENT,
        Quantity: 1,
        ReversesOrderLineID: null,
        ParentOrderLineID: null,
        ISAChild: null,
        ...overrides,
    };
}

function eventRow(personID: string | null): mjBizAppsOrdersEventOrderLineEntity {
    const row = Object.create(mjBizAppsOrdersEventOrderLineEntity.prototype) as mjBizAppsOrdersEventOrderLineEntity;
    Object.defineProperty(row, 'PersonID', { value: personID });
    return row;
}

function order(booking: boolean, lines: LineStub[]): OrderEntityServer & AttendeeCheck {
    const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer & AttendeeCheck;
    for (const [k, v] of Object.entries({
        ContextCurrentUser: { ID: 'user-1' },
        ProviderToUse: {},
        Lines: { Items: lines, Count: lines.length },
    })) {
        Object.defineProperty(o, k, { value: v, writable: true });
    }
    Object.defineProperty(o, 'willBookOnThisSave', { value: () => booking });
    return o;
}

afterEach(() => {
    vi.mocked(LoadProductsRequiringAttendees).mockReset().mockResolvedValue(new Set());
    vi.mocked(LoadLinesWithAttendee).mockReset().mockResolvedValue(new Set());
});

describe('OrderEntityServer event attendee check', () => {
    it('does not read anything on a save that does not book', async () => {
        expect(await order(false, [line({ Quantity: 5 })]).checkEventAttendees()).toEqual([]);
        expect(LoadProductsRequiringAttendees).not.toHaveBeenCalled();
    });

    it('passes an order with no event requiring attendees, without reading attendees', async () => {
        expect(await order(true, [line({ Quantity: 5 })]).checkEventAttendees()).toEqual([]);
        expect(LoadLinesWithAttendee).not.toHaveBeenCalled();
    });

    it('refuses five seats on one line with no attendee rows', async () => {
        vi.mocked(LoadProductsRequiringAttendees).mockResolvedValue(new Set([EVENT.toLowerCase()]));
        const messages = await order(true, [line({ Quantity: 5 })]).checkEventAttendees();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('sells 5 seats');
    });

    it('takes the attendee from the event row held in memory', async () => {
        vi.mocked(LoadProductsRequiringAttendees).mockResolvedValue(new Set([EVENT.toLowerCase()]));
        const lines = [line({ ISAChild: eventRow(PERSON) }), line({ ID: LINE_2, LineNumber: 2, ISAChild: eventRow(null) })];
        expect(await order(true, lines).checkEventAttendees()).toEqual([
            'Order line 2 is for an event that requires attendee information and has no attendee.',
        ]);
        expect(vi.mocked(LoadLinesWithAttendee).mock.calls[0][0]).toEqual([]);
    });

    it('reads the attendee from disk for a saved line with no event row in memory', async () => {
        vi.mocked(LoadProductsRequiringAttendees).mockResolvedValue(new Set([EVENT.toLowerCase()]));
        vi.mocked(LoadLinesWithAttendee).mockResolvedValue(new Set([LINE_1.toLowerCase()]));
        const lines = [line({ IsSaved: true }), line({ ID: LINE_2, LineNumber: 2, IsSaved: true })];
        const messages = await order(true, lines).checkEventAttendees();
        expect(vi.mocked(LoadLinesWithAttendee).mock.calls[0][0]).toEqual([LINE_1, LINE_2]);
        expect(messages).toEqual(['Order line 2 is for an event that requires attendee information and has no attendee.']);
    });

    it('exempts reversal lines and bundle components', async () => {
        vi.mocked(LoadProductsRequiringAttendees).mockResolvedValue(new Set([EVENT.toLowerCase()]));
        const lines = [line({ Quantity: -1, ReversesOrderLineID: LINE_2 }), line({ ParentOrderLineID: LINE_2 })];
        expect(await order(true, lines).checkEventAttendees()).toEqual([]);
    });
});
