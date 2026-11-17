/**
 * #844: an open approval task's assignees follow the approving role after the task is raised.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROLE = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const PERSON_ENTITY_ID = '33333333-3333-4333-8333-333333333333';
const REQUESTER = '44444444-4444-4444-8444-444444444444';
const U_KEPT = '55555555-5555-4555-8555-555555555555';
const U_NEW = '66666666-6666-4666-8666-666666666666';
const P_KEPT = 'aaaaaaaa-5555-4555-8555-555555555555';
const P_NEW = 'aaaaaaaa-6666-4666-8666-666666666666';
const P_GONE = 'aaaaaaaa-7777-4777-8777-777777777777';

const state = vi.hoisted(() => ({
    holders: [] as string[],
    assignments: [] as Array<{ AssigneeRecordID: string; Delete: () => Promise<boolean> }>,
    created: [] as string[],
    deleted: [] as string[],
    activities: [] as string[],
}));

vi.mock('@mj-biz-apps/tasks-entities', () => ({}));

vi.mock('../person-user-link.js', () => ({
    ResolvePersonIDsForUsers: vi.fn(async (ids: string[]) => {
        const map = new Map<string, string>([
            [U_KEPT.toLowerCase(), P_KEPT],
            [U_NEW.toLowerCase(), P_NEW],
        ]);
        return new Map(ids.filter((id) => map.has(id.toLowerCase())).map((id) => [id.toLowerCase(), map.get(id.toLowerCase())!]));
    }),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(p: { EntityName: string }) {
            if (p.EntityName === 'MJ: User Roles') return { Success: true, Results: state.holders.map((UserID) => ({ UserID })) };
            if (p.EntityName === 'MJ: Users') return { Success: true, Results: state.holders.map((ID) => ({ ID })) };
            if (p.EntityName === 'MJ_BizApps_Tasks: Task Assignments') return { Success: true, Results: state.assignments };
            return { Success: true, Results: [] };
        }
    }
    return { ...actual, RunView: FakeRunView, LogStatus: vi.fn() };
});

const { SyncApprovalTaskAssignees } = await import('../ConcessionApprovalTask.js');

function ctx() {
    return {
        User: { ID: 'job' },
        Provider: {
            EntityByName: (name: string) => ({ ID: name === 'MJ_BizApps_Common: People' ? PERSON_ENTITY_ID : 'x' }),
            GetEntityObject: vi.fn(async (name: string) => {
                const row: Record<string, unknown> = {
                    NewRecord: () => undefined,
                    Save: async () => {
                        if (name === 'MJ_BizApps_Tasks: Task Assignments') state.created.push(String(row.AssigneeRecordID));
                        if (name === 'MJ_BizApps_Tasks: Task Activities') state.activities.push(String(row.Description));
                        return true;
                    },
                };
                return row;
            }),
        },
    };
}

const assignment = (id: string) => ({
    AssigneeRecordID: id,
    Delete: async () => {
        state.deleted.push(id);
        return true;
    },
});

const concession = { ID: 'c-1', OrderHeaderID: 'o-1', RequestedByUserID: REQUESTER, SalesRuleID: null };

beforeEach(() => {
    state.holders = [];
    state.assignments = [];
    state.created = [];
    state.deleted = [];
    state.activities = [];
});

describe('SyncApprovalTaskAssignees (#844)', () => {
    it('assigns a new role holder and drops one who left the role, and notes it on the task', async () => {
        state.holders = [U_KEPT, U_NEW, REQUESTER];
        state.assignments = [assignment(P_KEPT), assignment(P_GONE)];
        const result = await SyncApprovalTaskAssignees(TASK, concession, ROLE, ctx() as never);
        expect(result).toEqual({ Added: [P_NEW], Removed: [P_GONE] });
        expect(state.created).toEqual([P_NEW]);
        expect(state.deleted).toEqual([P_GONE]);
        expect(state.activities).toHaveLength(1);
        expect(state.activities[0]).toMatch(/1 approver\(s\) added .* 1 removed/);
    });

    it('changes nothing and notes nothing when the assignees already match', async () => {
        state.holders = [U_KEPT];
        state.assignments = [assignment(P_KEPT.toUpperCase())];
        const result = await SyncApprovalTaskAssignees(TASK, concession, ROLE, ctx() as never);
        expect(result).toEqual({ Added: [], Removed: [] });
        expect(state.activities).toHaveLength(0);
    });

    it('refuses, leaving the task alone, when the role has no one left to assign', async () => {
        state.holders = [REQUESTER];
        state.assignments = [assignment(P_KEPT)];
        await expect(SyncApprovalTaskAssignees(TASK, concession, ROLE, ctx() as never)).rejects.toThrow(/no active user other than the requester/);
        expect(state.deleted).toEqual([]);
    });
});
