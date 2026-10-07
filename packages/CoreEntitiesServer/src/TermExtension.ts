/**
 * TermExtension — extend a booked term at no charge, with recognition, access and renewal following (golive #221, case B).
 *
 * WHAT CARRIES IT. The approved Duration `OrderConcession` is the amendment: it records who asked, why, the
 * value given away and who approved it. Applying it changes no receivable and produces no customer document —
 * the same invoice now covers a longer period — so there is no amendment order to book. What changes:
 *   - the term's `EndDate`, and the selling line's `ServicePeriodEnd` so the two still agree;
 *   - the recognition schedule: offsets and a prospective re-spread, planned by ./TermExtensionPlan.ts;
 *   - access: every grant that follows the term runs to the new end;
 *   - the renewal, without being touched: `SpawnRenewals` reads the latest term's end, so it moves with it;
 *   - an `Extended` subscription event naming the concession and pairing each offset with what it offsets;
 *   - an acknowledgment task for accounting, because nothing else would surface the change: AR does not move.
 *
 * WHEN IT IS REFUSED, and nothing is written:
 *   - the term is not Scheduled or Active, or is not the subscription's latest (its renewal is already placed:
 *     reverse that first);
 *   - a staged entry that would need an offset is already in a journal-entry batch;
 *   - no acknowledgment role is configured, or no active holder of it other than the requester exists.
 * `CheckTermExtension` runs the same checks when the concession is recorded, so a request that could never
 * be applied is refused up front rather than approved and then refused.
 *
 * Every write joins the caller's transaction: the concession's approval and its application commit together.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (a Duration concession reaching Approved) · AmendArrangementOperation (preview)
 *   PLAN:   ./TermExtensionPlan.ts
 *   WRITES: Accounting.CreateJournalEntries · Subscription Terms · Order Lines · Entitlement Grants ·
 *           Subscription Events · Tasks, Task Links, Task Assignments
 */
