import { Metadata, RunView, type IMetadataProvider } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { RequireUUID } from '@mj-biz-apps/orders-entities';
import { MJO_COMMON_ENTITIES } from './entity-names';

/**
 * The signed-in user's active Person, the way task assignments name people.
 *
 * The user's own People link is read first: `LinkedEntityRecordID` when `LinkedEntityID` is People or
 * an IS-A subtype of it. The deprecated `People.LinkedUserID` is the fallback for users without one.
 * The same rule as the server's `ResolvePersonIDForUser` (orders-core-entities-server) and tasks'
 * own pages.
 *
 * @returns the Person ID, or null when the user has no active Person.
 * @throws when the lookup fails, so a caller can tell an error from a missing link.
 */
export async function ResolveSignedInPersonID(provider: IMetadataProvider = Metadata.Provider): Promise<string | null> {
    const user = provider?.CurrentUser;
    if (!user || !IsValidUUID(user.ID)) return null;
    const linked = linkedPersonID(provider, String(user.LinkedEntityID ?? ''), String(user.LinkedEntityRecordID ?? ''));
    const match = linked ? `ID = '${RequireUUID(linked, 'LinkedEntityRecordID')}'` : `LinkedUserID = '${RequireUUID(user.ID, 'UserID')}'`;
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: MJO_COMMON_ENTITIES.Person,
        ExtraFilter: `${match} AND Status = 'Active'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    if (!result?.Success) throw new Error(`Person lookup failed: ${result?.ErrorMessage ?? 'no result'}`);
    return result.Results?.[0]?.ID ?? null;
}

/** The Person ID the user record links to, or null when it links to no People record. */
function linkedPersonID(provider: IMetadataProvider, entityID: string, recordID: string): string | null {
    if (!IsValidUUID(entityID) || !IsValidUUID(recordID)) return null;
    const entity = provider.EntityByID(entityID);
    if (!entity) return null;
    const people = MJO_COMMON_ENTITIES.Person;
    return entity.Name === people || (entity.ParentChain ?? []).some((parent) => parent.Name === people) ? recordID : null;
}
