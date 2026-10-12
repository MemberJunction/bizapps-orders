/**
 * Orders.RequestAccessOverride and Orders.RecordAccessOverrideDecision (bizapps-orders#268).
 *
 * Thin: the rules, the authorization checks and the writes are in `AccessOverride.ts`. Logical
 * refusals come back as `Success: false` with the reason; only faults throw.
 */
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersRecordAccessOverrideDecisionOperation as OrdersRecordAccessOverrideDecisionOperationBase,
    OrdersRequestAccessOverrideOperation as OrdersRequestAccessOverrideOperationBase,
} from '@mj-biz-apps/orders-entities';
import {
    RecordAccessOverrideDecision,
    RequestAccessOverride,
    type AccessOverrideDecisionOutput,
    type RecordAccessOverrideDecisionInput,
    type RequestAccessOverrideInput,
    type RequestAccessOverrideOutput,
} from './AccessOverride.js';

@RegisterClass(BaseRemotableOperation, 'Orders.RequestAccessOverride')
export class RequestAccessOverrideOperation extends OrdersRequestAccessOverrideOperationBase {
    protected async InternalExecute(input: RequestAccessOverrideInput, provider: IMetadataProvider, user: UserInfo): Promise<RequestAccessOverrideOutput> {
        return RequestAccessOverride(input, provider, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'Orders.RecordAccessOverrideDecision')
export class RecordAccessOverrideDecisionOperation extends OrdersRecordAccessOverrideDecisionOperationBase {
    protected async InternalExecute(
        input: RecordAccessOverrideDecisionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AccessOverrideDecisionOutput> {
        return RecordAccessOverrideDecision(input, provider, user);
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadAccessOverrideOperations(): void {
    // intentionally empty
}
