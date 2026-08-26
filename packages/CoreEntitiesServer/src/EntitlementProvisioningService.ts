/**
 * EntitlementProvisioningService — pushes grants out to their downstream targets, after the commit.
 *
 * Grants are CREATED inside the booking transaction (D27/D76 — access and the receivable are the
 * same decision) and born `ProvisioningStatus = 'Pending'` when their template names a target. The
 * push to the downstream system is deliberately OUTSIDE that transaction: a slow or dead LXP must
 * not hold the booking's write locks or roll back a sale. So the commit records the OBLIGATION
 * (Pending / RevokePending), this service discharges it, and the reconcile sweep re-drives anything
 * a crash or outage left behind. At-least-once, never at-most-once — which is why drivers must be
 * idempotent (see EntitlementProvisioningDriver.ts).
 *
 * THREE ENTRY POINTS, ONE CORE:
 *   PushProvisioningForOrder  — post-commit push for a just-booked order (OrderEntityServer)
 *   PushProvisioningForGrant  — single grant, after a claim redemption changes its beneficiary
 *   ReconcileEntitlementProvisioning — the scheduled sweep: retries with exponential backoff,
 *                                      bounded attempts, bounded batch
 *
 * EVERY ATTEMPT LEAVES AN EVENT ROW (`Entitlement Provisioning Events`) — success, failure, or
 * skip. The grant row carries only the latest state; the event log answers what happened and when.
 * Event-write failures are logged and never fail the attempt they describe.
 *
 * CONNECTS TO:
 *   SEAM:    ./EntitlementProvisioningDriver.ts (driver contract + resolver)
 *   ADAPTER: ./entitlementProvisioningAdapter.ts (pre-CodeGen column access — see its header)
 *   CALLERS: OrderEntityServer.Save (post-commit), EntitlementGrantClaimDriver.OnClaim,
 *            'Orders.ReconcileEntitlementProvisioning' (packages/Server, scheduled)
 */
import {
    BaseEntity,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import {
    ResolveProvisioningDriver,
    type ProvisioningRequest,
    type ProvisioningResult,
} from './EntitlementProvisioningDriver.js';
import {
    AsProvisioningTargetRow,
    ENTITLEMENT_PROVISIONING_EVENT_ENTITY,
    ENTITLEMENT_PROVISIONING_TARGET_ENTITY,
    WriteGrantProvisioning,
    WriteProvisioningEvent,
    type ProvisioningTargetRow,
} from './entitlementProvisioningAdapter.js';
import { RequireUUID } from './sql-guards.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/** Attempts beyond this are left Failed for a human; the sweep reports but no longer retries. */
export const MAX_PROVISION_ATTEMPTS = 8;
/** Default per-sweep batch ceiling — the sweep is periodic, so a backlog drains across ticks. */
const DEFAULT_MAX_GRANTS = 200;
/** Base of the exponential backoff between retries, in minutes. */
const DEFAULT_MIN_RETRY_MINUTES = 5;
/** Backoff ceiling — a grant is retried at least daily until attempts run out. */
const MAX_BACKOFF_MINUTES = 24 * 60;

/**
 * A grant row as the reconcile/push reads it (`ResultType: 'simple'` returns every view column).
 * The `Provisioning*` members exist once the V202608261200 migration + CodeGen have run — this
 * interface is a declaration of that post-CodeGen shape, paired with entitlementProvisioningAdapter.
 */
interface GrantSweepRow {
    ID: string;
    ProductEntitlementID: string;
    OrderLineID: string | null;
    Quantity: number | null;
    ValidFrom: Date | string | null;
    ValidTo: Date | string | null;
    BeneficiaryPersonID: string | null;
    BeneficiaryOrganizationID: string | null;
    Status: string;
    ProvisioningStatus: string;
    ProvisionAttempts: number;
    LastProvisionAttemptAt: Date | string | null;
    ProvisioningExternalRef: string | null;
}

/** A template row with the columns the push needs (post-CodeGen shape, same note as above). */
interface TemplateSweepRow {
    ID: string;
    ProductID: string;
    Code: string;
    ProvisioningTargetID: string | null;
}

export interface ProvisioningSweepSummary {
    Considered: number;
    Provisioned: number;
    Revoked: number;
    Failed: number;
    Skipped: number;
    /** Grants past MAX_PROVISION_ATTEMPTS — reported so exhaustion is visible, never silent. */
    Exhausted: number;
}

export interface ReconcileOptions {
    /** Batch ceiling per sweep. Default 200. */
    MaxGrants?: number;
    /** Retry ceiling per grant per desired state. Default MAX_PROVISION_ATTEMPTS (8). */
    MaxAttempts?: number;
    /** Base of the exponential backoff, in minutes. Default 5. */
    MinRetryMinutes?: number;
}

function emptySummary(): ProvisioningSweepSummary {
    return { Considered: 0, Provisioned: 0, Revoked: 0, Failed: 0, Skipped: 0, Exhausted: 0 };
}

/**
 * Push every outstanding provisioning obligation for one just-booked order. Called post-commit and
 * fire-and-forget by `OrderEntityServer.Save` — a failure here is logged and left for the sweep,
 * never surfaced to the buyer, because the sale is already committed.
 */
export async function PushProvisioningForOrder(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ProvisioningSweepSummary> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'orderHeaderID')}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    const lineIDs = (lines?.Results ?? []).map((l) => l.ID);
    if (!lineIDs.length) return emptySummary();

    const grants = await rv.RunView<GrantSweepRow>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter:
                `OrderLineID IN (${quote(lineIDs)}) AND ProvisioningStatus IN ('Pending','RevokePending')`,
            ResultType: 'simple',
        },
        user,
    );
    return processGrants(grants?.Results ?? [], provider, user, {});
}

