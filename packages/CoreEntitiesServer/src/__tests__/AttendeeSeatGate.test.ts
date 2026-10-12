/**
 * The confirm refuses an event seat without its attendee (#590), and checkout asks for one set of
 * attendee details per seat before anything is written.
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

const { CheckoutAttendeeShortfall, FindAttendeeShortfalls } = await import('../AttendeeSeatGate.js');
type GateLine = Parameters<typeof FindAttendeeShortfalls>[0][number];

const EVENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const WIDGET_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const PERSON_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const provider = {} as never;
const user = { ID: 'user-1' } as never;

type Row = Record<string, unknown>;

/** Answers each RunView by entity: event products requiring attendees, and attendee rows on disk. */
function database(events: Row[], attendees: Row[] = []) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Event Products') ? events : attendees,
    }));
}

function gateLine(overrides: Partial<GateLine> = {}): GateLine {
    return {
        ID: LINE_ID,
        IsSaved: false,
        LineNumber: 1,
        ProductID: EVENT_ID,
        Quantity: 1,
        ReversesOrderLineID: null,
        AttendeePersonID: PERSON_ID,
        ...overrides,
    };
}

const summit = { ID: EVENT_ID, Name: 'Annual Summit' };

beforeEach(() => {
    mockRunView.mockReset();
});

describe('FindAttendeeShortfalls', () => {
    it('asks only for events that require attendees, bypassing the cache', async () => {
        database([summit]);

        await FindAttendeeShortfalls([gateLine(), gateLine({ ProductID: WIDGET_ID })], provider, user);

        const params = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string; BypassCache: boolean };
        expect(params.EntityName).toBe('MJ_BizApps_Orders: Event Products');
        expect(params.ExtraFilter).toContain('RequiresAttendeeInfo = 1');
        expect(params.ExtraFilter).toContain(EVENT_ID);
        expect(params.ExtraFilter).toContain(WIDGET_ID);
        expect(params.BypassCache).toBe(true);
    });

    it('passes a seat whose attendee is in memory, without reading the disk', async () => {
        database([summit]);

        expect(await FindAttendeeShortfalls([gateLine()], provider, user)).toEqual([]);
        expect(mockRunView).toHaveBeenCalledTimes(1);
    });

    it('refuses five seats on one line', async () => {
        database([summit]);

        const problems = await FindAttendeeShortfalls([gateLine({ Quantity: 5 })], provider, user);

        expect(problems).toEqual([expect.stringMatching(/^Line 1 \(Annual Summit\) is for 5 seats/)]);
    });

    it('refuses an extension in memory with no Person', async () => {
        database([summit]);

        const problems = await FindAttendeeShortfalls([gateLine({ AttendeePersonID: null, IsSaved: true })], provider, user);

        expect(problems).toEqual([expect.stringMatching(/has no attendee/)]);
        expect(mockRunView).toHaveBeenCalledTimes(1);
    });

    it('reads the disk for a saved line with no extension in memory', async () => {
        database([summit], [{ ID: LINE_ID.toUpperCase() }]);

        const problems = await FindAttendeeShortfalls([gateLine({ AttendeePersonID: undefined, IsSaved: true })], provider, user);

        expect(problems).toEqual([]);
        const diskQuery = mockRunView.mock.calls[1][0] as { EntityName: string; ExtraFilter: string };
        expect(diskQuery.EntityName).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(diskQuery.ExtraFilter).toContain(LINE_ID);
    });

    it('refuses a saved line with no attendee in memory or on disk', async () => {
        database([summit], []);

        const problems = await FindAttendeeShortfalls([gateLine({ AttendeePersonID: undefined, IsSaved: true })], provider, user);

        expect(problems).toEqual([expect.stringMatching(/has no attendee/)]);
    });

    it('refuses an unsaved line with no extension', async () => {
        database([summit]);

        const problems = await FindAttendeeShortfalls([gateLine({ AttendeePersonID: undefined })], provider, user);

        expect(problems).toEqual([expect.stringMatching(/has no attendee/)]);
    });

    it('exempts a reversal line', async () => {
        database([summit]);

        const problems = await FindAttendeeShortfalls(
            [gateLine({ Quantity: -5, AttendeePersonID: undefined, ReversesOrderLineID: WIDGET_ID })],
            provider,
            user,
        );

        expect(problems).toEqual([]);
    });

    it('passes an order with no event requiring attendees', async () => {
        database([]);

        expect(await FindAttendeeShortfalls([gateLine({ Quantity: 5, AttendeePersonID: undefined })], provider, user)).toEqual([]);
    });

    it('throws when the event products cannot be read, rather than letting the seat through', async () => {
        mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'timeout' });

        await expect(FindAttendeeShortfalls([gateLine()], provider, user)).rejects.toThrow(/timeout/);
    });
});

describe('CheckoutAttendeeShortfall', () => {
    it('asks for each attendee when fewer sets than seats were given', async () => {
        database([summit]);

        expect(await CheckoutAttendeeShortfall(EVENT_ID, 3, 1, provider, user)).toBe(
            'Enter the attendee for each of the 3 tickets to Annual Summit (attendees were given for 1).',
        );
    });

    it('asks for the attendee of a single ticket given none', async () => {
        database([summit]);

        expect(await CheckoutAttendeeShortfall(EVENT_ID, 1, 0, provider, user)).toBe(
            'Enter the attendee for the ticket to Annual Summit (attendees were given for 0).',
        );
    });

    it('passes a matching count without reading anything', async () => {
        expect(await CheckoutAttendeeShortfall(EVENT_ID, 3, 3, provider, user)).toBeNull();
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('passes a product that does not require attendees', async () => {
        database([]);

        expect(await CheckoutAttendeeShortfall(WIDGET_ID, 3, 0, provider, user)).toBeNull();
    });
});
