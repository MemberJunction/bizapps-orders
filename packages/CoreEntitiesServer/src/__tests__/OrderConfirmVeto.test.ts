import { describe, expect, it, afterEach } from 'vitest';
import {
    HostOrderConfirmVeto,
    RegisterOrderConfirmVeto,
    ResolveOrderConfirmRefusal,
    type OrderConfirmContext,
    type OrderConfirmVeto,
} from '@mj-biz-apps/orders-entities';

/**
 * THE SEAM FOR REFUSING A CONFIRM FROM ANOTHER APP (bc-aidp-next-golive#323).
 *
 * Confirming is where an order stops being a proposal: journal entries are written, a subscription
 * may be created, recognition follows. Orders enforces its own rules; it cannot know that Sales has
 * reopened the deal this order came from.
 *
 * The reported case: a deal closed Won minted ORD-002313, the deal was reopened to Open, and twenty
 * seconds later the order was confirmed and booked — leaving an Open deal at 75% on a booked order.
 * Sales already refuses the reverse; nothing checked this direction.
 *
 * What is pinned here is the CONTRACT, not any particular vetoer: Sales' implementation lives in
 * Sales and can only be written once this ships, because Sales resolves this package from the
 * registry. Until then `HostOrderConfirmVeto()` is null on every host and nothing changes.
 */

const CTX: OrderConfirmContext = {
    OrderHeaderID: 'oooooooo-0000-4000-8000-000000000001',
    FromStatus: 'Quoted',
    ContextUser: null,
};

/** A vetoer that answers as told and remembers what it was asked. */
function vetoAnswering(answer: string | null) {
    const seen: OrderConfirmContext[] = [];
    const veto: OrderConfirmVeto = {
        MayConfirm: async (context) => {
            seen.push(context);
            return answer;
        },
    };
    return { veto, seen };
}

afterEach(() => RegisterOrderConfirmVeto(null));

describe('the registry', () => {
    it('holds nothing until something registers', () => {
        expect(HostOrderConfirmVeto()).toBeNull();
    });

    it('returns what was registered', () => {
        const { veto } = vetoAnswering(null);
        RegisterOrderConfirmVeto(veto);
        expect(HostOrderConfirmVeto()).toBe(veto);
    });

    /** Clearing matters: a veto left registered leaks into every later test in the process. */
    it('can be cleared', () => {
        RegisterOrderConfirmVeto(vetoAnswering(null).veto);
        RegisterOrderConfirmVeto(null);
        expect(HostOrderConfirmVeto()).toBeNull();
    });
});

describe('asking the veto', () => {
    /** A host with no vetoer must behave exactly as it did before this seam existed. */
    it('allows when nothing is registered', async () => {
        expect(await ResolveOrderConfirmRefusal(null, CTX, 'x')).toBeNull();
    });

    it('allows when the vetoer says nothing', async () => {
        expect(await ResolveOrderConfirmRefusal(vetoAnswering(null).veto, CTX, 'x')).toBeNull();
    });

    it('refuses with the vetoer\'s own words', async () => {
        const refusal = await ResolveOrderConfirmRefusal(
            vetoAnswering('Deal DEAL-002148 is Open. Close it Won before confirming this order.').veto,
            CTX,
            'x',
        );
        expect(refusal).toContain('Close it Won before confirming');
    });

    it('tells the vetoer which order, and the status it is leaving', async () => {
        const { veto, seen } = vetoAnswering(null);
        await ResolveOrderConfirmRefusal(veto, CTX, 'x');
        expect(seen[0].OrderHeaderID).toBe(CTX.OrderHeaderID);
        expect(seen[0].FromStatus, 'where the order IS, not where the save wants it').toBe('Quoted');
    });
});

/**
 * FAILING CLOSED IS THE WHOLE POINT.
 *
 * A vetoer that throws has not said yes. Booking on the strength of "could not tell" reaches the
 * exact outcome this seam exists to prevent, by a different route — so a thrown error refuses, and
 * says what failed so it is fixed rather than worked around.
 */
describe('a vetoer that fails', () => {
    const exploding: OrderConfirmVeto = {
        MayConfirm: async () => {
            throw new Error('the deal could not be read');
        },
    };

    it('refuses rather than allowing', async () => {
        const refusal = await ResolveOrderConfirmRefusal(exploding, CTX, 'Order ORD-1 was not confirmed.');
        expect(refusal).not.toBeNull();
    });

    it('says what did not happen, and why it could not be decided', async () => {
        const refusal = (await ResolveOrderConfirmRefusal(exploding, CTX, 'Order ORD-1 was not confirmed.')) ?? '';
        expect(refusal).toContain('Order ORD-1 was not confirmed.');
        expect(refusal).toContain('the deal could not be read');
    });

    /** A vetoer may throw something that is not an Error; the message must still be readable. */
    it('survives a thrown non-Error', async () => {
        const bare: OrderConfirmVeto = {
            MayConfirm: async () => {
                throw 'a bare string';
            },
        };
        expect(await ResolveOrderConfirmRefusal(bare, CTX, 'x')).toContain('a bare string');
    });
});
