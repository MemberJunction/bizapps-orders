/**
 * A payment dated the day its money arrived (bc-aidp-next-golive#448): the initial payment's day,
 * and who may correct a captured payment's date afterwards. The payment is a stand-in carrying what
 * the rules read: IsSaved and the Status / PaymentDate fields' Value, OldValue and Dirty.
 */
import { describe, expect, it } from 'vitest';
import type { AuthorizationInfo, BaseEntity, UserInfo } from '@memberjunction/core';
import {
    InitialPaymentDay,
    IsPaymentDateCorrection,
    PAYMENT_DATE_CHANGE_AUTH,
    PaymentDateCorrectionRefusal,
    UserCanChangePaymentDate,
} from '../payment-date';

const day = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

describe('InitialPaymentDay — the date the initial payment takes (g448.2)', () => {
    it('is the received day when finance gave one', () => {
        expect(InitialPaymentDay(day('2026-11-02'), day('2026-10-30'))?.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    });

    it("is the order's date when no received day is given", () => {
        expect(InitialPaymentDay(day('2026-11-02'), null)?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('reads a received day typed as text, and an instant as its calendar day', () => {
        expect(InitialPaymentDay(day('2026-11-02'), '2026-10-30')?.toISOString()).toBe('2026-10-30T00:00:00.000Z');
        expect(InitialPaymentDay('2026-11-02T00:00:00.000Z', undefined)?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('is null when neither names a day, leaving the caller to fall back to today', () => {
        expect(InitialPaymentDay(null, '')).toBeNull();
    });
});

interface Field { Value: unknown; OldValue: unknown; Dirty: boolean }

function payment(opts: { saved?: boolean; savedStatus: string; status?: string; oldDate: string; newDate: string }): BaseEntity {
    const fields: Record<string, Field> = {
        Status: { Value: opts.status ?? opts.savedStatus, OldValue: opts.savedStatus, Dirty: (opts.status ?? opts.savedStatus) !== opts.savedStatus },
        PaymentDate: { Value: day(opts.newDate), OldValue: day(opts.oldDate), Dirty: opts.oldDate !== opts.newDate },
    };
    return { IsSaved: opts.saved ?? true, GetFieldByName: (name: string) => fields[name] } as unknown as BaseEntity;
}

const FINANCE = { ID: 'U-FINANCE' } as UserInfo;
const CLERK = { ID: 'U-CLERK' } as UserInfo;
const catalog = {
    Authorizations: [{ ID: 'A1', Name: PAYMENT_DATE_CHANGE_AUTH, ParentID: null, UserCanExecute: (u: UserInfo) => u.ID === FINANCE.ID }] as unknown as AuthorizationInfo[],
};

describe('IsPaymentDateCorrection — a captured payment moved to another day', () => {
    it.each(['Captured', 'Refunded', 'Disputed'])('is true for a %s payment whose date changed', (status) => {
        expect(IsPaymentDateCorrection(payment({ savedStatus: status, oldDate: '2026-11-01', newDate: '2026-10-30' }))).toBe(true);
    });

    it('is false for a Pending payment, which has no entries yet', () => {
        expect(IsPaymentDateCorrection(payment({ savedStatus: 'Pending', oldDate: '2026-11-01', newDate: '2026-10-30' }))).toBe(false);
    });

    it('is false for the capture itself, judged by the status the row was saved with', () => {
        expect(IsPaymentDateCorrection(payment({ savedStatus: 'Pending', status: 'Captured', oldDate: '2026-11-01', newDate: '2026-10-30' }))).toBe(false);
    });

    it('is false for a new payment and for an unchanged date', () => {
        expect(IsPaymentDateCorrection(payment({ saved: false, savedStatus: 'Captured', oldDate: '2026-11-01', newDate: '2026-10-30' }))).toBe(false);
        expect(IsPaymentDateCorrection(payment({ savedStatus: 'Captured', oldDate: '2026-11-01', newDate: '2026-11-01' }))).toBe(false);
    });
});

describe('PaymentDateCorrectionRefusal — finance only', () => {
    const correction = () => payment({ savedStatus: 'Captured', oldDate: '2026-11-01', newDate: '2026-10-30' });

    it('refuses a user without the authorization, naming it', () => {
        expect(PaymentDateCorrectionRefusal(correction(), CLERK, catalog)).toBe(
            `Changing the date of a captured payment requires the ${PAYMENT_DATE_CHANGE_AUTH} authorization (the Finance role).`,
        );
    });

    it('refuses everyone when the authorization is not in the catalog', () => {
        expect(PaymentDateCorrectionRefusal(correction(), FINANCE, { Authorizations: [] })).not.toBeNull();
        expect(UserCanChangePaymentDate(FINANCE, { Authorizations: [] })).toBe(false);
    });

    it('lets a holder through', () => {
        expect(PaymentDateCorrectionRefusal(correction(), FINANCE, catalog)).toBeNull();
    });

    it('says nothing about a save that is not a correction', () => {
        expect(PaymentDateCorrectionRefusal(payment({ savedStatus: 'Pending', oldDate: '2026-11-01', newDate: '2026-10-30' }), CLERK, catalog)).toBeNull();
    });
});
