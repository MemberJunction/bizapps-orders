/**
 * The post-payment account step as the public checkout shows it (#292). Pure, so it can be tested
 * without the host component.
 *
 * The server answers `/complete` with an `Account` only when a host registered an account step.
 * `Created` with `CanSetPassword` shows a password form; `Exists` and `Failed` show a message. No
 * `Account` means no step, and the checkout behaves as it always has.
 */

export type CheckoutAccountOutcome = 'Created' | 'Exists' | 'Failed';

export interface CheckoutAccountView {
    Outcome: CheckoutAccountOutcome;
    Message?: string;
    CanSetPassword: boolean;
}

/** The account the server reported, or null when the response carries none (no step registered). */
export function ReadCheckoutAccount(raw: unknown): CheckoutAccountView | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    if (a['Outcome'] !== 'Created' && a['Outcome'] !== 'Exists' && a['Outcome'] !== 'Failed') return null;
    return {
        Outcome: a['Outcome'],
        Message: typeof a['Message'] === 'string' && a['Message'] ? a['Message'] : undefined,
        CanSetPassword: a['CanSetPassword'] === true,
    };
}

/** The line shown under the confirmation when no password form is showing. */
export function AccountMessage(account: CheckoutAccountView, passwordSet: boolean): string | null {
    if (passwordSet) return 'Your password is set. You can now sign in with the e-mail you used here.';
    if (account.Message) return account.Message;
    if (account.Outcome === 'Exists') return 'You already have an account with this e-mail. Sign in, or reset your password if you have forgotten it.';
    if (account.Outcome === 'Failed') return 'We could not set up your account right now. You can sign in or reset your password later with the e-mail you used here.';
    return null;
}

/** Why the two entries cannot be sent, or null when they can. The host's own policy is checked by the server. */
export function CheckPasswordEntry(password: string, confirmation: string): string | null {
    if (!password) return 'Please enter a password.';
    if (password !== confirmation) return 'The two passwords do not match.';
    return null;
}

/** Whether the checkout may leave for its redirect: not while the buyer can still set a password. */
export function MayRedirect(account: CheckoutAccountView | null): boolean {
    return !account?.CanSetPassword;
}
