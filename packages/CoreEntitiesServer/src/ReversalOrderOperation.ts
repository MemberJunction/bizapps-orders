/**
 * ReversalOrderOperation — create a reversal order (`Orders.CreateReversalOrder`, F2).
 *
 * Given a BOOKED source order (+ optional per-line slices), builds a new DRAFT order of
 * `OrderType` Return / CreditMemoOrder / Amendment with `ReversesOrderID` = the source and one
 * negative-quantity line per slice (`ReversesOrderLineID` = the source line, price/discount copied).
 * Confirming that reversal order rides the SAME F1 Confirm path — the signed-amount draft assembly
 * books the MIRROR image (Cr AR / Dr revenue), so the pair nets to zero.
 *
 * Validation: the source must be booked (ConfirmedAt set); a slice quantity may not exceed the
 * source line's UN-reversed remainder (partial reversals stack, BO-D10).
 *
 * A hand-authored, CODE-ONLY Remote Operation (in-process + over GraphQL). Creation only — booking
 * is the separate Confirm step (the reversal order starts Draft).
 *
 * CONNECTS TO:
 *   ENTITY: @mj-biz-apps/orders-entities (Order / OrderLine)
 *   BOOKS:  ./OrderEntityServer + ./ConfirmOrderOperation (the reversal order confirms like any order)
 */
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

type ReversalOrderType = Extract<mjBizAppsOrdersOrderEntity['OrderType'], 'Return' | 'CreditMemoOrder' | 'Amendment'>;

export interface CreateReversalOrderInput {
  SourceOrderID: string;
  /** Default 'Return'. */
  OrderType?: ReversalOrderType;
  /** Per-line partial slices; omit for a FULL reversal of every source line's remaining quantity. */
  LineSlices?: Array<{ SourceOrderLineID: string; Quantity: number }>;
}

export interface CreateReversalOrderOutput {
  Success: boolean;
  ReversalOrderID?: string;
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.CreateReversalOrder')
export class ReversalOrderOperation extends BaseRemotableOperation<CreateReversalOrderInput, CreateReversalOrderOutput> {
  public readonly OperationKey = 'Orders.CreateReversalOrder';

  protected async InternalExecute(
    input: CreateReversalOrderInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CreateReversalOrderOutput> {
    const source = await provider.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    if (!(await source.Load(input.SourceOrderID))) {
      return { Success: false, Errors: [`Source order ${input.SourceOrderID} not found.`] };
    }
    if (!source.ConfirmedAt) {
      return { Success: false, Errors: [`Order ${source.OrderNumber} is not booked; only a Confirmed+ order can be reversed.`] };
    }
    const sourceLines = await this.loadLines(source.ID, user);
    const slices = await this.resolveSlices(input, sourceLines, user);
    if ('errors' in slices) return { Success: false, Errors: slices.errors };

    const reversal = await this.createReversalHeader(source, input.OrderType ?? 'Return', user, provider);
    if ('error' in reversal) return { Success: false, Errors: [reversal.error] };
    const lineErr = await this.createReversalLines(reversal.order.ID, slices.rows, user, provider);
    if (lineErr) return { Success: false, Errors: [lineErr] };
    return { Success: true, ReversalOrderID: reversal.order.ID };
  }

  /** Resolve the slice set (explicit or full) and validate each against the un-reversed remainder. */
  private async resolveSlices(
    input: CreateReversalOrderInput,
    sourceLines: mjBizAppsOrdersOrderLineEntity[],
    user: UserInfo,
  ): Promise<{ rows: Array<{ line: mjBizAppsOrdersOrderLineEntity; qty: number }> } | { errors: string[] }> {
    const byId = new Map(sourceLines.map(l => [l.ID.toUpperCase(), l]));
    const requested = input.LineSlices ?? sourceLines.map(l => ({ SourceOrderLineID: l.ID, Quantity: l.Quantity }));
    const errors: string[] = [];
    const rows: Array<{ line: mjBizAppsOrdersOrderLineEntity; qty: number }> = [];
    for (const s of requested) {
      const line = byId.get(s.SourceOrderLineID.toUpperCase());
      if (!line) { errors.push(`Source line ${s.SourceOrderLineID} is not on order ${input.SourceOrderID}.`); continue; }
      if (!(s.Quantity > 0)) { errors.push(`Reversal quantity for line ${line.LineNumber} must be > 0.`); continue; }
      const remaining = line.Quantity - (await this.alreadyReversed(line.ID, user));
      if (s.Quantity > remaining + 1e-9) {
        errors.push(`Reversal of ${s.Quantity} for line ${line.LineNumber} exceeds the un-reversed remainder (${remaining}).`);
        continue;
      }
      rows.push({ line, qty: s.Quantity });
    }
    if (rows.length === 0 && errors.length === 0) errors.push('No lines to reverse.');
    return errors.length ? { errors } : { rows };
  }

  /** Quantity of a source line already reversed by prior reversal lines (stacking partials). */
  private async alreadyReversed(sourceLineID: string, user: UserInfo): Promise<number> {
    const res = await new RunView().RunView<{ Quantity: number }>(
      { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ReversesOrderLineID='${sourceLineID}'`, Fields: ['Quantity'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Success ? (res.Results ?? []).reduce((sum, r) => sum + Math.abs(Number(r.Quantity)), 0) : 0;
  }

  private async createReversalHeader(
    source: mjBizAppsOrdersOrderEntity,
    orderType: ReversalOrderType,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<{ order: mjBizAppsOrdersOrderEntity } | { error: string }> {
    const order = await provider.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    order.NewRecord();
    order.OrderNumber = `${source.OrderNumber}-REV-${order.ID.slice(0, 8)}`;
    order.OrderType = orderType;
    order.Status = 'Draft';
    order.OrderDate = new Date();
    order.ReversesOrderID = source.ID;
    order.CustomerOrganizationID = source.CustomerOrganizationID;
    order.PaymentTermsTypeID = source.PaymentTermsTypeID;
    if (!(await order.Save())) {
      return { error: `Reversal order header failed to save: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}` };
    }
    return { order };
  }

  private async createReversalLines(
    reversalOrderID: string,
    rows: Array<{ line: mjBizAppsOrdersOrderLineEntity; qty: number }>,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<string | null> {
    let lineNumber = 1;
    for (const { line, qty } of rows) {
      const rl = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
      rl.NewRecord();
      rl.OrderID = reversalOrderID;
      rl.LineNumber = lineNumber++;
      rl.ProductID = line.ProductID;
      rl.Quantity = -qty; // NEGATIVE — the signed-amount draft assembly books the mirror image
      rl.UnitPrice = line.UnitPrice;
      rl.DiscountPct = line.DiscountPct;
      rl.ReversesOrderLineID = line.ID;
      rl.Description = line.Description;
      if (!(await rl.Save())) {
        return `Reversal line for source line ${line.LineNumber} failed to save: ${rl.LatestResult?.CompleteMessage ?? 'unknown error'}`;
      }
    }
    return null;
  }

  private async loadLines(orderID: string, user: UserInfo): Promise<mjBizAppsOrdersOrderLineEntity[]> {
    const res = await new RunView().RunView<mjBizAppsOrdersOrderLineEntity>(
      { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderID='${orderID}'`, OrderBy: 'LineNumber ASC', ResultType: 'entity_object' },
      user,
    );
    return res.Success ? res.Results ?? [] : [];
  }
}

/** Tree-shaking anchor — called from the server bootstrap so `@RegisterClass` is retained. */
export function LoadReversalOrderOperation(): void {
  // intentionally empty
}
