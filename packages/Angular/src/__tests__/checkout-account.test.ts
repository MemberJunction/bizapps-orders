/**
 * The post-payment account step as the public checkout shows it (#292).
 */
import { describe, expect, it } from 'vitest';
import {
    AccountMessage,
    CheckPasswordEntry,
    IsAccountSettled,
    MayRedirect,
    ReadCheckoutAccount,
    VerificationNote,
} from '../lib/checkout-widget/checkout-account';

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
            VerificationRequired: true,
        });
        expect(ReadCheckoutAccount({ Outcome: 'Exists', Message: 'Sign in.', CanSetPassword: 'yes' })).toEqual({
            Outcome: 'Exists',
            Message: 'Sign in.',
            CanSetPassword: false,
            VerificationRequired: false,
        });
    });

    it('requires verification for every created account, whatever the flag says, and for no other', () => {
        expect(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true, VerificationRequired: true })?.VerificationRequired).toBe(true);
        expect(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true })?.VerificationRequired).toBe(true);
        expect(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true, VerificationRequired: false })?.VerificationRequired).toBe(true);
        expect(ReadCheckoutAccount({ Outcome: 'Exists', VerificationRequired: true })?.VerificationRequired).toBe(false);
    });
});

describe('AccountMessage', () => {
    it('confirms a password that was set', () => {
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false }, true)).toContain('password is set');
    });

    it('never tells the buyer to sign in before verifying, for a Created answer without the flag (#395)', () => {
        const msg = AccountMessage(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true })!, true);
        expect(msg).toContain('verify your account');
        expect(msg).not.toContain('You can now sign in');
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false }, true)).toContain('verify your account');
    });

    it('prefers the host message', () => {
        expect(AccountMessage({ Outcome: 'Exists', Message: 'Sign in at the site.', CanSetPassword: false }, false)).toBe('Sign in at the site.');
    });

    it('tells a buyer with an existing account to sign in', () => {
        expect(AccountMessage({ Outcome: 'Exists', CanSetPassword: false }, false)).toContain('already have an account');
    });

    it('explains a failure without blaming the purchase, and promises no reset', () => {
        const msg = AccountMessage({ Outcome: 'Failed', CanSetPassword: false }, false);
        expect(msg).toContain('could not set up your account');
        expect(msg).toContain('order is confirmed');
        expect(msg).not.toContain('reset');
    });

    it('tells a buyer whose account needs verifying to use the e-mailed link', () => {
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false, VerificationRequired: true }, true)).toContain('verify your account');
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false, VerificationRequired: true }, false)).toContain('verify your account');
        expect(AccountMessage({ Outcome: 'Created', CanSetPassword: false }, false)).toBeNull();
    });
});

describe('VerificationNote', () => {
    it('is shown for a created account', () => {
        expect(VerificationNote({ Outcome: 'Created', CanSetPassword: true, VerificationRequired: true })).toContain('link to your e-mail');
        expect(VerificationNote(ReadCheckoutAccount({ Outcome: 'Created', CanSetPassword: true }))).toContain('link to your e-mail');
        expect(VerificationNote(ReadCheckoutAccount({ Outcome: 'Exists', CanSetPassword: false }))).toBeNull();
        expect(VerificationNote(null)).toBeNull();
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

    it('holds the redirect after a failure so the buyer can try again, until the buyer leaves it', () => {
        expect(MayRedirect({ Outcome: 'Failed', CanSetPassword: false })).toBe(false);
        expect(MayRedirect({ Outcome: 'Failed', CanSetPassword: false }, true)).toBe(true);
    });
});

describe('IsAccountSettled', () => {
    it('is settled once nothing is left to do: no step, an existing account, or a password set or skipped', () => {
        expect(IsAccountSettled(null)).toBe(true);
        expect(IsAccountSettled({ Outcome: 'Exists', CanSetPassword: false })).toBe(true);
        expect(IsAccountSettled({ Outcome: 'Created', CanSetPassword: false })).toBe(true);
    });

    it('is not settled while a password can be set or the step failed', () => {
        expect(IsAccountSettled({ Outcome: 'Created', CanSetPassword: true })).toBe(false);
        expect(IsAccountSettled({ Outcome: 'Failed', CanSetPassword: false })).toBe(false);
    });
});
