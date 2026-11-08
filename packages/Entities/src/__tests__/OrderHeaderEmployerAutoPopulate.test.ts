import { describe, it, expect, vi } from 'vitest';
import type { IRunViewProvider } from '@memberjunction/core';
import { ResolveSingularActiveEmployerOrganization } from '../PartyAffiliationBehavior';

describe('ResolveSingularActiveEmployerOrganization', () => {
    // A real UUID: `FromPersonID` now goes through `RequireUUID`, and a fake id would be refused.
    const PERSON_ID = '22222222-2222-4222-8222-222222222222';

    function createMockProvider(results: Array<{ ToOrganizationID: string; StartDate?: string | null; EndDate?: string | null }> = []) {
        return {
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: results,
                RowCount: results.length,
                TotalRowCount: results.length,
            }),
        } as unknown as IRunViewProvider;
    }

    it('resolves organization ID when person has exactly one active employer', async () => {
        const mockProvider = createMockProvider([{ ToOrganizationID: 'org-abc-123' }]);
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, PERSON_ID);

        expect(orgId).toBe('org-abc-123');
        expect(mockProvider.RunView).toHaveBeenCalledTimes(1);
    });

    it('picks the longest-lasting employer when several are active', async () => {
        const mockProvider = createMockProvider([
            { ToOrganizationID: 'org-short', StartDate: '2026-01-01', EndDate: null },
            { ToOrganizationID: 'org-long', StartDate: '2018-01-01', EndDate: null },
        ]);
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, PERSON_ID);

        expect(orgId).toBe('org-long');
    });

    it('returns null if person has zero active employers', async () => {
        const mockProvider = createMockProvider([]);
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, PERSON_ID);

        expect(orgId).toBeNull();
    });

    it('returns null if provider or personID is empty', async () => {
        const mockProvider = createMockProvider([{ ToOrganizationID: 'org-1' }]);
        expect(await ResolveSingularActiveEmployerOrganization(mockProvider, '')).toBeNull();
        expect(await ResolveSingularActiveEmployerOrganization(null as unknown as IRunViewProvider, PERSON_ID)).toBeNull();
    });

    it('returns null (and never queries) when personID is not a UUID', async () => {
        const mockProvider = createMockProvider([{ ToOrganizationID: 'org-1' }]);
        expect(await ResolveSingularActiveEmployerOrganization(mockProvider, "x' OR '1'='1")).toBeNull();
        expect(mockProvider.RunView).not.toHaveBeenCalled();
    });
});
