/**
 * TermShift — move a booked term's start and end together, with recognition, access, renewal and the
 * payment schedule following (#507).
 *
 * WHAT CARRIES IT. A Shift `OrderConcession` records who asked, why, and the term's dates before and after.
 * A shift is a term change, not a sales concession: it is valued at zero and routed by the
 * `TermShiftReviewDays` setting, not by the rep's authority (see OrderConcessionEntityServer). Applying it
 * changes no receivable and produces no customer document. What changes:
 *   - the term's `StartDate` and `EndDate`, and the selling line's service period so the two still agree;
 *   - the subscription's `StartDate`, when this term is where the subscription started;
 *   - the recognition schedule: offsets, a re-spread from the new start, and one catch-up or reversal in the
 *     current open period for the periods already behind us, planned by ./TermShiftPlan.ts;
 *   - access: every grant that follows the term runs over the new dates;
 *   - the renewal, without being touched: `SpawnRenewals` reads the latest term's end, so it moves with it;
 *   - the payment schedule: instalments not yet invoiced move by the same days, when the term's line is the
 *     only thing the order bills. Invoiced ones stay. On an order that bills other lines too, the schedule is
 *     the whole order's, so it is left alone and the acknowledgment task says so;
 *   - a `Rescheduled` subscription event naming the concession and pairing each offset with what it offsets;
 *   - an acknowledgment task for accounting, as for every amendment that re-cuts a term.
 *
 * WHEN IT IS REFUSED, and nothing is written: the same refusals as an extension (./TermExtension.ts) — the
 * term is not Scheduled or Active, its renewal is placed, a staged entry needing an offset is batched, or no
 * one other than the requester can acknowledge it — and when the term's dates no longer match the dates the
 * concession was recorded against.
 *
 * Every write joins the caller's transaction: the concession's approval and its application commit together.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (a Shift concession reaching Approved) · AmendArrangementOperation (preview)
 *   PLAN:   ./TermShiftPlan.ts
 *   READS:  ./TermExtension.ts (the checks and reads an extension shares)
 *   WRITES: Accounting.CreateJournalEntries · Subscription Terms · Subscriptions · Order Lines · Entitlement
 *           Grants · Order Header Payment Schedules · Subscription Events · Tasks, Task Links, Task Assignments
 */
