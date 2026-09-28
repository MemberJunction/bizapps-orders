/**
 * The signal that lets the schedule entity tell an issue from a hand edit (D91).
 *
 * The property that matters is that it is keyed PER ROW. Confirm issues every instalment already
 * due in a loop inside one transaction, so a signal scoped to the operation rather than the row
 * would either refuse the second instalment or leave the first one's registration standing after
 * it finished — and a stale registration is worse than no guard, because it silently permits the
 * hand edit the guard exists to refuse.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BeginInstalmentIssue, EndInstalmentIssue, IsInstalmentIssueInProgress } from '../instalmentIssueGuard.js';

const ROW_A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const ROW_B = 'bbbbbbbb-0000-0000-0000-00000000000b';

describe('instalmentIssueGuard', () => {
    beforeEach(() => {
        EndInstalmentIssue(ROW_A);
        EndInstalmentIssue(ROW_B);
    });

    it('is off until an issue registers, and off again after it clears', () => {
        expect(IsInstalmentIssueInProgress(ROW_A)).toBe(false);
        BeginInstalmentIssue(ROW_A);
        expect(IsInstalmentIssueInProgress(ROW_A)).toBe(true);
        EndInstalmentIssue(ROW_A);
        expect(IsInstalmentIssueInProgress(ROW_A)).toBe(false);
    });

    it('registers one row without registering any other — the confirm-loop property', () => {
        BeginInstalmentIssue(ROW_A);
        expect(IsInstalmentIssueInProgress(ROW_B)).toBe(false);
    });

    it('leaves the second row registered when the first clears, and vice versa', () => {
        BeginInstalmentIssue(ROW_A);
        BeginInstalmentIssue(ROW_B);
        EndInstalmentIssue(ROW_A);
        expect(IsInstalmentIssueInProgress(ROW_A)).toBe(false);
        expect(IsInstalmentIssueInProgress(ROW_B)).toBe(true);
    });

    it('matches case-insensitively, because SQL Server returns uuids uppercase', () => {
        BeginInstalmentIssue(ROW_A.toUpperCase());
        expect(IsInstalmentIssueInProgress(ROW_A)).toBe(true);
        EndInstalmentIssue(ROW_A);
        expect(IsInstalmentIssueInProgress(ROW_A.toUpperCase())).toBe(false);
    });

    it('treats a missing id as not in progress rather than throwing', () => {
        expect(IsInstalmentIssueInProgress(null)).toBe(false);
        expect(IsInstalmentIssueInProgress(undefined)).toBe(false);
        expect(IsInstalmentIssueInProgress('')).toBe(false);
    });

    it('is safe to clear a row that was never registered — the finally runs on the refusal path too', () => {
        expect(() => EndInstalmentIssue(ROW_A)).not.toThrow();
    });
});
