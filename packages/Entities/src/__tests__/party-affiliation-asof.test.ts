/**
 * golive #168 — `ResolveActiveEmployerOrganization` without an `asOf` asks about the BUSINESS day.
 *
 * `StartDate` / `EndDate` are `date` columns. The old default was `new Date()` read back with
 * `toISOString().slice(0, 10)` — the UTC day, already tomorrow for the whole American evening, so an
 * employment ending today was dropped from 7 PM Central on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { ResolveActiveEmployerOrganization } from '../PartyAffiliationBehavior';

describe('ResolveActiveEmployerOrganization default asOf', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };

    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' } as InstanceConfigurationRow];
        engine._loaded = true;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-02T01:00:00.000Z')); // 8 PM Central, Oct 1
    });
    afterEach(() => {
        vi.useRealTimers();
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    const capture = (): { provider: never; filter: () => string } => {
        let filter = '';
        const provider = { RunView: async (p: { ExtraFilter: string }) => { filter = p.ExtraFilter; return { Success: true, Results: [] }; } };
        return { provider: provider as never, filter: () => filter };
    };

    it('filters on the business day when no asOf is given', async () => {
        const c = capture();
        await ResolveActiveEmployerOrganization(c.provider, 'person-1');
        expect(c.filter()).toContain(`StartDate <= '2026-10-01'`);
        expect(c.filter()).toContain(`EndDate >= '2026-10-01'`);
    });

    it('reads a passed day (midnight UTC) as that day', async () => {
        const c = capture();
        await ResolveActiveEmployerOrganization(c.provider, 'person-1', new Date('2026-09-15T00:00:00.000Z'));
        expect(c.filter()).toContain(`StartDate <= '2026-09-15'`);
    });
});
