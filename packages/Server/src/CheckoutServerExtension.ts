/**
 * The anonymous checkout edge — the public transport in front of `CheckoutSessionService`.
 *
 * Until this extension existed the checkout service had no edge at all: nothing exposed
 * InitializeSession / UpdateDraft / CompleteCheckout to a browser, so the widget could not be
 * driven end-to-end. Like the payment webhook, the edge mounts through `serverExtensions[]`
 * BEFORE MJServer installs its auth middleware — an anonymous buyer presents no bearer token;
 * the distribution slug plus the session id + client session key (re-verified inside the
 * service on every mutating call) are the credentials.
 *
 * `GET {RootPath}/:slug` is the first-party public page (vanilla HTML, no Explorer shell).
 * MJ auto-loads this extension from `@mj-biz-apps/orders-server`'s `MJ_SERVER_EXTENSIONS`
 * when the package is listed in the host `dynamicPackages.server[]`.
 *
 * ═══ THE GATE SEQUENCE, in order, all fail-closed ═══
 *
 * 1. BODY CAP — `express.json()` scoped to these routes with a small limit. Checkout inputs
 *    are tiny; anything large is abuse.
 * 2. RATE LIMIT — fixed-window, per client IP (and per IP+slug on initialize), in-memory.
 *    Session initialization is a row-insert primitive and Person resolution touches the
 *    database; both must be bounded per caller.
 * 3. ORIGIN ALLOWLIST — when the widget's admin-authored Configuration sets
 *    `allowedOrigins`, a browser request from any other origin is refused AND receives no
 *    CORS grant (so the browser blocks the response either way). With no allowlist
 *    configured, any origin is allowed — the distribution slug remains the access control.
 * 4. TURNSTILE — when the widget sets `requireTurnstile`, session initialization and
 *    completion demand a Cloudflare Turnstile token, verified server-side against the secret
 *    named by `Settings.TurnstileSecretEnvVar`. Required-but-unconfigured verifies as a 503,
 *    never as a silent pass.
 *
 * ═══ THE PRICING-INPUT RULE HOLDS AT THIS BOUNDARY ═══
 * The request bodies accepted here carry NO amount, price, product resolution or provider.
 * `CheckoutLineInput` has no price field; the payment-intent route takes only the session
 * id + key (amount comes from the session's server-priced snapshot; the provider from the
 * widget's Configuration). Anything else in a request body is ignored.
 *
 * ═══ THE ACTING USER ═══
 * Writes run as the service principal named by `Settings.ServiceUserEmail` when configured —
 * a named checkout principal is auditable and permission-scopeable — falling back to MJ's
 * system user (with a logged warning) so a bare install still works. Resolved per request,
 * same reasoning as the payment webhook: the user cache may not be ready at Initialize time.
 *
 * CONNECTS TO:
 *   SERVICE: @mj-biz-apps/orders-core-entities-server → CheckoutSessionService
 *   CONFIG:  mj.config.cjs → serverExtensions[] (DriverClass 'OrdersCheckoutEdge')
 *   PLAN:    aidp-next plans/aidp-unified-transactions-plan.md §3.2
 */
import BodyParser from 'body-parser';
import type { Application, NextFunction, Request, Response } from 'express';
import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    type ExtensionHealthResult,
    type ExtensionInitResult,
    type ServerExtensionConfig,
} from '@memberjunction/server-extensions-core';
import { CheckoutSessionService, EscapeText, type CheckoutLineInput } from '@mj-biz-apps/orders-core-entities-server';
import type { CheckoutWidgetConfiguration } from '@mj-biz-apps/orders-entities';
import { isValidCheckoutSlug, originAllowed as originIsAllowed } from './checkout-edge-policy.js';
import { renderCheckoutHostErrorPage, renderCheckoutHostPage } from './checkout-host-page.js';

/** Checkout request bodies are small; anything larger is abuse, not commerce. */
const MAX_BODY = '256kb';

/** Fixed-window rate limit defaults (overridable via extension Settings). */
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_MAX_PER_WINDOW = 30;
/** Bounded size of the rate-limit map — oldest windows evict first. */
const RATE_CACHE_MAX = 50_000;

