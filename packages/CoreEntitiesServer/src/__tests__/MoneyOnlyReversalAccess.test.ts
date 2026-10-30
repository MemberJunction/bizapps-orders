/**
 * A returned line takes its access with it, except on a reversal Orders marked money-only (D20: a gateway's refund of
 * a renewal credits money; only a cancel ends access).
 */
import { describe, expect, it, vi } from 'vitest';

const { OrderEntityServer } = await import('../OrderEntityServer.js');
const { SanctionMoneyOnlyReversal } = await import('../SubscriptionEntityServer.js');

type Settle = (lines: unknown[], reversals: Map<string, unknown>, options?: unknown) => Promise<void>;

function order(moneyOnly: boolean) {
    const o = Object.create(OrderEntityServer.prototype) as { revokeEntitlementsForReversals: ReturnType<typeof vi.fn>; settleAccessForReversals: Settle };
    o.revokeEntitlementsForReversals = vi.fn().mockResolvedValue(undefined);
    if (moneyOnly) SanctionMoneyOnlyReversal(o as never);
    return o;
}

describe('settleAccessForReversals', () => {
    it('a money-only reversal (a gateway refund credited): no grant is revoked', async () => {
        const o = order(true);
        await o.settleAccessForReversals([], new Map());
        expect(o.revokeEntitlementsForReversals).not.toHaveBeenCalled();
    });
    it('control: any other reversal revokes the returned access, as before', async () => {
        const o = order(false);
        const reversals = new Map([['line', {}]]);
        await o.settleAccessForReversals(['l'], reversals, { x: 1 });
        expect(o.revokeEntitlementsForReversals).toHaveBeenCalledWith(['l'], reversals, { x: 1 });
    });
});
