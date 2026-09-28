import { describe, it, expect } from 'vitest';
import {
    PRICE_OVERRIDE_AUTH,
    PRICE_OVERRIDE_REASON_REQUIRED,
    isEnginePrice,
    isNamedListPick,
    moneyEqual,
    priceOverrideCatalogInstalled,
    priceOverrideReasonMissing,
    userPriceOverrideKind,
    UserHasAuthorization,
} from '../pricing/priceOverride.js';

describe('price override helpers', () => {
    it('treats the catalog as missing when the parent authorization is not loaded', () => {
        expect(priceOverrideCatalogInstalled({ Authorizations: [] })).toBe(false);
        expect(
            priceOverrideCatalogInstalled({
                Authorizations: [{ Name: PRICE_OVERRIDE_AUTH.Parent } as never],
            }),
        ).toBe(true);
    });

    it('matches the engine on rounded money and ProductPriceID', () => {
        const engine = { UnitPrice: 10.001, ProductPriceID: 'AAA' };
        expect(isEnginePrice({ UnitPrice: 10, ProductPriceID: 'aaa' }, engine)).toBe(true);
        expect(isEnginePrice({ UnitPrice: 11, ProductPriceID: 'aaa' }, engine)).toBe(false);
        expect(isEnginePrice({ UnitPrice: 10, ProductPriceID: null }, engine)).toBe(false);
    });

    it('accepts a named list pick whose amount matches', () => {
        const applicable = [
            { ID: 'p1', UnitPrice: 175 },
            { ID: 'p2', UnitPrice: 275 },
        ];
        expect(isNamedListPick({ ProductPriceID: 'p2', UnitPrice: 275 }, applicable)).toBe(true);
        expect(isNamedListPick({ ProductPriceID: 'p2', UnitPrice: 1 }, applicable)).toBe(false);
        expect(isNamedListPick({ ProductPriceID: null, UnitPrice: 275 }, applicable)).toBe(false);
        expect(moneyEqual(1.005, 1.01)).toBe(true);
    });

    it('denies override when there is no user', () => {
        expect(userPriceOverrideKind(null, { Authorizations: [] })).toBe('none');
        expect(userPriceOverrideKind(undefined, { Authorizations: [] })).toBe('none');
    });

    it('UserHasAuthorization fails closed: no user, or an authorization not in the catalog, holds nothing', () => {
        const user = { ID: 'u1', UserRoles: [{ RoleID: 'r1' }] } as never;
        expect(UserHasAuthorization('MJ.BizApps.Orders.Progress.Attest', null, { Authorizations: [] })).toBe(false);
        expect(UserHasAuthorization('MJ.BizApps.Orders.Progress.Attest', user, { Authorizations: [] })).toBe(false);
    });
});

/**
 * golive #253 item 4 — a flagged line has to say why.
 *
 * The helper only answers "is a reason missing from a line that claims an override"; whether the
 * flag is TRUE is the client's decision at pick time. Converted lines with a flag and no reason are
 * flagged as missing here too — the server decides, from dirtiness, whether to act on that.
 */
describe('priceOverrideReasonMissing', () => {
    it('is false for a line on its default price, reason or not', () => {
        expect(priceOverrideReasonMissing({ PriceOverridden: false, PriceOverrideReason: null })).toBe(false);
        expect(priceOverrideReasonMissing({ PriceOverridden: 0, PriceOverrideReason: 'stale note' })).toBe(false);
        expect(priceOverrideReasonMissing({})).toBe(false);
    });

    it('is true for an overridden line with no reason, however the flag arrives', () => {
        expect(priceOverrideReasonMissing({ PriceOverridden: true, PriceOverrideReason: null })).toBe(true);
        expect(priceOverrideReasonMissing({ PriceOverridden: 1, PriceOverrideReason: '' })).toBe(true);
        expect(priceOverrideReasonMissing({ PriceOverridden: '1', PriceOverrideReason: undefined })).toBe(true);
    });

    it('does not accept whitespace as a reason', () => {
        expect(priceOverrideReasonMissing({ PriceOverridden: true, PriceOverrideReason: '   \n' })).toBe(true);
    });

    it('is false once a reason is given', () => {
        expect(priceOverrideReasonMissing({ PriceOverridden: true, PriceOverrideReason: 'Board-approved rate' })).toBe(false);
    });

    it('phrases the refusal as an instruction, not a code', () => {
        expect(PRICE_OVERRIDE_REASON_REQUIRED).toBe('Enter a reason for the price override');
    });
});
