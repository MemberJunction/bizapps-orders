/**
 * Orders.ListEntitlements — this person's entitlement library, without N point checks.
 *
 * An optimisation for UI and sync, not a second source of truth. Each row is evaluated
 * the same way `Orders.CheckEntitlement` evaluates one Code. Heavier scope than the
 * point check (`orders:entitlement-read`) so a library key cannot become an authorization
 * oracle for arbitrary people × codes.
 *
 * CONNECTS TO:
 *   LOAD: ./EntitlementRead.ts
 *   DOC:  plans/entitlement-read-contract.md
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    ListPersonEntitlements,
    type ListEntitlementsInput,
    type ListEntitlementsOutput,
} from './EntitlementRead.js';

@RegisterClass(BaseRemotableOperation, 'Orders.ListEntitlements')
export class ListEntitlementsOperation extends BaseRemotableOperation<
    ListEntitlementsInput,
    ListEntitlementsOutput
> {
    public OperationKey = 'Orders.ListEntitlements';

    protected async InternalExecute(
        input: ListEntitlementsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ListEntitlementsOutput> {
        return ListPersonEntitlements(input, provider, user);
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadListEntitlementsOperation(): void {
    void ListEntitlementsOperation;
}
