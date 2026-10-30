/**
 * A draft order with lines can be deleted (#843): its lines, their dependents and the order-level
 * rows its saves wrote go first, in one transaction, and a confirmed order is refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

const { OrderEntityServer } = await import('../OrderEntityServer.js');
const { OrderHeaderEntity } = await import('@mj-biz-apps/orders-entities');

const ORDER = '3f2504e0-4f89-41d3-9a0c-0305e82c3300';
const id = (n: number) => `3f2504e0-4f89-41d3-9a0c-0305e82c33${String(n).padStart(2, '0')}`;

function row(label: string, log: string[], fields: Record<string, unknown> = {}) {
    return {
        ...fields,
        Get: (name: string) => fields[name],
        Delete: vi.fn(async () => {
            log.push(label);
            return true;
        }),
        LatestResult: { CompleteMessage: '' },
        ResultHistory: [],
        Validate: () => ({ Success: true, Errors: [] }),
    };
}

function draftOrder(status: string, log: string[]) {
    const order = Object.create(OrderEntityServer.prototype) as {
        Delete(): Promise<boolean>;
        deleteLineDependents(line: unknown): Promise<void>;
    };
    const history: Array<{ Message: string }> = [];
    const provider = {
        BeginTransaction: vi.fn(async () => log.push('begin')),
        CommitTransaction: vi.fn(async () => log.push('commit')),
        RollbackTransaction: vi.fn(async () => log.push('rollback')),
    };
    for (const [k, v] of Object.entries({
        ID: ORDER,
        IsSaved: true,
        Status: status,
        OrderNumber: 'ORD-000009',
        Fields: [],
        ProviderToUse: provider,
        ContextCurrentUser: { ID: 'user-1' },
        GetFieldByName: () => ({ OldValue: status }),
        RegisterResultHistoryEntry: (r: { Message: string }) => history.push(r),
        deleteLineDependents: vi.fn(async (line: { LineNumber: number }) => log.push(`dependents:${line.LineNumber}`)),
    })) {
        Object.defineProperty(order, k, { value: v, writable: true });
    }
    return { order, history, provider };
}

beforeEach(() => {
    mockRunView.mockReset();
});

describe('OrderEntityServer.Delete', () => {
    it('refuses a confirmed order and touches nothing', async () => {
        const log: string[] = [];
        const { order, history } = draftOrder('Confirmed', log);

        await expect(order.Delete()).resolves.toBe(false);
        expect(history[0].Message).toMatch(/only a Draft or Quoted order can be deleted/i);
        expect(mockRunView).not.toHaveBeenCalled();
        expect(log).toEqual([]);
    });

    it('deletes lines (component before bundle), then order-level rows, then the header, in one transaction', async () => {
        const log: string[] = [];
        const bundle = row('line:1', log, { ID: id(1), LineNumber: 1, ParentOrderLineID: null });
        const component = row('line:2', log, { ID: id(2), LineNumber: 2, ParentOrderLineID: id(1) });
        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            const results: Record<string, unknown[]> = {
                'MJ_BizApps_Orders: Order Lines': [bundle, component],
                'MJ_BizApps_Orders: Order Concessions': [row('concession', log)],
                'MJ_BizApps_Orders: Order Adjustments': [row('adjustment', log, { ID: id(10) })],
                'MJ_BizApps_Orders: Order Adjustment Allocations': [row('adjustment-allocation', log)],
                'MJ_BizApps_Orders: Order Charges': [row('charge', log, { ID: id(11) })],
                'MJ_BizApps_Orders: Order Charge Allocations': [row('charge-allocation', log)],
            };
            return { Success: true, Results: results[params.EntityName] ?? [] };
        });
        const headerDelete = vi.spyOn(OrderHeaderEntity.prototype, 'Delete').mockImplementation(async () => {
            log.push('header');
            return true;
        });
        const { order } = draftOrder('Draft', log);

        try {
            await expect(order.Delete()).resolves.toBe(true);
        } finally {
            headerDelete.mockRestore();
        }

        expect(log).toEqual([
            'begin',
            'dependents:2',
            'line:2',
            'dependents:1',
            'line:1',
            'concession',
            'adjustment-allocation',
            'adjustment',
            'charge-allocation',
            'charge',
            'header',
            'commit',
        ]);
    });

    it('rolls back and reports why when a dependent row will not delete', async () => {
        const log: string[] = [];
        const stuck = row('line:1', log, { ID: id(1), LineNumber: 1, ParentOrderLineID: null });
        stuck.Delete = vi.fn(async () => false);
        stuck.LatestResult = { CompleteMessage: 'referenced by a payment intent' };
        mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
            Success: true,
            Results: params.EntityName === 'MJ_BizApps_Orders: Order Lines' ? [stuck] : [],
        }));
        const { order, history } = draftOrder('Draft', log);

        await expect(order.Delete()).resolves.toBe(false);
        expect(log).toContain('rollback');
        expect(history[0].Message).toMatch(/order line 1/);
    });
});
