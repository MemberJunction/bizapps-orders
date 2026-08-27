/**
 * @fileoverview #113 — the Product GL-accounts panel must agree with what an order actually books.
 *
 * ── THE BUG THIS EXISTS TO PIN ──
 *
 * The first version of this panel decided "active" with its own window test: status is `Active` and
 * today falls between `StartedAt` and `EndedAt`. That is right for one link and WRONG the moment a role
 * has two — a mapping superseded while the old row is still open, which is what an accountant does when
 * they re-point a product mid-year. Both rows pass a window test, so the panel showed two active
 * accounts for one role while the booking pipeline used exactly one. A screen that disagrees with the
 * booking about where money lands is worse than no screen at all.
 *
 * The fix is not a better window test; it is refusing to have one. `pickActiveLinkIndex` is the pure
 * function behind accounting's own `ResolveLinkedAccount`, exported by that package, and it carries the
 * tie-break this panel has no business restating (latest `StartedAt` wins; a null `StartedAt` loses to
 * any dated one). These checks assert the panel's answer IS the picker's answer — including one that
 * compares them directly, so the two cannot drift apart later.
 */
import { describe, expect, it } from 'vitest';
import { pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';

import { BizAppsProductGLLinksComponent, type ProductGLLinkRow } from '../lib/custom/Product/widgets/product-gl-links.component';

/** The component with a no-op change detector — nothing here touches the view. */
function panel(): BizAppsProductGLLinksComponent {
    return new BizAppsProductGLLinksComponent({ detectChanges: () => undefined } as never);
}

/** Reaches the private resolver. Deliberate: it is internal, and it is the thing worth pinning. */
function inForce(rows: Array<Record<string, unknown>>): Set<string> {
    return (panel() as unknown as { inForceIDs(r: Array<Record<string, unknown>>): Set<string> }).inForceIDs(rows);
}

const REVENUE = 'role-revenue';
const DEFERRED = 'role-deferred';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const PAST = day('2020-01-01');
const RECENT = day('2026-01-01');
const FUTURE = day('2099-01-01');

function link(over: Partial<Record<string, unknown>> & { ID: string }): Record<string, unknown> {
    return {
        GLAccountRoleID: REVENUE,
        Status: 'Active',
        StartedAt: null,
        EndedAt: null,
        ...over,
    };
}

describe('#113 — which GL link the product panel calls active', () => {
    it('a single open-ended Active link is in force', () => {
        expect([...inForce([link({ ID: 'a' })])]).toEqual(['a']);
    });

    it('TWO Active links on one role resolve to ONE — the later StartedAt wins', () => {
        // The defect this file exists for. A window test marks both; the booking uses one.
        const rows = [
            link({ ID: 'old', StartedAt: PAST }),
            link({ ID: 'new', StartedAt: RECENT }),
        ];
        const winners = inForce(rows);
        expect(winners.size, 'exactly one link may be in force for a role').toBe(1);
        expect([...winners]).toEqual(['new']);
    });

    it('a dated StartedAt beats a null one, which is accounting\'s tie-break and not ours', () => {
        const winners = inForce([link({ ID: 'undated' }), link({ ID: 'dated', StartedAt: PAST })]);
        expect([...winners]).toEqual(['dated']);
    });

    it('two different ROLES are both in force — they do not compete', () => {
        const winners = inForce([
            link({ ID: 'rev' }),
            link({ ID: 'def', GLAccountRoleID: DEFERRED }),
        ]);
        expect(winners.size).toBe(2);
    });

    it('a link that has not started, or has ended, is not in force', () => {
        expect(inForce([link({ ID: 'later', StartedAt: FUTURE })]).size).toBe(0);
        expect(inForce([link({ ID: 'over', EndedAt: PAST })]).size).toBe(0);
    });

    it('a Disabled link is never in force, however open its window', () => {
        expect(inForce([link({ ID: 'disabled', Status: 'Disabled' })]).size).toBe(0);
    });

    it('an open window on both sides means "always has, still does"', () => {
        expect(inForce([link({ ID: 'always', StartedAt: null, EndedAt: null })]).size).toBe(1);
    });

    /**
     * THE ANTI-DRIFT CHECK. The others describe the behaviour; this one asserts the panel and the
     * booking pipeline give the SAME answer, so re-implementing the rule here later fails loudly
     * instead of quietly disagreeing about money.
     */
    it('agrees with accounting\'s own picker on the same candidates', () => {
        const rows = [
            link({ ID: 'a', StartedAt: PAST }),
            link({ ID: 'b', StartedAt: RECENT }),
            link({ ID: 'c', StartedAt: RECENT, EndedAt: PAST }),
            link({ ID: 'd', Status: 'Disabled' }),
        ];
        const mine = inForce(rows);

        const idx = pickActiveLinkIndex(
            rows.map((r) => ({
                Status: String(r.Status),
                StartedAt: r.StartedAt as Date | null,
                EndedAt: r.EndedAt as Date | null,
            })),
            new Date(),
        );

        expect(idx, 'the picker must find a winner for this set').toBeGreaterThanOrEqual(0);
        expect([...mine]).toEqual([String(rows[idx].ID)]);
    });
});

describe('#113 — what the status chip says', () => {
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'x', RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: false, ...over,
    });

    it('the link that books reads as in force', () => {
        expect(panel().StatusLabel(row({ Active: true }))).toBe('In force');
    });

    it('an Active row that does NOT book reads as superseded, not as "Active"', () => {
        // Rendering the raw column here would put "Active" on two rows of the same role — the exact
        // confusion the resolver was changed to remove.
        expect(panel().StatusLabel(row({ Active: false, Status: 'Active' }))).toBe('Superseded');
    });

    it('any other stored status is shown as itself', () => {
        expect(panel().StatusLabel(row({ Active: false, Status: 'Disabled' }))).toBe('Disabled');
    });
});
