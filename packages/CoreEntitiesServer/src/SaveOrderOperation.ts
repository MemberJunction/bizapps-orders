/**
 * @fileoverview `Orders.SaveOrder` and `Orders.ConfirmOrder` — the two operations
 * that write an order.
 *
 * Both hydrate a client draft through {@link HydrateOrderDraft} and hand it to
 * `OrderEntityServer.Save()`; they differ only in whether the status transitions.
 *
 * WHAT USED TO LIVE HERE, AND WHY IT DOESN'T. `Orders.PreviewOrder` ran the REAL
 * save inside a transaction that always rolled back, then read the computed values
 * off the entities before they vanished. The reasoning was sound as far as it went
 * — a preview that reimplemented pricing would be a second copy of the rules, and
 * the two would eventually disagree — but the cost was not acceptable: it fired on
 * every keystroke, so composing one order ran the full booking walk (journal
 * entries, subscription decisions, entitlement grants, sequence numbers) dozens of
 * times and discarded all of it. Worse, the confirm was GATED on it, so any
 * transient failure in a run nobody would ever read blocked the run that mattered.
 *
 * The replacement is not a second implementation — it is the SAME functions,
 * called without the write. `Orders.PreviewPrice` calls `ResolvePrice`, which is
 * exactly what the pricing walk inside `Save()` calls. That is the shape every
 * future read-only projection should take: extract the decide step, expose it as
 * a remotable operation, and let `Save()` call the same function before it
 * persists. One implementation, two callers — never a save you throw away.
 *
 * Charges, tax and promotions do not have that separation yet; until they do,
 * anything computed outside `Save()` covers line pricing only and is advisory.
 * The engine remains the authority on what an order actually comes to.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import {
    BaseRemotableOperation,
    RunView,
    type BaseEntity,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersSaveOrderOperation as OrdersSaveOrderOperationBase,
    OrdersConfirmOrderOperation as OrdersConfirmOrderOperationBase,
    type OrdersSaveOrderInput,
    type OrdersSaveOrderOutput,
    type OrdersConfirmOrderInput,
    type OrdersConfirmOrderOutput,
    type OrderLineResult,
    type OrderTotalsResult,
    type ChargeResult,
    type PromotionResult,
    type BlockerResult,
} from '@mj-biz-apps/orders-entities';

import { HydrateOrderDraft, type HydratableDraft, type HydratedOrder } from './OrderDraftHydrator.js';
import { ComputeLinesAndTotals } from './order-totals.js';
import { RequireOptionalUUID } from './sql-guards.js';

/** Round to cents the way the rest of the engine does. */
const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// (The `field()` reader that used to live here is gone: it existed only to get values off the
// dynamic index signature the hydrator no longer carries. Every caller now reads a typed property.)

/**
 * Project the saved entities into the wire result.
 *
 * Everything here is READ from what `Save()` computed. Nothing is recalculated —
 * a projection that did its own arithmetic would be the very duplication this
 * design exists to avoid.
 */
