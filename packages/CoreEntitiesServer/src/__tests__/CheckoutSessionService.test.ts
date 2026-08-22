/**
 * Unit tests for CheckoutSessionService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mockWidgetSave = vi.fn().mockResolvedValue(true);
const mockWidgetLoad = vi.fn().mockResolvedValue(true);
const mockSessionSave = vi.fn().mockResolvedValue(true);
const mockSessionLoad = vi.fn().mockResolvedValue(true);
const mockOrderSave = vi.fn().mockResolvedValue(true);
const mockOrderLoad = vi.fn().mockResolvedValue(true);
const mockLineSave = vi.fn().mockResolvedValue(true);
const mockLineDelete = vi.fn().mockResolvedValue(true);

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
    Save = mockOrderSave;
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
    NewRecord = vi.fn();
    Save = mockLineSave;
    Delete = mockLineDelete;
}

const mockWidgetInstance = new MockCheckoutWidget();
const mockSessionInstance = new MockCheckoutSession();
const mockOrderInstance = new MockOrderHeader();
const mockLineInstance = new MockOrderLine();

const mockClaimCreate = vi.fn().mockResolvedValue({});

vi.mock('@memberjunction/core-entities', () => ({
    IdentityClaimEngine: {
        Instance: {
            CreateClaim: (params: unknown, user?: unknown) => mockClaimCreate(params, user)
        }
    }
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        GetEntityObject = vi.fn().mockImplementation((name: string) => {
            if (name.includes('Checkout Widgets')) return Promise.resolve(mockWidgetInstance);
            if (name.includes('Checkout Sessions')) return Promise.resolve(mockSessionInstance);
            if (name.includes('Order Headers')) return Promise.resolve(mockOrderInstance);
            if (name.includes('Order Lines')) return Promise.resolve(mockLineInstance);
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
            if (params.EntityName.includes('Order Lines')) {
                return Promise.resolve({
                    Success: true,
                    Results: []
                });
            }
            return Promise.resolve({ Success: true, Results: [] });
        });
    }
}));

vi.mock('@mj-biz-apps/orders-entities', () => ({
    mjBizAppsOrdersCheckoutSessionEntity: MockCheckoutSession,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity: class {},
    mjBizAppsOrdersCheckoutWidgetEntity: MockCheckoutWidget,
    mjBizAppsOrdersOrderHeaderEntity: MockOrderHeader,
    mjBizAppsOrdersOrderLineEntity: MockOrderLine
}));

import { CheckoutSessionService } from '../CheckoutSessionService.js';

describe('CheckoutSessionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSessionInstance.Status = 'Open';
        mockSessionInstance.DraftOrderID = 'order-999';
        mockOrderInstance.Status = 'Draft';
        mockOrderInstance.TotalGross = 0;
        mockWidgetLoad.mockResolvedValue(true);
        mockSessionLoad.mockResolvedValue(true);
        mockOrderLoad.mockResolvedValue(true);
    });

    describe('InitializeSession', () => {
        it('resolves active widget by slug and returns initialized session metadata', async () => {
            const res = await CheckoutSessionService.InitializeSession('summit-2026', 'client-xyz');

            expect(res.Success).toBe(true);
            expect(res.WidgetName).toBe('Annual AI Summit Registration');
            expect(res.Configuration).toEqual({ theme: { primaryColor: '#2563eb' }, allowCoupons: true });
            expect(res.SessionID).toBe('sess-123');
        });

        it('returns error if slug is missing', async () => {
            const res = await CheckoutSessionService.InitializeSession('', 'client-xyz');
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('slug is required');
        });
    });

    describe('UpdateDraft', () => {
        it('builds draft order lines and computes line totals', async () => {
            const res = await CheckoutSessionService.UpdateDraft(
                'sess-123',
                'buyer@example.com',
                [
                    {
                        ProductID: 'prod-event',
                        Quantity: 2,
                        Attendees: [
                            { FirstName: 'Alice', LastName: 'Smith', Email: 'alice@example.com' },
                            { FirstName: 'Bob', LastName: 'Jones', Email: 'bob@example.com' }
                        ]
                    }
                ]
            );

            expect(res.Success).toBe(true);
            expect(res.OrderID).toBe('order-999');
            expect(mockLineSave).toHaveBeenCalled();
            expect(mockOrderSave).toHaveBeenCalled();
        });
    });

    describe('CompleteCheckout', () => {
        it('immediately confirms free ($0) orders and mints pending identity claims for buyer email', async () => {
            mockOrderInstance.TotalGross = 0;
            mockSessionInstance.Email = 'buyer@example.com';

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');

            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Confirmed');
            expect(mockOrderInstance.Status).toBe('Confirmed');
            expect(mockSessionInstance.Status).toBe('Confirmed');
            expect(mockClaimCreate).toHaveBeenCalledWith(expect.objectContaining({
                ClaimTypeName: 'EntitlementGrant',
                NormalizedEmail: 'buyer@example.com'
            }), undefined);
        });

        it('sets paid order status to Processing for gateway payment capture', async () => {
            mockOrderInstance.TotalGross = 150.00;

            const res = await CheckoutSessionService.CompleteCheckout('sess-123');

            expect(res.Success).toBe(true);
            expect(res.Status).toBe('Processing');
            expect(mockSessionInstance.Status).toBe('Processing');
        });
    });
});
