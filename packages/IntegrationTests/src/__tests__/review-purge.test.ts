/**
 * The review-data seeder's purge (#583 item 21).
 *
 * The seeder books on the shared ORD-WORLD companies, so the company sweep never reached its rows.
 * These pin the marker shape and the batch that deletes by it; running the batch needs a database.
 */
import { describe, expect, it } from 'vitest';
import { NewReviewMarker, REVIEW_MARKER_PREFIX, ReviewPurgeSQL } from '../fixture.js';

describe('review-run marker', () => {
    it('is REVIEW- plus base36 time, upper case', () => {
        const marker = NewReviewMarker(new Date('2026-10-12T00:00:00Z'));
        expect(marker.startsWith(REVIEW_MARKER_PREFIX)).toBe(true);
        expect(marker).toMatch(/^REVIEW-[A-Z0-9]+$/);
        expect(parseInt(marker.slice(REVIEW_MARKER_PREFIX.length), 36)).toBe(Date.parse('2026-10-12T00:00:00Z'));
    });
});

describe('ReviewPurgeSQL', () => {
    it('refuses anything that is not a marker, so no caller text reaches the SQL', () => {
        expect(() => ReviewPurgeSQL("REVIEW-ABC' OR 1=1 --")).toThrow(/not a review-run marker/);
        expect(() => ReviewPurgeSQL('IT-ORD-ABC')).toThrow(/not a review-run marker/);
        expect(() => ReviewPurgeSQL('review-abc')).toThrow(/not a review-run marker/);
    });

    it('scopes one run by its marker: order descriptions and promotion codes', () => {
        const sql = ReviewPurgeSQL('REVIEW-ABC123');
        expect(sql).toContain("WHERE Description LIKE 'REVIEW-ABC123 %'");
        expect(sql).toContain("Code LIKE 'REVIEW-ABC123-%'");
    });

    it('with no marker, scopes every review run', () => {
        const sql = ReviewPurgeSQL();
        expect(sql).toContain("WHERE Description LIKE 'REVIEW-%'");
    });

    it('never selects by company, so ORD-WORLD and other orders on it are out of scope', () => {
        expect(ReviewPurgeSQL('REVIEW-ABC123')).not.toMatch(/CompanyID IN|ReceivingCompanyID/);
    });

    it('runs as one all-or-nothing transaction that puts the triggers back', () => {
        const sql = ReviewPurgeSQL('REVIEW-ABC123');
        expect(sql.indexOf('SET XACT_ABORT ON')).toBeLessThan(sql.indexOf('BEGIN TRANSACTION'));
        const disables = sql.match(/DISABLE TRIGGER/g) ?? [];
        const enables = sql.match(/ENABLE TRIGGER/g) ?? [];
        expect(disables.length).toBe(4);
        expect(enables.length).toBe(disables.length);
        expect(sql.lastIndexOf('ENABLE TRIGGER')).toBeGreaterThan(sql.indexOf('DELETE FROM'));
        expect(sql.trimEnd().endsWith('COMMIT TRANSACTION;')).toBe(true);
    });

    it('deletes journal entries before the rows they link to, and lines before their order', () => {
        const sql = ReviewPurgeSQL('REVIEW-ABC123');
        const at = (s: string) => {
            const i = sql.indexOf(s);
            expect(i, s).toBeGreaterThan(-1);
            return i;
        };
        const entries = at('DELETE FROM __mj_BizAppsAccounting.JournalEntry WHERE ID IN');
        expect(entries).toBeLessThan(at('DELETE FROM __mj_BizAppsOrders.PaymentLine WHERE'));
        expect(entries).toBeLessThan(at('DELETE FROM __mj_BizAppsOrders.SubscriptionTerm WHERE'));
        expect(entries).toBeLessThan(at('DELETE FROM __mj_BizAppsOrders.OrderLineProgressMeasurement WHERE'));
        expect(at('DELETE FROM __mj_BizAppsOrders.OrderLine WHERE')).toBeLessThan(
            at('DELETE FROM __mj_BizAppsOrders.OrderHeader WHERE'),
        );
    });
});
