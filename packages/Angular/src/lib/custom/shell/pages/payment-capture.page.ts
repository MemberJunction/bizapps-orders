import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import type {
  mjBizAppsOrdersPaymentEntity,
  mjBizAppsOrdersPaymentLineEntity,
  mjBizAppsOrdersOrderEntity,
} from '@mj-biz-apps/orders-entities';
import {
  type OpenOrderRow,
  type Allocations,
  autoApplyOldestFirst,
  sortOldestFirst,
  totalApplied,
  unapplied,
  applicationIssues,
  remainderLabel,
  parseAmount,
  round2,
} from './payment-application';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';

/** The order statuses that can carry an open receivable (mirrors customer-ar / payment-entry). */
const OPEN_ORDER_STATUSES = `('Confirmed','Posted','Fulfilled')`;

/**
 * A payment as this page reads it. Field names are the REAL Payment columns — Payment has no
 * "AmountApplied" and no customer-name column, so both are derived here (lines / Organizations).
 */
export interface CapturePaymentRow {
  ID: string;
  PaymentNumber: string;
  PaymentDate: Date | null;
  Method: mjBizAppsOrdersPaymentEntity['Method'];
  Amount: number;
  ProcessingFeeAmount: number;
  NetAmount: number | null;
  Status: mjBizAppsOrdersPaymentEntity['Status'];
  CustomerOrganizationID: string | null;
  ReceivingCompany: string;
  PaymentProvider: string | null;
  ProviderChargeID: string | null;
  Description: string | null;
  JournalEntryID: string | null;
}

/** An existing application of a payment (the Payment Line IS the application record). */
export interface AppliedLineRow {
  ID: string;
  PaymentID: string;
  OrderID: string;
  Amount: number;
  AllocatedAt: Date | null;
}

/** The customer's open orders, with everything the accountant needs to choose between them. */
export interface CaptureOrderRow {
  ID: string;
  OrderNumber: string;
  OrderDate: Date | null;
  DueDate: Date | null;
  TotalGross: number | null;
  AmountPaid: number;
  Balance: number | null;
  Status: mjBizAppsOrdersOrderEntity['Status'];
  PaymentStatus: mjBizAppsOrdersOrderEntity['PaymentStatus'];
}

export interface OrganizationRow {
  ID: string;
  Name: string;
}

/** A row in the picker shown when no payment is selected. */
export interface CapturablePayment {
  Payment: CapturePaymentRow;
  CustomerName: string;
  Unapplied: number;
}

/** The union of every row shape this page reads — RunViews is generic over ONE T per batch. */
type CaptureReadRow = CapturePaymentRow | AppliedLineRow | CaptureOrderRow | OrganizationRow;

/** The outcome of one line's save — the page reports per-line because the write is NOT atomic. */
interface SaveOutcome {
  OrderNumber: string;
  Amount: number;
  Saved: boolean;
  Error: string | null;
}

/**
 * Payment capture workspace — apply ONE arrived payment to a customer's open orders (§13.2's
 * missing half; built at Marcelo's direction 2026-07-16 as the artefact to ask Jeremy against).
 *
 * "Capture" HERE means what Marcelo defined it as: money that has ARRIVED but that no accountant has
 * yet assigned to orders — an UNAPPLIED payment awaiting application. It is deliberately NOT the
 * provider-capture verb of `Orders.CapturePayment` (which charges a card and books the JE). Those two
 * senses of the word collide, and that collision is itself an open question for Jeremy (Q3 below).
 *
 * Shape:
 *   - `[PaymentID]` null  → a picker of payments with money still unapplied.
 *   - `[PaymentID]` set   → the workspace: the payment on the left, the customer's open orders on the
 *                           right, allocation inputs, a live remainder, and an oldest-first auto-apply.
 *
 * ALL the allocation arithmetic is `./payment-application` (tier-1 tested at exact figures) — this
 * component does not re-implement a single sum. What it adds is the payment's ALREADY-applied amount:
 * the money still available is `Amount − Σ existing lines`, and that remainder (not the gross) is what
 * gets allocated.
 *
 * ⚠ ATOMICITY — read `Apply()` before changing it. There is no `Orders.ApplyPayment` Remote Operation
 * (the orders server registers ConfirmOrder / CapturePayment / GrantEntitlements / GetOverdueWorklist /
 * CreateRevRecSchedule / CreateReversalOrder — no application op). So this page writes each Payment Line
 * through the plain entity layer, one save at a time, and says so in the UI. It does NOT pretend to be
 * atomic. This is safe-but-partial rather than silently-wrong because each line stands alone: the
 * server's `PaymentLineEntityServer` validates it against the payment's total and recomputes THAT
 * order's AmountPaid/Balance/PaymentStatus per save, and NO journal entry is booked on application
 * (the ledger entry happens at provider-capture time, in PaymentEntityServer). A failure mid-way
 * therefore leaves the earlier orders correctly credited and the rest untouched — visible, resumable,
 * and reported per line — never a half-booked ledger.
 */
