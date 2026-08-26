/**
 * The provisioning driver seam — how a grant reaches the system that actually delivers it.
 *
 * An `EntitlementProvisioningTarget` row names a downstream system (an LXP, a license server, a
 * community platform) and the `DriverClass` that talks to it. The orders engine ships the SEAM and
 * one no-op driver; every real driver ships with the deployment that owns its downstream system
 * (plan §4.3) — an LXP enrollment driver belongs to the AIDP install, not to this engine, because
 * this engine must not accrete a dependency on every system anyone ever sells access to.
 *
 * The contract is deliberately small: Provision / Revoke / Verify, each taking the same request and
 * returning the same result shape. Drivers must be IDEMPOTENT — the reconcile sweep retries, and a
 * crash between the downstream call and our status write means the same request WILL arrive twice.
 * `ExternalRef` (the downstream system's id for what was provisioned) is how a driver recognises
 * its own earlier work.
 *
 * CONNECTS TO:
 *   SERVICE:  ./EntitlementProvisioningService.ts (the only caller)
 *   PATTERN:  ./DeliveryResolver.ts — the resolve-and-refuse-the-base-class guard
 *   DOC:      docs/HOW_THE_SYSTEM_WORKS.md — Entitlement provisioning
 */
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** Everything a driver may need to provision (or unprovision) one grant downstream. */
export interface ProvisioningRequest {
    /** The EntitlementGrant row being provisioned. */
    GrantID: string;
    /** The template behind the grant. */
    ProductEntitlementID: string;
    /** The machine key downstream apps consume (`ProductEntitlement.Code`). */
    EntitlementCode: string;
    ProductID: string;
    Quantity: number | null;
    ValidFrom: Date | null;
    ValidTo: Date | null;
    BeneficiaryPersonID: string | null;
    BeneficiaryOrganizationID: string | null;
    /** `EntitlementProvisioningTarget.Configuration`, parsed. `{}` when the column is empty. */
    TargetConfiguration: Record<string, unknown>;
    /**
     * The downstream id from a previous successful Provision, when one exists. A Revoke uses it to
     * find what to tear down; a retried Provision uses it to recognise its own earlier work.
     */
    ExternalRef: string | null;
    /** Server-side context for any MJ reads the driver needs. Always thread `User` into them. */
    Provider: IMetadataProvider;
    User: UserInfo;
}

export interface ProvisioningResult {
    Success: boolean;
    /** The downstream system's id for what was provisioned. Persisted; required to revoke later. */
    ExternalRef?: string | null;
    /** Human-readable detail — the error on failure, optional context on success. */
    Message?: string;
    /**
     * On failure: whether the sweep should try again. `false` means the failure is permanent
     * (bad configuration, downstream rejected the request as invalid) and retrying only burns
     * attempts. Defaults to retryable when omitted.
     */
    Retryable?: boolean;
}

/**
 * The base driver. Registered concrete subclasses implement the three operations; the base
 * DECLINES them all, and `ResolveProvisioningDriver` refuses to return it — see the resolver for
 * why "nobody registered a driver" must not read as "the downstream system said no".
 */
export class BaseEntitlementProvisioningDriver {
    /** Tell the downstream system this grant now exists (or has changed beneficiary). */
    public async Provision(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return this.decline('Provision', request);
    }

    /** Tell the downstream system this grant is gone. */
    public async Revoke(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return this.decline('Revoke', request);
    }

    /** Ask the downstream system whether the grant is really there. Optional for drivers. */
    public async Verify(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return this.decline('Verify', request);
    }

    private decline(op: string, request: ProvisioningRequest): ProvisioningResult {
        return {
            Success: false,
            Retryable: false,
            Message:
                `BaseEntitlementProvisioningDriver declines ${op} for grant ${request.GrantID} — ` +
                `no concrete driver is registered for this target's DriverClass.`,
        };
    }
}

/**
 * The pipeline-test driver: succeeds without touching anything. Point a target's DriverClass at
 * 'Orders.NoOpProvisioning' to exercise status transitions, the event log, and the reconcile sweep
 * before any real downstream system is wired.
 */
@RegisterClass(BaseEntitlementProvisioningDriver, 'Orders.NoOpProvisioning')
export class NoOpEntitlementProvisioningDriver extends BaseEntitlementProvisioningDriver {
    public override async Provision(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return { Success: true, ExternalRef: `noop:${request.GrantID}`, Message: 'No-op provision.' };
    }

    public override async Revoke(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return { Success: true, ExternalRef: request.ExternalRef ?? null, Message: 'No-op revoke.' };
    }

    public override async Verify(request: ProvisioningRequest): Promise<ProvisioningResult> {
        return { Success: true, ExternalRef: request.ExternalRef ?? null, Message: 'No-op verify.' };
    }
}

/** Raised when a target's DriverClass has no working implementation behind it. */
export class ProvisioningDriverNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProvisioningDriverNotConfiguredError';
    }
}

/**
 * The driver registered for this DriverClass.
 *
 * Same guard as `ResolveDeliveryChannel`: MJ's ClassFactory falls back to the base class when no
 * registration matches, and accepting that fallback would turn "the AIDP deployment forgot the
 * driver's Load* anchor" into a provisioning failure that reads like a downstream outage.
 *
 * @throws {ProvisioningDriverNotConfiguredError} when nothing (or only the base) is registered.
 */
export function ResolveProvisioningDriver(driverClass: string): BaseEntitlementProvisioningDriver {
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEntitlementProvisioningDriver>(
        BaseEntitlementProvisioningDriver,
        driverClass,
    );

    if (!driver) {
        throw new ProvisioningDriverNotConfiguredError(
            `No provisioning driver is registered for '${driverClass}'. Register one with ` +
                `@RegisterClass(BaseEntitlementProvisioningDriver, '${driverClass}') and call its Load* ` +
                `anchor from the server bootstrap — without the anchor the decorator is tree-shaken away.`,
        );
    }

    if (driver.constructor === BaseEntitlementProvisioningDriver) {
        throw new ProvisioningDriverNotConfiguredError(
            `Provisioning driver '${driverClass}' resolved to the BASE driver, which provisions nothing. ` +
                `Its Load* anchor is almost certainly missing from the server bootstrap.`,
        );
    }

    return driver;
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEntitlementProvisioningDrivers(): void {
    // intentionally empty
}
