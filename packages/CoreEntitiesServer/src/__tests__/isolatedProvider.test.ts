import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { WithIsolatedProvider } from '../isolatedProvider.js';

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
