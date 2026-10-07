/**
 * The post-payment account step as the public checkout shows it (#292). Pure, so it can be tested
 * without the host component.
 *
 * `/complete` answers with `AccountStep: true` when a host registered an account step; the widget
 * then asks `/checkout/account` for it. `Created` with `CanSetPassword` shows a password form;
 * `Exists` and `Failed` show a message, and `Failed` offers to try again. No `Account` means no
 * step, and the checkout behaves as it always has.
 */

export type CheckoutAccountOutcome = 'Created' | 'Exists' | 'Failed';

export interface CheckoutAccountView {
    Outcome: CheckoutAccountOutcome;
    Message?: string;
    CanSetPassword: boolean;
    /**
     * The buyer must verify the e-mail before the account signs in. True for every `Created`
     * account: the `CheckoutAccountStep` contract keeps a created account unable to sign in until
     * the host has verified the e-mail (#395).
     */
    VerificationRequired?: boolean;
}

/** Shown when the account step could not be reached or did not answer. */
export const ACCOUNT_STEP_FAILED: CheckoutAccountView = { Outcome: 'Failed', CanSetPassword: false };

/** The account the server reported, or null when the response carries none (no step registered). */
export function ReadCheckoutAccount(raw: unknown): CheckoutAccountView | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    if (a['Outcome'] !== 'Created' && a['Outcome'] !== 'Exists' && a['Outcome'] !== 'Failed') return null;
    return {
        Outcome: a['Outcome'],
        Message: typeof a['Message'] === 'string' && a['Message'] ? a['Message'] : undefined,
        CanSetPassword: a['CanSetPassword'] === true,
        VerificationRequired: a['Outcome'] === 'Created',
    };
}

const VERIFY_NOTE = 'We are sending a link to your e-mail. Use it to verify your account before you sign in.';

/** The note shown with the password form of a created account. */
export function VerificationNote(account: CheckoutAccountView | null): string | null {
    return account?.VerificationRequired ? VERIFY_NOTE : null;
}

/** The line shown under the confirmation when no password form is showing. */
export function AccountMessage(account: CheckoutAccountView, passwordSet: boolean): string | null {
    if (passwordSet) {
        return 'Your password is set. Check your e-mail for the link to verify your account, then sign in with the e-mail you used here.';
    }
    if (account.Message) return account.Message;
    if (account.Outcome === 'Exists') return 'You already have an account with this e-mail. Sign in, or reset your password if you have forgotten it.';
    if (account.Outcome === 'Failed') return 'We could not set up your account just now. Your order is confirmed. Please try again in a moment.';
    return VerificationNote(account);
}

/** Why the two entries cannot be sent, or null when they can. The host's own policy is checked by the server. */
export function CheckPasswordEntry(password: string, confirmation: string): string | null {
    if (!password) return 'Please enter a password.';
    if (password !== confirmation) return 'The two passwords do not match.';
    return null;
}

/**
 * Whether the checkout may leave for its redirect: not while the buyer can still set a password or
 * try a failed step again, unless the buyer chose to leave it.
 */
export function MayRedirect(account: CheckoutAccountView | null, dismissed = false): boolean {
    if (dismissed || !account) return true;
    return !account.CanSetPassword && account.Outcome !== 'Failed';
}

/** True once nothing about the account step is left to do, so a reload need not come back to it. */
export function IsAccountSettled(account: CheckoutAccountView | null): boolean {
    return !account || (account.Outcome !== 'Failed' && !account.CanSetPassword);
}
