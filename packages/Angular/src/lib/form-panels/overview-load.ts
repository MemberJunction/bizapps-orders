import { RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * Narrow, read-only RunView used by Overview panels. Never used for mutation.
 */
export async function LoadOverviewRows<T>(
    provider: IMetadataProvider,
    entityName: string,
    extraFilter: string,
    fields: string[],
    maxRows = 8,
): Promise<T[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<T>({
        EntityName: entityName,
        ExtraFilter: extraFilter,
        Fields: fields,
        MaxRows: maxRows,
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
