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
    BackDatedWarning,
    CatchUpDate,
    EffectiveObservations,
    FutureDateWarning,
    MonthEnd,
    PlanSupersede,
    PROGRESS_SUPERSEDE_AUTH,
    ReversalDate,
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

describe('MonthEnd', () => {
    it('knows month lengths, including a leap February', () => {
        expect(MonthEnd('2026-09-23')).toBe('2026-09-30');
        expect(MonthEnd('2028-02-10')).toBe('2028-02-29');
        expect(MonthEnd('2026-12-01')).toBe('2026-12-31');
    });
});

describe('FutureDateWarning', () => {
    it('is silent up to and including today', () => {
        expect(FutureDateWarning('2026-10-03', '2026-10-03')).toBeNull();
        expect(FutureDateWarning('2026-10-02', '2026-10-03')).toBeNull();
        expect(FutureDateWarning('2026-08-31', '2026-10-03')).toBeNull();
    });

    it('warns on any later day, including later this month', () => {
        expect(FutureDateWarning('2026-10-04', '2026-10-03')).toMatch(/after today/);
        expect(FutureDateWarning('2026-10-31', '2026-10-03')).toMatch(/2026-10-31/);
    });

    it('names both dates for a wrong-year typo', () => {
        const warning = FutureDateWarning('2027-08-31', '2026-10-03');
        expect(warning).toMatch(/2027-08-31/);
        expect(warning).toMatch(/2026-10-03/);
    });
});

describe('BackDatedWarning', () => {
    it('is silent for the prior month and earlier this month', () => {
        expect(BackDatedWarning('2026-09-01', '2026-10-03')).toBeNull();
        expect(BackDatedWarning('2026-09-30', '2026-10-03')).toBeNull();
        expect(BackDatedWarning('2026-10-02', '2026-10-03')).toBeNull();
    });

    it('warns two or more months before the current month', () => {
        expect(BackDatedWarning('2026-08-31', '2026-10-03')).toMatch(/2026-08-31/);
        expect(BackDatedWarning('2026-08-31', '2026-10-03')).toMatch(/2026-10/);
        expect(BackDatedWarning('2025-10-31', '2026-10-03')).not.toBeNull();
    });

    it('steps back across a year boundary', () => {
        expect(BackDatedWarning('2025-12-01', '2026-01-15')).toBeNull();
        expect(BackDatedWarning('2025-11-30', '2026-01-15')).not.toBeNull();
    });

    it('is silent for a future date, which FutureDateWarning covers', () => {
        expect(BackDatedWarning('2027-08-31', '2026-10-03')).toBeNull();
    });

    it('reads the date part of a timestamp', () => {
        expect(BackDatedWarning('2026-09-01T00:00:00Z', '2026-10-03')).toBeNull();
    });
});

describe('ReversalDate', () => {
    it('keeps the replaced date while its month has no posted batch', () => {
        expect(ReversalDate('2026-08-31', [])).toBe('2026-08-31');
        expect(ReversalDate('2026-08-31', ['2026-07', '2026-09'])).toBe('2026-08-31');
    });

    it('moves to day 1 of the next month when the replaced month is posted', () => {
        expect(ReversalDate('2026-08-31', ['2026-08'])).toBe('2026-09-01');
    });

    it('skips every consecutive posted month', () => {
        expect(ReversalDate('2026-08-15', ['2026-08', '2026-09', '2026-10', '2026-12'])).toBe('2026-11-01');
    });

    it('rolls over the year', () => {
        expect(ReversalDate('2026-11-30', ['2026-11', '2026-12'])).toBe('2027-01-01');
    });

    it('reads only the date part of a timestamp', () => {
        expect(ReversalDate('2026-08-31T00:00:00Z', [])).toBe('2026-08-31');
        expect(ReversalDate('2026-08-31T00:00:00Z', ['2026-08'])).toBe('2026-09-01');
    });
});

describe('CatchUpDate', () => {
    it('keeps the chosen date while the replaced month is open', () => {
        expect(CatchUpDate('2026-08-31', '2026-08-31', '2026-08-31')).toBe('2026-08-31');
        expect(CatchUpDate('2026-09-15', '2026-08-31', '2026-08-31')).toBe('2026-09-15');
    });

    it('follows the reversal out of a closed month', () => {
        expect(CatchUpDate('2026-08-31', '2026-08-31', '2026-09-01')).toBe('2026-09-01');
        expect(CatchUpDate('2026-08-20', '2026-08-31', '2026-10-01')).toBe('2026-10-01');
    });

    it('keeps a chosen date after the first open day', () => {
        expect(CatchUpDate('2026-09-15', '2026-08-31', '2026-09-01')).toBe('2026-09-15');
    });

    it('reads only the date part of a timestamp', () => {
        expect(CatchUpDate('2026-08-31T00:00:00Z', '2026-08-31T00:00:00Z', '2026-09-01')).toBe('2026-09-01');
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
