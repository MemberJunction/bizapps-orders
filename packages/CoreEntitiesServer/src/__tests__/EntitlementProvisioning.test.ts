/**
 * Unit tests for the WS-2 entitlement provisioning framework:
 *  - the driver seam (resolve-and-refuse-the-base-class, the NoOp driver)
 *  - the pure terminal-status transition rule
 *  - the push/sweep service (status writes, event rows, backoff, attempt ceiling)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------------------------
// RunView mock: dispatch canned results by EntityName. The service reads order lines, grants,
// templates, and targets — each test seeds what its scenario needs.
// ---------------------------------------------------------------------------------------------
const runViewResults = new Map<string, Array<Record<string, unknown>>>();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn(async (params: { EntityName: string }) => ({
                Success: true,
                Results: runViewResults.get(params.EntityName) ?? [],
            }));
        },
    };
});

import {
    BaseEntitlementProvisioningDriver,
    NoOpEntitlementProvisioningDriver,
    ProvisioningDriverNotConfiguredError,
    ResolveProvisioningDriver,
    type ProvisioningRequest,
    type ProvisioningResult,
} from '../EntitlementProvisioningDriver.js';
import {
    ProvisioningTransitionOnTerminalStatus,
    ENTITLEMENT_PROVISIONING_EVENT_ENTITY,
    ENTITLEMENT_PROVISIONING_TARGET_ENTITY,
} from '../entitlementProvisioningAdapter.js';
import {
    PushProvisioningForOrder,
    ReconcileEntitlementProvisioning,
} from '../EntitlementProvisioningService.js';

const GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const TEMPLATE_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

// A test driver that fails on demand, registered like a real deployment driver would be.
let failingResult: ProvisioningResult = { Success: false, Message: 'downstream boom' };
class FailingTestDriver extends BaseEntitlementProvisioningDriver {
    public override async Provision(_request: ProvisioningRequest): Promise<ProvisioningResult> {
        return failingResult;
    }
    public override async Revoke(_request: ProvisioningRequest): Promise<ProvisioningResult> {
        return failingResult;
    }
}
RegisterClass(BaseEntitlementProvisioningDriver, 'Test.FailingProvisioning')(FailingTestDriver);

/** A mutable entity mock with a Get/Set backing store, mimicking BaseEntity's dynamic access. */
function makeEntityMock(saveResult = true) {
    const fields: Record<string, unknown> = {};
    return {
        ID: 'entity-id',
        fields,
        LatestResult: { CompleteMessage: 'save refused' },
        Load: vi.fn().mockResolvedValue(true),
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(saveResult),
        Get: vi.fn((name: string) => fields[name]),
        Set: vi.fn((name: string, value: unknown) => {
            fields[name] = value;
        }),
    };
}

type EntityMock = ReturnType<typeof makeEntityMock>;

function makeProvider(entityMocks: Record<string, EntityMock[]>): IMetadataProvider {
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            const queue = entityMocks[entityName];
            if (!queue || !queue.length) throw new Error(`No entity mock queued for ${entityName}`);
            return queue.length > 1 ? queue.shift() : queue[0];
        }),
    };
    return provider as unknown as IMetadataProvider;
}

const user = { ID: 'user-1', Email: 'ops@example.com' } as unknown as UserInfo;

function seedHappyPath(overrides?: {
    grant?: Partial<Record<string, unknown>>;
    target?: Partial<Record<string, unknown>>;
    template?: Partial<Record<string, unknown>>;
}) {
    runViewResults.set(ORDER_LINE_ENTITY, [{ ID: 'line-1' }]);
    runViewResults.set(GRANT_ENTITY, [
        {
            ID: 'grant-1',
            ProductEntitlementID: 'pe-1',
            OrderLineID: 'line-1',
            Quantity: 2,
            ValidFrom: null,
            ValidTo: null,
            BeneficiaryPersonID: 'person-1',
            BeneficiaryOrganizationID: null,
            Status: 'Active',
            ProvisioningStatus: 'Pending',
            ProvisionAttempts: 0,
            LastProvisionAttemptAt: null,
            ProvisioningExternalRef: null,
            ...overrides?.grant,
        },
    ]);
    runViewResults.set(TEMPLATE_ENTITY, [
        { ID: 'pe-1', ProductID: 'prod-1', Code: 'LXP_SEAT', ProvisioningTargetID: 'target-1', ...overrides?.template },
    ]);
    runViewResults.set(ENTITLEMENT_PROVISIONING_TARGET_ENTITY, [
        {
            ID: 'target-1',
            Code: 'NoOp',
            Name: 'No-Op',
            DriverClass: 'Orders.NoOpProvisioning',
            Configuration: null,
            Status: 'Active',
            ...overrides?.target,
        },
    ]);
}

