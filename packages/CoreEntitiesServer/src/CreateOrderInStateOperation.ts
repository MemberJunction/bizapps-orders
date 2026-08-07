/**
 * @fileoverview `Orders.CreateOrderInState` — land an order in its final state, having really got there.
 *
 * WHAT THIS IS FOR (D17). Back-office entry of something that has ALREADY happened: a counter sale,
 * a shipment that went out before anyone opened the system, a migration from whatever came before.
 * The order has to arrive in its final state without a human clicking through four transitions.
 *
 * WHAT IT IS EMPHATICALLY NOT. A shortcut past booking. It delegates to the REAL confirm —
 * `Orders.ConfirmOrder`, the same machinery, the same per-line journal entries, the same
 * subscription materialisation and entitlement grants — and only then advances the status.
 *
 * The tempting implementation is one UPDATE setting `Status = 'Fulfilled'`. It would be faster, it
 * would pass any test that checks the order's own fields, and it would produce an order that looks
 * complete with no ledger behind it. That is the failure nothing downstream can detect: the order
 * reconciles perfectly against itself, and the revenue simply never existed. So the confirm is not
 * optional here and there is no path around it.
 *
 * ADVANCING IS NOT BOOKING. Posted → Fulfilled fires no journal entry (D15); fulfilment is a
 * logistics fact. The only ledger event is the confirm, which has already happened by then.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    OrdersCreateOrderInStateOperation as OrdersCreateOrderInStateOperationBase,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    type BlockerResult,
    type OrderStateTransition,
    type OrdersCreateOrderInStateInput,
    type OrdersCreateOrderInStateOutput,
} from '@mj-biz-apps/orders-entities';

import { IsAwaitingFulfillment, type FulfillableLine } from './FulfillmentBehavior.js';

const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/**
 * The lifecycle, in order. Skipping forward is allowed; going back is not, and the effects of each
 * stage are enforced regardless of how it was reached (§stage order, D8/D9).
 */
const LADDER = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'] as const;

/** Where this operation will land an order. Everything else is somebody else's job. */
const ACCEPTED_TARGETS = new Set(['Confirmed', 'Posted', 'Fulfilled']);

