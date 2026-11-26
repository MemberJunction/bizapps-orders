/**
 * Refund requests — no one approves their own refund (bc-aidp-next-golive#355, #320 §3).
 *
 * While the `RefundApprovalThreshold` setting is set, a refund goes through a `RefundRequest` row:
 * requested by someone who may reverse booked money, approved through a Tasks approval assigned to
 * approvers other than the requester (./RefundAuthority.ts `RefundApprovers`), then issued by the
 * requester with `Orders.RefundPayment` for exactly the approved amount. The approval moves no money:
 * a gateway refund can fail, and the person issuing it should see that, not the approver.
 *
 * ENTRY POINTS:
 *   · {@link RequestRefund} — checks the requester may reverse money, the payment and the amount,
 *     writes the Requested row and raises its approval task.
 *   · {@link RecordRefundRequestDecision} — the in-app decision. Records the Tasks decision, then
 *     applies it.
 *   · {@link ApplyRefundRequestDecision} — reads the task's outcome and moves the request to Approved,
 *     Rejected or Withdrawn. Idempotent. The in-app decision and the task type's hook Action (a decision
 *     made in the Tasks inbox) both call it, so either path lands the same result, once.
 *   · {@link WithdrawRefundRequest} — the requester closes their own open request.
 *   · {@link OpenRefundRequestFor} / {@link MarkRefundRequestIssued} — what `Orders.RefundPayment`
 *     checks before issuing, and records after.
 *
 * Only an assignee may decide, never the requester ({@link RefundRequestDecisionRefusal}). A decision
 * made in the Tasks inbox that the request refuses has already closed the task, so the hook closes the
 * request Withdrawn with the reason, notes it on the task, and the requester may ask again.
 *
 * CONNECTS TO:
 *   RULES:    ./RefundAuthority.ts · @mj-biz-apps/orders-entities RefundRequestDecisionRefusal
 *   GUARD:    ./RefundRequestEntityServer.ts
 *   TASKS:    @mj-biz-apps/tasks-core TaskOrchestrationService
 *   CALLERS:  ./RefundRequestOperations.ts, ./RefundPaymentOperation.ts,
 *             packages/Server/src/custom/apply-refund-request-decision.action.ts
 */
import { DatabaseProviderBase, IMetadataProvider, IRunViewProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { IsApprovalOutcome, IsTaskDecisionOutcomeCode, TaskOrchestrationService, type TaskDecisionOutcomeCode } from '@mj-biz-apps/tasks-core';
import {
    LoadGeneratedEntities as LoadTasksEntities,
    type mjBizAppsTasksTaskDecisionEntity,
    type mjBizAppsTasksTaskDecisionOutcomeEntity,
    type mjBizAppsTasksTaskEntity,
    type mjBizAppsTasksTaskLinkEntity,
    type mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import { REFUND_REQUEST_ENTITY, RefundRequestDecisionRefusal, type mjBizAppsOrdersRefundRequestEntity } from '@mj-biz-apps/orders-entities';
import { AssigneeUserIDs } from './AccessOverride.js';
import { ActiveRoleHolderIDs, PERSON_ENTITY, RecordTaskActivity } from './ConcessionApprovalTask.js';
import { OrdersSettings } from './OrdersSettings.js';
import { ResolvePersonIDsForUsers } from './person-user-link.js';
import { RefundApprovers, type IssuableRefundRequest } from './RefundAuthority.js';
import { ReversalGate } from './ReversalAuthority.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';

// The Tasks entity subclasses must be registered before a task is created; see ./AccessOverride.ts.
LoadTasksEntities();

/** The TaskType the approval is raised under. Its hook Actions apply a decision made in the Tasks inbox. */
export const REFUND_REQUEST_TASK_TYPE_CODE = 'ORDERS_REFUND_APPROVAL';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const TASKS_ENTITY = 'MJ_BizApps_Tasks: Tasks';
const TASK_TYPES_ENTITY = 'MJ_BizApps_Tasks: Task Types';
const TASK_LINKS_ENTITY = 'MJ_BizApps_Tasks: Task Links';
const TASK_DECISIONS_ENTITY = 'MJ_BizApps_Tasks: Task Decisions';
const TASK_DECISION_OUTCOMES_ENTITY = 'MJ_BizApps_Tasks: Task Decision Outcomes';
const COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const USER_ENTITY = 'MJ: Users';
const ROLE_ENTITY = 'MJ: Roles';
const REASON_MAX = 1000;

const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

// ─── reads ─────────────────────────────────────────────────────────────────────

interface PaymentFacts {
    ID: string;
    PaymentNumber: string;
    ReceivingCompanyID: string;
    Amount: number;
    Status: string;
}

async function readRows<T>(provider: IMetadataProvider, user: UserInfo, entityName: string, filter: string, fields?: string[]): Promise<T[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true }, user);
    if (!res.Success) throw new Error(`Could not read ${entityName}: ${res.ErrorMessage}`);
    return res.Results ?? [];
}

