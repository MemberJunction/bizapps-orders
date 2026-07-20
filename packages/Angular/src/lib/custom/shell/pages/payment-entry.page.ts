import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { Metadata, RunView, type IRemoteOperationProvider } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompanyScopeService } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsOrdersPaymentEntity, mjBizAppsOrdersPaymentLineEntity } from '@mj-biz-apps/orders-entities';
import { PaymentEntryClient } from './payment-entry.client';
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

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** Payment methods the MANUAL provider covers (the mockup's set). */
type PaymentMethodValue = mjBizAppsOrdersPaymentEntity['Method'];
const MANUAL_METHODS: readonly PaymentMethodValue[] = ['Wire', 'ACH', 'Check', 'Cash'] as const;

export interface CustomerOption {
  ID: string;
  Name: string;
}

/**
 * Payment entry (orders UI plan §13.2) — §4's Jeremy workflow: take the money in, then say which
 * invoices it clears.
 *
 * Two halves, as the approved mockup draws them: the payment form, and the application panel over
 * the customer's open orders with an oldest-first auto-apply and a live unapplied remainder.
 *
 * Record = TWO steps, deliberately:
 *   1. the Payment + its PaymentLines are written in ONE TransactionGroup (a payment that exists
 *      without its allocations would misstate every order it was supposed to clear);
 *   2. `Orders.CapturePayment` then captures + books the JE — a Remote Operation because it talks to
 *      a provider and writes to the ledger, neither of which belongs in the browser.
 * Step 2 is NOT rolled into step 1 for the same reason accounting's batch build keeps its task raise
 * separate: the money record is the durable fact; the capture is a downstream action that can be
 * retried without re-entering the payment.
 *
 * All the arithmetic lives in ./payment-application (tier-1 tested with exact figures).
 */
@Component({
  standalone: false,
  selector: 'mj-payment-entry-page',
  templateUrl: './payment-entry.page.html',
  styleUrls: ['./shell-table.css', './payment-entry.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentEntryPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  public Scope = inject(CompanyScopeService);
  private client = new PaymentEntryClient();

  public readonly Methods = MANUAL_METHODS;

  // ─── the payment form ──────────────────────────────────────────────────────
  public CustomerID: string | null = null;
  public Amount = '';
  public Method: PaymentMethodValue = 'Wire';
  public PaymentDate = new Date().toISOString().slice(0, 10);
  public ReceivingCompanyID: string | null = null;
  /** The mockup's "Reference №". Payment has no such column — this is its Description (see template). */
  public Reference = '';
  /** Optional free-text note (Payment.Notes) — set inside the payment write transaction, not after. */
  public Notes = '';

  // ─── the application panel ─────────────────────────────────────────────────
  public Customers: CustomerOption[] = [];
  public OpenOrders: OpenOrderRow[] = [];
  public Allocation: Allocations = {};

  public IsLoadingOrders = false;
  public IsRecording = false;
  public ActionMessage: string | null = null;
  public ActionIsError = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
    // Seed the receiving company from the app scope when it names exactly one — with several in
    // scope we cannot know which received the money, so we ask.
    this.ReceivingCompanyID = this.Scope.SelectedIDs.length === 1 ? this.Scope.SelectedIDs[0] : null;
    await this.loadCustomers();
    this.cdr.markForCheck();
  }

  public get Companies(): Array<{ ID: string; Name: string }> {
    return this.Scope.Companies;
  }

  public get PaymentAmount(): number {
    return parseAmount(this.Amount);
  }

  /**
   * The customers with open orders.
   *
   * Read from the orders themselves rather than an organization list: this picker exists to answer
   * "who is paying us", and only a customer with an open balance can be. One read, deduped in
   * memory.
   */
  private async loadCustomers(): Promise<void> {
    const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{
      CustomerOrganizationID: string | null;
      Customer: string | null;
    }>(
      {
        EntityName: ORDER_ENTITY,
        ExtraFilter: `Status IN ('Confirmed','Posted','Fulfilled') AND Balance > 0 AND CustomerOrganizationID IS NOT NULL`,
        Fields: ['CustomerOrganizationID', 'Customer'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!res.Success) {
      this.LoadError = res.ErrorMessage ?? 'Could not load customers.';
      return;
    }
    const seen = new Map<string, string>();
    for (const r of res.Results ?? []) {
      if (r.CustomerOrganizationID && !seen.has(r.CustomerOrganizationID)) {
        seen.set(r.CustomerOrganizationID, r.Customer ?? '(unnamed customer)');
      }
    }
    this.Customers = [...seen.entries()]
      .map(([ID, Name]) => ({ ID, Name }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public async OnCustomerChanged(): Promise<void> {
    this.Allocation = {};
    await this.loadOpenOrders();
  }

  /** The chosen customer's open orders — what this payment can clear. */
  private async loadOpenOrders(): Promise<void> {
    if (!this.CustomerID) {
      this.OpenOrders = [];
      return;
    }
    this.IsLoadingOrders = true;
    this.cdr.markForCheck();
    try {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{
        ID: string;
        OrderNumber: string;
        DueDate: string | null;
        Balance: number | null;
      }>(
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: `CustomerOrganizationID='${this.CustomerID}' AND Status IN ('Confirmed','Posted','Fulfilled') AND Balance > 0`,
          Fields: ['ID', 'OrderNumber', 'DueDate', 'Balance'],
          OrderBy: 'DueDate ASC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load open orders.');

      this.OpenOrders = sortOldestFirst(
        (res.Results ?? []).map((r) => ({
          OrderID: r.ID,
          OrderNumber: r.OrderNumber,
          DueDate: r.DueDate,
          Balance: round2(r.Balance ?? 0),
        })),
      );
      // Start every order at zero — auto-apply is an explicit act, not a default that quietly
      // allocates the operator's money before they look.
      this.Allocation = Object.fromEntries(this.OpenOrders.map((o) => [o.OrderID, '0.00']));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.OpenOrders = [];
    } finally {
      this.IsLoadingOrders = false;
      this.cdr.markForCheck();
    }
  }

  public AutoApply(): void {
    this.Allocation = autoApplyOldestFirst(this.PaymentAmount, this.OpenOrders);
    this.cdr.markForCheck();
  }

  public OnAllocationChanged(): void {
    this.cdr.markForCheck();
  }

  public IsOverdue(order: OpenOrderRow): boolean {
    return !!order.DueDate && new Date(order.DueDate).getTime() < Date.now();
  }

  public get Applied(): number {
    return totalApplied(this.Allocation);
  }
  public get Unapplied(): number {
    return unapplied(this.PaymentAmount, this.Allocation);
  }
  public get RemainderLabel(): string {
    return remainderLabel(this.PaymentAmount, this.Allocation);
  }
  public get IsFullyApplied(): boolean {
    return Math.abs(this.Unapplied) < 0.005;
  }

  public get Issues(): string[] {
    const issues = applicationIssues(this.PaymentAmount, this.OpenOrders, this.Allocation);
    if (!this.CustomerID) issues.unshift('Pick the customer this payment came from.');
    if (!this.ReceivingCompanyID) issues.unshift('Pick the company that received the money.');
    if (!this.PaymentDate) issues.unshift('Pick the date the payment was received.');
    return issues;
  }

  public get CanRecord(): boolean {
    return !this.IsRecording && this.Issues.length === 0;
  }
  public get RecordBlockedReason(): string | null {
    return this.Issues[0] ?? null;
  }

  /**
   * Record: write the Payment + its PaymentLines atomically, then capture.
   *
   * An unapplied remainder is ALLOWED — a customer can overpay or pay on account, and the remainder
   * is real money we have received. It just isn't allocated yet.
   */
  public async Record(): Promise<void> {
    if (!this.CanRecord) return;
    this.IsRecording = true;
    this.ActionMessage = null;
    this.cdr.markForCheck();
    try {
      const paymentId = await this.writePaymentAndLines();
      const capture = await this.client.Capture(this.opProvider, paymentId);

      if (!capture.Success) {
        // The payment EXISTS — say so, so nobody re-enters it. Only the capture failed.
        this.setError(
          `The payment was recorded but its capture failed: ${capture.Errors?.join('; ') ?? 'unknown'}. ` +
            `It can be retried from All payments — do not re-enter it.`,
        );
        return;
      }

      this.ActionMessage = this.IsFullyApplied
        ? `Recorded and captured ${this.PaymentAmount.toFixed(2)} — fully applied.`
        : `Recorded and captured ${this.PaymentAmount.toFixed(2)} — ${this.Unapplied.toFixed(2)} left unapplied.`;
      this.ActionIsError = false;
      await this.resetAfterRecord();
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.IsRecording = false;
      this.cdr.markForCheck();
    }
  }

  /** The Payment + every non-zero PaymentLine, in ONE transaction. Returns the payment id. */
  private async writePaymentAndLines(): Promise<string> {
    const md = new Metadata();
    const user = this.ProviderToUse.CurrentUser;
    const tg = await this.ProviderToUse.CreateTransactionGroup();

    const payment = await md.GetEntityObject<mjBizAppsOrdersPaymentEntity>(PAYMENT_ENTITY, user);
    payment.NewRecord();
    payment.ReceivingCompanyID = this.ReceivingCompanyID as string;
    payment.CustomerOrganizationID = this.CustomerID;
    payment.PaymentDate = new Date(this.PaymentDate);
    payment.Method = this.Method;
    payment.Amount = this.PaymentAmount;
    // Pending until the capture op says otherwise — never optimistically 'Captured'.
    payment.Status = 'Pending';
    if (this.Reference.trim()) payment.Description = this.Reference.trim();
    if (this.Notes.trim()) payment.Notes = this.Notes.trim();
    payment.TransactionGroup = tg;
    await payment.Save();

    for (const order of this.OpenOrders) {
      const amount = parseAmount(this.Allocation[order.OrderID] ?? '');
      if (!Number.isFinite(amount) || amount <= 0) continue; // a zero row is not an allocation
      const line = await md.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
      line.NewRecord();
      line.PaymentID = payment.ID; // available immediately — queued, not committed
      line.OrderID = order.OrderID;
      line.Amount = round2(amount);
      line.TransactionGroup = tg;
      await line.Save();
    }

    if (!(await tg.Submit())) throw new Error('The payment could not be recorded — the transaction rolled back.');
    return payment.ID;
  }

  private async resetAfterRecord(): Promise<void> {
    this.Amount = '';
    this.Reference = '';
    this.Notes = '';
    // Refetch: the balances this panel just changed are exactly what it shows.
    await this.loadOpenOrders();
    await this.loadCustomers();
  }

  private setError(message: string): void {
    this.ActionMessage = message;
    this.ActionIsError = true;
    this.cdr.markForCheck();
  }

  private get opProvider(): IRemoteOperationProvider {
    return this.ProviderToUse as unknown as IRemoteOperationProvider;
  }
}
