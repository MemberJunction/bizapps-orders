/**
 * The harness's test seam (#947, Robert's review of #950).
 *
 * Two things only a unit test can pin, because the database-backed checks that rely on them (SR46,
 * SR52, SR53) need a database to run:
 *   - `InRolledBackTransaction` runs the check inside `JoinCallerTransactionForTests`, so isolated
 *     work a check drives joins the check's transaction. Turning the wrap back into `await body()`
 *     leaves every other unit test green; this one fails.
 *   - The seam is reachable only through the package's `./testing` subpath, never its root, and
 *     the `exports` map refuses a deep import of the file that holds it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { RecordWebhookDelivery, type WebhookDeliveryRecord } from '@mj-biz-apps/orders-core-entities-server';
import { InRolledBackTransaction } from '../fixture.js';

const delivery = (eventID: string): WebhookDeliveryRecord => ({ PaymentProviderID: 'p', ProviderEventID: eventID, Outcome: 'Applied' });

/** A provider that records who asked it for an entity object, then refuses (the caller logs it). */
function recordingProvider(name: string, asked: string[]) {
    return {
        name,
        GetEntityObject: vi.fn(async () => {
            asked.push(name);
            throw new Error(`stop: ${name}`);
        }),
    };
}

describe('InRolledBackTransaction (#947)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('runs the check inside the seam: isolated work the check drives joins the check\'s provider', async () => {
        vi.spyOn(OrdersEngine.Instance, 'Config').mockResolvedValue(undefined as never);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const asked: string[] = [];
        const checkProvider = {
            ...recordingProvider('the check\'s transaction', asked),
            BeginTransaction: vi.fn(async () => undefined),
            RollbackTransaction: vi.fn(async () => undefined),
        };
        const isolatedInstance = recordingProvider('an isolated instance', asked);
        const shared = {
            ...recordingProvider('the shared provider', asked),
            CreateIndependentInstance: vi.fn(async () => ({ ...isolatedInstance, ReleaseIndependentInstance: async () => undefined })),
        };
        const ctx = { Provider: checkProvider, User: { ID: 'u' } } as unknown as IntegrationCheckContext;

        await InRolledBackTransaction(ctx, async () => {
            // A production caller of WithIsolatedProvider: the webhook's delivery row (#939/#940).
            await RecordWebhookDelivery(
                delivery('evt_1'),
                null,
                shared as never,
                ctx.User,
            );
        });

        expect(asked).toEqual(['the check\'s transaction']);
        expect(shared.CreateIndependentInstance).not.toHaveBeenCalled();
        expect(checkProvider.BeginTransaction).toHaveBeenCalledTimes(1);
        expect(checkProvider.RollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('outside it, the same call still isolates: the seam ends with the check', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const asked: string[] = [];
        const isolatedInstance = recordingProvider('an isolated instance', asked);
        const shared = {
            ...recordingProvider('the shared provider', asked),
            CreateIndependentInstance: vi.fn(async () => ({ ...isolatedInstance, ReleaseIndependentInstance: async () => undefined })),
        };
        await RecordWebhookDelivery(
            delivery('evt_2'),
            null,
            shared as never,
            { ID: 'u' } as never,
        );
        expect(asked).toEqual(['an isolated instance']);
        expect(shared.CreateIndependentInstance).toHaveBeenCalledTimes(1);
    });
});

describe('the test seam is on ./testing, not the package root (#950 review)', () => {
    it('the root export does not carry it', async () => {
        const root = await import('@mj-biz-apps/orders-core-entities-server');
        expect('JoinCallerTransactionForTests' in root).toBe(false);
    });

    it('./testing does', async () => {
        const testing = await import('@mj-biz-apps/orders-core-entities-server/testing');
        expect(typeof testing.JoinCallerTransactionForTests).toBe('function');
    });

    it('a deep import of the file that holds it is refused by the exports map', async () => {
        const deep = '@mj-biz-apps/orders-core-entities-server/dist/isolatedProvider.js';
        await expect(import(/* @vite-ignore */ deep)).rejects.toThrow();
    });
});
