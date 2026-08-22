/**
 * Unit tests for CheckoutSessionService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWidgetSave = vi.fn().mockResolvedValue(true);
const mockWidgetLoad = vi.fn().mockResolvedValue(true);
const mockSessionSave = vi.fn().mockResolvedValue(true);
const mockSessionLoad = vi.fn().mockResolvedValue(true);
const mockOrderSave = vi.fn().mockResolvedValue(true);
const mockOrderLoad = vi.fn().mockResolvedValue(true);

class MockCheckoutWidget {
    ID = 'widget-1';
    Name = 'Annual AI Summit Registration';
    CompanyID = 'comp-10';
    Status = 'Active';
    Configuration = JSON.stringify({ theme: { primaryColor: '#2563eb' }, allowCoupons: true });
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

class MockOrderLine {
    ID = 'line-1';
    OrderHeaderID = 'order-999';
    ProductID = 'prod-1';
    Quantity = 1;
    LineNumber = 1;
    UnitPrice = 0;
    LineTotalGross = 0;
    Description: string | null = null;
    Extension = {
        EnsureEntity: vi.fn().mockResolvedValue({
            Set: vi.fn(),
            Get: vi.fn()
        })
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
    Lines = {
        Items: [] as MockOrderLine[],
        Create: vi.fn().mockImplementation(() => {
            const line = new MockOrderLine();
            line.ID = `line-${this.Lines.Items.length + 1}`;
            this.Lines.Items.push(line);
            return Promise.resolve(line);
        }),
        Clear: vi.fn().mockImplementation(() => {
            this.Lines.Items = [];
        })
    };
}

const mockWidgetInstance = new MockCheckoutWidget();
const mockSessionInstance = new MockCheckoutSession();
const mockOrderInstance = new MockOrderHeader();

const mockClaimCreate = vi.fn().mockResolvedValue({});

vi.mock('@memberjunction/core-entities-server', () => ({
    IdentityClaimEngineServer: {
        Instance: {
            CreateClaim: (params: unknown, user?: unknown) => mockClaimCreate(params, user)
        }
    }
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            GetEntityObject = vi.fn().mockImplementation((name: string) => {
                if (name.includes('Checkout Widgets')) return Promise.resolve(mockWidgetInstance);
                if (name.includes('Checkout Sessions')) return Promise.resolve(mockSessionInstance);
                if (name.includes('Order Headers')) return Promise.resolve(mockOrderInstance);
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
                        Results: [mockSessionInstance]
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        }
    };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    OrderHeaderEntity: MockOrderHeader,
    OrderLineEntity: MockOrderLine,
    mjBizAppsOrdersCheckoutSessionEntity: MockCheckoutSession,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity: class {},
    mjBizAppsOrdersCheckoutWidgetEntity: MockCheckoutWidget
}));

import { CheckoutSessionService } from '../CheckoutSessionService.js';

describe('CheckoutSessionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSessionInstance.Status = 'Open';
        mockSessionInstance.DraftOrderID = 'order-999';
        mockOrderInstance.Status = 'Draft';
        mockOrderInstance.TotalGross = 0;
        mockOrderInstance.Lines.Items = [];
        mockWidgetLoad.mockResolvedValue(true);
        mockSessionLoad.mockResolvedValue(true);
        mockOrderLoad.mockResolvedValue(true);
    });

    describe('InitializeSession', () => {
        it('requires a distribution slug and clientSessionKey', async () => {
            const res1 = await CheckoutSessionService.InitializeSession('', 'key-1');
            expect(res1.Success).toBe(false);

            const res2 = await CheckoutSessionService.InitializeSession('summit-2026', '');
            expect(res2.Success).toBe(false);
        });

        it('initializes a session and parses widget configuration', async () => {
            const res = await CheckoutSessionService.InitializeSession('summit-2026', 'client-xyz');
            expect(res.Success).toBe(true);
            expect(res.SessionID).toBe('sess-123');
            expect(res.WidgetName).toBe('Annual AI Summit Registration');
            expect(res.Configuration).toHaveProperty('allowCoupons', true);
        });
    });

    describe('UpdateDraft', () => {
        it('assembles draft order graph using order.Lines and saves atomically', async () => {
            const linesInput = [
                { ProductID: 'prod-1', Quantity: 2 }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'guest@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mockOrderInstance.Save).toHaveBeenCalled();
            expect(mockSessionInstance.Save).toHaveBeenCalled();
            expect(res.Lines.length).toBe(1);
            expect(res.Lines[0].ProductID).toBe('prod-1');
        });

        it('attaches attendee extension information for conference products', async () => {
            const linesInput = [
                {
                    ProductID: 'prod-ticket',
                    Quantity: 1,
                    Attendees: [
                        { FirstName: 'Alice', LastName: 'Smith', Email: 'alice@example.com' }
                    ]
                }
            ];

            const res = await CheckoutSessionService.UpdateDraft('sess-123', 'alice@example.com', linesInput);
            expect(res.Success).toBe(true);
            expect(mockOrderInstance.Save).toHaveBeenCalled();
            expect(res.Lines[0].Description).toContain('Alice Smith');
        });
    });

    describe('CompleteCheckout', () => {
        it('confirms $0 order immediately and creates identity claim via IdentityClaimEngineServer', async () => {
            mockOrderInstance.TotalGross = 0;
            mockSessionInstance.Email = 'guest@example.com';

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mockOrderInstance.Status).toBe('Confirmed');
            expect(mockOrderInstance.Save).toHaveBeenCalled();
            expect(mockClaimCreate).toHaveBeenCalled();
        });

        it('returns processing status for orders with a balance due', async () => {
            mockOrderInstance.TotalGross = 500;

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');
            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Processing');
            expect(mockSessionInstance.Status).toBe('Processing');
        });
    });
});
