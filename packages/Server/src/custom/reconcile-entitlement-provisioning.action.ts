/**
 * @fileoverview `Orders: Reconcile Entitlement Provisioning` — the sweep behind the post-commit push.
 *
 * WHY AN ACTION. The push after booking is fire-and-forget by design (a dead LXP must not fail a
 * committed sale), which means SOMETHING has to come back for what it missed: a crash between
 * commit and push, a downstream outage, a target that was Disabled at the time. This action is
 * that something, and being an Action makes it schedulable by MJ's Scheduled Jobs
 * (`ActionScheduledJobDriver` + the metadata/scheduled-jobs row) with zero extra infrastructure —
 * plus invocable by hand when someone is staring at a Failed grant.
 *
 * THIN BY THE HOUSE RULE: all logic lives in `ReconcileEntitlementProvisioning`
 * (@mj-biz-apps/orders-core-entities-server); this is the boundary that validates inputs and
 * reports the sweep's numbers.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { ReconcileEntitlementProvisioning } from '@mj-biz-apps/orders-core-entities-server';

function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

function numParam(params: RunActionParams, name: string): number | null {
    const raw = param(params, name);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function setOutput(params: RunActionParams, name: string, value: unknown): void {
    const existing = params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.Value = value;
        existing.Type = 'Output';
        return;
    }
    params.Params = params.Params ?? [];
    params.Params.push({ Name: name, Value: value, Type: 'Output' } as ActionParam);
}

/**
 * Sweep grants whose provisioning obligation is outstanding (Pending / retryable Failed /
 * RevokePending) and drive them through their targets' drivers, with exponential backoff and a
 * hard attempt ceiling.
 *
 * Inputs (all optional): `MaxGrants` (batch ceiling, default 200), `MaxAttempts` (per-grant retry
 * ceiling, default 8), `MinRetryMinutes` (backoff base, default 5).
 * Outputs: `Considered`, `Provisioned`, `Revoked`, `Failed`, `Skipped`, `Exhausted`.
 */
@RegisterClass(BaseAction, 'Orders.ReconcileEntitlementProvisioning')
export class ReconcileEntitlementProvisioningAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.reconcile(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Reconcile sweep failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async reconcile(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER',
                Message: 'ContextUser is required: grants and targets are read through the metadata layer.',
            };
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        if (!provider) {
            return { Success: false, ResultCode: 'NO_PROVIDER', Message: 'No metadata provider is configured.' };
        }

        const summary = await ReconcileEntitlementProvisioning(
            {
                MaxGrants: numParam(params, 'MaxGrants') ?? undefined,
                MaxAttempts: numParam(params, 'MaxAttempts') ?? undefined,
                MinRetryMinutes: numParam(params, 'MinRetryMinutes') ?? undefined,
            },
            provider,
            user,
        );

        setOutput(params, 'Considered', summary.Considered);
        setOutput(params, 'Provisioned', summary.Provisioned);
        setOutput(params, 'Revoked', summary.Revoked);
        setOutput(params, 'Failed', summary.Failed);
        setOutput(params, 'Skipped', summary.Skipped);
        setOutput(params, 'Exhausted', summary.Exhausted);

        // Exhausted grants need a human — a run that only skips and exhausts is not "fine".
        const attention = summary.Failed > 0 || summary.Exhausted > 0;
        return {
            Success: true,
            ResultCode: attention ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED',
            Params: params.Params,
            Message:
                `Sweep considered ${summary.Considered}: provisioned ${summary.Provisioned}, revoked ` +
                `${summary.Revoked}, failed ${summary.Failed}, skipped ${summary.Skipped}, exhausted ` +
                `${summary.Exhausted}${summary.Exhausted > 0 ? ' (past the retry ceiling — needs a human)' : ''}.`,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadReconcileEntitlementProvisioningAction(): void {
    void ReconcileEntitlementProvisioningAction;
}
