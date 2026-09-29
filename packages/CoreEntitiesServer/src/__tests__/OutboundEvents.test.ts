/**
 * The outbound hook (#293): the consumer registry, recording an event with its deliveries, and the
 * dispatcher's claim, delivery, backoff and dead-lettering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';

const mocks = vi.hoisted(() => ({
    events: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation((p: { ExtraFilter: string }) => {
                const id = /ID = '([^']+)'/.exec(p.ExtraFilter)?.[1];
                return Promise.resolve({ Success: true, Results: mocks.events.filter((e) => e.ID === id) });
            });
        },
    };
});

import {
    DispatchOutboundDeliveries,
    NextOutboundAttempt,
    OrdersOutboundConsumer,
    OUTBOUND_DELIVERY_DEADLINE_MS,
    RecordOutboundEvent,
    RegisteredOutboundConsumers,
    type OutboundEventEnvelope,
    type OutboundEventType,
} from '../OutboundEvents.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

const deliver = { crm: vi.fn<(e: OutboundEventEnvelope) => Promise<void>>(), access: vi.fn<(e: OutboundEventEnvelope) => Promise<void>>() };

class CrmConsumer extends OrdersOutboundConsumer {
    public override get EventTypes(): ReadonlyArray<OutboundEventType> {
        return ['OrderConfirmed'];
    }
    public override Deliver(e: OutboundEventEnvelope): Promise<void> {
        return deliver.crm(e);
    }
}
class AccessConsumer extends OrdersOutboundConsumer {
    public override get GatesAccess(): boolean {
        return true;
    }
    public override Deliver(e: OutboundEventEnvelope): Promise<void> {
        return deliver.access(e);
    }
}

type Row = Record<string, unknown> & { Save: ReturnType<typeof vi.fn>; Load: ReturnType<typeof vi.fn>; NewRecord: () => void };

/** A provider whose entities are plain rows kept in memory. */
function fakeProvider(claimed: string[] = []) {
    const saved: Row[] = [];
    const deliveries = new Map<string, Row>();
    let n = 0;
    const provider = {
        sql: [] as string[],
        GetEntityObject: vi.fn().mockImplementation((entity: string) => {
            const row: Row = {
                ID: '',
                LatestResult: { CompleteMessage: '' },
                NewRecord() {
                    this.ID = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
                },
                Save: vi.fn().mockImplementation(function (this: Row) {
                    saved.push({ ...this, _entity: entity } as Row);
                    return Promise.resolve(true);
                }),
                Load: vi.fn().mockImplementation(function (this: Row, id: string) {
                    const found = deliveries.get(id);
                    if (!found) return Promise.resolve(false);
                    Object.assign(this, found, { Save: this.Save, Load: this.Load });
                    return Promise.resolve(true);
                }),
            };
            return Promise.resolve(row);
        }),
        ExecuteSQL: vi.fn().mockImplementation((sql: string) => {
            provider.sql.push(sql);
            return Promise.resolve(claimed.map((ID) => ({ ID })));
        }),
    };
    return { provider, saved, deliveries };
}

function register(entries: Array<{ Key: string | null; SubClass: unknown; Priority?: number }>) {
    return vi
        .spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations')
        .mockReturnValue(entries.map((e) => ({ BaseClass: OrdersOutboundConsumer, Priority: 0, ...e })) as never);
}

