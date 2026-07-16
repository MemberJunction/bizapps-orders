import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

export interface FulfillmentLine {
  ID: string;
  Product: string;
  Quantity: number;
  FulfillmentStatus: string | null;
  RequiresFulfillment: boolean;
}

export interface FulfillmentOrder {
  ID: string;
  OrderNumber: string;
  OrderDate: Date;
  Customer: string | null;
  Lines: FulfillmentLine[];
}

/**
 * Fulfillment queue (orders UI plan §13.1) — Posted orders with lines still to fulfil.
 *
 * Only lines whose PRODUCT TYPE requires fulfillment are actionable (F1.6 / UPD-3, via the engine's
 * `RequiresFulfillment`): a membership does not get shipped, so marking it "fulfilled" would be
 * meaningless ceremony. Non-fulfillable lines are shown greyed so the operator can see the whole
 * order, not a filtered half of it.
 *
 * ⚠ NOT role-gated yet. §13.1 specifies the Fulfiller role, but A2 (roles/RLS) is Marcelo co-design
 * and unbuilt — there is no role to check. Rather than invent one, the page says so; the gate lands
 * with A2 (plans/DEFERRALS.md).
 */
@Component({
  standalone: false,
  selector: 'mj-fulfillment-queue-page',
  templateUrl: './fulfillment-queue.page.html',
  styleUrls: ['./fulfillment-queue.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FulfillmentQueuePageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public Orders: FulfillmentOrder[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public BusyLineID: string | null = null;
  public ActionMessage: string | null = null;
  public ActionIsError = false;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  public Refresh(): void {
    void this.load();
  }

  public get PendingCount(): number {
    return this.Orders.reduce((n, o) => n + o.Lines.filter((l) => l.RequiresFulfillment && l.FulfillmentStatus !== 'Fulfilled').length, 0);
  }

  /** Posted orders + their lines: TWO reads, joined in memory. Never a query per order. */
  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const user = this.ProviderToUse.CurrentUser;

      const orders = await rv.RunView<{ ID: string; OrderNumber: string; OrderDate: Date; Customer: string | null }>(
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: `Status='Posted'`,
          Fields: ['ID', 'OrderNumber', 'OrderDate', 'Customer'],
          OrderBy: 'OrderDate ASC',
          ResultType: 'simple',
        },
        user,
      );
      if (!orders.Success) throw new Error(orders.ErrorMessage ?? 'Could not load the queue.');
      const rows = orders.Results ?? [];
      if (rows.length === 0) {
        this.Orders = [];
        return;
      }

      const lines = await rv.RunView<{
        ID: string; OrderID: string; Product: string; ProductID: string; Quantity: number; FulfillmentStatus: string | null;
      }>(
        {
          EntityName: ORDER_LINE_ENTITY,
          ExtraFilter: `OrderID IN (${rows.map((o) => `'${o.ID}'`).join(',')})`,
          Fields: ['ID', 'OrderID', 'Product', 'ProductID', 'Quantity', 'FulfillmentStatus'],
          OrderBy: 'LineNumber ASC',
          ResultType: 'simple',
        },
        user,
      );

      const byOrder = new Map<string, FulfillmentLine[]>();
      for (const l of lines.Results ?? []) {
        const list = byOrder.get(l.OrderID) ?? [];
        list.push({
          ID: l.ID,
          Product: l.Product,
          Quantity: l.Quantity,
          FulfillmentStatus: l.FulfillmentStatus,
          RequiresFulfillment: engine.RequiresFulfillment(l.ProductID),
        });
        byOrder.set(l.OrderID, list);
      }

      // Only orders that actually have something to fulfil belong in a fulfillment QUEUE.
      this.Orders = rows
        .map((o) => ({ ...o, Lines: byOrder.get(o.ID) ?? [] }))
        .filter((o) => o.Lines.some((l) => l.RequiresFulfillment && l.FulfillmentStatus !== 'Fulfilled'));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Orders = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public CanFulfil(line: FulfillmentLine): boolean {
    return line.RequiresFulfillment && line.FulfillmentStatus !== 'Fulfilled' && this.BusyLineID !== line.ID;
  }

  /**
   * Mark a line fulfilled.
   *
   * A plain entity save — the ORDER's auto-advance to Fulfilled is the server's business
   * (OrderLineEntityServer), not something the UI should infer and write. If the UI advanced the
   * order itself it would be a second implementation of the lifecycle rule the F1 matrix owns.
   */
  public async MarkFulfilled(order: FulfillmentOrder, line: FulfillmentLine): Promise<void> {
    if (!this.CanFulfil(line)) return;
    this.BusyLineID = line.ID;
    this.ActionMessage = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const entity = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, this.ProviderToUse.CurrentUser);
      if (!(await entity.Load(line.ID))) throw new Error('That line no longer exists.');
      entity.FulfillmentStatus = 'Fulfilled';
      if (!(await entity.Save())) {
        throw new Error(entity.LatestResult?.CompleteMessage ?? 'The line could not be saved.');
      }
      this.ActionMessage = `Marked ${line.Product} fulfilled on ${order.OrderNumber}.`;
      this.ActionIsError = false;
      await this.load(); // the order may have auto-advanced off this queue — refetch, don't guess
    } catch (e) {
      this.ActionMessage = e instanceof Error ? e.message : String(e);
      this.ActionIsError = true;
    } finally {
      this.BusyLineID = null;
      this.cdr.markForCheck();
    }
  }
}