import {
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import type {
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import {
    LoadOrdersEngine,
    OrdersEngine,
    type mjBizAppsOrdersEntitlementGrantEntity,
    type mjBizAppsOrdersOrderLineEntity,
    type mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import { EntityIDFor, SubmitJournalEntryDrafts } from './AccountingBridge.js';
import { CalendarDayOrToday } from './calendar-day.js';
import {
    ActiveRoleHolderIDs,
    EnsureTaskAssignment,
    EnsureTaskLink,
    requireSubclass,
    TASK_ENTITY,
    TASK_TYPE_ENTITY,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import { OrdersSettings } from './OrdersSettings.js';
import { RevenueRecognitionDriver } from './RevenueRecognition.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';
import { SubscriptionBehavior, SubscriptionTypeRulesFrom } from './SubscriptionBehavior.js';
import { SanctionTermAmendment, SubscriptionTermEntityServer } from './SubscriptionTermEntityServer.js';
import { PlanTermExtension, type StagedEntry, type TermExtensionPlan } from './TermExtensionPlan.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';
const JE_LINE_DIMENSION_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Line Dimensions';
const JE_TYPE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Types';
const ROLE_ENTITY = 'MJ: Roles';
const USER_ENTITY = 'MJ: Users';

/** The tasks app's seeded type for work someone must do, as opposed to decide. */
const ACKNOWLEDGMENT_TASK_TYPE_CODE = 'ACTION_ITEM';

export interface TermExtensionRequest {
    SubscriptionTermID: string;
    /** Whole days added to the term's end. */
    AddedDays: number;
    /** Who asked. Excluded from the acknowledgment, which they cannot confirm themselves. */
    RequestedByUserID: string;
}

/** Everything an extension would do, read and planned but not written. */
export interface CheckedTermExtension {
    TermID: string;
    TermNumber: number;
    SubscriptionID: string;
    SubscriptionNumber: string;
    OrderLineID: string;
    OrderHeaderID: string;
    ProductName: string;
    TermStartDate: Date;
    TermAmount: number;
    CurrentEndDate: Date;
    NewEndDate: Date;
    EffectiveDate: Date;
    Plan: TermExtensionPlan;
    AcknowledgerIDs: string[];
}

interface TermRow {
    ID: string;
    SubscriptionID: string;
    TermNumber: number;
    OrderLineID: string;
    StartDate: Date | string;
    EndDate: Date | string;
    Amount: number;
    Status: string;
    RevenueRecognitionTypeID: string | null;
}

/** Check an extension and plan it, or say why it cannot be made. Reads only. */
export async function CheckTermExtension(
    request: TermExtensionRequest,
    ctx: ApprovalTaskContext,
): Promise<CheckedTermExtension | string> {
    const days = Number(request.AddedDays);
    if (!Number.isInteger(days) || days <= 0) return 'A term extension must add a whole number of days.';

    const term = (
        await view<TermRow>(ctx, {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(request.SubscriptionTermID, 'SubscriptionTermID')}'`,
            Fields: ['ID', 'SubscriptionID', 'TermNumber', 'OrderLineID', 'StartDate', 'EndDate', 'Amount', 'Status', 'RevenueRecognitionTypeID'],
            ResultType: 'simple',
        })
    )[0];
    if (!term) return `Subscription term ${request.SubscriptionTermID} was not found.`;
    if (term.Status !== 'Scheduled' && term.Status !== 'Active') {
        return `Term ${term.TermNumber} is ${term.Status}; only a Scheduled or Active term can be extended.`;
    }

    const renewal = await renewalAlreadyPlaced(term, ctx);
    if (renewal) return renewal;

    const subscription = (
        await view<{ SubscriptionNumber: string; SubscriptionTypeID: string; ProductID: string }>(ctx, {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(term.SubscriptionID, 'SubscriptionID')}'`,
            Fields: ['SubscriptionNumber', 'SubscriptionTypeID', 'ProductID'],
            ResultType: 'simple',
        })
    )[0];
    if (!subscription) return `The subscription of term ${term.TermNumber} was not found.`;

    const line = (
        await view<{ OrderHeaderID: string }>(ctx, {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(term.OrderLineID, 'OrderLineID')}'`,
            Fields: ['OrderHeaderID'],
            ResultType: 'simple',
        })
    )[0];
    if (!line) return `The order line that bought term ${term.TermNumber} was not found.`;

    const product = (
        await view<{ Name: string }>(ctx, {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(subscription.ProductID, 'ProductID')}'`,
            Fields: ['Name'],
            ResultType: 'simple',
        })
    )[0];

    const acknowledgers = await acknowledgerIDs(request.RequestedByUserID, ctx);
    if (typeof acknowledgers === 'string') return acknowledgers;

    const currentEnd = asDay(term.EndDate);
    const newEnd = addDays(currentEnd, days);
    const effective = await CalendarDayOrToday(undefined, ctx.Provider, ctx.User);
    const label = `term ${term.TermNumber} of ${subscription.SubscriptionNumber} extended to ${isoDay(newEnd)}`;

    const recognition = await recognitionFor(term, subscription.SubscriptionTypeID, ctx);
    const entries = recognition ? await stagedEntries(term.ID, ctx) : [];
    const plan = PlanTermExtension({
        Entries: entries,
        EffectiveDate: effective,
        CurrentEndDate: currentEnd,
        NewEndDate: newEnd,
        Driver: recognition?.Driver ?? null,
        PeriodMonths: recognition?.PeriodMonths ?? 1,
        LinkedEntityID: EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
        LinkedRecordID: term.ID,
        Label: label,
        ProductName: product?.Name ?? 'subscription',
    });
    if (typeof plan === 'string') return plan;

    return {
        TermID: term.ID,
        TermNumber: term.TermNumber,
        SubscriptionID: term.SubscriptionID,
        SubscriptionNumber: subscription.SubscriptionNumber,
        OrderLineID: term.OrderLineID,
        OrderHeaderID: line.OrderHeaderID,
        ProductName: product?.Name ?? 'subscription',
        TermStartDate: asDay(term.StartDate),
        TermAmount: Number(term.Amount),
        CurrentEndDate: currentEnd,
        NewEndDate: newEnd,
        EffectiveDate: effective,
        Plan: plan,
        AcknowledgerIDs: acknowledgers,
    };
}

/** The concession an extension is applied from. */
export interface ApprovedDurationConcession {
    ID: string;
    SubscriptionTermID: string;
    AddedDays: number;
    RequestedByUserID: string;
    ReasonCategory: string;
    Reason: string;
    ComputedValue: number;
}

