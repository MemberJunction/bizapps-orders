/**
 * @fileoverview The account step a self-serve checkout can run after payment (#292).
 *
 * Some hosts need the buyer to leave checkout with a working login on the host's own identity
 * provider. Orders does not know that provider, so it offers a seam: a `CheckoutAccountStep`
 * subclass registered through the ClassFactory. After the order is confirmed, the host is asked to
 * ensure an account for the buyer, and answers one of:
 *   - `Created` — a new account; the buyer may set its password in the widget, once.
 *   - `Exists`  — an account was already there; it is never touched, and the buyer is told to sign in.
 *   - `Failed`  — the host could not answer; the buyer is shown the host's message.
 *
 * With nothing registered the ClassFactory returns this base class itself, which means the step is
 * off: the checkout behaves exactly as it did before the step existed.
 *
 * The outcome is kept in the session's MetadataJSON, so a later call (the buyer returning after a
 * webhook confirmed the order, or retrying after `Failed`) gets the same answer, and the password
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

export type CheckoutAccountOutcome = 'Created' | 'Exists' | 'Failed';

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
    Outcome: CheckoutAccountOutcome;
    /** Shown to the buyer. Worded for the buyer, never containing secrets. */
    Message?: string;
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
 * `SetPassword` is only called for a session whose `EnsureAccount` answered `Created`. A host must
 * still refuse to set a password on an account it did not create for this purchase: Orders cannot
 * see the identity provider, so that rule is the host's to hold.
 */
export class CheckoutAccountStep {
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

/** What the session remembers about its account step. */
interface StoredAccountState {
    Outcome: CheckoutAccountOutcome;
    Message?: string;
    DecidedAt: string;
    PasswordSet?: boolean;
    PasswordAttempts?: number;
}

/** The account step as the widget receives it. */
export interface CheckoutAccountStatus {
    Outcome: CheckoutAccountOutcome;
    Message?: string;
    /** True while the buyer may still set a password: the outcome was `Created` and none is set yet. */
    CanSetPassword: boolean;
}

export interface CheckoutAccountResponse {
    Success: boolean;
    ErrorMessage?: string;
    /** Absent when no host step is registered — the checkout has no account step. */
    Account?: CheckoutAccountStatus;
}

const GENERIC_FAILURE = 'We could not set up your account right now. You can sign in or reset your password later with the e-mail you used here.';

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

async function saveAccountState(session: mjBizAppsOrdersCheckoutSessionEntity, state: StoredAccountState): Promise<void> {
    session.MetadataJSON = JSON.stringify({ ...readMetadata(session), Account: state });
    if (!(await session.Save())) {
        LogError(`[CheckoutAccountStep] could not record the account step on session ${session.ID}: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

function toStatus(state: StoredAccountState): CheckoutAccountStatus {
    return {
        Outcome: state.Outcome,
        Message: state.Message,
        CanSetPassword:
            state.Outcome === 'Created' && !state.PasswordSet && (state.PasswordAttempts ?? 0) < MAX_CHECKOUT_PASSWORD_ATTEMPTS,
    };
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
 * `Created` and `Exists` are final: asking again returns the recorded answer rather than asking the
 * host, which would now find the account this checkout created and call it existing. Only `Failed`
 * is asked again. A host step that throws is recorded as `Failed`; it never affects the paid order.
 */
export async function EnsureCheckoutAccount(
    sessionID: string,
    clientSessionKey: string,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const step = ResolveCheckoutAccountStep();
    if (!step) return { Success: true };

    const loaded = await loadConfirmedSession(sessionID, clientSessionKey, contextUser);
    if ('Refusal' in loaded) return loaded.Refusal;
    const session = loaded.Session;

    const existing = readAccountState(session);
    if (existing && existing.Outcome !== 'Failed') {
        return { Success: true, Account: toStatus(existing) };
    }

    const context = await buildContext(session, contextUser);
    let result: CheckoutAccountResult;
    if (!context.Email) {
        result = { Outcome: 'Failed', Message: GENERIC_FAILURE };
    } else {
        try {
            result = await step.EnsureAccount(context);
        } catch (err) {
            LogError(`[CheckoutAccountStep] ${step.constructor.name}.EnsureAccount threw for session ${session.ID}: ${err instanceof Error ? err.message : String(err)}`);
            result = { Outcome: 'Failed' };
        }
    }
    const outcome: CheckoutAccountOutcome = ['Created', 'Exists', 'Failed'].includes(result?.Outcome) ? result.Outcome : 'Failed';
    const state: StoredAccountState = {
        Outcome: outcome,
        Message: result?.Message ?? (outcome === 'Failed' ? GENERIC_FAILURE : undefined),
        DecidedAt: new Date().toISOString(),
        PasswordSet: false,
        PasswordAttempts: 0,
    };
    await saveAccountState(session, state);
    return { Success: true, Account: toStatus(state) };
}

/**
 * Set the password of the account this checkout created.
 *
 * Refused unless the session's recorded outcome is `Created`, no password has been set yet, and the
 * buyer has attempts left. A refusal by the host (its password policy) counts as an attempt.
 */
export async function SetCheckoutAccountPassword(
    sessionID: string,
    clientSessionKey: string,
    password: unknown,
    contextUser?: UserInfo
): Promise<CheckoutAccountResponse> {
    const step = ResolveCheckoutAccountStep();
    if (!step) return { Success: false, ErrorMessage: 'This checkout does not create accounts.' };

    const loaded = await loadConfirmedSession(sessionID, clientSessionKey, contextUser);
    if ('Refusal' in loaded) return loaded.Refusal;
    const session = loaded.Session;

    const state = readAccountState(session);
    if (!state || !toStatus(state).CanSetPassword) {
        return {
            Success: false,
            ErrorMessage: 'A password cannot be set here. Sign in, or reset your password, with the e-mail you used.',
            Account: state ? toStatus(state) : undefined,
        };
    }
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_CHECKOUT_PASSWORD_LENGTH) {
        return { Success: false, ErrorMessage: 'Please enter a password.', Account: toStatus(state) };
    }

    let result: CheckoutPasswordResult;
    try {
        result = await step.SetPassword({ ...(await buildContext(session, contextUser)), Password: password });
    } catch (err) {
        LogError(`[CheckoutAccountStep] ${step.constructor.name}.SetPassword threw for session ${session.ID}: ${err instanceof Error ? err.message : String(err)}`);
        result = { Success: false };
    }

    const next: StoredAccountState = {
        ...state,
        PasswordSet: result?.Success === true,
        PasswordAttempts: (state.PasswordAttempts ?? 0) + 1,
    };
    await saveAccountState(session, next);
    return result?.Success === true
        ? { Success: true, Account: toStatus(next) }
        : {
              Success: false,
              ErrorMessage: result?.Message ?? 'That password could not be set. Please try another.',
              Account: toStatus(next),
          };
}
