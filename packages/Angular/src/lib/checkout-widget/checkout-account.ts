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
    /** True for every `Created` account, which gets the verification note. */
    VerificationRequired?: boolean;
    /** The host's verification note: absent for the default, `null` for none. */
    VerificationNote?: string | null;
    /** The host's wording once the password is set; absent for the default. */
    PasswordSetMessage?: string;
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
        ...(a['Outcome'] === 'Created' ? readHostWording(a) : {}),
    };
}

function readHostWording(a: Record<string, unknown>): Pick<CheckoutAccountView, 'VerificationNote' | 'PasswordSetMessage'> {
    const wording: Pick<CheckoutAccountView, 'VerificationNote' | 'PasswordSetMessage'> = {};
    const note = a['VerificationNote'];
    if (note === null || typeof note === 'string') wording.VerificationNote = note?.trim() ? note : null;
    const passwordSet = a['PasswordSetMessage'];
    if (typeof passwordSet === 'string' && passwordSet.trim()) wording.PasswordSetMessage = passwordSet;
    return wording;
}

const VERIFY_NOTE = 'We are sending a link to your e-mail. Use it to verify your account before you sign in.';
const PASSWORD_SET_MESSAGE =
    'Your password is set. Check your e-mail for the link to verify your account, then sign in with the e-mail you used here.';

/** The note shown with the password form of a created account: the host's, or the default. */
export function VerificationNote(account: CheckoutAccountView | null): string | null {
    if (!account?.VerificationRequired) return null;
    return account.VerificationNote === undefined ? VERIFY_NOTE : account.VerificationNote;
}

/** The line shown under the confirmation when no password form is showing. */
export function AccountMessage(account: CheckoutAccountView, passwordSet: boolean): string | null {
    if (passwordSet) return account.PasswordSetMessage ?? PASSWORD_SET_MESSAGE;
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

/** The confirmed order and the widget's post-sale settings, as `/account` returns them (#858). */
export interface CheckoutConfirmationView {
    OrderNumber: string | null;
    RedirectUrl: string | null;
    SuccessMessage: string | null;
}

/** Reads `/account`'s `Confirmation`; null when absent or not an object. */
export function ReadCheckoutConfirmation(raw: unknown): CheckoutConfirmationView | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
    return { OrderNumber: text(c['OrderNumber']), RedirectUrl: text(c['RedirectUrl']), SuccessMessage: text(c['SuccessMessage']) };
}

/** The success screen's message: the widget's own, else one naming the order when its number is known. */
export function ConfirmationMessage(successMessage: string | null | undefined, orderNumber: string | null): string {
    return successMessage || (orderNumber ? `Thank you. Order ${orderNumber} is confirmed.` : 'Thank you. Your order is confirmed.');
}