@Component({
  standalone: false,
  selector: 'mj-payment-capture-page',
  templateUrl: './payment-capture.page.html',
  styleUrls: ['./shell-table.css', './payment-capture.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentCapturePageComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header owns the ONE refresh; this page listens while mounted. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  /** The payment to work. `null` → the picker. The shell reuses this instance, hence OnChanges. */
  @Input() PaymentID: string | null = null;

  public Payment: CapturePaymentRow | null = null;
  public CustomerName: string | null = null;
  public ExistingLines: AppliedLineRow[] = [];
  public OpenOrders: CaptureOrderRow[] = [];
  public Allocation: Allocations = {};

  /** The picker's rows (only loaded when PaymentID is null). */
  public Capturable: CapturablePayment[] = [];

  public IsLoading = false;
  public IsApplying = false;
  public LoadError: string | null = null;
  public ActionMessage: string | null = null;
  public ActionIsError = false;
  public Outcomes: SaveOutcome[] = [];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The shell keeps ONE instance and re-points it, so a PaymentID change is a whole new subject:
    // drop the previous payment's allocation before it can be saved against the new one.
    if (changes['PaymentID'] && !changes['PaymentID'].firstChange) {
      this.resetState();
      void this.load();
    }
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  public Refresh(): void {
    void this.load();
  }

  // ─── loading ───────────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      if (this.PaymentID) await this.loadWorkspace(this.PaymentID);
      else await this.loadCapturable();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The picker: payments that have arrived with money still unapplied.
   *
   * ONE batched read (payments + every line of those payments + the customer names) — the unapplied
   * remainder is derived in memory, never a query per payment.
   */
  private async loadCapturable(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [paymentsRes, linesRes, orgsRes] = await rv.RunViews<CaptureReadRow>(
      [
        {
          EntityName: PAYMENT_ENTITY,
          ExtraFilter: `Status IN ('Pending','Captured')`,
          Fields: this.paymentFields,
          OrderBy: 'PaymentDate DESC',
          ResultType: 'simple',
        },
        {
          EntityName: PAYMENT_LINE_ENTITY,
          Fields: ['ID', 'PaymentID', 'OrderID', 'Amount', 'AllocatedAt'],
          ResultType: 'simple',
        },
        { EntityName: ORGANIZATION_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' },
      ],
      this.ProviderToUse.CurrentUser,
    );
    if (!paymentsRes.Success) throw new Error(paymentsRes.ErrorMessage ?? 'Could not load payments.');

    const payments = (paymentsRes.Results ?? []) as CapturePaymentRow[];
    const lines = (linesRes.Success ? (linesRes.Results ?? []) : []) as AppliedLineRow[];
    const orgs = (orgsRes.Success ? (orgsRes.Results ?? []) : []) as OrganizationRow[];
    this.Capturable = this.buildCapturable(payments, lines, orgs);
  }

  /** Payments with an unapplied remainder, biggest first — the most money waiting on a decision. */
  private buildCapturable(
    payments: CapturePaymentRow[],
    lines: AppliedLineRow[],
    orgs: OrganizationRow[],
  ): CapturablePayment[] {
    const appliedByPayment = this.sumLinesByPayment(lines);
    const nameByOrg = new Map(orgs.map((o) => [NormalizeUUID(o.ID), o.Name]));
    return payments
      .map((p) => ({
        Payment: p,
        CustomerName: p.CustomerOrganizationID
          ? (nameByOrg.get(NormalizeUUID(p.CustomerOrganizationID)) ?? '(unnamed customer)')
          : '(no customer on the payment)',
        Unapplied: round2(round2(p.Amount) - (appliedByPayment.get(NormalizeUUID(p.ID)) ?? 0)),
      }))
      .filter((r) => Math.abs(r.Unapplied) >= 0.005)
      .sort((a, b) => b.Unapplied - a.Unapplied);
  }

  /** Σ applied per payment, keyed by NORMALIZED id (SQL Server hands UUIDs back uppercase). */
  private sumLinesByPayment(lines: AppliedLineRow[]): Map<string, number> {
    const totals = new Map<string, number>();
    for (const l of lines) {
      const key = NormalizeUUID(l.PaymentID);
      totals.set(key, round2((totals.get(key) ?? 0) + Number(l.Amount)));
    }
    return totals;
  }

  /** The workspace: the payment, its existing applications, and its customer's open orders. */
  private async loadWorkspace(paymentID: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [paymentRes, linesRes] = await rv.RunViews<CaptureReadRow>(
      [
        { EntityName: PAYMENT_ENTITY, ExtraFilter: `ID='${paymentID}'`, Fields: this.paymentFields, ResultType: 'simple' },
        {
          EntityName: PAYMENT_LINE_ENTITY,
          ExtraFilter: `PaymentID='${paymentID}'`,
          Fields: ['ID', 'PaymentID', 'OrderID', 'Amount', 'AllocatedAt'],
          OrderBy: 'AllocatedAt ASC',
          ResultType: 'simple',
        },
      ],
      this.ProviderToUse.CurrentUser,
    );
    if (!paymentRes.Success) throw new Error(paymentRes.ErrorMessage ?? 'Could not load the payment.');

    this.Payment = ((paymentRes.Results ?? []) as CapturePaymentRow[])[0] ?? null;
    this.ExistingLines = (linesRes.Success ? (linesRes.Results ?? []) : []) as AppliedLineRow[];
    if (!this.Payment) throw new Error(`Payment ${paymentID} was not found.`);

    await this.loadCustomerContext(this.Payment.CustomerOrganizationID);
  }

  /** The customer's name + open orders — one batched read, skipped when the payment names no customer. */
  private async loadCustomerContext(customerID: string | null): Promise<void> {
    if (!customerID) {
      this.CustomerName = null;
      this.OpenOrders = [];
      this.Allocation = {};
      return;
    }
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [ordersRes, orgRes] = await rv.RunViews<CaptureReadRow>(
      [
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: `CustomerOrganizationID='${customerID}' AND Status IN ${OPEN_ORDER_STATUSES} AND Balance > 0`,
          Fields: ['ID', 'OrderNumber', 'OrderDate', 'DueDate', 'TotalGross', 'AmountPaid', 'Balance', 'Status', 'PaymentStatus'],
          OrderBy: 'DueDate ASC',
          ResultType: 'simple',
        },
        { EntityName: ORGANIZATION_ENTITY, ExtraFilter: `ID='${customerID}'`, Fields: ['ID', 'Name'], ResultType: 'simple' },
      ],
      this.ProviderToUse.CurrentUser,
    );
    if (!ordersRes.Success) throw new Error(ordersRes.ErrorMessage ?? 'Could not load the open orders.');

    this.OpenOrders = (ordersRes.Results ?? []) as CaptureOrderRow[];
    this.CustomerName = ((orgRes.Success ? (orgRes.Results ?? []) : []) as OrganizationRow[])[0]?.Name ?? null;
    // Every order starts at zero: auto-allocate is an explicit act, never a silent default that
    // spends the operator's money before they have looked at the list.
    this.Allocation = Object.fromEntries(this.OpenOrders.map((o) => [o.ID, '0.00']));
  }

  private get paymentFields(): string[] {
    return [
      'ID',
      'PaymentNumber',
      'PaymentDate',
      'Method',
      'Amount',
      'ProcessingFeeAmount',
      'NetAmount',
      'Status',
      'CustomerOrganizationID',
      'ReceivingCompany',
      'PaymentProvider',
      'ProviderChargeID',
      'Description',
      'JournalEntryID',
    ];
  }

  private resetState(): void {
    this.Payment = null;
    this.CustomerName = null;
    this.ExistingLines = [];
    this.OpenOrders = [];
    this.Allocation = {};
    this.Outcomes = [];
    this.ActionMessage = null;
    this.ActionIsError = false;
  }

  // ─── the money (all arithmetic delegated to ./payment-application) ──────────

  /** The allocator's rows: the pure shape, from the real Order columns. */
  public get AllocatableOrders(): OpenOrderRow[] {
    return sortOldestFirst(
      this.OpenOrders.map((o) => ({
        OrderID: o.ID,
        OrderNumber: o.OrderNumber,
        DueDate: o.DueDate ? this.toDateKey(o.DueDate) : null,
        Balance: round2(o.Balance ?? 0),
      })),
    );
  }

  /** Σ of the applications already on this payment. */
  public get AlreadyApplied(): number {
    return round2(this.ExistingLines.reduce((sum, l) => sum + Number(l.Amount), 0));
  }

  /**
   * The money this session may allocate = the payment's gross LESS what is already applied.
   *
   * This — not `Payment.Amount` — is what feeds the allocator, so a part-applied payment can never
   * be over-applied by re-opening the workspace.
   */
  public get AvailableToApply(): number {
    return round2(round2(this.Payment?.Amount ?? 0) - this.AlreadyApplied);
  }

  public get Applied(): number {
    return totalApplied(this.Allocation);
  }
  public get Unapplied(): number {
    return unapplied(this.AvailableToApply, this.Allocation);
  }
  public get RemainderLabel(): string {
    return remainderLabel(this.AvailableToApply, this.Allocation);
  }
  public get IsFullyApplied(): boolean {
    return Math.abs(this.Unapplied) < 0.005;
  }

  public AutoApply(): void {
    this.Allocation = autoApplyOldestFirst(this.AvailableToApply, this.AllocatableOrders);
    this.cdr.markForCheck();
  }

  public ClearAllocation(): void {
    this.Allocation = Object.fromEntries(this.OpenOrders.map((o) => [o.ID, '0.00']));
    this.cdr.markForCheck();
  }

  public OnAllocationChanged(): void {
    this.cdr.markForCheck();
  }

  public AllocationFor(order: CaptureOrderRow): number {
    return parseAmount(this.Allocation[order.ID] ?? '');
  }

  /** The order's balance AFTER what is typed against it — what the accountant is actually deciding. */
  public RemainingFor(order: CaptureOrderRow): number {
    return round2(round2(order.Balance ?? 0) - this.AllocationFor(order));
  }

  public IsOverdue(order: CaptureOrderRow): boolean {
    return !!order.DueDate && (order.Balance ?? 0) > 0 && new Date(order.DueDate).getTime() < Date.now();
  }

  public ExistingApplicationFor(order: CaptureOrderRow): number {
    return round2(
      this.ExistingLines.filter((l) => UUIDsEqual(l.OrderID, order.ID)).reduce((sum, l) => sum + Number(l.Amount), 0),
    );
  }

  /** Every reason this allocation cannot be recorded — the pure rules, plus this page's own. */
  public get Issues(): string[] {
    if (!this.Payment) return ['No payment is loaded.'];
    const issues = applicationIssues(this.AvailableToApply, this.AllocatableOrders, this.Allocation);
    if (!this.Payment.CustomerOrganizationID) {
      issues.unshift('This payment names no customer, so there are no orders to apply it to.');
    }
    if (this.Applied <= 0) issues.unshift('Allocate some of the payment before applying it.');
    return issues;
  }

  public get CanApply(): boolean {
    return !this.IsApplying && this.Issues.length === 0;
  }
  public get ApplyBlockedReason(): string | null {
    return this.Issues[0] ?? null;
  }

  // ─── the act ───────────────────────────────────────────────────────────────

  /**
   * Apply: write one Payment Line per allocated order, through the plain entity layer.
   *
   * NOT ATOMIC, and the UI says so. There is no `Orders.ApplyPayment` Remote Operation to call, and
   * hand-rolling a browser "transaction" here would be a claim we cannot honour. Instead each line is
   * saved on its own and its result reported: `PaymentLineEntityServer` validates it against the
   * payment total and recomputes that order's AmountPaid/Balance/PaymentStatus, and application books
   * no ledger entry — so a partial run is partial APPLICATION (visible, resumable), never a partial
   * BOOKING. Save() returns a boolean and does not throw on a logical failure: check it, every time.
   */
  public async Apply(): Promise<void> {
    if (!this.CanApply || !this.Payment) return;
    this.IsApplying = true;
    this.ActionMessage = null;
    this.Outcomes = [];
    this.cdr.markForCheck();
    try {
      const outcomes = await this.writeLines(this.Payment.ID);
      this.Outcomes = outcomes;
      this.reportOutcomes(outcomes);
      await this.load();
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.IsApplying = false;
      this.cdr.markForCheck();
    }
  }

  /** One Payment Line per non-zero allocation, saved individually. Never a save inside a loop of reads. */
  private async writeLines(paymentID: string): Promise<SaveOutcome[]> {
    const md = new Metadata();
    const user = this.ProviderToUse.CurrentUser;
    const outcomes: SaveOutcome[] = [];

    for (const order of this.OpenOrders) {
      const amount = round2(parseAmount(this.Allocation[order.ID] ?? ''));
      if (!Number.isFinite(amount) || amount <= 0) continue; // a zero row is not an application

      const line = await md.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
      line.NewRecord();
      line.PaymentID = paymentID;
      line.OrderID = order.ID;
      line.Amount = amount;
      const saved = await line.Save();
      outcomes.push({
        OrderNumber: order.OrderNumber,
        Amount: amount,
        Saved: saved,
        Error: saved ? null : (line.LatestResult?.CompleteMessage ?? 'unknown error'),
      });
    }
    return outcomes;
  }

  /** Say exactly what happened — including a partial run, which this write can produce. */
  private reportOutcomes(outcomes: SaveOutcome[]): void {
    const saved = outcomes.filter((o) => o.Saved);
    const failed = outcomes.filter((o) => !o.Saved);
    const total = round2(saved.reduce((sum, o) => sum + o.Amount, 0));

    if (failed.length === 0) {
      this.ActionMessage = `Applied ${total.toFixed(2)} across ${saved.length} order(s).`;
      this.ActionIsError = false;
      return;
    }
    this.setError(
      saved.length === 0
        ? `Nothing was applied — all ${failed.length} allocation(s) failed. See the per-order results below.`
        : `PARTIALLY applied: ${saved.length} of ${outcomes.length} allocation(s) saved (${total.toFixed(2)}); ` +
            `${failed.length} failed. The saved ones are real and already credited to their orders — ` +
            `do NOT re-enter them. See the per-order results below and retry only the failures.`,
    );
  }

  private setError(message: string): void {
    this.ActionMessage = message;
    this.ActionIsError = true;
    this.cdr.markForCheck();
  }

  /** A DATE column's yyyy-MM-dd, read in UTC — the allocator sorts these lexically. */
  private toDateKey(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
  }
}
