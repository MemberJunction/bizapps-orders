/**
 * CapturePaymentOperation — capture a Pending payment through its provider (`Orders.CapturePayment`, F3).
 *
 * Resolves the payment's provider (ProviderType → ClassFactory; Manual by default), calls Capture
 * (Manual = record-only success; Stripe = success stub), and on success sets Status='Captured' +
 * ProviderChargeID and saves — which fires PaymentEntityServer to book the Cash/A/R journal entry
 * atomically. A decline leaves the payment un-captured with the reason.
 *
 * A hand-authored, CODE-ONLY Remote Operation (in-process + over GraphQL).
 *
 * CONNECTS TO:
 *   PROVIDER: ./PaymentProviderBase (BasePaymentProvider.For)
 *   BOOKS:    ./PaymentEntityServer (Save books the JE on reaching Captured)
 */
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { mjBizAppsOrdersPaymentEntity } from '@mj-biz-apps/orders-entities';
import { BasePaymentProvider, type PaymentProviderType } from './PaymentProviderBase.js';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';

export interface CapturePaymentInput {
  PaymentID: string;
}

export interface CapturePaymentOutput {
  Success: boolean;
  Status?: string;
  ProviderChargeID?: string;
  JournalEntryID?: string;
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.CapturePayment')
export class CapturePaymentOperation extends BaseRemotableOperation<CapturePaymentInput, CapturePaymentOutput> {
  public readonly OperationKey = 'Orders.CapturePayment';

  protected async InternalExecute(
    input: CapturePaymentInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CapturePaymentOutput> {
    const payment = await provider.GetEntityObject<mjBizAppsOrdersPaymentEntity>(PAYMENT_ENTITY, user);
    if (!(await payment.Load(input.PaymentID))) {
      return { Success: false, Errors: [`Payment ${input.PaymentID} not found.`] };
    }
    if (payment.Status === 'Captured') {
      return { Success: true, Status: payment.Status, ProviderChargeID: payment.ProviderChargeID ?? undefined, JournalEntryID: payment.JournalEntryID ?? undefined };
    }
    const providerType = await this.resolveProviderType(payment.PaymentProviderID, user);
    const capture = await BasePaymentProvider.For(providerType).Capture({ PaymentID: payment.ID, Amount: payment.Amount, ProviderRef: payment.PaymentIntentID ?? undefined });
    if (!capture.Success) {
      return { Success: false, Errors: [`Provider ${providerType} declined the capture: ${capture.Error ?? 'unknown'}`] };
    }
    payment.Status = 'Captured';
    payment.ProviderChargeID = capture.ProviderChargeID ?? null;
    if (!(await payment.Save())) {
      // The provider captured but booking/persist failed — surface it; the payment stays un-captured.
      return { Success: false, Errors: [`Payment captured at the provider but booking failed: ${payment.LatestResult?.CompleteMessage ?? 'unknown'}`] };
    }
    return { Success: true, Status: payment.Status, ProviderChargeID: capture.ProviderChargeID, JournalEntryID: payment.JournalEntryID ?? undefined };
  }

  /** The provider's ProviderType (Manual default when none linked). */
  private async resolveProviderType(paymentProviderID: string | null, user: UserInfo): Promise<PaymentProviderType> {
    if (!paymentProviderID) return 'Manual';
    const res = await new RunView().RunView<{ ProviderType: PaymentProviderType }>(
      { EntityName: PROVIDER_ENTITY, ExtraFilter: `ID='${paymentProviderID}'`, Fields: ['ProviderType'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Results?.[0]?.ProviderType ?? 'Manual';
  }
}

/** Tree-shaking anchor — called from the server bootstrap so `@RegisterClass` is retained. */
export function LoadCapturePaymentOperation(): void {
  // intentionally empty
}
