/**
 * Completing a checkout the buyer has already paid for. Pure, so it is testable without the host
 * component.
 *
 * `/complete` books the order in one call. When it runs past the CDN or proxy timeout in front of
 * the server, the browser gets the gateway's HTML error page (a 504), or no reply at all, while
 * the server goes on and confirms the order. The card has been charged by then, so the checkout
 * must not report a failure: it asks again. `/complete` is replay-safe: while the first call is
 * still running it answers `Status: 'Processing'`, and once the session is Confirmed it returns the
 * existing order without booking a second one.
 */

type CheckoutReply = Record<string, unknown>;

/** How often the checkout asks again, and for how long, before it stops waiting. */
export const COMPLETE_RETRY_INTERVAL_MS = 3000;
export const COMPLETE_RETRY_TIMEOUT_MS = 120000;

/** Shown while the checkout asks again. */
export const COMPLETE_FINISHING_MESSAGE = 'Payment received. Finishing your order…';

/** Shown when the wait runs out with the order still unconfirmed. Never asks the buyer to pay again. */
export const COMPLETE_DELAYED_MESSAGE =
    'Your payment went through, but confirming your order is taking longer than usual. Please do not pay again. ' +
    'Contact support if you need your order confirmation.';

/** Shown for any other call whose reply was not the server's JSON. */
export const CHECKOUT_UNREACHABLE_MESSAGE = 'Checkout could not reach the server. Please try again.';

/**
 * A reply that was not the checkout server's JSON: a gateway or proxy error page, or no reply at
 * all (`HttpStatus` null). Its message is written for the buyer, never a parser error.
 */
export class CheckoutTransportError extends Error {
    constructor(public readonly HttpStatus: number | null) {
        super(CHECKOUT_UNREACHABLE_MESSAGE);
        this.name = 'CheckoutTransportError';
    }
}

/**
 * The reply's JSON body, with its HTTP status as `_httpStatus`. Throws {@link CheckoutTransportError}
 * for a body that is not a JSON object, such as a gateway's HTML error page.
 */
export async function ReadCheckoutReply(res: Response): Promise<CheckoutReply> {
    let json: unknown;
    try {
        json = await res.json();
    } catch {
        throw new CheckoutTransportError(res.status);
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new CheckoutTransportError(res.status);
    }
    const reply = json as CheckoutReply;
    reply._httpStatus = res.status;
    return reply;
}

/** True when `/complete` answered that an earlier call for the same session is still booking it. */
export function CompleteStillProcessing(reply: CheckoutReply | null | undefined): boolean {
    return !!reply && reply.Success !== true && reply.Status === 'Processing';
}

export interface CompleteRetryOptions {
    intervalMs?: number;
    timeoutMs?: number;
    /** Called once, the first time the checkout has to wait. */
    onWaiting?: () => void;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

/**
 * Sends `/complete` until it gives a final answer: the order (`Success: true`) or a refusal from
 * the server, both returned as they are. A reply that was not the server's JSON, or a session still
 * Processing, means the server may still be finishing, so it asks again. Resolves null when the wait
 * runs out with no final answer. Any other error (a failed human verification) is thrown.
 */
export async function CompleteWithRetry(
    send: () => Promise<CheckoutReply>,
    options: CompleteRetryOptions = {},
): Promise<CheckoutReply | null> {
    const interval = options.intervalMs ?? COMPLETE_RETRY_INTERVAL_MS;
    const now = options.now ?? (() => Date.now());
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const deadline = now() + (options.timeoutMs ?? COMPLETE_RETRY_TIMEOUT_MS);
    let waiting = false;
    for (;;) {
        let reply: CheckoutReply | null = null;
        try {
            reply = await send();
        } catch (err) {
            if (!(err instanceof CheckoutTransportError)) {
                throw err;
            }
        }
        if (reply && !CompleteStillProcessing(reply)) {
            return reply;
        }
        if (!waiting) {
            waiting = true;
            options.onWaiting?.();
        }
        if (now() >= deadline) {
            return null;
        }
        await sleep(interval);
    }
}
