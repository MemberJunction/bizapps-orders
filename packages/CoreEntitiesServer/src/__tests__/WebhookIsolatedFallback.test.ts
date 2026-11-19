/**
 * The webhook's isolated-provider fallback (#944): the shared provider is used only when an isolated
 * instance cannot be made, and a failure inside the work is never retried there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';

const isolation = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'cannot-create' }));
vi.mock('../isolatedProvider.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../isolatedProvider.js')>()),
    WithIsolatedProvider: async <T>(work: (p: IMetadataProvider) => Promise<T>) => {
        if (isolation.mode === 'cannot-create') throw new Error('no independent instance');
        return work({ Name: 'isolated' } as unknown as IMetadataProvider);
    },
}));

const { withIsolatedOrSharedProvider } = await import('../PaymentWebhookHandler.js');
const shared = { Name: 'shared' } as unknown as IMetadataProvider;

afterEach(() => {
    isolation.mode = 'ok';
});

describe('withIsolatedOrSharedProvider', () => {
    it('runs the work on the isolated provider when one can be made', async () => {
        const seen: unknown[] = [];
        await withIsolatedOrSharedProvider(async (p) => void seen.push((p as unknown as { Name: string }).Name), shared);
        expect(seen).toEqual(['isolated']);
    });

    it('falls back to the shared provider only when no isolated instance can be made', async () => {
        isolation.mode = 'cannot-create';
        const seen: unknown[] = [];
        await withIsolatedOrSharedProvider(async (p) => void seen.push((p as unknown as { Name: string }).Name), shared);
        expect(seen).toEqual(['shared']);
    });

    it('rethrows a failure from inside the work and does not run it again', async () => {
        const work = vi.fn(async () => {
            throw new Error('settlement failed');
        });
        await expect(withIsolatedOrSharedProvider(work, shared)).rejects.toThrow('settlement failed');
        expect(work).toHaveBeenCalledTimes(1);
    });
});
