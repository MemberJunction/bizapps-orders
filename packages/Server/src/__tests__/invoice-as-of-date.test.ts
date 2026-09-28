/**
 * An invoice asked for a day that does not exist is refused, not dated today (#209).
 *
 * `RenderInvoiceDocuments` is the boundary both `Orders.GenerateInvoice` and `Orders.SendDocument`
 * come through, and everything below it NORMALISES: `AsDateValue` answers `null` for `2026-02-30`,
 * so the day would fall back to today — on the printed date and on the days-until-due countdown —
 * with nothing to tell the caller their date never existed.
 *
 * The refusal has to happen before any work, which is what the empty provider below proves: if the
 * guard did not fire, `BuildInvoiceDocuments` would be reached and throw on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => ({
    // Whether the builder was reached is the assertion: a refusal must happen BEFORE any work,
    // and a guard that refuses everything must not.
    build: vi.fn().mockResolvedValue({ Success: false, Message: 'builder reached', Documents: [] }),
}));

vi.mock('@mj-biz-apps/orders-core-entities-server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-core-entities-server')>();
    return { ...actual, BuildInvoiceDocuments: mocks.build };
});

import { RenderInvoiceDocuments } from '../services/invoice-renderer.js';

const ORDER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const provider = {} as unknown as IMetadataProvider;
const user = { ID: 'user-1' } as unknown as UserInfo;

describe('RenderInvoiceDocuments validates the day it was asked for', () => {
    beforeEach(() => mocks.build.mockClear());

    it.each([
        ['2026-02-30', 'a well-formed day that does not exist — Date.parse rolls it to 2 March'],
        ['2026-13-01', 'a month that does not exist'],
        ['not-a-date', 'plain garbage'],
    ])('refuses %s (%s)', async (asOf) => {
        const res = await RenderInvoiceDocuments(ORDER, provider, user, { AsOfDate: asOf });
        expect(res.Success).toBe(false);
        expect(res.Code).toBe('INVALID_AS_OF_DATE');
        expect(res.Documents).toEqual([]);
        expect(mocks.build).not.toHaveBeenCalled();
    });

    it('lets a real day through to the builder, so the guard is not simply refusing everything', async () => {
        // Guards the guard: without this, a guard that refused every input would pass the three
        // assertions above and quietly break invoicing.
        await RenderInvoiceDocuments(ORDER, provider, user, { AsOfDate: '2026-03-15' });
        expect(mocks.build).toHaveBeenCalledWith(ORDER, provider, user, expect.objectContaining({ AsOf: '2026-03-15' }));
    });

    it('lets an omitted day through, which is the ordinary call', async () => {
        await RenderInvoiceDocuments(ORDER, provider, user, {});
        expect(mocks.build).toHaveBeenCalledWith(ORDER, provider, user, expect.objectContaining({ AsOf: null }));
    });
});
