/**
 * Unit tests for PersonAccountLinkClaimDriver — the Person↔User identity link on claim redemption.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { BaseIdentityClaimDriver, type ClaimRedeemContext, type MJIdentityClaimEntity } from '@memberjunction/core-entities';

const mocks = vi.hoisted(() => {
    const personSave = vi.fn().mockResolvedValue(true);
    class MockPerson {
        ID = 'person-1';
        fields: Record<string, unknown> = {};
        LatestResult = { CompleteMessage: '' };
        Get = vi.fn((name: string) => this.fields[name]);
        Set = vi.fn((name: string, value: unknown) => {
            this.fields[name] = value;
        });
        Save = personSave;
    }
    return {
        MockPerson,
        personSave,
        personInstance: new MockPerson(),
        // Per-test RunView results, keyed by a marker found in the ExtraFilter.
        runViewByFilter: new Map<string, Array<{ ID: string }>>(),
        loadShouldThrow: false,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            GetEntityObject = vi.fn(async (_name: string, _key: unknown, _user: unknown) => {
                if (mocks.loadShouldThrow) throw new Error('record not found');
                return mocks.personInstance;
            });
        },
        RunView: class {
            RunView = vi.fn(async (params: { ExtraFilter: string }) => {
                for (const [marker, results] of mocks.runViewByFilter) {
                    if (params.ExtraFilter.includes(marker)) return { Success: true, Results: results };
                }
                return { Success: true, Results: [] };
            });
        },
    };
});

import { PersonAccountLinkClaimDriver } from '../PersonAccountLinkClaimDriver.js';

const user = { ID: 'USER-9', Email: 'buyer@example.com' } as unknown as UserInfo;

function claimContext(recordID: string | null, payload?: Record<string, unknown>): ClaimRedeemContext {
    return {
        Claim: {
            ID: 'claim-1',
            RecordID: recordID,
            PayloadJSON: payload ? JSON.stringify(payload) : null,
            NormalizedEmail: 'buyer@example.com',
        } as unknown as MJIdentityClaimEntity,
        User: user,
    };
}

describe('PersonAccountLinkClaimDriver', () => {
    let driver: PersonAccountLinkClaimDriver;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.personInstance.fields = {};
        mocks.personSave.mockResolvedValue(true);
        mocks.runViewByFilter.clear();
        mocks.loadShouldThrow = false;
        driver = new PersonAccountLinkClaimDriver();
    });

    it('stamps LinkedUserID on the Person the claim names', async () => {
        const result = await driver.OnClaim(claimContext('person-1'));
        expect(result.Success).toBe(true);
        expect(mocks.personInstance.fields['LinkedUserID']).toBe('USER-9');
        expect(mocks.personSave).toHaveBeenCalled();
    });

    it('is idempotent when the person is already linked to this same account (case-insensitive)', async () => {
        mocks.personInstance.fields['LinkedUserID'] = 'user-9';
        const result = await driver.OnClaim(claimContext('person-1'));
        expect(result.Success).toBe(true);
        expect((result.Data as { AlreadyLinked?: boolean }).AlreadyLinked).toBe(true);
        expect(mocks.personSave).not.toHaveBeenCalled();
    });

    it('refuses to re-point a person already linked to a DIFFERENT account', async () => {
        mocks.personInstance.fields['LinkedUserID'] = 'SOMEONE-ELSE';
        const result = await driver.OnClaim(claimContext('person-1'));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('different account');
        expect(mocks.personSave).not.toHaveBeenCalled();
    });

    it('reads the PersonID from the payload when RecordID is absent', async () => {
        const result = await driver.OnClaim(claimContext(null, { PersonID: 'person-1' }));
        expect(result.Success).toBe(true);
        expect(mocks.personInstance.fields['LinkedUserID']).toBe('USER-9');
    });

    it('falls back to a single UNLINKED email match when the claim names nothing', async () => {
        mocks.runViewByFilter.set('LinkedUserID IS NULL', [{ ID: 'person-1' }]);
        const result = await driver.OnClaim(claimContext(null));
        expect(result.Success).toBe(true);
        expect(mocks.personInstance.fields['LinkedUserID']).toBe('USER-9');
    });

    it('refuses a non-deterministic email match (two unlinked People share the email)', async () => {
        mocks.runViewByFilter.set('LinkedUserID IS NULL', [{ ID: 'person-1' }, { ID: 'person-2' }]);
        const result = await driver.OnClaim(claimContext(null));
        expect(result.Success).toBe(false);
        expect(mocks.personSave).not.toHaveBeenCalled();
    });

    it('reports a load failure instead of throwing', async () => {
        mocks.loadShouldThrow = true;
        const result = await driver.OnClaim(claimContext('person-404'));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('could not be loaded');
    });

    it('resolves by DriverClass through the ClassFactory (the metadata claim type binding)', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseIdentityClaimDriver>(
            BaseIdentityClaimDriver,
            'PersonAccountLinkClaimDriver',
        );
        expect(instance).toBeInstanceOf(PersonAccountLinkClaimDriver);
    });
});
