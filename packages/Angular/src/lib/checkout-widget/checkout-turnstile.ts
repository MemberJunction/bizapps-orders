/**
 * Cloudflare Turnstile for the checkout element (#592).
 *
 * When a widget sets `requireTurnstile`, the edge refuses `/initialize` and `/complete` without
 * a valid token. The widget Configuration only reaches the browser in the reply to
 * `/initialize`, so the client cannot know the site key up front: the edge's 403 names it
 * (`TurnstileRequired` + `TurnstileSiteKey`), the client renders the challenge and retries once.
 * A token is single-use and expires after five minutes, so every gated call after the first
 * asks for a fresh one.
 */

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type CheckoutReply = Record<string, unknown>;

/** The site key a Turnstile refusal names, or null when the reply is anything else. */
export function TurnstileChallengeSiteKey(reply: CheckoutReply | null | undefined): string | null {
    if (!reply || reply._httpStatus !== 403 || reply.TurnstileRequired !== true) {
        return null;
    }
    return typeof reply.TurnstileSiteKey === 'string' && reply.TurnstileSiteKey ? reply.TurnstileSiteKey : null;
}

/** What the edge last asked for; kept per checkout so later gated calls send a token up front. */
export interface TurnstileState {
    siteKey: string | null;
}

/**
 * Posts to a Turnstile-gated route. Sends a token when the site key is already known; on a
 * Turnstile refusal, gets a fresh token for the key it names and retries once. A second refusal
 * is returned to the caller as is.
 */
export async function PostWithTurnstile(
    post: (path: string, body: Record<string, unknown>) => Promise<CheckoutReply>,
    path: string,
    body: Record<string, unknown>,
    getToken: (siteKey: string) => Promise<string>,
    state: TurnstileState,
): Promise<CheckoutReply> {
    const first = state.siteKey ? { ...body, turnstileToken: await getToken(state.siteKey) } : body;
    const reply = await post(path, first);
    const siteKey = TurnstileChallengeSiteKey(reply);
    if (!siteKey) {
        return reply;
    }
    state.siteKey = siteKey;
    return post(path, { ...body, turnstileToken: await getToken(siteKey) });
}

interface TurnstileRenderOptions {
    sitekey: string;
    execution: 'execute';
    appearance: 'interaction-only';
    callback: (token: string) => void;
    'error-callback': () => boolean;
}

interface TurnstileApi {
    render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
    execute(widgetId: string): void;
    reset(widgetId: string): void;
    remove(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

/** A Turnstile failure whose message is written for the buyer. */
export class TurnstileError extends Error {}

let turnstileScript: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) {
        return Promise.resolve(window.turnstile);
    }
    if (!turnstileScript) {
        turnstileScript = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = TURNSTILE_SCRIPT_URL;
            s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new TurnstileError('Human verification did not load.')));
            s.onerror = () => {
                turnstileScript = null;
                reject(new TurnstileError('Could not load human verification. Check your connection and try again.'));
            };
            document.head.appendChild(s);
        });
    }
    return turnstileScript;
}

/**
 * One Turnstile widget per checkout. It stays invisible unless Cloudflare needs the buyer to
 * interact; each `Token` call runs the challenge again, since a token works once.
 */
export class TurnstileWidget {
    private widgetId: string | null = null;
    private siteKey = '';
    private pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

    constructor(private readonly container: () => HTMLElement | null) {}

    public async Token(siteKey: string): Promise<string> {
        const api = await loadTurnstile();
        const host = this.container();
        if (!host) {
            throw new TurnstileError('Could not show human verification.');
        }
        return new Promise<string>((resolve, reject) => {
            this.pending?.reject(new TurnstileError('Human verification was restarted.'));
            this.pending = { resolve, reject };
            if (this.widgetId !== null && this.siteKey === siteKey) {
                api.reset(this.widgetId);
            } else {
                if (this.widgetId !== null) {
                    api.remove(this.widgetId);
                }
                this.siteKey = siteKey;
                this.widgetId = api.render(host, {
                    sitekey: siteKey,
                    execution: 'execute',
                    appearance: 'interaction-only',
                    callback: (token) => this.settle(token),
                    'error-callback': () => {
                        this.fail(new TurnstileError('Human verification failed. Please try again.'));
                        return true;
                    },
                }) ?? null;
            }
            if (this.widgetId === null) {
                this.fail(new TurnstileError('Could not show human verification.'));
                return;
            }
            api.execute(this.widgetId);
        });
    }

    public Destroy(): void {
        if (this.widgetId !== null) {
            window.turnstile?.remove(this.widgetId);
            this.widgetId = null;
        }
        this.pending = null;
    }

    private settle(token: string): void {
        const pending = this.pending;
        this.pending = null;
        pending?.resolve(token);
    }

    private fail(err: Error): void {
        const pending = this.pending;
        this.pending = null;
        pending?.reject(err);
    }
}