const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface CheckoutEdgeSettings {
    /** Email of the named checkout service principal; falls back to the system user. */
    ServiceUserEmail?: string;
    /** Name of the env var holding the Cloudflare Turnstile secret. */
    TurnstileSecretEnvVar?: string;
    /** Rate-limit window in ms (default 60000). */
    RateLimitWindowMs?: number;
    /** Max requests per window per client key (default 30). */
    RateLimitMax?: number;
}

interface WidgetEdgePolicy {
    allowedOrigins?: string[];
    requireTurnstile?: boolean;
}

@RegisterClass(BaseServerExtension, 'OrdersCheckoutEdge')
export class CheckoutServerExtension extends BaseServerExtension {
    private settings: CheckoutEdgeSettings = {};
    private rateWindows = new Map<string, { windowStart: number; count: number }>();
    private warnedSystemUserFallback = false;
    private rootPath = '/checkout';

    public async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.settings = (config.Settings ?? {}) as CheckoutEdgeSettings;
        const root = config.RootPath.replace(/\/+$/, '') || '/checkout';
        this.rootPath = root;
        const json = BodyParser.json({ limit: MAX_BODY });

        const routes: Array<[string, (req: Request, res: Response) => Promise<void>]> = [
            [`${root}/initialize`, (req, res) => this.handleInitialize(req, res)],
            [`${root}/draft`, (req, res) => this.handleDraft(req, res)],
            [`${root}/payment-intent`, (req, res) => this.handlePaymentIntent(req, res)],
            [`${root}/complete`, (req, res) => this.handleComplete(req, res)],
        ];

        for (const [path, handler] of routes) {
            // CORS preflight: answered per-widget after the origin gate resolves the policy.
            app.options(path, (req, res) => {
                void this.handlePreflight(req, res);
            });
            app.post(path, json, (req: Request, res: Response, _next: NextFunction) => {
                void this.guardAndRun(req, res, handler);
            });
        }

        const hostPath = `${root}/:slug`;
        app.get(hostPath, (req: Request, res: Response) => this.handleGetHost(req, res));

