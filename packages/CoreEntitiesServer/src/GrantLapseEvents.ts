/**
 * Tell outbound consumers when a grant's access ends by lapse (#857).
 *
 * A grant's status and dates changing are recorded as `GrantStatusChanged` when they are saved. A term
 * that simply ends without renewal saves nothing: the grant stays `Active` and its `ValidTo` passes, so a
 * consumer that mirrors access from events never heard that access ended. This sweep finds `Active`
 * grants whose `ValidTo` has passed and records one `GrantStatusChanged` for each, with `ToStatus`
 * `Expired` (what the access evaluator answers once `ValidTo` is behind it) and `Lapsed: true`. The grant
 * row itself is not changed: access is decided from its dates, and writing `Expired` would outlast a
 * later extension of the same grant.
 *
 * ONCE PER LAPSE. A grant is skipped when an event for it already occurred at or after its `ValidTo`,
 * whether this sweep wrote it or a later save did. A grant whose `ValidTo` is moved forward and passes
 * again lapses again, and is told again.
 *
 * BOUNDED. Only grants that lapsed in the last {@link LAPSE_LOOKBACK_DAYS} days are considered, so the
 * first run on a host does not announce every grant that ever ended, and at most `maxCount` are recorded
 * per pass; the rest are taken by the next pass.
 *
 * Runs in the scheduled outbound dispatch pass, on its quarter-hour sweep, before the pass claims due
 * deliveries, so a lapse is usually sent in the same pass that records it.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { LogError, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { EntitlementGrantEntityServer } from './EntitlementGrantEntityServer.js';
import { HasOutboundConsumers, RecordOutboundEvent } from './OutboundEvents.js';
import { RequireUUID } from './sql-guards.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

/** How far back a lapse is still announced. Covers a scheduler outage of up to a week. */
export const LAPSE_LOOKBACK_DAYS = 7;

/** Default cap on lapses recorded in one pass. */
export const LAPSE_MAX_PER_PASS = 200;

/**
 * The query for grants that lapsed since `lookbackFrom` and have not been told about since. Exported for
 * the unit test, which pins the predicate.
 */
export function LapsedGrantsSQL(maxCount: number, lookbackDays: number = LAPSE_LOOKBACK_DAYS): string {
    const top = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : LAPSE_MAX_PER_PASS;
    const days = Number.isInteger(lookbackDays) && lookbackDays > 0 ? lookbackDays : LAPSE_LOOKBACK_DAYS;
    return `
        SELECT TOP (${top}) g.ID
          FROM __mj_BizAppsOrders.EntitlementGrant g
         WHERE g.Status = 'Active'
           AND g.ValidTo IS NOT NULL
           AND g.ValidTo < SYSDATETIMEOFFSET()
           AND g.ValidTo >= DATEADD(DAY, -${days}, SYSDATETIMEOFFSET())
           AND NOT EXISTS (
               SELECT 1
                 FROM __mj_BizAppsOrders.OutboundEvent e
                WHERE e.EntitlementGrantID = g.ID
                  AND e.EventType = 'GrantStatusChanged'
                  AND e.OccurredAt >= g.ValidTo
           )
         ORDER BY g.ValidTo`;
}

/**
 * Record a `GrantStatusChanged` for each grant that lapsed and has not been told about. Returns how many
 * were recorded. With no consumer for `GrantStatusChanged`, nothing is read or written.
 *
 * One grant's failure is logged and skipped; it is picked up again by the next pass.
 */
export async function RecordLapsedGrantEvents(
    provider: IMetadataProvider,
    user: UserInfo,
    maxCount: number = LAPSE_MAX_PER_PASS,
): Promise<number> {
    if (!HasOutboundConsumers('GrantStatusChanged')) return 0;

    const db = provider as unknown as DatabaseProviderBase & { ExecuteSQL(sql: string): Promise<unknown> };
    const rows = (await db.ExecuteSQL(LapsedGrantsSQL(maxCount))) as Array<{ ID: string }> | null;
    let recorded = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
        try {
            const grant = await provider.GetEntityObject<EntitlementGrantEntityServer>(ENTITLEMENT_GRANT_ENTITY, user);
            if (!(await grant.Load(RequireUUID(row.ID, 'EntitlementGrantID')))) continue;
            await db.BeginTransaction();
            try {
                const eventID = await RecordOutboundEvent(
                    {
                        EventType: 'GrantStatusChanged',
                        OrderHeaderID: await grant.OrderHeaderIDForEvent(),
                        EntitlementGrantID: grant.ID,
                        Payload: await grant.LapsePayload(),
                    },
                    provider,
                    user,
                );
                await db.CommitTransaction();
                if (eventID) recorded++;
            } catch (err) {
                await db.RollbackTransaction();
                throw err;
            }
        } catch (err) {
            LogError(`[BizAppsOrders] Grant lapse event for ${row.ID} was not recorded: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return recorded;
}
