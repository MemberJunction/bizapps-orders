import { IRemoteOperationProvider, LogError } from '@memberjunction/core';

/**
 * Thin typed client for `Orders.CapturePayment` (§13.2 Payment entry).
 *
 * Capture is a Remote Operation because it talks to a payment PROVIDER and then books the capture
 * JE — neither of which the browser may do. With no provider linked the server resolves 'Manual',
 * which is the mockup's Wire / ACH / Check / Cash path.
 *
 * Types declared structurally: the op's interfaces live in the server package.
 */
export interface CapturePaymentResult {
  Success: boolean;
  Status?: string;
  ProviderChargeID?: string;
  JournalEntryID?: string;
  Errors?: string[];
}

export class PaymentEntryClient {
  /** Capture a payment that already exists. Returns logical failures in the output; throws on transport. */
  public async Capture(provider: IRemoteOperationProvider, paymentId: string): Promise<CapturePaymentResult> {
    const res = await provider.RouteOperation<{ PaymentID: string }, CapturePaymentResult>('Orders.CapturePayment', {
      PaymentID: paymentId,
    });
    if (!res.Success || !res.Output) {
      const msg = res.ErrorMessage ?? 'Could not capture the payment.';
      LogError(`PaymentEntryClient.Capture: ${msg}`);
      throw new Error(msg);
    }
    return res.Output;
  }
}
