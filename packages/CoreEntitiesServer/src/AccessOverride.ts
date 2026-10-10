/**
 * Approved exceptions to payment-gated access (bizapps-orders#268).
 *
 * An `EntitlementAccessOverride` lets one order's grants stand Active past the rule that would
 * suspend them: `WaivePaymentHold` past the hold on a new purchase awaiting its first payment,
 * `DeferCutoff` past the renewal cutoff. It is a row, with a reason, a last day and a Tasks approval,
 * so an exception is on the record and the payment re-decision honours it instead of reversing it.
 *
 * THREE ENTRY POINTS:
 *   · {@link RequestAccessOverride} — checks the requester's authorization for that override type,
 *     writes the Requested row, and raises its approval task.
 *   · {@link RecordAccessOverrideDecision} — the in-app decision. Records the Tasks decision, then
 *     applies it.
 *   · {@link ApplyAccessOverrideDecision} — reads the task's outcome and moves the override to
 *     Approved, Rejected or Withdrawn. Idempotent: an override that is no longer Requested is left
 *     alone. The in-app decision and the task type's hook Action (a decision made in the Tasks inbox)
 *     both call it, so either path lands the same result, once.
 *
 * WHO APPROVES (bizapps-orders#360). The approval task is assigned, through their person records, to the
 * order company's `AccountingCompanyProfile.ApprovalCFOUserID` — the approver journal entry batches
 * use. When that user is the requester, it goes instead to every other active holder of the role the
 * `AccessOverrideFallbackApproverRole` setting names. A request nobody could approve is refused.
 * Only an assignee may decide, never the requester, and an approval after the override's last day is
 * refused ({@link AccessOverrideDecisionRefusal}). The in-app decision refuses before it records
 * anything; a decision made in the Tasks inbox has already closed the task, so the hook closes the
 * override Withdrawn with the reason, and the requester may ask again.
 *
 * FAILS CLOSED. Without the authorization rows in metadata nobody may request — an exception to a
 * payment rule is not something to hand out because a sync has not run.
 *
 * CONNECTS TO:
 *   RULE:     ./EntitlementBehavior.ts (ApplyAccessOverrides, AccessOverrideCanApply)
 *   ENFORCE:  ./PaymentGatedAccess.ts (ReconcilePaymentGatedGrants, the nightly expiry)
 *   TASKS:    @mj-biz-apps/tasks-core TaskOrchestrationService (CreateApprovalRequest, RecordDecision)
 *   CALLERS:  RequestAccessOverrideOperation, RecordAccessOverrideDecisionOperation,
 *             packages/Server/src/custom/apply-access-override-decision.action.ts
 */
import {
    AuthorizationEvaluator,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    IsApprovalOutcome,
    IsTaskDecisionOutcomeCode,
    TaskOrchestrationService,
    type TaskDecisionOutcomeCode,
} from '@mj-biz-apps/tasks-core';
import {
    LoadGeneratedEntities as LoadTasksEntities,
    type mjBizAppsTasksTaskDecisionEntity,
    type mjBizAppsTasksTaskDecisionOutcomeEntity,
    type mjBizAppsTasksTaskEntity,
    type mjBizAppsTasksTaskLinkEntity,
    type mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import {
    ACCESS_OVERRIDE_AUTH,
    AccessOverrideDecisionRefusal,
    LoadAccessOverrideAssignees,
    ToISODate,
    mjBizAppsOrdersEntitlementAccessOverrideEntity,
    mjBizAppsOrdersOrderHeaderEntity,
} from '@mj-biz-apps/orders-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ACCESS_OVERRIDE_LIFTS,
    AccessOverrideApprovers,
    AccessOverrideCanApply,
    PAYMENT_GATED_TIMINGS,
    ResolveAccessOverrideOutcome,
    type AccessOverrideType,
    type GrantTiming,
} from './EntitlementBehavior.js';
import { ActiveRoleHolderIDs, PERSON_ENTITY } from './ConcessionApprovalTask.js';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { OrdersSettings } from './OrdersSettings.js';
import { ACCESS_OVERRIDE_ENTITY, BusinessDay, ReconcilePaymentGatedGrants } from './PaymentGatedAccess.js';
import { EscapeText, RequireDate, RequireUUID, RequireUUIDs } from './sql-guards.js';

