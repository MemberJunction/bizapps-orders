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

import { AssignAlertTask } from '../AlertTaskAssignment.js';

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
