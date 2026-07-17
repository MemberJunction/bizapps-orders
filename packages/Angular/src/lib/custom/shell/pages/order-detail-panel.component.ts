import { Component, ChangeDetectionStrategy, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView, RunViewParams, CompositeKey } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { openBizDetail } from '@mj-biz-apps/accounting-ng';
import { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const ORG_ENTITY = 'MJ_BizApps_Common: Organizations';

/**
 * The order header, flattened for the panel. Every field is a real column/view field on
 * `MJ_BizApps_Orders: Orders` — nothing here is invented.
 *
 * The value-list unions are DERIVED from the generated entity (rule 2c), so a migration that widens
 * a CHECK constraint flows through instead of silently drifting from a hand-copied union.
 */
export interface OrderHeaderView {
  ID: string;
  OrderNumber: string;
  OrderType: mjBizAppsOrdersOrderEntity['OrderType'];
  Status: mjBizAppsOrdersOrderEntity['Status'];
  PaymentStatus: mjBizAppsOrdersOrderEntity['PaymentStatus'];
  /** DATE columns (no zone) — rendered UTC. */
  OrderDate: Date;
  DueDate: Date | null;
  RequestedDeliveryDate: Date | null;
  TotalGross: number | null;
  AmountPaid: number;
  Balance: number | null;
  Description: string | null;
  Notes: string | null;
  ExternalDocumentNumber: string | null;
  CustomerOrganizationID: string | null;
  /** Denormalized view fields — no lookup needed for these. */
  PaymentTermsType: string | null;
  SalesRepUser: string | null;
  PostedByUser: string | null;
  /** The booking linkage — the order's accounting outcome. */
  JournalEntryID: string | null;
  /** datetimeoffset — INSTANTS. Rendered in the viewer's local zone. */
  ConfirmedAt: Date | null;
  PostedAt: Date | null;
}

export interface OrderLineView {
  ID: string;
  LineNumber: number;
  /** `Product` is a denormalized VIEW field — naming the product costs no extra read. */
  Product: string;
  Quantity: number;
  UnitPrice: number;
  /** Stored as a FRACTION (0–1), e.g. 0.10 = 10% — rendered with the percent pipe. */
  DiscountPct: number;
  /** Engine-computed + STORED (Quantity × UnitPrice × (1 − DiscountPct)); shown, never re-derived. */
  LineTotalNet: number | null;
  Description: string | null;
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
 * Element doctrine: slide-in = quick VIEW. It pops out to the Order editor for real work — and the
 * pop-out CLOSES this panel, so the full record is never left hidden behind it.
 *
 * **Depth (GUI feedback, 2026-07-16):** the order is the primary object, so the panel carries
 * invoice-level detail on the first click — identity (number, type, status, payment status), the
 * customer, the dates, the money strip (Total / Paid / Balance, all STORED values), payment terms +
 * due date + external doc number, its **lines** (product, qty, unit price, discount, net), what has
 * been paid, and the booking linkage (journal entry + ConfirmedAt/PostedAt).
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
  private forms = inject(MJFormPresenterService);

  private _orderId: string | null = null;

  /**
   * Getter/setter (MJ Angular convention) — precise control over when the load fires.
   *
   * The host parses the grid rowKey ("ID|<guid>") with `rowKeyToId` before binding it here — this
   * input is a bare id, never a CompositeKey string.
   */
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
  public CustomerName: string | null = null;
  public IsLoading = false;
  public LoadError: string | null = null;

  public get Visible(): boolean {
    return !!this._orderId;
  }

  public get Title(): string {
    return this.Header ? `Order ${this.Header.OrderNumber}` : 'Order';
  }

  public Close(): void {
    this.Closed.emit();
  }

  /**
   * Pop-out (↗) to the order's full-depth home — the MJ form host.
   *
   * **Closes this panel as it opens** (GUI feedback 2026-07-16): a slide-in sits ABOVE the main
   * screen, so staying open means "Open full" opens the full record *behind* the thing hiding it.
   */
  public PopOut(): void {
    if (!this.Header) return;
    openBizDetail(this.forms, {
      entityName: ORDER_ENTITY,
      primaryKey: CompositeKey.FromID(this.Header.ID),
      title: `Order ${this.Header.OrderNumber}`,
      mode: 'dialog',
    });
    this.Closed.emit();
  }

  public StatusVariant(status: string | null): MJStatBadgeVariant {
    switch (status) {
      case 'Voided':
      case 'Overdue':
      case 'WrittenOff':
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
    this.CustomerName = null;
    this.LoadError = null;
    this.cdr.markForCheck();
  }

  /**
   * Load the header, then its lines + applied payments + the customer's name.
   *
   * Reads are BOUNDED and keyed — never one per row (the MJ perf rule):
   *   1-3. the header + its lines + its payment lines, batched in a single RunViews round-trip;
   *   4.   the parent Payments + the customer Organization, batched — keyed on ids the first hop
   *        returned, which is why they are a second hop rather than a third and fourth.
   *
   * `OrderLine.Product` is a VIEW field (denormalized by MJ), so naming the product is free — but
   * PaymentLine has no equivalent for its payment, and `Order.CustomerOrganizationID` is a SOFT
   * cross-app reference (no FK ⇒ no denormalized name), hence the keyed follow-ups rather than
   * per-row lookups or unlabelled GUIDs in the UI.
   */
  private async load(orderId: string): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const [header, lines, paymentLines] = await this.runView().RunViews(
        [
          { EntityName: ORDER_ENTITY, ExtraFilter: `ID='${orderId}'`, ResultType: 'simple' },
          { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderID='${orderId}'`, OrderBy: 'LineNumber ASC', ResultType: 'simple' },
          { EntityName: PAYMENT_LINE_ENTITY, ExtraFilter: `OrderID='${orderId}'`, ResultType: 'simple' },
        ],
        this.contextUser(),
      );

      if (!header.Success) throw new Error(header.ErrorMessage ?? 'Could not load the order.');
      const row = (header.Results?.[0] ?? null) as OrderHeaderView | null;
      if (!row) {
        // Honest "not found" — never a blank panel.
        this.LoadError = 'This order could not be found. It may have been deleted, or you may not have access to it.';
        return;
      }
      this.Header = row;
      this.Lines = lines.Success ? ((lines.Results ?? []) as OrderLineView[]) : [];
      await this.loadNames(row, paymentLines.Success ? ((paymentLines.Results ?? []) as PaymentLineRow[]) : []);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private runView(): RunView {
    return RunView.FromMetadataProvider(this.ProviderToUse);
  }

  private contextUser() {
    return this.ProviderToUse.CurrentUser;
  }

  /** The single second round-trip: the parent Payments + the customer, in ONE batch. */
  private async loadNames(header: OrderHeaderView, paymentLines: PaymentLineRow[]): Promise<void> {
    this.Payments = [];
    this.CustomerName = null;

    const paymentIDs = [...new Set(paymentLines.map((l) => NormalizeUUID(l.PaymentID)))];
    const queries: RunViewParams[] = [];
    const slots: { payments?: number; customer?: number } = {};
    if (paymentIDs.length > 0) {
      slots.payments = queries.length;
      queries.push({
        EntityName: PAYMENT_ENTITY,
        ExtraFilter: `ID IN (${paymentIDs.map((id) => `'${id}'`).join(',')})`,
        Fields: ['ID', 'PaymentNumber', 'Method'],
        ResultType: 'simple',
      });
    }
    if (header.CustomerOrganizationID) {
      slots.customer = queries.length;
      queries.push({
        EntityName: ORG_ENTITY,
        ExtraFilter: `ID='${header.CustomerOrganizationID}'`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
      });
    }
    if (queries.length === 0) return;

    const results = await this.runView().RunViews(queries, this.contextUser());

    if (slots.payments !== undefined) {
      this.Payments = this.namePayments(paymentLines, (results[slots.payments]?.Results ?? []) as PaymentRow[]);
    }
    if (slots.customer !== undefined) {
      const org = (results[slots.customer]?.Results?.[0] ?? null) as { Name: string } | null;
      this.CustomerName = org?.Name ?? null;
    }
  }

  /** Label each applied payment line from its resolved parent Payment. */
  private namePayments(lines: PaymentLineRow[], payments: PaymentRow[]): OrderPaymentView[] {
    // NormalizeUUID keys — SQL Server hands UUIDs back uppercase (UUID guide).
    const byId = new Map(payments.map((p) => [NormalizeUUID(p.ID), p]));
    return lines.map((l) => {
      const parent = byId.get(NormalizeUUID(l.PaymentID));
      return {
        ID: l.ID,
        Amount: l.Amount,
        // A payment we could not name still shows its amount — degrade the label, never the money.
        PaymentNumber: parent?.PaymentNumber ?? '(unknown payment)',
        Method: parent?.Method ?? '—',
      };
    });
  }
}

/** A payment-line row as read from its view. */
interface PaymentLineRow {
  ID: string;
  PaymentID: string;
  Amount: number;
}

/** A parent Payment, resolved so its lines can be labelled. */
interface PaymentRow {
  ID: string;
  PaymentNumber: string;
  Method: string;
}
