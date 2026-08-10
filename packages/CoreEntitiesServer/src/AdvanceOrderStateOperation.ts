/**
 * @fileoverview `Orders.AdvanceOrderState` — move a booked order up the status ladder.
 *
 * WHAT THIS IS FOR. Back-office entry of something that has ALREADY happened: a sale taken at a
 * counter, a shipment that went out before anyone opened the system, a migration from whatever came
 * before. The order needs to land in its final state without a human clicking through
 * Confirmed → Posted → Fulfilled (D17).
 *
 * WHAT IT REPLACED, AND WHY IT SHRANK. This was `Orders.CreateOrderInState`, which took an
 * `OrderDraft` — a hand-maintained mirror of the order entity — created the order by delegating to
 * `Orders.ConfirmOrder`, and only then advanced it. Both halves of that are gone: composing and
 * booking an order is now `order.Save()` through MJ's entity graph, which runs the identical booking
 * walk on the server subclass. What is left is the part a save cannot do, and that part is this file.
 *
 * WHY THE LADDER STILL NEEDS AN OPERATION. Advancing to Posted is a plain save. Advancing to
 * Fulfilled is not: the fulfillable LINES have to be marked first, and whether the order may move at
 * all depends on how many could not be. That is a decision over a set of rows, taken on the server,
 * with a caller-supplied override — a save on one header has nowhere to put it.
 *
 * NOTHING HERE BOOKS. Journal entries, subscriptions and entitlements are the confirm's business and
 * have already happened by the time this runs. This operation reads the ledger back only to REPORT
 * it, so a caller can tell "advanced an order that booked" from "advanced an order that did not".
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    type BlockerResult,
    type OrderStateTransition,
} from '@mj-biz-apps/orders-entities';

import { IsAwaitingFulfillment, type FulfillableLine } from './FulfillmentBehavior.js';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/** The status ladder, in the order an order climbs it. */
const LADDER = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'] as const;

/** Where this operation will take an order. Everything else is somebody else's job. */
const ACCEPTED_TARGETS = new Set(['Posted', 'Fulfilled']);

interface AdvanceOrderStateInput {
    OrderHeaderID: string;
    TargetStatus: string;
    ForceFulfillment?: boolean;
    Reason?: string | null;
}

