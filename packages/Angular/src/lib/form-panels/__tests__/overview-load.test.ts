import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import { LoadOverviewRows } from '../overview-load';

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
