/**
 * Who may reverse booked money (bc-aidp-next-golive#454).
 *
 * `Orders.CancelSubscription`, `Orders.RefundPayment`, `Orders.ApplyAccountCredit` and a change of
 * amount through `Orders.AmendArrangement` each check `MJ.BizApps.Orders.Order.Reverse` first, before
 * any read or write. The rule and its wording live in `@mj-biz-apps/orders-entities`
 * (`ReversalRefusal`) so the screens hide what these refuse.
 *
 * EXEMPT: a RECORD of something the payment gateway already did. The gateway sync cancels a
 * subscription the gateway ended, webhook handling books a refund the gateway made, and a renewal's
 * gateway refund becomes a credit applied to the renewal. The money has moved; refusing to book it
 * would only hide it, whoever's call started the sync. Those three callers run inside
 * {@link WithGatewayRecord}, which no client input can reach.
 *
 * CONNECTS TO:
 *   CALLERS: ./CancelSubscriptionOperation.ts · ./RefundPaymentOperation.ts
 *            ./ApplyAccountCreditOperation.ts · ./AmendArrangementOperation.ts (amount change)
 *   EXEMPT:  ./ProviderSubscriptionSync.ts (via WithGatewayEndRecorded) · ./ProviderRefundBooking.ts
 *            ./GatewayRenewalCredit.ts
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ReversalRefusal } from '@mj-biz-apps/orders-entities';

const gatewayRecord = new AsyncLocalStorage<{ Recording: true }>();

/** SERVER-ONLY: run `fn` as the record of something the payment gateway already did. */
export function WithGatewayRecord<T>(fn: () => Promise<T>): Promise<T> {
    return gatewayRecord.run({ Recording: true }, fn);
}

/**
 * Why `user` may not run `action`, or null when they may (or when this is a gateway record).
 *
 * @param action the start of the refusal sentence: "Cancelling a subscription".
 */
export function ReversalGate(action: string, provider: IMetadataProvider, user: UserInfo): string | null {
    if (gatewayRecord.getStore()) return null;
    return ReversalRefusal(action, user, provider);
}