@RegisterClass(BaseRemotableOperation, 'Orders.CreateOrderInState')
export class CreateOrderInStateOperation extends OrdersCreateOrderInStateOperationBase {
    protected async InternalExecute(
        input: OrdersCreateOrderInStateInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersCreateOrderInStateOutput> {
        const target = (input?.TargetStatus ?? '').trim();

        if (!ACCEPTED_TARGETS.has(target)) {
            return this.refuse(
                target,
                [
                    this.blocker(
                        'UNSUPPORTED_TARGET',
                        `'${target || '(none)'}' is not a state this operation creates into. ` +
                            `Use Confirmed, Posted or Fulfilled.`,
                        target === 'Draft' || target === 'Quoted'
                            ? 'A Draft or Quoted order is Orders.SaveOrder — routing it here would book an ' +
                              'order that is not meant to be locked yet.'
                            : 'Voiding is a decision about an existing order, not a state to create one in.',
                    ),
                ],
            );
        }

        if (!input?.Draft?.Header?.CompanyID) {
            return this.refuse(target, [
                this.blocker('NO_DRAFT', 'A draft with at least a CompanyID is required.'),
            ]);
        }

        const transitions: OrderStateTransition[] = [];

        // ── THE CONFIRM. Delegated, not reimplemented. ──
        // Everything this operation is for depends on the order really being booked, so it goes
        // through the same op the UI uses rather than a private copy that could drift from it.
        const confirmOp = MJGlobal.Instance.ClassFactory.CreateInstance<
            BaseRemotableOperation<Record<string, unknown>, Record<string, unknown>>
        >(BaseRemotableOperation, 'Orders.ConfirmOrder');
        if (!confirmOp) {
            return this.refuse(target, [
                this.blocker('CONFIRM_UNAVAILABLE', "'Orders.ConfirmOrder' is not registered."),
            ]);
        }

        const draft = { ...input.Draft } as Record<string, unknown>;
        if (input?.OrderDate) {
            // Back-dating is the NORMAL case here — this operation exists because the event preceded
            // the record — so the date belongs on the draft rather than being defaulted to today.
            (draft as { Header?: Record<string, unknown> }).Header = {
                ...((draft as { Header?: Record<string, unknown> }).Header ?? {}),
                OrderDate: input.OrderDate,
            };
        }

        // ExecuteServer, NOT Execute. `Execute`'s second argument is RemoteOpInvokeOptions and routes
        // through the provider's operation router — the client entry point. We are already inside a
        // server operation holding the provider and the acting user, so the in-process server entry
        // is the honest call. Routing instead handed the nested op a context whose provider never
        // arrived, and it surfaced as "Cannot read properties of null (reading 'NewRecord')" from
        // deep inside the hydrator, naming nothing useful.
        const confirmResult = await confirmOp.ExecuteServer(
            {
                Draft: draft,
                ...(input?.ExpectedGrossTotal != null ? { ExpectedGrossTotal: input.ExpectedGrossTotal } : {}),
            },
            // `emitProgress` is required by the context type. A no-op is right here: the confirm's
            // progress belongs to THIS operation's caller, and forwarding a nested op's steps as if
            // they were ours would report two overlapping progressions for one call.
            { provider, user, emitProgress: () => undefined },
        );
        if (!confirmResult.Success) {
            return this.refuse(target, [
                this.blocker('CONFIRM_FAILED', confirmResult.ErrorMessage ?? 'The confirm did not execute.'),
            ]);
        }

        const confirmed = confirmResult.Output as {
            Success: boolean;
            Message?: string;
            OrderHeaderID?: string;
            OrderNumber?: string;
            Status?: string;
            Totals?: unknown;
            JournalEntries?: unknown[];
            EntryCount?: number;
            AllBalanced?: boolean;
            Blockers?: BlockerResult[];
        };

        if (!confirmed.Success) {
            // The confirm's own blockers are the useful answer — an unresolvable GL account, a price
            // that moved — so they are passed through rather than replaced with a generic failure.
            return {
                Success: false,
                Message: confirmed.Message ?? 'The order could not be confirmed.',
                RequestedStatus: target,
                Status: confirmed.Status ?? null,
                OrderHeaderID: confirmed.OrderHeaderID ?? null,
                Transitions: [{ From: 'Draft', To: 'Confirmed', Applied: false, Reason: confirmed.Message ?? null }],
                Blockers: confirmed.Blockers ?? [],
                Totals: confirmed.Totals as never,
                JournalEntries: (confirmed.JournalEntries ?? []) as never,
                EntryCount: confirmed.EntryCount ?? 0,
                AllBalanced: confirmed.AllBalanced ?? true,
            };
        }

        transitions.push({ From: 'Draft', To: 'Confirmed', Applied: true, Reason: null });
        const orderID = confirmed.OrderHeaderID as string;

        // READ BACK WHAT BOOKED. Orders.ConfirmOrder does not report its journal entries, so passing
        // its output through would report zero entries on an order that booked perfectly — and this
        // operation's entire justification is that it books. An output claiming no entries is
        // indistinguishable from the status-only shortcut this exists to avoid, so it is verified
        // here rather than assumed.
        const booked = await this.readBookedEntries(orderID, provider, user);

        // ── ADVANCE. No further booking happens here. ──
        let status = confirmed.Status ?? 'Confirmed';
        let unfulfilled = 0;

        if (LADDER.indexOf(target as never) > LADDER.indexOf(status as never)) {
            const rv = new RunView(provider as unknown as IRunViewProvider);

            if (LADDER.indexOf(target as never) >= LADDER.indexOf('Posted')) {
                const moved = await this.setStatus(orderID, 'Posted', input?.Reason, provider, user);
                transitions.push({ From: status, To: 'Posted', Applied: moved.ok, Reason: moved.reason });
                if (!moved.ok) return this.stopped(orderID, confirmed, target, status, transitions, unfulfilled);
                status = 'Posted';
            }

            if (target === 'Fulfilled') {
                // Mark the fulfillable lines FIRST. An order that reads Fulfilled while its lines
                // read Pending is a promise the system claims to have kept and has no record of —
                // the queue would keep offering them, and the order would never appear in it.
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
                    return this.stopped(orderID, confirmed, target, status, transitions, unfulfilled);
                }

                const moved = await this.setStatus(orderID, 'Fulfilled', input?.Reason, provider, user);
                transitions.push({
                    From: status,
                    To: 'Fulfilled',
                    Applied: moved.ok,
                    Reason: moved.ok && unfulfilled > 0
                        ? `Forced with ${unfulfilled} line(s) still Pending.`
                        : moved.reason,
                });
                if (moved.ok) status = 'Fulfilled';
            }
        }

        return {
            Success: status === target,
            Message:
                status === target
                    ? undefined
                    : `The order was created but stopped at ${status} rather than ${target}.`,
            OrderHeaderID: orderID,
            OrderNumber: confirmed.OrderNumber ?? null,
            Status: status,
            RequestedStatus: target,
            Transitions: transitions,
            Totals: confirmed.Totals as never,
            JournalEntries: [] as never,
            EntryCount: booked.Count,
            AllBalanced: booked.AllBalanced,
            UnfulfilledLineCount: unfulfilled,
            Blockers: [],
        };
    }

