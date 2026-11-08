/**
 * ConcessionAcknowledgment — accounting is told of every approved concession (golive #268).
 *
 * An approved term extension already raises an acknowledgment task for accounting (./TermExtension.ts). Every
 * other approved concession changes what the customer was sold too, including one approved within the
 * requester's own Sales Authority that no approver saw, and accounting must hear of it. This raises the same
 * task for those: assigned to every active holder of the `AmendmentAcknowledgmentRole` setting's role except
 * the requester, linked to the concession and its order. An open task is an approval accounting has not yet
 * confirmed.
 *
 * With the setting empty, no task is raised and the approval goes ahead: a term extension alone refuses
 * without one, because only its recognition re-cut is invisible to every other reconciliation. With the
 * setting set, a task that cannot be raised refuses the approval, as it does for an extension.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (in the approval's own transaction)
 *   READS:  ./TermExtension.ts (AcknowledgerIDs) · ./OrdersSettings.ts
 *   TASKS:  ./ConcessionApprovalTask.ts (links, assignments; withdrawing the concession closes the task)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import type { mjBizAppsTasksTaskEntity } from '@mj-biz-apps/tasks-entities';
import { EntityIDFor } from './AccountingBridge.js';
import {
    ConcessionSummary,
    EnsureTaskAssignment,
    EnsureTaskLink,
    requireSubclass,
    TASK_ENTITY,
    TASK_TYPE_ENTITY,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { OrdersSettings } from './OrdersSettings.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { AcknowledgerIDs } from './TermExtension.js';

const USER_ENTITY = 'MJ: Users';
const ACKNOWLEDGMENT_TASK_TYPE_CODE = 'ACTION_ITEM';

/** An approved concession, as the acknowledgment task describes it. */
export interface ApprovedConcessionFacts {
    ID: string;
    OrderHeaderID: string;
    DeliveryForm: string;
    ReasonCategory: string;
    Reason: string;
    ComputedValue: number;
    CumulativeShare: number | null;
    AddedDays: number | null;
    AddedQuantity: number | null;
    RequestedByUserID: string;
    /** How it was approved: on the requester's own authority, or by a decision under the ConcessionLimit rule. */
    ApprovedOnAuthority: boolean;
}

/**
 * Raise accounting's acknowledgment task for an approved concession. Returns the task's ID, or null when no
 * acknowledgment role is configured. Throws when one is configured and the task cannot be raised, so the
 * caller's transaction rolls the approval back.
 */
export async function RaiseConcessionAcknowledgment(
    concession: ApprovedConcessionFacts,
    ctx: ApprovalTaskContext,
): Promise<string | null> {
    await OrdersSettings.Load(ctx.Provider, ctx.User);
    if (!OrdersSettings.AmendmentAcknowledgmentRole) return null;

    const acknowledgers = await AcknowledgerIDs(concession.RequestedByUserID, ctx);
    if (typeof acknowledgers === 'string') throw new Error(acknowledgers);

    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const [types, orders] = await rv.RunViews(
        [
            {
                EntityName: TASK_TYPE_ENTITY,
                ExtraFilter: `Code = '${EscapeText(ACKNOWLEDGMENT_TASK_TYPE_CODE)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                MaxRows: 1,
                BypassCache: true,
            },
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(concession.OrderHeaderID, 'OrderHeaderID')}'`,
                Fields: ['OrderNumber'],
                ResultType: 'simple',
                BypassCache: true,
            },
        ],
        ctx.User,
    );
    const typeID = (types?.Results?.[0] as { ID: string } | undefined)?.ID;
    if (!typeID) {
        throw new Error(`The tasks app has no '${ACKNOWLEDGMENT_TASK_TYPE_CODE}' task type, so accounting cannot be told of the concession.`);
    }
    const orderNumber = (orders?.Results?.[0] as { OrderNumber: string } | undefined)?.OrderNumber ?? concession.OrderHeaderID;
    const summary = ConcessionSummary({
        DeliveryForm: concession.DeliveryForm,
        ComputedValue: Number(concession.ComputedValue ?? 0),
        AddedDays: concession.AddedDays,
        AddedQuantity: concession.AddedQuantity,
    });

    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    task.NewRecord();
    task.TypeID = typeID;
    task.Name = `Confirm the approved concession: ${orderNumber}, ${summary}`;
    task.Description = AcknowledgmentDescription(orderNumber, summary, concession);
    task.Priority = 'Medium';
    task.Status = 'Open';
    if (!(await task.Save())) {
        throw new Error(`The acknowledgment task for ${orderNumber} could not be created: ${task.LatestResult?.CompleteMessage}`);
    }

    await EnsureTaskLink(task.ID, EntityIDFor(ORDER_CONCESSION_ENTITY), concession.ID, ctx);
    await EnsureTaskLink(task.ID, EntityIDFor(ORDER_HEADER_ENTITY), concession.OrderHeaderID, ctx);
    const userEntityID = EntityIDFor(USER_ENTITY);
    for (const userID of acknowledgers) {
        await EnsureTaskAssignment(task.ID, userEntityID, userID, ctx);
    }
    return task.ID;
}

/** What accounting reads on the task. */
export function AcknowledgmentDescription(orderNumber: string, summary: string, concession: ApprovedConcessionFacts): string {
    const route = concession.ApprovedOnAuthority
        ? "within the requester's own Sales Authority"
        : 'by an approver under the ConcessionLimit rule';
    const share =
        concession.CumulativeShare != null
            ? ` The order's concessions now come to ${Math.round(Number(concession.CumulativeShare) * 1e4) / 100}% of its net total.`
            : '';
    return (
        `A ${concession.DeliveryForm} concession on ${orderNumber} (${summary}) was approved ${route} ` +
        `(${concession.ReasonCategory}: ${concession.Reason}).${share} Confirm it is recorded, then complete this task.`
    );
}
