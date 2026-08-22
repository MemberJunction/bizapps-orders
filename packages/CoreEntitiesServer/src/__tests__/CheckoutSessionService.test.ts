/**
 * Unit tests for CheckoutSessionService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

    class MockCheckoutWidget {
        ID = 'widget-1';
        Name = 'Annual AI Summit Registration';
        CompanyID = 'comp-10';
        Status = 'Active';
        Configuration = JSON.stringify({
            theme: { primaryColor: '#2563eb' },
            allowCoupons: true,
            customUI: {
                css: '.custom-summit { border: 2px solid red; }',
                js: 'console.log("Summit Widget Loaded");',
                theme: { primaryColor: '#059669' }
            }
        });
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
        DraftOrderID: string | null = null;
        Status = 'Open';
        ExpiresAt = new Date(Date.now() + 7200000);
        NewRecord = vi.fn();
        Load = mockSessionLoad;
        Save = mockSessionSave;
    }

    class MockProduct {
        ID = 'prod-1';
        Name = 'Conference VIP Pass';
        ProductTypeID = 'ptype-event';
        MaxQuantityPerLine: number | null = 1;
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
    }

    class MockExtensionEntity {
        Set = vi.fn();
        Get = vi.fn();
        EntityInfo = {
            Fields: [
                { Name: 'PersonID', Type: 'uniqueidentifier', AllowUpdateAPI: true, IsPrimaryKey: false, IsVirtual: false },
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
        TotalGross = 0;
        OrderDate: Date | null = null;
        LatestResult = { Success: true, Message: '' };
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

    class MockOrderPricingService {
        Price = vi.fn().mockImplementation((ctx: { Lines: MockOrderLine[] }) => {
            for (const line of ctx.Lines) {
                line.UnitPrice = 100;
                line.LineTotalGross = 100 * line.Quantity;
            }
            return Promise.resolve({});
        });
    }

    return {
        MockCheckoutWidget,
        MockCheckoutSession,
        MockProduct,
        MockProductType,
        MockPerson,
        MockExtensionEntity,
        MockOrderLine,
        MockOrderHeader,
        MockOrderPricingService,
        mockWidgetSave,
        mockWidgetLoad,
        mockSessionSave,
        mockSessionLoad,
        mockOrderSave,
        mockOrderLoad,
        mockProductLoad,
        mockProductTypeLoad,
        mockPersonSave,
        mockClaimCreate: vi.fn().mockResolvedValue({}),
        mockWidgetInstance: new MockCheckoutWidget(),
        mockSessionInstance: new MockCheckoutSession(),
        mockOrderInstance: new MockOrderHeader(),
        mockProductInstance: new MockProduct(),
        mockProductTypeInstance: new MockProductType(),
        mockPersonInstance: new MockPerson()
    };
});

vi.mock('@memberjunction/core-entities-server', () => ({
    IdentityClaimEngineServer: {
        Instance: {
            CreateClaim: (params: unknown, user?: unknown) => mocks.mockClaimCreate(params, user)
        }
    }
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            GetEntityObject = vi.fn().mockImplementation((name: string) => {
                if (name.includes('Checkout Widgets')) return Promise.resolve(mocks.mockWidgetInstance);
                if (name.includes('Checkout Sessions')) return Promise.resolve(mocks.mockSessionInstance);
                if (name.includes('Order Headers')) return Promise.resolve(mocks.mockOrderInstance);
                if (name.includes('Products') && !name.includes('Product Types')) return Promise.resolve(mocks.mockProductInstance);
                if (name.includes('Product Types')) return Promise.resolve(mocks.mockProductTypeInstance);
                if (name.includes('People') || name.includes('Persons')) return Promise.resolve(mocks.mockPersonInstance);
                return Promise.resolve({});
            });
        },
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string }) => {
                if (params.EntityName.includes('Distributions')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'dist-1', CheckoutWidgetID: 'widget-1', Slug: 'summit-2026', Status: 'Active' }]
                    });
                }
                if (params.EntityName.includes('Checkout Sessions')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [mocks.mockSessionInstance]
                    });
                }
                if (params.EntityName.includes('People') || params.EntityName.includes('Persons')) {
                    return Promise.resolve({
                        Success: true,
                        Results: []
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
    mjBizAppsOrdersProductEntity: mocks.MockProduct,
    mjBizAppsOrdersProductTypeEntity: mocks.MockProductType
}));

import { CheckoutSessionService } from '../CheckoutSessionService.js';

describe('CheckoutSessionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockSessionInstance.Status = 'Open';
        mocks.mockSessionInstance.DraftOrderID = 'order-999';
        mocks.mockOrderInstance.Status = 'Draft';
        mocks.mockOrderInstance.TotalGross = 0;
        mocks.mockOrderInstance.Lines.Items = [];
        mocks.mockWidgetLoad.mockResolvedValue(true);
        mocks.mockSessionLoad.mockResolvedValue(true);
        mocks.mockOrderLoad.mockResolvedValue(true);
        mocks.mockProductLoad.mockResolvedValue(true);
        mocks.mockProductTypeLoad.mockResolvedValue(true);
    });

    describe('InitializeSession', () => {
        it('requires a distribution slug and clientSessionKey', async () => {
            const res1 = await CheckoutSessionService.InitializeSession('', 'key-1');
            expect(res1.Success).toBe(false);

            const res2 = await CheckoutSessionService.InitializeSession('summit-2026', '');
            expect(res2.Success).toBe(false);
        });

        it('initializes a session and extracts customUI configuration', async () => {
            const res = await CheckoutSessionService.InitializeSession('summit-2026', 'client-xyz');
            expect(res.Success).toBe(true);
            expect(res.SessionID).toBe('sess-123');
            expect(res.WidgetName).toBe('Annual AI Summit Registration');
            expect(res.CustomCSS).toBe('.custom-summit { border: 2px solid red; }');
            expect(res.CustomJS).toBe('console.log("Summit Widget Loaded");');
            expect(res.Configuration?.customUI).toBeDefined();
        });
    });

    describe('UpdateDraft', () => {
        it('assembles draft order graph using order.Lines and saves state in session metadata', async () => {
            const linesInput = [
                { ProductID: 'prod-1', Quantity: 2 }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'guest@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(mocks.mockSessionInstance.MetadataJSON).toBeDefined();
            expect(res.Lines.length).toBe(1);
            expect(res.Lines[0].ProductID).toBe('prod-1');
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

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'alice@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(res.Lines[0].Description).toContain('Alice Smith');
        });

        it('handles generic polymorphic extension fields with type coercion', async () => {
            const linesInput = [
                {
                    ProductID: 'prod-1',
                    Quantity: 1,
                    ExtensionData: {
                        EntityName: 'MJ_BizApps_Orders: Event Order Lines',
                        Fields: {
                            FirstName: 'Bob',
                            LastName: 'Jones',
                            Email: 'bob@example.com',
                            CustomCount: '42',
                            IsVIP: 'true'
                        }
                    }
                }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'bob@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mocks.mockSessionInstance.Save).toHaveBeenCalled();
            expect(res.Lines[0].Description).toContain('Bob Jones');
        });

        it('splits multi-unit purchases into discrete lines when ProductType Configuration unitMode is perUnit', async () => {
            mocks.mockProductInstance.MaxQuantityPerLine = null; // Let ProductType Configuration enforce unitMode
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

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'a1@test.com', linesInput);
            expect(res.Success).toBe(true);
            expect(res.Lines.length).toBe(2);
        });
    });

    describe('CompleteCheckout', () => {
        it('confirms $0 order immediately and creates identity claim via IdentityClaimEngineServer', async () => {
            mocks.mockSessionInstance.Email = 'guest@example.com';
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalled();
            expect(mocks.mockClaimCreate).toHaveBeenCalled();
        });

        it('confirms paid order and executes BaseEntity lifecycle booking', async () => {
            mocks.mockSessionInstance.MetadataJSON = JSON.stringify({
                Lines: [{ ProductID: 'prod-1', Quantity: 1 }]
            });

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mocks.mockSessionInstance.Status).toBe('Confirmed');
            expect(mocks.mockOrderInstance.Confirm).toHaveBeenCalled();
        });
    });
});
