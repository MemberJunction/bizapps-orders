/**
 * ConcessionApprovalListener — a decision recorded on an order's approval task decides its concessions
 * (golive #274).
 *
 * The tasks app records a decision as a `TaskDecision` row and offers no typed callback, so this listens for
 * that row being created. A terminal outcome is applied to every Pending concession the task links, through
 * the concession's own Save: the role check, the decider stamp and the decision note are the ones deciding
 * the record applies. The decider is the user who recorded the decision.
 *
 * AFTER THE FACT. The decision is already saved when this runs, so a concession that refuses — its decider
 * does not hold the rule's role — stays Pending and the refusal is logged. The order stays held, which is
 * the safe side; the concession can still be decided on its record, and the next Pending concession on the
 * order raises a fresh task that links it again.
 *
 * CONNECTS TO:
 *   EVENTS: MJGlobal BaseEntity 'save' of 'MJ_BizApps_Tasks: Task Decisions'
 *   WRITES: Order Concessions (Status, DecisionNotes) via OrderConcessionEntityServer
 *   READS:  Task Decision Outcomes · Task Links (./ConcessionApprovalTask.ts)
 */
import { BaseEntity, LogError, type BaseEntityEvent, type IMetadataProvider } from '@memberjunction/core';
import { MJEventType, MJGlobal, type MJEvent } from '@memberjunction/global';
import type {
    mjBizAppsTasksTaskDecisionEntity,
    mjBizAppsTasksTaskDecisionOutcomeEntity,
} from '@mj-biz-apps/tasks-entities';
import {
    ConcessionStatusForOutcome,
    LinkedConcessionIDs,
    requireSubclass,
    TASK_DECISION_ENTITY,
    TASK_DECISION_OUTCOME_ENTITY,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import { OrderConcessionEntityServer } from './OrderConcessionEntityServer.js';
import { ORDER_CONCESSION_ENTITY } from './entity-names.js';

const SUBSCRIPTION_KEY = '___BizAppsOrders___ConcessionApprovalListener___Subscription';
const LOG_PREFIX = '[BizAppsOrders] Concession approval:';

/** What a task decision did to one linked concession. */
export interface ConcessionDecisionResult {
    ConcessionID: string;
    Applied: boolean;
    Message?: string;
}

/** Subscribe once per process. Called from the orders server bootstrap. */
export function InitConcessionApprovalListener(): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store[SUBSCRIPTION_KEY]) return;

    store[SUBSCRIPTION_KEY] = MJGlobal.Instance.GetEventListener(false).subscribe((event: MJEvent) => {
        if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) return;
        const entityEvent = event.args as BaseEntityEvent;
        if (entityEvent.type !== 'save' || entityEvent.saveSubType !== 'create') return;
        const entity = entityEvent.baseEntity;
        if (entity?.EntityInfo?.Name !== TASK_DECISION_ENTITY) return;
        try {
            requireSubclass(entity, TASK_DECISION_ENTITY);
        } catch (err) {
            LogError(`${LOG_PREFIX} ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        // A registered subclass of this entity carries its generated properties, whichever copy it is.
        const decision = entity as unknown as mjBizAppsTasksTaskDecisionEntity;
        ApplyTaskDecisionToConcessions(decision).catch((err: unknown) =>
            LogError(`${LOG_PREFIX} decision ${decision.ID} was not applied: ${err instanceof Error ? err.message : String(err)}`),
        );
    });
}

/**
 * Apply a recorded task decision to the Pending concessions its task links. Returns one result per linked
 * concession that was Pending; an interim outcome, or a task that links no concession, returns none.
 */
export async function ApplyTaskDecisionToConcessions(
    decision: mjBizAppsTasksTaskDecisionEntity,
): Promise<ConcessionDecisionResult[]> {
    const user = decision.ContextCurrentUser;
    if (!user) throw new Error('the decision carries no user to decide the concessions as');
    const ctx: ApprovalTaskContext = { Provider: decision.ProviderToUse as unknown as IMetadataProvider, User: user };

    const concessionIDs = await LinkedConcessionIDs(decision.TaskID, ctx);
    if (concessionIDs.length === 0) return [];

    const outcome = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskDecisionOutcomeEntity>(TASK_DECISION_OUTCOME_ENTITY, user);
    requireSubclass(outcome, TASK_DECISION_OUTCOME_ENTITY);
    if (!(await outcome.Load(decision.OutcomeID))) throw new Error(`outcome ${decision.OutcomeID} was not found`);
    if (!outcome.IsTerminal) return [];
    const status = ConcessionStatusForOutcome(outcome.Code);
    if (!status) {
        throw new Error(`'${outcome.Code}' is not an outcome orders can apply to a concession; the concessions stay Pending`);
    }

    const results: ConcessionDecisionResult[] = [];
    for (const id of concessionIDs) {
        const concession = await ctx.Provider.GetEntityObject<BaseEntity>(ORDER_CONCESSION_ENTITY, user);
        if (!(concession instanceof OrderConcessionEntityServer)) {
            throw new Error(`'${ORDER_CONCESSION_ENTITY}' resolved to ${concession.constructor.name}, not OrderConcessionEntityServer`);
        }
        if (!(await concession.Load(id)) || concession.Status !== 'Pending') continue;

        concession.Status = status;
        concession.DecisionNotes = decision.DecisionNotes;
        concession.DecidedThroughTask = true;
        if (await concession.Save()) {
            results.push({ ConcessionID: id, Applied: true });
        } else {
            const message = concession.LatestResult?.CompleteMessage ?? 'unknown error';
            LogError(`${LOG_PREFIX} task ${decision.TaskID} decided concession ${id}, which refused: ${message}`);
            results.push({ ConcessionID: id, Applied: false, Message: message });
        }
    }
    return results;
}