describe('ResolveProvisioningDriver', () => {
    it('resolves the NoOp driver by its registered key', () => {
        const driver = ResolveProvisioningDriver('Orders.NoOpProvisioning');
        expect(driver).toBeInstanceOf(NoOpEntitlementProvisioningDriver);
    });

    it('refuses a key that only resolves to the base class', () => {
        expect(() => ResolveProvisioningDriver('Nobody.RegisteredThis')).toThrow(
            ProvisioningDriverNotConfiguredError,
        );
    });

    it('NoOp provisions with a recognisable external ref', async () => {
        const driver = ResolveProvisioningDriver('Orders.NoOpProvisioning');
        const result = await driver.Provision({ GrantID: 'g-9' } as ProvisioningRequest);
        expect(result.Success).toBe(true);
        expect(result.ExternalRef).toBe('noop:g-9');
    });
});

describe('ProvisioningTransitionOnTerminalStatus', () => {
    it('sends a Provisioned grant to RevokePending with a fresh retry budget', () => {
        expect(ProvisioningTransitionOnTerminalStatus('Provisioned')).toMatchObject({
            ProvisioningStatus: 'RevokePending',
            ProvisionAttempts: 0,
        });
    });

    it('sends a never-provisioned grant straight to Revoked', () => {
        expect(ProvisioningTransitionOnTerminalStatus('Pending')?.ProvisioningStatus).toBe('Revoked');
        expect(ProvisioningTransitionOnTerminalStatus('Failed')?.ProvisioningStatus).toBe('Revoked');
    });

    it('changes nothing for NotRequired, RevokePending, or already-Revoked', () => {
        expect(ProvisioningTransitionOnTerminalStatus('NotRequired')).toBeNull();
        expect(ProvisioningTransitionOnTerminalStatus('RevokePending')).toBeNull();
        expect(ProvisioningTransitionOnTerminalStatus('Revoked')).toBeNull();
    });
});

describe('PushProvisioningForOrder', () => {
    beforeEach(() => {
        runViewResults.clear();
        failingResult = { Success: false, Message: 'downstream boom' };
    });

    it('provisions a Pending grant through its target driver and records the success', async () => {
        seedHappyPath();
        const grantMock = makeEntityMock();
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [GRANT_ENTITY]: [grantMock],
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        const summary = await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(summary.Provisioned).toBe(1);
        expect(summary.Failed).toBe(0);
        expect(grantMock.fields['ProvisioningStatus']).toBe('Provisioned');
        expect(grantMock.fields['ProvisioningExternalRef']).toBe('noop:grant-1');
        expect(grantMock.fields['LastProvisionError']).toBeNull();
        expect(grantMock.Save).toHaveBeenCalled();
        expect(eventMock.fields['Operation']).toBe('Provision');
        expect(eventMock.fields['Outcome']).toBe('Succeeded');
        expect(eventMock.fields['AttemptNumber']).toBe(1);
    });

    it('revokes a RevokePending grant and lands it on Revoked', async () => {
        seedHappyPath({ grant: { ProvisioningStatus: 'RevokePending', ProvisioningExternalRef: 'noop:grant-1' } });
        const grantMock = makeEntityMock();
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [GRANT_ENTITY]: [grantMock],
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        const summary = await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(summary.Revoked).toBe(1);
        expect(grantMock.fields['ProvisioningStatus']).toBe('Revoked');
        expect(eventMock.fields['Operation']).toBe('Revoke');
        expect(eventMock.fields['Outcome']).toBe('Succeeded');
    });

    it('holds a grant whose target is Disabled — skip event, no grant write', async () => {
        seedHappyPath({ target: { Status: 'Disabled' } });
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        const summary = await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(summary.Skipped).toBe(1);
        expect(summary.Provisioned).toBe(0);
        expect(eventMock.fields['Outcome']).toBe('Skipped');
    });

    it('heals a Pending grant whose template no longer names a target to NotRequired', async () => {
        seedHappyPath({ template: { ProvisioningTargetID: null } });
        const grantMock = makeEntityMock();
        const provider = makeProvider({ [GRANT_ENTITY]: [grantMock] });

        const summary = await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(summary.Skipped).toBe(1);
        expect(grantMock.fields['ProvisioningStatus']).toBe('NotRequired');
    });

    it('records a driver failure: Failed status, attempt count, error message, event row', async () => {
        seedHappyPath({ target: { DriverClass: 'Test.FailingProvisioning' } });
        const grantMock = makeEntityMock();
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [GRANT_ENTITY]: [grantMock],
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        const summary = await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(summary.Failed).toBe(1);
        expect(grantMock.fields['ProvisioningStatus']).toBe('Failed');
        expect(grantMock.fields['ProvisionAttempts']).toBe(1);
        expect(grantMock.fields['LastProvisionError']).toBe('downstream boom');
        expect(eventMock.fields['Outcome']).toBe('Failed');
    });

    it('keeps a failed revoke on RevokePending — the teardown obligation survives', async () => {
        seedHappyPath({
            grant: { ProvisioningStatus: 'RevokePending', ProvisioningExternalRef: 'ref-1' },
            target: { DriverClass: 'Test.FailingProvisioning' },
        });
        const grantMock = makeEntityMock();
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [GRANT_ENTITY]: [grantMock],
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        await PushProvisioningForOrder('11111111-1111-1111-1111-111111111111', provider, user);

        expect(grantMock.fields['ProvisioningStatus']).toBe('RevokePending');
    });

    it('refuses a non-UUID order id before touching anything', async () => {
        const provider = makeProvider({});
        await expect(PushProvisioningForOrder("'; DROP TABLE x --", provider, user)).rejects.toThrow(/UUID/);
    });
});

