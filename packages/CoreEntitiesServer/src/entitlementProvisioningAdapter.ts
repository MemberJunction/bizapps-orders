/**
 * ⚠️ PRE-CODEGEN ADAPTER — THE ONLY FILE ALLOWED TO TOUCH THE PROVISIONING COLUMNS UNTYPED. ⚠️
 *
 * The V202608261200 migration adds provisioning columns to `EntitlementGrant` and
 * `ProductEntitlement`, plus two new entities (`Entitlement Provisioning Targets`,
 * `Entitlement Provisioning Events`). This branch is authored BEFORE `mj codegen` has run against
 * that migration, so none of that exists in `@mj-biz-apps/orders-entities` yet. Everything that
 * would be a typed property access is quarantined HERE, behind typed wrapper functions, using
 * `BaseEntity.Get()/.Set()` and untyped row reads.
 *
 * THE DEAL (agreed workflow for this wave): after `pnpm run mj:migrate && pnpm run mj:codegen`
 * runs locally and the generated output is committed, this file gets swapped for direct typed
 * properties (`grant.ProvisioningStatus = ...`) and typed entity classes — and then DELETED, or
 * reduced to the entity-name constants. Nothing outside this file should need to change in that
 * swap; that is the point of the wrappers.
 *
 * Do NOT copy this pattern anywhere else — `.Get()/.Set()` as a substitute for generated types is
 * banned repo-wide (CLAUDE.md), and this file exists only because the columns cannot be generated
 * in this environment (no SQL Server reachable).
 */
import type { BaseEntity } from '@memberjunction/core';

/** Entity names minted by CodeGen for the V202608261200 tables (schema `__mj_BizAppsOrders`). */
export const ENTITLEMENT_PROVISIONING_TARGET_ENTITY = 'MJ_BizApps_Orders: Entitlement Provisioning Targets';
export const ENTITLEMENT_PROVISIONING_EVENT_ENTITY = 'MJ_BizApps_Orders: Entitlement Provisioning Events';

export type ProvisioningStatus =
    | 'NotRequired'
    | 'Pending'
    | 'Provisioned'
    | 'Failed'
    | 'RevokePending'
    | 'Revoked';

export interface GrantProvisioningFields {
    ProvisioningStatus: ProvisioningStatus;
    ProvisionAttempts: number;
    LastProvisionAttemptAt: Date | null;
    LastProvisionError: string | null;
    ProvisioningExternalRef: string | null;
}

/** Read the provisioning columns off a loaded EntitlementGrant entity. */
export function ReadGrantProvisioning(grant: BaseEntity): GrantProvisioningFields {
    const status: unknown = grant.Get('ProvisioningStatus');
    const attempts: unknown = grant.Get('ProvisionAttempts');
    const lastAt: unknown = grant.Get('LastProvisionAttemptAt');
    const lastErr: unknown = grant.Get('LastProvisionError');
    const extRef: unknown = grant.Get('ProvisioningExternalRef');
    return {
        ProvisioningStatus: (typeof status === 'string' ? status : 'NotRequired') as ProvisioningStatus,
        ProvisionAttempts: typeof attempts === 'number' ? attempts : 0,
        LastProvisionAttemptAt: lastAt instanceof Date ? lastAt : null,
        LastProvisionError: typeof lastErr === 'string' ? lastErr : null,
        ProvisioningExternalRef: typeof extRef === 'string' ? extRef : null,
    };
}

/** Write a partial patch of the provisioning columns onto an EntitlementGrant entity. */
export function WriteGrantProvisioning(grant: BaseEntity, patch: Partial<GrantProvisioningFields>): void {
    if (patch.ProvisioningStatus !== undefined) grant.Set('ProvisioningStatus', patch.ProvisioningStatus);
    if (patch.ProvisionAttempts !== undefined) grant.Set('ProvisionAttempts', patch.ProvisionAttempts);
    if (patch.LastProvisionAttemptAt !== undefined) grant.Set('LastProvisionAttemptAt', patch.LastProvisionAttemptAt);
    if (patch.LastProvisionError !== undefined) grant.Set('LastProvisionError', patch.LastProvisionError);
    if (patch.ProvisioningExternalRef !== undefined) grant.Set('ProvisioningExternalRef', patch.ProvisioningExternalRef);
}

/**
 * What happens to the provisioning obligation when a grant's Status turns terminal
 * (Revoked/Expired). Pure so the rule is testable without an entity:
 *   Provisioned            → RevokePending (downstream must be told; fresh retry budget)
 *   Pending / Failed       → Revoked (nothing ever reached downstream; nothing to tear down)
 *   anything else          → null (no change to record)
 */
export function ProvisioningTransitionOnTerminalStatus(
    current: ProvisioningStatus,
): Partial<GrantProvisioningFields> | null {
    switch (current) {
        case 'Provisioned':
            return { ProvisioningStatus: 'RevokePending', ProvisionAttempts: 0, LastProvisionError: null };
        case 'Pending':
        case 'Failed':
            return { ProvisioningStatus: 'Revoked', LastProvisionError: null };
        default:
            return null;
    }
}

/** A plain provisioning-target row, as a `simple` read returns it. */
export interface ProvisioningTargetRow {
    ID: string;
    Code: string;
    Name: string;
    DriverClass: string;
    Configuration: string | null;
    Status: 'Active' | 'Disabled';
}

/** Narrow an untyped `simple` row into a target row, refusing shapes that cannot be one. */
export function AsProvisioningTargetRow(row: Record<string, unknown>): ProvisioningTargetRow | null {
    const id = row['ID'];
    const code = row['Code'];
    const driverClass = row['DriverClass'];
    const status = row['Status'];
    if (typeof id !== 'string' || typeof code !== 'string' || typeof driverClass !== 'string') return null;
    return {
        ID: id,
        Code: code,
        Name: typeof row['Name'] === 'string' ? (row['Name'] as string) : code,
        DriverClass: driverClass,
        Configuration: typeof row['Configuration'] === 'string' ? (row['Configuration'] as string) : null,
        Status: status === 'Disabled' ? 'Disabled' : 'Active',
    };
}

/** Fields written to an `Entitlement Provisioning Events` row (append-only log). */
export interface ProvisioningEventFields {
    EntitlementGrantID: string;
    ProvisioningTargetID: string | null;
    Operation: 'Provision' | 'Revoke' | 'Verify';
    Outcome: 'Succeeded' | 'Failed' | 'Skipped';
    AttemptNumber: number;
    Detail: string | null;
    ExternalRef: string | null;
}

/** Stamp the event fields onto a fresh event entity (caller does NewRecord()/Save()). */
export function WriteProvisioningEvent(event: BaseEntity, fields: ProvisioningEventFields): void {
    event.Set('EntitlementGrantID', fields.EntitlementGrantID);
    event.Set('ProvisioningTargetID', fields.ProvisioningTargetID);
    event.Set('Operation', fields.Operation);
    event.Set('Outcome', fields.Outcome);
    event.Set('AttemptNumber', fields.AttemptNumber);
    event.Set('Detail', fields.Detail);
    event.Set('ExternalRef', fields.ExternalRef);
}
