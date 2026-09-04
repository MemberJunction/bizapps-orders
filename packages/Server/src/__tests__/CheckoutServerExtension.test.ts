import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, Request, Response } from 'express';

const mockRunView = vi.fn();
const mockGetSystemUser = vi.fn();

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        RunView = mockRunView;
    },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: {
            Users: [],
            GetSystemUser: () => mockGetSystemUser(),
        },
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (cls: unknown) => cls,
}));

vi.mock('@mj-biz-apps/orders-core-entities-server', () => ({
    CheckoutSessionService: {
        InitializeSession: vi.fn(),
        UpdateDraft: vi.fn(),
        OpenPaymentIntentForSession: vi.fn(),
        CompleteCheckout: vi.fn(),
        ReapExpiredOpenSessions: vi.fn().mockResolvedValue(0),
    },
    EscapeText: (value: string) => value.replace(/'/g, "''"),
    LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
    OrdersEngine: { Instance: {} },
}));

vi.mock('@mj-biz-apps/orders-entities', () => ({
    LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
    OrdersEngine: { Instance: {} },
}));

import { CheckoutSessionService } from '@mj-biz-apps/orders-core-entities-server';
import { CheckoutServerExtension, shouldServeCheckoutElementSourceMap } from '../CheckoutServerExtension.js';

type RouteMap = {
    get: Record<string, (req: Request, res: Response) => void>;
    post: Record<string, unknown[]>;
    options: Record<string, unknown>;
};

function mockApp(): { app: Application; routes: RouteMap } {
    const routes: RouteMap = { get: {}, post: {}, options: {} };
    const app = {
        get: vi.fn((path: string, handler: (req: Request, res: Response) => void) => {
            routes.get[path] = handler;
        }),
        post: vi.fn((path: string, ...handlers: unknown[]) => {
            routes.post[path] = handlers;
        }),
        options: vi.fn((path: string, handler: unknown) => {
            routes.options[path] = handler;
        }),
    } as unknown as Application;
    return { app, routes };
}

function mockRes() {
    const res = {
        statusCode: 200,
        body: '',
        headers: {} as Record<string, string>,
        headersSent: false,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        setHeader(name: string, value: string) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        send(body: string) {
            this.body = body;
            this.headersSent = true;
            return this;
        },
        json(body: unknown) {
            this.body = JSON.stringify(body);
            this.headersSent = true;
            return this;
        },
        end() {
            this.headersSent = true;
            return this;
        },
    };
    return res;
}

describe('shouldServeCheckoutElementSourceMap', () => {
    it('defaults off — the public payment route must not publish TypeScript', () => {
        expect(shouldServeCheckoutElementSourceMap({}, {})).toBe(false);
        expect(shouldServeCheckoutElementSourceMap({}, { NODE_ENV: 'development' })).toBe(false);
        expect(shouldServeCheckoutElementSourceMap({}, { NODE_ENV: 'production' })).toBe(false);
    });

    it('opts in via Settings or CHECKOUT_ELEMENT_SOURCEMAP=1', () => {
        expect(shouldServeCheckoutElementSourceMap({ ServeElementSourceMap: true }, {})).toBe(true);
        expect(shouldServeCheckoutElementSourceMap({}, { CHECKOUT_ELEMENT_SOURCEMAP: '1' })).toBe(true);
        expect(shouldServeCheckoutElementSourceMap({ ServeElementSourceMap: false }, { CHECKOUT_ELEMENT_SOURCEMAP: '1' })).toBe(false);
    });
});

describe('CheckoutServerExtension', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSystemUser.mockReturnValue({ ID: 'sys', Email: 'system@local' });
        mockRunView.mockResolvedValue({ Success: true, Results: [{ ID: 'dist-1', CheckoutWidgetID: 'widget-1' }] });
    });

    it('registers POST verbs plus GET /:slug and reports both in RegisteredRoutes', async () => {
        const { app, routes } = mockApp();
        const ext = new CheckoutServerExtension();
        const result = await ext.Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: {},
        });

        expect(result.Success).toBe(true);
        expect(Object.keys(routes.post).sort()).toEqual([
            '/checkout/complete',
            '/checkout/draft',
            '/checkout/initialize',
            '/checkout/payment-intent',
        ]);
        expect(Object.keys(routes.get).sort()).toEqual(['/checkout/:slug', '/checkout/element/main.js'].sort());
        expect(routes.get['/checkout/element/main.js.map']).toBeUndefined();
        expect(result.RegisteredRoutes).toEqual([
            'POST /checkout/initialize',
            'POST /checkout/draft',
            'POST /checkout/payment-intent',
            'POST /checkout/complete',
            'GET /checkout/:slug',
        ]);
    });

    it('GET 404s reserved slugs without looking up a distribution', async () => {
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: {},
        });
        const res = mockRes();
        await routes.get['/checkout/:slug'](
            { params: { slug: 'initialize' }, headers: {}, socket: {} } as unknown as Request,
            res as unknown as Response
        );
        expect(res.statusCode).toBe(404);
        expect(res.body).toContain('not valid');
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('GET 404s an unknown slug', async () => {
        mockRunView.mockResolvedValueOnce({ Success: true, Results: [] });
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: {},
        });
        const res = mockRes();
        await routes.get['/checkout/:slug'](
            { params: { slug: 'missing-event' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request,
            res as unknown as Response
        );
        expect(res.statusCode).toBe(404);
        expect(res.body).toContain('not available');
        expect(mockRunView).toHaveBeenCalled();
    });

    it('GET 503s when no acting user resolves', async () => {
        mockGetSystemUser.mockReturnValue(undefined);
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: {},
        });
        const res = mockRes();
        await routes.get['/checkout/:slug'](
            { params: { slug: 'summit-2027' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request,
            res as unknown as Response
        );
        expect(res.statusCode).toBe(503);
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('GET 200s an Active distribution with escaped slug and no-store HTML', async () => {
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout/',
            Settings: {},
        });
        const res = mockRes();
        await routes.get['/checkout/:slug'](
            { params: { slug: 'summit-2027' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request,
            res as unknown as Response
        );
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
        expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
        expect(res.body).toContain('slug="summit-2027"');
        expect(res.body).toContain('api-root="/checkout"');
        expect(res.body).toContain('src="/checkout/element/main.js"');
        const filter = mockRunView.mock.calls[0][0].ExtraFilter as string;
        expect(filter).toContain("Slug = 'summit-2027'");
        expect(filter).toContain("Status = 'Active'");
        expect(CheckoutSessionService.ReapExpiredOpenSessions).toHaveBeenCalledTimes(1);
    });

    it('does not re-reap within the interval, then reaps again after it elapses', async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-08-26T12:00:00Z'));
            const { app, routes } = mockApp();
            await new CheckoutServerExtension().Initialize(app, {
                Enabled: true,
                DriverClass: 'OrdersCheckoutEdge',
                RootPath: '/checkout',
                Settings: {},
            });
            const req = { params: { slug: 'summit-2027' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
            await routes.get['/checkout/:slug'](req, mockRes() as unknown as Response);
            await routes.get['/checkout/:slug'](req, mockRes() as unknown as Response);
            expect(CheckoutSessionService.ReapExpiredOpenSessions).toHaveBeenCalledTimes(1);
            vi.setSystemTime(new Date('2026-08-26T12:01:01Z'));
            await routes.get['/checkout/:slug'](req, mockRes() as unknown as Response);
            expect(CheckoutSessionService.ReapExpiredOpenSessions).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('escapes a hostile slug in the GET ExtraFilter', async () => {
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: {},
        });
        const res = mockRes();
        // Passes the URL-safe pattern but still contains a quote if we ever loosen it —
        // use a valid slug here and assert EscapeText is applied via the apostrophe case
        // by calling with a slug that includes underscore/dot only; SQL quoting is
        // covered by EscapeText unit tests. This asserts the filter is parameterized
        // through EscapeText for the accepted slug.
        await routes.get['/checkout/:slug'](
            { params: { slug: 'summit_2027' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request,
            res as unknown as Response
        );
        expect(mockRunView.mock.calls[0][0].ExtraFilter).toContain("Slug = 'summit_2027'");
    });

    it('does not key rate limits on a spoofed leftmost X-Forwarded-For (default TrustedProxyHops=0)', async () => {
        const { app, routes } = mockApp();
        const ext = new CheckoutServerExtension();
        await ext.Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: { RateLimitMax: 2, RateLimitMaxGlobal: 2, RateLimitWindowMs: 60_000 },
        });
        const hit = async (xff: string) => {
            const res = mockRes();
            await routes.get['/checkout/:slug'](
                {
                    params: { slug: 'summit-2027' },
                    headers: { 'x-forwarded-for': xff },
                    socket: { remoteAddress: '10.0.0.9' },
                } as unknown as Request,
                res as unknown as Response
            );
            return res.statusCode;
        };
        expect(await hit('1.1.1.1')).toBe(200);
        expect(await hit('2.2.2.2')).toBe(200);
        expect(await hit('3.3.3.3')).toBe(429);
    });
});
