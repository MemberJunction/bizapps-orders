/**
 * @fileoverview The account step a self-serve checkout can run after payment (#292).
 *
 * Some hosts need the buyer to leave checkout with a working login on the host's own identity
 * provider. Orders does not know that provider, so it offers a seam: a `CheckoutAccountStep`
 * subclass registered through the ClassFactory. Once `/complete` has confirmed the order, the widget
 * asks for the account step through `/checkout/account`, and the host is asked to ensure an account
 * for the buyer. It answers one of:
 *   - `Created` — a new account; the buyer may set its password in the widget, once. The account
 *     must not sign in until the host has verified the buyer's e-mail (see the class doc).
 *   - `Exists`  — an account was already there; it is never touched, and the buyer is told to sign in.
 *   - `Failed`  — the host could not answer; the buyer is shown the host's message.
 *   - `NotApplicable` — this checkout is not one the host makes accounts for (another company's
 *     widget, say); the session has no account step, exactly as if no host were registered.
 *
 * With nothing registered the ClassFactory returns this base class itself, which means the step is
 * off: the checkout behaves exactly as it did before the step existed.
 *
 * The outcome is kept in the session's MetadataJSON, so a later call (the buyer reloading the page,
 * or retrying after `Failed`) gets the same answer, and the password
 * call is only honoured for a session whose account this checkout created. The password itself is
 * handed straight to the host and never stored or logged.
 */
