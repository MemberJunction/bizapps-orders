/**
 * A draft's cleanup deletes as the system user, once the signed-in user's right is checked (golive #461).
 *
 * The business roles hold Create and Update on an order line and the rows its saves write (price
 * components, dimensions, allocations), not Delete. The cleanup deleted those rows as the signed-in
 * user, so every line removal by those roles failed on the first table that had a row. The person's
 * right is now asked once, at the order, and the deletes that follow run as the system user.
 */
import { EntityPermissionType } from '@memberjunction/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));
const SYSTEM = { ID: 'system' };
const PERSON = { ID: 'person' };

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ...actual, UserCache: { Instance: { GetSystemUser: () => SYSTEM } } };
});

const { OrderEntityServer } = await import('../OrderEntityServer.js');

const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

type CleanupOrder = {
    deleteRemovedLines(): Promise<boolean>;
    passesCleanupRight(verb: string, onOrder: EntityPermissionType): boolean;
    Delete(): Promise<boolean>;
};

/** A line whose `Delete` records the user it ran as. */
function line(deletedAs: unknown[]) {
    const row: { ID: string; LineNumber: number; IsSaved: boolean; ContextCurrentUser: unknown; Delete: () => Promise<boolean> } = {
        ID: LINE_ID,
        LineNumber: 2,
        IsSaved: true,
        ContextCurrentUser: PERSON,
        Delete: vi.fn(async () => {
            deletedAs.push(row.ContextCurrentUser);
            return true;
        }),
    };
    return row;
}

/** An order with the real prototype, a person signed in, and the rights given. */
function order(removed: unknown[], rights: { order: boolean; lines: boolean }) {
    const instance = Object.create(OrderEntityServer.prototype) as CleanupOrder;
    const history: Array<{ Message: string }> = [];
    for (const [k, v] of Object.entries({
        Lines: { Removed: removed, Items: [] },
        OrderNumber: 'ORD-000009',
        Fields: [],
        ContextCurrentUser: PERSON,
        ProviderToUse: {
            EntityByName: () => ({ GetUserPermisions: () => ({ CanUpdate: rights.lines }) }),
        },
        CheckPermissions: vi.fn(() => rights.order),
        RegisterResultHistoryEntry: (r: { Message: string }) => history.push(r),
    })) {
        Object.defineProperty(instance, k, { value: v, writable: true });
    }
    return { instance, history };
}

beforeEach(() => {
    mockRunView.mockReset();
    mockRunView.mockResolvedValue({ Success: true, Results: [] });
});

describe('removed-line cleanup runs as the system user', () => {
    it('reads every dependent table as the system user', async () => {
        const { instance } = order([line([])], { order: true, lines: true });

        await instance.deleteRemovedLines();

        expect(mockRunView).toHaveBeenCalled();
        for (const call of mockRunView.mock.calls) expect(call[1]).toBe(SYSTEM);
    });

    it('deletes a dependent row and the line as the system user, and gives the line its user back', async () => {
        const deletedAs: unknown[] = [];
        const dependent = { Delete: vi.fn(async () => true) };
        mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
            Success: true,
            Results: params.EntityName === 'MJ_BizApps_Orders: Order Line Dimensions' ? [dependent] : [],
        }));
        const removed = line(deletedAs);
        const { instance } = order([removed], { order: true, lines: true });

        await instance.deleteRemovedLines();

        expect(dependent.Delete).toHaveBeenCalledTimes(1);
        expect(deletedAs).toEqual([SYSTEM]);
        expect(removed.ContextCurrentUser).toBe(PERSON);
    });
});

describe('OrderEntityServer.passesCleanupRight', () => {
    it('lets a person who may update the order and its lines remove a line', () => {
        const { instance } = order([line([])], { order: true, lines: true });

        expect(instance.passesCleanupRight('remove lines from', EntityPermissionType.Update)).toBe(true);
    });

    it('refuses a person who may not update the order lines, in words that say so', () => {
        const { instance, history } = order([line([])], { order: true, lines: false });

        expect(instance.passesCleanupRight('remove lines from', EntityPermissionType.Update)).toBe(false);
        expect(history[0].Message).toMatch(/do not have permission to remove lines from order ORD-000009/);
    });

    it('refuses a person who may not update the order', () => {
        const { instance } = order([line([])], { order: false, lines: true });

        expect(instance.passesCleanupRight('remove lines from', EntityPermissionType.Update)).toBe(false);
    });

    it('asks nothing when no saved line was removed', () => {
        const { instance } = order([], { order: false, lines: false });

        expect(instance.passesCleanupRight('remove lines from', EntityPermissionType.Update)).toBe(true);
    });
});

describe('OrderEntityServer.Delete on a draft', () => {
    it('refuses a person without Delete on the order before anything is read or deleted', async () => {
        const { instance, history } = order([], { order: false, lines: true });
        for (const [k, v] of Object.entries({
            ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3300',
            IsSaved: true,
            Status: 'Draft',
            GetFieldByName: () => ({ OldValue: 'Draft' }),
        })) {
            Object.defineProperty(instance, k, { value: v, writable: true });
        }

        await expect(instance.Delete()).resolves.toBe(false);
        expect(history[0].Message).toMatch(/do not have permission to delete order ORD-000009/);
        expect(mockRunView).not.toHaveBeenCalled();
    });
});
