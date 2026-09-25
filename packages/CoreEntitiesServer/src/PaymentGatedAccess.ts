/**
 * Payment-gated access — keep each grant's status in step with the order's cash (bc-aidp-next-golive#223).
 *
 * `EntitlementBehavior.DecideGrantStatus` says what status a grant should hold. This module finds
 * the grants whose answer can change, reads the order facts it needs, and writes the new status.
 * Two callers:
 *
 *   · PAYMENTS. `PaymentHeaderEntityServer` calls {@link ReconcilePaymentGatedGrants} inside the
 *     transaction that captures or reverses a payment, after the rollup triggers have moved the
 *     order's `AmountPaid`. A new purchase goes live on the payment that clears its first
 *     instalment; a returned debit takes it back (a refund does not — the seller chose it); a
 *     renewal that was cut off comes back on the payment that brings it inside the cutoff.
 *   · THE CLOCK. A renewal goes past its cutoff with nothing being written — only a day passing — so
 *     {@link EnforcePaymentGatedAccess} runs nightly from a scheduled job. It also re-checks every
 *     payment-suspended grant, so a payment written by a path that did not call the hook is caught
 *     within a day rather than never.
 *
 * WHAT IT WILL NOT TOUCH. Grants written before `GrantTimingApplied` existed (NULL), grants whose
 * timing does not follow cash, revoked or expired grants, and grants suspended for a reason that is
 * not a payment reason. See `ReconcileGrantStatus`.
 *
 * CONNECTS TO:
 *   PURE:     ./EntitlementBehavior.ts (DecideGrantStatus, FirstPaymentAmount, ReconcileGrantStatus)
 *   RULE:     @mj-biz-apps/orders-entities overdue.ts (DaysOverdue — the one definition of overdue)
 *   SETTING:  OrdersSettings.RenewalAccessCutoffDaysPastDue
 *   CALLERS:  PaymentHeaderEntityServer.Save, OrderEntityServer.grantEntitlements,
 *             packages/Server/src/custom/enforce-payment-gated-access.action.ts
 */
