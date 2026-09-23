/**
 * ProgressSupersede — replacing a posted progress observation without editing it (golive #260).
 *
 * The properties that matter: a supersede nets the replaced observation to exactly zero, the new
 * observation's delta is its own and nothing else, a superseded row stops counting as "last", and
 * a missing authorization refuses rather than opening the gate.
 */
import { describe, expect, it } from 'vitest';
import { AuthorizationInfo, UserInfo } from '@memberjunction/core';
import {
    EffectiveObservations,
    FutureDateWarning,
    MonthEnd,
    PlanSupersede,
    PROGRESS_SUPERSEDE_AUTH,
    SupersedeRefusal,
} from '../ProgressSupersede.js';
import { ComputeCatchUp } from '../RevenueRecognition.js';

describe('EffectiveObservations', () => {
    it('drops a row another row supersedes, and keeps the superseding row', () => {
        const rows = [
            { ID: 'A', SupersedesMeasurementID: null },
            { ID: 'B', SupersedesMeasurementID: null },
            { ID: 'C', SupersedesMeasurementID: 'b' },
        ];
        expect(EffectiveObservations(rows).map((r) => r.ID)).toEqual(['A', 'C']);
    });

    it('a chain of supersedes leaves only the newest link', () => {
        const rows = [
            { ID: 'A', SupersedesMeasurementID: null },
            { ID: 'B', SupersedesMeasurementID: 'A' },
            { ID: 'C', SupersedesMeasurementID: 'B' },
        ];
        expect(EffectiveObservations(rows).map((r) => r.ID)).toEqual(['C']);
    });
});

describe('PlanSupersede', () => {
    it('restores the total the replaced observation found, then catches up from there', () => {
        // 40% then a mistyped-date 70% on a 1,000.01 line: 400 + 300.01 recognised.
        const plan = PlanSupersede(1000.01, 0.55, 700.01, 300.01);
        expect(plan.Reversal).toBe(-300.01);
        expect(plan.Restored).toBe(400);
        expect(plan.CatchUp).toEqual(ComputeCatchUp(1000.01, 0.55, 400));
        expect(plan.CatchUp.Delta).toBe(150.01);
    });

    it('reversal plus catch-up equals what a single observation from the restored total would post', () => {
        const plan = PlanSupersede(1000.01, 1, 700.01, 300.01);
        expect(Math.round((700.01 + plan.Reversal + plan.CatchUp.Delta) * 100) / 100).toBe(1000.01);
    });

    it('reverses a backward slide by putting the revenue back', () => {
        const plan = PlanSupersede(1000, 0.7, 550, -150);
        expect(plan.Reversal).toBe(150);
        expect(plan.Restored).toBe(700);
        expect(plan.CatchUp.Delta).toBe(0);
    });

    it('superseding an observation that moved nothing reverses nothing', () => {
        expect(PlanSupersede(500, 0.3, 150, 0).Reversal).toBe(0);
    });
});

describe('MonthEnd and FutureDateWarning', () => {
    it('knows month lengths, including a leap February', () => {
        expect(MonthEnd('2026-09-23')).toBe('2026-09-30');
        expect(MonthEnd('2028-02-10')).toBe('2028-02-29');
        expect(MonthEnd('2026-12-01')).toBe('2026-12-31');
    });

    it('is silent up to and including the current month end', () => {
        expect(FutureDateWarning('2026-09-30', '2026-09-23')).toBeNull();
        expect(FutureDateWarning('2026-08-31', '2026-09-23')).toBeNull();
    });

    it('warns, naming both dates, once the date passes the month end', () => {
        const warning = FutureDateWarning('2027-12-31', '2026-09-23');
        expect(warning).toMatch(/2027-12-31/);
        expect(warning).toMatch(/2026-09-30/);
    });
});

describe('SupersedeRefusal', () => {
    const user = new UserInfo(null, { ID: 'U1', Name: 'Attester', UserRoles: [] });

    it('refuses when the authorization is not installed, rather than treating the gate as off', () => {
        expect(SupersedeRefusal(user, [])).toMatch(/not installed/);
    });

    it('refuses a user whose roles do not hold the grant', () => {
        const auth = new AuthorizationInfo({ ID: 'A1', Name: PROGRESS_SUPERSEDE_AUTH, IsActive: true });
        expect(SupersedeRefusal(user, [auth])).toMatch(/Orders Revenue Supervisor/);
    });
});