/** Push a single grant — used after a claim redemption re-points its beneficiary. */
export async function PushProvisioningForGrant(
    grantID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ProvisioningSweepSummary> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<GrantSweepRow>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter:
                `ID = '${RequireUUID(grantID, 'grantID')}' AND ProvisioningStatus IN ('Pending','Failed','RevokePending')`,
            ResultType: 'simple',
        },
        user,
    );
    return processGrants(grants?.Results ?? [], provider, user, {});
}

/**
 * The scheduled sweep: everything still Pending, retryably Failed, or RevokePending — with
 * exponential backoff between attempts and a hard attempt ceiling. Runs off the
 * 'Orders.ReconcileEntitlementProvisioning' action (see metadata/scheduled-jobs).
 */
export async function ReconcileEntitlementProvisioning(
    options: ReconcileOptions,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ProvisioningSweepSummary> {
    const maxGrants = boundedInt(options.MaxGrants, 1, 5000, DEFAULT_MAX_GRANTS);
    const maxAttempts = boundedInt(options.MaxAttempts, 1, 50, MAX_PROVISION_ATTEMPTS);
    const minRetryMinutes = boundedInt(options.MinRetryMinutes, 0, 1440, DEFAULT_MIN_RETRY_MINUTES);

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<GrantSweepRow>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter: `ProvisioningStatus IN ('Pending','Failed','RevokePending')`,
            OrderBy: 'LastProvisionAttemptAt ASC',
            MaxRows: maxGrants,
            ResultType: 'simple',
        },
        user,
    );

    const now = Date.now();
    const summary = emptySummary();
    const due: GrantSweepRow[] = [];
    for (const g of grants?.Results ?? []) {
        const attempts = Number(g.ProvisionAttempts ?? 0);
        if (attempts >= maxAttempts) {
            summary.Exhausted++;
            continue;
        }
        // Exponential backoff off the LAST attempt; a grant never attempted is due immediately.
        const lastAt = g.LastProvisionAttemptAt ? new Date(g.LastProvisionAttemptAt).getTime() : 0;
        const waitMinutes = attempts === 0 ? 0 : Math.min(minRetryMinutes * 2 ** (attempts - 1), MAX_BACKOFF_MINUTES);
        if (lastAt + waitMinutes * 60_000 > now) {
            summary.Skipped++;
            continue;
        }
        due.push(g);
    }

    const processed = await processGrants(due, provider, user, {});
    return {
        Considered: (grants?.Results ?? []).length,
        Provisioned: processed.Provisioned,
        Revoked: processed.Revoked,
        Failed: processed.Failed,
        Skipped: summary.Skipped + processed.Skipped,
        Exhausted: summary.Exhausted,
    };
}

