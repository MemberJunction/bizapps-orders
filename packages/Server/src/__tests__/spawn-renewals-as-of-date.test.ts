/**
 * `Orders.SpawnRenewals` refuses a day that does not exist, before it places anything (#209).
 *
 * The action's own guard used to be `Number.isNaN(new Date(asOf).getTime())`, which ROLLS OVER:
 * `2026-02-30` parses as 2 March, so the check passed and a renewal pass ran — and placed real
 * orders — for a day nobody named. The operation below now refuses the same value, so this guard
 * is no longer the only thing standing between a typo and a billing run; what it still owns is the
 * refusal happening HERE, with the action's own message, before any provider work.
 *
 * That last part is what this test pins: the action returns on the date alone, with no metadata
 * provider configured and no operation reached.
 */
import { describe, expect, it } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

import { SpawnRenewalsAction } from '../custom/spawn-renewals.action.js';

interface CallableAction {
    InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message?: string }>;
}

const run = (asOf: string) => {
    const action = new SpawnRenewalsAction() as unknown as CallableAction;
    return action.InternalRunAction({
        ContextUser: { ID: 'user-1' },
        Params: [{ Name: 'AsOfDate', Value: asOf, Type: 'Input' }],
    } as unknown as RunActionParams);
};

describe('Orders.SpawnRenewals refuses an impossible AsOfDate at the action boundary', () => {
    it.each([
        ['2026-02-30', 'Date.parse rolls this to 2 March, so the old check let it through'],
        ['2026-06-31', 'June has 30 days'],
        ['not-a-date', 'plain garbage, which the old check did catch'],
    ])('refuses %s (%s)', async (asOf) => {
        const res = await run(asOf);
        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('INVALID_AS_OF_DATE');
    });

    it('does not refuse a real day — including a leap day, which is real', async () => {
        // Guards the guard: a check that refused everything would satisfy the three above while
        // making the renewal pass unrunnable. These get past the date and stop on the absent
        // provider instead, which `InternalRunAction` reports as ERROR.
        for (const day of ['2026-03-15', '2028-02-29']) {
            const res = await run(day);
            expect(res.ResultCode, day).not.toBe('INVALID_AS_OF_DATE');
        }
    });
});