import type {
    mjBizAppsOrdersEntitlementGrantEntity,
    mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import { EntityIDFor, SubmitJournalEntryDrafts } from './AccountingBridge.js';
import { CalendarDayOrToday } from './calendar-day.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import { OrdersSettings } from './OrdersSettings.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { SanctionTermAmendment, SubscriptionTermEntityServer } from './SubscriptionTermEntityServer.js';
import {
    AcknowledgerIDs,
    AddDays,
    AsDay,
    IsoDay,
    RaiseRecutAcknowledgment,
    ReadRows,
    RenewalAlreadyPlaced,
    StagedRecognitionEntries,
    TermRecognition,
    type TermRow,
} from './TermExtension.js';
import { PlanTermShift, type TermShiftPlan } from './TermShiftPlan.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const ROLE_ENTITY = 'MJ: Roles';

export interface TermShiftRequest {
    SubscriptionTermID: string;
    /** Whole days the start and end both move; positive is later. */
    ShiftDays: number;
    /** Who asked. Excluded from the acknowledgment, which they cannot confirm themselves. */
    RequestedByUserID: string;
}

/** An instalment the shift moves. */
export interface ShiftedInstalment {
    ID: string;
    InstallmentNumber: number;
    DueDate: Date;
    NewDueDate: Date;
}

/** Everything a shift would do, read and planned but not written. */
export interface CheckedTermShift {
    TermID: string;
    TermNumber: number;
    SubscriptionID: string;
    SubscriptionNumber: string;
    OrderLineID: string;
    OrderHeaderID: string;
    ProductName: string;
    TermAmount: number;
    ShiftDays: number;
    CurrentStartDate: Date;
    CurrentEndDate: Date;
    NewStartDate: Date;
    NewEndDate: Date;
    EffectiveDate: Date;
    Plan: TermShiftPlan;
    /** True when the subscription started with this term, so its start moves too. */
    MovesSubscriptionStart: boolean;
    /** Instalments not yet invoiced that move, when the term's line is all the order bills. */
    Instalments: ShiftedInstalment[];
    /** Set when the order's instalments are left alone, saying why. */
    InstalmentsLeft: string | null;
    AcknowledgerIDs: string[];
}

/** Check a shift and plan it, or say why it cannot be made. Reads only. */
export async function CheckTermShift(request: TermShiftRequest, ctx: ApprovalTaskContext): Promise<CheckedTermShift | string> {
    const days = Number(request.ShiftDays);
    if (!Number.isInteger(days) || days === 0) return 'A term shift must move its dates by a whole number of days.';

    const term = (
        await ReadRows<TermRow>(ctx, {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(request.SubscriptionTermID, 'SubscriptionTermID')}'`,
            Fields: ['ID', 'SubscriptionID', 'TermNumber', 'OrderLineID', 'StartDate', 'EndDate', 'Amount', 'Status', 'RevenueRecognitionTypeID'],
            ResultType: 'simple',
        })
    )[0];
    if (!term) return `Subscription term ${request.SubscriptionTermID} was not found.`;
    if (term.Status !== 'Scheduled' && term.Status !== 'Active') {
        return `Term ${term.TermNumber} is ${term.Status}; only a Scheduled or Active term can be moved.`;
    }

    const renewal = await RenewalAlreadyPlaced(term, ctx);
    if (renewal) return renewal;

    const subscription = (
        await ReadRows<{ SubscriptionNumber: string; SubscriptionTypeID: string; ProductID: string; StartDate: Date | string }>(ctx, {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(term.SubscriptionID, 'SubscriptionID')}'`,
            Fields: ['SubscriptionNumber', 'SubscriptionTypeID', 'ProductID', 'StartDate'],
            ResultType: 'simple',
        })
    )[0];
    if (!subscription) return `The subscription of term ${term.TermNumber} was not found.`;

    const lines = await ReadRows<{ ID: string; OrderHeaderID: string }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `ID = '${RequireUUID(term.OrderLineID, 'OrderLineID')}'`,
        Fields: ['ID', 'OrderHeaderID'],
        ResultType: 'simple',
    });
    const line = lines[0];
    if (!line) return `The order line that bought term ${term.TermNumber} was not found.`;

    const product = (
        await ReadRows<{ Name: string }>(ctx, {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(subscription.ProductID, 'ProductID')}'`,
            Fields: ['Name'],
            ResultType: 'simple',
        })
    )[0];

    const acknowledgers = await AcknowledgerIDs(request.RequestedByUserID, ctx);
    if (typeof acknowledgers === 'string') return acknowledgers;

    const currentStart = AsDay(term.StartDate);
    const currentEnd = AsDay(term.EndDate);
    const newStart = AddDays(currentStart, days);
    const newEnd = AddDays(currentEnd, days);
    const effective = await CalendarDayOrToday(undefined, ctx.Provider, ctx.User);
    const planLabel = `term ${term.TermNumber} of ${subscription.SubscriptionNumber} moved to ${IsoDay(newStart)} – ${IsoDay(newEnd)}`;

    const recognition = await TermRecognition(term, subscription.SubscriptionTypeID, ctx);
    const entries = recognition ? await StagedRecognitionEntries(term.ID, ctx) : [];
    const plan = PlanTermShift({
        Entries: entries,
        EffectiveDate: effective,
        NewStartDate: newStart,
        NewEndDate: newEnd,
        Driver: recognition?.Driver ?? null,
        PeriodMonths: recognition?.PeriodMonths ?? 1,
        LinkedEntityID: EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
        LinkedRecordID: term.ID,
        Label: planLabel,
        ProductName: product?.Name ?? 'subscription',
    });
    if (typeof plan === 'string') return plan;

    const instalments = await instalmentsToMove(line.OrderHeaderID, days, ctx);

    return {
        TermID: term.ID,
        TermNumber: term.TermNumber,
        SubscriptionID: term.SubscriptionID,
        SubscriptionNumber: subscription.SubscriptionNumber,
        OrderLineID: line.ID,
        OrderHeaderID: line.OrderHeaderID,
        ProductName: product?.Name ?? 'subscription',
        TermAmount: Number(term.Amount),
        ShiftDays: days,
        CurrentStartDate: currentStart,
        CurrentEndDate: currentEnd,
        NewStartDate: newStart,
        NewEndDate: newEnd,
        EffectiveDate: effective,
        Plan: plan,
        MovesSubscriptionStart: IsoDay(AsDay(subscription.StartDate)) === IsoDay(currentStart),
        Instalments: instalments.Moved,
        InstalmentsLeft: instalments.Left,
        AcknowledgerIDs: acknowledgers,
    };
}

