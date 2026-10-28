import { RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';

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