async function projectResult(
    hydrated: HydratedOrder,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{
    Lines: OrderLineResult[];
    Totals: OrderTotalsResult;
    Charges: ChargeResult[];
    Promotions: PromotionResult[];
}> {
    const order = hydrated.Order;

    // The decomposition lives in order-totals.ts so every operation that reports an
    // order's money reads the same function. Two copies drifted once already.
    const { Lines, Totals } = ComputeLinesAndTotals(hydrated);

    const charges = await loadCharges(order.ID, provider, user);
    const promotions = readPromotions(hydrated);

    return { Lines, Totals, Charges: charges, Promotions: promotions };
}

function isoOrNull(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** The charges the engine wrote for this order, in sequence. */
async function loadCharges(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ChargeResult[]> {
    if (!orderHeaderID) return [];
    // FromMetadataProvider, not `new RunView(provider)`: an operation's provider is
    // an IMetadataProvider, and this is the documented way to get a view runner
    // bound to it rather than to the global one.
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Charges',
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
            OrderBy: 'Sequence',
            ResultType: 'simple',
        },
        user,
    );
    return (result.Results ?? []).map((r) => ({
        ChargeTypeID: String(r.ChargeTypeID ?? ''),
        Name: String(r.ChargeType ?? ''),
        Sequence: Number(r.Sequence ?? 0),
        Basis: String(r.CalculationSource ?? 'Internal'),
        BasisAmount: r.BasisAmount == null ? null : money(Number(r.BasisAmount)),
        Rate: r.Rate == null ? null : Number(r.Rate),
        Amount: money(Number(r.Amount ?? 0)),
        IsTax: r.TaxJurisdictionID != null,
        JurisdictionName: (r.TaxJurisdiction as string) ?? null,
        IsOverridden: Boolean(r.IsOverridden),
        ComputedAmount: r.ComputedAmount == null ? null : money(Number(r.ComputedAmount)),
    }));
}

/**
 * Promotion outcomes, INCLUDING the codes that did nothing.
 *
 * `UnusablePromotionCodes` is the engine's record of offered-not-applied, and
 * surfacing it is the only way to answer "why didn't my code work?" without
 * re-running the engine by hand — which is a question customers actually ask.
 */
function readPromotions(hydrated: HydratedOrder): PromotionResult[] {
    const unusable =
        (hydrated.Order)
            .UnusablePromotionCodes ?? [];
    return unusable.map((u) => ({
        Code: u.Code,
        Name: u.Code,
        Scope: 'Line' as const,
        Kind: 'Percent' as const,
        Value: 0,
        Applied: false,
        Amount: 0,
        NotAppliedReason: u.Reason,
    }));
}

/** Turn a failed save into blockers the UI can render verbatim. */
function blockersFrom(order: BaseEntity, fallback: string): BlockerResult[] {
    const message = order.LatestResult?.CompleteMessage?.trim();
    return [
        {
            Code: 'SAVE_REFUSED',
            Message: message && message.length > 0 ? message : fallback,
        },
    ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders.SaveOrder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create or update a DRAFT order and its lines in one transaction.
 *
 * Never confirms. Confirming books journal entries and is not undoable, so it is
 * a separate, deliberate operation rather than a status field somebody can set by
 * accident through a save.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.SaveOrder')
export class SaveOrderOperation extends OrdersSaveOrderOperationBase {
    protected async InternalExecute(
        input: OrdersSaveOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersSaveOrderOutput> {
        if (!input?.Draft?.Header?.CompanyID) {
            return { Success: false, Message: 'Draft.Header.CompanyID is required.' };
        }

        // REFUSED, NOT IGNORED. `Preview` used to route into a save-and-roll-back; that path is
        // gone. Silently treating the flag as absent would turn a caller's "just tell me what this
        // would cost" into a real, committed order — the single worst failure this operation could
        // have. So it is rejected by name, pointing at the operation that answers the question.
        if (input.Preview) {
            return {
                Success: false,
                Message:
                    'Orders.SaveOrder no longer supports Preview — it ran a real save and rolled it back. ' +
                    'Use Orders.PreviewPrice to price a line without writing anything.',
                Blockers: [
                    {
                        Code: 'PREVIEW_REMOVED',
                        Message: 'Preview mode was removed from Orders.SaveOrder.',
                        ResolutionHint: 'Call Orders.PreviewPrice per line instead.',
                    },
                ],
            };
        }

        const hydrated = await HydrateOrderDraft(input.Draft as HydratableDraft, provider, user);
        const order = hydrated.Order;

        // A save never transitions status. An order arrives Draft and stays Draft
        // until Orders.ConfirmOrder says otherwise.
        const saved = await order.Save();
        if (!saved) {
            return {
                Success: false,
                Message: 'The order could not be saved.',
                Blockers: blockersFrom(order, 'The order could not be saved.'),
            };
        }

        const projected = await projectResult(hydrated, provider, user);
        return {
            Success: true,
            OrderHeaderID: order.ID,
            OrderNumber: order.OrderNumber,
            Status: order.Status,
            ...projected,
        };
    }
}

/** Registers {@link SaveOrderOperation}. Called from the server bootstrap. */
export function LoadSaveOrderOperation(): void {
    // Referencing the class is what defeats tree-shaking of the decorator.
    void SaveOrderOperation;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders.ConfirmOrder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Confirm an order: the irreversible step.
 *
 * `OrderEntityServer.Save()` does the real work when status transitions into a
 * locked state — books one journal entry per line, decides subscriptions, issues
 * grants, captures the initial payment — all inside one transaction that rolls
 * back entirely on any failure. This operation's job is to set up that transition
 * correctly and to report the reason when it is refused.
 *
 * `ExpectedGrossTotal` IS ACCEPTED AND NOT YET ENFORCED — a deliberate gap, recorded
 * here rather than left to be discovered. The guard it used to drive was real and is
 * worth having: between the moment a user reads a total and the moment they press
 * Confirm, a promotion can expire or a rate can change, and without a guard the order
 * books at the new number silently. But it was implemented by running an ENTIRE second
 * booking through a rolled-back transaction purely to learn the total, which is the
 * cost this operation no longer pays.
 *
 * Its correct home is INSIDE the transaction below: `Save()` already computes the real
 * gross, so the comparison is one subtraction against a figure that exists anyway, and
 * a mismatch throws before the commit. That is a change to `OrderEntityServer`, so it
 * is backlogged rather than smuggled in here. Until it lands, the screen's total is
 * advisory and the engine's is authoritative.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.ConfirmOrder')
export class ConfirmOrderOperation extends OrdersConfirmOrderOperationBase {
    protected async InternalExecute(
        input: OrdersConfirmOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersConfirmOrderOutput> {
        const hasDraft = !!input?.Draft?.Header?.CompanyID;
        const hasID = !!input?.OrderHeaderID;

        if (hasDraft === hasID) {
            return {
                Success: false,
                Message: 'Supply exactly one of OrderHeaderID or Draft.',
                Blockers: [
                    {
                        Code: 'INPUT_AMBIGUOUS',
                        Message: hasDraft
                            ? 'Both OrderHeaderID and Draft were supplied; they are mutually exclusive.'
                            : 'Neither OrderHeaderID nor Draft was supplied.',
                    },
                ],
            };
        }

        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireOptionalUUID(input?.OrderHeaderID, 'OrderHeaderID');

        // A draft to confirm, or an existing order to load and confirm. Either way
        // it goes through the SAME hydration path, so there is one mapping to be
        // right rather than two.
        const draft: HydratableDraft = hasDraft
            ? (input.Draft as HydratableDraft)
            : { Header: { CompanyID: '', OrderHeaderID: input.OrderHeaderID }, Lines: [] };

        const hydrated = await HydrateOrderDraft(draft, provider, user);
        const order = hydrated.Order;

        // Already-locked orders are not re-confirmable. Booking fires exactly once,
        // on the FIRST transition, and saying so plainly beats letting the engine's
        // idempotency guard produce a confusing no-op.
        const currentStatus = order.Status;
        if (!['Draft', 'Quoted'].includes(currentStatus)) {
            return {
                Success: false,
                Message: `This order is already ${currentStatus}.`,
                OrderHeaderID: order.ID,
                Status: currentStatus,
                Blockers: [
                    {
                        Code: 'ALREADY_CONFIRMED',
                        Message:
                            `Only a Draft or Quoted order can be confirmed; this one is ${currentStatus}. ` +
                            'After confirming, corrections are reversing orders rather than edits.',
                    },
                ],
            };
        }

        // `input.ExpectedGrossTotal` is read by nothing right now. See the note on this class:
        // the guard belongs inside the booking transaction, where the real gross already exists,
        // rather than in a whole second booking run to discover it.

        order.Status = 'Confirmed';

        const saved = await order.Save();
        if (!saved) {
            // The reason lives on LatestResult, not in a log. A rejected confirm the
            // user cannot read is a rejected confirm they cannot act on.
            return {
                Success: false,
                Message: order.LatestResult?.CompleteMessage ?? 'The order could not be confirmed.',
                OrderHeaderID: order.ID,
                Status: currentStatus,
                Blockers: blockersFrom(order, 'The order could not be confirmed.'),
            };
        }

        const projected = await projectResult(hydrated, provider, user);
        return {
            Success: true,
            OrderHeaderID: order.ID,
            // Taken from the sequence inside the transaction, so a failed confirm
            // burns no number.
            OrderNumber: order.OrderNumber,
            Status: order.Status,
            Totals: projected.Totals,
        };
    }
}

/** Registers {@link ConfirmOrderOperation}. Called from the server bootstrap. */
export function LoadConfirmOrderOperation(): void {
    void ConfirmOrderOperation;
}
