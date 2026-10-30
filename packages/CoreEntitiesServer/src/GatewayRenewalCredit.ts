/**
 * GatewayRenewalCredit — what the payment gateway refunded of a renewal it charged, and how much of that Orders has
 * already credited back (D20, Ethan 30 Oct). ONE per-term computation, used by both doors that credit it:
 *
 *   · a gateway refund landing on a renewal's charge, whenever (before or after a cancel, or with none):
 *     `CreditGatewayRenewalRefund` credits THAT renewal order by what is refunded and not yet credited, and tells a
 *     person; access and term dates are untouched (only a cancel ends access);
 *   · a cancel that records the gateway's end (`Orders.CancelSubscription`, the sync or a person finishing it): each
 *     renewal term it reverses reverses exactly what is refunded and not yet credited.
 *
 * Without it, a refund (`Orders.RefundPayment`) un-applies the cash and the renewal order shows the refunded amount
 * owed again, although nobody will pay it. With it, the two doors can never credit one refund twice: each credits
 * only `Refunded − Credited` for the term, where Credited is every credit already booked for it (the amount changes'
 * credit memos below, and any reversal against the line that sold it).
 *
 * HOW IT IS CREDITED: THE CREDIT-NOTE MODEL (Ethan, D20, 30 Oct). Billing systems book a refund of a paid invoice as a
 * credit note APPLIED to that invoice (Stripe's post-payment credit note, Chargebee's refundable credit note allocated
 * to the invoice): the invoice keeps its total and its amount due falls to paid − refunded. Orders' parts for that:
 *   1. the credit is a money-only reversal order of the renewal line (`emitCredit`; it is a credit memo, takes no
 *      access away and changes no term), whose negative balance is the credit;
 *   2. `ApplyGatewayCredit` applies that credit to the renewal through `Orders.ApplyAccountCredit` (a $0 payment, −X on
 *      the credit order, +X on the renewal). Once the refund's cash is un-applied (`Orders.RefundPayment`, booked just
 *      before), the renewal reads "sold 599, credit 599, owes 0", for a full refund and a partial one alike.
 * No amount change, so no acknowledgment role and no zero-amount limit.
 *
 * Example: Jane's term 2 (ORD-…, $599, charge ch_…) — Stripe refunds $200 on 4 Nov 2027, no cancel: one $200 credit
 * order, applied to the renewal, which owes nothing, access to 30 Oct 2028 unchanged, a Task for support. Support then cancels at Stripe and
 * refunds the other $399: the recorded cancel reverses $399 (= 599 − 200), not $599.
 *
 * CONNECTS TO: ./ProviderRefundBooking.ts (the refund door) · ./CancelSubscriptionOperation.ts (the cancel door) ·
 * ./ProviderRenewalBooking.ts (the PaymentSucceeded event this reads the charge from)
 */
