/**
 * Orders.CancelSubscription — cancel a subscription atomically, by POLICY (design §5).
 *
 * WHY THIS IS AN OPERATION AND NOT A FORM
 * The mechanics already worked: a reversal order line with a negative quantity produces mirrored
 * journal entries through the ordinary booking path (D16). What did not work was asking a human to
 * do it. Amith's case — a subscription running 1/1–12/31, cancelled on 7/1 — needs a line of
 * quantity `-0.5`. That is correct double-entry and terrible data entry, and it silently ignores
 * the `SubscriptionType`'s own rules about WHEN coverage may end and WHETHER money comes back.
 *
 * So the caller supplies a subscription, a date and a reason. `SubscriptionBehavior` decides what
 * the rules permit; this operation performs it in ONE transaction:
 *
 *   1. resolve the affected term (the one whose window covers the request, else the latest)
 *   2. ask the behaviour what the rules say — effective date, refund, reversal fraction
 *   3. when there is something to reverse, emit a reversal ORDER whose single line carries the
 *      negative quantity and points at the original line, and confirm it — booking mirrors the JEs
 *   4. stamp the term (Canceled/Completed, CanceledAt, CancellationEffectiveDate)
 *   5. stamp the subscription (Canceled, EndDate = access-through, so grace is visible)
 *   6. log a `SubscriptionEvent` — the lifecycle record that made the table worth having
 *
 * ATOMICITY: everything above shares one transaction opened here. The reversal order's own
 * `OrderEntityServer.Save` nests inside it as savepoints (the same composition booking already
 * relies on), so a failure anywhere leaves the subscription exactly as it was — never a reversed
 * ledger with a still-active subscription, or vice versa.
 *
 * FAILURE MODEL: logical failures (unknown subscription, already cancelled, no term) come back
 * INSIDE the output as `Success: false` with a message — the same contract accounting's operations
 * use. Only genuine faults throw.
 *
 * CONNECTS TO:
 *   POLICY: SubscriptionBehavior.DecideCancellation (./SubscriptionBehavior.ts)
 *   BOOKING: OrderEntityServer.Save (./OrderEntityServer.ts) — the reversal order goes through it
 *   TABLES: __mj_BizAppsOrders.{Subscription,SubscriptionTerm,SubscriptionEvent,OrderHeader,OrderLine}
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    CompositeKey,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireUUID } from './sql-guards.js';
import {
    SubscriptionBehavior,
    type CancellationDecision,
    type SubscriptionTypeRules,
} from './SubscriptionBehavior.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

export interface CancelSubscriptionInput {
    SubscriptionID: string;
    /** When the customer asked. Defaults to today. The RULES decide when coverage actually ends. */
    RequestDate?: Date | string;
    /** Free text, stored on the lifecycle event. */
    Reason?: string;
    /**
     * Compute and return the decision WITHOUT writing anything — for a confirmation screen that
     * shows "you will be refunded $X, coverage ends Y" before the user commits.
     */
    Preview?: boolean;
}

export interface CancelSubscriptionOutput {
    Success: boolean;
    Message?: string;
    /** What the rules decided. Present even on a preview. */
    Decision?: CancellationDecision;
    /** The term that was (or would be) cancelled. */
    SubscriptionTermID?: string;
    /** The reversal order, when one was needed. Absent when nothing was refunded. */
    ReversalOrderID?: string;
    ReversalOrderNumber?: string;
}

interface TermRow {
    ID: string;
    SubscriptionID: string;
    TermNumber: number;
    OrderLineID: string;
    StartDate: string;
    EndDate: string;
    Amount: number;
    Status: string;
}

interface SubscriptionRow {
    ID: string;
    CompanyID: string;
    SubscriptionTypeID: string;
    ProductID: string;
    Status: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
}

interface OrderLineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    DiscountPct: number | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.CancelSubscription')
export class CancelSubscriptionOperation extends BaseRemotableOperation<
    CancelSubscriptionInput,
    CancelSubscriptionOutput
