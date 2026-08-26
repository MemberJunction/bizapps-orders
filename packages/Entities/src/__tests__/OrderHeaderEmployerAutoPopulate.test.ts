import { describe, it, expect, vi } from 'vitest';
import type { IRunViewProvider } from '@memberjunction/core';
import { ResolveSingularActiveEmployerOrganization } from '../PartyAffiliationBehavior';

describe('ResolveSingularActiveEmployerOrganization', () => {
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
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, 'person-xyz-789');

        expect(orgId).toBe('org-abc-123');
        expect(mockProvider.RunView).toHaveBeenCalledTimes(1);
    });

    it('picks the longest-lasting employer when several are active', async () => {
        const mockProvider = createMockProvider([
            { ToOrganizationID: 'org-short', StartDate: '2026-01-01', EndDate: null },
            { ToOrganizationID: 'org-long', StartDate: '2018-01-01', EndDate: null },
        ]);
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, 'person-xyz-789');

        expect(orgId).toBe('org-long');
    });

    it('returns null if person has zero active employers', async () => {
        const mockProvider = createMockProvider([]);
        const orgId = await ResolveSingularActiveEmployerOrganization(mockProvider, 'person-xyz-789');

        expect(orgId).toBeNull();
    });

    it('returns null if provider or personID is empty', async () => {
        const mockProvider = createMockProvider([{ ToOrganizationID: 'org-1' }]);
        expect(await ResolveSingularActiveEmployerOrganization(mockProvider, '')).toBeNull();
        expect(await ResolveSingularActiveEmployerOrganization(null as unknown as IRunViewProvider, 'person-1')).toBeNull();
    });
});