/**
 * Apply an approved Duration concession to its term. Joins the caller's transaction; throws on any refusal,
 * so the caller's approval rolls back with it.
 */
export async function ApplyTermExtension(concession: ApprovedDurationConcession, ctx: ApprovalTaskContext): Promise<CheckedTermExtension> {
    const checked = await CheckTermExtension(
        {
            SubscriptionTermID: concession.SubscriptionTermID,
            AddedDays: concession.AddedDays,
            RequestedByUserID: concession.RequestedByUserID,
        },
        ctx,
    );
    if (typeof checked === 'string') throw new Error(`The term extension cannot be applied: ${checked}`);

    const drafts = [...checked.Plan.Offsets, ...checked.Plan.Respread];
    const written = drafts.length
        ? await SubmitJournalEntryDrafts(drafts, `the extension of ${label(checked)}`, ctx.Provider, ctx.User)
        : { Success: true, Results: [] };
    const results = written.Results ?? [];

    await moveTermEnd(checked, ctx);
    await moveLineServicePeriodEnd(checked, ctx);
    await extendTermGrants(checked, ctx);
    await logExtended(checked, concession, results, ctx);
    await RaiseAmendmentAcknowledgment(checked, concession, ctx);
    return checked;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

/** A later term, or a renewal line that has not booked one yet, means this term's renewal is already placed. */
async function renewalAlreadyPlaced(term: TermRow, ctx: ApprovalTaskContext): Promise<string | null> {
    const subscriptionID = RequireUUID(term.SubscriptionID, 'SubscriptionID');
    const later = await view<{ ID: string }>(ctx, {
        EntityName: SUBSCRIPTION_TERM_ENTITY,
        ExtraFilter: `SubscriptionID = '${subscriptionID}' AND TermNumber > ${Number(term.TermNumber)}`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
    });
    const pendingRenewal = await view<{ ID: string }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter:
            `RenewsSubscriptionID = '${subscriptionID}' AND OrderHeaderID IN (SELECT ID FROM __mj_BizAppsOrders.OrderHeader WHERE Status <> 'Voided') ` +
            `AND ID NOT IN (SELECT OrderLineID FROM __mj_BizAppsOrders.SubscriptionTerm WHERE OrderLineID IS NOT NULL)`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
    });
    if (later.length === 0 && pendingRenewal.length === 0) return null;
    return (
        `Term ${term.TermNumber}'s renewal order has already been placed, and it was priced and dated from the ` +
        `term's current end. Reverse the renewal first, then extend the term.`
    );
}