function boundedInt(value: number | undefined, min: number, max: number, fallback: number): number {
    if (value == null || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * The core: resolve templates + targets in two batched reads, then drive each grant through its
 * driver, updating the grant row and appending an event row per attempt. Sequential by design —
 * the batch is bounded, and downstream systems prefer a steady walk to a burst.
 */
async function processGrants(
    grantRows: GrantSweepRow[],
    provider: IMetadataProvider,
    user: UserInfo,
    _options: Record<string, never>,
): Promise<ProvisioningSweepSummary> {
    const summary = emptySummary();
    if (!grantRows.length) return summary;
    summary.Considered = grantRows.length;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const templateIDs = [...new Set(grantRows.map((g) => g.ProductEntitlementID))];
    const templates = await rv.RunView<TemplateSweepRow>(
        {
            EntityName: PRODUCT_ENTITLEMENT_ENTITY,
            ExtraFilter: `ID IN (${quote(templateIDs)})`,
            ResultType: 'simple',
        },
        user,
    );
    const templateByID = new Map((templates?.Results ?? []).map((t) => [key(t.ID), t]));

    const targetIDs = [
        ...new Set(
            (templates?.Results ?? [])
                .map((t) => t.ProvisioningTargetID)
                .filter((id): id is string => !!id),
        ),
    ];
    const targetByID = new Map<string, ProvisioningTargetRow>();
    if (targetIDs.length) {
        const targets = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: ENTITLEMENT_PROVISIONING_TARGET_ENTITY,
                ExtraFilter: `ID IN (${quote(targetIDs)})`,
                ResultType: 'simple',
            },
            user,
        );
        for (const row of targets?.Results ?? []) {
            const target = AsProvisioningTargetRow(row);
            if (target) targetByID.set(key(target.ID), target);
        }
    }

    for (const grantRow of grantRows) {
        try {
            await processOneGrant(grantRow, templateByID, targetByID, provider, user, summary);
        } catch (err) {
            // One grant's unexpected explosion must not strand its siblings in the batch.
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[EntitlementProvisioning] Unexpected error processing grant ${grantRow.ID}: ${msg}`);
            summary.Failed++;
        }
    }

    return summary;
}

async function processOneGrant(
    grantRow: GrantSweepRow,
    templateByID: Map<string, TemplateSweepRow>,
    targetByID: Map<string, ProvisioningTargetRow>,
    provider: IMetadataProvider,
    user: UserInfo,
    summary: ProvisioningSweepSummary,
): Promise<void> {
    const isRevoke = grantRow.ProvisioningStatus === 'RevokePending';
    const template = templateByID.get(key(grantRow.ProductEntitlementID));
    const targetID = template?.ProvisioningTargetID ?? null;

    // A Pending grant whose template no longer names a target has nothing to push — heal it to
    // NotRequired rather than sweeping it forever. A RevokePending one is different: something WAS
    // provisioned once, and losing the target row does not un-provision it downstream, so it stays
    // and fails loudly.
    if (!targetID) {
        if (!isRevoke) {
            await updateGrant(grantRow.ID, provider, user, (grant) => {
                WriteGrantProvisioning(grant, { ProvisioningStatus: 'NotRequired', LastProvisionError: null });
            });
            summary.Skipped++;
            return;
        }
        await recordFailure(grantRow, null, isRevoke, 'The grant needs a downstream revoke but its template no longer names a provisioning target.', provider, user, summary);
        return;
    }

    const target = targetByID.get(key(targetID)) ?? null;
    if (!target) {
        await recordFailure(grantRow, targetID, isRevoke, `Provisioning target ${targetID} could not be read.`, provider, user, summary);
        return;
    }

    if (target.Status === 'Disabled') {
        // Deliberate hold: the grant keeps its obligation and the sweep returns when re-enabled.
        await writeEvent(provider, user, {
            EntitlementGrantID: grantRow.ID,
            ProvisioningTargetID: target.ID,
            Operation: isRevoke ? 'Revoke' : 'Provision',
            Outcome: 'Skipped',
            AttemptNumber: Number(grantRow.ProvisionAttempts ?? 0),
            Detail: `Target '${target.Code}' is Disabled — held for later.`,
            ExternalRef: grantRow.ProvisioningExternalRef ?? null,
        });
        summary.Skipped++;
        return;
    }

    const request: ProvisioningRequest = {
        GrantID: grantRow.ID,
        ProductEntitlementID: grantRow.ProductEntitlementID,
        EntitlementCode: template?.Code ?? '',
        ProductID: template?.ProductID ?? '',
        Quantity: grantRow.Quantity != null ? Number(grantRow.Quantity) : null,
        ValidFrom: grantRow.ValidFrom ? new Date(grantRow.ValidFrom) : null,
        ValidTo: grantRow.ValidTo ? new Date(grantRow.ValidTo) : null,
        BeneficiaryPersonID: grantRow.BeneficiaryPersonID ?? null,
        BeneficiaryOrganizationID: grantRow.BeneficiaryOrganizationID ?? null,
        TargetConfiguration: parseConfiguration(target),
        ExternalRef: grantRow.ProvisioningExternalRef ?? null,
        Provider: provider,
        User: user,
    };

    let result: ProvisioningResult;
    try {
        const driver = ResolveProvisioningDriver(target.DriverClass);
        result = isRevoke ? await driver.Revoke(request) : await driver.Provision(request);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { Success: false, Message: msg, Retryable: true };
    }

    const attemptNumber = Number(grantRow.ProvisionAttempts ?? 0) + 1;

    if (result.Success) {
        const saved = await updateGrant(grantRow.ID, provider, user, (grant) => {
            WriteGrantProvisioning(grant, {
                ProvisioningStatus: isRevoke ? 'Revoked' : 'Provisioned',
                ProvisionAttempts: attemptNumber,
                LastProvisionAttemptAt: new Date(),
                LastProvisionError: null,
                ...(result.ExternalRef !== undefined ? { ProvisioningExternalRef: result.ExternalRef ?? null } : {}),
            });
        });
        if (saved) {
            if (isRevoke) summary.Revoked++;
            else summary.Provisioned++;
        } else {
            // The downstream side effect happened but our record of it did not stick. The sweep
            // will re-drive; the driver's idempotency (by ExternalRef) is what makes that safe.
            summary.Failed++;
        }
        await writeEvent(provider, user, {
            EntitlementGrantID: grantRow.ID,
            ProvisioningTargetID: target.ID,
            Operation: isRevoke ? 'Revoke' : 'Provision',
            Outcome: 'Succeeded',
            AttemptNumber: attemptNumber,
            Detail: result.Message ?? null,
            ExternalRef: result.ExternalRef ?? grantRow.ProvisioningExternalRef ?? null,
        });
        return;
    }

    await recordFailure(grantRow, target.ID, isRevoke, result.Message ?? 'Driver reported failure with no message.', provider, user, summary, attemptNumber);
}

function parseConfiguration(target: ProvisioningTargetRow): Record<string, unknown> {
    if (!target.Configuration) return {};
    try {
        const parsed: unknown = JSON.parse(target.Configuration);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch (err) {
        LogError(
            `[EntitlementProvisioning] Target '${target.Code}' has unparseable Configuration JSON: ` +
                `${err instanceof Error ? err.message : String(err)} — treating as empty.`,
        );
        return {};
    }
}

async function recordFailure(
    grantRow: GrantSweepRow,
    targetIDForEvent: string | null,
    isRevoke: boolean,
    message: string,
    provider: IMetadataProvider,
    user: UserInfo,
    summary: ProvisioningSweepSummary,
    attemptNumber?: number,
): Promise<void> {
    const attempts = attemptNumber ?? Number(grantRow.ProvisionAttempts ?? 0) + 1;
    // A failed revoke stays RevokePending — the obligation to tear down survives the failure.
    const nextStatus = isRevoke ? 'RevokePending' : 'Failed';
    await updateGrant(grantRow.ID, provider, user, (grant) => {
        WriteGrantProvisioning(grant, {
            ProvisioningStatus: nextStatus,
            ProvisionAttempts: attempts,
            LastProvisionAttemptAt: new Date(),
            LastProvisionError: message.slice(0, 2000),
        });
    });
    await writeEvent(provider, user, {
        EntitlementGrantID: grantRow.ID,
        ProvisioningTargetID: targetIDForEvent,
        Operation: isRevoke ? 'Revoke' : 'Provision',
        Outcome: 'Failed',
        AttemptNumber: attempts,
        Detail: message,
        ExternalRef: grantRow.ProvisioningExternalRef ?? null,
    });
    summary.Failed++;
    LogError(`[EntitlementProvisioning] ${isRevoke ? 'Revoke' : 'Provision'} failed for grant ${grantRow.ID} (attempt ${attempts}): ${message}`);
}

/** Load-mutate-save one grant; returns whether the save stuck (failures are logged). */
async function updateGrant(
    grantID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    mutate: (grant: mjBizAppsOrdersEntitlementGrantEntity) => void,
): Promise<boolean> {
    const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(ENTITLEMENT_GRANT_ENTITY, user);
    const loaded = await grant.Load(grantID);
    if (!loaded) {
        LogError(`[EntitlementProvisioning] Grant ${grantID} could not be loaded for a status update.`);
        return false;
    }
    mutate(grant);
    const saved = await grant.Save();
    if (!saved) {
        LogError(
            `[EntitlementProvisioning] Failed to save provisioning state on grant ${grantID}: ` +
                `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
    return saved;
}

/** Append one event row. Best-effort: the log describes the attempt, it must never fail it. */
async function writeEvent(
    provider: IMetadataProvider,
    user: UserInfo,
    fields: Parameters<typeof WriteProvisioningEvent>[1],
): Promise<void> {
    try {
        const event = await provider.GetEntityObject<BaseEntity>(ENTITLEMENT_PROVISIONING_EVENT_ENTITY, user);
        event.NewRecord();
        WriteProvisioningEvent(event, fields);
        const saved = await event.Save();
        if (!saved) {
            LogError(
                `[EntitlementProvisioning] Failed to write provisioning event for grant ${fields.EntitlementGrantID}: ` +
                    `${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LogError(`[EntitlementProvisioning] Error writing provisioning event for grant ${fields.EntitlementGrantID}: ${msg}`);
    }
}
