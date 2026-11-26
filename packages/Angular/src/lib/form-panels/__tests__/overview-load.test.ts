import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { LoadOverviewBatch, LoadOverviewRows, OverviewCountSpec, OverviewRowsSpec } from '../overview-load';

/** Capture the view parameters the loader sends, answering with no rows. */
function captureRunView(): RunViewParams[] {
    const sent: RunViewParams[] = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: async (params: RunViewParams) => {
            sent.push(params);
            return { Success: true, Results: [] };
        },
    } as unknown as RunView);
    return sent;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LoadOverviewRows', () => {
    it('sends the order it is given, so the row cap keeps the rows that order puts first (#738)', async () => {
        const sent = captureRunView();
        await LoadOverviewRows({} as IMetadataProvider, 'Things', "ParentID='x'", ['A'], 8, 'OccurredAt DESC');

        expect(sent[0]).toMatchObject({ EntityName: 'Things', ExtraFilter: "ParentID='x'", Fields: ['A'], MaxRows: 8, OrderBy: 'OccurredAt DESC' });
    });

    it('sends no order when none is given', async () => {
        const sent = captureRunView();
        await LoadOverviewRows({} as IMetadataProvider, 'Things', "ParentID='x'", ['A']);

        expect(sent[0].OrderBy).toBeUndefined();
        expect(sent[0].MaxRows).toBe(8);
    });
});

describe('LoadOverviewBatch', () => {
    it('collapses row and count specs into a single provider.RunViews call', async () => {
        const runViews = vi.fn(async (params: RunViewParams[]): Promise<RunViewResult[]> =>
            params.map((spec) =>
                spec.ResultType === 'count_only'
                    ? {
                          Success: true,
                          Results: [],
                          RowCount: 0,
                          TotalRowCount: 42,
                          ExecutionTime: 1,
                          ErrorMessage: '',
                          UserViewObject: null,
                      }
                    : {
                          Success: true,
                          Results: [{ Name: spec.EntityName }],
                          RowCount: 1,
                          TotalRowCount: 1,
                          ExecutionTime: 1,
                          ErrorMessage: '',
                          UserViewObject: null,
                      },
            ),
        );
        const provider = { RunViews: runViews } as unknown as IMetadataProvider;

        const [rows, count] = await LoadOverviewBatch(provider, [
            OverviewRowsSpec<{ Name: string }>('MJ_BizApps_Orders: Products', `Status='Active'`, ['Name'], 8, 'Name ASC'),
            OverviewCountSpec('MJ_BizApps_Orders: Order Lines', `ProductID='1'`),
        ]);

        expect(runViews).toHaveBeenCalledTimes(1);
        expect(runViews.mock.calls[0][0]).toHaveLength(2);
        expect(rows).toEqual([{ Name: 'MJ_BizApps_Orders: Products' }]);
        expect(count).toBe(42);
    });

    it('returns empty arrays and zero counts when individual batch results fail', async () => {
        const runViews = vi.fn(async (params: RunViewParams[]): Promise<RunViewResult[]> =>
            params.map(() => ({
                Success: false,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: 'denied',
                UserViewObject: null,
            })),
        );
        const provider = { RunViews: runViews } as unknown as IMetadataProvider;

        const [rows, count] = await LoadOverviewBatch(provider, [
            OverviewRowsSpec<{ Name: string }>('MJ_BizApps_Orders: Products', '', ['Name']),
            OverviewCountSpec('MJ_BizApps_Orders: Order Lines', ''),
        ]);

        expect(rows).toEqual([]);
        expect(count).toBe(0);
    });
});