import { CompositeKey, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { mjBizAppsOrdersCheckoutSessionEntity } from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/** How many times a buyer may try a password the host refuses before the step closes. */
export const MAX_CHECKOUT_PASSWORD_ATTEMPTS = 5;
/** Longest password passed to the host. The host's own policy decides what is acceptable. */
export const MAX_CHECKOUT_PASSWORD_LENGTH = 256;
/** Default minutes after the account is created during which the buyer may set its password here. */
export const DEFAULT_CHECKOUT_PASSWORD_WINDOW_MINUTES = 5;
/** Default seconds Orders waits for the host before treating a call as unanswered. */
export const DEFAULT_CHECKOUT_ACCOUNT_HOST_TIMEOUT_SECONDS = 10;

/** What the buyer can be shown. */
export type CheckoutAccountOutcome = 'Created' | 'Exists' | 'Failed';
/** What a host can answer: a buyer-facing outcome, or that the step does not apply to this checkout. */
export type CheckoutAccountHostOutcome = CheckoutAccountOutcome | 'NotApplicable';

/** Everything the host is told about the buyer. */
export interface CheckoutAccountContext {
    /** The buyer's e-mail as the checkout captured it. */
    Email: string;
    FirstName: string | null;
    LastName: string | null;
    /** The payer Person the checkout resolved or created. */
    PersonID: string | null;
    /** The confirmed order. */
    OrderID: string;
    /** The selling company of the checkout widget. */
    CompanyID: string | null;
    SessionID: string;
    /** When the checkout session began: a host can use it to tell an account made by this checkout from an older one. */
    SessionCreatedAt: Date | null;
    ContextUser?: UserInfo;
}

/** The host's answer to {@link CheckoutAccountStep.EnsureAccount}. */
export interface CheckoutAccountResult {
    Outcome: CheckoutAccountHostOutcome;
    /** Shown to the buyer. Worded for the buyer, never containing secrets. */
    Message?: string;
    /**
     * With `Created`: the host has sent, or will send, a verification e-mail, and the widget tells
     * the buyer to use it before signing in.
     */
    VerificationRequired?: boolean;
}

/** The host's answer to {@link CheckoutAccountStep.SetPassword}. */
export interface CheckoutPasswordResult {
    Success: boolean;
    /** Shown to the buyer when the password was refused, e.g. the host's password policy. */
    Message?: string;
}

/**
 * The host seam. Register a subclass with `@RegisterClass(CheckoutAccountStep)` and reference its
 * class from the server bootstrap so the decorator is not tree-shaken away. The highest-priority
 * registration wins.
 *
 * `SetPassword` is only called for a session whose `EnsureAccount` answered `Created`, within
 * `PasswordWindowMinutes` of that answer. Orders cannot see the identity provider, and the checkout
 * never proves the buyer owns the e-mail, so these rules are the host's to hold:
 *   - Never change an account the checkout did not create for this purchase, in either method.
 *   - An account answered `Created` must not sign in until the host has verified the buyer's e-mail,
 *     for example with a link sent to it. Anyone can check out with someone else's e-mail and set
 *     the password here; verification is what keeps that from becoming a working login.
 *   - Until the e-mail is verified, do not link the new login to `PersonID`. That Person was
 *     matched by e-mail alone, and may be an existing member with orders and memberships.
 *   - When `EnsureAccount` finds an account it created earlier for the same `SessionID`, answer
 *     `Created`, not `Exists`. A call Orders gave up on (`HostTimeoutSeconds`) is recorded as
 *     `Failed` and asked again, and the host may have finished creating the account meanwhile.
 */
export class CheckoutAccountStep {
    /**
     * How long after `Created` the buyer may set the password in the widget. After it, the buyer
     * signs in or resets the password through the host instead.
     */
    public get PasswordWindowMinutes(): number {
        return DEFAULT_CHECKOUT_PASSWORD_WINDOW_MINUTES;
    }

    /**
     * How long Orders waits for `EnsureAccount` or `SetPassword`. An `EnsureAccount` that runs over
     * is recorded as `Failed`; a `SetPassword` that runs over closes the password form, since the
     * password may have been set.
     */
    public get HostTimeoutSeconds(): number {
        return DEFAULT_CHECKOUT_ACCOUNT_HOST_TIMEOUT_SECONDS;
    }

    public async EnsureAccount(_context: CheckoutAccountContext): Promise<CheckoutAccountResult> {
        return { Outcome: 'Failed' };
    }

    public async SetPassword(_context: CheckoutAccountContext & { Password: string }): Promise<CheckoutPasswordResult> {
        return { Success: false };
    }
}

/** The registered host step, or null when none is registered and the step is off. */
export function ResolveCheckoutAccountStep(): CheckoutAccountStep | null {
    const step = MJGlobal.Instance.ClassFactory.CreateInstance<CheckoutAccountStep>(CheckoutAccountStep);
    if (!step || Object.getPrototypeOf(step) === CheckoutAccountStep.prototype) {
        return null;
    }
    return step;
}

/** True when a host registered an account step, so the widget should ask for it after `/complete`. */
export function HasCheckoutAccountStep(): boolean {
    return ResolveCheckoutAccountStep() !== null;
}

/** What the session remembers about its account step. */
interface StoredAccountState {
    Outcome: CheckoutAccountHostOutcome;
    Message?: string;
    DecidedAt: string;
    VerificationRequired?: boolean;
    PasswordSet?: boolean;
    PasswordAttempts?: number;
    /**
     * Set before the password is passed to the host, cleared once its answer is recorded. While it is
     * set no other password is accepted, so a lost answer can never let a second one through.
     */
    PasswordPendingSince?: string;
}

/** The account step as the widget receives it. */
export interface CheckoutAccountStatus {
    Outcome: CheckoutAccountOutcome;
    Message?: string;
    /** True while the buyer may still set a password: the outcome was `Created` and none is set yet. */
    CanSetPassword: boolean;
    /** True when the host will e-mail the buyer a link to verify the account before it signs in. */
    VerificationRequired: boolean;
}

export interface CheckoutAccountResponse {
    Success: boolean;
    ErrorMessage?: string;
    /** Absent when no host step is registered — the checkout has no account step. */
    Account?: CheckoutAccountStatus;
}

const GENERIC_FAILURE = 'We could not set up your account just now. Your order is confirmed. Please try again in a moment.';

/** Calls on the same session run one at a time in this process, so a retry cannot overlap a call still in progress. */
const sessionQueues = new Map<string, Promise<unknown>>();

async function oneAtATime<T>(sessionID: string, work: () => Promise<T>): Promise<T> {
    const key = sessionID.toLowerCase();
    const previous = sessionQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    sessionQueues.set(key, current);
    try {
        return await current;
    } finally {
        if (sessionQueues.get(key) === current) sessionQueues.delete(key);
    }
}

const TIMED_OUT = Symbol('timed out');

/** The host's answer, or {@link TIMED_OUT} when it does not answer within the step's timeout. */
async function withHostTimeout<T>(step: CheckoutAccountStep, call: () => Promise<T>): Promise<T | typeof TIMED_OUT> {
    const seconds = step.HostTimeoutSeconds;
    const ms = (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_CHECKOUT_ACCOUNT_HOST_TIMEOUT_SECONDS) * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            call(),
            new Promise<typeof TIMED_OUT>((resolve) => {
                timer = setTimeout(() => resolve(TIMED_OUT), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function keyMatches(session: mjBizAppsOrdersCheckoutSessionEntity, presentedKey: string | null | undefined): boolean {
    const stored = session.ClientSessionKey ?? '';
    const presented = (presentedKey ?? '').trim();
    if (!stored || !presented || stored.length !== presented.length) return false;
    let diff = 0;
    for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ presented.charCodeAt(i);
    return diff === 0;
}

function readMetadata(session: mjBizAppsOrdersCheckoutSessionEntity): Record<string, unknown> {
    if (!session.MetadataJSON) return {};
    try {
        const parsed = JSON.parse(session.MetadataJSON) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function readAccountState(session: mjBizAppsOrdersCheckoutSessionEntity): StoredAccountState | null {
    const account = readMetadata(session)['Account'] as StoredAccountState | undefined;
    return account && typeof account === 'object' && typeof account.Outcome === 'string' ? account : null;
}

async function saveAccountState(session: mjBizAppsOrdersCheckoutSessionEntity, state: StoredAccountState): Promise<boolean> {
    session.MetadataJSON = JSON.stringify({ ...readMetadata(session), Account: state });
    if (!(await session.Save())) {
        LogError(`[CheckoutAccountStep] could not record the account step on session ${session.ID}: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return false;
    }
    return true;
}

/** True while `now` is inside the step's password window, counted from when the outcome was decided. */
function withinPasswordWindow(state: StoredAccountState, step: CheckoutAccountStep, now: Date = new Date()): boolean {
    const decided = Date.parse(state.DecidedAt);
    const minutes = step.PasswordWindowMinutes;
    if (!Number.isFinite(decided) || !Number.isFinite(minutes) || minutes <= 0) return false;
    return now.getTime() <= decided + minutes * 60 * 1000;
}

function toStatus(state: StoredAccountState & { Outcome: CheckoutAccountOutcome }, step: CheckoutAccountStep): CheckoutAccountStatus {
    return {
        Outcome: state.Outcome,
        Message: state.Message,
        CanSetPassword:
            state.Outcome === 'Created' &&
            !state.PasswordSet &&
            !state.PasswordPendingSince &&
            (state.PasswordAttempts ?? 0) < MAX_CHECKOUT_PASSWORD_ATTEMPTS &&
            withinPasswordWindow(state, step),
        VerificationRequired: state.Outcome === 'Created' && state.VerificationRequired === true,
    };
}

/** The recorded state, unless the step does not apply to this session. */
function buyerFacing(state: StoredAccountState | null): (StoredAccountState & { Outcome: CheckoutAccountOutcome }) | null {
    return state && state.Outcome !== 'NotApplicable' ? (state as StoredAccountState & { Outcome: CheckoutAccountOutcome }) : null;
}

/** The session, when the key matches and the checkout has confirmed its order; otherwise the refusal. */
async function loadConfirmedSession(
    sessionID: string,
    clientSessionKey: string,
    contextUser?: UserInfo
): Promise<{ Session: mjBizAppsOrdersCheckoutSessionEntity } | { Refusal: CheckoutAccountResponse }> {
    try {
        RequireUUID(sessionID, 'sessionId');
    } catch {
        return { Refusal: { Success: false, ErrorMessage: 'Checkout session not found' } };
    }
    const md = new Metadata();
    const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
    if (!(await session.Load(sessionID))) {
        return { Refusal: { Success: false, ErrorMessage: 'Checkout session not found' } };
    }
    if (!keyMatches(session, clientSessionKey)) {
        return { Refusal: { Success: false, ErrorMessage: 'Checkout session key does not match' } };
    }
    if (session.Status !== 'Confirmed' || !session.DraftOrderID) {
        return { Refusal: { Success: false, ErrorMessage: 'This checkout has not completed yet.' } };
    }
    return { Session: session };
}

async function buildContext(session: mjBizAppsOrdersCheckoutSessionEntity, contextUser?: UserInfo): Promise<CheckoutAccountContext> {
    const md = new Metadata();
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (session.PersonID) {
        const person = await md.GetEntityObject(PERSON_ENTITY, contextUser);
        if (await person.InnerLoad(CompositeKey.FromID(session.PersonID))) {
            firstName = (person.Get('FirstName') as string | null) ?? null;
            lastName = (person.Get('LastName') as string | null) ?? null;
        }
    }
    let companyID: string | null = null;
    const widget = await md.GetEntityObject(CHECKOUT_WIDGET_ENTITY, contextUser);
    if (session.CheckoutWidgetID && (await widget.InnerLoad(CompositeKey.FromID(session.CheckoutWidgetID)))) {
        companyID = (widget.Get('CompanyID') as string | null) ?? null;
    }
    return {
        Email: session.Email ?? '',
        FirstName: firstName,
        LastName: lastName,
        PersonID: session.PersonID ?? null,
        OrderID: session.DraftOrderID as string,
        CompanyID: companyID,
        SessionID: session.ID,
        SessionCreatedAt: session.__mj_CreatedAt ? new Date(session.__mj_CreatedAt) : null,
        ContextUser: contextUser,
    };
}

/**
 * Run the account step for a confirmed checkout, or return the outcome it already reached.
 *
 * `Created`, `Exists` and `NotApplicable` are final: asking again returns the recorded answer rather
 * than asking the host, which would now find the account this checkout created and call it
 * existing. Only `Failed` is asked again. `NotApplicable` is answered as if no step were registered.
 * A host step that throws, or does not answer within `HostTimeoutSeconds`, is recorded as `Failed`;
 * it never affects the paid order.
 */
export async function EnsureCheckoutAccount(
    sessionID: string,
    clientSessionKey: string,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const step = ResolveCheckoutAccountStep();
    if (!step) return { Success: true };
    return oneAtATime(sessionID, () => ensureAccount(step, sessionID, clientSessionKey, contextUser));
}

async function ensureAccount(
    step: CheckoutAccountStep,
    sessionID: string,
    clientSessionKey: string,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const loaded = await loadConfirmedSession(sessionID, clientSessionKey, contextUser);
    if ('Refusal' in loaded) return loaded.Refusal;
    const session = loaded.Session;

    const existing = readAccountState(session);
    if (existing?.Outcome === 'NotApplicable') return { Success: true };
    const shown = buyerFacing(existing);
    if (shown && shown.Outcome !== 'Failed') {
        return { Success: true, Account: toStatus(shown, step) };
    }

    const context = await buildContext(session, contextUser);
    let result: CheckoutAccountResult;
    if (!context.Email) {
        result = { Outcome: 'Failed', Message: GENERIC_FAILURE };
    } else {
        try {
            const answer = await withHostTimeout(step, () => step.EnsureAccount(context));
            if (answer === TIMED_OUT) {
                LogError(`[CheckoutAccountStep] ${step.constructor.name}.EnsureAccount did not answer within ${step.HostTimeoutSeconds}s for session ${session.ID}`);
                result = { Outcome: 'Failed' };
            } else {
                result = answer;
            }
        } catch (err) {
            LogError(`[CheckoutAccountStep] ${step.constructor.name}.EnsureAccount threw for session ${session.ID}: ${err instanceof Error ? err.message : String(err)}`);
            result = { Outcome: 'Failed' };
        }
    }
    const outcome: CheckoutAccountHostOutcome = ['Created', 'Exists', 'Failed', 'NotApplicable'].includes(result?.Outcome)
        ? result.Outcome
        : 'Failed';
    if (outcome === 'NotApplicable') {
        await saveAccountState(session, { Outcome: outcome, DecidedAt: new Date().toISOString() });
        return { Success: true };
    }
    const state: StoredAccountState & { Outcome: CheckoutAccountOutcome } = {
        Outcome: outcome,
        Message: result?.Message ?? (outcome === 'Failed' ? GENERIC_FAILURE : undefined),
        DecidedAt: new Date().toISOString(),
        VerificationRequired: outcome === 'Created' && result?.VerificationRequired === true,
        PasswordSet: false,
        PasswordAttempts: 0,
    };
    await saveAccountState(session, state);
    return { Success: true, Account: toStatus(state, step) };
}

/**
 * Set the password of the account this checkout created.
 *
 * Refused unless the session's recorded outcome is `Created`, no password has been set or is being
 * set, the buyer has attempts left, and the step's password window has not closed. A refusal by the
 * host (its password policy) counts as an attempt.
 *
 * The attempt is recorded before the password is passed on, and a refusal is returned if that
 * cannot be saved. So once the host may have set a password, no second one is accepted, even when
 * its answer is lost or cannot be recorded.
 */
export async function SetCheckoutAccountPassword(
    sessionID: string,
    clientSessionKey: string,
    password: unknown,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const step = ResolveCheckoutAccountStep();
    if (!step) return { Success: false, ErrorMessage: 'This checkout does not create accounts.' };
    return oneAtATime(sessionID, () => setPassword(step, sessionID, clientSessionKey, password, contextUser));
}

const PASSWORD_MAY_BE_SET =
    'We could not confirm your password was set. Sign in with the e-mail you used, or reset your password if that does not work.';

async function setPassword(
    step: CheckoutAccountStep,
    sessionID: string,
    clientSessionKey: string,
    password: unknown,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const loaded = await loadConfirmedSession(sessionID, clientSessionKey, contextUser);
    if ('Refusal' in loaded) return loaded.Refusal;
    const session = loaded.Session;

    const state = buyerFacing(readAccountState(session));
    if (!state || !toStatus(state, step).CanSetPassword) {
        const open = state?.Outcome === 'Created' && !state.PasswordSet;
        const errorMessage =
            open && state.PasswordPendingSince
                ? PASSWORD_MAY_BE_SET
                : open && !withinPasswordWindow(state, step)
                  ? 'The time to set a password here has passed. Reset your password with the e-mail you used to sign in.'
                  : 'A password cannot be set here. Sign in, or reset your password, with the e-mail you used.';
        return { Success: false, ErrorMessage: errorMessage, Account: state ? toStatus(state, step) : undefined };
    }
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_CHECKOUT_PASSWORD_LENGTH) {
        return { Success: false, ErrorMessage: 'Please enter a password.', Account: toStatus(state, step) };
    }

    const pending: StoredAccountState & { Outcome: CheckoutAccountOutcome } = {
        ...state,
        PasswordAttempts: (state.PasswordAttempts ?? 0) + 1,
        PasswordPendingSince: new Date().toISOString(),
    };
    if (!(await saveAccountState(session, pending))) {
        return { Success: false, ErrorMessage: 'That password could not be set right now. Please try again.', Account: toStatus(state, step) };
    }

    let result: CheckoutPasswordResult;
    try {
        const context = await buildContext(session, contextUser);
        const answer = await withHostTimeout(step, () => step.SetPassword({ ...context, Password: password }));
        if (answer === TIMED_OUT) {
            // The host may still set it, so the attempt stays pending and the form closes.
            LogError(`[CheckoutAccountStep] ${step.constructor.name}.SetPassword did not answer within ${step.HostTimeoutSeconds}s for session ${session.ID}`);
            return { Success: false, ErrorMessage: PASSWORD_MAY_BE_SET, Account: toStatus(pending, step) };
        }
        result = answer;
    } catch (err) {
        LogError(`[CheckoutAccountStep] ${step.constructor.name}.SetPassword threw for session ${session.ID}: ${err instanceof Error ? err.message : String(err)}`);
        result = { Success: false };
    }

    const { PasswordPendingSince: _answered, ...rest } = pending;
    const next: StoredAccountState & { Outcome: CheckoutAccountOutcome } = { ...rest, PasswordSet: result?.Success === true };
    // A save that fails here leaves the attempt pending, which keeps the form closed.
    await saveAccountState(session, next);
    return result?.Success === true
        ? { Success: true, Account: toStatus(next, step) }
        : {
              Success: false,
              ErrorMessage: result?.Message ?? 'That password could not be set. Please try another.',
              Account: toStatus(next, step),
          };
}