        LogStatus(`[Orders] Checkout edge registered at GET ${hostPath} and POST ${root}/{initialize,draft,payment-intent,complete}`);
        return {
            Success: true,
            Message: 'Orders anonymous checkout edge mounted (public GET host, rate-limited POSTs, origin-gated, optional Turnstile).',
            RegisteredRoutes: [...routes.map(([path]) => `POST ${path}`), `GET ${hostPath}`],
        };
    }

    public async Shutdown(): Promise<void> {
        this.rateWindows.clear();
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const user = this.resolveActingUser();
        return user
            ? { Healthy: true, Name: 'OrdersCheckoutEdge' }
            : {
                  Healthy: false,
                  Name: 'OrdersCheckoutEdge',
                  Details: { Reason: 'Neither the configured service user nor the system user resolves; every checkout call will be refused.' },
              };
    }

    // ─── Gate pipeline ────────────────────────────────────────────────────────

    /** Runs the shared gates (rate limit → origin → turnstile where required) then the handler. */
    private async guardAndRun(req: Request, res: Response, handler: (req: Request, res: Response) => Promise<void>): Promise<void> {
        try {
            const ip = this.clientIp(req);
            const slug = typeof req.body?.slug === 'string' ? req.body.slug : '';
            if (this.rateLimitExceeded(`${ip}|${slug}`)) {
                res.status(429).json({ Success: false, ErrorMessage: 'Too many requests — slow down and try again shortly.' });
                return;
            }

            const policy = await this.resolveEdgePolicy(req);
            if (policy === null) {
                // Session/slug did not resolve; let the service produce its own not-found
                // message with no origin grant beyond a same-origin default.
                await handler(req, res);
                return;
            }

            if (!this.applyOriginGate(req, res, policy)) {
                return; // refused; response already written
            }

            if (policy.requireTurnstile && this.isTurnstileGatedPath(req)) {
                const turnstileFailure = await this.verifyTurnstile(req);
                if (turnstileFailure) {
                    const [status, message] = turnstileFailure;
                    res.status(status).json({ Success: false, ErrorMessage: message });
                    return;
                }
            }

            await handler(req, res);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[OrdersCheckoutEdge] Unhandled error on ${req.path}: ${msg}`);
            if (!res.headersSent) {
                res.status(500).json({ Success: false, ErrorMessage: 'Checkout is temporarily unavailable.' });
            }
        }
    }

    /** OPTIONS preflight: grant CORS only to origins the widget policy allows. */
    private async handlePreflight(req: Request, res: Response): Promise<void> {
        try {
            const policy = (await this.resolveEdgePolicy(req)) ?? {};
            const origin = req.headers.origin;
            if (origin && this.originAllowed(origin, policy, req)) {
                this.setCorsHeaders(res, origin);
                res.status(204).end();
            } else {
                res.status(403).end();
            }
        } catch {
            res.status(403).end();
        }
    }

    /**
     * Resolves the widget edge policy (allowed origins + turnstile requirement) for this
     * request — by slug on initialize, by session id on the other routes. Returns null when
     * nothing resolves (unknown slug/session): the underlying service will answer with its
     * own refusal.
     */
    private async resolveEdgePolicy(req: Request): Promise<WidgetEdgePolicy | null> {
        const user = this.resolveActingUser();
        if (!user) {
            return null;
        }
        const rv = new RunView();

        let widgetId: string | null = null;
        const slug = this.requestSlug(req);
        const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';

        if (slug) {
            const distRes = await rv.RunView<{ ID: string; CheckoutWidgetID: string }>({
                EntityName: CHECKOUT_DISTRIBUTION_ENTITY,
                Fields: ['ID', 'CheckoutWidgetID'],
                ExtraFilter: `Slug = '${EscapeText(slug)}' AND Status = 'Active'`,
                ResultType: 'simple',
            }, user);
            widgetId = distRes?.Success && distRes.Results?.length ? distRes.Results[0].CheckoutWidgetID : null;
        } else if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) {
            const sessRes = await rv.RunView<{ ID: string; CheckoutWidgetID: string }>({
                EntityName: CHECKOUT_SESSION_ENTITY,
                Fields: ['ID', 'CheckoutWidgetID'],
                ExtraFilter: `ID = '${EscapeText(sessionId)}'`,
                ResultType: 'simple',
            }, user);
            widgetId = sessRes?.Success && sessRes.Results?.length ? sessRes.Results[0].CheckoutWidgetID : null;
        }

        if (!widgetId) {
            return null;
        }

        const widgetRes = await rv.RunView<{ ID: string; Configuration: string | null }>({
            EntityName: CHECKOUT_WIDGET_ENTITY,
            Fields: ['ID', 'Configuration'],
            ExtraFilter: `ID = '${EscapeText(widgetId)}'`,
            ResultType: 'simple',
        }, user);
        const configRaw = widgetRes?.Success && widgetRes.Results?.length ? widgetRes.Results[0].Configuration : null;
        if (!configRaw) {
            return {};
        }
        try {
            const config = JSON.parse(configRaw) as CheckoutWidgetConfiguration;
            return {
                allowedOrigins: Array.isArray(config.allowedOrigins) ? config.allowedOrigins.filter((o): o is string => typeof o === 'string') : undefined,
                requireTurnstile: config.requireTurnstile === true,
            };
        } catch {
            return {};
        }
    }

    /** Enforces the per-widget origin allowlist; grants CORS to allowed origins. */
    private applyOriginGate(req: Request, res: Response, policy: WidgetEdgePolicy): boolean {
        const origin = req.headers.origin;
        if (!origin) {
            // Non-browser client (no Origin header): nothing to grant, nothing to block here —
            // the session credentials remain the gate.
            return true;
        }
        if (!this.originAllowed(origin, policy, req)) {
            res.status(403).json({ Success: false, ErrorMessage: 'This origin is not allowed to use this checkout.' });
            return false;
        }
        this.setCorsHeaders(res, origin);
        return true;
    }

    private originAllowed(origin: string, policy: WidgetEdgePolicy, req: Request): boolean {
        return originIsAllowed(origin, policy, typeof req.headers.host === 'string' ? req.headers.host : undefined);
    }

    private setCorsHeaders(res: Response, origin: string): void {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
    }

    /** Turnstile applies to the abuse-sensitive endpoints: initialize and complete. */
    private isTurnstileGatedPath(req: Request): boolean {
        return req.path.endsWith('/initialize') || req.path.endsWith('/complete');
    }

    /**
     * Verifies the Cloudflare Turnstile token. Returns null on success, or [status, message]
     * on refusal. A widget that REQUIRES Turnstile with no secret configured fails closed
     * with a 503 — a silent pass would advertise protection that is not running.
     */
    private async verifyTurnstile(req: Request): Promise<[number, string] | null> {
        const envVar = this.settings.TurnstileSecretEnvVar;
        const secret = envVar ? process.env[envVar] : undefined;
        if (!secret) {
            LogError(`[OrdersCheckoutEdge] Widget requires Turnstile but no secret is configured (Settings.TurnstileSecretEnvVar${envVar ? `='${envVar}' resolved empty` : ' unset'})`);
            return [503, 'Checkout verification is not configured — contact the site operator.'];
        }
        const token = typeof req.body?.turnstileToken === 'string' ? req.body.turnstileToken : '';
        if (!token) {
            return [403, 'Human verification is required for this checkout.'];
        }
        try {
            const params = new URLSearchParams({ secret, response: token, remoteip: this.clientIp(req) });
            const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            });
            const outcome = (await verifyRes.json()) as { success?: boolean };
            return outcome?.success === true ? null : [403, 'Human verification failed — please try again.'];
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[OrdersCheckoutEdge] Turnstile verification call failed: ${msg}`);
            return [503, 'Human verification is temporarily unavailable — please try again.'];
        }
    }

    // ─── Public host page ─────────────────────────────────────────────────────

    /**
     * `GET /checkout/:slug` — first-party HTML that talks to the POST edge.
     * Unknown/reserved slugs 404; missing service principal is a 503. The page
     * itself is cache-free; initialize still enforces Active widget + distribution.
     */
    private async handleGetHost(req: Request, res: Response): Promise<void> {
        try {
            const slug = typeof req.params?.slug === 'string' ? req.params.slug.trim() : '';
            if (!isValidCheckoutSlug(slug)) {
                this.sendHostError(res, 404, 'This checkout link is not valid.');
                return;
            }
            if (this.rateLimitExceeded(`${this.clientIp(req)}|get|${slug}`)) {
                this.sendHostError(res, 429, 'Too many requests — slow down and try again shortly.');
                return;
            }
            const user = this.resolveActingUser();
            if (!user) {
                this.sendHostError(res, 503, 'Checkout is not ready — please try again shortly.');
                return;
            }
            const exists = await this.activeDistributionExists(slug, user);
            if (!exists) {
                this.sendHostError(res, 404, 'This checkout is not available.');
                return;
            }
            res
                .status(200)
                .setHeader('Content-Type', 'text/html; charset=utf-8')
                .setHeader('Cache-Control', 'no-store')
                .setHeader('X-Content-Type-Options', 'nosniff')
                .send(renderCheckoutHostPage({ slug, apiRoot: this.rootPath }));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[OrdersCheckoutEdge] Unhandled error on GET host: ${msg}`);
            if (!res.headersSent) {
                this.sendHostError(res, 500, 'Checkout is temporarily unavailable.');
            }
        }
    }

    private sendHostError(res: Response, status: number, message: string): void {
        res
            .status(status)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .setHeader('Cache-Control', 'no-store')
            .send(renderCheckoutHostErrorPage({ message }));
    }

    private requestSlug(req: Request): string {
        if (typeof req.params?.slug === 'string' && req.params.slug.trim()) {
            return req.params.slug.trim();
        }
        return typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
    }

    private async activeDistributionExists(slug: string, user: UserInfo): Promise<boolean> {
        const rv = new RunView();
        const distRes = await rv.RunView<{ ID: string }>({
            EntityName: CHECKOUT_DISTRIBUTION_ENTITY,
            Fields: ['ID'],
            ExtraFilter: `Slug = '${EscapeText(slug)}' AND Status = 'Active'`,
            ResultType: 'simple',
        }, user);
        return !!(distRes?.Success && distRes.Results?.length);
    }

    // ─── Route handlers (thin shells over the service) ───────────────────────

    private async handleInitialize(req: Request, res: Response): Promise<void> {
        const user = this.resolveActingUser();
        if (!user) {
            res.status(500).json({ Success: false, ErrorMessage: 'Checkout is not ready — the service principal is unavailable.' });
            return;
        }
        const slug = typeof req.body?.slug === 'string' ? req.body.slug : '';
        const clientSessionKey = typeof req.body?.clientSessionKey === 'string' ? req.body.clientSessionKey : '';
        const result = await CheckoutSessionService.InitializeSession(slug, clientSessionKey, user);
        res.status(result.Success ? 200 : 400).json(result);
    }

    private async handleDraft(req: Request, res: Response): Promise<void> {
        const user = this.resolveActingUser();
        if (!user) {
            res.status(500).json({ Success: false, ErrorMessage: 'Checkout is not ready — the service principal is unavailable.' });
            return;
        }
        const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
        const clientSessionKey = typeof req.body?.clientSessionKey === 'string' ? req.body.clientSessionKey : '';
        const email = typeof req.body?.email === 'string' ? req.body.email : '';
        const lines = Array.isArray(req.body?.lines) ? (req.body.lines as CheckoutLineInput[]) : [];
        const result = await CheckoutSessionService.UpdateDraft(sessionId, clientSessionKey, email, lines, user);
        res.status(result.Success ? 200 : 400).json(result);
    }

    private async handlePaymentIntent(req: Request, res: Response): Promise<void> {
        const user = this.resolveActingUser();
        if (!user) {
            res.status(500).json({ Success: false, ErrorMessage: 'Checkout is not ready — the service principal is unavailable.' });
            return;
        }
        const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
        const clientSessionKey = typeof req.body?.clientSessionKey === 'string' ? req.body.clientSessionKey : '';
        const result = await CheckoutSessionService.OpenPaymentIntentForSession(sessionId, clientSessionKey, user);
        res.status(result.Success ? 200 : 400).json(result);
    }

    private async handleComplete(req: Request, res: Response): Promise<void> {
        const user = this.resolveActingUser();
        if (!user) {
            res.status(500).json({ Success: false, ErrorMessage: 'Checkout is not ready — the service principal is unavailable.' });
            return;
        }
        const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
        const clientSessionKey = typeof req.body?.clientSessionKey === 'string' ? req.body.clientSessionKey : '';
        const result = await CheckoutSessionService.CompleteCheckout(sessionId, clientSessionKey, user);
        res.status(result.Success ? 200 : 409).json(result);
    }

    // ─── Infrastructure ──────────────────────────────────────────────────────

    /** Fixed-window limiter over a bounded, insertion-ordered map. */
    private rateLimitExceeded(clientKey: string): boolean {
        const windowMs = this.settings.RateLimitWindowMs ?? DEFAULT_RATE_WINDOW_MS;
        const maxPerWindow = this.settings.RateLimitMax ?? DEFAULT_RATE_MAX_PER_WINDOW;
        const now = Date.now();
        const entry = this.rateWindows.get(clientKey);
        if (!entry || now - entry.windowStart >= windowMs) {
            if (this.rateWindows.size >= RATE_CACHE_MAX) {
                const oldest = this.rateWindows.keys().next().value;
                if (oldest !== undefined) {
                    this.rateWindows.delete(oldest);
                }
            }
            this.rateWindows.set(clientKey, { windowStart: now, count: 1 });
            return false;
        }
        entry.count++;
        return entry.count > maxPerWindow;
    }

    /**
     * The client IP for rate limiting and Turnstile. Trusts the leftmost X-Forwarded-For hop
     * when present (the edge sits behind the host's proxy in production); otherwise the
     * socket address.
     */
    private clientIp(req: Request): string {
        const fwd = req.headers['x-forwarded-for'];
        const first = Array.isArray(fwd) ? fwd[0] : fwd;
        if (first) {
            return first.split(',')[0].trim();
        }
        return req.socket?.remoteAddress ?? 'unknown';
    }

    /**
     * The acting principal for checkout writes: the configured service user when present,
     * else MJ's system user (warned once). Resolved per request — the user cache may not be
     * populated when the extension initializes.
     */
    private resolveActingUser(): UserInfo | undefined {
        try {
            const email = this.settings.ServiceUserEmail?.trim().toLowerCase();
            if (email) {
                const named = UserCache.Instance.Users?.find((u) => u.Email?.trim().toLowerCase() === email);
                if (named) {
                    return named;
                }
                LogError(`[OrdersCheckoutEdge] Configured ServiceUserEmail '${email}' does not resolve to a user — falling back to the system user.`);
            } else if (!this.warnedSystemUserFallback) {
                this.warnedSystemUserFallback = true;
                LogStatus('[OrdersCheckoutEdge] No ServiceUserEmail configured — checkout writes run as the system user. Configure a named checkout principal for auditability.');
            }
            return UserCache.Instance.GetSystemUser() ?? undefined;
        } catch {
            return undefined;
        }
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCheckoutServerExtension(): void {
    // intentionally empty
}