import { LogError, RunView, type DatabaseProviderBase, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { TodayAsDateValue, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import type { BasePaymentProvider } from './BasePaymentProvider.js';
import { raiseProviderSubscriptionAlert } from './checkoutCaptureAlert.js';
import { ApplyAccountCreditOperation, LockOrderRows } from './ApplyAccountCreditOperation.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireUUID } from './sql-guards.js';
import { SanctionCancellationReversal, SanctionMoneyOnlyReversal } from './SubscriptionEntityServer.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** A renewal term the gateway charged, and where its refund stands. */
export interface RenewalTermCredit {
    OrderLineID: string;
    OrderID: string;
    OrderNumber: string;
    SubscriptionID: string;
    ChargeID: string;
    /** What the gateway took for it, NET of tax: what the renewal line was booked at (the tax is not Orders' line). */
    Paid: number;
    /** What the gateway has refunded of that charge, net of tax in the same proportion (never more than Paid). */
    Refunded: number;
    /** What Orders has already credited back against the line (reversals of any kind). */
    Credited: number;
    /** Refunded − Credited, never below 0: what is still to credit. */
    Outstanding: number;
}

/**
 * The refund position of the renewal sold by `orderLineID`, or null when that line is not a renewal the gateway
 * charged (an order Orders billed, a checkout sale). Reads the gateway's refund through `driver` (the charge's
 * `AmountRefunded`); throws when the gateway cannot be read, so no door credits on a guess.
 *
 * NET OF TAX, both sides: the line was booked at the charge less its tax, so a refund of a taxed charge credits its
 * net share (a full $1,260 refund of a $1,200 + $60 renewal credits $1,200, the line, not $1,260).
 *
 * `known`: the gateway's figure already read for this charge (before a caller took the subscription lock), so the
 * re-read under the lock reads only Orders' side and never holds the lock across a gateway round trip.
 */
export async function GatewayRenewalCreditFor(
    orderLineID: string,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
    known?: { ChargeID: string; Refunded: number },
): Promise<RenewalTermCredit | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const line = (
        await rv.RunView<{ ID: string; OrderHeaderID: string; RenewsSubscriptionID: string | null }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID='${RequireUUID(orderLineID, 'OrderLineID')}'`,
                Fields: ['ID', 'OrderHeaderID', 'RenewsSubscriptionID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        )
    ).Results?.[0];
    if (!line?.RenewsSubscriptionID) return null;
    const order = (
        await rv.RunView<{ ID: string; OrderNumber: string; Origin: string | null }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${RequireUUID(line.OrderHeaderID, 'OrderHeaderID')}'`,
                Fields: ['ID', 'OrderNumber', 'Origin'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        )
    ).Results?.[0];
    if (!order || order.Origin !== 'ProviderPayment') return null;

    // The charge the gateway took for it: the booking's own PaymentSucceeded event (E4) names it.
    const events = await rv.RunView<{ EventData: string | null }>(
        {
            EntityName: SUBSCRIPTION_EVENT_ENTITY,
            ExtraFilter: `RelatedOrderHeaderID='${RequireUUID(order.ID, 'OrderHeaderID')}' AND EventType = 'PaymentSucceeded'`,
            Fields: ['ID', 'EventData'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    let chargeID: string | null = null;
    let gross = 0;
    let tax = 0;
    for (const e of events.Results ?? []) {
        try {
            const data = JSON.parse(e.EventData ?? '{}') as { Source?: string; ChargeID?: string | null; AmountPaid?: number; Tax?: number };
            if (data.Source === 'Gateway' && data.ChargeID) {
                chargeID = data.ChargeID;
                gross = money(Number(data.AmountPaid ?? 0));
                tax = money(Math.max(0, Number(data.Tax ?? 0)));
            }
        } catch {
            /* not an E4 event */
        }
    }
    const paid = money(gross - tax);
    if (!chargeID || paid <= 0) return null;

    // Orders' side first, then the gateway's: a caller's lock re-reads Orders' side, so this read is the one that
    // may be stale, and the gateway call (the slow part) comes last.
    const reversals = await rv.RunView<{ LineTotalNet: number | null }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ReversesOrderLineID='${RequireUUID(line.ID, 'OrderLineID')}'`,
            Fields: ['ID', 'LineTotalNet'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const reversed = (reversals.Results ?? []).reduce((n, r) => n + Math.abs(Number(r.LineTotalNet ?? 0)), 0);
    const term = (
        await rv.RunView<{ ID: string }>(
            { EntityName: SUBSCRIPTION_TERM_ENTITY, ExtraFilter: `OrderLineID='${RequireUUID(line.ID, 'OrderLineID')}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    let amended = 0;
    if (term) {
        const memos = await rv.RunView<{ CreditMemoAmount: number | null; ScheduleReduction: number | null }>(
            {
                EntityName: ORDER_CONCESSION_ENTITY,
                ExtraFilter: `SubscriptionTermID='${RequireUUID(term.ID, 'SubscriptionTermID')}' AND Status = 'Approved' AND DeliveryForm = 'Price' AND NewAmount IS NOT NULL`,
                Fields: ['ID', 'CreditMemoAmount', 'ScheduleReduction'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        amended = (memos.Results ?? []).reduce((n, m) => n + Number(m.CreditMemoAmount ?? 0) + Number(m.ScheduleReduction ?? 0), 0);
    }
    let refunded: number;
    if (known && known.ChargeID === chargeID) {
        refunded = known.Refunded;
    } else {
        const charge = await driver.RetrieveCharge({ ProviderChargeID: chargeID });
        if (!charge.Success || !charge.Charge) {
            throw new Error(`could not read charge ${chargeID} to see what the gateway refunded: ${charge.Reason ?? 'no reason given'}`);
        }
        // The refund of the gross charge, in the line's (net) terms.
        const refundedGross = Math.min(Math.max(charge.Charge.AmountRefunded, 0), gross);
        refunded = money(Math.min(gross > 0 ? (refundedGross * paid) / gross : 0, paid));
    }

    const credited = money(reversed + amended);
    return {
        OrderLineID: line.ID,
        OrderID: order.ID,
        OrderNumber: order.OrderNumber,
        SubscriptionID: line.RenewsSubscriptionID,
        ChargeID: chargeID,
        Paid: paid,
        Refunded: refunded,
        Credited: credited,
        Outstanding: money(Math.max(0, refunded - credited)),
    };
}

/**
 * True when the gateway has refunded ALL of the renewal's charge (net of tax, to the cent): the term is no longer
 * coverage the customer paid for. The ONE rule D19 uses to skip a refunded term when it picks the latest booked term
 * an end-of-term cancel ends with (#989 review, Q2), on the same `Refunded` / `Paid` figures the credit doors use.
 */
export function IsGatewayChargeFullyRefunded(credit: Pick<RenewalTermCredit, 'Paid' | 'Refunded'>): boolean {
    return Number(credit.Paid) > 0 && money(Number(credit.Refunded)) >= money(Number(credit.Paid));
}

export interface GatewayRenewalCreditOutcome {
    Credited: number;
    CreditOrderNumber?: string;
    Message: string;
}

/**
 * The ONE lock both doors take before deciding a renewal's credit: the subscription's row, `UPDLOCK, ROWLOCK`, held by
 * the caller's transaction until it ends (the cancel's own status lock is this same statement). A refund webhook and a
 * cancel of one subscription on two workers therefore decide one after the other, each re-reading the other's
 * committed credit (under read-committed snapshot too: every read after the lock is a fresh statement). Returns the
 * subscription's status, or null when it is gone.
 */
export async function LockSubscriptionForCredit(provider: IMetadataProvider, subscriptionID: string): Promise<string | null> {
    const sql = provider as unknown as { ExecuteSQL: (sql: string) => Promise<unknown> };
    const rows = (await sql.ExecuteSQL(
        `SELECT Status FROM __mj_BizAppsOrders.Subscription WITH (UPDLOCK, ROWLOCK) WHERE ID = '${RequireUUID(subscriptionID, 'SubscriptionID')}'`,
    )) as Array<{ Status?: string }> | { Results?: Array<{ Status?: string }> } | undefined;
    return (Array.isArray(rows) ? rows : (rows?.Results ?? []))[0]?.Status ?? null;
}

/**
 * The quantity a money credit reverses of a renewal line, at the column's 4dp scale, or 0 when it must be HELD. Pure.
 * The ONE rule both doors use.
 *
 *   · Sized from what is still owed back, not from the whole line: the quantity still returnable × credit ÷ the money
 *     not yet credited (`Paid − Credited`). Slices rounded one by one therefore track the money left, and can never
 *     eat the whole line early (1,199.95 then 0.05 of a 1,200 line: 0.9999 then 0.0001, never 1 then nothing).
 *   · The credit that takes the line's credits to all that was paid (it FINISHES the line) reverses exactly what is
 *     still returnable, so the slices always sum to the line (1/3 + 1/3 + 1/3 → 0.3333 + 0.3333 + 0.3334).
 *   · Any other slice is at least the smallest step (0.0001; its stated unit price makes it exact, so a one-cent
 *     refund of a $1,200 year is still a valid line) and leaves at least that step for the credit that finishes it.
 *   · So the line's quantity runs out only on the finishing credit, after which nothing more can be owed. A credit
 *     that cannot leave a step (one step is all that is left, and it does not finish the line) returns 0: HELD, never
 *     a throw (a throw would block the cancel that carries it). It is credited by the refund that finishes the line.
 */
export function CreditReversalQuantity(input: { Quantity: number; AlreadyReversed: number; Credit: number; Paid: number; Credited: number }): number {
    const step = 0.0001;
    const remaining = Math.round(Math.max(0, Number(input.Quantity) - Math.abs(Number(input.AlreadyReversed))) * 1e4) / 1e4;
    if (!(remaining > 0)) return 0;
    const left = money(Number(input.Paid) - Number(input.Credited));
    if (money(Number(input.Credited) + Number(input.Credit)) >= Number(input.Paid) || left <= 0) return remaining;
    const ceiling = Math.round((remaining - step) * 1e4) / 1e4;
    if (ceiling < step) return 0;
    const sized = Math.round(remaining * Math.min(1, Number(input.Credit) / left) * 1e4) / 1e4;
    return Math.min(Math.max(step, sized), ceiling);
}

/** `CreditReversalQuantity` for a credit of `amount` against the line now (its quantity and what is already reversed read). */
export async function GatewayCreditQuantity(term: RenewalTermCredit, amount: number, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const line = (
        await rv.RunView<{ Quantity: number }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID='${RequireUUID(term.OrderLineID, 'OrderLineID')}'`, Fields: ['ID', 'Quantity'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    return CreditReversalQuantity({
        Quantity: Math.max(Number(line?.Quantity ?? 0), 0),
        AlreadyReversed: await ReversedQuantityOf(term.OrderLineID, provider, user),
        Credit: amount,
        Paid: term.Paid,
        Credited: term.Credited,
    });
}

/** The quantity already reversed of a line (every reversal against it), positive. */
export async function ReversedQuantityOf(orderLineID: string, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const rows = await rv.RunView<{ Quantity: number | null }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ReversesOrderLineID='${RequireUUID(orderLineID, 'OrderLineID')}'`, Fields: ['ID', 'Quantity'], ResultType: 'simple', BypassCache: true },
        user,
    );
    return (rows.Results ?? []).reduce((n, r) => n + Math.abs(Number(r.Quantity ?? 0)), 0);
}

/**
 * The refund door (D20): credit the renewal sold by `orderLineID` by what the gateway refunded and Orders has not yet
 * credited, and APPLY that credit to the renewal so it owes nothing (see the header), then tell a person, once per
 * credit. Idempotent: a replayed refund finds nothing outstanding (and nothing left to apply). It decides under
 * `LockSubscriptionForCredit`, the lock the cancel takes too, and re-reads the position after it: a refund webhook and
 * a cancel on two workers cannot both credit one refund. Access and term dates are untouched.
 */
export async function CreditGatewayRenewalRefund(
    orderLineID: string,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<GatewayRenewalCreditOutcome> {
    const first = await GatewayRenewalCreditFor(orderLineID, driver, provider, user);
    if (!first) return { Credited: 0, Message: 'not a renewal the gateway charged' };

    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    let credit = 0;
    let creditOrder: { ID: string; OrderNumber: string } | null = null;
    /** A credit too small to split off what is left of the line (see CreditReversalQuantity): held, and a person told. */
    let held = 0;
    let applied: AppliedCredit;
    try {
        await LockSubscriptionForCredit(provider, first.SubscriptionID);
        // What Orders credited may have changed meanwhile (a cancel or another refund): re-read it under the lock. The
        // gateway's figure is the one read before the lock: no gateway round trip while the lock is held.
        const now = await GatewayRenewalCreditFor(orderLineID, driver, provider, user, { ChargeID: first.ChargeID, Refunded: first.Refunded });
        if (now && now.Outstanding > 0) {
            const booked = await emitCredit(now, now.Outstanding, provider, user);
            if (booked) {
                credit = now.Outstanding;
                creditOrder = booked;
            } else {
                held = now.Outstanding;
            }
        }
        // Whatever credit this renewal's reversals still hold (this one, or one booked before the refund's cash was
        // un-applied) goes onto the renewal, up to what it owes.
        applied = await ApplyGatewayCredit(orderLineID, provider, user);
        if (credit === 0 && applied.Applied === 0 && held === 0) {
            await db.RollbackTransaction();
            return { Credited: 0, Message: 'nothing refunded that is not already credited' };
        }
        await db.CommitTransaction();
    } catch (err) {
        await db.RollbackTransaction().catch(() => undefined);
        throw err;
    }
    const sub = await subscriptionNumber(first.SubscriptionID, provider, user);
    if (held > 0) {
        await raiseProviderSubscriptionAlert(
            {
                SubscriptionID: first.SubscriptionID,
                SubscriptionNumber: sub,
                Code: 'GatewayRenewalRefunded',
                Reason:
                    `the gateway refunded ${held.toFixed(2)} more of renewal ${first.OrderNumber} (charge ${first.ChargeID}), too small to split ` +
                    `off what is left of its line, so Orders has not credited it yet. It is credited with the refund that finishes the line; ` +
                    `if none comes, credit ${held.toFixed(2)} on ${first.OrderNumber} by hand. Access is unchanged.`,
                Linked: true,
                Key: `held ${first.ChargeID} ${first.Refunded.toFixed(2)}`,
            },
            user,
            provider,
        ).catch((err) => LogError(`[GatewayRenewalCredit] could not raise the notice for ${sub}: ${err}`));
    }
    if (!creditOrder) {
        return { Credited: 0, Message: held > 0 ? `${held.toFixed(2)} held (too small to split off the line)` : `applied ${applied.Applied.toFixed(2)} of credit already booked to ${first.OrderNumber}` };
    }

    const owing = applied.RenewalBalance;
    await raiseProviderSubscriptionAlert(
        {
            SubscriptionID: first.SubscriptionID,
            SubscriptionNumber: sub,
            Code: 'GatewayRenewalRefunded',
            Reason:
                `the gateway refunded ${credit.toFixed(2)} of renewal ${first.OrderNumber} (charge ${first.ChargeID}); Orders booked the credit ` +
                `as ${creditOrder.OrderNumber} and applied ${applied.Applied.toFixed(2)} of it to the renewal` +
                (applied.Skipped.length ? ` (some credit could not be applied now, ${applied.Skipped.join('; ')}: the nightly sync tries again)` : '') +
                (owing > 0.005
                    ? `, which still shows ${owing.toFixed(2)} owed. If the refund's cash is not yet un-applied there, the nightly sync applies the rest of the credit once it is; otherwise check the renewal's payments.`
                    : `, which now owes nothing.`) +
                ` Access is unchanged: if it should end, cancel the subscription.`,
            Linked: true,
            // One notice per credit: a second refund is told even while the first one's Task is still open.
            Key: creditOrder.OrderNumber,
        },
        user,
        provider,
    ).catch((err) => LogError(`[GatewayRenewalCredit] could not raise the notice for ${sub}: ${err}`));
    return { Credited: credit, CreditOrderNumber: creditOrder.OrderNumber, Message: `credited ${credit.toFixed(2)} on ${first.OrderNumber} as ${creditOrder.OrderNumber}` };
}

/** What `ApplyGatewayCredit` moved onto a renewal, what the renewal owes after it, and any credit it had to leave. */
export interface AppliedCredit {
    Applied: number;
    RenewalBalance: number;
    /** Credit orders it could not apply from (refused, e.g. spent meanwhile), with why: left for the nightly sweep. */
    Skipped: string[];
}

/**
 * Apply the credit a gateway renewal's reversals still hold to the renewal itself (D20, the credit-note model): each
 * order reversing the renewal line with a negative balance (its unapplied credit) settles the renewal through
 * `Orders.ApplyAccountCredit`, up to what the renewal owes. The renewal then reads "sold 599, credit 599, owes 0" and
 * the credit order 0; its total is never changed. Called by both doors under `LockSubscriptionForCredit`, inside the
 * caller's transaction. A line that is not a gateway renewal: nothing.
 *
 *   · Each credit order gives this renewal at most ITS slice: what its lines reversing THIS renewal line credit, less
 *     what it already applied here. One cancel's credit order can carry slices of several renewals; renewal 1 owing
 *     more than its own slice never takes renewal 2's.
 *   · The rows are locked first, in one order (by id: every credit order and the renewal), before any application
 *     takes the payment-number lock, the same order `Orders.ApplyAccountCredit` locks in: no deadlock with a person
 *     spending one of these credits on the Account Credit page at the same moment.
 *   · A refused application (that credit was spent meanwhile) never undoes the caller's work, the credit just booked
 *     included: re-read, apply what is left once, else leave it (`Skipped`) for the nightly sweep.
 *   · Idempotent: an applied credit leaves no negative balance behind, and a renewal that owes nothing takes nothing.
 */
export async function ApplyGatewayCredit(orderLineID: string, provider: IMetadataProvider, user: UserInfo): Promise<AppliedCredit> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const line = (
        await rv.RunView<{ ID: string; OrderHeaderID: string }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID='${RequireUUID(orderLineID, 'OrderLineID')}'`, Fields: ['ID', 'OrderHeaderID'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    if (!line) return { Applied: 0, RenewalBalance: 0, Skipped: [] };
    const reversals = await rv.RunView<{ OrderHeaderID: string; LineTotalNet: number | null }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ReversesOrderLineID='${RequireUUID(line.ID, 'OrderLineID')}'`, Fields: ['ID', 'OrderHeaderID', 'LineTotalNet'], ResultType: 'simple', BypassCache: true },
        user,
    );
    // Each credit order's slice of THIS renewal line.
    const slices = new Map<string, number>();
    for (const r of reversals.Results ?? []) {
        const id = String(r.OrderHeaderID).toLowerCase();
        slices.set(id, money((slices.get(id) ?? 0) + Math.abs(Number(r.LineTotalNet ?? 0))));
    }
    const balanceOf = async (id: string): Promise<{ Balance: number; Origin: string | null }> => {
        const r = (
            await rv.RunView<{ Balance: number | null; Origin: string | null }>(
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID='${RequireUUID(id, 'OrderHeaderID')}'`, Fields: ['ID', 'Balance', 'Origin'], ResultType: 'simple', BypassCache: true },
                user,
            )
        ).Results?.[0];
        return { Balance: money(Number(r?.Balance ?? 0)), Origin: r?.Origin ?? null };
    };
    const first = await balanceOf(line.OrderHeaderID);
    if (first.Origin !== 'ProviderPayment') return { Applied: 0, RenewalBalance: first.Balance, Skipped: [] };
    if (first.Balance <= 0.005 || !slices.size) return { Applied: 0, RenewalBalance: first.Balance, Skipped: [] };

    await LockOrderRows(provider, [line.OrderHeaderID, ...slices.keys()]);
    let owing = (await balanceOf(line.OrderHeaderID)).Balance;
    let applied = 0;
    const skipped: string[] = [];
    for (const [id, slice] of slices) {
        if (owing <= 0.005) break;
        const left = money(slice - (await AppliedFromTo(id, line.OrderHeaderID, provider, user)));
        const tryApply = async (): Promise<{ Amount: number; Refusal?: string }> => {
            const held = -(await balanceOf(id)).Balance;
            const amount = money(Math.min(held, owing, left));
            if (amount <= 0.005) return { Amount: 0 };
            const result = await new ApplyAccountCreditOperation().ExecuteServer(
                { SourceOrderHeaderID: id, TargetOrderHeaderID: line.OrderHeaderID, Amount: amount, Reason: 'Credit for a refund the payment gateway made on this renewal' },
                { provider, user, emitProgress: () => undefined },
            );
            if (!result.Success || !result.Output?.Success) return { Amount: 0, Refusal: result.Output?.Message ?? result.ErrorMessage ?? 'unknown error' };
            return { Amount: amount };
        };
        let outcome = await tryApply();
        if (outcome.Refusal) outcome = { ...(await tryApply()), Refusal: outcome.Refusal };
        if (outcome.Amount === 0 && outcome.Refusal) skipped.push(`${id}: ${outcome.Refusal}`);
        applied = money(applied + outcome.Amount);
        owing = money(owing - outcome.Amount);
    }
    return { Applied: applied, RenewalBalance: owing, Skipped: skipped };
}

/**
 * Lock, in the one order, every row `ApplyGatewayCredit` may lock for these renewal lines (their orders and every order
 * reversing them), BEFORE the first application takes the payment-number lock. A caller applying for more than one
 * line (a cancel of several terms, the sweep) calls it first, so no row lock is ever taken after that one.
 */
export async function LockGatewayCreditRows(orderLineIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<void> {
    if (!orderLineIDs.length) return;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const ids = orderLineIDs.map((l) => `'${RequireUUID(l, 'OrderLineID')}'`).join(',');
    const rows = await rv.RunView<{ OrderHeaderID: string }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID IN (${ids}) OR ReversesOrderLineID IN (${ids})`, Fields: ['ID', 'OrderHeaderID'], ResultType: 'simple', BypassCache: true },
        user,
    );
    await LockOrderRows(provider, (rows.Results ?? []).map((r) => r.OrderHeaderID));
}

/** What credit order `sourceID` has already applied to `targetID` (Orders.ApplyAccountCredit's +X legs). */
async function AppliedFromTo(sourceID: string, targetID: string, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const rows = await rv.RunView<{ Amount: number | null }>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter:
                `OrderHeaderID='${RequireUUID(targetID, 'OrderHeaderID')}' AND PaymentHeaderID IN (SELECT ph.ID FROM __mj_BizAppsOrders.PaymentHeader ph ` +
                `JOIN __mj_BizAppsOrders.PaymentDetail pd ON pd.ID = ph.PaymentDetailID WHERE pd.SourceOrderHeaderID = '${RequireUUID(sourceID, 'OrderHeaderID')}')`,
            Fields: ['ID', 'Amount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return money((rows.Results ?? []).reduce((n, r) => n + Number(r.Amount ?? 0), 0));
}

/**
 * The sweep's half of D20 (round 5): apply any gateway credit a subscription's renewals still hold on account. A credit
 * can sit unapplied when it was booked while the renewal owed nothing yet (a cancel's reversal recorded while the
 * refund's cash was still applied), and a refund booked by hand never passes the refund door that would apply it. The
 * daily sync calls this for every gateway-billed subscription it reads.
 *
 * Cheap when there is nothing to do (the usual case): two reads, no transaction. Otherwise under the shared
 * subscription lock, with `ApplyGatewayCredit` per renewal line (idempotent), on the caller's own provider.
 */
export async function SettleGatewayRenewalCredits(subscriptionID: string, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `RenewsSubscriptionID='${RequireUUID(subscriptionID, 'SubscriptionID')}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const ids = (lines.Results ?? []).map((l) => `'${RequireUUID(l.ID, 'OrderLineID')}'`);
    if (!ids.length) return 0;
    const reversals = await rv.RunView<{ OrderHeaderID: string }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ReversesOrderLineID IN (${ids.join(',')})`, Fields: ['ID', 'OrderHeaderID'], ResultType: 'simple', BypassCache: true },
        user,
    );
    const creditOrders = [...new Set((reversals.Results ?? []).map((r) => `'${RequireUUID(r.OrderHeaderID, 'OrderHeaderID')}'`))];
    if (!creditOrders.length) return 0;
    const held = await rv.RunView<{ ID: string }>(
        { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${creditOrders.join(',')}) AND Balance < -0.005`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!(held.Results ?? []).length) return 0;
    // And a renewal that owes something to take it (a credit order's small residue, e.g. a taxed charge's tax share,
    // has nothing to settle: no transaction for it every night).
    const renewalOrders = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `Balance > 0.005 AND Origin = 'ProviderPayment' AND ID IN (SELECT OrderHeaderID FROM __mj_BizAppsOrders.OrderLine WHERE RenewsSubscriptionID = '${RequireUUID(subscriptionID, 'SubscriptionID')}')`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!(renewalOrders.Results ?? []).length) return 0;

    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        await LockSubscriptionForCredit(provider, subscriptionID);
        await LockGatewayCreditRows((lines.Results ?? []).map((l) => l.ID), provider, user);
        let applied = 0;
        for (const l of lines.Results ?? []) applied = money(applied + (await ApplyGatewayCredit(l.ID, provider, user)).Applied);
        await db.CommitTransaction();
        return applied;
    } catch (err) {
        await db.RollbackTransaction().catch(() => undefined);
        throw err;
    }
}

/** A money-only reversal of `credit` against the renewal line: its unit price stated so the credit is to the cent. */
async function emitCredit(term: RenewalTermCredit, credit: number, provider: IMetadataProvider, user: UserInfo): Promise<{ ID: string; OrderNumber: string } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const original = (
        await rv.RunView<{ ID: string; OrderHeaderID: string; ProductID: string; Quantity: number; CompanyID: string }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID='${RequireUUID(term.OrderLineID, 'OrderLineID')}'`, Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Quantity', 'CompanyID'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    const header = (
        await rv.RunView<{ ID: string; CompanyID: string; BillToOrganizationID: string | null; BillToPersonID: string | null }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID='${RequireUUID(term.OrderID, 'OrderID')}'`, Fields: ['ID', 'CompanyID', 'BillToOrganizationID', 'BillToPersonID'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    const termRow = (
        await rv.RunView<{ StartDate: string; EndDate: string }>(
            { EntityName: SUBSCRIPTION_TERM_ENTITY, ExtraFilter: `OrderLineID='${RequireUUID(term.OrderLineID, 'OrderLineID')}'`, Fields: ['ID', 'StartDate', 'EndDate'], ResultType: 'simple', BypassCache: true },
            user,
        )
    ).Results?.[0];
    if (!original || !header) throw new Error(`renewal ${term.OrderNumber} could not be read to credit it`);

    const reversalQuantity = CreditReversalQuantity({
        Quantity: Math.max(Number(original.Quantity), 0),
        AlreadyReversed: await ReversedQuantityOf(original.ID, provider, user),
        Credit: credit,
        Paid: term.Paid,
        Credited: term.Credited,
    });
    // Too small to split off what is left of the line, and not the credit that finishes it: held (the caller tells a person).
    if (reversalQuantity === 0) return null;

    // The business day of the credit (the business zone, never the server clock's UTC day).
    const today = TodayAsDateValue();
    const start = termRow ? new Date(termRow.StartDate) : today;
    const end = termRow ? new Date(termRow.EndDate) : today;
    // The credit spreads over what is left of the term (all of it before it starts, its last day after it ended).
    const from = new Date(Math.min(Math.max(today.getTime(), start.getTime()), end.getTime()));

    const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
    order.NewRecord();
    order.OrderType = 'Cancellation';
    // A reversal of a gateway-billed renewal's line is allowed for this credit, and takes no access away.
    SanctionCancellationReversal(order);
    SanctionMoneyOnlyReversal(order);
    order.OrderDate = today;
    order.CompanyID = header.CompanyID;
    order.BillToOrganizationID = header.BillToOrganizationID;
    order.BillToPersonID = header.BillToPersonID;
    order.ReversesOrderHeaderID = header.ID;
    order.Notes = `Credit for the payment gateway's refund on charge ${term.ChargeID} (renewal ${term.OrderNumber}); access unchanged`;
    const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    MarkAsOrdersOwnWrite(line);
    line.NewRecord();
    line.ProductID = original.ProductID;
    line.LineNumber = 1;
    line.Quantity = -reversalQuantity;
    line.UnitPrice = Math.round((credit / reversalQuantity) * 1e4) / 1e4;
    line.ReversesOrderLineID = original.ID;
    line.ServicePeriodStart = from;
    line.ServicePeriodEnd = end;
    order.Lines.Add(line);
    order.Status = 'Confirmed';
    if (!(await order.Save())) {
        throw new Error(`Could not book the credit for ${term.OrderNumber}: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return { ID: order.ID, OrderNumber: order.OrderNumber };
}

async function subscriptionNumber(subscriptionID: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ SubscriptionNumber: string }>(
        { EntityName: SUBSCRIPTION_ENTITY, ExtraFilter: `ID='${RequireUUID(subscriptionID, 'SubscriptionID')}'`, Fields: ['ID', 'SubscriptionNumber'], ResultType: 'simple', BypassCache: true },
        user,
    );
    return r.Results?.[0]?.SubscriptionNumber ?? subscriptionID;
}
