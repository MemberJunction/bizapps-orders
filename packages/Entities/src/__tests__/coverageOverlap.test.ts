import { describe, it, expect, vi, beforeEach } from 'vitest';

const held = vi.hoisted(() => ({ value: true }));
vi.mock('../pricing/priceOverride', () => ({
    UserHasAuthorization: () => held.value,
}));

import {
    COVERAGE_RUN_ALONGSIDE_AUTH,
    CoverageOverlapReasonMissing,
    RunAlongsideRefusal,
} from '../coverage-overlap.js';

/**
 * bizapps-orders#511 — a line marked to run alongside existing coverage needs the confirming user to
 * hold the run-alongside grant and the line to say why.
 */
describe('run alongside existing coverage', () => {
    const user = { ID: 'u1', UserRoles: [{ RoleID: 'r1' }] } as never;
    const installed = { Authorizations: [{ Name: COVERAGE_RUN_ALONGSIDE_AUTH } as never] };
    const acked = (reason: string | null) => ({ AcknowledgesCoverageOverlap: true, CoverageOverlapReason: reason });

    beforeEach(() => {
        held.value = true;
    });

    it('treats a blank or whitespace reason as missing, only on an acknowledged line', () => {
        expect(CoverageOverlapReasonMissing(acked(null))).toBe(true);
        expect(CoverageOverlapReasonMissing(acked('   '))).toBe(true);
        expect(CoverageOverlapReasonMissing(acked('Renewal date differs'))).toBe(false);
        expect(CoverageOverlapReasonMissing({ AcknowledgesCoverageOverlap: false, CoverageOverlapReason: null })).toBe(false);
    });

    it('fails closed when the authorization is not installed', () => {
        expect(RunAlongsideRefusal(acked('Renewal date differs'), user, { Authorizations: [] })).toMatch(/is not installed/);
    });

    it('refuses a user without the grant, before asking for a reason', () => {
        held.value = false;
        expect(RunAlongsideRefusal(acked(null), user, installed)).toMatch(/needs the MJ\.BizApps\.Orders\.Coverage\.RunAlongside authorization/);
    });

    it('refuses a missing reason for a user with the grant', () => {
        expect(RunAlongsideRefusal(acked(' '), user, installed)).toMatch(/gives no reason/);
    });

    it('lets a granted user with a reason through', () => {
        expect(RunAlongsideRefusal(acked('Renewal date differs'), user, installed)).toBeNull();
    });
});