describe('ReconcileEntitlementProvisioning', () => {
    beforeEach(() => {
        runViewResults.clear();
        failingResult = { Success: false, Message: 'downstream boom' };
    });

    function seedSweepGrant(overrides: Partial<Record<string, unknown>>) {
        runViewResults.set(GRANT_ENTITY, [
            {
                ID: 'grant-1',
                ProductEntitlementID: 'pe-1',
                OrderLineID: 'line-1',
                Quantity: 1,
                ValidFrom: null,
                ValidTo: null,
                BeneficiaryPersonID: null,
                BeneficiaryOrganizationID: null,
                Status: 'Active',
                ProvisioningStatus: 'Failed',
                ProvisionAttempts: 1,
                LastProvisionAttemptAt: null,
                ProvisioningExternalRef: null,
                ...overrides,
            },
        ]);
        runViewResults.set(TEMPLATE_ENTITY, [
            { ID: 'pe-1', ProductID: 'prod-1', Code: 'LXP_SEAT', ProvisioningTargetID: 'target-1' },
        ]);
        runViewResults.set(ENTITLEMENT_PROVISIONING_TARGET_ENTITY, [
            { ID: 'target-1', Code: 'NoOp', Name: 'No-Op', DriverClass: 'Orders.NoOpProvisioning', Configuration: null, Status: 'Active' },
        ]);
    }

    it('retries a Failed grant that is past its backoff window', async () => {
        seedSweepGrant({ LastProvisionAttemptAt: new Date(Date.now() - 60 * 60_000) });
        const grantMock = makeEntityMock();
        const eventMock = makeEntityMock();
        const provider = makeProvider({
            [GRANT_ENTITY]: [grantMock],
            [ENTITLEMENT_PROVISIONING_EVENT_ENTITY]: [eventMock],
        });

        const summary = await ReconcileEntitlementProvisioning({}, provider, user);

        expect(summary.Provisioned).toBe(1);
        expect(grantMock.fields['ProvisioningStatus']).toBe('Provisioned');
        expect(grantMock.fields['ProvisionAttempts']).toBe(2);
    });

    it('waits out the backoff window for a recent failure', async () => {
        seedSweepGrant({ ProvisionAttempts: 3, LastProvisionAttemptAt: new Date() });
        const provider = makeProvider({});

        const summary = await ReconcileEntitlementProvisioning({}, provider, user);

        expect(summary.Skipped).toBe(1);
        expect(summary.Provisioned).toBe(0);
    });

    it('reports a grant past the attempt ceiling as Exhausted and leaves it alone', async () => {
        seedSweepGrant({ ProvisionAttempts: 8, LastProvisionAttemptAt: new Date(0) });
        const provider = makeProvider({});

        const summary = await ReconcileEntitlementProvisioning({}, provider, user);

        expect(summary.Exhausted).toBe(1);
        expect(summary.Provisioned).toBe(0);
        expect(summary.Failed).toBe(0);
    });
});
