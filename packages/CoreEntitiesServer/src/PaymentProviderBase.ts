/**
 * PaymentProviderBase — the pluggable payment-provider seam (F3.1, BO-D12).
 *
 * A ClassFactory-resolved plugin (`@RegisterClass(BasePaymentProvider, '<ProviderType>')`) that
 * captures a payment. v1 ships two:
 *   - Manual  — finance already moved the money; capture is a no-op success (no external call).
 *   - Stripe  — a SUCCESS STUB (F3.5, stub-first): simulates intent→capture with ZERO external
 *               calls and stays the DEFAULT dev/test provider permanently. The real Stripe API path
 *               (PaymentIntent lifecycle, hosted checkout, webhook→capture) is deferred (F3.5b).
 *
 * Resolve with: `MJGlobal.Instance.ClassFactory.CreateInstance(BasePaymentProvider, providerType)`.
 *
 * CONNECTS TO:
 *   ENTITY:  @mj-biz-apps/orders-entities (PaymentProvider.ProviderType union — rule 2c)
 *   CALLER:  CapturePaymentOperation ('Orders.CapturePayment')
 */
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { mjBizAppsOrdersPaymentProviderEntity } from '@mj-biz-apps/orders-entities';

export type PaymentProviderType = mjBizAppsOrdersPaymentProviderEntity['ProviderType'];

export interface PaymentCaptureRequest {
  PaymentID: string;
  Amount: number;
  CurrencyCode?: string;
  /** For Stripe: the PaymentIntent/method ref, when present. */
  ProviderRef?: string;
}

export interface PaymentCaptureResult {
  Success: boolean;
  ProviderChargeID?: string;
  Error?: string;
}

export abstract class BasePaymentProvider {
  public abstract readonly ProviderType: PaymentProviderType;
  /** Capture funds for a payment. Never throws for a logical decline — return { Success:false, Error }. */
  public abstract Capture(request: PaymentCaptureRequest): Promise<PaymentCaptureResult>;

  /** Resolve the concrete provider for a ProviderType via the ClassFactory (defaults to Manual). */
  public static For(providerType: PaymentProviderType | null | undefined): BasePaymentProvider {
    return MJGlobal.Instance.ClassFactory.CreateInstance<BasePaymentProvider>(
      BasePaymentProvider,
      providerType ?? 'Manual',
    )!;
  }
}

@RegisterClass(BasePaymentProvider, 'Manual')
export class ManualPaymentProvider extends BasePaymentProvider {
  public readonly ProviderType: PaymentProviderType = 'Manual';
  public async Capture(request: PaymentCaptureRequest): Promise<PaymentCaptureResult> {
    // Finance recorded the money out-of-band; nothing external to call.
    return { Success: true, ProviderChargeID: `manual:${request.PaymentID}` };
  }
}

@RegisterClass(BasePaymentProvider, 'Stripe')
export class StripePaymentProvider extends BasePaymentProvider {
  public readonly ProviderType: PaymentProviderType = 'Stripe';
  public async Capture(request: PaymentCaptureRequest): Promise<PaymentCaptureResult> {
    // STUB: simulate a successful capture, no network. Stays the default test provider (F3.5b = real).
    return { Success: true, ProviderChargeID: `stub_ch_${request.PaymentID.replace(/-/g, '').slice(0, 20)}` };
  }
}

/** Tree-shaking anchor — the bootstrap calls this so the @RegisterClass registrations are retained. */
export function LoadPaymentProviders(): void {
  // Referencing the classes keeps their decorators from being tree-shaken.
  void ManualPaymentProvider;
  void StripePaymentProvider;
}
