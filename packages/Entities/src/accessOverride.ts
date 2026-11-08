/**
 * Access overrides — exceptions to payment-gated access on an order (bizapps-orders#268).
 *
 *   MJ.BizApps.Orders.Access.Override                    parent; holding it grants both children
 *   MJ.BizApps.Orders.Access.Override.WaivePaymentHold   request a WaivePaymentHold override
 *   MJ.BizApps.Orders.Access.Override.DeferCutoff        request a DeferCutoff override
 *
 * These govern who may REQUEST an override. Who approves one is resolved per request on the server
 * (bizapps-orders#360): the order company's ApprovalCFOUserID, never the requester.
 *
 * Shared so the browser and the server read the same names and the same rules: who may request
 * ({@link userRequestableAccessOverrides}), who may decide ({@link AccessOverrideDecisionRefusal}),
 * and whom an approval task is assigned to ({@link LoadAccessOverrideAssignees}). The server refuses
 * a request outright when the authorization rows are missing from metadata; the request answer is
 * false in that case.
 */
import {
    AuthorizationEvaluator,
    Metadata,
    RunView,
    type AuthorizationInfo,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';

export type AccessOverrideKind = 'WaivePaymentHold' | 'DeferCutoff';

export const ACCESS_OVERRIDE_AUTH = {
    Parent: 'MJ.BizApps.Orders.Access.Override',
    WaivePaymentHold: 'MJ.BizApps.Orders.Access.Override.WaivePaymentHold',
    DeferCutoff: 'MJ.BizApps.Orders.Access.Override.DeferCutoff',
} as const;

/** The override types `user` may request, directly or through the parent authorization. */
export function userRequestableAccessOverrides(
    user: UserInfo | null | undefined,
    provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] },
): AccessOverrideKind[] {
    if (!user) return [];
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    const evaluator = new AuthorizationEvaluator();
    const holds = (name: string): boolean => {
        const auth = auths.find((a) => a.Name === name);
        return !!auth && evaluator.UserCanExecuteWithAncestors(auth, user, auths);
    };
    return (['WaivePaymentHold', 'DeferCutoff'] as const).filter((t) => holds(ACCESS_OVERRIDE_AUTH[t]));
}

// ─── who may decide ────────────────────────────────────────────────────────────

/** A decision about to be recorded on an access override, for {@link AccessOverrideDecisionRefusal}. */
export interface AccessOverrideDecisionFacts {
    /** Whether the decision approves (Approved, ApprovedWithConditions) rather than rejects. */
    Approving: boolean;
    DeciderUserID: string;
    RequesterUserID: string;
    /** The users the approval task is assigned to. */
    AssigneeUserIDs: readonly string[];
    /** The override's last day, `YYYY-MM-DD`. */
    EffectiveThrough: string;
    /** The business day the decision is made on, `YYYY-MM-DD`. */
    Today: string;
}