async function readPayment(paymentID: string, provider: IMetadataProvider, user: UserInfo): Promise<PaymentFacts | null> {
    const rows = await readRows<PaymentFacts>(provider, user, PAYMENT_HEADER_ENTITY, `ID = '${RequireUUID(paymentID, 'PaymentHeaderID')}'`, [
        'ID',
        'PaymentNumber',
        'ReceivingCompanyID',
        'Amount',
        'Status',
    ]);
    return rows[0] ?? null;
}

/** Total already refunded against this payment. */
async function refundedSoFar(paymentID: string, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const rows = await readRows<{ Amount: number }>(
        provider,
        user,
        PAYMENT_HEADER_ENTITY,
        `ReversesPaymentHeaderID = '${RequireUUID(paymentID, 'PaymentHeaderID')}' AND Status = 'Refunded'`,
        ['Amount'],
    );
    return money(rows.reduce((sum, r) => sum + Math.abs(Number(r.Amount ?? 0)), 0));
}

/**
 * The payment's open request (Requested or Approved), or null. The unique index allows at most one.
 * `Orders.RefundPayment` checks it before issuing.
 */
export async function OpenRefundRequestFor(paymentID: string, provider: IMetadataProvider, user: UserInfo): Promise<IssuableRefundRequest | null> {
    const rows = await readRows<IssuableRefundRequest>(
        provider,
        user,
        REFUND_REQUEST_ENTITY,
        `PaymentHeaderID = '${RequireUUID(paymentID, 'PaymentHeaderID')}' AND Status IN ('Requested','Approved')`,
        ['ID', 'Amount', 'RequestedByUserID', 'Status'],
    );
    return rows[0] ?? null;
}

async function loadRequest(id: string, provider: IMetadataProvider, user: UserInfo): Promise<mjBizAppsOrdersRefundRequestEntity | null> {
    const request = await provider.GetEntityObject<mjBizAppsOrdersRefundRequestEntity>(REFUND_REQUEST_ENTITY, user);
    return (await request.Load(RequireUUID(id, 'RefundRequestID'))) ? request : null;
}

// ─── request ───────────────────────────────────────────────────────────────────

export interface RequestRefundInput {
    PaymentHeaderID: string;
    Amount: number;
    Reason: string;
}

export interface RequestRefundOutput {
    Success: boolean;
    Message?: string;
    RefundRequestID?: string;
    ApprovalTaskID?: string;
}

/**
 * Record a request to refund a captured payment and raise its approval task. No money moves until the
 * requester issues the approved refund.
 *
 * Logical refusals come back as `Success: false` with the reason; only faults throw.
 */
export async function RequestRefund(input: RequestRefundInput, provider: IMetadataProvider, user: UserInfo): Promise<RequestRefundOutput> {
    const gate = ReversalGate('Requesting a refund', provider, user);
    if (gate) return { Success: false, Message: gate };
    RequireUUID(input.PaymentHeaderID, 'PaymentHeaderID');

    await OrdersSettings.Load(provider, user);
    const threshold = OrdersSettings.RefundApprovalThreshold;
    if (threshold == null) {
        return { Success: false, Message: 'Refunds do not need approval here (the RefundApprovalThreshold setting is empty), so issue the refund directly.' };
    }
    const reason = (input.Reason ?? '').trim();
    if (!reason) return { Success: false, Message: 'A refund request must state a reason.' };
    if (reason.length > REASON_MAX) return { Success: false, Message: `Reason is limited to ${REASON_MAX} characters.` };

    const payment = await readPayment(input.PaymentHeaderID, provider, user);
    if (!payment) return { Success: false, Message: `No payment found with ID '${input.PaymentHeaderID}'.` };
    const amountCheck = await refundAmountCheck(payment, input.Amount, provider, user);
    if ('Refusal' in amountCheck) return { Success: false, Message: amountCheck.Refusal };

    const open = await OpenRefundRequestFor(payment.ID, provider, user);
    if (open) {
        return {
            Success: false,
            RefundRequestID: open.ID,
            Message: `Payment ${payment.PaymentNumber} already has a ${open.Status} refund request; it must be issued or closed before another is made.`,
        };
    }

    const approvers = await resolveApprovers(payment, money(amountCheck.RefundedSoFar + input.Amount), threshold, provider, user);
    if ('Refusal' in approvers) return { Success: false, Message: approvers.Refusal };
    return createRequestWithTask(payment, money(input.Amount), reason, approvers, provider, user);
}

