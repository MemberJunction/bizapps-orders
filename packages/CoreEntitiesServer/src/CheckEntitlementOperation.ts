/**
 * Orders.CheckEntitlement — does this person currently have this capability?
 *
 * WHY THIS IS AN OPERATION AND NOT A VIEW. Access is computed: Status is not trustworthy
 * (cancel does not touch grants; elapsed ValidTo is never swept). A view of the flag would
 * re-teach every consumer the evaluator, and the two would drift. The LXP asks; this answers.
 *
 * Asked by `ProductEntitlement.Code`, not SKU — a bundle, an upgrade and a grandfathered
 * tier can all confer the same capability. PersonID is authoritative; email is convenience
 * and is refused when it matches more than one person. v1 evaluates person grants only.
 *
 * Fail closed. Unknown person and known-person-without-access share one response shape.
 *
 * CONNECTS TO:
 *   PURE: ./EntitlementBehavior.ts (EvaluateGrantAccess)
 *   LOAD: ./EntitlementRead.ts
 *   DOC:  plans/entitlement-read-contract.md
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CheckPersonEntitlement,
    type CheckEntitlementInput,
    type CheckEntitlementOutput,
} from './EntitlementRead.js';

@RegisterClass(BaseRemotableOperation, 'Orders.CheckEntitlement')
export class CheckEntitlementOperation extends BaseRemotableOperation<
    CheckEntitlementInput,
    CheckEntitlementOutput
> {
    public OperationKey = 'Orders.CheckEntitlement';

    protected async InternalExecute(
        input: CheckEntitlementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CheckEntitlementOutput> {
        return CheckPersonEntitlement(input, provider, user);
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadCheckEntitlementOperation(): void {
    void CheckEntitlementOperation;
}