const sameUser = (a: string | null | undefined, b: string | null | undefined): boolean =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Why this decision may not be recorded, or null when it may (bizapps-orders#360).
 *
 *   the requester deciding their own request     → refused, either way
 *   a user the approval task is not assigned to  → refused, either way
 *   an approval after the override's last day    → refused; a rejection still closes it
 *
 * The server holds every decision to it; the order form asks it before offering Approve or Reject.
 */
export function AccessOverrideDecisionRefusal(facts: AccessOverrideDecisionFacts): string | null {
    if (sameUser(facts.DeciderUserID, facts.RequesterUserID)) {
        return 'The user who requested an access override cannot decide it.';
    }
    if (!facts.AssigneeUserIDs.some((id) => sameUser(id, facts.DeciderUserID))) {
        return 'Only an approver the approval task is assigned to may decide this access override.';
    }
    if (facts.Approving && facts.EffectiveThrough < facts.Today) {
        return (
            `The override's last day (${facts.EffectiveThrough}) has passed, so it can no longer be approved. ` +
            'Reject it, and request a new one if the exception is still needed.'
        );
    }
    return null;
}

// ─── whom the approval task is assigned to ─────────────────────────────────────

const TASK_ASSIGNMENT_ENTITY = 'MJ_BizApps_Tasks: Task Assignments';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';
const USER_ENTITY = 'MJ: Users';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One assignee of an access override's approval task. */
export interface AccessOverrideAssignee {
    /** The user who decides for this assignee: a person record's linked user, or the user assigned directly. Null when a person record has no linked user. */
    UserID: string | null;
    /** The name to show for the assignee. */
    Name: string;
}

const quotedIDs = (ids: readonly string[], what: string): string => {
    for (const id of ids) if (!UUID.test(id)) throw new Error(`${what} '${id}' is not a uniqueidentifier.`);
    return ids.map((id) => `'${id}'`).join(',');
};

/**
 * The assignees of each approval task, keyed by the task ID in lower case. The tasks app assigns
 * through a person record, whose linked user is the one who decides; an assignment made directly to
 * a user counts as that user. A task with no assignments is absent from the map.
 *
 * Runs on either tier with whatever provider it is given, so the server's decision rule and the
 * order form read the same assignees.
 */
export async function LoadAccessOverrideAssignees(
    taskIDs: readonly string[],
    provider: IMetadataProvider,
    user?: UserInfo,
): Promise<Map<string, AccessOverrideAssignee[]>> {
    const out = new Map<string, AccessOverrideAssignee[]>();
    const ids = [...new Set(taskIDs.map((id) => id.toLowerCase()))];
    if (!ids.length) return out;
    const rv = RunView.FromMetadataProvider(provider);
    const read = async <T>(entityName: string, filter: string, fields: string[]): Promise<T[]> => {
        const res = await rv.RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true }, user);
        if (!res.Success) throw new Error(`Could not read ${entityName}: ${res.ErrorMessage}`);
        return res.Results ?? [];
    };

    const rows = await read<{ TaskID: string; AssigneeEntityID: string; AssigneeRecordID: string }>(
        TASK_ASSIGNMENT_ENTITY,
        `TaskID IN (${quotedIDs(ids, 'TaskID')})`,
        ['TaskID', 'AssigneeEntityID', 'AssigneeRecordID'],
    );
    const personEntityID = provider.EntityByName(PERSON_ENTITY)?.ID;
    const userEntityID = provider.EntityByName(USER_ENTITY)?.ID;
    const isPerson = (r: { AssigneeEntityID: string }) => sameUser(r.AssigneeEntityID, personEntityID);
    const isUser = (r: { AssigneeEntityID: string }) => sameUser(r.AssigneeEntityID, userEntityID);

    const personIDs = rows.filter(isPerson).map((r) => r.AssigneeRecordID);
    const userIDs = rows.filter(isUser).map((r) => r.AssigneeRecordID);
    const persons = personIDs.length
        ? await read<{ ID: string; LinkedUserID: string | null; DisplayName: string | null; FirstName: string | null; LastName: string | null }>(
              PERSON_ENTITY,
              `ID IN (${quotedIDs(personIDs, 'PersonID')})`,
              ['ID', 'LinkedUserID', 'DisplayName', 'FirstName', 'LastName'],
          )
        : [];
    const users = userIDs.length ? await read<{ ID: string; Name: string }>(USER_ENTITY, `ID IN (${quotedIDs(userIDs, 'UserID')})`, ['ID', 'Name']) : [];

    for (const r of rows) {
        let assignee: AccessOverrideAssignee | null = null;
        if (isPerson(r)) {
            const p = persons.find((x) => sameUser(x.ID, r.AssigneeRecordID));
            if (p) {
                const name = p.DisplayName?.trim() || [p.FirstName, p.LastName].filter(Boolean).join(' ').trim();
                assignee = { UserID: p.LinkedUserID ?? null, Name: name || 'An unnamed person' };
            }
        } else if (isUser(r)) {
            const u = users.find((x) => sameUser(x.ID, r.AssigneeRecordID));
            assignee = { UserID: r.AssigneeRecordID, Name: u?.Name ?? 'An unnamed user' };
        }
        if (!assignee) continue;
        const key = r.TaskID.toLowerCase();
        const list = out.get(key) ?? [];
        list.push(assignee);
        out.set(key, list);
    }
    return out;
}
