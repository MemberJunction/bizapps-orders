/**
 * OverdueWorklistOperation — the dunning candidate worklist (`Orders.GetOverdueWorklist`, F3.6).
 *
 * Returns booked orders that are OVERDUE as of a date — DueDate in the past + an open balance (Q-a:
 * Overdue is TIME-DERIVED, computed here off DueDate/Balance, never a stored flag mutated by a cron).
 * This is Jeremy's weekly overdue process in miniature: the actionable list an operator (or a future
 * dunning workflow) works. The reminder DELIVERY channel (email / bill.com) is deferred (Q-D) — this
 * op only IDENTIFIES the candidates; a manual payment retry is a normal capture on the order.
 *
 * Code-only Remote Operation; in-process + over GraphQL. Read-only.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-engine-base (isOverdue)
 *   ENTITY: @mj-biz-apps/orders-entities (Order)
 */
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { isOverdue } from '@mj-biz-apps/orders-engine-base';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
// Booked states carry a receivable; Draft/Quoted/Voided never owe.
const BOOKED = `Status IN ('Confirmed','Posted','Fulfilled')`;

export interface OverdueWorklistInput {
  /** Evaluate overdue-ness as of this ISO date/datetime (defaults to now). */
  AsOf?: string;
}

export interface OverdueOrder {
  OrderID: string;
  OrderNumber: string;
  CustomerOrganizationID: string | null;
  Balance: number;
  DueDate: string | null;
  DaysOverdue: number;
}

export interface OverdueWorklistOutput {
  Success: boolean;
  AsOf: string;
  Orders: OverdueOrder[];
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.GetOverdueWorklist')
export class OverdueWorklistOperation extends BaseRemotableOperation<OverdueWorklistInput, OverdueWorklistOutput> {
  public readonly OperationKey = 'Orders.GetOverdueWorklist';

  protected async InternalExecute(
    input: OverdueWorklistInput,
    _provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<OverdueWorklistOutput> {
    const asOf = input?.AsOf ? new Date(input.AsOf) : new Date();
    const res = await new RunView().RunView<{ ID: string; OrderNumber: string; CustomerOrganizationID: string | null; Balance: number | null; DueDate: string | null; PaymentStatus: string | null }>(
      {
        EntityName: ORDER_ENTITY,
        // Narrow in SQL to booked + past-due + a positive balance; the pure predicate confirms per-row.
        ExtraFilter: `${BOOKED} AND DueDate < '${asOf.toISOString()}' AND Balance > 0 AND (PaymentStatus IS NULL OR PaymentStatus <> 'WrittenOff')`,
        Fields: ['ID', 'OrderNumber', 'CustomerOrganizationID', 'Balance', 'DueDate', 'PaymentStatus'],
        OrderBy: 'DueDate ASC',
        ResultType: 'simple',
        BypassCache: true,
      },
      user,
    );
    if (!res.Success) return { Success: false, AsOf: asOf.toISOString(), Orders: [], Errors: [res.ErrorMessage ?? 'query failed'] };

    const orders = (res.Results ?? [])
      .filter(r => isOverdue(r.DueDate ? new Date(r.DueDate) : null, Number(r.Balance), asOf)) // SQL already excludes WrittenOff
      .map(r => ({
        OrderID: r.ID,
        OrderNumber: r.OrderNumber,
        CustomerOrganizationID: r.CustomerOrganizationID,
        Balance: Number(r.Balance),
        DueDate: r.DueDate,
        DaysOverdue: r.DueDate ? Math.floor((asOf.getTime() - new Date(r.DueDate).getTime()) / 86400000) : 0,
      }));
    return { Success: true, AsOf: asOf.toISOString(), Orders: orders };
  }
}

/** Tree-shaking anchor — called from the server bootstrap so `@RegisterClass` is retained. */
export function LoadOverdueWorklistOperation(): void {
  // intentionally empty
}
