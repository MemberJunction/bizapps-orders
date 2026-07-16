import { Component, ChangeDetectionStrategy, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';

/** The order header, flattened for the panel. */
export interface OrderHeaderView {
  ID: string;
  OrderNumber: string;
  Status: string;
  PaymentStatus: string | null;
  OrderDate: Date;
  DueDate: Date | null;
  TotalGross: number | null;
  AmountPaid: number;
  Balance: number | null;
  Description: string | null;
  ExternalDocumentNumber: string | null;
  JournalEntryID: string | null;
}

export interface OrderLineView {
  ID: string;
  LineNumber: number;
  Product: string;
  Quantity: number;
  LineTotalNet: number | null;
  ServicePeriodStart: Date | null;
  ServicePeriodEnd: Date | null;
}

export interface OrderPaymentView {
  ID: string;
  /** How much of that payment was applied to THIS order (PaymentLine.Amount). */
  Amount: number;
  /** Resolved from the parent Payment — PaymentLine carries no denormalized payment name. */
  PaymentNumber: string;
  Method: string;
}

/**
 * Order detail slide-in (orders UI plan §13.1) — the glance-and-go view behind an All-orders row.
 *
 * Element doctrine: slide-in = quick VIEW. It shows what the list can't (the lines, what has been
 * paid, and the accounting lineage) and pops out to the Order editor for real work.
 *
 * The JE link is the cross-app deep link the GUI review asked for, in the direction the architecture
 * allows: orders LINKS to accounting's journal entry, never renders or duplicates GL data.
 */
@Component({
  standalone: false,
  selector: 'mj-order-detail-panel',
  templateUrl: './order-detail-panel.component.html',
  styleUrls: ['./order-detail-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPanelComponent extends BaseAngularComponent {
  private cdr = inject(ChangeDetectorRef);

  private _orderId: string | null = null;

  /** Getter/setter (MJ Angular convention) — precise control over when the load fires. */
  @Input()
  set OrderID(value: string | null) {
    const previous = this._orderId;
    this._orderId = value;
    if (value && value !== previous) void this.load(value);
    if (!value) this.reset();
  }
  get OrderID(): string | null {
    return this._orderId;
  }

  @Output() Closed = new EventEmitter<void>();
  /** Emitted when the panel changes the order — the host refetches (§13 refresh policy). */
  @Output() Changed = new EventEmitter<void>();

  public Header: OrderHeaderView | null = null;
  public Lines: OrderLineView[] = [];
  public Payments: OrderPaymentView[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  public get Visible(): boolean {
    return !!this._orderId;
  }

  public Close(): void {
    this.Closed.emit();
  }

  public StatusVariant(status: string | null): MJStatBadgeVariant {
    switch (status) {
      case 'Voided':
      case 'Overdue':
        return 'error';
      case 'Posted':
      case 'Fulfilled':
      case 'Paid':
        return 'success';
      case 'Confirmed':
      case 'PartiallyPaid':
        return 'info';
      default:
        return 'default';
    }
  }

  private reset(): void {
    this.Header = null;
    this.Lines = [];
    this.Payments = [];
    this.LoadError = null;
    this.cdr.markForCheck();
  }

  /**
   * Load the header, then its lines + applied payments.
   *
   * Reads are BOUNDED and keyed — never one per row (the MJ perf rule):
   *   1-3. the header + its lines + its payment lines, batched in a single RunViews round-trip;
   *   4.   the parent Payments, in ONE `ID IN (…)` read, only when payments exist.
   *
   * `OrderLine.Product` is a VIEW field (denormalized by MJ), so naming the product is free — but
   * PaymentLine has no equivalent for its payment, hence the fourth read rather than a per-row
   * lookup or an unlabelled GUID in the UI.
   */
  private async load(orderId: string): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const user = this.ProviderToUse.CurrentUser;

      const [header, lines, payments] = await rv.RunViews(
        [
          {
            EntityName: ORDER_ENTITY,
            ExtraFilter: `ID='${orderId}'`,
            ResultType: 'simple',
          },
          {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderID='${orderId}'`,
            OrderBy: 'LineNumber ASC',
            ResultType: 'simple',
          },
          {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter: `OrderID='${orderId}'`,
            ResultType: 'simple',
          },
        ],
        user,
      );

      if (!header.Success) throw new Error(header.ErrorMessage ?? 'Could not load the order.');
      this.Header = (header.Results?.[0] as OrderHeaderView) ?? null;
      this.Lines = lines.Success ? ((lines.Results ?? []) as OrderLineView[]) : [];
      this.Payments = payments.Success
        ? await this.namePayments((payments.Results ?? []) as Array<{ ID: string; PaymentID: string; Amount: number }>)
        : [];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Resolve the parent Payments for these lines in ONE read, so the panel can name them. */
  private async namePayments(
    lines: Array<{ ID: string; PaymentID: string; Amount: number }>,
  ): Promise<OrderPaymentView[]> {
    if (lines.length === 0) return [];
    const ids = [...new Set(lines.map((l) => l.PaymentID))];
    const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{
      ID: string;
      PaymentNumber: string;
      Method: string;
    }>(
      {
        EntityName: PAYMENT_ENTITY,
        ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
        Fields: ['ID', 'PaymentNumber', 'Method'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    const byId = new Map((res.Results ?? []).map((p) => [p.ID, p]));
    return lines.map((l) => ({
      ID: l.ID,
      Amount: l.Amount,
      // A payment we could not name still shows its amount — degrade the label, never the money.
      PaymentNumber: byId.get(l.PaymentID)?.PaymentNumber ?? '(unknown payment)',
      Method: byId.get(l.PaymentID)?.Method ?? '—',
    }));
  }
}
