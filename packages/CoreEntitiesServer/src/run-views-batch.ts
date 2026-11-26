import { RunView, type IRunViewProvider, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';

/**
 * Executes multiple independent `RunViewParams` in a single `rv.RunViews([...])` batch call
 * whenever the provider implements `RunViews` (every production SQL Server, PostgreSQL, and
 * GraphQL provider). Falls back to `Promise.all` only for minimal unit-test doubles that stub
 * `RunView` without `RunViews`.
 */
export async function RunViewsBatch(
    provider: IRunViewProvider,
    params: RunViewParams[],
    user?: UserInfo,
): Promise<RunViewResult[]> {
    const rv = new RunView(provider);
    if (typeof (provider as { RunViews?: unknown })?.RunViews === 'function') {
        return rv.RunViews(params, user);
    }
    return Promise.all(params.map((spec) => rv.RunView(spec, user)));
}