    /**
     * How many entries this order's lines produced, and whether each foots.
     *
     * Counted from the ledger rather than reported by the confirm, because the confirm does not
     * report it. Balance is checked per entry: an operation that says "booked" while an entry does
     * not foot has told the caller the one thing they most needed to know was fine.
     */
    private async readBookedEntries(
        orderID: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Count: number; AllBalanced: boolean }> {
        const rows = (await (provider as unknown as {
            ExecuteSQL(sql: string): Promise<Array<{ EntryID: string; D: number; C: number }>>;
        }).ExecuteSQL(`
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
            Count: rows.length,
            AllBalanced: rows.every((r) => Math.abs(Number(r.D) - Number(r.C)) < 0.005),
        };
    }

    /** Move the header, reporting a refusal rather than throwing — a stalled advance is still a result. */
    private async setStatus(
        orderID: string,
        // Derived from the entity: `Status` is CHECK-constrained, so CodeGen owns this union and it
        // widens with the constraint. Restating it here would freeze it at today's six values.
        status: mjBizAppsOrdersOrderHeaderEntity['Status'],
        reason: string | null | undefined,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ ok: boolean; reason: string | null }> {
        const header = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await header.Load(orderID))) {
            return { ok: false, reason: `Order ${orderID} could not be loaded.` };
        }
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
     * Mark every fulfillable line Fulfilled; return how many could not be.
     *
     * Uses the same predicate the queue does, so a line this operation considers shippable is
     * exactly a line the queue would offer — otherwise an imported order could sit in the queue
     * forever, or vanish from it while still unshipped.
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

    /** The order exists and is booked, but did not reach the requested state. Not a failure of the create. */
    private stopped(
        orderID: string,
        confirmed: { OrderNumber?: string; Totals?: unknown; JournalEntries?: unknown[]; EntryCount?: number; AllBalanced?: boolean },
        target: string,
        status: string,
        transitions: OrderStateTransition[],
        unfulfilled: number,
    ): OrdersCreateOrderInStateOutput {
        return {
            Success: false,
            Message: `The order was created and booked, but stopped at ${status} rather than ${target}.`,
            OrderHeaderID: orderID,
            OrderNumber: confirmed.OrderNumber ?? null,
            Status: status,
            RequestedStatus: target,
            Transitions: transitions,
            Totals: confirmed.Totals as never,
            JournalEntries: (confirmed.JournalEntries ?? []) as never,
            EntryCount: confirmed.EntryCount ?? 0,
            AllBalanced: confirmed.AllBalanced ?? true,
            UnfulfilledLineCount: unfulfilled,
            Blockers: [],
        };
    }

    private blocker(code: string, message: string, hint?: string): BlockerResult {
        return { Code: code, Message: message, ResolutionHint: hint ?? null, LineNumber: null };
    }

    private refuse(target: string, blockers: BlockerResult[]): OrdersCreateOrderInStateOutput {
        return {
            Success: false,
            Message: blockers.map((b) => b.Message).join(' '),
            RequestedStatus: target,
            Status: null,
            Transitions: [],
            Blockers: blockers,
            JournalEntries: [],
            EntryCount: 0,
            AllBalanced: true,
            UnfulfilledLineCount: 0,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCreateOrderInStateOperation(): void {
    // intentionally empty
}