interface AdvanceOrderStateOutput {
    Success: boolean;
    Message?: string | null;
    OrderHeaderID: string | null;
    OrderNumber: string | null;
    Status: string | null;
    RequestedStatus: string;
    Transitions: OrderStateTransition[];
    EntryCount: number;
    AllBalanced: boolean;
    UnfulfilledLineCount: number;
    Blockers: BlockerResult[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.AdvanceOrderState')
export class AdvanceOrderStateOperation extends BaseRemotableOperation<
    AdvanceOrderStateInput,
    AdvanceOrderStateOutput
> {
    public OperationKey = 'Orders.AdvanceOrderState';

    protected async InternalExecute(
        input: AdvanceOrderStateInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AdvanceOrderStateOutput> {
        const target = (input?.TargetStatus ?? '').trim();

        if (!ACCEPTED_TARGETS.has(target)) {
            return this.refuse(target, [
                this.blocker(
                    'UNSUPPORTED_TARGET',
                    `'${target || '(none)'}' is not a state this operation advances to. Use Posted or Fulfilled.`,
                    target === 'Draft' || target === 'Quoted' || target === 'Confirmed'
                        ? 'Those states are reached by saving the order itself — set Status and call Save(). ' +
                          'Confirmed runs the booking walk on the way through, which is where it belongs.'
                        : 'Voiding is a separate decision about an existing order, not a rung on the ladder.',
                ),
            ]);
        }

        if (!input?.OrderHeaderID) {
            return this.refuse(target, [this.blocker('NO_ORDER', 'An OrderHeaderID is required.')]);
        }
        // Reaches SQL filter text below.
        RequireUUID(input.OrderHeaderID, 'OrderHeaderID');

        const header = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await header.Load(input.OrderHeaderID))) {
            return this.refuse(target, [
                this.blocker('NOT_FOUND', `Order ${input.OrderHeaderID} could not be loaded.`),
            ]);
        }

        const orderID = header.ID;
        let status = header.Status ?? 'Draft';
        const transitions: OrderStateTransition[] = [];
        let unfulfilled = 0;

        // AN ORDER THAT HAS NOT BOOKED CANNOT BE ADVANCED. The ladder above Confirmed presumes the
        // confirm already ran — the journal entries, the subscriptions, the entitlements. Advancing a
        // Draft from here would produce an order that reads Fulfilled with no ledger behind it, which
        // is exactly the failure nothing downstream can detect: it reconciles against itself, and the
        // money simply never existed (D17).
        if (LADDER.indexOf(status as never) < LADDER.indexOf('Confirmed')) {
            return this.refuse(
                target,
                [
                    this.blocker(
                        'NOT_CONFIRMED',
                        `The order is ${status}. Only a Confirmed order can be advanced.`,
                        'Set Status to Confirmed and save the order — that runs the booking walk. Then advance it.',
                    ),
                ],
                orderID,
                header.OrderNumber,
                status,
            );
        }

        if (LADDER.indexOf(target as never) <= LADDER.indexOf(status as never)) {
            // Already there, or beyond. Reporting success is honest: the caller asked for a state and
            // the order is in it. Reporting a failure would make a re-run of an interrupted migration
            // look like a broken one.
            return {
                Success: true,
                Message: `The order is already ${status}.`,
                OrderHeaderID: orderID,
                OrderNumber: header.OrderNumber ?? null,
                Status: status,
                RequestedStatus: target,
                Transitions: [],
                ...(await this.readBookedEntries(orderID, provider)),
                UnfulfilledLineCount: 0,
                Blockers: [],
            };
        }

        const rv = new RunView(provider as unknown as IRunViewProvider);

        if (LADDER.indexOf(target as never) >= LADDER.indexOf('Posted') && status === 'Confirmed') {
            const moved = await this.setStatus(header, 'Posted', input?.Reason);
            transitions.push({ From: status, To: 'Posted', Applied: moved.ok, Reason: moved.reason });
            if (!moved.ok) return this.stopped(orderID, header, target, status, transitions, unfulfilled, provider);
            status = 'Posted';
        }

        if (target === 'Fulfilled') {
            // Mark the fulfillable lines FIRST. An order that reads Fulfilled while its lines read
            // Pending is a promise the system claims to have kept and has no record of — the queue
            // would keep offering them, and the order would never appear in it.
            unfulfilled = await this.fulfillLines(orderID, rv, provider, user);

            if (unfulfilled > 0 && !input?.ForceFulfillment) {
                transitions.push({
                    From: status,
                    To: 'Fulfilled',
                    Applied: false,
                    Reason:
                        `${unfulfilled} fulfillable line(s) could not be marked Fulfilled. The order is ` +
                        `Posted and sits in the fulfilment queue. Set ForceFulfillment to advance anyway.`,
                });
                return this.stopped(orderID, header, target, status, transitions, unfulfilled, provider);
            }

            const moved = await this.setStatus(header, 'Fulfilled', input?.Reason);
            transitions.push({
                From: status,
                To: 'Fulfilled',
                Applied: moved.ok,
                Reason:
                    moved.ok && unfulfilled > 0
                        ? `Forced with ${unfulfilled} line(s) still Pending.`
                        : moved.reason,
            });
            if (moved.ok) status = 'Fulfilled';
        }

        const booked = await this.readBookedEntries(orderID, provider);

        return {
            Success: status === target,
            Message:
                status === target ? undefined : `The order stopped at ${status} rather than ${target}.`,
            OrderHeaderID: orderID,
            OrderNumber: header.OrderNumber ?? null,
            Status: status,
            RequestedStatus: target,
            Transitions: transitions,
            EntryCount: booked.EntryCount,
            AllBalanced: booked.AllBalanced,
            UnfulfilledLineCount: unfulfilled,
            Blockers: [],
        };
    }

    /**
     * What booked against this order's lines, read back rather than assumed.
     *
     * The confirm happened on a different call — possibly on a different day, for a migration — so
     * this operation has no first-hand knowledge of it. Reporting zero entries because nobody looked
     * is indistinguishable from an order that never booked, and this whole file exists to keep those
     * two apart.
     */
    private async readBookedEntries(
        orderID: string,
        provider: IMetadataProvider,
    ): Promise<{ EntryCount: number; AllBalanced: boolean }> {
        const rows =
            (await (
                provider as unknown as {
                    ExecuteSQL(sql: string): Promise<Array<{ EntryID: string; D: number; C: number }>>;
                }
            ).ExecuteSQL(`
              SELECT je.ID AS EntryID,
                     SUM(ISNULL(jel.DebitAmount, 0)) AS D,
                     SUM(ISNULL(jel.CreditAmount, 0)) AS C
                FROM __mj_BizAppsAccounting.JournalEntry je
                JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = je.ID
               WHERE je.LinkedRecordID IN (
                     SELECT CAST(ol.ID AS NVARCHAR(400)) FROM __mj_BizAppsOrders.OrderLine ol
                      WHERE ol.OrderHeaderID = '${orderID}')
               GROUP BY je.ID`)) ?? [];

        return {
            EntryCount: rows.length,
            AllBalanced: rows.every((r) => Math.abs(Number(r.D) - Number(r.C)) < 0.005),
        };
    }

    /** Move the header, reporting a refusal rather than throwing — a stalled advance is still a result. */
    private async setStatus(
        header: mjBizAppsOrdersOrderHeaderEntity,
        // Derived from the entity: `Status` is CHECK-constrained, so CodeGen owns this union and it
        // widens with the constraint. Restating it here would freeze it at today's six values.
        status: mjBizAppsOrdersOrderHeaderEntity['Status'],
        reason: string | null | undefined,
    ): Promise<{ ok: boolean; reason: string | null }> {
        header.Status = status;
        if (reason) {
            const existing = header.Description ?? '';
            header.Description = existing ? `${existing} — ${reason}` : reason;
        }
        if (!(await header.Save())) {
            return { ok: false, reason: header.LatestResult?.CompleteMessage ?? 'no reason given' };
        }
        return { ok: true, reason: null };
    }

    /**
     * Mark every line that is awaiting fulfilment, and report how many would not go.
     *
     * The three lookups are per-order rather than per-line on purpose: a migration advances orders in
     * bulk, and a per-line product/type round trip turns a hundred-line order into three hundred
     * queries.
     */
    private async fulfillLines(
        orderID: string,
        rv: RunView,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<number> {
        const lines = await rv.RunView<{
            ID: string;
            ProductID: string;
            FulfillmentStatus: string | null;
            ReversesOrderLineID: string | null;
            IsRollupParent: boolean;
        }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${orderID}'`, ResultType: 'simple' },
            user,
        );
        const rows = lines.Results ?? [];
        if (!rows.length) return 0;

        const products = await rv.RunView<{ ID: string; ProductTypeID: string }>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID IN (${quote(rows.map((l) => l.ProductID))})`,
                ResultType: 'simple',
            },
            user,
        );
        const typeIDs = [...new Set((products.Results ?? []).map((p) => p.ProductTypeID))].filter(Boolean);
        const types = typeIDs.length
            ? await rv.RunView<{ ID: string; RequiresFulfillment: boolean }>(
                  { EntityName: PRODUCT_TYPE_ENTITY, ExtraFilter: `ID IN (${quote(typeIDs)})`, ResultType: 'simple' },
                  user,
              )
            : { Results: [] };
        const requiresByType = new Map((types.Results ?? []).map((t) => [key(t.ID), !!t.RequiresFulfillment]));
        const typeByProduct = new Map((products.Results ?? []).map((p) => [key(p.ID), key(p.ProductTypeID)]));

        let remaining = 0;
        for (const row of rows) {
            const shaped: FulfillableLine = {
                ID: row.ID,
                RequiresFulfillment: requiresByType.get(typeByProduct.get(key(row.ProductID)) ?? '') ?? false,
                FulfillmentStatus: (row.FulfillmentStatus as FulfillableLine['FulfillmentStatus']) ?? null,
                ReversesOrderLineID: row.ReversesOrderLineID,
                IsRollupParent: !!row.IsRollupParent,
            };
            if (!IsAwaitingFulfillment(shaped)) continue;

            const entity = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
            if (!(await entity.Load(row.ID))) {
                remaining++;
                continue;
            }
            entity.FulfillmentStatus = 'Fulfilled';
            if (!(await entity.Save())) remaining++;
        }
        return remaining;
    }

    /** The order is booked and moved as far as it could, but not as far as asked. */
    private async stopped(
        orderID: string,
        header: mjBizAppsOrdersOrderHeaderEntity,
        target: string,
        status: string,
        transitions: OrderStateTransition[],
        unfulfilled: number,
        provider: IMetadataProvider,
    ): Promise<AdvanceOrderStateOutput> {
        return {
            Success: false,
            Message: `The order stopped at ${status} rather than ${target}.`,
            OrderHeaderID: orderID,
            OrderNumber: header.OrderNumber ?? null,
            Status: status,
            RequestedStatus: target,
            Transitions: transitions,
            ...(await this.readBookedEntries(orderID, provider)),
            UnfulfilledLineCount: unfulfilled,
            Blockers: [],
        };
    }

    private blocker(code: string, message: string, hint?: string): BlockerResult {
        return { Code: code, Message: message, ResolutionHint: hint ?? null, LineNumber: null };
    }

    private refuse(
        target: string,
        blockers: BlockerResult[],
        orderID: string | null = null,
        orderNumber: string | null = null,
        status: string | null = null,
    ): AdvanceOrderStateOutput {
        return {
            Success: false,
            Message: blockers.map((b) => b.Message).join(' '),
            OrderHeaderID: orderID,
            OrderNumber: orderNumber,
            Status: status,
            RequestedStatus: target,
            Transitions: [],
            EntryCount: 0,
            AllBalanced: true,
            UnfulfilledLineCount: 0,
            Blockers: blockers,
        };
    }
}

/**
 * Force the class registration. Tree-shaking removes a class nobody imports, and the decorator only
 * runs if the module is loaded — so the server's bootstrap calls this.
 */
export function LoadAdvanceOrderStateOperation(): void {
    // no-op by design
}
