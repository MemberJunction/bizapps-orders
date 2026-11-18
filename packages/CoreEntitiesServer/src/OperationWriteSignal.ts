/**
 * Per-row in-process signal between an operation and the entity server subclass it writes through (#808).
 *
 * Some transitions on an entity (`OrderHeaderPaymentSchedule.Status = 'Invoiced'`, a newly inserted
 * `OrderLineProgressMeasurement` at `Status = 'Posted'`) are only sound when the operation that
 * writes the companion ledger entry in the same transaction is the one saving the row. A database
 * trigger cannot distinguish the operation's `INSERT`/`UPDATE` from an ordinary caller's, so the
 * operation announces the specific row key immediately before saving and clears it in a `finally`,
 * and the entity server checks the signal during `Save`.
 *
 * Backed by `GetGlobalObjectStore()` rather than a module-scoped `Set` so that if a host resolves
 * two copies of this package, the operation and the entity subclass still share the same registry.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { GetGlobalObjectStore } from '@memberjunction/global';

export interface OperationWriteSignal {
    /** Mark `rowKey` as currently being written by its owning operation. Always pair with {@link End} in a `finally`. */
    Begin(rowKey: string): void;
    /** Clear the mark for `rowKey`. */
    End(rowKey: string): void;
    /** True while `rowKey` is marked as being written by its owning operation. */
    Has(rowKey: string | null | undefined): boolean;
}

function globalStore(): Record<string, unknown> {
    return (GetGlobalObjectStore() ?? globalThis) as unknown as Record<string, unknown>;
}

function setFor(storeKey: string): Set<string> {
    const store = globalStore();
    const existing = store[storeKey];
    if (existing instanceof Set) return existing as Set<string>;
    const created = new Set<string>();
    store[storeKey] = created;
    return created;
}

/**
 * Create a per-row write signal stored on the process-wide global object store under `storeKey`.
 * Row keys are normalized to lower-case so UUID casing differences between callers and SQL Server
 * never miss.
 */
export function CreateOperationWriteSignal(storeKey: string): OperationWriteSignal {
    return {
        Begin(rowKey: string): void {
            setFor(storeKey).add(String(rowKey).toLowerCase());
        },
        End(rowKey: string): void {
            setFor(storeKey).delete(String(rowKey).toLowerCase());
        },
        Has(rowKey: string | null | undefined): boolean {
            if (!rowKey) return false;
            return setFor(storeKey).has(String(rowKey).toLowerCase());
        },
    };
}
