/**
 * Find-or-save a record through BaseEntity. Lookups are RunView, never raw SQL.
 */
import { BaseEntity, CompositeKey, Metadata, RunView, type IRunViewProvider } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

export async function FindId(
    ctx: IntegrationCheckContext,
    entityName: string,
    extraFilter: string,
): Promise<string | null> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: entityName,
            ExtraFilter: extraFilter,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`RunView ${entityName} failed: ${res.ErrorMessage ?? 'unknown error'}`);
    }
    return res.Results?.[0]?.ID ?? null;
}

export async function FindRows<T extends { ID: string }>(
    ctx: IntegrationCheckContext,
    entityName: string,
    extraFilter: string,
    fields: string[],
): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>(
        {
            EntityName: entityName,
            ExtraFilter: extraFilter,
            Fields: fields,
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`RunView ${entityName} failed: ${res.ErrorMessage ?? 'unknown error'}`);
    }
    return res.Results ?? [];
}

/**
 * Create or update one row. `keyFilter` finds the existing record (natural key).
 * Fields are applied with `.Set` because the entity name is chosen at runtime.
 */
export async function Upsert(
    ctx: IntegrationCheckContext,
    entityName: string,
    keyFilter: string,
    fields: Record<string, unknown>,
): Promise<string> {
    const md = new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(entityName, ctx.User);
    const existing = await FindId(ctx, entityName, keyFilter);
    if (existing) {
        const key = new CompositeKey();
        key.KeyValuePairs.push({ FieldName: 'ID', Value: existing });
        const loaded = await entity.InnerLoad(key);
        if (!loaded) {
            throw new Error(`Could not load existing ${entityName} ${existing}`);
        }
    } else {
        entity.NewRecord();
    }
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) entity.Set(key, value);
    }
    if (!(await entity.Save())) {
        const result = entity.LatestResult;
        const detail =
            (result?.Errors ?? [])
                .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
                .join('; ') || result?.CompleteMessage || 'no reason given';
        throw new Error(`Could not save '${entityName}' (${keyFilter}): ${detail}`);
    }
    const id = entity.Get('ID');
    if (typeof id !== 'string' || !id) {
        throw new Error(`Saved '${entityName}' but ID is missing`);
    }
    return id;
}

export function Quote(value: string): string {
    return value.replace(/'/g, "''");
}