/** The Shift concession a shift is applied from. */
export interface ApprovedShiftConcession {
    ID: string;
    SubscriptionTermID: string;
    PriorStartDate: Date;
    PriorEndDate: Date;
    NewStartDate: Date;
    RequestedByUserID: string;
    ReasonCategory: string;
    Reason: string;
}

/**
 * Apply an approved Shift concession to its term. Joins the caller's transaction; throws on any refusal, so
 * the caller's approval rolls back with it.
 */
export async function ApplyTermShift(concession: ApprovedShiftConcession, ctx: ApprovalTaskContext): Promise<CheckedTermShift> {
    const priorStart = AsDay(concession.PriorStartDate);
    const days = Math.round((AsDay(concession.NewStartDate).getTime() - priorStart.getTime()) / 86_400_000);
    const checked = await CheckTermShift(
        { SubscriptionTermID: concession.SubscriptionTermID, ShiftDays: days, RequestedByUserID: concession.RequestedByUserID },
        ctx,
    );
    if (typeof checked === 'string') throw new Error(`The term shift cannot be applied: ${checked}`);
    if (IsoDay(checked.CurrentStartDate) !== IsoDay(priorStart) || IsoDay(checked.CurrentEndDate) !== IsoDay(AsDay(concession.PriorEndDate))) {
        throw new Error(
            `The term shift cannot be applied: term ${checked.TermNumber} now runs ${IsoDay(checked.CurrentStartDate)} – ` +
                `${IsoDay(checked.CurrentEndDate)}, not the ${IsoDay(priorStart)} – ${IsoDay(AsDay(concession.PriorEndDate))} it was recorded against.`,
        );
    }

    const plan = checked.Plan;
    const drafts = [...plan.Offsets, ...(plan.Correction ? [plan.Correction] : []), ...plan.Schedule];
    const written = drafts.length
        ? await SubmitJournalEntryDrafts(drafts, `the move of ${label(checked)}`, ctx.Provider, ctx.User)
        : { Success: true, Results: [] };
    const results = written.Results ?? [];

    await moveTerm(checked, ctx);
    await moveLineServicePeriod(checked, ctx);
    if (checked.MovesSubscriptionStart) await moveSubscriptionStart(checked, ctx);
    await moveTermGrants(checked, ctx);
    await moveInstalments(checked, ctx);
    await logRescheduled(checked, concession, results, ctx);
    await RaiseRecutAcknowledgment(
        {
            Name: `Confirm the recognition re-cut: ${label(checked)}`,
            Description: acknowledgmentDescription(checked, concession),
            TermID: checked.TermID,
            OrderConcessionID: concession.ID,
            OrderHeaderID: checked.OrderHeaderID,
            AcknowledgerIDs: checked.AcknowledgerIDs,
        },
        ctx,
    );
    return checked;
}

/**
 * The role that reviews a shift at or above `TermShiftReviewDays`: the finance acknowledgment role
 * (`AmendmentAcknowledgmentRole`), the same people who confirm the re-cut. Null when it is not configured.
 */
