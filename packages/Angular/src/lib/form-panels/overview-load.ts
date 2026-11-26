import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';

/**
 * A single typed read inside a {@link LoadOverviewBatch} `RunViews` batch.
 */
export interface OverviewBatchSpec<T> {
    readonly Params: RunViewParams;
    readonly Extract: (result: RunViewResult | undefined) => T;
}

/**
 * Narrow, read-only spec for {@link LoadOverviewBatch}. Never used for mutation.
 */
export function OverviewRowsSpec<T>(
    entityName: string,
    extraFilter: string,
    fields: string[],
    maxRows = 8,
    orderBy?: string,
): OverviewBatchSpec<T[]> {
    return {
        Params: {
            EntityName: entityName,
            ExtraFilter: extraFilter,
            Fields: fields,
            MaxRows: maxRows,
            OrderBy: orderBy,
            ResultType: 'simple',
        },
        Extract: (result) => (result?.Success ? ((result.Results as T[] | undefined) ?? []) : []),
    };
}

/** Count-only spec for {@link LoadOverviewBatch}. */
export function OverviewCountSpec(
    entityName: string,
    extraFilter: string,
): OverviewBatchSpec<number> {
    return {
        Params: {
            EntityName: entityName,
            ExtraFilter: extraFilter,
            ResultType: 'count_only',
        },
        Extract: (result) => (result?.Success ? (result.TotalRowCount ?? 0) : 0),
    };
}

/** Allowed output value types for {@link LoadOverviewBatch} specs. */
type OverviewBatchValue = object[] | number;

/**
 * Executes multiple independent overview reads in a single `rv.RunViews([...])` GraphQL request.
 */
export async function LoadOverviewBatch<A extends OverviewBatchValue, B extends OverviewBatchValue>(
    provider: IMetadataProvider,
    specs: readonly [OverviewBatchSpec<A>, OverviewBatchSpec<B>],
): Promise<[A, B]>;
export async function LoadOverviewBatch<
    A extends OverviewBatchValue,
    B extends OverviewBatchValue,
    C extends OverviewBatchValue,
>(
    provider: IMetadataProvider,
    specs: readonly [OverviewBatchSpec<A>, OverviewBatchSpec<B>, OverviewBatchSpec<C>],
): Promise<[A, B, C]>;
export async function LoadOverviewBatch<
    A extends OverviewBatchValue,
    B extends OverviewBatchValue,
    C extends OverviewBatchValue,
    D extends OverviewBatchValue,
>(
    provider: IMetadataProvider,
    specs: readonly [OverviewBatchSpec<A>, OverviewBatchSpec<B>, OverviewBatchSpec<C>, OverviewBatchSpec<D>],
): Promise<[A, B, C, D]>;
export async function LoadOverviewBatch(
    provider: IMetadataProvider,
    specs: readonly OverviewBatchSpec<OverviewBatchValue>[],
): Promise<OverviewBatchValue[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const results = await rv.RunViews(specs.map((s) => s.Params));
    return specs.map((spec, idx) => spec.Extract(results[idx]));
}

/**
 * Narrow, read-only RunView used by Overview panels. Never used for mutation.
 *
 * `orderBy` decides WHICH rows the `maxRows` cap keeps, not only how they are shown: without it the
 * database returns any `maxRows` rows in no set order (bizapps-orders#738). A list that reads in time
 * order passes one.
 */
export async function LoadOverviewRows<T>(
    provider: IMetadataProvider,
    entityName: string,
    extraFilter: string,
    fields: string[],
    maxRows = 8,
    orderBy?: string,
): Promise<T[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<T>({
        EntityName: entityName,
        ExtraFilter: extraFilter,
        Fields: fields,
        MaxRows: maxRows,
        OrderBy: orderBy,
        ResultType: 'simple',
    });
    if (!result.Success) {
        return [];
    }
    return result.Results ?? [];
}

export async function CountOverviewRows(
    provider: IMetadataProvider,
    entityName: string,
    extraFilter: string,
): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView({
        EntityName: entityName,
        ExtraFilter: extraFilter,
        ResultType: 'count_only',
    });
    if (!result.Success) {
        return 0;
    }
    return result.TotalRowCount ?? 0;
}