import {
    CompositeKey,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import {
    DaysOverdue,
    OverdueFilter,
    ToISODate,
    mjBizAppsOrdersEntitlementGrantEntity,
} from '@mj-biz-apps/orders-entities';
import {
    DecideGrantStatus,
    FirstPaymentAmount,
    PAYMENT_GATED_TIMINGS,
    ReconcileGrantStatus,
    type GrantTiming,
    type OrderPaymentFacts,
    type FirstPaymentScheduleRow,
    type SuspensionReason,
} from './EntitlementBehavior.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { OrdersSettings } from './OrdersSettings.js';
import { RequireDate, RequireUUID } from './sql-guards.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[], label: string): string =>
    [...new Set(ids.map((i) => `'${RequireUUID(i, label)}'`))].join(',');
const gatedTimings = PAYMENT_GATED_TIMINGS.map((t) => `'${t}'`).join(',');

/** The order facts access is decided from, plus what a report needs to name the order. */
export interface OrderAccessFacts extends OrderPaymentFacts {
    OrderID: string;
    OrderNumber: string;
    /** The day the next unpaid amount is due, `YYYY-MM-DD`, or null when no terms were set. */
    NextDueDate: string | null;
}

/** One grant whose status changed, or would change on a preview. */
export interface GrantStatusChange {
    GrantID: string;
    OrderID: string;
    OrderNumber: string;
    OrderLineID: string;
    FromStatus: string;
    FromReason: string | null;
    ToStatus: 'Active' | 'Suspended';
    ToReason: SuspensionReason | null;
    DaysPastDue: number;
}

/**
 * Read the payment facts for a set of orders — three queries however many orders.
 *
 * `BypassCache` because the callers are inside a transaction that has just moved the figures, and a
 * cached row would decide from the balance before the payment.
 *
 * SELLER REFUNDS are read alongside, from the un-apply lines of reversals stamped
 * `ReversalSource = 'Refund'`, because the access rule adds them back (see `DecideGrantStatus`).
 * `DaysPastDue` is measured on the balance net of them for the same reason: a renewal refunded by
 * the seller is not a renewal the customer has failed to pay.
 */
export async function LoadOrderPaymentFacts(
    orderIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
    asOfDay: string,
): Promise<Map<string, OrderAccessFacts>> {
    const out = new Map<string, OrderAccessFacts>();
    if (!orderIDs.length) return out;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const ids = quote(orderIDs, 'OrderHeaderID');

    // Sequential, not Promise.all: inside a transaction both reads share one connection.
    const orders = await rv.RunView<{
        ID: string;
        OrderNumber: string;
        Status: string;
        TotalGross: number | null;
        AmountPaid: number | null;
        Balance: number | null;
        DueDate: unknown;
        NextDueDate: unknown;
    }>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID IN (${ids})`,
            Fields: ['ID', 'OrderNumber', 'Status', 'TotalGross', 'AmountPaid', 'Balance', 'DueDate', 'NextDueDate'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const schedule = await rv.RunView<FirstPaymentScheduleRow & { OrderHeaderID: string }>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${ids})`,
            Fields: ['OrderHeaderID', 'CompanyID', 'InstallmentNumber', 'Amount', 'Status'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const refundLines = await rv.RunView<{ OrderHeaderID: string; Amount: number }>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter:
                `OrderHeaderID IN (${ids}) AND PaymentHeaderID IN (` +
                `SELECT ID FROM __mj_BizAppsOrders.PaymentHeader WHERE Status = 'Refunded' AND ReversalSource = 'Refund')`,
            Fields: ['OrderHeaderID', 'Amount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!orders.Success) throw new Error(`Could not read orders for access decisions: ${orders.ErrorMessage}`);
    if (!schedule.Success) throw new Error(`Could not read payment schedules for access decisions: ${schedule.ErrorMessage}`);
    if (!refundLines.Success) throw new Error(`Could not read refunds for access decisions: ${refundLines.ErrorMessage}`);

    // Un-apply lines are negative; the refunded amount is their magnitude.
    const refundedByOrder = new Map<string, number>();
    for (const row of refundLines.Results ?? []) {
        refundedByOrder.set(key(row.OrderHeaderID), (refundedByOrder.get(key(row.OrderHeaderID)) ?? 0) - Number(row.Amount ?? 0));
    }

    const scheduleByOrder = new Map<string, FirstPaymentScheduleRow[]>();
    for (const row of schedule.Results ?? []) {
        const list = scheduleByOrder.get(key(row.OrderHeaderID)) ?? [];
        list.push(row);
        scheduleByOrder.set(key(row.OrderHeaderID), list);
    }

    for (const o of orders.Results ?? []) {
        const nextDue = ToISODate(o.NextDueDate ?? o.DueDate);
        const refunded = Math.round((refundedByOrder.get(key(o.ID)) ?? 0) * 100) / 100;
        const accessBalance = o.Balance == null ? null : Number(o.Balance) - refunded;
        out.set(key(o.ID), {
            OrderID: o.ID,
            OrderNumber: o.OrderNumber,
            NextDueDate: nextDue,
            TotalGross: o.TotalGross,
            AmountPaid: o.AmountPaid,
            Balance: o.Balance,
            RefundedBySeller: refunded,
            FirstPaymentAmount: FirstPaymentAmount(o.TotalGross, scheduleByOrder.get(key(o.ID)) ?? []),
            DaysPastDue: DaysOverdue({ Status: o.Status, Balance: accessBalance, DueDateISO: nextDue }, asOfDay),
        });
    }
    return out;
}

/** The business day, with the time zone engine loaded so it is the business zone's day. */
export async function BusinessDay(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    return BusinessTimeZoneEngine.Instance.Today();
}

export interface ReconcileOptions {
    /** `YYYY-MM-DD`; defaults to the business day. */
    AsOfDay?: string;
    /** Decide and report, but write nothing. */
    Preview?: boolean;
    /** Passed to each grant save, so the writes join the caller's transaction. */
    SaveOptions?: EntitySaveOptions;
}

/**
 * Re-decide every payment-gated grant on these orders and write the ones that changed.
 *
 * Throws on a failed write rather than reporting it: the payment path calls this inside its own
 * transaction, and a payment that clears the balance while the grant stays suspended is exactly the
 * inconsistency this exists to prevent.
 */
export async function ReconcilePaymentGatedGrants(
    orderIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
    options: ReconcileOptions = {},
): Promise<GrantStatusChange[]> {
    const unique = [...new Set(orderIDs.filter(Boolean).map(key))];
    if (!unique.length) return [];

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ ID: string; OrderHeaderID: string; RenewsSubscriptionID: string | null }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${quote(unique, 'OrderHeaderID')})`,
            Fields: ['ID', 'OrderHeaderID', 'RenewsSubscriptionID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const lineRows = lines.Results ?? [];
    if (!lineRows.length) return [];
    const lineByID = new Map(lineRows.map((l) => [key(l.ID), l]));

    const grants = await rv.RunView<{
        ID: string;
        OrderLineID: string;
        Status: string;
        SuspensionReason: string | null;
        GrantTimingApplied: GrantTiming;
    }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter:
                `OrderLineID IN (${quote(lineRows.map((l) => l.ID), 'OrderLineID')}) ` +
                `AND GrantTimingApplied IN (${gatedTimings}) AND Status IN ('Active','Suspended')`,
            Fields: ['ID', 'OrderLineID', 'Status', 'SuspensionReason', 'GrantTimingApplied'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!grants.Success) throw new Error(`Could not read entitlement grants: ${grants.ErrorMessage}`);
    const grantRows = grants.Results ?? [];
    if (!grantRows.length) return [];

    await OrdersSettings.Load(provider, user);
    const cutoff = OrdersSettings.RenewalAccessCutoffDaysPastDue;
    const asOf = options.AsOfDay ?? (await BusinessDay(provider, user));
    const facts = await LoadOrderPaymentFacts(unique, provider, user, asOf);

    const changes: GrantStatusChange[] = [];
    for (const g of grantRows) {
        const line = lineByID.get(key(g.OrderLineID));
        const order = line ? facts.get(key(line.OrderHeaderID)) : undefined;
        if (!line || !order) continue;

        const decided = DecideGrantStatus(g.GrantTimingApplied, !!line.RenewsSubscriptionID, order, cutoff);
        const change = ReconcileGrantStatus(g, decided);
        if (!change) continue;

        if (!options.Preview) await writeGrantStatus(g.ID, change.Status, change.Reason, provider, user, options.SaveOptions);
        changes.push({
            GrantID: g.ID,
            OrderID: order.OrderID,
            OrderNumber: order.OrderNumber,
            OrderLineID: g.OrderLineID,
            FromStatus: g.Status,
            FromReason: g.SuspensionReason,
            ToStatus: change.Status,
            ToReason: change.Reason,
            DaysPastDue: order.DaysPastDue,
        });
    }
    return changes;
}

async function writeGrantStatus(
    grantID: string,
    status: 'Active' | 'Suspended',
    reason: SuspensionReason | null,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
): Promise<void> {
    const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
        ENTITLEMENT_GRANT_ENTITY,
        CompositeKey.FromID(grantID),
        user,
    );
    grant.Status = status;
    grant.SuspensionReason = reason;
    grant.SuspendedAt = status === 'Suspended' ? new Date() : null;
    if (!(await grant.Save(options))) {
        throw new Error(
            `Failed to set entitlement grant ${grantID} to ${status}${reason ? ` (${reason})` : ''}: ` +
                `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
}

export interface EnforcePaymentGatedAccessInput {
    /** Treat this as today, `YYYY-MM-DD`. Defaults to the business day. */
    AsOfDate?: string;
    /** Report what would change and write nothing. */
    Preview?: boolean;
    /** Cap on orders processed in one pass. */
    MaxCount?: number;
}

export interface EnforcePaymentGatedAccessOutput {
    Success: boolean;
    Message?: string;
    AsOfDate: string;
    CutoffDaysPastDue: number | null;
    OrdersConsidered: number;
    Activated: number;
    Suspended: number;
    Changes: GrantStatusChange[];
    /** Orders whose re-decision failed. Each was rolled back on its own; the rest of the pass stands. */
    Failures: Array<{ OrderID: string; Error: string }>;
}

/**
 * The nightly pass: cut off renewals that have gone past the cutoff, and restore anything whose
 * payment has since arrived.
 *
 * CANDIDATES, not every order. Two sets:
 *   · orders holding a grant suspended for a payment reason — the ones cash may have released;
 *   · overdue orders holding an Active `OnFirstPayment` grant on a renewal line — the ones the
 *     clock may have cut off. A new purchase's Active grant is not a candidate: the clock cannot
 *     change its answer, only a payment can, and the payment path handles that.
 *
 * Each order is re-decided in its own transaction, so one failure does not undo the others and a
 * half-written order cannot happen.
 */
export async function EnforcePaymentGatedAccess(
    input: EnforcePaymentGatedAccessInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<EnforcePaymentGatedAccessOutput> {
    const asOf = input.AsOfDate ? RequireDate(input.AsOfDate, 'AsOfDate') : await BusinessDay(provider, user);
    await OrdersSettings.Load(provider, user);
    const cutoff = OrdersSettings.RenewalAccessCutoffDaysPastDue;

    const candidates = await findCandidateOrders(asOf, provider, user);
    const selected = input.MaxCount != null ? candidates.slice(0, input.MaxCount) : candidates;

    const out: EnforcePaymentGatedAccessOutput = {
        Success: true,
        AsOfDate: asOf,
        CutoffDaysPastDue: cutoff,
        OrdersConsidered: selected.length,
        Activated: 0,
        Suspended: 0,
        Changes: [],
        Failures: [],
    };

    const dbProvider = provider as unknown as DatabaseProviderBase;
    for (const orderID of selected) {
        try {
            if (input.Preview) {
                out.Changes.push(...(await ReconcilePaymentGatedGrants([orderID], provider, user, { AsOfDay: asOf, Preview: true })));
                continue;
            }
            await dbProvider.BeginTransaction();
            const changes = await ReconcilePaymentGatedGrants([orderID], provider, user, { AsOfDay: asOf });
            await dbProvider.CommitTransaction();
            out.Changes.push(...changes);
        } catch (err) {
            if (!input.Preview) {
                try {
                    await dbProvider.RollbackTransaction();
                } catch (rollbackErr) {
                    LogError(`Rollback failed after payment-gated access error on order ${orderID}: ${rollbackErr}`);
                }
            }
            out.Failures.push({ OrderID: orderID, Error: err instanceof Error ? err.message : String(err) });
        }
    }

    out.Activated = out.Changes.filter((c) => c.ToStatus === 'Active').length;
    out.Suspended = out.Changes.filter((c) => c.ToStatus === 'Suspended').length;
    out.Success = out.Failures.length === 0;
    const verb = input.Preview ? 'would change' : 'changed';
    out.Message =
        `${out.Changes.length} grant(s) ${verb} across ${selected.length} order(s): ` +
        `${out.Activated} to Active, ${out.Suspended} to Suspended` +
        (out.Failures.length ? `; ${out.Failures.length} order(s) failed` : '') +
        (selected.length < candidates.length ? `; ${candidates.length - selected.length} order(s) left for the next pass` : '') +
        '.';
    return out;
}

async function findCandidateOrders(asOf: string, provider: IMetadataProvider, user: UserInfo): Promise<string[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const [suspendedLines, overdueRenewals] = await Promise.all([
        rv.RunView<{ OrderLineID: string }>(
            {
                EntityName: ENTITLEMENT_GRANT_ENTITY,
                ExtraFilter:
                    `Status = 'Suspended' AND SuspensionReason IN ('AwaitingPayment','PastDue') ` +
                    `AND GrantTimingApplied IN (${gatedTimings})`,
                Fields: ['OrderLineID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        ),
        rv.RunView<{ ID: string }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter:
                    `${OverdueFilter(asOf)} AND ID IN (` +
                    `SELECT ol.OrderHeaderID FROM __mj_BizAppsOrders.OrderLine ol ` +
                    `JOIN __mj_BizAppsOrders.EntitlementGrant g ON g.OrderLineID = ol.ID ` +
                    `WHERE ol.RenewsSubscriptionID IS NOT NULL AND g.GrantTimingApplied = 'OnFirstPayment' ` +
                    `AND g.Status = 'Active')`,
                Fields: ['ID'],
                OrderBy: 'NextDueDate',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        ),
    ]);
    if (!suspendedLines.Success) throw new Error(`Could not read suspended grants: ${suspendedLines.ErrorMessage}`);
    if (!overdueRenewals.Success) throw new Error(`Could not read overdue renewals: ${overdueRenewals.ErrorMessage}`);

    const orderIDs = new Set((overdueRenewals.Results ?? []).map((o) => key(o.ID)));
    const lineIDs = [...new Set((suspendedLines.Results ?? []).map((g) => g.OrderLineID).filter(Boolean))];
    if (lineIDs.length) {
        const lines = await rv.RunView<{ OrderHeaderID: string }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID IN (${quote(lineIDs, 'OrderLineID')})`,
                Fields: ['OrderHeaderID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        for (const l of lines.Results ?? []) orderIDs.add(key(l.OrderHeaderID));
    }
    return [...orderIDs];
}
