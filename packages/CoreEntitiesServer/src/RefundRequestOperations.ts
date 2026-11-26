/**
 * Orders.RequestRefund, Orders.RecordRefundRequestDecision and Orders.WithdrawRefundRequest
 * (bc-aidp-next-golive#355).
 *
 * Thin: the rules, the authorization checks and the writes are in `RefundRequest.ts`. Logical
 * refusals come back as `Success: false` with the reason; only faults throw.
 */
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersRecordRefundRequestDecisionOperation as OrdersRecordRefundRequestDecisionOperationBase,
    OrdersRequestRefundOperation as OrdersRequestRefundOperationBase,
    OrdersWithdrawRefundRequestOperation as OrdersWithdrawRefundRequestOperationBase,
} from '@mj-biz-apps/orders-entities';
import {
    RecordRefundRequestDecision,
    RequestRefund,
    WithdrawRefundRequest,
    type RecordRefundRequestDecisionInput,
    type RefundRequestDecisionOutput,
    type RequestRefundInput,
    type RequestRefundOutput,
    type WithdrawRefundRequestInput,
} from './RefundRequest.js';

@RegisterClass(BaseRemotableOperation, 'Orders.RequestRefund')
export class RequestRefundOperation extends OrdersRequestRefundOperationBase {
    protected async InternalExecute(input: RequestRefundInput, provider: IMetadataProvider, user: UserInfo): Promise<RequestRefundOutput> {
        return RequestRefund(input, provider, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'Orders.RecordRefundRequestDecision')
export class RecordRefundRequestDecisionOperation extends OrdersRecordRefundRequestDecisionOperationBase {
    protected async InternalExecute(
        input: RecordRefundRequestDecisionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RefundRequestDecisionOutput> {
        return RecordRefundRequestDecision(input, provider, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'Orders.WithdrawRefundRequest')
export class WithdrawRefundRequestOperation extends OrdersWithdrawRefundRequestOperationBase {
    protected async InternalExecute(input: WithdrawRefundRequestInput, provider: IMetadataProvider, user: UserInfo): Promise<RefundRequestDecisionOutput> {
        return WithdrawRefundRequest(input, provider, user);
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadRefundRequestOperations(): void {
    // intentionally empty
}
