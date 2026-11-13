/**
 * The server side of who may delete a Draft or Quoted order (#1021). The rule and its wording are
 * {@link OrderDeleteRefusal} in `@mj-biz-apps/orders-entities`; this reads the facts it needs.
 *
 * EXEMPT: the system user. Sales deletes a deal's draft order as the system user after checking the
 * caller's right to delete the deal (`DealEntityServer.deleteEmbeddedOrder`), so that delete is
 * already authorized and must not need an orders grant too.
 *
 * CONNECTS TO:
 *   CALLER: ./OrderEntityServer.ts (Delete)
 *   RULE:   @mj-biz-apps/orders-entities order-delete.ts
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { OrderDeleteRefusal } from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const RECORD_CHANGE_ENTITY = 'MJ: Record Changes';

/** Whether `user` is the server's system user. False when there is none. */
function isSystemUser(user: UserInfo): boolean {
    let system: UserInfo | null | undefined;
    try {
        system = UserCache.Instance.GetSystemUser();
    } catch {
        system = null;
    }
    return !!system?.ID && UUIDsEqual(system.ID, user.ID);
}

/**
 * Who created the order, from its `Create` entry in `MJ: Record Changes`. Null when none is recorded
 * (record changes not tracked for Order Headers, or not installed). Throws on a failed read, so the
 * caller refuses rather than guessing an owner.
 */
export async function OrderCreatorUserID(orderID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const header = provider.EntityByName(ORDER_HEADER_ENTITY);
    if (!header?.TrackRecordChanges || !provider.EntityByName(RECORD_CHANGE_ENTITY)) return null;
    const id = RequireUUID(orderID, 'OrderHeaderID');
    const result = await RunView.FromMetadataProvider(provider).RunView<{ UserID: string }>(
        {
            EntityName: RECORD_CHANGE_ENTITY,
            ExtraFilter: `EntityID = '${RequireUUID(header.ID, 'EntityID')}' AND RecordID IN ('ID|${id.toUpperCase()}', 'ID|${id.toLowerCase()}') AND Type = 'Create'`,
            Fields: ['UserID'],
            OrderBy: 'ChangedAt ASC',
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) throw new Error(result.ErrorMessage || 'the order\'s record changes could not be read');
    return result.Results[0]?.UserID ?? null;
}

/**
 * Why `user` may not delete the saved order, or null when they may.
 *
 * @param orderLabel how the message names the order: "Order ORD-000123".
 */
export async function CheckOrderDelete(
    order: { ID: string; Label: string },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    if (isSystemUser(user)) return null;
    let creator: string | null;
    try {
        creator = await OrderCreatorUserID(order.ID, provider, UserCache.Instance.GetSystemUser() ?? user);
    } catch (err) {
        return `${order.Label} was not deleted: who created it could not be read (${err instanceof Error ? err.message : String(err)}).`;
    }
    return OrderDeleteRefusal(order.Label, creator, user, provider);
}