export { ACCESS_OVERRIDE_AUTH };

// The Tasks entity subclasses must be registered before a task is created: without them the
// ClassFactory hands back a plain BaseEntity, the field setters do nothing, and the save fails on
// "Name cannot be null". A host running the Tasks app registers them itself; a process that only
// loads Orders (an integration run, a job) would not.
LoadTasksEntities();

/** The TaskType the approval is raised under. Its hook Actions apply a decision made in the Tasks inbox. */
export const ACCESS_OVERRIDE_TASK_TYPE_CODE = 'ORDERS_ACCESS_OVERRIDE';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const TASKS_ENTITY = 'MJ_BizApps_Tasks: Tasks';
const TASK_TYPES_ENTITY = 'MJ_BizApps_Tasks: Task Types';
const TASK_LINKS_ENTITY = 'MJ_BizApps_Tasks: Task Links';
const TASK_DECISIONS_ENTITY = 'MJ_BizApps_Tasks: Task Decisions';
const TASK_DECISION_OUTCOMES_ENTITY = 'MJ_BizApps_Tasks: Task Decision Outcomes';
const COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const USER_ENTITY = 'MJ: Users';
const ROLE_ENTITY = 'MJ: Roles';
const REASON_MAX = 1000;

const OVERRIDE_TYPES = Object.keys(ACCESS_OVERRIDE_LIFTS) as AccessOverrideType[];
const gatedTimings = PAYMENT_GATED_TIMINGS.map((t) => `'${t}'`).join(',');

// ─── authorization ─────────────────────────────────────────────────────────────

/**
 * Whether `user` may request an override of this type, through its own authorization or the parent.
 * Throws when the authorization rows are not in metadata: see FAILS CLOSED above.
 */
export function UserMayRequestAccessOverride(type: AccessOverrideType, user: UserInfo, provider: IMetadataProvider): boolean {
    const name = ACCESS_OVERRIDE_AUTH[type];
    const auths = provider.Authorizations ?? [];
    const auth = auths.find((a) => a.Name === name);
    if (!auth) {
        throw new Error(
            `Authorization '${name}' is not in metadata. Access overrides are refused until the ` +
                `${ACCESS_OVERRIDE_AUTH.Parent} authorizations are installed and granted to roles.`,
        );
    }
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(auth, user, auths);
}

// ─── request ───────────────────────────────────────────────────────────────────

export interface RequestAccessOverrideInput {
    OrderHeaderID: string;
    OverrideType: AccessOverrideType;
    Reason: string;
    /** Last day the override holds, `YYYY-MM-DD`, inclusive. Required; not before today. */
    EffectiveThrough: string;
}

export interface RequestAccessOverrideOutput {
    Success: boolean;
    Message?: string;
    AccessOverrideID?: string;
    ApprovalTaskID?: string;
}

/**
 * Record a request for an access override and raise its approval task. Nothing about access changes
 * until the request is approved.
 *
 * Logical refusals come back as `Success: false` with the reason; only faults throw.
 */
