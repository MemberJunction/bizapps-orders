import { LogError, Metadata, type DatabaseProviderBase, type IMetadataProvider } from '@memberjunction/core';

/**
 * Runs `work` on a provider with its OWN transaction stack, then releases it (#927).
 *
 * A provider's transaction is per instance, and `Metadata.Provider` is shared by every request,
 * webhook and scheduled job in the process. Two callers that both `BeginTransaction()` on it do not
 * get two transactions: the second becomes a savepoint inside the first's physical transaction, and
 * a rollback on either side can undo the other's writes. That is how a checkout's page capture and
 * its `payment_intent.succeeded` webhook, arriving in the same second, each lost PAY-000058 and
 * left a charged buyer with no payment and no access. MJ fixed the same hazard in its own code
 * (MJ #5059, `CreateIsolatedProvider`).
 *
 * `CreateIndependentInstance()` shares the connection pool and the metadata cache; only the
 * transaction state is new, so the cost is a provider object, not a connection or a metadata load.
 * Release never closes the pool, and rolls back anything `work` left open.
 *
 * A provider that cannot make an independent instance (a non-database provider, or a test double)
 * falls back to the shared one, which is today's behaviour.
 */
export async function WithIsolatedProvider<T>(
    work: (provider: IMetadataProvider) => Promise<T>,
    shared: IMetadataProvider | undefined = Metadata.Provider as IMetadataProvider | undefined,
): Promise<T> {
    const db = shared as unknown as Partial<DatabaseProviderBase> | undefined;
    if (!db || typeof db.CreateIndependentInstance !== 'function') {
        return work(shared as IMetadataProvider);
    }
    const isolated = await db.CreateIndependentInstance();
    try {
        return await work(isolated as unknown as IMetadataProvider);
    } finally {
        try {
            await isolated.ReleaseIndependentInstance();
        } catch (e) {
            LogError(`WithIsolatedProvider: releasing the isolated provider failed: ${e}`);
        }
    }
}
