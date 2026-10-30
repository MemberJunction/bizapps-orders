/**
 * Every Orders alert Task is assigned to the holders of the `AlertTaskRole` role, so the tasks app tells a
 * person (access sync A3). Example: AIDP names "Sidecar Support"; Sess and Ethan hold it; a dead-lettered
 * delivery to the Learning Hub raises a Task assigned to both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { mockRunView, mockHolders, mockEnsure, mockLoad, settings, mockLogError } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockHolders: vi.fn(),
    mockEnsure: vi.fn(),
    mockLoad: vi.fn(),
    settings: { AlertTaskRole: null as string | null },
    mockLogError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});
vi.mock('../ConcessionApprovalTask.js', () => ({
    ActiveRoleHolderIDs: (...args: unknown[]) => mockHolders(...args),
    EnsureTaskAssignment: (...args: unknown[]) => mockEnsure(...args),
}));
vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: (...args: unknown[]) => mockLoad(...args),
        get AlertTaskRole() {
            return settings.AlertTaskRole;
        },
    },
}));

import { ALERT_SWEEP_BATCH, AlertSweepDue, AssignAlertTask, AssignUnassignedAlertTasks } from '../AlertTaskAssignment.js';

const USER_ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';
const SESS = '33333333-3333-4333-8333-333333333333';
const ETHAN = '44444444-4444-4444-8444-444444444444';
const provider = { EntityByName: (name: string) => (name === 'MJ: Users' ? { ID: USER_ENTITY_ID } : undefined) } as unknown as IMetadataProvider;
const user = { ID: 'job-user' } as unknown as UserInfo;

beforeEach(() => {
    mockRunView.mockReset().mockResolvedValue({ Success: true, Results: [{ ID: ROLE_ID }] });
    mockHolders.mockReset().mockResolvedValue([SESS, ETHAN]);
    mockEnsure.mockReset().mockResolvedValue(undefined);
    mockLoad.mockReset().mockResolvedValue(undefined);
    mockLogError.mockReset();
    settings.AlertTaskRole = 'Sidecar Support';
});

describe('AssignAlertTask', () => {
    it('assigns the Task to every active holder of the configured role', async () => {
        const out = await AssignAlertTask('task-1', provider, user);
        expect(out).toEqual({ Assigned: 2 });
        expect((mockRunView.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter).toBe("Name = 'Sidecar Support'");
        expect(mockHolders.mock.calls[0][0]).toBe(ROLE_ID);
        expect(mockEnsure.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
            ['task-1', USER_ENTITY_ID, SESS],
            ['task-1', USER_ENTITY_ID, ETHAN],
        ]);
    });

    it('no role configured: unassigned, as before, and nothing read', async () => {
        settings.AlertTaskRole = null;
        expect(await AssignAlertTask('task-1', provider, user)).toEqual({ Skipped: 'NoRoleConfigured' });
        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('a role name that is not a role: unassigned, and the log says which setting', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
        expect(await AssignAlertTask('task-1', provider, user)).toEqual({ Skipped: 'RoleNotFound' });
        expect(String(mockLogError.mock.calls[0][0])).toContain('AlertTaskRole');
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('a role with no active holder: unassigned, logged', async () => {
        mockHolders.mockResolvedValue([]);
        expect(await AssignAlertTask('task-1', provider, user)).toEqual({ Skipped: 'NoActiveHolders' });
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('never throws: an assignment that fails is reported and logged, and the alert stands', async () => {
        mockEnsure.mockRejectedValueOnce(new Error('assignment save refused'));
        const out = await AssignAlertTask('task-1', provider, user);
        expect(out).toEqual({ Failed: 'assignment save refused' });
        expect(String(mockLogError.mock.calls[0][0])).toContain('could not be assigned');
    });

    it('never throws when the settings themselves cannot be read', async () => {
        mockLoad.mockRejectedValueOnce(new Error('settings engine down'));
        expect(await AssignAlertTask('task-1', provider, user)).toEqual({ Failed: 'settings engine down' });
    });
});

describe('AssignUnassignedAlertTasks: a later pass assigns what a first failure left unassigned', () => {
    const tasksView = (rows: Array<{ ID: string }>) =>
        mockRunView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === 'MJ: Roles' ? { Success: true, Results: [{ ID: ROLE_ID }] } : { Success: true, Results: rows },
        );

    it('assigns each open, unassigned Orders alert to every holder, idempotently, and reads only those', async () => {
        tasksView([{ ID: 'task-a' }, { ID: 'task-b' }]);
        expect(await AssignUnassignedAlertTasks(provider, user)).toEqual({ Assigned: 2 });
        expect(mockEnsure.mock.calls.map((c) => [c[0], c[2]])).toEqual([
            ['task-a', SESS],
            ['task-a', ETHAN],
            ['task-b', SESS],
            ['task-b', ETHAN],
        ]);
        const read = mockRunView.mock.calls.find((c) => (c[0] as { EntityName: string }).EntityName === 'MJ_BizApps_Tasks: Tasks')![0] as {
            ExtraFilter: string;
            MaxRows: number;
        };
        expect(read.ExtraFilter).toContain("Status = 'Open'");
        expect(read.ExtraFilter).toContain("Name LIKE 'Outbound delivery failed: %'");
        expect(read.ExtraFilter).toContain("Name LIKE 'Checkout capture not booked: %'");
        expect(read.ExtraFilter).toContain('ID NOT IN (SELECT ta.TaskID FROM __mj_BizAppsTasks.TaskAssignment ta');
        expect(read.MaxRows).toBe(ALERT_SWEEP_BATCH);
        // Newest first, so Tasks that can never be assigned collect at the old end instead of filling every batch.
        expect((read as unknown as { OrderBy: string }).OrderBy).toBe('__mj_CreatedAt DESC');
    });

    it('no role configured: reads no Task at all (the minute job pays nothing)', async () => {
        settings.AlertTaskRole = null;
        expect(await AssignUnassignedAlertTasks(provider, user)).toEqual({ Skipped: 'NoRoleConfigured' });
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('a role that is not a role: logged ONCE for the pass, not once per Task, and no Task read', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
        expect(await AssignUnassignedAlertTasks(provider, user)).toEqual({ Skipped: 'RoleNotFound' });
        expect(mockLogError).toHaveBeenCalledTimes(1);
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('one Task that cannot be assigned does not hold up the others (it is read first every time)', async () => {
        tasksView([{ ID: 'task-bad' }, { ID: 'task-b' }]);
        mockEnsure.mockImplementation(async (taskID: string) => {
            if (taskID === 'task-bad') throw new Error('assignment refused');
        });
        expect(await AssignUnassignedAlertTasks(provider, user)).toEqual({ Assigned: 1, Unassignable: 1 });
        expect(mockEnsure.mock.calls.filter((c) => c[0] === 'task-b').map((c) => c[2])).toEqual([SESS, ETHAN]);
        expect(String(mockLogError.mock.calls[0][0])).toContain('task-bad could not be assigned');
    });

    it('never throws: a failing read is reported and logged', async () => {
        mockRunView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === 'MJ: Roles' ? { Success: true, Results: [{ ID: ROLE_ID }] } : { Success: false, ErrorMessage: 'timeout' },
        );
        expect(await AssignUnassignedAlertTasks(provider, user)).toEqual({ Failed: 'timeout' });
        expect(String(mockLogError.mock.calls[0][0])).toContain('Unassigned alert Tasks could not be assigned');
    });
});

describe('AlertSweepDue: the sweep runs on the quarter hours, not on every minute pass', () => {
    it('due at :00, :15, :30, :45 (UTC); not between', () => {
        for (const m of ['00', '15', '30', '45']) expect(AlertSweepDue(new Date(`2026-11-01T10:${m}:20Z`))).toBe(true);
        for (const m of ['01', '07', '14', '59']) expect(AlertSweepDue(new Date(`2026-11-01T10:${m}:20Z`))).toBe(false);
    });
});