> {
    public OperationKey = 'Orders.CancelSubscription';

    protected async InternalExecute(
        input: CancelSubscriptionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CancelSubscriptionOutput> {
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireUUID(input.SubscriptionID, 'SubscriptionID');

        const requestDate = input.RequestDate ? new Date(input.RequestDate) : new Date();

        const subscription = await this.loadSubscription(provider, user, input.SubscriptionID);
        if (!subscription) {
            return { Success: false, Message: `No subscription found with ID '${input.SubscriptionID}'.` };
        }
        if (subscription.Status === 'Canceled') {
            // Not an error worth throwing over — the caller asked for a state that already holds.
            return { Success: false, Message: `Subscription is already canceled.` };
        }

        const rules = await this.loadRules(provider, user, subscription.SubscriptionTypeID);
        if (!rules) {
            return {
                Success: false,
                Message: `Subscription type '${subscription.SubscriptionTypeID}' was not found.`,
            };
        }

        const term = await this.resolveTerm(provider, user, subscription.ID, requestDate);
        if (!term) {
            return {
                Success: false,
                Message: `Subscription has no term to cancel — nothing was ever booked against it.`,
            };
        }

        const decision = this.behaviorFor(rules).DecideCancellation({
            Rules: rules,
            RequestDate: requestDate,
            Term: {
                StartDate: new Date(term.StartDate),
                EndDate: new Date(term.EndDate),
                Amount: Number(term.Amount),
                TermNumber: term.TermNumber,
            },
        });

        if (input.Preview) {
            return { Success: true, Decision: decision, SubscriptionTermID: term.ID, Message: decision.Explanation };
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const reversal =
                decision.ReversalFraction > 0
                    ? await this.emitReversalOrder(provider, user, subscription, term, decision, input.Reason)
                    : undefined;

            await this.stampTerm(provider, user, term.ID, decision);
            await this.stampSubscription(provider, user, subscription.ID, decision);
            await this.logEvent(provider, user, subscription.ID, decision, input.Reason, reversal?.ID);

            await dbProvider.CommitTransaction();
            return {
                Success: true,
                Message: decision.Explanation,
                Decision: decision,
                SubscriptionTermID: term.ID,
                ReversalOrderID: reversal?.ID,
                ReversalOrderNumber: reversal?.Number,
            };
        } catch (err) {
            LogError(`Orders.CancelSubscription failed for ${input.SubscriptionID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after CancelSubscription error: ${rollbackErr}`);
            }
            return {
                Success: false,
                Message: err instanceof Error ? err.message : String(err),
                Decision: decision,
                SubscriptionTermID: term.ID,
            };
        }
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    private async loadSubscription(
        provider: IMetadataProvider,
        user: UserInfo,
        id: string,
    ): Promise<SubscriptionRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<SubscriptionRow>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID='${id}'`,
                Fields: [
                    'ID',
                    'CompanyID',
                    'SubscriptionTypeID',
                    'ProductID',
                    'Status',
                    'HolderOrganizationID',
                    'BeneficiaryPersonID',
                ],
                ResultType: 'simple',
                // The caller may have just written this row; a cached read would decide policy on
                // stale status.
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    private async loadRules(
        provider: IMetadataProvider,
        user: UserInfo,
        typeID: string,
    ): Promise<SubscriptionTypeRules | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<SubscriptionTypeRules>(
            { EntityName: SUBSCRIPTION_TYPE_ENTITY, ExtraFilter: `ID='${typeID}'`, ResultType: 'simple' },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    /**
     * The term the request lands in, or — when the request falls outside every window (an early
     * cancellation of a future term, or a late one after everything lapsed) — the latest term.
     * Cancelling always has to act on SOMETHING for the reversal to point at.
     */
    private async resolveTerm(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        requestDate: Date,
    ): Promise<TermRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<TermRow>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `SubscriptionID='${subscriptionID}' AND Status IN ('Scheduled','Active')`,
                OrderBy: 'TermNumber DESC',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const terms = result?.Results ?? [];
        if (terms.length === 0) return null;

        const at = requestDate.getTime();
        const covering = terms.find(
            (t) => new Date(t.StartDate).getTime() <= at && new Date(t.EndDate).getTime() >= at,
        );
        return covering ?? terms[0];
    }

    // ─── Writes ────────────────────────────────────────────────────────────────

    /**
     * A reversal order carrying ONE line: the negative slice of the original purchase.
     *
     * It goes through the ordinary confirm path rather than writing journal entries directly, so the
     * mirrored ledger, the GL account resolution and the all-or-none guarantee are the SAME code
     * that booked the original. `ReversesOrderLineID` is what makes a negative quantity legal
     * (OrderLineEntityServer validates exactly that).
     */
    private async emitReversalOrder(
        provider: IMetadataProvider,
        user: UserInfo,
        subscription: SubscriptionRow,
        term: TermRow,
        decision: CancellationDecision,
        reason?: string,
    ): Promise<{ ID: string; Number: string }> {
        const original = await this.loadOriginalLine(provider, user, term.OrderLineID);
        if (!original) {
            throw new Error(
                `The order line that bought term ${term.TermNumber} (${term.OrderLineID}) no longer exists, ` +
                    `so the cancellation cannot be reversed against it.`,
            );
        }

        const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
        order.NewRecord();
        // 'Cancellation' — one of the CK_OrderHeader_OrderType values. There is no 'Reversal'
        // order type; reversal is what the negative LINE does, not what the order is called.
        order.OrderType = 'Cancellation';
        order.OrderDate = decision.EffectiveDate;
        order.CompanyID = subscription.CompanyID;
        order.BillToOrganizationID = subscription.HolderOrganizationID;
        order.BillToPersonID = subscription.BeneficiaryPersonID;
        order.Notes = reason ? `Subscription cancellation: ${reason}` : 'Subscription cancellation';

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        line.NewRecord();
        line.ProductID = original.ProductID;
        line.LineNumber = 1;
        // A FRACTION OF THE ORIGINAL LINE, not of one unit. The purchased line may already carry a
        // prorated quantity (a short first period), so reversing `-fraction` flat would unwind more
        // than was ever sold. Rounded to the column's 4dp scale for the same reason the purchase
        // path rounds: an unrounded quantity is truncated on insert and the recomputed total then
        // disagrees with the stored one.
        const reversalQuantity =
            Math.round(Number(original.Quantity) * decision.ReversalFraction * 1e4) / 1e4;
        if (reversalQuantity === 0) {
            throw new Error(
                `The computed reversal (${decision.ReversalFraction} of quantity ${original.Quantity}) ` +
                    `rounds to zero, which is not a valid order line. Nothing can be reversed at this size.`,
            );
        }
        line.Quantity = -reversalQuantity;
        line.UnitPrice = original.UnitPrice;
        line.DiscountPct = original.DiscountPct ?? 0;
        line.ReversesOrderLineID = original.ID;
        line.ServicePeriodStart = decision.EffectiveDate;
        line.ServicePeriodEnd = new Date(term.EndDate);

        order.Lines = [line];
        order.Status = 'Confirmed';

        if (!(await order.Save())) {
            throw new Error(
                `Failed to book the reversal order: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return { ID: order.ID, Number: order.OrderNumber };
    }

    private async loadOriginalLine(
        provider: IMetadataProvider,
        user: UserInfo,
        orderLineID: string,
    ): Promise<OrderLineRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<OrderLineRow>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID='${orderLineID}'`,
                Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Quantity', 'UnitPrice', 'DiscountPct'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    private async stampTerm(
        provider: IMetadataProvider,
        user: UserInfo,
        termID: string,
        decision: CancellationDecision,
    ): Promise<void> {
        const term = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(
            SUBSCRIPTION_TERM_ENTITY,
            CompositeKey.FromID(termID),
            user,
        );
        term.Status = decision.TermStatus;
        term.CanceledAt = new Date();
        term.CancellationEffectiveDate = decision.EffectiveDate;
        if (!(await term.Save())) {
            throw new Error(`Failed to stamp the term: ${term.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    private async stampSubscription(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        decision: CancellationDecision,
    ): Promise<void> {
        const sub = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(
            SUBSCRIPTION_ENTITY,
            CompositeKey.FromID(subscriptionID),
            user,
        );
        sub.Status = 'Canceled';
        sub.CanceledAt = new Date();
        // EndDate is the ACCESS date, not the revenue date — grace is exactly the window where the
        // customer still gets in but nothing more is earned.
        sub.EndDate = decision.AccessThroughDate;
        sub.AutoRenew = false;
        if (!(await sub.Save())) {
            throw new Error(
                `Failed to stamp the subscription: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private async logEvent(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        decision: CancellationDecision,
        reason?: string,
        reversalOrderID?: string,
    ): Promise<void> {
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        event.NewRecord();
        event.SubscriptionID = subscriptionID;
        event.EventType = 'Canceled';
        event.OccurredAt = new Date();
        event.RelatedOrderHeaderID = reversalOrderID ?? null;
        event.Set(
            'EventData',
            JSON.stringify({
                EffectiveDate: decision.EffectiveDate,
                AccessThroughDate: decision.AccessThroughDate,
                RefundAmount: decision.RefundAmount,
                ReversalFraction: decision.ReversalFraction,
                TermStatus: decision.TermStatus,
                Explanation: decision.Explanation,
                Reason: reason ?? null,
            }),
        );
        if (!(await event.Save())) {
            throw new Error(
                `Failed to log the cancellation event: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** The base behaviour, or the type's registered subclass when it names one (D45). */
    private behaviorFor(rules: SubscriptionTypeRules): SubscriptionBehavior {
        if (!rules.DriverClass) return new SubscriptionBehavior();
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(
            SubscriptionBehavior,
            rules.DriverClass,
        );
        if (!driver) {
            throw new Error(
                `Subscription type '${rules.Code}' names driver '${rules.DriverClass}', which is not registered.`,
            );
        }
        return driver;
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadCancelSubscriptionOperation(): void {
    // intentionally empty
}