/** Why `amount` cannot be refunded from `payment`, or what has been refunded so far when it can. */
async function refundAmountCheck(
    payment: PaymentFacts,
    amount: number,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Refusal: string } | { RefundedSoFar: number }> {
    if (payment.Status !== 'Captured') {
        return { Refusal: `Payment ${payment.PaymentNumber} is ${payment.Status}, not Captured. Only a captured payment has money to refund.` };
    }
    if (!Number.isFinite(amount) || money(amount) <= 0) return { Refusal: 'A refund must be greater than zero.' };
    const already = await refundedSoFar(payment.ID, provider, user);
    const refundable = money(payment.Amount - already);
    if (money(amount) > refundable) {
        return {
            Refusal:
                `Cannot request a refund of ${money(amount).toFixed(2)} on payment ${payment.PaymentNumber}: only ${refundable.toFixed(2)} ` +
                `remains refundable (${payment.Amount} captured, ${already} already refunded).`,
        };
    }
    return { RefundedSoFar: already };
}

async function createRequestWithTask(
    payment: PaymentFacts,
    amount: number,
    reason: string,
    approvers: { PersonEntityID: string; PersonIDs: string[] },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RequestRefundOutput> {
    const taskTypeID = await resolveTaskTypeID(provider, user);
    const requestEntity = provider.EntityByName(REFUND_REQUEST_ENTITY);
    if (!requestEntity) throw new Error(`Entity metadata for '${REFUND_REQUEST_ENTITY}' is missing.`);

    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        const request = await provider.GetEntityObject<mjBizAppsOrdersRefundRequestEntity>(REFUND_REQUEST_ENTITY, user);
        request.NewRecord();
        request.PaymentHeaderID = payment.ID;
        request.Amount = amount;
        request.Reason = reason;
        request.Status = 'Requested';
        request.RequestedByUserID = user.ID;
        if (!(await request.Save())) {
            throw new Error(`Failed to save the refund request: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        await new TaskOrchestrationService().CreateApprovalRequest(
            {
                Name: `Approve refund of ${amount.toFixed(2)} on payment ${payment.PaymentNumber}`,
                TypeID: taskTypeID,
                Description: `Requested by ${user.Name ?? user.Email}. Reason: ${reason}. Once approved, the requester issues the refund.`,
                Priority: 'High',
                LinkEntityID: requestEntity.ID,
                LinkRecordID: request.ID,
                ApproverPersonEntityID: approvers.PersonEntityID,
                ApproverPersonRecordIDs: approvers.PersonIDs,
            },
            user,
        );
        // CreateApprovalRequest logs rather than throws on a failed link or assignment; without either
        // the decision could never reach this request, so their absence is a fault.
        const taskID = await findLinkedTaskID(requestEntity.ID, request.ID, provider, user);
        if (!taskID) throw new Error('The approval task was created but its link to the refund request did not persist.');
        if ((await AssigneeUserIDs(taskID, provider, user)).length === 0) {
            throw new Error('The approval task was created but its assignment to the approver did not persist.');
        }

        request.ApprovalTaskID = taskID;
        request.ApprovalTaskRaisedAt = new Date();
        if (!(await request.Save())) {
            throw new Error(`Failed to stamp the approval task on the refund request: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        await db.CommitTransaction();
        return {
            Success: true,
            RefundRequestID: request.ID,
            ApprovalTaskID: taskID,
            Message: `Refund of ${amount.toFixed(2)} requested. Once it is approved, you can issue it.`,
        };
    } catch (err) {
        await rollback(db, 'refund request');
        throw err;
    }
}

// ─── decide ────────────────────────────────────────────────────────────────────

export interface RecordRefundRequestDecisionInput {
    RefundRequestID: string;
    /** A Tasks decision outcome code: `Approved`, `ApprovedWithConditions` or `Rejected`. */
    Outcome: string;
    Notes?: string;
}

export interface RefundRequestDecisionOutput {
    Success: boolean;
    Message?: string;
    /** The request's status after the call. */
    Status?: string;
}

/** Approve or reject a refund request from the app: record the Tasks decision, then apply it. */
export async function RecordRefundRequestDecision(
    input: RecordRefundRequestDecisionInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RefundRequestDecisionOutput> {
    if (!IsTaskDecisionOutcomeCode(input.Outcome)) return { Success: false, Message: `'${input.Outcome}' is not a decision outcome.` };
    const outcome: TaskDecisionOutcomeCode = input.Outcome;
    const request = await loadRequest(input.RefundRequestID, provider, user);
    if (!request) return { Success: false, Message: `No refund request found with ID '${input.RefundRequestID}'.` };
    if (request.Status !== 'Requested') return { Success: false, Status: request.Status, Message: `The refund request is already ${request.Status}.` };
    if (!request.ApprovalTaskID) return { Success: false, Status: request.Status, Message: 'The refund request has no approval task to decide.' };

    const refusal = await RefundDecisionRefusalFor(request, user.ID, provider, user);
    if (refusal) return { Success: false, Status: request.Status, Message: refusal };

    await new TaskOrchestrationService().RecordDecision({ TaskID: request.ApprovalTaskID, OutcomeCode: outcome, Notes: input.Notes }, user);
    return ApplyRefundRequestDecision(request.ApprovalTaskID, provider, user);
}

/**
 * Why `deciderID` may not decide this request, or null when they may. Shared by the in-app decision,
 * the Tasks hook and the entity's own save, so every path holds the same rule.
 */
export async function RefundDecisionRefusalFor(
    request: Pick<mjBizAppsOrdersRefundRequestEntity, 'ApprovalTaskID' | 'RequestedByUserID'>,
    deciderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    if (!request.ApprovalTaskID) return 'The refund request has no approval task to decide.';
    return RefundRequestDecisionRefusal({
        DeciderUserID: deciderID,
        RequesterUserID: request.RequestedByUserID,
        AssigneeUserIDs: await AssigneeUserIDs(request.ApprovalTaskID, provider, user),
    });
}

/**
 * Bring a request in line with its approval task's outcome. `user` is whoever decided the task.
 *
 *   Completed with an approving decision   → Approved (the requester may now issue it)
 *   Cancelled with a Rejected decision      → Rejected
 *   closed any other way                    → Withdrawn
 *   still open, or blocked                  → unchanged
 *
 * A second call after the first has applied it changes nothing.
 */
export async function ApplyRefundRequestDecision(taskID: string, provider: IMetadataProvider, user: UserInfo): Promise<RefundRequestDecisionOutput> {
    RequireUUID(taskID, 'TaskID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const found = await rv.RunView<mjBizAppsOrdersRefundRequestEntity>(
        { EntityName: REFUND_REQUEST_ENTITY, ExtraFilter: `ApprovalTaskID = '${taskID}'`, ResultType: 'entity_object', BypassCache: true },
        user,
    );
    if (!found.Success) throw new Error(`Could not read refund requests: ${found.ErrorMessage}`);
    const request = found.Results?.[0];
    if (!request) return { Success: false, Message: `Task ${taskID} is not a refund request approval.` };
    if (request.Status !== 'Requested') return { Success: true, Status: request.Status, Message: `Already ${request.Status}.` };

    const task = await provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASKS_ENTITY, user);
    if (!(await task.Load(taskID))) throw new Error(`Approval task ${taskID} not found.`);
    const decision = await latestTerminalDecision(taskID, provider, user);
    const outcome = RefundRequestOutcome(task.Status, decision);
    if (!outcome) return { Success: true, Status: request.Status, Message: `The approval task is ${task.Status}; nothing to apply yet.` };

    // A decision made in the Tasks inbox has already closed the task, so one this request refuses
    // cannot be sent back: the request closes Withdrawn with the reason, and may be made again.
    const refusal = outcome === 'Withdrawn' ? null : await RefundDecisionRefusalFor(request, user.ID, provider, user);
    const status = refusal ? 'Withdrawn' : outcome;
    request.Status = status;
    request.DecidedAt = new Date();
    if (status === 'Approved' || status === 'Rejected') request.DecidedByUserID = user.ID;
    request.DecisionNotes =
        status === outcome && outcome !== 'Withdrawn'
            ? (decision?.Notes ?? null)
            : refusal
              ? `The ${outcome === 'Approved' ? 'approval' : 'rejection'} recorded on the approval task was not applied: ${refusal}`
              : `The approval task was ${task.Status} without a matching decision.`;
    if (!(await request.Save())) {
        throw new Error(`Failed to record the decision on refund request ${request.ID}: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    if (refusal) {
        await noteOnTask(taskID, `The ${outcome === 'Approved' ? 'approval' : 'rejection'} was not applied to the refund request, which is now Withdrawn: ${refusal} The requester may ask again.`, provider, user);
        return { Success: false, Status: request.Status, Message: request.DecisionNotes ?? refusal };
    }
    return { Success: true, Status: request.Status, Message: `Refund request ${request.Status}.` };
}

/** What a closed approval task means for its request, or null while it is still open. */
export function RefundRequestOutcome(
    taskStatus: string,
    decision: { IsApproval: boolean } | null,
): 'Approved' | 'Rejected' | 'Withdrawn' | null {
    if (taskStatus === 'Completed') return decision?.IsApproval ? 'Approved' : 'Withdrawn';
    if (taskStatus === 'Cancelled') return decision && !decision.IsApproval ? 'Rejected' : 'Withdrawn';
    return null;
}

// ─── withdraw and issue ────────────────────────────────────────────────────────

export interface WithdrawRefundRequestInput {
    RefundRequestID: string;
    Notes?: string;
}

/**
 * The requester closes their own open request. A Requested one cancels its approval task, which the
 * task type's hook turns into Withdrawn; an Approved one is closed here, since its task is done.
 */
export async function WithdrawRefundRequest(
    input: WithdrawRefundRequestInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RefundRequestDecisionOutput> {
    const request = await loadRequest(input.RefundRequestID, provider, user);
    if (!request) return { Success: false, Message: `No refund request found with ID '${input.RefundRequestID}'.` };
    if (!UUIDsEqual(request.RequestedByUserID, user.ID)) {
        return { Success: false, Status: request.Status, Message: 'Only the person who requested a refund may withdraw it.' };
    }
    if (request.Status !== 'Requested' && request.Status !== 'Approved') {
        return { Success: false, Status: request.Status, Message: `The refund request is already ${request.Status}.` };
    }
    if (request.Status === 'Requested' && request.ApprovalTaskID) {
        await new TaskOrchestrationService().TransitionStatus(request.ApprovalTaskID, 'Cancelled', user);
        const applied = await ApplyRefundRequestDecision(request.ApprovalTaskID, provider, user);
        return { Success: applied.Status === 'Withdrawn', Status: applied.Status, Message: applied.Status === 'Withdrawn' ? 'Refund request withdrawn.' : applied.Message };
    }
    request.Status = 'Withdrawn';
    if (!request.DecidedAt) request.DecidedAt = new Date();
    request.DecisionNotes = `Withdrawn by the requester${input.Notes?.trim() ? `: ${input.Notes.trim()}` : '.'}`;
    if (!(await request.Save())) {
        throw new Error(`Failed to withdraw refund request ${request.ID}: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return { Success: true, Status: request.Status, Message: 'Refund request withdrawn.' };
}

/** Record that the approved request became this refund payment. Runs inside the refund's transaction. */
export async function MarkRefundRequestIssued(requestID: string, refundPaymentID: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const request = await loadRequest(requestID, provider, user);
    if (!request) throw new Error(`Refund request ${requestID} not found.`);
    request.Status = 'Issued';
    request.RefundPaymentHeaderID = RequireUUID(refundPaymentID, 'RefundPaymentHeaderID');
    request.IssuedAt = new Date();
    if (!(await request.Save())) {
        throw new Error(`Failed to mark refund request ${requestID} issued: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

// ─── approvers ─────────────────────────────────────────────────────────────────

/**
 * The person records to assign the approval task to, or why there are none. See
 * ./RefundAuthority.ts `RefundApprovers`. An approver with no active person record cannot be told of
 * the task, so is left out; with none left, the request is refused.
 */
async function resolveApprovers(
    payment: PaymentFacts,
    refundedTotalAfter: number,
    threshold: number,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ PersonEntityID: string; PersonIDs: string[] } | { Refusal: string }> {
    const personEntityID = provider.EntityByName(PERSON_ENTITY)?.ID;
    if (!personEntityID || !provider.EntityByName(COMPANY_PROFILE_ENTITY)) {
        throw new Error('Refund approvers are resolved through the common and accounting apps, and one of them is not installed.');
    }
    const roleName = OrdersSettings.RefundApproverRole;
    const fallbackRole = OrdersSettings.AccessOverrideFallbackApproverRole;
    const decided = RefundApprovers({
        Threshold: threshold,
        RefundedTotalAfter: refundedTotalAfter,
        PaymentNumber: payment.PaymentNumber,
        RequesterUserID: user.ID,
        ApproverRoleName: roleName,
        ApproverRoleHolderIDs: roleName ? await roleHolders(roleName, 'RefundApproverRole', provider, user) : [],
        CompanyApproverUserID: await companyApprover(payment.ReceivingCompanyID, provider, user),
        FallbackRoleName: fallbackRole,
        FallbackHolderIDs: fallbackRole ? await roleHolders(fallbackRole, 'AccessOverrideFallbackApproverRole', provider, user) : [],
    });
    if ('Refusal' in decided) return decided;

    const persons = await ResolvePersonIDsForUsers(RequireUUIDs(decided.UserIDs, 'UserID'), provider, user, { ActiveOnly: true });
    const personIDs: string[] = [];
    for (const userID of decided.UserIDs) {
        const personID = persons.get(userID.toLowerCase());
        if (personID) personIDs.push(personID);
        else LogError(`Refund approver ${userID} has no active person record linked to their user and was not assigned.`);
    }
    if (personIDs.length === 0) {
        return {
            Refusal:
                'The approver for this refund has no active person record linked to their user. The tasks app tells and lists an ' +
                "approver through that record, so no one would see the request. Link a person record to the approver's user.",
        };
    }
    return { PersonEntityID: personEntityID, PersonIDs: personIDs };
}

async function roleHolders(roleName: string, setting: string, provider: IMetadataProvider, user: UserInfo): Promise<string[]> {
    const role = (await readRows<{ ID: string }>(provider, user, ROLE_ENTITY, `Name = '${EscapeText(roleName)}'`, ['ID']))[0];
    if (!role) throw new Error(`The role '${roleName}' (Orders setting ${setting}) does not exist.`);
    return ActiveRoleHolderIDs(role.ID, { Provider: provider, User: user });
}

/** The receiving company's ApprovalCFOUserID, or null when it is unset or that user is inactive. */
async function companyApprover(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    // IS-A: the accounting profile shares its company's ID.
    const profile = (
        await readRows<{ ApprovalCFOUserID: string | null }>(provider, user, COMPANY_PROFILE_ENTITY, `ID = '${RequireUUID(companyID, 'ReceivingCompanyID')}'`, [
            'ApprovalCFOUserID',
        ])
    )[0];
    const named = profile?.ApprovalCFOUserID ?? null;
    if (!named) return null;
    const active = await readRows<{ ID: string }>(provider, user, USER_ENTITY, `ID = '${RequireUUID(named, 'ApprovalCFOUserID')}' AND IsActive = 1`, ['ID']);
    return active.length > 0 ? named : null;
}

// ─── helpers ───────────────────────────────────────────────────────────────────

async function resolveTaskTypeID(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const type = (
        await readRows<mjBizAppsTasksTaskTypeEntity>(provider, user, TASK_TYPES_ENTITY, `Code = '${REFUND_REQUEST_TASK_TYPE_CODE}'`, ['ID'])
    )[0];
    if (!type) throw new Error(`TaskType '${REFUND_REQUEST_TASK_TYPE_CODE}' not found; the Orders task-type metadata has not been installed.`);
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
async function latestTerminalDecision(taskID: string, provider: IMetadataProvider, user: UserInfo): Promise<{ IsApproval: boolean; Notes: string | null } | null> {
    const outcomes = await readRows<mjBizAppsTasksTaskDecisionOutcomeEntity>(provider, user, TASK_DECISION_OUTCOMES_ENTITY, 'IsTerminal = 1');
    const codeByID = new Map(outcomes.map((o) => [o.ID.toLowerCase(), o.Code]));
    const rv = new RunView(provider as unknown as IRunViewProvider);
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

/** Note why a decision was not applied on the task's activity feed. Logged, not thrown. */
async function noteOnTask(taskID: string, note: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    try {
        await RecordTaskActivity(taskID, note, { Provider: provider, User: user });
    } catch (err) {
        LogError(`Could not note on task ${taskID} why its decision was not applied: ${(err as Error).message}`);
    }
}

async function rollback(db: DatabaseProviderBase, what: string): Promise<void> {
    try {
        await db.RollbackTransaction();
    } catch (err) {
        LogError(`Rollback failed after ${what} error: ${err}`);
    }
}
