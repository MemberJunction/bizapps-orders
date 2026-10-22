import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { JoinCallerTransaction, WithIsolatedProvider } from '../isolatedProvider.js';

/** A shared provider whose independent instances record what happened to them. */
function sharedProvider() {
    const made: Array<{ id: number; released: boolean; ReleaseIndependentInstance: () => Promise<void> }> = [];
    const shared = {
        CreateIndependentInstance: vi.fn(async () => {
            const inst = {
                id: made.length + 1,
                released: false,
                ReleaseIndependentInstance: async () => {
                    inst.released = true;
                },
            };
            made.push(inst);
            return inst;
        }),
    };
    return { shared: shared as unknown as IMetadataProvider, made };
}

describe('WithIsolatedProvider (#927)', () => {
    it('runs the work on a new instance, not the shared provider, and releases it', async () => {
        const { shared, made } = sharedProvider();
        let seen: unknown;
        const out = await WithIsolatedProvider(async (p) => {
            seen = p;
            expect(made[0].released).toBe(false); // still held while the work runs
            return 'booked';
        }, shared);

        expect(out).toBe('booked');
        expect(seen).toBe(made[0]);
        expect(seen).not.toBe(shared);
        expect(made[0].released).toBe(true);
    });

    it('releases the instance when the work throws, and rethrows', async () => {
        const { shared, made } = sharedProvider();
        await expect(
            WithIsolatedProvider(async () => {
                throw new Error('capture blew up');
            }, shared),
        ).rejects.toThrow('capture blew up');
        expect(made[0].released).toBe(true);
    });

    it('gives two concurrent callers two different instances: the page and the webhook no longer share a transaction', async () => {
        const { shared, made } = sharedProvider();
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const seen: unknown[] = [];
        const page = WithIsolatedProvider(async (p) => {
            seen.push(p);
            await gate; // the page is mid-capture when the webhook arrives
            return 'page';
        }, shared);
        const webhook = WithIsolatedProvider(async (p) => {
            seen.push(p);
            return 'webhook';
        }, shared);
        await webhook;
        release();
        expect(await page).toBe('page');

        expect(made).toHaveLength(2);
        expect(seen[0]).not.toBe(seen[1]);
        expect(made.every((m) => m.released)).toBe(true);
    });

    it('falls back to the shared provider when it cannot make an independent instance', async () => {
        const shared = { PlatformKey: 'sqlserver' } as unknown as IMetadataProvider;
        const seen = await WithIsolatedProvider(async (p) => p, shared);
        expect(seen).toBe(shared);
    });

    it('does not turn a booked capture into a failure when the release itself fails', async () => {
        const shared = {
            CreateIndependentInstance: async () => ({
                ReleaseIndependentInstance: async () => {
                    throw new Error('release failed');
                },
            }),
        } as unknown as IMetadataProvider;
        await expect(WithIsolatedProvider(async () => 'booked', shared)).resolves.toBe('booked');
    });
});

describe('JoinCallerTransaction (#947): a harness that holds a transaction lets isolated work join it', () => {
    const callerProvider = (name: string) => ({ name }) as unknown as IMetadataProvider;

    it('runs the work on the caller\'s provider: no independent instance is made, so none is released', async () => {
        const { shared, made } = sharedProvider();
        const caller = callerProvider('the check\'s transaction');
        let seen: unknown;
        const out = await JoinCallerTransaction(caller, () =>
            WithIsolatedProvider(async (p) => {
                seen = p;
                return 'booked';
            }, shared),
        );

        expect(out).toBe('booked');
        expect(seen).toBe(caller);
        expect((shared as unknown as { CreateIndependentInstance: ReturnType<typeof vi.fn> }).CreateIndependentInstance).not.toHaveBeenCalled();
        expect(made).toHaveLength(0);
    });

    it('joins the caller\'s provider even when the call site passes its own shared provider (the delivery row, #940)', async () => {
        const { shared, made } = sharedProvider();
        const caller = callerProvider('the check\'s transaction');
        const seen = await JoinCallerTransaction(caller, () => WithIsolatedProvider(async (p) => p, shared));
        expect(seen).toBe(caller);
        expect(made).toHaveLength(0);
    });

    it('returns the result of fn, and once fn is done WithIsolatedProvider isolates again', async () => {
        const { shared, made } = sharedProvider();
        const caller = callerProvider('the check\'s transaction');
        await expect(JoinCallerTransaction(caller, async () => 'checked')).resolves.toBe('checked');

        const seen = await WithIsolatedProvider(async (p) => p, shared);
        expect(seen).toBe(made[0]);
        expect(made[0].released).toBe(true);
    });

    it('rethrows when fn throws, and WithIsolatedProvider isolates again afterwards', async () => {
        const { shared, made } = sharedProvider();
        const caller = callerProvider('the check\'s transaction');
        await expect(
            JoinCallerTransaction(caller, async () => {
                throw new Error('the check failed');
            }),
        ).rejects.toThrow('the check failed');

        const seen = await WithIsolatedProvider(async (p) => p, shared);
        expect(seen).toBe(made[0]);
        expect(made[0].released).toBe(true);
    });

    it('a nested join uses the inner provider, and the outer one again once the inner returns', async () => {
        const { shared } = sharedProvider();
        const outer = callerProvider('outer');
        const inner = callerProvider('inner');
        const seen: unknown[] = [];
        await JoinCallerTransaction(outer, async () => {
            seen.push(await WithIsolatedProvider(async (p) => p, shared));
            await JoinCallerTransaction(inner, async () => {
                seen.push(await WithIsolatedProvider(async (p) => p, shared));
            });
            seen.push(await WithIsolatedProvider(async (p) => p, shared));
        });
        expect(seen).toEqual([outer, inner, outer]);
    });

    it('does not leak into a concurrent caller outside it: a request running at the same time still gets its own instance', async () => {
        const { shared, made } = sharedProvider();
        const caller = callerProvider('the check\'s transaction');
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let insideSeen: unknown;

        // The joined call chain is suspended mid-work while another chain, never joined, runs.
        const inside = JoinCallerTransaction(caller, async () => {
            await gate;
            insideSeen = await WithIsolatedProvider(async (p) => p, shared);
        });
        const outsideSeen = await WithIsolatedProvider(async (p) => p, shared);
        release();
        await inside;

        expect(outsideSeen).toBe(made[0]);
        expect(made[0].released).toBe(true);
        expect(insideSeen).toBe(caller);
        expect(made).toHaveLength(1);
    });

    it('keeps two concurrent joins apart: each chain sees its own caller\'s provider', async () => {
        const { shared, made } = sharedProvider();
        const a = callerProvider('a');
        const b = callerProvider('b');
        let releaseA!: () => void;
        let releaseB!: () => void;
        const gateA = new Promise<void>((r) => (releaseA = r));
        const gateB = new Promise<void>((r) => (releaseB = r));

        // Both chains are suspended at once, and the one that joined FIRST resumes first.
        const first = JoinCallerTransaction(a, async () => {
            await gateA;
            return WithIsolatedProvider(async (p) => p, shared);
        });
        const second = JoinCallerTransaction(b, async () => {
            await gateB;
            return WithIsolatedProvider(async (p) => p, shared);
        });
        releaseA();
        expect(await first).toBe(a);
        releaseB();
        expect(await second).toBe(b);
        expect(made).toHaveLength(0);
    });
});
