/**
 * The update-card link (#289): signing and checking its token, its expiry, and the rules that refuse
 * paying a renewal through it. No database.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    ConfigureRenewalPaymentLinks,
    RENEWAL_LINK_GRACE_DAYS,
    RenewalPaymentLinkExpiresAt,
    RenewalPaymentLinkSecret,
    RenewalPaymentLinkUrl,
    PayerOwnsRenewalCustomer,
    RenewalPayer,
    RenewalPaymentRefusal,
    RenewalPaymentTokenMessage,
    SignRenewalPaymentToken,
    VerifyRenewalPaymentToken,
} from '../CheckoutRenewalPayment.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const ORDER = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
const SUB = '11111111-2222-4333-8444-555555555555';
const NOW = new Date('2027-01-05T12:00:00Z');
const LATER = new Date('2027-01-21T23:59:59Z');

describe('renewal link token', () => {
    it('round-trips the order, the subscription and the expiry', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: LATER }, SECRET);
        const check = await VerifyRenewalPaymentToken(token, SECRET, NOW);
        expect(check).toEqual({ Valid: true, OrderID: ORDER.toLowerCase(), SubscriptionID: SUB, ExpiresAt: LATER });
    });

    it('carries no personal data: only two ids and a number, base64url', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: LATER }, SECRET);
        expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        const payload = atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'));
        expect(payload).toBe(`${ORDER.toLowerCase()}.${SUB}.${Math.floor(LATER.getTime() / 1000)}`);
    });

    it('refuses an expired token even with a good signature', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: new Date('2027-01-05T11:59:59Z') }, SECRET);
        expect(await VerifyRenewalPaymentToken(token, SECRET, NOW)).toEqual({ Valid: false, Reason: 'expired' });
    });

    it('refuses a token signed with another secret', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: LATER }, `${SECRET}-other`);
        expect(await VerifyRenewalPaymentToken(token, SECRET, NOW)).toEqual({ Valid: false, Reason: 'signature' });
    });

    it('refuses a tampered payload: another order, or a later expiry', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: LATER }, SECRET);
        const [, signature] = token.split('.');
        const forge = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const otherOrder = forge(`99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee.${SUB}.${Math.floor(LATER.getTime() / 1000)}`);
        const laterExpiry = forge(`${ORDER.toLowerCase()}.${SUB}.${Math.floor(LATER.getTime() / 1000) + 86400 * 365}`);
        expect(await VerifyRenewalPaymentToken(`${otherOrder}.${signature}`, SECRET, NOW)).toEqual({ Valid: false, Reason: 'signature' });
        expect(await VerifyRenewalPaymentToken(`${laterExpiry}.${signature}`, SECRET, NOW)).toEqual({ Valid: false, Reason: 'signature' });
    });

    it('refuses malformed tokens without throwing', async () => {
        for (const bad of ['', 'abc', 'a.b.c', '!!!.???', `${'a'.repeat(500)}.b`, null, undefined]) {
            const check = await VerifyRenewalPaymentToken(bad, SECRET, NOW);
            expect(check.Valid, String(bad)).toBe(false);
        }
    });

    it('accepts nothing when no secret is configured', async () => {
        const token = await SignRenewalPaymentToken({ OrderID: ORDER, SubscriptionID: SUB, ExpiresAt: LATER }, SECRET);
        expect(await VerifyRenewalPaymentToken(token, null, NOW)).toEqual({ Valid: false, Reason: 'not-configured' });
    });

    it('refuses to sign for an id that is not one', async () => {
        await expect(SignRenewalPaymentToken({ OrderID: "x' OR 1=1", SubscriptionID: SUB, ExpiresAt: LATER }, SECRET)).rejects.toThrow();
    });
});

describe('ConfigureRenewalPaymentLinks', () => {
    afterEach(() => ConfigureRenewalPaymentLinks({ Secret: null }));

    it('keeps a secret of 32 characters or more, and treats a shorter one as none', () => {
        ConfigureRenewalPaymentLinks({ Secret: SECRET });
        expect(RenewalPaymentLinkSecret()).toBe(SECRET);
        ConfigureRenewalPaymentLinks({ Secret: 'short' });
        expect(RenewalPaymentLinkSecret()).toBeNull();
        ConfigureRenewalPaymentLinks({ Secret: undefined });
        expect(RenewalPaymentLinkSecret()).toBeNull();
    });
});

describe('RenewalPaymentLinkExpiresAt', () => {
    it('is the end of the day the grace runs out after the access cutoff', () => {
        // Due Jan 1, cutoff 14: suspended Jan 15; the link works through Jan 22.
        expect(RENEWAL_LINK_GRACE_DAYS).toBe(7);
        expect(RenewalPaymentLinkExpiresAt('2027-01-01', 14).toISOString()).toBe('2027-01-22T23:59:59.000Z');
    });

    it('lasts 30 days from the due day when the cutoff is off', () => {
        expect(RenewalPaymentLinkExpiresAt('2027-01-01', null).toISOString()).toBe('2027-01-31T23:59:59.000Z');
    });
});

describe('RenewalPaymentLinkUrl', () => {
    it('joins the base and the token under /renew', () => {
        expect(RenewalPaymentLinkUrl('https://shop.example.org/checkout/', 'p.s')).toBe('https://shop.example.org/checkout/renew/p.s');
    });
});

describe('RenewalPaymentRefusal — single use in effect', () => {
    const open = { Status: 'Confirmed', Balance: 1200, SubscriptionIDs: [SUB], Subscriptions: [{ ID: SUB, Status: 'Active', AutoRenew: true }] };

    it('allows an open, confirmed renewal of the named subscription', () => {
        expect(RenewalPaymentRefusal(open, SUB.toUpperCase(), false)).toBeNull();
    });

    it('refuses a missing order, or one that renews another subscription', () => {
        expect(RenewalPaymentRefusal(null, SUB, false)).toBe('This renewal could not be found.');
        expect(RenewalPaymentRefusal({ ...open, SubscriptionIDs: [] }, SUB, false)).toBe('This link does not match the renewal it names.');
    });

    it('refuses a voided order', () => {
        expect(RenewalPaymentRefusal({ ...open, Status: 'Voided' }, SUB, false)).toBe('This renewal can no longer be paid here.');
    });

    it('refuses once the order is paid', () => {
        expect(RenewalPaymentRefusal({ ...open, Balance: 0 }, SUB, false)).toBe('This renewal is already paid.');
    });

    it('refuses once a session has paid it through the link', () => {
        expect(RenewalPaymentRefusal(open, SUB, true)).toBe('This renewal has already been paid through this link.');
    });

    it('refuses a subscription that was cancelled or no longer renews automatically (#683)', () => {
        const refused = 'This subscription is no longer set to renew, so this renewal cannot be paid here. Contact us to renew.';
        for (const sub of [
            { ID: SUB, Status: 'Canceled', AutoRenew: true },
            { ID: SUB, Status: 'Paused', AutoRenew: true },
            { ID: SUB, Status: 'Active', AutoRenew: false },
        ]) {
            expect(RenewalPaymentRefusal({ ...open, Subscriptions: [sub] }, SUB, false)).toBe(refused);
        }
        expect(RenewalPaymentRefusal({ ...open, Subscriptions: [] }, SUB, false)).toBe(refused);
    });
});

describe('RenewalPayer and PayerOwnsRenewalCustomer — who pays through the link (#683)', () => {
    const order = { BillToPersonID: 'beneficiary', BillToOrganizationID: 'org-1', RenewalCardOwnerPersonID: null as string | null, RenewalCardOwnerOrganizationID: null as string | null };

    it('is the person who owns the renewal card: on a gift, the buyer, not the beneficiary', () => {
        expect(RenewalPayer({ ...order, RenewalCardOwnerPersonID: 'buyer' })).toEqual({ PersonID: 'buyer', OrganizationID: null });
    });

    it('falls back to the order bill-to when no person owns the card', () => {
        expect(RenewalPayer(order)).toEqual({ PersonID: 'beneficiary', OrganizationID: null });
        expect(RenewalPayer({ ...order, BillToPersonID: null })).toEqual({ PersonID: null, OrganizationID: 'org-1' });
    });

    it('reuses the old customer only when it is the payer\'s', () => {
        expect(PayerOwnsRenewalCustomer({ RenewalCardOwnerPersonID: 'buyer', RenewalCardOwnerOrganizationID: null, PayerPersonID: 'BUYER', PayerOrganizationID: null })).toBe(true);
        expect(PayerOwnsRenewalCustomer({ RenewalCardOwnerPersonID: 'buyer', RenewalCardOwnerOrganizationID: null, PayerPersonID: 'other', PayerOrganizationID: null })).toBe(false);
        expect(PayerOwnsRenewalCustomer({ RenewalCardOwnerPersonID: null, RenewalCardOwnerOrganizationID: 'org-1', PayerPersonID: 'beneficiary', PayerOrganizationID: null })).toBe(false);
        expect(PayerOwnsRenewalCustomer({ RenewalCardOwnerPersonID: null, RenewalCardOwnerOrganizationID: 'org-1', PayerPersonID: null, PayerOrganizationID: 'org-1' })).toBe(true);
    });

    it('tells the buyer only that a link is invalid, unless it expired', () => {
        expect(RenewalPaymentTokenMessage('signature')).toBe(RenewalPaymentTokenMessage('malformed'));
        expect(RenewalPaymentTokenMessage('expired')).toContain('expired');
    });
});
