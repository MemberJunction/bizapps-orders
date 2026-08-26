/**
 * Unit tests for EntitlementGrantClaimDriver
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { BaseIdentityClaimDriver, type ClaimRedeemContext, type ClaimContext, type MJIdentityClaimEntity } from '@memberjunction/core-entities';

const mockGrantSave = vi.fn().mockResolvedValue(true);
const mockGrantLoad = vi.fn().mockResolvedValue(true);
const mockPushProvisioningForGrant = vi.fn().mockResolvedValue({
    Considered: 0, Provisioned: 0, Revoked: 0, Failed: 0, Skipped: 0, Exhausted: 0,
});

class MockEntitlementGrant {
    ID = 'grant-100';
    BeneficiaryPersonID: string | null = null;
    ProductEntitlementID = 'pe-200';
    Status: 'Active' | 'Expired' | 'Revoked' | 'Suspended' = 'Active';
    ProvisionedAt: Date | null = null;
    LatestResult = { Success: true, Message: '' };
    ProviderToUse = {};

    /** Backing store for the pre-CodeGen provisioning columns (see entitlementProvisioningAdapter). */
    dynamicFields: Record<string, unknown> = {};
    Get = vi.fn((name: string) => this.dynamicFields[name]);
    Set = vi.fn((name: string, value: unknown) => {
        this.dynamicFields[name] = value;
    });

    Load = mockGrantLoad;
    Save = mockGrantSave;
}

const mockGrantInstance = new MockEntitlementGrant();

vi.mock('../EntitlementProvisioningService.js', () => ({
    PushProvisioningForGrant: (...args: unknown[]) => mockPushProvisioningForGrant(...args),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            GetEntityObject = vi.fn().mockResolvedValue(mockGrantInstance);
        },
        RunView: class {
            RunView = vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'person-99', Email: 'redeemer@example.com' }]
            });
        }
    };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    mjBizAppsOrdersEntitlementGrantEntity: MockEntitlementGrant
}));

import { EntitlementGrantClaimDriver } from '../EntitlementGrantClaimDriver.js';

describe('EntitlementGrantClaimDriver', () => {
    let driver: EntitlementGrantClaimDriver;
    const mockUser = {
        ID: 'user-1',
        Email: 'redeemer@example.com'
    } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGrantInstance.ID = 'grant-100';
        mockGrantInstance.BeneficiaryPersonID = null;
        mockGrantInstance.Status = 'Active';
        mockGrantInstance.ProvisionedAt = null;
        mockGrantInstance.dynamicFields = {};
        mockGrantSave.mockResolvedValue(true);
        mockGrantLoad.mockResolvedValue(true);
        mockPushProvisioningForGrant.mockResolvedValue({
            Considered: 0, Provisioned: 0, Revoked: 0, Failed: 0, Skipped: 0, Exhausted: 0,
        });
        driver = new EntitlementGrantClaimDriver();
    });

    describe('OnClaim', () => {
        it('activates grant and binds beneficiary person from authenticated user email', async () => {
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-1',
                    ClaimTypeID: 'type-1',
                    NormalizedEmail: 'redeemer@example.com',
                    RecordID: 'grant-100',
                    EntityID: 'ent-grant',
                    PayloadJSON: JSON.stringify({ GrantID: 'grant-100' }),
                    Status: 'Pending'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);

            expect(result.Success).toBe(true);
            expect(mockGrantInstance.BeneficiaryPersonID).toBe('person-99');
            expect(mockGrantInstance.Status).toBe('Active');
            expect(mockGrantInstance.ProvisionedAt).toBeInstanceOf(Date);
            expect(mockGrantSave).toHaveBeenCalled();
            // The claim settles the real beneficiary, so any outstanding downstream obligation is
            // pushed immediately rather than waiting for the sweep.
            expect(mockPushProvisioningForGrant).toHaveBeenCalledWith(
                'grant-100', expect.anything(), mockUser,
            );
        });

        it('re-opens a Provisioned grant as Pending when the beneficiary changes', async () => {
            mockGrantInstance.dynamicFields['ProvisioningStatus'] = 'Provisioned';
            mockGrantInstance.BeneficiaryPersonID = 'someone-else';

            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-1',
                    RecordID: 'grant-100',
                    NormalizedEmail: 'redeemer@example.com',
                    Status: 'Pending'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(true);
            expect(mockGrantInstance.dynamicFields['ProvisioningStatus']).toBe('Pending');
            expect(mockGrantInstance.dynamicFields['ProvisionAttempts']).toBe(0);
        });

        it('returns failure if claim has no GrantID in RecordID or Payload', async () => {
            const context: ClaimRedeemContext = {
                Claim: {
                    ID: 'claim-1',
                    RecordID: null,
                    PayloadJSON: null,
                    NormalizedEmail: 'redeemer@example.com'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            const result = await driver.OnClaim(context);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not reference an EntitlementGrant');
        });
    });

    describe('OnRevoke', () => {
        it('marks active grant as revoked', async () => {
            mockGrantInstance.Status = 'Active';

            const context: ClaimContext = {
                Claim: {
                    ID: 'claim-1',
                    RecordID: 'grant-100'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            await driver.OnRevoke(context);
            expect(mockGrantInstance.Status).toBe('Revoked');
            expect(mockGrantSave).toHaveBeenCalled();
        });
    });

    describe('OnExpire', () => {
        it('marks active grant as expired', async () => {
            mockGrantInstance.Status = 'Active';

            const context: ClaimContext = {
                Claim: {
                    ID: 'claim-1',
                    RecordID: 'grant-100'
                } as unknown as MJIdentityClaimEntity,
                User: mockUser
            };

            await driver.OnExpire(context);
            expect(mockGrantInstance.Status).toBe('Expired');
            expect(mockGrantSave).toHaveBeenCalled();
        });
    });

    describe('ClassFactory Registration', () => {
        it('resolves EntitlementGrantClaimDriver by BaseIdentityClaimDriver class identity', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseIdentityClaimDriver>(
                BaseIdentityClaimDriver,
                'EntitlementGrantClaimDriver'
            );
            expect(instance).toBeInstanceOf(EntitlementGrantClaimDriver);
        });
    });
});
