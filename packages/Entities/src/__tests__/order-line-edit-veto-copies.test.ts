/**
 * The order-line edit veto survives this package being loaded twice.
 *
 * A host that resolves two copies of `orders-entities` — two consumers disagreeing on a version, npm
 * nesting one under the other — runs this module twice. With a module-scoped registry, Sales would
 * register into one copy and the order-line save path would read the other, find nothing, and allow
 * every edit the deal lock exists to refuse (bc-aidp-next-golive#258).
 *
 * The two copies are real separate module instances: a distinct query string gives each import its
 * own module record, so each has its own top-level scope — exactly what a nested second copy has.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { OrderLineEditVeto } from '../order-line-edit-veto';

type VetoModule = typeof import('../order-line-edit-veto');

// Literal specifiers, so the bundler can see each import statically.
const loadPair = async (): Promise<VetoModule[]> => [
    (await import('../order-line-edit-veto.ts?copy=first')) as VetoModule,
    (await import('../order-line-edit-veto.ts?copy=second')) as VetoModule,
];

const veto: OrderLineEditVeto = { MayEdit: async () => 'frozen' };

let copies: VetoModule[] = [];

afterEach(() => {
    for (const copy of copies) copy.RegisterOrderLineEditVeto(null);
    copies = [];
});

describe('two copies of the package', () => {
    it('are genuinely separate module instances', async () => {
        // Without this the test below would pass vacuously on one shared instance.
        copies = await loadPair();
        expect(copies[0].RegisterOrderLineEditVeto).not.toBe(copies[1].RegisterOrderLineEditVeto);
    });

    it('share one registry: registered through one, read through the other', async () => {
        copies = await loadPair();
        const [registering, reading] = copies;
        registering.RegisterOrderLineEditVeto(veto);
        expect(reading.HostOrderLineEditVeto()).toBe(veto);
    });

    it('share one registry when clearing, too', async () => {
        copies = await loadPair();
        const [registering, clearing] = copies;
        registering.RegisterOrderLineEditVeto(veto);
        clearing.RegisterOrderLineEditVeto(null);
        expect(registering.HostOrderLineEditVeto()).toBeNull();
    });
});
