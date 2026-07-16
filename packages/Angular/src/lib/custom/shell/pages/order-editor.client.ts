import { IRemoteOperationProvider, LogError } from '@memberjunction/core';

/**
 * Thin typed client for `Orders.ConfirmOrder` (§13.1 Order editor).
 *
 * Confirm is a Remote Operation, not an entity save, for a load-bearing reason: it composes the
 * order-row update and the per-company journal entries into ONE TransactionGroup, and
 * TransactionGroups do not cross the GraphQL boundary — so the unit of work must run server-side.
 * Confirming by setting `Status = 'Confirmed'` from the browser would bypass that atomicity.
 *
 * Types are declared structurally rather than imported: the op's interfaces live in
 * `@mj-biz-apps/orders-core-entities-server`, a SERVER package the browser must not pull in.
 */

/** Mirrors ConfirmOrderOperation's `ConfirmOrderOutput`. */
export interface ConfirmOrderResult {
  Success: boolean;
  Status?: string;
  JournalEntryIDs?: string[];
  Errors?: string[];
}

export class OrderEditorClient {
  /**
   * Confirm + book an order.
   *
   * Returns the op's output as-is, INCLUDING a logical failure: a blocked Confirm (e.g. a line whose
   * category has no Revenue mapping) is the editor's most important screen — the §13.1 loud banner
   * with the "Fix in Accounting → Account links" deep link is built from `Errors`. Throws only on a
   * transport/authorization fault.
   */
  public async Confirm(provider: IRemoteOperationProvider, orderId: string): Promise<ConfirmOrderResult> {
    const res = await provider.RouteOperation<{ OrderID: string }, ConfirmOrderResult>('Orders.ConfirmOrder', {
      OrderID: orderId,
    });
    if (!res.Success || !res.Output) {
      const msg = res.ErrorMessage ?? 'Could not confirm the order.';
      LogError(`OrderEditorClient.Confirm: ${msg}`);
      throw new Error(msg);
    }
    return res.Output;
  }
}

/**
 * Does this Confirm failure look like a missing GL account mapping?
 *
 * Drives the §13.1 deep link: a mapping failure is FIXABLE in accounting's Account links screen,
 * so that error gets a link and the others don't. Matched on the message because the op returns
 * `Errors: string[]` with no code — a structured code upstream would be better, and is worth asking
 * for, but inventing one here would mean changing the server contract to serve the UI.
 */
export function isAccountMappingFailure(errors: string[] | undefined): boolean {
  if (!errors?.length) return false;
  return errors.some((e) => /account|mapping|link|resolve/i.test(e));
}
