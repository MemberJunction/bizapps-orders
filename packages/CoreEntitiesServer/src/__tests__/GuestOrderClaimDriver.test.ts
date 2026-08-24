/**
 * Unit tests for GuestOrderClaimDriver
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import {
    BaseIdentityClaimDriver,
    type ClaimRedeemContext,
    type ClaimContext,
    type MJIdentityClaimEntity
} from '@memberjunction/core-entities';

const mockOrderSave = vi.fn().mockResolvedValue(true);
const mockOrderLoad = vi.fn().mockResolvedValue(true);
const mockGrantSave = vi.fn().mockResolvedValue(true);
const mockGrantLoad = vi.fn().mockResolvedValue(true);

class MockOrderHeader {
    ID = 'order-100';
    OrderNumber = 'ORD-100';
    BillToPersonID: string | null = null;
    ShipToPersonID: string | null = null;
    LatestResult = { Success: true, Message: '' };

    Load = mockOrderLoad;
    Save = mockOrderSave;
}

class MockEntitlementGrant {
    ID = 'grant-100';
    BeneficiaryPersonID: string | null = null;
    ProductEntitlementID = 'pe-200';
    Status: 'Active' | 'Expired' | 'Revoked' | 'Pending' = 'Pending';
    ProvisionedAt: Date | null = null;
    LatestResult = { Success: true, Message: '' };

    Load = mockGrantLoad;
    Save = mockGrantSave;
}

const mockOrderInstance = new MockOrderHeader();
const mockGrantInstance = new MockEntitlementGrant();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            GetEntityObject = vi.fn().mockImplementation((entityName: string) => {
                if (entityName.includes('Order Header')) {
                    return Promise.resolve(mockOrderInstance);
                }
                if (entityName.includes('Entitlement Grant')) {
                    return Promise.resolve(mockGrantInstance);
                }
                return Promise.resolve(null);
            });
        },
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string }) => {
                if (params.EntityName.includes('People')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'person-88', Email: 'guest@example.com' }]
                    });
                }
                if (params.EntityName.includes('Entitlement Grants')) {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'grant-100', Status: 'Pending' }]
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        }
    };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    mjBizAppsOrdersOrderHeaderEntity: MockOrderHeader,
    mjBizAppsOrdersEntitlementGrantEntity: MockEntitlementGrant
}));

import { GuestOrderClaimDriver } from '../GuestOrderClaimDriver.js';

describe('GuestOrderClaimDriver', () => {
    let driver: GuestOrderClaimDriver;
    const mockUser = {
        ID: 'user-guest-1',
        Email: 'guest@example.com'
    } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOrderInstance.ID = 'order-100';
        mockOrderInstance.BillToPersonID = null;
        mockOrderInstance.ShipToPersonID = null;
        mockOrderSave.mockResolvedValue(true);
        mockOrderLoad.mockResolvedValue(true);

        mockGrantInstance.ID = 'grant-100';
        mockGrantInstance.BeneficiaryPersonID = null;
        mockGrantInstance.Status = 'Pending';
        mockGrantInstance.ProvisionedAt = null;
        mockGrantSave.mockResolvedValue(true);
        mockGrantLoad.mockResolvedValue(true);

        driver = new GuestOrderClaimDriver();
    });

    describe('OnCreate', () => {
        it('completes without error', async () => {
            const context: ClaimContext = {
                Claim: { ID: 'claim-1', Status: 'Pending' } as unknown as MJIdentityClaimEntity
            };
            await expect(driver.OnCreate(context)).resolves.not.toThrow();
        });
    });

    describe('OnClaim', () => {
        it('links OrderHeader BillTo/ShipTo to redeeming PersonID and cascades to EntitlementGrants', async () => {
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-1',
                    RecordID: 'order-100',
                    Status: 'Pending',
                    NormalizedEmail: 'guest@example.com'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(true);
            expect(result.Data?.OrderID).toBe('order-100');
            expect(result.Data?.PersonID).toBe('person-88');
            expect(result.Data?.CascadedGrants).toEqual(['grant-100']);

            expect(mockOrderInstance.BillToPersonID).toBe('person-88');
            expect(mockOrderInstance.ShipToPersonID).toBe('person-88');
            expect(mockOrderSave).toHaveBeenCalled();

            expect(mockGrantInstance.BeneficiaryPersonID).toBe('person-88');
            expect(mockGrantInstance.Status).toBe('Active');
            expect(mockGrantInstance.ProvisionedAt).toBeInstanceOf(Date);
            expect(mockGrantSave).toHaveBeenCalled();
        });

        it('extracts OrderID from PayloadJSON if RecordID is not set', async () => {
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-2',
                    RecordID: null,
                    PayloadJSON: JSON.stringify({ OrderID: 'order-100' }),
                    Status: 'Pending'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(true);
            expect(result.Data?.OrderID).toBe('order-100');
        });

        it('fails if no OrderID can be found in claim', async () => {
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-3',
                    RecordID: null,
                    PayloadJSON: null,
                    Status: 'Pending'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not reference an OrderHeader RecordID');
        });

        it('fails if order load returns false', async () => {
            mockOrderLoad.mockResolvedValueOnce(false);
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-4',
                    RecordID: 'order-missing',
                    Status: 'Pending'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Order with ID order-missing not found');
        });
    });

    describe('OnRevoke and OnExpire', () => {
        it('completes OnRevoke without error', async () => {
            const context: ClaimContext = {
                Claim: { ID: 'claim-1' } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };
            await expect(driver.OnRevoke(context)).resolves.not.toThrow();
        });

        it('completes OnExpire without error', async () => {
            const context: ClaimContext = {
                Claim: { ID: 'claim-1' } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };
            await expect(driver.OnExpire(context)).resolves.not.toThrow();
        });
    });

    describe('ClassFactory Registration', () => {
        it('resolves GuestOrderClaimDriver by BaseIdentityClaimDriver class identity', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseIdentityClaimDriver>(
                BaseIdentityClaimDriver,
                'GuestOrderClaimDriver'
            );
            expect(instance).toBeInstanceOf(GuestOrderClaimDriver);
        });
    });
});
