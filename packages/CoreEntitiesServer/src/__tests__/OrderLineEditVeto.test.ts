/**
 * The order-line edit veto — the seam another app freezes a line through.
 *
 * WHAT IT IS FOR (bc-aidp-next-golive#206 item 1). Sales closes a deal; the deal locks because a
 * contract was derived from its terms. The order's lines are what that contract was derived from, so
 * editing one after the close falsifies the same provenance. A tester added a line to a Won deal
 * through the "What's being sold" grid and it saved, because the deal's lock only runs when the DEAL
 * is saved.
 *
 * Orders cannot answer that question itself: it does not depend on Sales, and Sales depends on IT.
 * So it asks, and Sales answers.
 *
 * The registry is exercised directly here rather than through a saved entity, because what is worth
 * pinning is the DECISION — allow, refuse, and the awkward third case where the vetoer itself fails.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    HostOrderLineEditVeto,
    RegisterOrderLineEditVeto,
    ResolveOrderLineEditRefusal,
    type OrderLineEditContext,
    type OrderLineEditVeto,
} from '@mj-biz-apps/orders-entities';

const ORDER = 'a1b2c3d4-0000-4000-8000-000000000001';
const LINE = 'a1b2c3d4-0000-4000-8000-000000000002';

/** Records what it was asked, so the test can check the question as well as the answer. */
function recordingVeto(answer: string | null) {
    const seen: OrderLineEditContext[] = [];
    const veto: OrderLineEditVeto = {
        MayEdit: async (ctx) => {
            seen.push(ctx);
            return answer;
        },
    };
    return { veto, seen };
}

afterEach(() => RegisterOrderLineEditVeto(null));

describe('the registry', () => {
    it('is empty on a host where nothing freezes lines from outside Orders', () => {
        expect(HostOrderLineEditVeto()).toBeNull();
    });

    it('holds what was registered', () => {
        const { veto } = recordingVeto(null);
        RegisterOrderLineEditVeto(veto);
        expect(HostOrderLineEditVeto()).toBe(veto);
    });

    it('is last-call-wins rather than accumulating', () => {
        // A host that boots twice in one process must not end up with two vetoes and no way to say
        // which applies.
        const first = recordingVeto(null).veto;
        const second = recordingVeto('no').veto;
        RegisterOrderLineEditVeto(first);
        RegisterOrderLineEditVeto(second);
        expect(HostOrderLineEditVeto()).toBe(second);
    });

    it('can be cleared', () => {
        RegisterOrderLineEditVeto(recordingVeto(null).veto);
        RegisterOrderLineEditVeto(null);
        expect(HostOrderLineEditVeto()).toBeNull();
    });
});

describe('what a vetoer is told', () => {
    it('distinguishes the three kinds, because a vetoer may allow some and refuse others', async () => {
        const { veto, seen } = recordingVeto(null);
        RegisterOrderLineEditVeto(veto);

        await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: null, Kind: 'create' });
        await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: LINE, Kind: 'update' });
        await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: LINE, Kind: 'delete' });

        expect(seen.map((s) => s.Kind)).toEqual(['create', 'update', 'delete']);
    });

    it('carries no line id on a create, because there is none yet', async () => {
        const { veto, seen } = recordingVeto(null);
        RegisterOrderLineEditVeto(veto);
        await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: null, Kind: 'create' });
        expect(seen[0].OrderLineID).toBeNull();
        expect(seen[0].OrderHeaderID, 'the parent is always known').toBe(ORDER);
    });
});

describe('the answer', () => {
    it('allows when the vetoer returns null', async () => {
        const { veto } = recordingVeto(null);
        expect(await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: LINE, Kind: 'update' })).toBeNull();
    });

    it('refuses with the vetoer own words, so the message names the app that froze it', async () => {
        const { veto } = recordingVeto('This deal is closed. Set the status back to Open first.');
        const refusal = await veto.MayEdit({ OrderHeaderID: ORDER, OrderLineID: LINE, Kind: 'update' });
        // A bare "not permitted" would send someone hunting through Orders for a rule that lives in
        // Sales, which is the whole reason the refusal is the vetoer's string and not a constant here.
        expect(refusal).toMatch(/deal is closed/i);
    });
});

describe('resolving the answer, which both the save and delete paths share', () => {
    const ctx: OrderLineEditContext = { OrderHeaderID: ORDER, OrderLineID: LINE, Kind: 'update' };

    it('allows when no veto is registered at all', async () => {
        // The ordinary case for every host that does not run Sales. It must cost nothing and refuse
        // nothing.
        expect(await ResolveOrderLineEditRefusal(null, ctx, 'x')).toBeNull();
    });

    it('allows when the veto says so', async () => {
        expect(await ResolveOrderLineEditRefusal(recordingVeto(null).veto, ctx, 'x')).toBeNull();
    });

    it('passes the refusal through unchanged', async () => {
        const refusal = await ResolveOrderLineEditRefusal(recordingVeto('This deal is closed.').veto, ctx, 'x');
        expect(refusal).toBe('This deal is closed.');
    });

    /**
     * THE CASE THAT IS EASY TO GET BACKWARDS. A vetoer that cannot reach what it needs has not said
     * yes. Returning null here would let a frozen line change because the thing guarding it was
     * briefly unreachable, and the run would look entirely normal.
     */
    it('REFUSES when the vetoer throws, rather than allowing', async () => {
        const exploding: OrderLineEditVeto = {
            MayEdit: async () => {
                throw new Error('deal lookup failed');
            },
        };
        const refusal = await ResolveOrderLineEditRefusal(exploding, ctx, 'The edit was not applied.');
        expect(refusal, 'a thrown veto must not read as permission').not.toBeNull();
        expect(refusal).toContain('deal lookup failed');
        expect(refusal, 'and it must say what did not happen').toContain('The edit was not applied.');
    });

    it('says what did not happen, in the caller words', async () => {
        // "Nothing was deleted" reads differently from "the edit was not applied", and the caller is
        // the only one that knows which it was.
        const exploding: OrderLineEditVeto = {
            MayEdit: async () => {
                throw new Error('boom');
            },
        };
        expect(await ResolveOrderLineEditRefusal(exploding, ctx, 'Nothing was deleted.')).toContain(
            'Nothing was deleted.',
        );
    });

    it('handles a non-Error throw without printing [object Object]', async () => {
        const exploding: OrderLineEditVeto = {
            MayEdit: async () => {
                throw 'a bare string';
            },
        };
        expect(await ResolveOrderLineEditRefusal(exploding, ctx, 'x')).toContain('a bare string');
    });
});