/** Every active holder of the acknowledgment role except the requester, or why there are none. */
async function acknowledgerIDs(requesterID: string, ctx: ApprovalTaskContext): Promise<string[] | string> {
    await OrdersSettings.Load(ctx.Provider, ctx.User);
    const roleName = OrdersSettings.AmendmentAcknowledgmentRole;
    if (!roleName) {
        return (
            'No acknowledgment role is configured (Orders setting AmendmentAcknowledgmentRole), so accounting would ' +
            'not be told that the recognition schedule changed.'
        );
    }
    if (!ctx.Provider.EntityByName(TASK_ENTITY)) {
        return 'Accounting is told of an amendment through the tasks app, and the tasks app is not installed.';
    }
    const role = (
        await view<{ ID: string }>(ctx, {
            EntityName: ROLE_ENTITY,
            ExtraFilter: `Name = '${EscapeText(roleName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        })
    )[0];
    if (!role) return `The acknowledgment role '${roleName}' does not exist.`;
    const holders = (await ActiveRoleHolderIDs(role.ID, ctx)).filter((id) => !UUIDsEqual(id, requesterID));
    if (holders.length === 0) {
        return (
            `No active holder of the acknowledgment role '${roleName}' other than the requester exists, and the ` +
            `requester cannot acknowledge their own amendment.`
        );
    }
    return holders;
}

// ─── Recognition ────────────────────────────────────────────────────────────

/** The term's driver and cadence, or null when its recognition type defers nothing. */
async function recognitionFor(
    term: TermRow,
    subscriptionTypeID: string,
    ctx: ApprovalTaskContext,
): Promise<{ Driver: RevenueRecognitionDriver; PeriodMonths: number } | null> {
    await LoadOrdersEngine(ctx.Provider, ctx.User);
    const type = OrdersEngine.Instance.RevenueRecognitionTypes.find((t) => UUIDsEqual(t.ID, term.RevenueRecognitionTypeID));
    if (!type?.IsDeferred) return null;

    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RevenueRecognitionDriver>(RevenueRecognitionDriver, type.DriverClass);
    if (!driver) {
        throw new Error(`Revenue recognition type '${type.Code}' names driver '${type.DriverClass}', which is not registered.`);
    }

    // The cadence the subscription was sold on, read the way booking reads it (see OrderEntityServer's
    // inheritReversalCadence for why the subscription's own type is the right source).
    const cached = OrdersEngine.Instance.SubscriptionTypeByID(subscriptionTypeID);
    if (!cached) throw new Error(`Subscription type ${subscriptionTypeID} was not found.`);
    const rules = SubscriptionTypeRulesFrom(cached);
    const behavior = rules.DriverClass
        ? MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(SubscriptionBehavior, rules.DriverClass)
        : new SubscriptionBehavior();
    if (!behavior) throw new Error(`Subscription type '${rules.Code}' names driver '${rules.DriverClass}', which is not registered.`);
    return { Driver: driver, PeriodMonths: behavior.RecognitionMonths(rules) };
}

/** Every `RevenueRecognition` entry linked to the term, with its lines and their dimensions. */
async function stagedEntries(termID: string, ctx: ApprovalTaskContext): Promise<StagedEntry[]> {
    const type = (
        await view<{ ID: string }>(ctx, {
            EntityName: JE_TYPE_ENTITY,
            ExtraFilter: `Code = 'RevenueRecognition'`,
            Fields: ['ID'],
            ResultType: 'simple',
        })
    )[0];
    if (!type) throw new Error("Accounting has no 'RevenueRecognition' journal entry type.");

    const entries = await view<{ ID: string; EntryNumber: string; EffectiveDate: Date | string; Status: string; JournalEntryBatchID: string | null }>(ctx, {
        EntityName: JE_ENTITY,
        ExtraFilter:
            `LinkedEntityID = '${EntityIDFor(SUBSCRIPTION_TERM_ENTITY)}' AND LinkedRecordID = '${RequireUUID(termID, 'SubscriptionTermID')}' ` +
            `AND EntryTypeID = '${RequireUUID(type.ID, 'EntryTypeID')}'`,
        Fields: ['ID', 'EntryNumber', 'EffectiveDate', 'Status', 'JournalEntryBatchID'],
        ResultType: 'simple',
    });
    if (entries.length === 0) return [];

    const entryIDs = RequireUUIDs(entries.map((e) => e.ID), 'JournalEntryID');
    const lines = await view<{ ID: string; JournalEntryID: string; LineNumber: number; GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null; Description: string | null }>(ctx, {
        EntityName: JE_LINE_ENTITY,
        ExtraFilter: `JournalEntryID IN (${entryIDs.map((id) => `'${id}'`).join(', ')})`,
        Fields: ['ID', 'JournalEntryID', 'LineNumber', 'GLAccountID', 'DebitAmount', 'CreditAmount', 'Description'],
        OrderBy: 'LineNumber',
        ResultType: 'simple',
    });
    const lineIDs = RequireUUIDs(lines.map((l) => l.ID), 'JournalEntryLineID');
    const dims = lineIDs.length
        ? await view<{ JournalEntryLineID: string; DimensionID: string; DimensionValueID: string }>(ctx, {
              EntityName: JE_LINE_DIMENSION_ENTITY,
              ExtraFilter: `JournalEntryLineID IN (${lineIDs.map((id) => `'${id}'`).join(', ')})`,
              Fields: ['JournalEntryLineID', 'DimensionID', 'DimensionValueID'],
              ResultType: 'simple',
          })
        : [];

    return entries.map((e) => ({
        ID: e.ID,
        EntryNumber: e.EntryNumber,
        EffectiveDate: asDay(e.EffectiveDate),
        Status: e.Status,
        JournalEntryBatchID: e.JournalEntryBatchID,
        Lines: lines
            .filter((l) => UUIDsEqual(l.JournalEntryID, e.ID))
            .map((l) => ({
                GLAccountID: l.GLAccountID,
                DebitAmount: l.DebitAmount == null ? null : Number(l.DebitAmount),
                CreditAmount: l.CreditAmount == null ? null : Number(l.CreditAmount),
                Description: l.Description,
                Dimensions: dims
                    .filter((d) => UUIDsEqual(d.JournalEntryLineID, l.ID))
                    .map((d) => ({ DimensionID: d.DimensionID, DimensionValueID: d.DimensionValueID })),
            })),
    }));
}

// ─── Writes ─────────────────────────────────────────────────────────────────

async function moveTermEnd(checked: CheckedTermExtension, ctx: ApprovalTaskContext): Promise<void> {
    const term = await ctx.Provider.GetEntityObject<SubscriptionTermEntityServer>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
    if (!(await term.Load(checked.TermID))) throw new Error(`Subscription term ${checked.TermID} was not found.`);
    SanctionTermAmendment(term);
    term.EndDate = checked.NewEndDate;
    if (!(await term.Save())) {
        throw new Error(`Term ${checked.TermNumber} could not be extended: ${term.LatestResult?.CompleteMessage}`);
    }
}

/** Booking set the line's service period from the term; keep them the same so a later reversal reads the term's window. */
async function moveLineServicePeriodEnd(checked: CheckedTermExtension, ctx: ApprovalTaskContext): Promise<void> {
    const line = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
    MarkAsOrdersOwnWrite(line);
    if (!(await line.Load(checked.OrderLineID))) throw new Error(`Order line ${checked.OrderLineID} was not found.`);
    line.ServicePeriodEnd = checked.NewEndDate;
    if (!(await line.Save())) {
        throw new Error(`The service period of the line that bought term ${checked.TermNumber} could not be moved: ${line.LatestResult?.CompleteMessage}`);
    }
}

/** A grant that follows the term ran to its old end; it now runs to the new one. */
async function extendTermGrants(checked: CheckedTermExtension, ctx: ApprovalTaskContext): Promise<void> {
    const grants = await view<mjBizAppsOrdersEntitlementGrantEntity>(ctx, {
        EntityName: ENTITLEMENT_GRANT_ENTITY,
        ExtraFilter: `SubscriptionTermID = '${RequireUUID(checked.TermID, 'SubscriptionTermID')}' AND ValidityModeApplied = 'SubscriptionTerm'`,
        ResultType: 'entity_object',
    });
    for (const grant of grants) {
        grant.ValidTo = checked.NewEndDate;
        if (!(await grant.Save())) {
            throw new Error(`Access granted by term ${checked.TermNumber} could not be extended: ${grant.LatestResult?.CompleteMessage}`);
        }
    }
}

async function logExtended(
    checked: CheckedTermExtension,
    concession: ApprovedDurationConcession,
    results: Array<{ JournalEntryID?: string; EntryNumber?: string }>,
    ctx: ApprovalTaskContext,
): Promise<void> {
    const offsets = checked.Plan.Targets.map((target, i) => ({
        Offsets: target.EntryNumber,
        JournalEntryID: results[i]?.JournalEntryID ?? null,
        EntryNumber: results[i]?.EntryNumber ?? null,
    }));
    const respread = checked.Plan.Respread.map((draft, i) => ({
        EffectiveDate: draft.EffectiveDate,
        Amount: draft.Lines[0].DebitAmount ?? 0,
        EntryNumber: results[checked.Plan.Offsets.length + i]?.EntryNumber ?? null,
    }));

    const event = await ctx.Provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, ctx.User);
    event.NewRecord();
    event.SubscriptionID = checked.SubscriptionID;
    event.EventType = 'Extended';
    event.OccurredAt = new Date();
    event.RelatedOrderHeaderID = checked.OrderHeaderID;
    event.Set(
        'EventData',
        JSON.stringify({
            TermNumber: checked.TermNumber,
            Action: 'Amendment',
            OrderConcessionID: concession.ID,
            ReasonCategory: concession.ReasonCategory,
            PreviousEndDate: isoDay(checked.CurrentEndDate),
            NewEndDate: isoDay(checked.NewEndDate),
            EffectiveDate: isoDay(checked.EffectiveDate),
            Value: concession.ComputedValue,
            Respread: checked.Plan.Remaining,
            Offsets: offsets,
            NewSchedule: respread,
        }),
    );
    if (!(await event.Save())) {
        throw new Error(`The extension of term ${checked.TermNumber} could not be logged: ${event.LatestResult?.CompleteMessage}`);
    }
}

/**
 * Tell accounting, and keep the change open until they confirm it (golive #221).
 *
 * A term extension moves no cash and changes no invoice, so no reconciliation would surface it. One task,
 * assigned to every active holder of the acknowledgment role except the requester, carries the old and new
 * schedules and links the term, the concession and the order. An open task is an unconfirmed re-cut.
 */
export async function RaiseAmendmentAcknowledgment(
    checked: CheckedTermExtension,
    concession: ApprovedDurationConcession,
    ctx: ApprovalTaskContext,
): Promise<string> {
    const types = await view<mjBizAppsTasksTaskTypeEntity>(ctx, {
        EntityName: TASK_TYPE_ENTITY,
        ExtraFilter: `Code = '${EscapeText(ACKNOWLEDGMENT_TASK_TYPE_CODE)}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
    });
    const typeID = types[0]?.ID;
    if (!typeID) throw new Error(`The tasks app has no '${ACKNOWLEDGMENT_TASK_TYPE_CODE}' task type, so accounting cannot be told of the amendment.`);

    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    task.NewRecord();
    task.TypeID = typeID;
    task.Name = `Confirm the recognition re-cut: ${label(checked)}`;
    task.Description = acknowledgmentDescription(checked, concession);
    task.Priority = 'High';
    task.Status = 'Open';
    if (!(await task.Save())) {
        throw new Error(`The acknowledgment task for ${label(checked)} could not be created: ${task.LatestResult?.CompleteMessage}`);
    }

    await EnsureTaskLink(task.ID, EntityIDFor(SUBSCRIPTION_TERM_ENTITY), checked.TermID, ctx);
    await EnsureTaskLink(task.ID, EntityIDFor(ORDER_CONCESSION_ENTITY), concession.ID, ctx);
    await EnsureTaskLink(task.ID, EntityIDFor(ORDER_HEADER_ENTITY), checked.OrderHeaderID, ctx);
    const userEntityID = EntityIDFor(USER_ENTITY);
    for (const userID of checked.AcknowledgerIDs) {
        await EnsureTaskAssignment(task.ID, userEntityID, userID, ctx);
    }
    return task.ID;
}

function acknowledgmentDescription(checked: CheckedTermExtension, concession: ApprovedDurationConcession): string {
    const plan = checked.Plan;
    const before = plan.Targets.map((t) => `  ${isoDay(t.EffectiveDate)}  ${t.EntryNumber}  ${releaseAmount(t)}`).join('\n');
    const after = plan.Respread.map((d) => `  ${d.EffectiveDate}  ${d.Lines[0].DebitAmount ?? 0}`).join('\n');
    return [
        `Term ${checked.TermNumber} of ${checked.SubscriptionNumber} now ends ${isoDay(checked.NewEndDate)} instead of ` +
            `${isoDay(checked.CurrentEndDate)}, at no additional charge (${concession.ReasonCategory}: ${concession.Reason}). ` +
            `No invoice or receivable changed. Confirm that the recognition schedule below was re-cut, then complete this task.`,
        '',
        plan.Targets.length
            ? `Replaced from ${isoDay(checked.EffectiveDate)}: ${plan.Targets.length} staged entries, each offset on its own date.\n${before}`
            : 'No staged recognition entries were dated on or after the effective date, so the schedule did not change.',
        '',
        plan.Respread.length ? `New schedule, ${plan.Remaining} over ${plan.Respread.length} entries:\n${after}` : '',
    ]
        .filter((part, i, all) => part !== '' || (i > 0 && all[i - 1] !== ''))
        .join('\n')
        .trim();
}

function releaseAmount(entry: StagedEntry): number {
    return entry.Lines.reduce((sum, l) => sum + Number(l.DebitAmount ?? 0), 0);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function label(checked: CheckedTermExtension): string {
    return `term ${checked.TermNumber} of ${checked.SubscriptionNumber} extended to ${isoDay(checked.NewEndDate)}`;
}

/** A `date` column as midnight UTC, the shape it round-trips in. */
function asDay(value: Date | string): Date {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(day: Date, days: number): Date {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + days));
}

function isoDay(day: Date): string {
    return day.toISOString().slice(0, 10);
}

async function view<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}
