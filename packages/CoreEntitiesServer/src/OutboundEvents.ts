/**
 * @fileoverview The outbound hook (#293): tell registered consumers when an order confirms or an
 * entitlement grant changes.
 *
 * TWO HALVES, ON EITHER SIDE OF THE COMMIT.
 *   1. RECORD — inside the transaction that made the change. `RecordOutboundEvent` writes the event
 *      and one delivery row per registered consumer through the same provider, so the event exists
 *      exactly when the change committed: a rolled-back confirm leaves no event, and a committed one
 *      cannot lose it. Nothing is sent here.
 *   2. DISPATCH — after the commit, never inside a booking. `DispatchOutboundDeliveries` claims due
 *      Pending rows with an atomic lease, calls each consumer, and records Delivered, or backs off
 *      and tries again until the row's deadline, when it is DeadLettered.
 *
 * Delivery is at least once: a consumer can see the same event twice (a lease that ran out while it
 * was still working, a crash between its success and our write). The event id is stable, so a
 * consumer dedupes on it.
 *
 * With no consumer registered for an event type, nothing is recorded, and Orders behaves as before.
 */
import { LogError, RunView, UserInfo, type EntitySaveOptions, type IMetadataProvider, type IRunViewProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { mjBizAppsOrdersOutboundDeliveryEntity, mjBizAppsOrdersOutboundEventEntity } from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

export const OUTBOUND_EVENT_ENTITY = 'MJ_BizApps_Orders: Outbound Events';
export const OUTBOUND_DELIVERY_ENTITY = 'MJ_BizApps_Orders: Outbound Deliveries';

export type OutboundEventType = 'OrderConfirmed' | 'GrantStatusChanged';

/** How long a delivery is retried before it is dead-lettered. */
export const OUTBOUND_DELIVERY_DEADLINE_MS = 24 * 60 * 60 * 1000;
/** Minutes to wait after the 1st, 2nd, 3rd … failed attempt; the last value repeats. */
export const OUTBOUND_RETRY_MINUTES: ReadonlyArray<number> = [1, 5, 15, 60, 240];
/** How long a pass holds a claimed row before another pass may take it. */
export const OUTBOUND_LEASE_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 2000;

/** What a consumer receives. `EventID` is stable across retries and is what a consumer dedupes on. */
export interface OutboundEventEnvelope {
    EventID: string;
    EventType: OutboundEventType;
    OccurredAt: string;
    OrderHeaderID: string | null;
    EntitlementGrantID: string | null;
    Payload: Record<string, unknown>;
}

/**
 * A consumer. Register a subclass with `@RegisterClass(OrdersOutboundConsumer, '<consumer-key>')`
 * and reference its class from the server bootstrap so the decorator is not tree-shaken away. The
 * key is recorded on each delivery row; for one key, the highest-priority registration wins.
 *
 * `Deliver` resolves when the consumer has accepted the event and throws when it has not; a throw is
 * retried. It may be called more than once for the same `EventID`.
 */
export class OrdersOutboundConsumer {
    /** The event types this consumer wants. Deliveries are created only for these. */
    public get EventTypes(): ReadonlyArray<OutboundEventType> {
        return ['OrderConfirmed', 'GrantStatusChanged'];
    }

    /** True when this consumer's delivery decides whether a buyer's access is ready. */
    public get GatesAccess(): boolean {
        return false;
    }

    public async Deliver(_event: OutboundEventEnvelope): Promise<void> {
        throw new Error(`${this.constructor.name} does not implement Deliver.`);
    }
}

/** Every registered consumer, one per key — the highest-priority registration for that key. */
export function RegisteredOutboundConsumers(): Array<{ Key: string; Consumer: OrdersOutboundConsumer }> {
    const best = new Map<string, { Priority: number; SubClass: new () => OrdersOutboundConsumer }>();
    for (const reg of MJGlobal.Instance.ClassFactory.GetAllRegistrations(OrdersOutboundConsumer)) {
        const key = typeof reg.Key === 'string' ? reg.Key.trim() : '';
        if (!key || reg.SubClass === OrdersOutboundConsumer) continue;
        const held = best.get(key);
        if (!held || reg.Priority > held.Priority) best.set(key, { Priority: reg.Priority, SubClass: reg.SubClass });
    }
    return [...best.entries()].map(([Key, r]) => ({ Key, Consumer: new r.SubClass() }));
}

/** True when at least one registered consumer wants this event type. */
export function HasOutboundConsumers(eventType: OutboundEventType): boolean {
    return RegisteredOutboundConsumers().some((c) => c.Consumer.EventTypes.includes(eventType));
}

/**
 * When a failed attempt should be tried again, or that it should stop.
 *
 * @param attemptsSoFar attempts including the one that just failed
 */
export function NextOutboundAttempt(
    attemptsSoFar: number,
    now: Date,
    deadline: Date
): { Status: 'Pending'; NextAttemptAt: Date } | { Status: 'DeadLettered' } {
    const minutes = OUTBOUND_RETRY_MINUTES[Math.min(Math.max(attemptsSoFar, 1), OUTBOUND_RETRY_MINUTES.length) - 1];
    const next = new Date(now.getTime() + minutes * 60 * 1000);
    if (now.getTime() >= deadline.getTime()) return { Status: 'DeadLettered' };
    // The last try lands on the deadline rather than skipping past it.
    return { Status: 'Pending', NextAttemptAt: next.getTime() > deadline.getTime() ? deadline : next };
}

export interface RecordOutboundEventInput {
    EventType: OutboundEventType;
    OrderHeaderID: string | null;
    EntitlementGrantID?: string | null;
    Payload: Record<string, unknown>;
}

/**
 * Write the event and its deliveries through `provider`, which must be the provider of the
 * transaction that made the change. Throws when the rows cannot be written, so the caller's
 * transaction rolls back rather than committing a change no consumer will hear about.
 *
 * @returns the event id, or null when no consumer wants this event type.
 */
export async function RecordOutboundEvent(
    input: RecordOutboundEventInput,
    provider: IMetadataProvider,
    user: UserInfo | undefined,
    options?: EntitySaveOptions
): Promise<string | null> {
    const consumers = RegisteredOutboundConsumers().filter((c) => c.Consumer.EventTypes.includes(input.EventType));
    if (consumers.length === 0) return null;

    const event = await provider.GetEntityObject<mjBizAppsOrdersOutboundEventEntity>(OUTBOUND_EVENT_ENTITY, user);
    event.NewRecord();
    event.EventType = input.EventType;
    event.OrderHeaderID = input.OrderHeaderID;
    event.EntitlementGrantID = input.EntitlementGrantID ?? null;
    event.PayloadJSON = JSON.stringify(input.Payload);
    event.OccurredAt = new Date();
    if (!(await event.Save(options))) {
        throw new Error(`Could not record the ${input.EventType} outbound event: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const deadline = new Date(Date.now() + OUTBOUND_DELIVERY_DEADLINE_MS);
    for (const { Key, Consumer } of consumers) {
        const delivery = await provider.GetEntityObject<mjBizAppsOrdersOutboundDeliveryEntity>(OUTBOUND_DELIVERY_ENTITY, user);
        delivery.NewRecord();
        delivery.OutboundEventID = event.ID;
        delivery.ConsumerKey = Key;
        delivery.GatesAccess = Consumer.GatesAccess;
        delivery.Status = 'Pending';
        delivery.Attempts = 0;
        delivery.NextAttemptAt = new Date();
        delivery.DeadlineAt = deadline;
        if (!(await delivery.Save(options))) {
            throw new Error(`Could not record the outbound delivery for '${Key}': ${delivery.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
    return event.ID;
}

export interface DispatchOutboundInput {
    /** Only this order's deliveries — the checkout's post-commit kick. Omit for every due row. */
    OrderHeaderID?: string;
    /** Cap on rows claimed in one pass. Defaults to 50. */
    MaxCount?: number;
}

export interface DispatchOutboundOutput {
    Success: boolean;
    Message?: string;
    Claimed: number;
    Delivered: number;
    Retrying: number;
    DeadLettered: number;
}

interface ClaimedRow {
    ID: string;
}

/**
 * Deliver the due Pending rows. Never call this inside a booking transaction: it is the post-commit
 * half, and a consumer's latency or failure must not hold or undo a booking.
 */
export async function DispatchOutboundDeliveries(
    input: DispatchOutboundInput,
    provider: IMetadataProvider,
    user: UserInfo | undefined
): Promise<DispatchOutboundOutput> {
    const out: DispatchOutboundOutput = { Success: true, Claimed: 0, Delivered: 0, Retrying: 0, DeadLettered: 0 };
    const maxCount = Number.isInteger(input.MaxCount) && (input.MaxCount as number) > 0 ? (input.MaxCount as number) : 50;
    const orderFilter = input.OrderHeaderID
        ? `AND EXISTS (SELECT 1 FROM __mj_BizAppsOrders.OutboundEvent e WHERE e.ID = d.OutboundEventID AND e.OrderHeaderID = '${RequireUUID(input.OrderHeaderID, 'OrderHeaderID')}')`
        : '';

    // THE CLAIM IS ONE STATEMENT, so two passes (the minute job and a checkout's kick) can never
    // both take a row: whichever UPDATE runs second finds the lease already set. OUTPUT goes INTO a
    // table variable because the table carries CodeGen's update trigger, and SQL Server refuses a
    // bare OUTPUT on a table with triggers.
    const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
    const claimed = (await db.ExecuteSQL(`
        DECLARE @claimed TABLE (ID UNIQUEIDENTIFIER NOT NULL);
        UPDATE TOP (${maxCount}) d
           SET d.LeaseUntil = DATEADD(MILLISECOND, ${OUTBOUND_LEASE_MS}, SYSDATETIMEOFFSET())
        OUTPUT inserted.ID INTO @claimed (ID)
          FROM __mj_BizAppsOrders.OutboundDelivery d
         WHERE d.Status = 'Pending'
           AND d.NextAttemptAt <= SYSDATETIMEOFFSET()
           AND (d.LeaseUntil IS NULL OR d.LeaseUntil < SYSDATETIMEOFFSET())
           ${orderFilter};
        SELECT ID FROM @claimed;
    `)) as ClaimedRow[] | null;
    const rows = Array.isArray(claimed) ? claimed : [];
    out.Claimed = rows.length;
    if (!rows.length) return out;

    const consumers = new Map(RegisteredOutboundConsumers().map((c) => [c.Key, c.Consumer]));
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const events = new Map<string, mjBizAppsOrdersOutboundEventEntity>();

    for (const row of rows) {
        const delivery = await provider.GetEntityObject<mjBizAppsOrdersOutboundDeliveryEntity>(OUTBOUND_DELIVERY_ENTITY, user);
        if (!(await delivery.Load(row.ID))) continue;

        let event = events.get(delivery.OutboundEventID.toLowerCase());
        if (!event) {
            const found = await rv.RunView<mjBizAppsOrdersOutboundEventEntity>(
                { EntityName: OUTBOUND_EVENT_ENTITY, ExtraFilter: `ID = '${RequireUUID(delivery.OutboundEventID, 'OutboundEventID')}'`, ResultType: 'entity_object' },
                user
            );
            event = found?.Results?.[0];
            if (event) events.set(delivery.OutboundEventID.toLowerCase(), event);
        }

        const now = new Date();
        let failure: string | null = null;
        const consumer = consumers.get(delivery.ConsumerKey);
        if (!event) failure = 'The event this delivery belongs to could not be read.';
        else if (!consumer) failure = `No consumer is registered under '${delivery.ConsumerKey}'.`;
        else {
            try {
                await consumer.Deliver(EnvelopeFor(event));
            } catch (err) {
                failure = err instanceof Error ? err.message : String(err);
            }
        }

        delivery.Attempts = (delivery.Attempts ?? 0) + 1;
        delivery.LastAttemptAt = now;
        delivery.LeaseUntil = null;
        if (failure === null) {
            delivery.Status = 'Delivered';
            delivery.DeliveredAt = now;
            delivery.LastError = null;
            out.Delivered++;
        } else {
            delivery.LastError = failure.slice(0, MAX_ERROR_LENGTH);
            const next = NextOutboundAttempt(delivery.Attempts, now, new Date(delivery.DeadlineAt));
            if (next.Status === 'DeadLettered') {
                delivery.Status = 'DeadLettered';
                out.DeadLettered++;
            } else {
                delivery.NextAttemptAt = next.NextAttemptAt;
                out.Retrying++;
            }
        }
        if (!(await delivery.Save())) {
            out.Success = false;
            LogError(`[OutboundEvents] could not record the result of delivery ${delivery.ID}: ${delivery.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
    if (!out.Success) out.Message = 'Some delivery results could not be recorded; those rows are retried when their lease runs out.';
    return out;
}

/** The envelope a consumer receives for an event row. */
export function EnvelopeFor(event: mjBizAppsOrdersOutboundEventEntity): OutboundEventEnvelope {
    let payload: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(event.PayloadJSON) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
        payload = {};
    }
    return {
        EventID: event.ID,
        EventType: event.EventType as OutboundEventType,
        OccurredAt: new Date(event.OccurredAt).toISOString(),
        OrderHeaderID: event.OrderHeaderID ?? null,
        EntitlementGrantID: event.EntitlementGrantID ?? null,
        Payload: payload,
    };
}
