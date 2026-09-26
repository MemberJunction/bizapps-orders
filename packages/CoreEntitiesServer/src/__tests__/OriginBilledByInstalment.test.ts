/**
 * Whether a reversal's origin line was billed by instalment, which decides whether its tax is
 * refunded (#266). The payment-schedule read is stubbed.
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

const { OriginBilledByInstalment } = await import('../ReversalResolver.js');

const ORDER = '77777777-7777-4777-8777-777777777777';
const row = (CompanyID: string, Status: string) => ({ CompanyID, Status, DueDate: '2026-10-01', Amount: 100 });
const ask = (CompanyID = 'CO-1') => OriginBilledByInstalment({ OrderHeaderID: ORDER, CompanyID }, {} as never, {} as never);

beforeEach(() => mockRunView.mockReset());

describe('OriginBilledByInstalment', () => {
    it("is true when the line's company has a live schedule row, whatever the case of its ID", async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [row('co-1', 'Scheduled')] });
        await expect(ask()).resolves.toBe(true);
    });

    it('is false for a company whose only rows were cancelled, or another company on the schedule', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [row('CO-1', 'Canceled'), row('CO-2', 'Invoiced')] });
        await expect(ask()).resolves.toBe(false);
    });

    it('is false for an order with no schedule', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
        await expect(ask()).resolves.toBe(false);
    });

    it('throws rather than guessing when the schedule cannot be read', async () => {
        mockRunView.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout' });
        await expect(ask()).rejects.toThrow(/payment schedule of the order being reversed: timeout/);
    });
});
