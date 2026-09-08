/**
 * Unit tests for CheckoutSessionService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => {
    const mockWidgetSave = vi.fn().mockResolvedValue(true);
    const mockWidgetLoad = vi.fn().mockResolvedValue(true);
    const mockSessionSave = vi.fn().mockResolvedValue(true);
    const mockSessionLoad = vi.fn().mockResolvedValue(true);
    const mockOrderSave = vi.fn().mockResolvedValue(true);
    const mockOrderLoad = vi.fn().mockResolvedValue(true);
    const mockProductLoad = vi.fn().mockResolvedValue(true);
    const mockProductTypeLoad = vi.fn().mockResolvedValue(true);
    const mockPersonSave = vi.fn().mockResolvedValue(true);
    const mockIntentLoad = vi.fn().mockResolvedValue(true);
    const mockIntentSave = vi.fn().mockResolvedValue(true);
    const mockCaptureExecute = vi.fn().mockResolvedValue({
        Success: true,
        Output: { Success: true, PaymentHeaderID: 'ph-1', Status: 'Captured' }
    });

    const DEFAULT_WIDGET_CONFIG = JSON.stringify({
        productId: 'prod-1',
        theme: { primaryColor: '#2563eb' },
        allowCoupons: true,
        customUI: {
            css: '.custom-summit { border: 2px solid red; }',
            js: 'console.log("Summit Widget Loaded");',
            theme: { primaryColor: '#059669' }
        }
    });

    class MockCheckoutWidget {
        ID = 'widget-1';
        Name = 'Annual AI Summit Registration';
        CompanyID = 'comp-10';
        Status = 'Active';
        Configuration = DEFAULT_WIDGET_CONFIG;
        CustomCSS: string | null = null;
        CustomJS: string | null = null;
        Load = mockWidgetLoad;
        Save = mockWidgetSave;
    }

    class MockCheckoutSession {
        ID = 'sess-123';
        CheckoutWidgetID = 'widget-1';
        DistributionID = 'dist-1';
        ClientSessionKey = 'client-xyz';
        Email: string | null = null;
        PersonID: string | null = null;
        DraftOrderID: string | null = null;
        Status = 'Open';
        PaymentIntentID: string | null = null;
        MetadataJSON: string | null = null;
        ExpiresAt = new Date(Date.now() + 7200000);
        LatestResult = { Success: true, Message: '', CompleteMessage: '' };
        NewRecord = vi.fn();
        Load = mockSessionLoad;
        Save = mockSessionSave;
    }

    class MockProduct {
        ID = 'prod-1';
        Name = 'Conference VIP Pass';
        ProductTypeID = 'ptype-event';
        CompanyID = 'comp-10';
        MaxQuantityPerLine: number | null = null;
        Load = mockProductLoad;
    }

    class MockProductType {
        ID = 'ptype-event';
        Name = 'Event Registration';
        OrderLineExtensionEntity = 'MJ_BizApps_Orders: Event Order Lines';
        Configuration = JSON.stringify({
            unitMode: 'perUnit',
            customUI: {
                css: '.event-line { background: #f0fdf4; }',
                js: 'console.log("Event Type Hook");'
            }
        });
        Load = mockProductTypeLoad;
    }

    class MockPerson {
        ID = 'person-new-1';
        Set = vi.fn();
        Get = vi.fn().mockReturnValue('person-new-1');
        NewRecord = vi.fn();
        Save = mockPersonSave;
        LatestResult = { Success: true, Message: '', CompleteMessage: '' };
    }

    class MockPaymentIntent {
        ID = 'pi-row-1';
        Status = 'Succeeded';
        Amount = 100;
        PaymentProviderID = 'pp-1';
        OrderHeaderID: string | null = null;
        BillToPersonID: string | null = null;
        BillToOrganizationID: string | null = null;
        LatestResult = { Success: true, Message: '', CompleteMessage: '' };
        Load = mockIntentLoad;
        Save = mockIntentSave;
    }

    class MockExtensionEntity {
        Set = vi.fn();
        Get = vi.fn();
        EntityInfo = {
            Fields: [
                { Name: 'PersonID', Type: 'uniqueidentifier', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: 'CheckInAt', Type: 'datetime', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: 'DietaryPreferences', Type: 'nvarchar', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: 'Comments', Type: 'nvarchar', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: 'CustomCount', Type: 'int', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                { Name: 'IsVIP', Type: 'bit', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false }
            ]
        };
    }

    class MockOrderLine {
        ID = 'line-1';
        OrderHeaderID = 'order-999';
        ProductID = 'prod-1';
        Quantity = 1;
        LineNumber = 1;
        UnitPrice = 0;
        LineTotalGross = 0;
        Description: string | null = null;
        extensionInstance = new MockExtensionEntity();
        Extension = {
            EnsureEntity: vi.fn().mockImplementation(() => Promise.resolve(this.extensionInstance))
        };
    }

    class MockOrderHeader {
        ID = 'order-999';
        OrderNumber = 'ORD-2026-0001';
        CompanyID = 'comp-10';
        Status = 'Draft';
        Origin = 'Widget';
        SourceCheckoutWidgetID = 'widget-1';
        BillToPersonID: string | null = null;
        BillToOrganizationID: string | null = null;
        ShipToPersonID: string | null = null;
        TotalGross = 0;
        AmountPaid = 0;
        OrderDate: Date | null = null;
        LatestResult = { Success: true, Message: '', CompleteMessage: '' };
        NewRecord = vi.fn();
        Load = mockOrderLoad;
        LoadWithLines = vi.fn().mockResolvedValue(true);
        Save = mockOrderSave;
        Confirm = vi.fn().mockImplementation(() => {
            this.Status = 'Confirmed';
            return Promise.resolve();
        });
        Lines = {
            Items: [] as MockOrderLine[],
            Create: vi.fn().mockImplementation(() => {
                const line = new MockOrderLine();
                line.ID = `line-${this.Lines.Items.length + 1}`;
                this.Lines.Items.push(line);
                return Promise.resolve(line);
            }),
            Add: vi.fn().mockImplementation((line: MockOrderLine) => {
                this.Lines.Items.push(line);
            }),
            Clear: vi.fn().mockImplementation(() => {
                this.Lines.Items = [];
            })
        };
    }

    const mockPricingPrice = vi.fn().mockImplementation((ctx: { Lines: MockOrderLine[] }) => {
        for (const line of ctx.Lines) {
            const price = line.UnitPrice ?? 0;
            line.UnitPrice = price;
            line.LineTotalGross = price * line.Quantity;
        }
        return Promise.resolve({});
    });

    class MockOrderPricingService {
        Price = mockPricingPrice;
    }

    return {
        DEFAULT_WIDGET_CONFIG,
        MockCheckoutWidget,
        MockCheckoutSession,
        MockProduct,
        MockProductType,
        MockPerson,
        MockPaymentIntent,
        MockExtensionEntity,
        MockOrderLine,
        MockOrderHeader,
        MockOrderPricingService,
        mockPricingPrice,
        mockWidgetSave,
        mockWidgetLoad,
        mockSessionSave,
        mockSessionLoad,
        mockOrderSave,
        mockOrderLoad,
        mockProductLoad,
        mockProductTypeLoad,
        mockPersonSave,
        mockIntentLoad,
        mockIntentSave,
        mockCaptureExecute,
        mockClaimCreate: vi.fn().mockResolvedValue({ ID: 'claim-1' }),
        mockOpenPaymentIntent: vi.fn().mockResolvedValue({
            Success: true,
            PaymentIntentID: 'pi-row-1',
            ProviderIntentID: 'pi_gw_1',
            Status: 'Processing',
            ClientSecret: 'cs_test_secret'
        }),
        mockWidgetInstance: new MockCheckoutWidget(),
        mockSessionInstance: new MockCheckoutSession(),
        mockOrderInstance: new MockOrderHeader(),
        mockProductInstance: new MockProduct(),
        mockProductTypeInstance: new MockProductType(),
        mockPersonInstance: new MockPerson(),
        mockPaymentIntentInstance: new MockPaymentIntent(),
        lastRunViewParams: undefined as { EntityName?: string; MaxRows?: number; Fields?: string[]; ExtraFilter?: string } | undefined,
        sessionRunViewResults: undefined as Array<{ ID: string }> | undefined,
        mockLoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        mockProductBySKU: vi.fn((sku: string | null | undefined) => {
            const wanted = sku?.trim().toLowerCase();
            if (wanted === 'conf-2027') return { ID: 'prod-1', SKU: 'CONF-2027' };
            return undefined;
        }),
    };
});

// The engine import moved to the local fallback module (see identityClaimContracts.ts);
// partial-mock it so the real contracts stay live and only the engine is overridden.
vi.mock('../identityClaimContracts.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../identityClaimContracts.js')>()),
    IdentityClaimEngineServer: {
        Instance: {
            CreateClaim: (params: unknown, user?: unknown) => mocks.mockClaimCreate(params, user)
        }
    }
}));

vi.mock('../PaymentIntentService.js', () => ({
    OpenPaymentIntent: (request: unknown, provider: unknown, user: unknown) => mocks.mockOpenPaymentIntent(request, provider, user)
}));

vi.mock('../CapturePaymentOperation.js', () => ({
    CapturePaymentOperation: class {
        ExecuteServer = (...args: unknown[]) => mocks.mockCaptureExecute(...args);
    }
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            Entities = [
                {
                    Name: 'MJ_BizApps_Orders: Event Order Lines',
                    Fields: [
                        { Name: 'PersonID', Type: 'uniqueidentifier', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
                        { Name: 'DietaryPreferences', Type: 'nvarchar', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, DisplayName: 'Dietary Preferences' },
                        { Name: 'Comments', Type: 'nvarchar', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, DisplayName: 'Special Requests' },
                        { Name: 'CustomCount', Type: 'int', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, DisplayName: 'Custom Count' }
                    ],
                    ParentEntityFieldNames: new Set(['ID', 'ProductID', 'Quantity', 'UnitPrice'])
                },
                { Name: 'MJ_BizApps_Orders: Order Headers', ID: 'entity-order-headers-id', Fields: [] }
            ];
            EntityByName = vi.fn().mockImplementation((name: string) => {
                return this.Entities.find((e: { Name: string }) => e.Name.toLowerCase() === name.toLowerCase());
            });
            GetEntityObject = vi.fn().mockImplementation((name: string) => {
                if (name.includes('Checkout Widgets')) return Promise.resolve(mocks.mockWidgetInstance);
                if (name.includes('Checkout Sessions')) return Promise.resolve(mocks.mockSessionInstance);
                if (name.includes('Order Headers')) return Promise.resolve(mocks.mockOrderInstance);
                if (name.includes('Payment Intents')) return Promise.resolve(mocks.mockPaymentIntentInstance);
                if (name.includes('Products') && !name.includes('Product Types')) return Promise.resolve(mocks.mockProductInstance);
                if (name.includes('Product Types')) return Promise.resolve(mocks.mockProductTypeInstance);
                if (name.includes('People') || name.includes('Persons')) return Promise.resolve(mocks.mockPersonInstance);
                return Promise.resolve({});
            });
        },
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string; MaxRows?: number; Fields?: string[]; ExtraFilter?: string }) => {
                mocks.lastRunViewParams = params;
                if (params.EntityName.includes('Checkout Widget Distributions')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'dist-1', CheckoutWidgetID: 'widget-1', IsActive: true }]
                    });
                }
                if (params.EntityName.includes('Checkout Sessions')) {
                    return Promise.resolve({
                        Success: true,
                        Results: mocks.sessionRunViewResults ?? [mocks.mockSessionInstance]
                    });
                }
                if (params.EntityName.includes('People') || params.EntityName.includes('Persons')) {
                    return Promise.resolve({
                        Success: true,
                        Results: []
                    });
                }
                if (params.EntityName.includes('Products') && !params.EntityName.includes('Product Types')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'prod-1' }]
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        }
    };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    OrderHeaderEntity: mocks.MockOrderHeader,
    OrderLineEntity: mocks.MockOrderLine,
    OrderPricingService: mocks.MockOrderPricingService,
    mjBizAppsOrdersOrderLineEntity: mocks.MockOrderLine,
    mjBizAppsOrdersCheckoutSessionEntity: mocks.MockCheckoutSession,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity: class {},
    mjBizAppsOrdersCheckoutWidgetEntity: mocks.MockCheckoutWidget,
    mjBizAppsOrdersPaymentIntentEntity: mocks.MockPaymentIntent,
    mjBizAppsOrdersProductEntity: mocks.MockProduct,
    mjBizAppsOrdersProductTypeEntity: mocks.MockProductType,
    LoadOrdersEngine: mocks.mockLoadOrdersEngine,
    OrdersEngine: {
        Instance: {
            ProductBySKU: mocks.mockProductBySKU,
        },
    },
}));

import { CheckoutSessionService } from '../CheckoutSessionService.js';
import { Metadata } from '@memberjunction/core';

const KEY = 'client-xyz';
const testUser = { ID: 'test-user-1', Email: 'service@example.com' } as unknown as UserInfo;

describe('CheckoutSessionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (Metadata as unknown as { Provider: unknown }).Provider = {
            PlatformKey: 'sqlserver',
            ExecuteSQL: vi.fn().mockResolvedValue([{ ID: 'sess-123' }])
        };
        mocks.mockSessionInstance.Status = 'Open';
        mocks.mockSessionInstance.DraftOrderID = null;
        mocks.mockSessionInstance.PersonID = null;
        mocks.mockSessionInstance.Email = null;
        mocks.mockSessionInstance.PaymentIntentID = null;
        mocks.mockSessionInstance.MetadataJSON = null;
        mocks.mockSessionInstance.ClientSessionKey = KEY;
        mocks.mockSessionInstance.ExpiresAt = new Date(Date.now() + 7200000);
        mocks.mockOrderInstance.Status = 'Draft';
        mocks.mockOrderInstance.TotalGross = 0;
        mocks.mockOrderInstance.BillToPersonID = null;
        mocks.mockOrderInstance.ShipToPersonID = null;
        mocks.mockOrderInstance.Lines.Items = [];
        mocks.mockWidgetInstance.Configuration = mocks.DEFAULT_WIDGET_CONFIG;
        mocks.mockWidgetInstance.CompanyID = 'comp-10';
        mocks.mockProductInstance.CompanyID = 'comp-10';
        mocks.mockProductInstance.ID = 'prod-1';
        mocks.lastRunViewParams = undefined;
        mocks.sessionRunViewResults = undefined;
        mocks.mockPaymentIntentInstance.Status = 'Succeeded';
        mocks.mockPaymentIntentInstance.Amount = 100;
        mocks.mockPaymentIntentInstance.PaymentProviderID = 'pp-1';
        mocks.mockPaymentIntentInstance.OrderHeaderID = null;
        mocks.mockPaymentIntentInstance.BillToPersonID = null;
        mocks.mockOrderInstance.AmountPaid = 0;
        mocks.mockIntentSave.mockResolvedValue(true);
        mocks.mockCaptureExecute.mockResolvedValue({
            Success: true,
            Output: { Success: true, PaymentHeaderID: 'ph-1', Status: 'Captured' }
        });
        mocks.mockWidgetLoad.mockResolvedValue(true);
        mocks.mockSessionLoad.mockResolvedValue(true);
        mocks.mockOrderLoad.mockResolvedValue(true);
        mocks.mockProductLoad.mockResolvedValue(true);
        mocks.mockProductTypeLoad.mockResolvedValue(true);
        mocks.mockIntentLoad.mockResolvedValue(true);
        mocks.mockSessionSave.mockResolvedValue(true);
        mocks.mockClaimCreate.mockResolvedValue({ ID: 'claim-1' });
        mocks.mockLoadOrdersEngine.mockResolvedValue(undefined);
        mocks.mockProductBySKU.mockImplementation((sku: string | null | undefined) => {
            const wanted = sku?.trim().toLowerCase();
            if (wanted === 'conf-2027') return { ID: 'prod-1', SKU: 'CONF-2027' };
            return undefined;
        });
    });

    describe('InitializeSession', () => {
        it('requires a distribution slug and clientSessionKey', async () => {
            const res1 = await CheckoutSessionService.InitializeSession('', 'key-1');
            expect(res1.Success).toBe(false);

            const res2 = await CheckoutSessionService.InitializeSession('summit-2026', '');
            expect(res2.Success).toBe(false);
        });

        it('initializes a session and extracts customUI configuration', async () => {
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.SessionID).toBe('sess-123');
            expect(res.WidgetName).toBe('Annual AI Summit Registration');
            expect(res.CustomCSS).toBe('.custom-summit { border: 2px solid red; }');
            expect(res.CustomJS).toBe('console.log("Summit Widget Loaded");');
            expect(res.Configuration?.customUI).toBeDefined();
        });

        it('merges ProductType customUI and unitMode under widget overlay, and fills productName', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productId: 'prod-1',
                title: 'Summit',
                customUI: { css: '.widget-wins { color: blue; }' },
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.productName).toBe('Conference VIP Pass');
            expect(res.Configuration?.unitMode).toBe('perUnit');
            expect(res.Configuration?.customUI?.css).toBe('.widget-wins { color: blue; }');
            expect(res.Configuration?.customUI?.js).toBe('console.log("Event Type Hook");');
        });

        it('auto-discovers extension fields from ProductType metadata when not explicitly specified', async () => {
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            const extFields = res.Configuration?.extensionFields as Array<{ name: string; label: string }>;
            expect(extFields).toBeDefined();
            expect(Array.isArray(extFields)).toBe(true);
            // Should contain core person fields plus discovered extension fields
            const names = extFields.map(f => f.name);
            expect(names).toContain('firstName');
            expect(names).toContain('lastName');
            expect(names).toContain('email');
            expect(names).toContain('dietaryPreferences');
            expect(names).toContain('comments');
            expect(names).toContain('customCount');
        });

        it('writes a SKU-resolved productId onto Configuration so the public host can draft a line', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productSku: 'CONF-2027',
                title: 'Summit',
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.productId).toBe('prod-1');
            expect(res.Configuration?.productSku).toBe('CONF-2027');
            expect(mocks.mockLoadOrdersEngine).toHaveBeenCalled();
            expect(mocks.mockProductBySKU).toHaveBeenCalledWith('CONF-2027');
        });

        it('still writes SKU-resolved productId when extensionFields are already authored', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productSku: 'CONF-2027',
                extensionFields: [{ name: 'seat', label: 'Seat', type: 'text' }],
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.productId).toBe('prod-1');
            expect(res.Configuration?.extensionFields).toEqual([
                { name: 'seat', label: 'Seat', type: 'text' },
            ]);
        });

        it('matches SKU case-insensitively through OrdersEngine.ProductBySKU', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productSku: 'conf-2027',
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.productId).toBe('prod-1');
        });

        it('does not invent a productId when the SKU is missing from the catalog cache', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productSku: 'NO-SUCH-SKU',
                title: 'Broken widget',
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.productId).toBeUndefined();
            expect(mocks.mockLoadOrdersEngine).toHaveBeenCalled();
        });

        it('allowlists public Configuration keys and drops secret-shaped and unknown keys', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({
                productId: 'prod-1',
                stripePublishableKey: 'pk_test_ok',
                paymentWebhookSecret: 'whsec_leak_me',
                internalApiKey: 'sk_leak_me',
                accessToken: 'tok_leak',
                token: 'also_leak',
                paymentProviderId: 'pp-should-stay-server-side',
                signingKey: 'nope',
                allowAnyProduct: true,
            });
            const res = await CheckoutSessionService.InitializeSession('summit-2026', KEY);
            expect(res.Success).toBe(true);
            expect(res.Configuration?.stripePublishableKey).toBe('pk_test_ok');
            expect(res.Configuration?.productId).toBe('prod-1');
            expect(res.Configuration?.paymentWebhookSecret).toBeUndefined();
            expect(res.Configuration?.internalApiKey).toBeUndefined();
            expect(res.Configuration?.accessToken).toBeUndefined();
            expect(res.Configuration?.token).toBeUndefined();
            expect(res.Configuration?.paymentProviderId).toBeUndefined();
            expect(res.Configuration?.signingKey).toBeUndefined();
            expect(res.Configuration?.allowAnyProduct).toBeUndefined();
        });
    });

    describe('UpdateDraft', () => {
        it('rejects a ProductID that is not on the widget catalog', async () => {
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-other-campaign', Quantity: 1 }]
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/does not sell that product/i);
        });

        it('rejects a draft when the widget catalog is empty (fail closed, not open catalog)', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ title: 'No product configured' });
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-1', Quantity: 1 }]
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/not configured with a product/i);
        });

        it('allowlists a SKU-only widget from the OrdersEngine catalog cache', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ productSku: 'CONF-2027' });
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-1', Quantity: 1 }]
            );
            expect(res.ErrorMessage ?? '').not.toMatch(/not configured with a product/i);
            expect(res.ErrorMessage ?? '').not.toMatch(/does not sell that product/i);
            expect(mocks.mockLoadOrdersEngine).toHaveBeenCalled();
            expect(mocks.mockProductBySKU).toHaveBeenCalledWith('CONF-2027');
        });

        it('rejects a product whose CompanyID is null even when the ProductID is in the catalog', async () => {
            mocks.mockProductInstance.CompanyID = null as unknown as string;
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-1', Quantity: 1 }]
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/does not sell that product/i);
        });

        it('allowAnyProduct still requires the product to share the widget CompanyID', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ allowAnyProduct: true });
            mocks.mockProductInstance.CompanyID = 'other-company';
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-foreign', Quantity: 1 }]
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/does not sell that product/i);
        });

        it('allowAnyProduct accepts a same-company ProductID that is not in productId/allowedProductIds', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ allowAnyProduct: true });
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-same-company-other-sku', Quantity: 1 }]
            );
            expect(res.Success).toBe(true);
        });

        it('allowAnyProduct with no widget CompanyID refuses an arbitrary ProductID', async () => {
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ allowAnyProduct: true });
            mocks.mockWidgetInstance.CompanyID = '' as unknown as string;
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                KEY,
                'a@b.com',
                [{ ProductID: 'prod-arbitrary', Quantity: 1 }]
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/not configured for open-catalog sale/i);
        });

        it('rejects a mismatched client session key', async () => {
            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'wrong-key', 'a@b.com', [{ ProductID: 'prod-1', Quantity: 1 }]);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('session key');
        });

        it('rejects and expires a session past its TTL', async () => {
            mocks.mockSessionInstance.ExpiresAt = new Date(Date.now() - 60_000);
            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 1 }]);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('expired');
            expect(mocks.mockSessionInstance.Status).toBe('Expired');
        });

        it('assembles draft order graph using order.Lines and saves state in session metadata', async () => {
            const linesInput = [
                { ProductID: 'prod-1', Quantity: 2 }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'guest@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(mocks.mockSessionInstance.MetadataJSON).toBeDefined();
            expect(res.Lines.length).toBe(1);
            expect(res.Lines[0].ProductID).toBe('prod-1');
        });

        it('does not create Person rows on the draft path (resolve-only)', async () => {
            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'guest@example.com', [
                { ProductID: 'prod-1', Quantity: 1, Attendees: [{ FirstName: 'Draft', LastName: 'Only', Email: 'draft@example.com' }] }
            ]);
            expect(res.Success).toBe(true);
            // The Person RunView lookup returns [] and creation must NOT run on drafts.
            expect(mocks.mockPersonSave).not.toHaveBeenCalled();
        });

        it('attaches attendee extension information for conference products', async () => {
            const linesInput = [
                {
                    ProductID: 'prod-1',
                    Quantity: 1,
                    Attendees: [
                        { FirstName: 'Alice', LastName: 'Smith', Email: 'alice@example.com', DietaryPreferences: 'Vegan' }
                    ]
                }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'alice@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(res.Lines[0].Description).toContain('Alice Smith');
        });

        it('handles generic polymorphic extension fields with type coercion, strictly enforces catalog derivation, and drops blocked fields', async () => {
            const linesInput = [
                {
                    ProductID: 'prod-1',
                    Quantity: 1,
                    ExtensionData: {
                        EntityName: 'AttackerMaliciousEntityOverride', // Client tries to override entity name
                        Fields: {
                            FirstName: 'Bob',
                            LastName: 'Jones',
                            Email: 'bob@example.com',
                            PersonID: 'attacker-injected-guid', // Blocked field
                            CheckInAt: '2026-01-01T00:00:00Z', // Blocked field
                            __mj_CreatedAt: '2026-01-01T00:00:00Z', // Blocked field
                            CustomCount: '42',
                            IsVIP: 'true'
                        }
                    }
                }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'bob@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(res.Lines[0].Description).toContain('Bob Jones');

            // Assert catalog entity was used for EnsureEntity, NOT the client override
            const orderLine = mocks.mockOrderInstance.Lines.Items[0] as unknown as {
                Extension: { EnsureEntity: ReturnType<typeof vi.fn> };
                extensionInstance: { Set: ReturnType<typeof vi.fn> };
            };
            expect(orderLine.Extension.EnsureEntity).toHaveBeenCalledWith('MJ_BizApps_Orders: Event Order Lines');
            expect(orderLine.Extension.EnsureEntity).not.toHaveBeenCalledWith('AttackerMaliciousEntityOverride');

            // Assert blocked fields were never passed to Set
            expect(orderLine.extensionInstance.Set).not.toHaveBeenCalledWith('PersonID', 'attacker-injected-guid');
            expect(orderLine.extensionInstance.Set).not.toHaveBeenCalledWith('CheckInAt', expect.anything());
            expect(orderLine.extensionInstance.Set).not.toHaveBeenCalledWith('__mj_CreatedAt', expect.anything());
            // Assert allowed fields WERE set
            expect(orderLine.extensionInstance.Set).toHaveBeenCalledWith('CustomCount', 42);
            expect(orderLine.extensionInstance.Set).toHaveBeenCalledWith('IsVIP', true);
        });

        it('rejects invalid or out-of-range quantities in UpdateDraft', async () => {
            // Negative quantity
            const resNeg = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: -1 }]);
            expect(resNeg.Success).toBe(false);
            expect(resNeg.ErrorMessage).toContain('positive integer');

            // Zero quantity
            const resZero = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 0 }]);
            expect(resZero.Success).toBe(false);
            expect(resZero.ErrorMessage).toContain('positive integer');

            // Float quantity
            const resFloat = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 2.5 }]);
            expect(resFloat.Success).toBe(false);
            expect(resFloat.ErrorMessage).toContain('positive integer');

            // Exceeds maxQuantityPerLine
            mocks.mockProductInstance.MaxQuantityPerLine = 5;
            const resMax = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 10 }]);
            expect(resMax.Success).toBe(false);
            expect(resMax.ErrorMessage).toContain('exceeds maximum allowed quantity of 5');
            mocks.mockProductInstance.MaxQuantityPerLine = null;
        });

        it('applies the default server-side quantity ceiling when no max is configured', async () => {
            mocks.mockProductInstance.MaxQuantityPerLine = null;
            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 101 }]);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('exceeds maximum allowed quantity of 100');
        });

        it('detaches a previously opened payment intent when the priced total changes', async () => {
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({ TotalGross: 250 });

            // New pricing walk yields 0 (default mock) — total changed → intent detaches
            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a@b.com', [{ ProductID: 'prod-1', Quantity: 1 }]);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.PaymentIntentID).toBeNull();
        });

        it('splits multi-unit purchases into discrete lines when ProductType Configuration unitMode is perUnit', async () => {
            mocks.mockProductTypeInstance.Configuration = JSON.stringify({ unitMode: 'perUnit' });
            const linesInput = [
                {
                    ProductID: 'prod-1',
                    Quantity: 2,
                    Units: [
                        { FirstName: 'Attendee1', LastName: 'User', Email: 'a1@test.com' },
                        { FirstName: 'Attendee2', LastName: 'User', Email: 'a2@test.com' }
                    ]
                }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', KEY, 'a1@test.com', linesInput);
            expect(res.Success).toBe(true);
            expect(res.Lines.length).toBe(2);
        });
    });

    describe('OpenPaymentIntentForSession', () => {
        it('rejects a mismatched client session key', async () => {
            const res = await CheckoutSessionService.OpenPaymentIntentForSession('sess-123', 'wrong-key', testUser);
            expect(res.Success).toBe(false);
        });

        it('refuses when the session has no balance due', async () => {
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({ TotalGross: 0 });
            const res = await CheckoutSessionService.OpenPaymentIntentForSession('sess-123', KEY, testUser);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('no balance due');
            expect(mocks.mockOpenPaymentIntent).not.toHaveBeenCalled();
        });

        it('refuses when the widget has no paymentProviderId configured', async () => {
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({ TotalGross: 100 });
            const res = await CheckoutSessionService.OpenPaymentIntentForSession('sess-123', KEY, testUser);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('paymentProviderId');
        });

        it('opens an intent from the server-priced snapshot amount and stamps the session', async () => {
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({ TotalGross: 100 });
            mocks.mockWidgetInstance.Configuration = JSON.stringify({ productId: 'prod-1', paymentProviderId: 'pp-1', currency: 'USD' });

            const res = await CheckoutSessionService.OpenPaymentIntentForSession('sess-123', KEY, testUser);
            expect(res.Success).toBe(true);
            expect(res.PaymentIntentID).toBe('pi-row-1');
            expect(res.ClientSecret).toBe('cs_test_secret');
            expect(res.Amount).toBe(100);
            expect(mocks.mockSessionInstance.PaymentIntentID).toBe('pi-row-1');
            // The amount passed to the provider is the SNAPSHOT total, never a caller input
            const request = mocks.mockOpenPaymentIntent.mock.calls[0][0] as { Amount: number; PaymentProviderID: string };
            expect(request.Amount).toBe(100);
            expect(request.PaymentProviderID).toBe('pp-1');
        });
    });

    describe('CompleteCheckout', () => {
        it('rejects a mismatched client session key', async () => {
            const res = await CheckoutSessionService.CompleteCheckout('sess-123', 'wrong-key');
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('session key');
        });

        it('replays a Confirmed session idempotently, returning the existing order without re-booking', async () => {
            mocks.mockSessionInstance.Status = 'Confirmed';
            mocks.mockSessionInstance.DraftOrderID = 'order-999';

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(res.OrderID).toBe('order-999');
            expect(mocks.mockOrderInstance.Confirm).not.toHaveBeenCalled();
        });

        it('rejects and expires a session past its TTL', async () => {
            mocks.mockSessionInstance.ExpiresAt = new Date(Date.now() - 60_000);
            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.Status).toBe('Expired');
        });

        it('confirms $0 order immediately, resolves the payer Person, and creates identity claim via IdentityClaimEngineServer', async () => {
            mocks.mockSessionInstance.Email = 'guest@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalled();
            // The payer Person was created from the session email (name derived from local part)
            expect(mocks.mockSessionInstance.PersonID).toBe('person-new-1');
            expect(mocks.mockOrderInstance.BillToPersonID).toBe('person-new-1');
            expect(mocks.mockOrderInstance.ShipToPersonID).toBe('person-new-1');
            // The claim ships the entity GUID (not the entity name) and the buyer email
            expect(mocks.mockClaimCreate).toHaveBeenCalled();
            const claimParams = mocks.mockClaimCreate.mock.calls[0][0] as { ClaimTypeName: string; EntityID: string; NormalizedEmail: string };
            expect(claimParams.ClaimTypeName).toBe('GuestOrder');
            expect(claimParams.EntityID).toBe('entity-order-headers-id');
            expect(claimParams.NormalizedEmail).toBe('guest@example.com');
            expect(res.ClaimToken).toBe('claim-1');
        });

        it('refuses completion when no payer can be resolved (no email captured)', async () => {
            mocks.mockSessionInstance.Email = null;
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('buyer email');
            expect(res.Status).toBe('Open');
            expect(mocks.mockOrderInstance.Confirm).not.toHaveBeenCalled();
        });

        it('confirms paid order when the payment intent has settled and covers the total', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });
            mocks.mockPaymentIntentInstance.Status = 'Succeeded';
            mocks.mockPaymentIntentInstance.Amount = 100;
            mocks.mockPricingPrice.mockImplementationOnce((ctx: { Lines: Array<{ UnitPrice: number; LineTotalGross: number; Quantity: number }> }) => {
                for (const line of ctx.Lines) {
                    line.UnitPrice = 100;
                    line.LineTotalGross = 100 * line.Quantity;
                }
                return Promise.resolve({});
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY, testUser);
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mocks.mockSessionInstance.Status).toBe('Confirmed');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalled();
            expect(mocks.mockCaptureExecute).toHaveBeenCalledTimes(1);
            const captureInput = mocks.mockCaptureExecute.mock.calls[0][0] as {
                PaymentIntentID: string;
                Amount: number;
                TenderCode: string;
                IdempotencyKey: string;
                Allocations: Array<{ OrderHeaderID: string; Amount: number }>;
                PaymentDetail: { PaymentProviderID: string } | null;
            };
            expect(captureInput.PaymentIntentID).toBe('pi-row-1');
            expect(captureInput.Amount).toBe(100);
            expect(captureInput.TenderCode).toBe('CreditCard');
            expect(captureInput.IdempotencyKey).toBe('checkout-complete:sess-123');
            expect(captureInput.Allocations).toEqual([{ OrderHeaderID: 'order-999', Amount: 100 }]);
            expect(captureInput.PaymentDetail).toEqual({ PaymentProviderID: 'pp-1' });
            expect(mocks.mockPaymentIntentInstance.OrderHeaderID).toBe('order-999');
        });

        it('still confirms the order when CapturePayment fails after commit', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });
            mocks.mockPaymentIntentInstance.Status = 'Succeeded';
            mocks.mockPaymentIntentInstance.Amount = 100;
            mocks.mockPricingPrice.mockImplementationOnce((ctx: { Lines: Array<{ UnitPrice: number; LineTotalGross: number; Quantity: number }> }) => {
                for (const line of ctx.Lines) {
                    line.UnitPrice = 100;
                    line.LineTotalGross = 100 * line.Quantity;
                }
                return Promise.resolve({});
            });
            mocks.mockCaptureExecute.mockResolvedValueOnce({
                Success: true,
                Output: { Success: false, Message: 'UnknownTender', Blockers: [{ Message: 'nope' }] }
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY, testUser);
            expect(res.Success).toBe(true);
            expect(res.OrderID).toBe('order-999');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalled();
        });

        it('on Confirmed replay, books CapturePayment when the order is still unpaid', async () => {
            mocks.mockSessionInstance.Status = 'Confirmed';
            mocks.mockSessionInstance.DraftOrderID = 'order-999';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockOrderInstance.TotalGross = 100;
            mocks.mockOrderInstance.AmountPaid = 0;
            mocks.mockOrderInstance.BillToPersonID = 'person-new-1';
            mocks.mockPaymentIntentInstance.Status = 'Succeeded';

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY, testUser);
            expect(res.Success).toBe(true);
            expect(res.OrderID).toBe('order-999');
            expect(mocks.mockOrderInstance.Confirm).not.toHaveBeenCalled();
            expect(mocks.mockCaptureExecute).toHaveBeenCalledTimes(1);
        });

        it('BookSettledCheckoutPaymentIfNeeded books CapturePayment for a Confirmed unpaid session', async () => {
            mocks.mockSessionInstance.Status = 'Confirmed';
            mocks.mockSessionInstance.DraftOrderID = 'order-999';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.sessionRunViewResults = [{ ID: 'sess-123' }];
            mocks.mockOrderInstance.TotalGross = 100;
            mocks.mockOrderInstance.AmountPaid = 0;
            mocks.mockOrderInstance.BillToPersonID = 'person-new-1';
            mocks.mockPaymentIntentInstance.Status = 'Succeeded';

            const book = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded('pi-row-1', testUser);
            expect(book.Attempted).toBe(true);
            expect(book.Booked).toBe(true);
            expect(mocks.mockCaptureExecute).toHaveBeenCalledTimes(1);
        });

        it('BookSettledCheckoutPaymentIfNeeded is a no-op when no Confirmed checkout session owns the intent', async () => {
            mocks.sessionRunViewResults = [];
            const book = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded('pi-unrelated', testUser);
            expect(book.Attempted).toBe(false);
            expect(book.Booked).toBe(false);
            expect(mocks.mockCaptureExecute).not.toHaveBeenCalled();
        });

        it('skips CapturePayment for a $0 order even when a context user is present', async () => {
            mocks.mockSessionInstance.Email = 'guest@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY, testUser);
            expect(res.Success).toBe(true);
            expect(mocks.mockCaptureExecute).not.toHaveBeenCalled();
        });

        it('rejects paid order confirmation when payment capture is missing', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.PaymentIntentID = null;
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            // Make pricing service set total gross > 0
            mocks.mockPricingPrice.mockImplementationOnce((ctx: { Lines: Array<{ UnitPrice: number; LineTotalGross: number; Quantity: number }> }) => {
                for (const line of ctx.Lines) {
                    line.UnitPrice = 100;
                    line.LineTotalGross = 100 * line.Quantity;
                }
                return Promise.resolve({});
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('Cannot confirm paid order');
        });

        it('rejects paid order confirmation when the intent exists but has NOT settled', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });
            mocks.mockPaymentIntentInstance.Status = 'Processing'; // opened, not paid
            mocks.mockPricingPrice.mockImplementationOnce((ctx: { Lines: Array<{ UnitPrice: number; LineTotalGross: number; Quantity: number }> }) => {
                for (const line of ctx.Lines) {
                    line.UnitPrice = 100;
                    line.LineTotalGross = 100 * line.Quantity;
                }
                return Promise.resolve({});
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('not settled');
            expect(mocks.mockOrderInstance.Confirm).not.toHaveBeenCalled();
        });

        it('rejects paid order confirmation when the settled amount does not cover the total', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.PaymentIntentID = 'pi-row-1';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });
            mocks.mockPaymentIntentInstance.Status = 'Succeeded';
            mocks.mockPaymentIntentInstance.Amount = 40; // less than the re-priced 100
            mocks.mockPricingPrice.mockImplementationOnce((ctx: { Lines: Array<{ UnitPrice: number; LineTotalGross: number; Quantity: number }> }) => {
                for (const line of ctx.Lines) {
                    line.UnitPrice = 100;
                    line.LineTotalGross = 100 * line.Quantity;
                }
                return Promise.resolve({});
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('does not cover');
            expect(mocks.mockOrderInstance.Confirm).not.toHaveBeenCalled();
        });

        it('rejects duplicate or concurrent CompleteCheckout calls when status is not Open', async () => {
            mocks.mockSessionInstance.Status = 'Processing';

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('Session is not in an Open status');
        });

        it('creates a single order line with Quantity 3 when unitMode is perLine', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{
                    ProductID: 'prod-1',
                    Quantity: 3,
                    ExtensionFields: { DietaryPreferences: 'Vegetarian' }
                }]
            });

            // Mock Product without perUnit configuration
            mocks.mockProductTypeInstance.Configuration = JSON.stringify({ unitMode: 'perLine' });
            mocks.mockProductInstance.MaxQuantityPerLine = null;

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(true);
            expect(mocks.mockOrderInstance.Lines.Items).toHaveLength(1);
            expect(mocks.mockOrderInstance.Lines.Items[0].Quantity).toBe(3);
        });

        it('rejects invalid or out-of-range quantities in CompleteCheckout and unlatches session to Open', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: -3 }]
            });

            const resNeg = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(resNeg.Success).toBe(false);
            expect(resNeg.ErrorMessage).toContain('positive integer');
            expect(resNeg.Status).toBe('Open');

            mocks.mockSessionInstance.Status = 'Open';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 0 }]
            });
            const resZero = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(resZero.Success).toBe(false);
            expect(resZero.ErrorMessage).toContain('positive integer');
            expect(resZero.Status).toBe('Open');
        });

        it('recovers and unlatches session to Open when pricing or order execution throws an unexpected error', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            // Make PricingService throw an unexpected exception
            mocks.mockPricingPrice.mockRejectedValueOnce(new Error('Downstream GL mapping service timeout'));

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(false);
            expect(res.Status).toBe('Open');
            expect(res.ErrorMessage).toContain('Downstream GL mapping service timeout');
        });

        it('reports success and never reverts to Open when a failure happens AFTER the order committed', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });
            // The session save after Confirm() fails — the order EXISTS; a revert-to-Open here
            // would let a retry book a second order.
            mocks.mockSessionSave.mockResolvedValue(false);

            const res = await CheckoutSessionService.CompleteCheckout('sess-123', KEY);
            expect(res.Success).toBe(true);
            expect(res.OrderID).toBe('order-999');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalledTimes(1);
            // The atomic Confirmed stamp ran instead
            const provider = (Metadata as unknown as { Provider: { ExecuteSQL: ReturnType<typeof vi.fn> } }).Provider;
            const stampCall = provider.ExecuteSQL.mock.calls.find((c: unknown[]) => String(c[0]).includes("'Confirmed'"));
            expect(stampCall).toBeDefined();
        });

        it('spawns two concurrent CompleteCheckout calls and books exactly ONE order via database CAS', async () => {
            mocks.mockSessionInstance.Email = 'payer@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            let latchCount = 0;
            const mockExecuteSQL = vi.fn().mockImplementation((sql: string) => {
                if (String(sql).includes("'Processing'") && String(sql).includes("'Open'")) {
                    latchCount++;
                    return Promise.resolve(latchCount === 1 ? [{ ID: 'sess-123' }] : []);
                }
                return Promise.resolve([{ ID: 'sess-123' }]);
            });

            (Metadata as unknown as { Provider: unknown }).Provider = {
                PlatformKey: 'sqlserver',
                ExecuteSQL: mockExecuteSQL
            };

            const [res1, res2] = await Promise.all([
                CheckoutSessionService.CompleteCheckout('sess-123', KEY),
                CheckoutSessionService.CompleteCheckout('sess-123', KEY)
            ]);

            // The invariant that matters: exactly one booking. (The loser either errors on the
            // latch or — if it observed the winner's Confirmed state — replays the same order.)
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalledTimes(1);
            expect(res1.Success || res2.Success).toBe(true);
        });
    });

    describe('ReapExpiredOpenSessions', () => {
        it('passes MaxRows so the bound is in the query, not after an unbounded fetch', async () => {
            mocks.mockSessionLoad.mockImplementation(async () => {
                mocks.mockSessionInstance.Status = 'Open';
                return true;
            });
            mocks.sessionRunViewResults = Array.from({ length: 3 }, (_, i) => ({ ID: `expired-${i}` }));
            const n = await CheckoutSessionService.ReapExpiredOpenSessions(testUser, 50);
            expect(mocks.lastRunViewParams?.MaxRows).toBe(50);
            expect(mocks.lastRunViewParams?.Fields).toEqual(['ID']);
            expect(mocks.lastRunViewParams?.ExtraFilter).toMatch(/Status = 'Open'/);
            expect(n).toBe(3);
        });

        it('honours a smaller limit both as MaxRows and as the process cap', async () => {
            mocks.mockSessionLoad.mockImplementation(async () => {
                mocks.mockSessionInstance.Status = 'Open';
                return true;
            });
            mocks.sessionRunViewResults = Array.from({ length: 10 }, (_, i) => ({ ID: `expired-${i}` }));
            const n = await CheckoutSessionService.ReapExpiredOpenSessions(testUser, 2);
            expect(mocks.lastRunViewParams?.MaxRows).toBe(2);
            expect(n).toBe(2);
        });
    });
});
