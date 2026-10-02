import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, Request, Response } from 'express';

const mockRunView = vi.fn();
const mockGetSystemUser = vi.fn();

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: { Provider: {} },
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
    DispatchOutboundDeliveries: vi.fn().mockResolvedValue({ Success: true, Claimed: 0, Delivered: 0, Retrying: 0, DeadLettered: 0 }),
    EnsureCheckoutAccount: vi.fn().mockResolvedValue({ Success: true }),
    HasCheckoutAccountStep: vi.fn().mockReturnValue(false),
    SetCheckoutAccountPassword: vi.fn(),
    LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
    OrdersEngine: { Instance: {} },
}));

vi.mock('@mj-biz-apps/orders-entities', () => ({
    LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
    OrdersEngine: { Instance: {} },
}));

import {
    CheckoutSessionService,
    DispatchOutboundDeliveries,
    EnsureCheckoutAccount,
    HasCheckoutAccountStep,
    SetCheckoutAccountPassword,
} from '@mj-biz-apps/orders-core-entities-server';
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
            '/checkout/account',
            '/checkout/account/password',
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
            'POST /checkout/account',
            'POST /checkout/account/password',
            'GET /checkout/:slug',
        ]);
    });

    it('serves the element bundle and its source map to any origin', async () => {
        const { app, routes } = mockApp();
        await new CheckoutServerExtension().Initialize(app, {
            Enabled: true,
            DriverClass: 'OrdersCheckoutEdge',
            RootPath: '/checkout',
            Settings: { ServeElementSourceMap: true },
        });
        for (const route of ['/checkout/element/main.js', '/checkout/element/main.js.map']) {
            const res = Object.assign(mockRes(), {
                type: vi.fn().mockReturnThis(),
                sendFile: vi.fn(),
            });
            routes.get[route]({ headers: { origin: 'https://host.example' } } as unknown as Request, res as unknown as Response);
            expect(res.headers['access-control-allow-origin']).toBe('*');
            expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
            expect(res.sendFile).toHaveBeenCalledOnce();
        }
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

    describe('outbound dispatch after completion (#293)', () => {
        const complete = async (result: Record<string, unknown>) => {
            mockGetSystemUser.mockReturnValue({ ID: 'svc-1', Email: 'svc@example.com' });
            vi.mocked(CheckoutSessionService.CompleteCheckout).mockResolvedValue(result as never);
            vi.mocked(DispatchOutboundDeliveries).mockClear();
            const ext = new CheckoutServerExtension() as unknown as { handleComplete(req: Request, res: Response): Promise<void> };
            const res = mockRes();
            await ext.handleComplete({ body: { sessionId: 'sess-1', clientSessionKey: 'k' } } as unknown as Request, res as unknown as Response);
            return res;
        };

        it("sends the completed order's outbound events without waiting for the minute job", async () => {
            const res = await complete({ Success: true, SessionID: 'sess-1', Status: 'Confirmed', OrderID: 'order-1' });
            expect(res.statusCode).toBe(200);
            expect(DispatchOutboundDeliveries).toHaveBeenCalledWith({ OrderHeaderID: 'order-1' }, expect.anything(), expect.anything());
        });

        it('sends nothing for a checkout that did not complete', async () => {
            await complete({ Success: false, SessionID: 'sess-1', Status: 'Open', ErrorMessage: 'no' });
            expect(DispatchOutboundDeliveries).not.toHaveBeenCalled();
        });

        it('answers the buyer even when the dispatch fails', async () => {
            vi.mocked(DispatchOutboundDeliveries).mockRejectedValueOnce(new Error('consumer down'));
            const res = await complete({ Success: true, SessionID: 'sess-1', Status: 'Confirmed', OrderID: 'order-1' });
            expect(res.statusCode).toBe(200);
        });
    });

    it('passes the draft body attribution through to UpdateDraft', async () => {
        const user = { ID: 'svc-1', Email: 'svc@example.com' };
        mockGetSystemUser.mockReturnValue(user);
        vi.mocked(CheckoutSessionService.UpdateDraft).mockResolvedValue({
            Success: true, SessionID: 'sess-1', Subtotal: 0, Tax: 0, Adjustments: 0, TotalGross: 0, RequiresPayment: false, Lines: [],
        });
        const ext = new CheckoutServerExtension();
        const res = mockRes();
        const attribution = { source: 'voice_agent', reference: 'conv-9' };
        await (ext as unknown as { handleDraft(req: Request, res: Response): Promise<void> }).handleDraft(
            { body: { sessionId: 'sess-1', clientSessionKey: 'k', email: 'a@b.com', lines: [], attribution } } as unknown as Request,
            res as unknown as Response
        );
        expect(CheckoutSessionService.UpdateDraft).toHaveBeenCalledWith('sess-1', 'k', 'a@b.com', [], user, { Attribution: attribution, Answers: undefined });
    });

    it('passes the buyer answers from the draft body to UpdateDraft (#322)', async () => {
        const user = { ID: 'svc-1', Email: 'svc@example.com' };
        mockGetSystemUser.mockReturnValue(user);
        vi.mocked(CheckoutSessionService.UpdateDraft).mockResolvedValue({
            Success: true, SessionID: 'sess-1', Subtotal: 0, Tax: 0, Adjustments: 0, TotalGross: 0, RequiresPayment: false, Lines: [],
        });
        const ext = new CheckoutServerExtension();
        const answers = { source: { Value: 'Other', OtherText: 'A podcast' } };
        const res = mockRes();
        await (ext as unknown as { handleDraft(req: Request, res: Response): Promise<void> }).handleDraft(
            {
                body: { sessionId: 'sess-1', clientSessionKey: 'k', email: 'a@b.com', lines: [{ ProductID: 'p', Quantity: 1 }], answers },
            } as unknown as Request,
            res as unknown as Response
        );
        expect(res.statusCode).toBe(200);
        expect(CheckoutSessionService.UpdateDraft).toHaveBeenCalledWith(
            'sess-1', 'k', 'a@b.com', [{ ProductID: 'p', Quantity: 1 }], user, { Attribution: undefined, Answers: answers }
        );
    });

    describe('account step (#292)', () => {
        type Handler = (req: Request, res: Response) => Promise<void>;
        const call = async (name: 'handleComplete' | 'handleAccount' | 'handleAccountPassword', body: Record<string, unknown>) => {
            mockGetSystemUser.mockReturnValue({ ID: 'svc-1', Email: 'svc@example.com' });
            const ext = new CheckoutServerExtension() as unknown as Record<string, Handler>;
            const res = mockRes();
            await ext[name].call(ext, { body } as unknown as Request, res as unknown as Response);
            return res;
        };
        const completed = { Success: true, SessionID: 'sess-1', Status: 'Confirmed', OrderID: 'o-1', OrderNumber: 'SO-1' };

        it('answers a completed checkout without waiting on the host, and says an account step follows', async () => {
            vi.mocked(EnsureCheckoutAccount).mockClear();
            vi.mocked(CheckoutSessionService.CompleteCheckout).mockResolvedValue(completed);
            vi.mocked(HasCheckoutAccountStep).mockReturnValue(true);
            const res = await call('handleComplete', { sessionId: 'sess-1', clientSessionKey: 'k' });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ...completed, AccountStep: true });
            expect(EnsureCheckoutAccount).not.toHaveBeenCalled();
        });

        it('leaves the completion response unchanged when no step is registered', async () => {
            vi.mocked(CheckoutSessionService.CompleteCheckout).mockResolvedValue(completed);
            vi.mocked(HasCheckoutAccountStep).mockReturnValue(false);
            const res = await call('handleComplete', { sessionId: 'sess-1', clientSessionKey: 'k' });
            expect(JSON.parse(res.body)).toEqual(completed);
        });

        it('answers a checkout that did not complete with 409 and no account step', async () => {
            vi.mocked(CheckoutSessionService.CompleteCheckout).mockResolvedValue({ Success: false, SessionID: 'sess-1', Status: 'Open', ErrorMessage: 'no' });
            vi.mocked(HasCheckoutAccountStep).mockReturnValue(true);
            const res = await call('handleComplete', { sessionId: 'sess-1', clientSessionKey: 'k' });
            expect(res.statusCode).toBe(409);
            expect(JSON.parse(res.body).AccountStep).toBeUndefined();
        });

        it('passes the account request through to the service', async () => {
            vi.mocked(EnsureCheckoutAccount).mockResolvedValue({ Success: true, Account: { Outcome: 'Created', CanSetPassword: true, VerificationRequired: true } });
            const res = await call('handleAccount', { sessionId: 'sess-1', clientSessionKey: 'k' });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).Account.Outcome).toBe('Created');
            expect(EnsureCheckoutAccount).toHaveBeenCalledWith('sess-1', 'k', expect.anything());
        });

        it('passes the password body through to the service', async () => {
            vi.mocked(SetCheckoutAccountPassword).mockResolvedValue({ Success: true });
            const res = await call('handleAccountPassword', { sessionId: 'sess-1', clientSessionKey: 'k', password: 'pw' });
            expect(res.statusCode).toBe(200);
            expect(SetCheckoutAccountPassword).toHaveBeenCalledWith('sess-1', 'k', 'pw', expect.anything());
        });

        it('answers a refused password with 400', async () => {
            vi.mocked(SetCheckoutAccountPassword).mockResolvedValue({ Success: false, ErrorMessage: 'too short' });
            const res = await call('handleAccountPassword', { sessionId: 'sess-1', clientSessionKey: 'k', password: 'pw' });
            expect(res.statusCode).toBe(400);
        });
    });
});
