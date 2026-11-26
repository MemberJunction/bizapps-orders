import { describe, expect, it, vi } from 'vitest';
import type { IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { RunViewsBatch } from '../run-views-batch.js';

function okResult(rows: Record<string, unknown>[]): RunViewResult {
    return {
        Success: true,
        Results: rows,
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 1,
        ErrorMessage: '',
        UserViewObject: null,
    };
}

describe('RunViewsBatch', () => {
    it('batches multiple specs through provider.RunViews in a single call when available', async () => {
        const runView = vi.fn();
        const runViews = vi.fn(async (params: RunViewParams[]) =>
            params.map((p) => okResult([{ Entity: p.EntityName }])),
        );
        const provider = { RunView: runView, RunViews: runViews } as unknown as IRunViewProvider;
        const user = { ID: 'u-1' } as UserInfo;

        const results = await RunViewsBatch(
            provider,
            [
                { EntityName: 'MJ_BizApps_Orders: Order Headers', ResultType: 'simple' },
                { EntityName: 'MJ_BizApps_Orders: Order Lines', ResultType: 'simple' },
            ],
            user,
        );

        expect(runViews).toHaveBeenCalledTimes(1);
        expect(runView).not.toHaveBeenCalled();
        expect(results).toHaveLength(2);
        expect(results[0].Success).toBe(true);
        expect(results[1].Success).toBe(true);
    });

    it('falls back to Promise.all over provider.RunView when a test double omits RunViews', async () => {
        const runView = vi.fn(async (p: RunViewParams) => okResult([{ Entity: p.EntityName }]));
        const provider = { RunView: runView } as unknown as IRunViewProvider;
        const user = { ID: 'u-2' } as UserInfo;

        const results = await RunViewsBatch(
            provider,
            [
                { EntityName: 'MJ_BizApps_Orders: Order Headers', ResultType: 'simple' },
                { EntityName: 'MJ_BizApps_Orders: Order Lines', ResultType: 'simple' },
            ],
            user,
        );

        expect(runView).toHaveBeenCalledTimes(2);
        expect(results).toHaveLength(2);
        expect(results[0].Success).toBe(true);
        expect(results[1].Success).toBe(true);
    });
});