describe('outbound events', () => {
    let registrations: ReturnType<typeof register>;

    beforeEach(() => {
        deliver.crm.mockReset().mockResolvedValue();
        deliver.access.mockReset().mockResolvedValue();
        mocks.events = [];
        registrations = register([
            { Key: 'crm', SubClass: CrmConsumer },
            { Key: 'access', SubClass: AccessConsumer },
        ]);
    });

    afterEach(() => {
        registrations.mockRestore();
        vi.useRealTimers();
    });

    describe('RegisteredOutboundConsumers', () => {
        it('lists one consumer per key, the highest priority winning, and skips unkeyed and base registrations', () => {
            registrations.mockRestore();
            registrations = register([
                { Key: 'crm', SubClass: CrmConsumer, Priority: 0 },
                { Key: 'crm', SubClass: AccessConsumer, Priority: 5 },
                { Key: null, SubClass: CrmConsumer },
                { Key: 'base', SubClass: OrdersOutboundConsumer },
            ]);
            const list = RegisteredOutboundConsumers();
            expect(list.map((c) => c.Key)).toEqual(['crm']);
            expect(list[0].Consumer).toBeInstanceOf(AccessConsumer);
        });
    });

    describe('NextOutboundAttempt', () => {
        const now = new Date('2026-09-29T12:00:00Z');
        const deadline = new Date(now.getTime() + OUTBOUND_DELIVERY_DEADLINE_MS);

        it('backs off 1, 5, 15, 60 minutes, then every 4 hours', () => {
            const waits = [1, 2, 3, 4, 5, 6].map((a) => {
                const next = NextOutboundAttempt(a, now, deadline);
                return next.Status === 'Pending' ? (next.NextAttemptAt.getTime() - now.getTime()) / 60000 : null;
            });
            expect(waits).toEqual([1, 5, 15, 60, 240, 240]);
        });

        it('lands the last try on the deadline rather than past it', () => {
            const late = new Date(deadline.getTime() - 60000);
            expect(NextOutboundAttempt(6, late, deadline)).toEqual({ Status: 'Pending', NextAttemptAt: deadline });
        });

        it('dead-letters a failure at or after the deadline', () => {
            expect(NextOutboundAttempt(9, deadline, deadline)).toEqual({ Status: 'DeadLettered' });
        });
    });

    describe('RecordOutboundEvent', () => {
        it('writes the event and one delivery per consumer that wants its type', async () => {
            const { provider, saved } = fakeProvider();
            const id = await RecordOutboundEvent(
                { EventType: 'OrderConfirmed', OrderHeaderID: ORDER_ID, Payload: { OrderNumber: 'SO-1' } },
                provider as never,
                undefined
            );
            const event = saved.find((r) => r._entity === 'MJ_BizApps_Orders: Outbound Events');
            const deliveries = saved.filter((r) => r._entity === 'MJ_BizApps_Orders: Outbound Deliveries');
            expect(id).toBe(event?.ID);
            expect(event).toMatchObject({ EventType: 'OrderConfirmed', OrderHeaderID: ORDER_ID, PayloadJSON: '{"OrderNumber":"SO-1"}' });
            expect(deliveries.map((d) => [d.ConsumerKey, d.GatesAccess, d.Status, d.OutboundEventID])).toEqual([
                ['crm', false, 'Pending', id],
                ['access', true, 'Pending', id],
            ]);
        });

        it('creates deliveries only for consumers that want the event type', async () => {
            const { provider, saved } = fakeProvider();
            await RecordOutboundEvent({ EventType: 'GrantStatusChanged', OrderHeaderID: ORDER_ID, EntitlementGrantID: EVENT_ID, Payload: {} }, provider as never, undefined);
            expect(saved.filter((r) => r._entity === 'MJ_BizApps_Orders: Outbound Deliveries').map((d) => d.ConsumerKey)).toEqual(['access']);
        });

        it('records nothing when no consumer wants the event', async () => {
            registrations.mockReturnValue([]);
            const { provider, saved } = fakeProvider();
            expect(await RecordOutboundEvent({ EventType: 'OrderConfirmed', OrderHeaderID: ORDER_ID, Payload: {} }, provider as never, undefined)).toBeNull();
            expect(saved).toEqual([]);
        });

        it('throws when a row cannot be written, so the caller rolls back', async () => {
            const { provider } = fakeProvider();
            provider.GetEntityObject.mockImplementationOnce(() =>
                Promise.resolve({ NewRecord() {}, Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'disk full' } })
            );
            await expect(
                RecordOutboundEvent({ EventType: 'OrderConfirmed', OrderHeaderID: ORDER_ID, Payload: {} }, provider as never, undefined)
            ).rejects.toThrow('disk full');
        });
    });

    describe('DispatchOutboundDeliveries', () => {
        const DELIVERY_ID = '33333333-3333-4333-8333-333333333333';

        function setUp(consumerKey: string, overrides: Record<string, unknown> = {}) {
            const f = fakeProvider([DELIVERY_ID]);
            f.deliveries.set(DELIVERY_ID, {
                ID: DELIVERY_ID,
                OutboundEventID: EVENT_ID,
                ConsumerKey: consumerKey,
                Status: 'Pending',
                Attempts: 0,
                DeadlineAt: new Date(Date.now() + OUTBOUND_DELIVERY_DEADLINE_MS),
                LatestResult: { CompleteMessage: '' },
                ...overrides,
            } as unknown as Row);
            mocks.events = [
                {
                    ID: EVENT_ID,
                    EventType: 'OrderConfirmed',
                    OccurredAt: new Date('2026-09-29T12:00:00Z'),
                    OrderHeaderID: ORDER_ID,
                    EntitlementGrantID: null,
                    PayloadJSON: '{"OrderNumber":"SO-1"}',
                },
            ];
            return f;
        }
        const lastSave = (saved: Row[]) => saved[saved.length - 1];

        it('claims due rows in one statement under a lease', async () => {
            const { provider } = setUp('crm');
            await DispatchOutboundDeliveries({}, provider as never, undefined);
            expect(provider.sql[0]).toMatch(/UPDATE TOP \(50\) d\s+SET d\.LeaseUntil/);
            expect(provider.sql[0]).toMatch(/d\.Status = 'Pending'/);
            expect(provider.sql[0]).toMatch(/d\.LeaseUntil IS NULL OR d\.LeaseUntil < SYSDATETIMEOFFSET\(\)/);
        });

        it('delivers the envelope and records Delivered', async () => {
            const { provider, saved } = setUp('crm');
            const out = await DispatchOutboundDeliveries({}, provider as never, undefined);
            expect(deliver.crm).toHaveBeenCalledWith({
                EventID: EVENT_ID,
                EventType: 'OrderConfirmed',
                OccurredAt: '2026-09-29T12:00:00.000Z',
                OrderHeaderID: ORDER_ID,
                EntitlementGrantID: null,
                Payload: { OrderNumber: 'SO-1' },
            });
            expect(out).toMatchObject({ Success: true, Claimed: 1, Delivered: 1 });
            expect(lastSave(saved)).toMatchObject({ Status: 'Delivered', Attempts: 1, LeaseUntil: null, LastError: null });
            expect(lastSave(saved).DeliveredAt).toBeInstanceOf(Date);
        });

        it('schedules a retry when the consumer throws', async () => {
            deliver.crm.mockRejectedValue(new Error('CRM is down'));
            const { provider, saved } = setUp('crm');
            const out = await DispatchOutboundDeliveries({}, provider as never, undefined);
            expect(out).toMatchObject({ Retrying: 1, Delivered: 0 });
            expect(lastSave(saved)).toMatchObject({ Status: 'Pending', Attempts: 1, LastError: 'CRM is down', LeaseUntil: null });
            expect((lastSave(saved).NextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
        });

        it('dead-letters a failure past the deadline', async () => {
            deliver.crm.mockRejectedValue(new Error('still down'));
            const { provider, saved } = setUp('crm', { Attempts: 8, DeadlineAt: new Date(Date.now() - 1000) });
            const out = await DispatchOutboundDeliveries({}, provider as never, undefined);
            expect(out.DeadLettered).toBe(1);
            expect(lastSave(saved)).toMatchObject({ Status: 'DeadLettered', Attempts: 9 });
        });

        it('fails a row whose consumer is no longer registered, and keeps retrying it', async () => {
            const { provider, saved } = setUp('gone');
            await DispatchOutboundDeliveries({}, provider as never, undefined);
            expect(lastSave(saved)).toMatchObject({ Status: 'Pending', LastError: "No consumer is registered under 'gone'." });
        });

        it('limits a kick to one order, and refuses an order id that is not a UUID', async () => {
            const { provider } = setUp('crm');
            await DispatchOutboundDeliveries({ OrderHeaderID: ORDER_ID, MaxCount: 5 }, provider as never, undefined);
            expect(provider.sql[0]).toContain(`e.OrderHeaderID = '${ORDER_ID}'`);
            expect(provider.sql[0]).toContain('UPDATE TOP (5)');
            await expect(DispatchOutboundDeliveries({ OrderHeaderID: "x' OR 1=1 --" }, provider as never, undefined)).rejects.toThrow('UUID');
        });

        it('does nothing when no row is due', async () => {
            const { provider } = fakeProvider([]);
            expect(await DispatchOutboundDeliveries({}, provider as never, undefined)).toEqual({
                Success: true,
                Claimed: 0,
                Delivered: 0,
                Retrying: 0,
                DeadLettered: 0,
            });
        });
    });
});
