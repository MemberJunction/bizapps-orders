/**
 * The post-payment account step as the public checkout shows it (#292).
 */
import { describe, expect, it } from 'vitest';
import { AccountMessage, CheckPasswordEntry, MayRedirect, ReadCheckoutAccount } from '../lib/checkout-widget/checkout-account';

describe('ReadCheckoutAccount', () => {
    it('reads no account when the response carries none, so the checkout behaves as before', () => {
        expect(ReadCheckoutAccount(undefined)).toBeNull();
        expect(ReadCheckoutAccount(null)).toBeNull();
        expect(ReadCheckoutAccount({ Outcome: 'Unknown' })).toBeNull();
    });

    it('reads the outcome, the message and whether a password can be set', () => {
        expect(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true })).toEqual({
            Outcome: 'Created',
            Message: undefined,
            CanSetPassword: true,
        });
        expect(ReadCheckoutAccount({ Outcome: 'Exists', Message: 'Sign in.', CanSetPassword: 'yes' })).toEqual({
            Outcome: 'Exists',
            Message: 'Sign in.',
            CanSetPassword: false,
        });
    });
});

describe('AccountMessage', () => {
    it('confirms a password that was set', () => {
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false }, true)).toContain('password is set');
    });

    it('prefers the host message', () => {
        expect(AccountMessage({ Outcome: 'Exists', Message: 'Sign in at the site.', CanSetPassword: false }, false)).toBe('Sign in at the site.');
    });

    it('tells a buyer with an existing account to sign in', () => {
        expect(AccountMessage({ Outcome: 'Exists', CanSetPassword: false }, false)).toContain('already have an account');
    });

    it('explains a failure without blaming the purchase', () => {
        expect(AccountMessage({ Outcome: 'Failed', CanSetPassword: false }, false)).toContain('could not set up your account');
    });
});

describe('CheckPasswordEntry', () => {
    it('needs a password, entered the same way twice', () => {
        expect(CheckPasswordEntry('', '')).toBe('Please enter a password.');
        expect(CheckPasswordEntry('abc', 'abd')).toBe('The two passwords do not match.');
        expect(CheckPasswordEntry('abc', 'abc')).toBeNull();
    });
});

describe('MayRedirect', () => {
    it('holds the redirect only while a password can still be set', () => {
        expect(MayRedirect(null)).toBe(true);
        expect(MayRedirect({ Outcome: 'Created', CanSetPassword: true })).toBe(false);
        expect(MayRedirect({ Outcome: 'Created', CanSetPassword: false })).toBe(true);
        expect(MayRedirect({ Outcome: 'Exists', CanSetPassword: false })).toBe(true);
    });
});