export async function RequestAccessOverride(
    input: RequestAccessOverrideInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RequestAccessOverrideOutput> {
    RequireUUID(input.OrderHeaderID, 'OrderHeaderID');
    if (!OVERRIDE_TYPES.includes(input.OverrideType)) {
        return { Success: false, Message: `OverrideType must be one of ${OVERRIDE_TYPES.join(', ')}; got '${input.OverrideType}'.` };
    }
    if (!UserMayRequestAccessOverride(input.OverrideType, user, provider)) {
        return { Success: false, Message: `Requesting a ${input.OverrideType} override requires the ${ACCESS_OVERRIDE_AUTH[input.OverrideType]} authorization.` };
    }
    const reason = (input.Reason ?? '').trim();
    if (!reason) return { Success: false, Message: 'An access override must state a reason.' };
    if (reason.length > REASON_MAX) return { Success: false, Message: `Reason is limited to ${REASON_MAX} characters.` };
    if (!input.EffectiveThrough) return { Success: false, Message: 'An access override must state the last day it holds (EffectiveThrough).' };
    const through = RequireDate(input.EffectiveThrough, 'EffectiveThrough');

    const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
    if (!(await order.Load(input.OrderHeaderID))) {
        return { Success: false, Message: `No order found with ID '${input.OrderHeaderID}'.` };
    }
    const today = await BusinessDay(provider, user);
    if (through < today) return { Success: false, Message: `EffectiveThrough ${through} is before today (${today}).` };

    if (!AccessOverrideCanApply(input.OverrideType, await gatedGrantsOnOrder(input.OrderHeaderID, provider, user))) {
        const what = input.OverrideType === 'DeferCutoff' ? 'an OnFirstPayment renewal' : 'a grant held for payment';
        return { Success: false, Message: `Order ${order.OrderNumber} has no ${what}, so a ${input.OverrideType} override would change nothing.` };
    }

    const open = await findOpenOverride(input.OrderHeaderID, input.OverrideType, provider, user);
    if (open) {
        return {
            Success: false,
            AccessOverrideID: open.ID,
            Message: `This order already has a ${open.Status} ${input.OverrideType} override; it must close before another is requested.`,
        };
    }
    const approvers = await resolveApprovers(order, user, provider);
    if ('Refusal' in approvers) return { Success: false, Message: approvers.Refusal };
    const taskTypeID = await resolveTaskTypeID(provider, user);

    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        const override = await provider.GetEntityObject<mjBizAppsOrdersEntitlementAccessOverrideEntity>(ACCESS_OVERRIDE_ENTITY, user);
        override.NewRecord();
        override.OrderHeaderID = input.OrderHeaderID;
        override.OverrideType = input.OverrideType;
        override.Reason = reason;
        override.EffectiveThrough = new Date(`${through}T00:00:00Z`);
        override.Status = 'Requested';
        override.RequestedByUserID = user.ID;
        if (!(await override.Save())) {
            throw new Error(`Failed to save the access override: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        const overrideEntity = provider.EntityByName(ACCESS_OVERRIDE_ENTITY);
        if (!overrideEntity) throw new Error(`Entity metadata for '${ACCESS_OVERRIDE_ENTITY}' is missing.`);
        const label = input.OverrideType === 'WaivePaymentHold' ? 'waive the payment hold' : 'defer the renewal cutoff';
        await new TaskOrchestrationService().CreateApprovalRequest(
            {
                Name: `Approve access override on order ${order.OrderNumber}: ${label} through ${through}`,
                TypeID: taskTypeID,
                Description: `Requested by ${user.Name ?? user.Email}. Reason: ${reason}`,
                Priority: 'High',
                LinkEntityID: overrideEntity.ID,
                LinkRecordID: override.ID,
                ApproverPersonEntityID: approvers.PersonEntityID,
                ApproverPersonRecordIDs: approvers.PersonIDs,
            },
            user,
        );
        // CreateApprovalRequest logs rather than throws on a failed link or assignment; without the
        // link the decision could never be traced back here, and without an assignee nobody may
        // decide it, so the absence of either is a fault.
        const taskID = await findLinkedTaskID(overrideEntity.ID, override.ID, provider, user);
        if (!taskID) throw new Error('The approval task was created but its link to the access override did not persist.');
        if ((await AssigneeUserIDs(taskID, provider, user)).length === 0) {
            throw new Error('The approval task was created but its assignment to the approver did not persist.');
        }

        override.ApprovalTaskID = taskID;
        override.ApprovalTaskRaisedAt = new Date();
        if (!(await override.Save())) {
            throw new Error(`Failed to stamp the approval task on the access override: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        await db.CommitTransaction();
        return {
            Success: true,
            AccessOverrideID: override.ID,
            ApprovalTaskID: taskID,
            Message: 'Access override requested; it takes effect once its approval task is approved.',
        };
    } catch (err) {
        await rollback(db, 'access override request');
        throw err;
    }
}

// ─── decide ────────────────────────────────────────────────────────────────────

export interface RecordAccessOverrideDecisionInput {
    AccessOverrideID: string;
    /** A Tasks decision outcome code: `Approved`, `ApprovedWithConditions` or `Rejected`. */
    Outcome: string;
    Notes?: string;
}

export interface AccessOverrideDecisionOutput {
    Success: boolean;
    Message?: string;
    /** The override's status after the call. */
    Status?: string;
    /** Grants whose status changed because the override was approved. */
    GrantsChanged?: number;
}

/** Approve or reject an access override from the app: record the Tasks decision, then apply it. */
export async function RecordAccessOverrideDecision(
    input: RecordAccessOverrideDecisionInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<AccessOverrideDecisionOutput> {
    RequireUUID(input.AccessOverrideID, 'AccessOverrideID');
    if (!IsTaskDecisionOutcomeCode(input.Outcome)) {
        return { Success: false, Message: `'${input.Outcome}' is not a decision outcome.` };
    }
    const outcome: TaskDecisionOutcomeCode = input.Outcome;
    const override = await provider.GetEntityObject<mjBizAppsOrdersEntitlementAccessOverrideEntity>(ACCESS_OVERRIDE_ENTITY, user);
    if (!(await override.Load(input.AccessOverrideID))) {
        return { Success: false, Message: `No access override found with ID '${input.AccessOverrideID}'.` };
    }
    if (override.Status !== 'Requested') {
        return { Success: false, Status: override.Status, Message: `The access override is already ${override.Status}.` };
    }
    if (!override.ApprovalTaskID) {
        return { Success: false, Status: override.Status, Message: 'The access override has no approval task to decide.' };
    }
    const refusal = await DecisionRefusalFor(override, user.ID, IsApprovalOutcome(outcome), provider, user);
    if (refusal) return { Success: false, Status: override.Status, Message: refusal };

    await new TaskOrchestrationService().RecordDecision(
        { TaskID: override.ApprovalTaskID, OutcomeCode: outcome, Notes: input.Notes },
        user,
    );
    return ApplyAccessOverrideDecision(override.ApprovalTaskID, provider, user);
}

/**
 * Bring an override in line with its approval task's outcome. `user` is whoever decided the task.
 *
 *   Completed with an approving decision   → Approved, and the order's grants re-decided at once
 *   Cancelled with a Rejected decision      → Rejected
 *   closed any other way                    → Withdrawn
 *   still open, or blocked                  → unchanged
 *
 * A second call after the first has applied it changes nothing.
 */
export async function ApplyAccessOverrideDecision(
    taskID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<AccessOverrideDecisionOutput> {
    RequireUUID(taskID, 'TaskID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const found = await rv.RunView<mjBizAppsOrdersEntitlementAccessOverrideEntity>(
        { EntityName: ACCESS_OVERRIDE_ENTITY, ExtraFilter: `ApprovalTaskID = '${taskID}'`, ResultType: 'entity_object', BypassCache: true },
        user,
    );
    if (!found.Success) throw new Error(`Could not read access overrides: ${found.ErrorMessage}`);
    const override = found.Results?.[0];
    if (!override) return { Success: false, Message: `Task ${taskID} is not an access override approval.` };
    if (override.Status !== 'Requested') return { Success: true, Status: override.Status, Message: `Already ${override.Status}.` };

    const task = await provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASKS_ENTITY, user);
    if (!(await task.Load(taskID))) throw new Error(`Approval task ${taskID} not found.`);
    const decision = await latestTerminalDecision(taskID, provider, user);
    const outcome = ResolveAccessOverrideOutcome({ TaskStatus: task.Status, Decision: decision });
    if (!outcome) return { Success: true, Status: override.Status, Message: `The approval task is ${task.Status}; nothing to apply yet.` };
    // A decision made in the Tasks inbox has already closed the task, so one this override refuses
    // cannot be sent back to it: the request closes Withdrawn with the reason, and may be made again.
    const refusal =
        outcome === 'Approved' || outcome === 'Rejected'
            ? await DecisionRefusalFor(override, user.ID, outcome === 'Approved', provider, user)
            : null;
    const status = refusal ? 'Withdrawn' : outcome;
    const applied = status === 'Approved' || status === 'Rejected';

    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        override.Status = status;
        override.DecidedAt = new Date();
        override.DecisionNotes = applied
            ? (decision?.Notes ?? null)
            : refusal
              ? `The ${outcome === 'Approved' ? 'approval' : 'rejection'} recorded on the approval task was not applied: ${refusal}`
              : `The approval task was ${task.Status} without a matching decision.`;
        if (applied) override.DecidedByUserID = user.ID;
        if (!(await override.Save())) {
            throw new Error(`Failed to record the decision on access override ${override.ID}: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        const changes = status === 'Approved' ? await ReconcilePaymentGatedGrants([override.OrderHeaderID], provider, user) : [];
        await db.CommitTransaction();
        if (refusal) return { Success: false, Status: override.Status, Message: override.DecisionNotes ?? refusal };
        return {
            Success: true,
            Status: override.Status,
            GrantsChanged: changes.length,
            Message: `Access override ${override.Status}${changes.length ? `; ${changes.length} grant(s) changed` : ''}.`,
        };
    } catch (err) {
        await rollback(db, `access override decision on task ${taskID}`);
        throw err;
    }
}

// ─── approvers ─────────────────────────────────────────────────────────────────

/**
 * Why `deciderID` may not record this decision on the override, or null when they may. Shared by the
 * in-app decision, the Tasks hook and the entity's own save, so every path holds the same rule.
 */
export async function DecisionRefusalFor(
    override: Pick<mjBizAppsOrdersEntitlementAccessOverrideEntity, 'ApprovalTaskID' | 'RequestedByUserID' | 'EffectiveThrough'>,
    deciderID: string,
    approving: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    if (!override.ApprovalTaskID) return 'The access override has no approval task to decide.';
    return AccessOverrideDecisionRefusal({
        Approving: approving,
        DeciderUserID: deciderID,
        RequesterUserID: override.RequestedByUserID,
        AssigneeUserIDs: await AssigneeUserIDs(override.ApprovalTaskID, provider, user),
        EffectiveThrough: ToISODate(override.EffectiveThrough) ?? '',
        Today: await BusinessDay(provider, user),
    });
}

/**
 * The users an approval task is assigned to, read the same way the order form reads them
 * ({@link LoadAccessOverrideAssignees}): a person record's linked user, or a user assigned directly.
 */
export async function AssigneeUserIDs(taskID: string, provider: IMetadataProvider, user: UserInfo): Promise<string[]> {
    const assignees = await LoadAccessOverrideAssignees([RequireUUID(taskID, 'TaskID')], provider, user);
    return (assignees.get(taskID.toLowerCase()) ?? []).flatMap((a) => (a.UserID ? [a.UserID] : []));
}

/**
 * The person records to assign the approval task to, or why there are none. The approver is the
 * order company's ApprovalCFOUserID, or the fallback role's holders when that user is the requester;
 * see {@link AccessOverrideApprovers}. An approver with no active person record cannot be told of the
 * task, so is left out; with none left, the request is refused.
 */
async function resolveApprovers(
    order: mjBizAppsOrdersOrderHeaderEntity,
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<{ PersonEntityID: string; PersonIDs: string[] } | { Refusal: string }> {
    const personEntityID = provider.EntityByName(PERSON_ENTITY)?.ID;
    if (!personEntityID || !provider.EntityByName(COMPANY_PROFILE_ENTITY)) {
        throw new Error('Access override approvers are resolved through the common and accounting apps, and one of them is not installed.');
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const read = async <T>(entityName: string, filter: string, fields: string[]): Promise<T[]> => {
        const res = await rv.RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true }, user);
        if (!res.Success) throw new Error(`Could not read ${entityName}: ${res.ErrorMessage}`);
        return res.Results ?? [];
    };

    // IS-A: the accounting profile shares its company's ID.
    const profile = order.CompanyID
        ? (await read<{ ApprovalCFOUserID: string | null }>(COMPANY_PROFILE_ENTITY, `ID = '${RequireUUID(order.CompanyID, 'CompanyID')}'`, ['ApprovalCFOUserID']))[0]
        : undefined;
    const named = profile?.ApprovalCFOUserID ?? null;
    const active = named
        ? (await read<{ ID: string }>(USER_ENTITY, `ID = '${RequireUUID(named, 'ApprovalCFOUserID')}' AND IsActive = 1`, ['ID'])).length > 0
        : false;
    const companyApprover = active ? named : null;

    let fallbackRole: string | null = null;
    let fallbackHolders: string[] = [];
    if (companyApprover && UUIDsEqual(companyApprover, user.ID)) {
        await OrdersSettings.Load(provider, user);
        fallbackRole = OrdersSettings.AccessOverrideFallbackApproverRole;
        if (fallbackRole) {
            const role = (await read<{ ID: string }>(ROLE_ENTITY, `Name = '${EscapeText(fallbackRole)}'`, ['ID']))[0];
            if (!role) return { Refusal: `The fallback approver role '${fallbackRole}' (Orders setting AccessOverrideFallbackApproverRole) does not exist.` };
            fallbackHolders = await ActiveRoleHolderIDs(role.ID, { Provider: provider, User: user });
        }
    }

    const decided = AccessOverrideApprovers({
        RequesterUserID: user.ID,
        CompanyApproverUserID: companyApprover,
        FallbackRoleName: fallbackRole,
        FallbackHolderIDs: fallbackHolders,
    });
    if ('Refusal' in decided) return decided;

    const persons = await read<{ ID: string; LinkedUserID: string }>(
        PERSON_ENTITY,
        `Status = 'Active' AND LinkedUserID IN (${RequireUUIDs(decided.UserIDs, 'UserID').map((id) => `'${id}'`).join(',')})`,
        ['ID', 'LinkedUserID'],
    );
    const personIDs: string[] = [];
    for (const userID of decided.UserIDs) {
        const person = persons.find((p) => UUIDsEqual(p.LinkedUserID, userID));
        if (person) personIDs.push(person.ID);
        else LogError(`Access override approver ${userID} has no active person record linked to their user and was not assigned.`);
    }
    if (personIDs.length === 0) {
        return {
            Refusal:
                'The approver for this override has no active person record linked to their user. The tasks app tells ' +
                "and lists an approver through that record, so no one would see the request. Link a person record to the approver's user.",
        };
    }
    return { PersonEntityID: personEntityID, PersonIDs: personIDs };
}

// ─── helpers ───────────────────────────────────────────────────────────────────

async function findOpenOverride(
    orderID: string,
    type: AccessOverrideType,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; Status: string } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; Status: string }>(
        {
            EntityName: ACCESS_OVERRIDE_ENTITY,
            ExtraFilter:
                `OrderHeaderID = '${RequireUUID(orderID, 'OrderHeaderID')}' AND OverrideType = '${type}' ` +
                `AND Status IN ('Requested','Approved')`,
            Fields: ['ID', 'Status'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res.Success) throw new Error(`Could not read access overrides: ${res.ErrorMessage}`);
    return res.Results?.[0] ?? null;
}

async function resolveTaskTypeID(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<mjBizAppsTasksTaskTypeEntity>(
        { EntityName: TASK_TYPES_ENTITY, ExtraFilter: `Code = '${ACCESS_OVERRIDE_TASK_TYPE_CODE}'`, MaxRows: 1, ResultType: 'simple', BypassCache: true },
        user,
    );
    const type = res.Results?.[0];
    if (!res.Success || !type) {
        throw new Error(`TaskType '${ACCESS_OVERRIDE_TASK_TYPE_CODE}' not found; the Orders task-type metadata has not been installed.`);
    }
    return type.ID;
}

async function findLinkedTaskID(entityID: string, recordID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<mjBizAppsTasksTaskLinkEntity>(
        {
            EntityName: TASK_LINKS_ENTITY,
            ExtraFilter: `EntityID = '${RequireUUID(entityID, 'EntityID')}' AND RecordID = '${RequireUUID(recordID, 'RecordID')}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res.Results?.[0]?.TaskID ?? null;
}

/** The most recent terminal decision on the task, and whether its outcome approves. */
async function latestTerminalDecision(
    taskID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ IsApproval: boolean; Notes: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const outcomes = await rv.RunView<mjBizAppsTasksTaskDecisionOutcomeEntity>(
        { EntityName: TASK_DECISION_OUTCOMES_ENTITY, ExtraFilter: 'IsTerminal = 1', ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!outcomes.Success) throw new Error(`Could not read task decision outcomes: ${outcomes.ErrorMessage}`);
    const codeByID = new Map((outcomes.Results ?? []).map((o) => [o.ID.toLowerCase(), o.Code]));

    const decisions = await rv.RunView<mjBizAppsTasksTaskDecisionEntity>(
        { EntityName: TASK_DECISIONS_ENTITY, ExtraFilter: `TaskID = '${taskID}'`, OrderBy: 'DecidedAt DESC', ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!decisions.Success) throw new Error(`Could not read task decisions: ${decisions.ErrorMessage}`);
    for (const d of decisions.Results ?? []) {
        const code = codeByID.get(d.OutcomeID.toLowerCase());
        if (IsTaskDecisionOutcomeCode(code)) return { IsApproval: IsApprovalOutcome(code), Notes: d.DecisionNotes ?? null };
    }
    return null;
}

/** The payment-gated grants in force or suspended on this order, with whether each is on a renewal line. */
async function gatedGrantsOnOrder(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Array<{ Timing: GrantTiming; IsRenewal: boolean }>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ ID: string; RenewsSubscriptionID: string | null }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderID, 'OrderHeaderID')}'`,
            Fields: ['ID', 'RenewsSubscriptionID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!lines.Success) throw new Error(`Could not read the lines of order ${orderID}: ${lines.ErrorMessage}`);
    const lineRows = lines.Results ?? [];
    if (!lineRows.length) return [];
    const renewal = new Map(lineRows.map((l) => [l.ID.toLowerCase(), !!l.RenewsSubscriptionID]));

    const grants = await rv.RunView<{ OrderLineID: string; GrantTimingApplied: GrantTiming }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter:
                `OrderLineID IN (${lineRows.map((l) => `'${RequireUUID(l.ID, 'OrderLineID')}'`).join(',')}) ` +
                `AND GrantTimingApplied IN (${gatedTimings}) AND Status IN ('Active','Suspended')`,
            Fields: ['OrderLineID', 'GrantTimingApplied'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!grants.Success) throw new Error(`Could not read the grants on order ${orderID}: ${grants.ErrorMessage}`);
    return (grants.Results ?? []).map((g) => ({
        Timing: g.GrantTimingApplied,
        IsRenewal: renewal.get(g.OrderLineID.toLowerCase()) ?? false,
    }));
}

async function rollback(db: DatabaseProviderBase, what: string): Promise<void> {
    try {
        await db.RollbackTransaction();
    } catch (err) {
        LogError(`Rollback failed after ${what} error: ${err}`);
    }
}
