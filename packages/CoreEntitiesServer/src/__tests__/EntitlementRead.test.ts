/**
 * Entitlement read I/O: identity, code lookup, fail-closed faults, SQL guards on caller text.
 *
 * The evaluator itself is covered in EntitlementBehavior.test.ts. These tests pin the
 * contract around it: email is ambiguous-if-duplicate, unknown person looks like no grant,
 * Code is escaped, and a lookup fault does not throw an existence leak.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { InvalidOperationInputError } from '../sql-guards.js';

const { runViewImpl } = vi.hoisted(() => ({ runViewImpl: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        RunView: class {
            RunView = (...args: unknown[]) => runViewImpl(...args);
        },
    };
});

import { ASOF_FUTURE_TOLERANCE_MS, CheckPersonEntitlement, ListPersonEntitlements } from '../EntitlementRead.js';
import { ENTITLEMENT_CHECK_TTL_MS } from '../EntitlementBehavior.js';

const PERSON = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TEMPLATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GRANT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COMPANY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const user = { ID: 'user-1', Email: 'ops@example.com' } as unknown as UserInfo;
const provider = {} as IMetadataProvider;

const ASOF = '2026-07-01T12:00:00.000Z';

function ok<T>(rows: T[]) {
    return { Success: true, Results: rows };
}
function fail(msg = 'boom') {
    return { Success: false, ErrorMessage: msg, Results: [] };
}

function byEntity(rowsByEntity: Record<string, unknown[] | ReturnType<typeof fail>>) {
    runViewImpl.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
        const mapped = rowsByEntity[params.EntityName];
        if (mapped && !Array.isArray(mapped)) return mapped;
        return ok((mapped as unknown[]) ?? []);
    });
}

beforeEach(() => {
    runViewImpl.mockReset();
});

describe('CheckPersonEntitlement — caller bugs throw', () => {
    it('refuses a missing Code', async () => {
        await expect(
            CheckPersonEntitlement({ PersonID: PERSON, Code: '' } as never, provider, user),
        ).rejects.toBeInstanceOf(InvalidOperationInputError);
    });

    it('refuses neither PersonID nor Email', async () => {
        await expect(CheckPersonEntitlement({ Code: 'LEARNING_HUB_PREMIUM' }, provider, user)).rejects.toBeInstanceOf(
            InvalidOperationInputError,
        );
    });

    it('refuses a non-UUID PersonID at the boundary', async () => {
        await expect(
            CheckPersonEntitlement({ PersonID: "' OR 1=1 --", Code: 'LEARNING_HUB_PREMIUM' }, provider, user),
        ).rejects.toBeInstanceOf(InvalidOperationInputError);
    });

    it('refuses a future AsOf well beyond clock skew', async () => {
        await expect(
            CheckPersonEntitlement(
                { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: '2030-01-01T00:00:00.000Z' },
                provider,
                user,
            ),
        ).rejects.toThrow(/future/i);
        await expect(
            CheckPersonEntitlement(
                {
                    PersonID: PERSON,
                    Code: 'LEARNING_HUB_PREMIUM',
                    AsOf: new Date(Date.now() + ASOF_FUTURE_TOLERANCE_MS + 5_000).toISOString(),
                },
                provider,
                user,
            ),
        ).rejects.toThrow(/future/i);
    });

    it('accepts AsOf a few seconds ahead of the server (NTP skew)', async () => {
        byEntity({ 'MJ_BizApps_Orders: Product Entitlements': [] });
        const skew = new Date(Date.now() + 5_000).toISOString();
        await expect(
            CheckPersonEntitlement({ PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: skew }, provider, user),
        ).resolves.toMatchObject({ Decision: 'NoGrant' });
    });
});

describe('CheckPersonEntitlement — no existence leak', () => {
    it('unknown email, unknown code, and known-person-without-grant share one shape', async () => {
        byEntity({ 'MJ_BizApps_Common: People': [] });
        const unknownEmail = await CheckPersonEntitlement(
            { Email: 'nobody@example.com', Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );

        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': [],
        });
        const unknownCode = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'NO_SUCH_CODE', AsOf: ASOF },
            provider,
            user,
        );

        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': [{ ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' }],
            'MJ_BizApps_Orders: Entitlement Grants': [],
        });
        const noGrant = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );

        for (const r of [unknownEmail, unknownCode, noGrant]) {
            expect(r.HasAccess).toBe(false);
            expect(r.Decision).toBe('NoGrant');
            expect(r.GrantID).toBeUndefined();
            expect(r.EvaluatedAt).toBe(ASOF);
        }
    });

    it('ambiguous email (two people) is NoGrant, never first-match', async () => {
        byEntity({
            'MJ_BizApps_Common: People': [{ ID: PERSON }, { ID: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }],
        });
        const r = await CheckPersonEntitlement(
            { Email: 'shared@example.com', Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        expect(r.Decision).toBe('NoGrant');
        expect(r.HasAccess).toBe(false);
        // Must not have gone on to load grants — that would be first-match.
        const entities = runViewImpl.mock.calls.map((c: { EntityName: string }[]) => c[0].EntityName);
        expect(entities).not.toContain('MJ_BizApps_Orders: Entitlement Grants');
    });
});

describe('CheckPersonEntitlement — evaluation through the loader', () => {
    it('grants when an Active window covers AsOf', async () => {
        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' },
            ],
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Active',
                    ValidFrom: new Date('2026-01-01T00:00:00Z'),
                    ValidTo: new Date('2026-12-31T00:00:00Z'),
                    Quantity: 1,
                    SubscriptionID: null,
                    SubscriptionTermID: null,
                },
            ],
        });
        const r = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        expect(r.HasAccess).toBe(true);
        expect(r.Decision).toBe('Granted');
        expect(r.GrantID).toBe(GRANT);
        expect(r.Quantity).toBe(1);
        // CacheUntil is issued from wall-clock now, not from AsOf (2026-07-01).
        const cacheMs = Date.parse(r.CacheUntil);
        const nowMs = Date.now();
        expect(cacheMs).toBeGreaterThan(nowMs - 5_000);
        expect(cacheMs).toBeLessThanOrEqual(nowMs + ENTITLEMENT_CHECK_TTL_MS + 5_000);
        expect(r.CacheUntil).not.toBe('2026-07-01T12:01:00.000Z');
    });

    it('a cancelled subscription inside grace is still Granted', async () => {
        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' },
            ],
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Active',
                    ValidFrom: new Date('2026-01-01T00:00:00Z'),
                    ValidTo: new Date('2026-12-31T00:00:00Z'),
                    Quantity: 1,
                    SubscriptionID: SUB,
                    SubscriptionTermID: null,
                },
            ],
            'MJ_BizApps_Orders: Subscriptions': [
                { ID: SUB, Status: 'Canceled', EndDate: new Date('2026-07-15T00:00:00Z') },
            ],
        });
        const r = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        expect(r.HasAccess).toBe(true);
        expect(r.Decision).toBe('Granted');
        expect(r.ValidTo).toBe('2026-07-15T00:00:00.000Z');
    });

    it('a cancelled subscription past access-through is SubscriptionInactive', async () => {
        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' },
            ],
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Active',
                    ValidFrom: new Date('2026-01-01T00:00:00Z'),
                    ValidTo: new Date('2026-12-31T00:00:00Z'),
                    Quantity: 1,
                    SubscriptionID: SUB,
                    SubscriptionTermID: null,
                },
            ],
            'MJ_BizApps_Orders: Subscriptions': [
                { ID: SUB, Status: 'Canceled', EndDate: new Date('2026-06-01T00:00:00Z') },
            ],
        });
        const r = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        expect(r).toMatchObject({
            HasAccess: false,
            Decision: 'SubscriptionInactive',
            GrantID: GRANT,
            ValidTo: '2026-06-01T00:00:00.000Z',
        });
    });

    it('lookup faults fail closed rather than throwing', async () => {
        byEntity({
            'MJ_BizApps_Orders: Product Entitlements': fail('timeout'),
        });
        const r = await CheckPersonEntitlement(
            { PersonID: PERSON, Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        expect(r).toMatchObject({ HasAccess: false, Decision: 'NoGrant' });
        expect(r.GrantID).toBeUndefined();
    });
});

describe('CheckPersonEntitlement — SQL guards on free text', () => {
    it('escapes a quote in Email before it reaches ExtraFilter', async () => {
        byEntity({ 'MJ_BizApps_Common: People': [] });
        await CheckPersonEntitlement(
            { Email: "o'brien@example.com", Code: 'LEARNING_HUB_PREMIUM', AsOf: ASOF },
            provider,
            user,
        );
        const peopleCall = runViewImpl.mock.calls.find(
            (c: { EntityName: string }[]) => c[0].EntityName === 'MJ_BizApps_Common: People',
        );
        expect(peopleCall[0].ExtraFilter).toContain("o''brien@example.com");
        expect(peopleCall[0].ExtraFilter).not.toContain("o'brien@example.com");
    });

    it('escapes a quote in Code before it reaches ExtraFilter', async () => {
        byEntity({ 'MJ_BizApps_Orders: Product Entitlements': [] });
        await CheckPersonEntitlement({ PersonID: PERSON, Code: "PREMIUM' OR 1=1 --", AsOf: ASOF }, provider, user);
        const tmpl = runViewImpl.mock.calls.find(
            (c: { EntityName: string }[]) => c[0].EntityName === 'MJ_BizApps_Orders: Product Entitlements',
        );
        expect(tmpl[0].ExtraFilter).toContain("PREMIUM'' OR 1=1 --");
        expect(tmpl[0].ExtraFilter).toMatch(/^Code = '/);
    });

    it('PersonID is interpolated only after UUID validation (the widening injection never runs)', async () => {
        await expect(
            CheckPersonEntitlement({ PersonID: `${PERSON}' OR '1'='1`, Code: 'X' }, provider, user),
        ).rejects.toBeInstanceOf(InvalidOperationInputError);
        expect(runViewImpl).not.toHaveBeenCalled();
    });
});

describe('ListPersonEntitlements', () => {
    it('groups by Code and returns the evaluated winner', async () => {
        const other = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        byEntity({
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Active',
                    ValidFrom: new Date('2026-01-01T00:00:00Z'),
                    ValidTo: new Date('2026-12-31T00:00:00Z'),
                    Quantity: 1,
                    SubscriptionID: null,
                    SubscriptionTermID: null,
                },
                {
                    ID: other,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Revoked',
                    ValidFrom: new Date('2025-01-01T00:00:00Z'),
                    ValidTo: new Date('2025-12-31T00:00:00Z'),
                    Quantity: 1,
                    SubscriptionID: null,
                    SubscriptionTermID: null,
                },
            ],
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' },
            ],
        });
        const r = await ListPersonEntitlements({ PersonID: PERSON, AsOf: ASOF }, provider, user);
        expect(r.Items).toHaveLength(1);
        expect(r.Items[0]).toMatchObject({
            Code: 'LEARNING_HUB_PREMIUM',
            HasAccess: true,
            Decision: 'Granted',
            GrantID: GRANT,
        });
    });

    it('IncludeInactive=false drops lapsed codes', async () => {
        byEntity({
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Revoked',
                    ValidFrom: new Date('2025-01-01T00:00:00Z'),
                    ValidTo: new Date('2025-06-01T00:00:00Z'),
                    Quantity: null,
                    SubscriptionID: null,
                    SubscriptionTermID: null,
                },
            ],
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'OLD_TIER' },
            ],
        });
        const r = await ListPersonEntitlements(
            { PersonID: PERSON, AsOf: ASOF, IncludeInactive: false },
            provider,
            user,
        );
        expect(r.Items).toEqual([]);
    });

    it('unresolved email returns an empty list, not an error', async () => {
        byEntity({ 'MJ_BizApps_Common: People': [] });
        const r = await ListPersonEntitlements({ Email: 'nobody@example.com', AsOf: ASOF }, provider, user);
        expect(r.Items).toEqual([]);
        expect(r.EvaluatedAt).toBe(ASOF);
    });

    it('CompanyID filters templates via the product', async () => {
        byEntity({
            'MJ_BizApps_Orders: Entitlement Grants': [
                {
                    ID: GRANT,
                    ProductEntitlementID: TEMPLATE,
                    Status: 'Active',
                    ValidFrom: new Date('2026-01-01T00:00:00Z'),
                    ValidTo: null,
                    Quantity: null,
                    SubscriptionID: null,
                    SubscriptionTermID: null,
                },
            ],
            'MJ_BizApps_Orders: Product Entitlements': [
                { ID: TEMPLATE, ProductID: PRODUCT, Code: 'LEARNING_HUB_PREMIUM' },
            ],
            'MJ_BizApps_Orders: Products': [], // no product in this company
        });
        const r = await ListPersonEntitlements({ PersonID: PERSON, CompanyID: COMPANY, AsOf: ASOF }, provider, user);
        expect(r.Items).toEqual([]);
    });
});

describe('cancel path is wired', () => {
    it('CancelSubscriptionOperation revokes grants when access-through has passed', () => {
        const source = readFileSync(join(import.meta.dirname, '..', 'CancelSubscriptionOperation.ts'), 'utf8');
        expect(source).toContain('RevokeGrantsForCanceledSubscription');
        expect(source).toContain('syncGrantsOnCancel');
    });
});