export async function ShiftReviewRoleID(ctx: ApprovalTaskContext): Promise<string | null> {
    await OrdersSettings.Load(ctx.Provider, ctx.User);
    const roleName = OrdersSettings.AmendmentAcknowledgmentRole;
    if (!roleName) return null;
    const role = (
        await ReadRows<{ ID: string }>(ctx, {
            EntityName: ROLE_ENTITY,
            ExtraFilter: `Name = '${EscapeText(roleName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        })
    )[0];
    return role?.ID ?? null;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * The order's instalments not yet invoiced, moved by `days`, when the order bills one line. An order with
 * more lines has one schedule for all of them, so moving it would move what other lines owe.
 */
async function instalmentsToMove(
    orderHeaderID: string,
    days: number,
    ctx: ApprovalTaskContext,
): Promise<{ Moved: ShiftedInstalment[]; Left: string | null }> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const rows = await ReadRows<{ ID: string; InstallmentNumber: number; DueDate: Date | string }>(ctx, {
        EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}' AND Status = 'Scheduled'`,
        Fields: ['ID', 'InstallmentNumber', 'DueDate'],
        OrderBy: 'InstallmentNumber',
        ResultType: 'simple',
    });
    if (rows.length === 0) return { Moved: [], Left: null };

    const lines = await ReadRows<{ ID: string }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    if (lines.length !== 1) {
        return {
            Moved: [],
            Left:
                `The order's ${rows.length} instalment${rows.length === 1 ? '' : 's'} not yet invoiced also bill its other ` +
                `lines, so their due dates were not moved. Adjust them by hand if the customer's payment dates should follow the term.`,
        };
    }
    return {
        Moved: rows.map((r) => ({
            ID: r.ID,
            InstallmentNumber: r.InstallmentNumber,
            DueDate: AsDay(r.DueDate),
            NewDueDate: AddDays(AsDay(r.DueDate), days),
        })),
        Left: null,
    };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

async function moveTerm(checked: CheckedTermShift, ctx: ApprovalTaskContext): Promise<void> {
    const term = await ctx.Provider.GetEntityObject<SubscriptionTermEntityServer>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
    if (!(await term.Load(checked.TermID))) throw new Error(`Subscription term ${checked.TermID} was not found.`);
    SanctionTermAmendment(term);
    term.StartDate = checked.NewStartDate;
    term.EndDate = checked.NewEndDate;
    if (!(await term.Save())) {
        throw new Error(`Term ${checked.TermNumber} could not be moved: ${term.LatestResult?.CompleteMessage}`);
    }
}

/** Booking set the line's service period from the term; keep them the same so a later reversal reads the term's window. */
async function moveLineServicePeriod(checked: CheckedTermShift, ctx: ApprovalTaskContext): Promise<void> {
    const line = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
    MarkAsOrdersOwnWrite(line);
    if (!(await line.Load(checked.OrderLineID))) throw new Error(`Order line ${checked.OrderLineID} was not found.`);
    line.ServicePeriodStart = checked.NewStartDate;
    line.ServicePeriodEnd = checked.NewEndDate;
    if (!(await line.Save())) {
        throw new Error(`The service period of the line that bought term ${checked.TermNumber} could not be moved: ${line.LatestResult?.CompleteMessage}`);
    }
}

async function moveSubscriptionStart(checked: CheckedTermShift, ctx: ApprovalTaskContext): Promise<void> {
    const subscription = await ctx.Provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(SUBSCRIPTION_ENTITY, ctx.User);
    if (!(await subscription.Load(checked.SubscriptionID))) throw new Error(`Subscription ${checked.SubscriptionID} was not found.`);
    subscription.StartDate = checked.NewStartDate;
    if (!(await subscription.Save())) {
        throw new Error(`The start of ${checked.SubscriptionNumber} could not be moved: ${subscription.LatestResult?.CompleteMessage}`);
    }
}

/**
 * A grant that follows the term now runs over the new dates. It starts on the new start unless it started
 * later than that, as a grant given on payment can.
 */
async function moveTermGrants(checked: CheckedTermShift, ctx: ApprovalTaskContext): Promise<void> {
    const grants = await ReadRows<mjBizAppsOrdersEntitlementGrantEntity>(ctx, {
        EntityName: ENTITLEMENT_GRANT_ENTITY,
        ExtraFilter: `SubscriptionTermID = '${RequireUUID(checked.TermID, 'SubscriptionTermID')}' AND ValidityModeApplied = 'SubscriptionTerm'`,
        ResultType: 'entity_object',
    });
    for (const grant of grants) {
        const from = grant.ValidFrom ? AsDay(grant.ValidFrom) : null;
        if (!from || IsoDay(from) === IsoDay(checked.CurrentStartDate) || from.getTime() < checked.NewStartDate.getTime()) {
            grant.ValidFrom = checked.NewStartDate;
        }
        grant.ValidTo = checked.NewEndDate;
        if (!(await grant.Save())) {
            throw new Error(`Access granted by term ${checked.TermNumber} could not be moved: ${grant.LatestResult?.CompleteMessage}`);
        }
    }
}

async function moveInstalments(checked: CheckedTermShift, ctx: ApprovalTaskContext): Promise<void> {
    for (const instalment of checked.Instalments) {
        const row = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
        if (!(await row.Load(instalment.ID))) throw new Error(`Instalment ${instalment.ID} was not found.`);
        row.DueDate = instalment.NewDueDate;
        if (!(await row.Save())) {
            throw new Error(`Instalment ${instalment.InstallmentNumber} could not be moved: ${row.LatestResult?.CompleteMessage}`);
        }
    }
}

async function logRescheduled(
    checked: CheckedTermShift,
    concession: ApprovedShiftConcession,
    results: Array<{ JournalEntryID?: string; EntryNumber?: string }>,
    ctx: ApprovalTaskContext,
): Promise<void> {
    const plan = checked.Plan;
    const correctionAt = plan.Offsets.length;
    const scheduleAt = correctionAt + (plan.Correction ? 1 : 0);
    const event = await ctx.Provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, ctx.User);
    event.NewRecord();
    event.SubscriptionID = checked.SubscriptionID;
    event.EventType = 'Rescheduled';
    event.OccurredAt = new Date();
    event.RelatedOrderHeaderID = checked.OrderHeaderID;
    event.Set(
        'EventData',
        JSON.stringify({
            TermNumber: checked.TermNumber,
            Action: 'Amendment',
            OrderConcessionID: concession.ID,
            ReasonCategory: concession.ReasonCategory,
            ShiftDays: checked.ShiftDays,
            PreviousStartDate: IsoDay(checked.CurrentStartDate),
            PreviousEndDate: IsoDay(checked.CurrentEndDate),
            NewStartDate: IsoDay(checked.NewStartDate),
            NewEndDate: IsoDay(checked.NewEndDate),
            EffectiveDate: IsoDay(checked.EffectiveDate),
            Offsets: plan.Targets.map((target, i) => ({
                Offsets: target.EntryNumber,
                JournalEntryID: results[i]?.JournalEntryID ?? null,
                EntryNumber: results[i]?.EntryNumber ?? null,
            })),
            Correction: plan.Correction
                ? { Amount: plan.CorrectionAmount, EntryNumber: results[correctionAt]?.EntryNumber ?? null }
                : null,
            NewSchedule: plan.Schedule.map((draft, i) => ({
                EffectiveDate: draft.EffectiveDate,
                Amount: draft.Lines[0].DebitAmount ?? 0,
                EntryNumber: results[scheduleAt + i]?.EntryNumber ?? null,
            })),
            Instalments: checked.Instalments.map((m) => ({
                InstallmentNumber: m.InstallmentNumber,
                PreviousDueDate: IsoDay(m.DueDate),
                NewDueDate: IsoDay(m.NewDueDate),
            })),
        }),
    );
    if (!(await event.Save())) {
        throw new Error(`The move of term ${checked.TermNumber} could not be logged: ${event.LatestResult?.CompleteMessage}`);
    }
}

function acknowledgmentDescription(checked: CheckedTermShift, concession: ApprovedShiftConcession): string {
    const plan = checked.Plan;
    const before = plan.Targets.map((t) => `  ${IsoDay(t.EffectiveDate)}  ${t.EntryNumber}`).join('\n');
    const after = plan.Schedule.map((d) => `  ${d.EffectiveDate}  ${d.Lines[0].DebitAmount ?? 0}`).join('\n');
    const correction =
        plan.CorrectionAmount > 0
            ? `${plan.CorrectionAmount} of revenue the new dates place before ${IsoDay(checked.EffectiveDate)} was caught up on that day. ` +
              'This correction crosses a posted period.'
            : plan.CorrectionAmount < 0
              ? `${-plan.CorrectionAmount} of revenue recognised before ${IsoDay(checked.EffectiveDate)} that the new dates place later ` +
                'was reversed on that day. This correction crosses a posted period.'
              : '';
    const instalments = checked.Instalments.length
        ? `Instalments not yet invoiced moved ${Math.abs(checked.ShiftDays)} days ${checked.ShiftDays > 0 ? 'later' : 'earlier'}: ` +
          checked.Instalments.map((m) => `#${m.InstallmentNumber} ${IsoDay(m.DueDate)} → ${IsoDay(m.NewDueDate)}`).join(', ') +
          '.'
        : (checked.InstalmentsLeft ?? '');
    return [
        `Term ${checked.TermNumber} of ${checked.SubscriptionNumber} now runs ${IsoDay(checked.NewStartDate)} – ${IsoDay(checked.NewEndDate)} ` +
            `instead of ${IsoDay(checked.CurrentStartDate)} – ${IsoDay(checked.CurrentEndDate)}, at the same price ` +
            `(${concession.ReasonCategory}: ${concession.Reason}). No invoice or receivable changed. Confirm that the ` +
            `recognition schedule below was re-cut, then complete this task.`,
        correction,
        instalments,
        plan.Targets.length
            ? `Offset from ${IsoDay(checked.EffectiveDate)}: ${plan.Targets.length} staged entries, each on its own date.\n${before}`
            : 'No staged recognition entries were dated on or after the effective date.',
        plan.Schedule.length ? `New schedule from ${IsoDay(checked.EffectiveDate)}, ${plan.Schedule.length} entries:\n${after}` : '',
    ]
        .filter((part) => part !== '')
        .join('\n\n');
}

function label(checked: CheckedTermShift): string {
    return `term ${checked.TermNumber} of ${checked.SubscriptionNumber} moved to ${IsoDay(checked.NewStartDate)} – ${IsoDay(checked.NewEndDate)}`;
}
