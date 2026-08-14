/**
 * Tests for the information architecture, which is data and therefore testable
 * without Angular.
 *
 * The badge rules are the interesting part: a zero must not render, because a
 * grey "0" trains people to ignore the badge that does matter.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildLeftNavSections,
    CATALOG_SUB_PAGES,
    ORDERS_SUB_PAGES,
    PAYMENTS_SUB_PAGES,
    RECEIVABLES_SUB_PAGES,
    type OrdersSubPage,
} from '../section-nav.model';

const ALL_RAILS: Array<[string, OrdersSubPage[]]> = [
    ['orders', ORDERS_SUB_PAGES],
    ['payments', PAYMENTS_SUB_PAGES],
    ['receivables', RECEIVABLES_SUB_PAGES],
    ['catalog', CATALOG_SUB_PAGES],
];

describe('the four rails', () => {
    it.each(ALL_RAILS)('%s has unique page ids', (_name, pages) => {
        const ids = pages.map((p) => p.Id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(ALL_RAILS)('%s gives every page a label and an icon', (_name, pages) => {
        for (const page of pages) {
            expect(page.Label.length).toBeGreaterThan(0);
            expect(page.Icon).toMatch(/^fa-/);
        }
    });

    it('puts subscriptions under receivables, not orders', () => {
        // Deliberate: a subscription's daily question is "will it renew and will
        // it get paid", which is a receivables question.
        expect(RECEIVABLES_SUB_PAGES.map((p) => p.Id)).toContain('subscriptions');
        expect(ORDERS_SUB_PAGES.map((p) => p.Id)).not.toContain('subscriptions');
    });
});

describe('BuildLeftNavSections', () => {
    it('keeps ungrouped items first, then groups in author order', () => {
        const sections = BuildLeftNavSections(ORDERS_SUB_PAGES);
        expect(sections[0].label).toBeUndefined();
        expect(sections[1].label).toBe('Work');
        expect(sections).toHaveLength(2);
    });

    it('preserves rail order within a group', () => {
        const sections = BuildLeftNavSections(ORDERS_SUB_PAGES);
        expect(sections[0].items.map((i) => i.id)).toEqual(['dashboard', 'list']);
        expect(sections[1].items.map((i) => i.id)).toEqual(['fulfillment', 'returns']);
    });

    it('maps label, icon and description through', () => {
        const [first] = BuildLeftNavSections(ORDERS_SUB_PAGES)[0].items;
        expect(first.label).toBe('Dashboard');
        expect(first.icon).toBe('fa-solid fa-gauge-high');
        expect(first.description).toBe('Is today normal?');
    });

    it('renders a badge where one is supplied', () => {
        const sections = BuildLeftNavSections(ORDERS_SUB_PAGES, { FulfillmentPending: 3 });
        const fulfillment = sections.flatMap((s) => s.items).find((i) => i.id === 'fulfillment');
        expect(fulfillment?.badge).toBe(3);
    });

    it('OMITS a zero badge rather than rendering "0"', () => {
        const sections = BuildLeftNavSections(ORDERS_SUB_PAGES, { FulfillmentPending: 0, Overdue: 0 });
        for (const item of sections.flatMap((s) => s.items)) {
            expect('badge' in item).toBe(false);
        }
    });

    it('omits badges entirely when none are supplied', () => {
        const sections = BuildLeftNavSections(RECEIVABLES_SUB_PAGES);
        for (const item of sections.flatMap((s) => s.items)) {
            expect('badge' in item).toBe(false);
        }
    });

    it('only badges the pages that have a badge rule', () => {
        const sections = BuildLeftNavSections(PAYMENTS_SUB_PAGES, { CreditsHeld: 1, PaymentsPending: 9 });
        const badged = sections.flatMap((s) => s.items).filter((i) => 'badge' in i);
        // PaymentsPending has no rule yet, so it must not leak onto an unrelated page.
        expect(badged.map((i) => i.id)).toEqual(['credit']);
    });

    it('handles an empty page list', () => {
        expect(BuildLeftNavSections([])).toEqual([]);
    });
});
