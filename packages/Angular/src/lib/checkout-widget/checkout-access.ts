/**
 * Whether the buyer's access is ready, as the public checkout's success screen shows it (#325).
 * Pure, so it is testable without the host component.
 */
export type CheckoutAccessState = 'Ready' | 'Pending' | 'Failed' | 'NotTracked';

export const CHECKOUT_ACCESS_STATE_EVENT = 'checkout-access-state';

/** How often the success screen asks, and for how long, before it stops waiting. */
export const ACCESS_POLL_INTERVAL_MS = 2000;
export const ACCESS_POLL_TIMEOUT_MS = 60000;

export interface CheckoutAccessMessages {
    pending?: string;
    ready?: string;
    failed?: string;
}

const DEFAULTS: Required<CheckoutAccessMessages> = {
    pending: 'Your access is being set up…',
    ready: 'Your access is ready.',
    failed: "We couldn't finish setting up your access. Please contact support.",
};

/** The state the server reported, or null when the response carries none (an error). */
export function ReadAccessState(response: unknown): CheckoutAccessState | null {
    if (!response || typeof response !== 'object') return null;
    const r = response as Record<string, unknown>;
    if (r['Success'] !== true) return null;
    const s = r['State'];
    return s === 'Ready' || s === 'Pending' || s === 'Failed' || s === 'NotTracked' ? s : null;
}

/** The line the success screen shows for a state; none when access is not tracked. */
export function AccessMessage(state: CheckoutAccessState | null, messages?: CheckoutAccessMessages | null): string | null {
    const pick = (key: keyof CheckoutAccessMessages): string => {
        const custom = messages?.[key];
        return typeof custom === 'string' && custom.trim() ? custom : DEFAULTS[key];
    };
    if (state === 'Pending') return pick('pending');
    if (state === 'Ready') return pick('ready');
    if (state === 'Failed') return pick('failed');
    return null;
}

/** Whether the success screen should stop asking: the state is final, or nothing is tracked. */
export function IsFinalAccessState(state: CheckoutAccessState | null): boolean {
    return state !== 'Pending';
}
