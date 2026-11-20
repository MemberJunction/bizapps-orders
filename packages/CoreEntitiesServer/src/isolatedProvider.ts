import { AsyncLocalStorage } from 'node:async_hooks';
import { LogError, Metadata, type DatabaseProviderBase, type IMetadataProvider } from '@memberjunction/core';

/** The provider a test seam asked isolated work to join, per async call chain. Empty in production. */
const joinedCaller = new AsyncLocalStorage<IMetadataProvider>();

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
 * Also used for the webhook's delivery row (#939, `PaymentWebhookDeliveryLog.ts`): written on the
 * shared provider, it joined whatever transaction another request had open and could be rolled
 * back with it.
 *
 * `CreateIndependentInstance()` shares the connection pool and the metadata cache; only the
 * transaction state is new, so the cost is a provider object, not a connection or a metadata load.
 * Release never closes the pool, and rolls back anything `work` left open.
 *
 * A provider with no `CreateIndependentInstance` method falls back to the shared one, which is today's
 * behaviour. (A `DatabaseProviderBase` subclass that inherits the base class's throwing stub throws
 * instead; SQL Server and PostgreSQL both implement it.)
 *
 * Inside {@link JoinCallerTransactionForTests} (a test seam) `work` runs on the joined provider instead, and
 * nothing is made or released. Nothing in production enters it.
 */
export async function WithIsolatedProvider<T>(
    work: (provider: IMetadataProvider) => Promise<T>,
    shared: IMetadataProvider | undefined = Metadata.Provider as IMetadataProvider | undefined,
): Promise<T> {
    const joined = joinedCaller.getStore();
    if (joined) {
        return work(joined);
    }
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

/**
 * TEST SEAM (#947). Inside `fn`, {@link WithIsolatedProvider} runs its work on `provider` rather than on
 * a new instance, so the work joins the transaction `provider` holds. Production code never calls it,
 * and the package root does not export it: harnesses import it from
 * `@mj-biz-apps/orders-core-entities-server/testing`.
 *
 * It exists for the integration harness, which wraps each check in a transaction it rolls back
 * (`InRolledBackTransaction`). An isolated instance writes on another pooled connection, outside that
 * transaction, so its first read of a row the check wrote waits on the check's own locks while the
 * check waits for it, until the request timeout ends the read. That is how SR46, SR52 and SR53 failed
 * after #928 moved the checkout capture onto an isolated provider.
 *
 * Scoped to the async call chain that `fn` starts (`AsyncLocalStorage`), not to the module: a request
 * that runs at the same time in the same process, outside `fn`, still gets its own instance. A nested
 * call joins the inner provider until it returns.
 *
 * What it gives up: inside `fn`, the isolated work shares the caller's transaction, so a check run
 * this way proves what the work writes, not that it writes on its own transaction. The isolation keeps
 * its unit tests (`isolatedProvider.test.ts`).
 */
export async function JoinCallerTransactionForTests<T>(provider: IMetadataProvider, fn: () => Promise<T>): Promise<T> {
    return joinedCaller.run(provider, fn);
}
