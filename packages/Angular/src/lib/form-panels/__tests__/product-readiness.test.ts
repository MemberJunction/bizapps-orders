/**
 * golive#433 — what the product header lists before activating a Draft product (g433.1 A).
 */
import { describe, expect, it } from 'vitest';
import type { ExplainedGLRole } from '@mj-biz-apps/orders-entities';

import { EvaluateProductReadiness } from '../product-readiness';

function role(name: string, resolved: boolean, failure: string | null = resolved ? null : 'NotLinked'): ExplainedGLRole {
    return {
        Role: name,
        Steps: [],
        ResolvedGLAccountID: resolved ? 'acct' : null,
        ResolvedCode: resolved ? '40000' : null,
        ResolvedName: resolved ? 'Sales' : null,
        Failure: failure,
        Message: failure ? 'refused' : null,
    };
}

const BOTH = [role('Sales', true), role('Deferred Revenue', true)];

describe('EvaluateProductReadiness', () => {
    it('is ready with a price in force and both roles resolving', () => {
        expect(EvaluateProductReadiness({ PriceInForce: true, Roles: BOTH })).toEqual({ Ready: true, Missing: [] });
    });

    it('lists a missing price with pricing’s reason', () => {
        const r = EvaluateProductReadiness({ PriceInForce: false, PriceMessage: 'No price rule applies.', Roles: BOTH });
        expect(r.Ready).toBe(false);
        expect(r.Missing).toEqual(['No price is in force today (No price rule applies).']);
    });

    it('lists each role that resolves nowhere, Sales first', () => {
        const r = EvaluateProductReadiness({ PriceInForce: true, Roles: [role('Deferred Revenue', false), role('Sales', false)] });
        expect(r.Missing).toHaveLength(2);
        expect(r.Missing[0]).toMatch(/^Sales resolves to no GL account/);
        expect(r.Missing[1]).toMatch(/^Deferred Revenue resolves to no GL account/);
    });

    it('says a cross-company account would be refused at confirm', () => {
        const r = EvaluateProductReadiness({ PriceInForce: true, Roles: [role('Sales', false, 'CrossCompany'), role('Deferred Revenue', true)] });
        expect(r.Missing).toEqual(['Sales resolves to a GL account that belongs to another company, so confirm would refuse it.']);
    });

    it('treats a check that could not run as a gap, not as ready', () => {
        const r = EvaluateProductReadiness({ PriceInForce: null, PriceMessage: 'network down', Roles: null, GLError: 'timeout' });
        expect(r.Ready).toBe(false);
        expect(r.Missing).toEqual([
            'Whether a price is in force today could not be checked (network down).',
            'Whether Sales and Deferred Revenue resolve to GL accounts could not be checked (timeout).',
        ]);
    });

    it('flags a role the server did not return', () => {
        const r = EvaluateProductReadiness({ PriceInForce: true, Roles: [role('Sales', true)] });
        expect(r.Missing).toEqual(['Deferred Revenue was not checked.']);
    });
});
