import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { Metadata, RunView, type IRemoteOperationProvider } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';
import { WorkspaceTabStore, type WorkspaceTab, CrossAppLinkService } from '@mj-biz-apps/accounting-ng';
import {
  OrdersEngineBase,
  resolveProductPrice,
  type OrderStatus,
  type PriceSource,
} from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersOrderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { OrderEditorClient, isAccountMappingFailure } from './order-editor.client';
import {
  type OrderDraftState,
  type OrderDraftLine,
  newOrderLine,
  parseNum,
  discountFraction,
  lineNet,
  lineIssue,
  isOrderLineEmpty,
  draftMoney,
  orderDraftIssues,
} from './order-draft';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/** Sentinel PriceNote meaning "the catalog had no price for this", as opposed to a user override. */
const NO_PRICE_RULE = '__no-price-rule__';

/** The editor's inner tabs (Q2 FINAL, mockup-approved). */
export type OrderEditorTab = 'details' | 'lines' | 'addresses' | 'payments' | 'accounting';

/** Every value the Status CHECK allows, derived — never hand-copied (root CLAUDE.md rule 2c). */
export type OrderStatusValue = mjBizAppsOrdersOrderEntity['Status'];
/** Every value the OrderType CHECK allows, derived from the entity for the same reason. */
export type OrderTypeValue = mjBizAppsOrdersOrderEntity['OrderType'];

/**
 * Why a start-status is unavailable, or `null` when it can be picked.
 *
 * A `Record` keyed by the DERIVED union is deliberate: when a migration widens the Status CHECK and
 * CodeGen regrows the union, this object stops compiling until someone decides whether the new value
 * is safe to start an order in. A hand-written array would silently drop it instead.
 */
const START_STATUS_BLOCKED: Record<OrderStatusValue, string | null> = {
  Draft: null,
  Quoted: null,
  // Selectable — but it does NOT write Status='Confirmed'. Save books through Orders.ConfirmOrder.
  Confirmed: null,
  Posted: 'Posted is reached by posting a Confirmed order — it cannot be an order’s starting status here.',
  Fulfilled: 'Fulfilled is reached by fulfilling a Posted order — it cannot be an order’s starting status here.',
  Voided: 'Void an order with the Void button once it exists — an order cannot start out Voided.',
};

/** Display labels for the OrderType picker, keyed by the derived union (same exhaustiveness win). */
const ORDER_TYPE_LABEL: Record<OrderTypeValue, string> = {
  Sale: 'Sale',
  Return: 'Return',
  Cancellation: 'Cancellation',
  Amendment: 'Amendment',
  CreditMemoOrder: 'Credit memo order',
};

/** One row of the start-status drop-down. */
export interface StatusOption {
  Value: OrderStatusValue;
  Blocked: string | null;
}

/** One row of the order-type drop-down. */
export interface OrderTypeOption {
  Value: OrderTypeValue;
  Label: string;
}

/** A product offered by the picker — flattened so the template does no entity work. */
export interface ProductOption {
  ID: string;
  Label: string;
}

/** A payment-terms option, flattened off the engine's cache. */
export interface TermsOption {
  ID: string;
  Label: string;
}

/**
 * The Order columns the shared `OrderDraftState` doesn't carry.
 *
 * `OrderDraftState` (./order-draft) is the shared, unit-tested shape behind the money math and the
 * submit rules; it deliberately holds only what those pure functions read. The rest of the Order's
 * writable surface lives here and is composed onto it with an intersection, so the editor can expose
 * every option without widening the tier-1 contract that other code depends on.
 */
export interface OrderDraftExtras {
  /**
   * The status the operator wants this order to START in — NOT the order's current status.
   *
   * These are two different things and conflating them is a data-integrity bug: `Status` is what is
   * (or will be) persisted, while `StartStatus` is an intent that `Save` interprets. Picking
   * `Confirmed` here does not write `Status='Confirmed'` — see `Save`.
   */
  StartStatus: OrderStatusValue;
  OrderType: OrderTypeValue;
  CustomerPersonID: string | null;
  SalesRepUserID: string | null;
  BillToAddressID: string | null;
  ShipToAddressID: string | null;
  ContractID: string | null;
  ApprovalTaskID: string | null;
  RequestedDeliveryDate: string | null;
  ReversesOrderID: string | null;
  ReversalReason: string;
  Notes: string;
}

/** The editor's full per-tab draft: the shared pure state plus this screen's extra columns. */
export type OrderDraft = OrderDraftState & OrderDraftExtras;

/**
 * Order editor (orders UI plan §13.1) — the anchor screen and the full-depth target of every order
 * pop-out. A workspace, not a modal: an order with a line editor fails the element doctrine's
 * encapsulation test.
 *
 * What it reuses rather than reinvents (the point of this screen):
 *  - **The F1 status matrix** (`AllowedTransitions` / `validateTransition`) drives the stepper's
 *    enabled/disabled state AND its tooltips. The server validates with the SAME functions, so the
 *    UI cannot offer a move the server will refuse — no second copy of the lifecycle rules.
 *  - **The money math** (`computeLineNet` etc. via ./order-draft) is the shared engine-base code the
 *    server uses to compute the stored totals, so the strip agrees with the DB by construction.
 *  - **Price resolution** (`resolveProductPrice`) runs client-side off the engine's cached price
 *    data — no round-trip — and yields the B.2 price-source badge. A manual edit flips the source to
 *    `DirectEntry` ("overridden"), which is exactly BO-D33's rule: direct entry wins.
 *  - **Confirm** goes through `Orders.ConfirmOrder`, never a status write: only the server can put
 *    the order row and its journal entries in one TransactionGroup.
 *
 * Save composes the order + its lines in ONE client-side TransactionGroup — a half-saved order
 * (header with no lines) must not be reachable.
 */
@Component({
  standalone: false,
  selector: 'mj-order-editor-page',
  templateUrl: './order-editor.page.html',
  styleUrls: ['./order-editor.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderEditorPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private links = inject(CrossAppLinkService);

  private tabs = new WorkspaceTabStore<OrderDraft>();
  private client = new OrderEditorClient();
  private keySeq = 0;

  /** The inner tabs, typed — so the template needs no `$any` to hand an id back. */
  public readonly InnerTabs: ReadonlyArray<{ id: OrderEditorTab; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'lines', label: 'Lines' },
    { id: 'addresses', label: 'Bill-To / Ship-To' },
    { id: 'payments', label: 'Payments' },
    { id: 'accounting', label: 'Accounting' },
  ];

  public ActiveTab: OrderEditorTab = 'lines';
  public IsSaving = false;
  public IsConfirming = false;
  public ActionMessage: string | null = null;
  public ActionIsError = false;

  /** The §13.1 loud Confirm-failure banner. */
  public ConfirmErrors: string[] = [];
  public ShowAccountLinksFix = false;

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    // The catalog + price data the line editor resolves against. Cached by the engine — one load,
    // no per-keystroke round-trip.
    await OrdersEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    this.openNewDraft();
  }

  // ─── tabs ──────────────────────────────────────────────────────────────────

  public get Tabs(): WorkspaceTab[] {
    return this.tabs.Tabs;
  }
  public get ActiveTabId(): string | null {
    return this.tabs.ActiveId;
  }
  public get Draft(): OrderDraft | null {
    return this.tabs.ActiveTab?.State ?? null;
  }
  public get IsSaved(): boolean {
    return !!this.Draft?.OrderID;
  }
  /** A booked order's lines are immutable here — corrections go through a reversal order (F2). */
  public get IsLocked(): boolean {
    const s = this.Draft?.Status;
    return s === 'Confirmed' || s === 'Posted' || s === 'Fulfilled' || s === 'Voided';
  }

  public openNewDraft(): void {
    this.tabs.Open({
      Id: `order-draft-${++this.keySeq}-${Date.now()}`,
      Label: 'New order (draft)',
      Icon: 'fa-solid fa-pen-ruler',
      Status: 'draft',
      State: this.defaultDraft(),
    });
    this.clearMessages();
    this.cdr.markForCheck();
  }

  public SelectTab(id: string): void {
    this.tabs.Activate(id);
    this.clearMessages();
    this.cdr.markForCheck();
  }

  public CloseTab(id: string): void {
    this.tabs.Close(id);
    if (this.tabs.Count === 0) this.openNewDraft();
    this.clearMessages();
    this.cdr.markForCheck();
  }

  public Discard(): void {
    if (this.tabs.ActiveId) this.CloseTab(this.tabs.ActiveId);
  }

  public GoToTab(tab: OrderEditorTab): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }

  private defaultDraft(): OrderDraft {
    return {
      Status: 'Draft',
      StartStatus: 'Draft',
      OrderType: 'Sale',
      CustomerOrganizationID: null,
      CustomerPersonID: null,
      SalesRepUserID: null,
      BillToAddressID: null,
      ShipToAddressID: null,
      ContractID: null,
      ApprovalTaskID: null,
      OrderDate: new Date().toISOString().slice(0, 10),
      RequestedDeliveryDate: null,
      DueDate: null,
      PaymentTermsTypeID: null,
      ExternalDocumentNumber: '',
      Description: '',
      Notes: '',
      ReversesOrderID: null,
      ReversalReason: '',
      AmountPaid: 0,
      PaymentStatus: null,
      Lines: [this.newLine()],
    };
  }

  private newLine(): OrderDraftLine {
    return newOrderLine(`ol-${++this.keySeq}`);
  }

  // ─── catalog / pricing ─────────────────────────────────────────────────────

  public get ProductOptions(): ProductOption[] {
    return OrdersEngineBase.Instance.Products.filter((p) => p.IsActive)
      .map((p) => ({ ID: p.ID, Label: p.Name }))
      .sort((a, b) => a.Label.localeCompare(b.Label));
  }

  /**
   * Resolve this line's suggested price from the engine's cached price data and stamp the source.
   *
   * Called when the product or quantity changes — the two inputs the price depends on. It does NOT
   * fire on a UnitPrice edit: that would immediately overwrite what the operator just typed.
   */
  private applyResolvedPrice(line: OrderDraftLine): void {
    if (!line.ProductID) return;
    const engine = OrdersEngineBase.Instance;
    const quantity = parseNum(line.Quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const result = resolveProductPrice({
      Quantity: quantity,
      AsOfDate: this.Draft?.OrderDate ? new Date(this.Draft.OrderDate) : new Date(),
      ProductPrices: engine.ProductPrices
        .filter((p) => UUIDsEqual(p.ProductID, line.ProductID as string))
        .map((p) => ({
          ID: p.ID,
          PriceListID: p.PriceListID,
          PricingModel: p.PricingModel,
          Amount: p.Amount,
          MinQuantity: p.MinQuantity,
          MaxQuantity: p.MaxQuantity,
          EffectiveFrom: p.EffectiveFrom,
          EffectiveTo: p.EffectiveTo,
        })),
      PriceTiers: engine.PriceTiers.map((t) => ({
        ProductPriceID: t.ProductPriceID,
        MinQuantity: t.MinQuantity,
        MaxQuantity: t.MaxQuantity,
        Amount: t.Amount,
        SortOrder: t.SortOrder,
      })),
      PriceLists: engine.PriceLists.map((l) => ({
        ID: l.ID,
        IsActive: l.IsActive,
        EffectiveFrom: l.EffectiveFrom,
        EffectiveTo: l.EffectiveTo,
      })),
    });

    if (result.Amount == null) {
      // No pricing rule matched — the operator supplies the price directly. This is NOT an override
      // (they haven't overridden anything yet) and must not be badged as one; it is "the catalog has
      // no price for this, type one". Distinguished by the sentinel note, read in PriceBadge.
      line.PriceSource = 'DirectEntry';
      line.PriceNote = NO_PRICE_RULE;
      return;
    }
    line.UnitPrice = result.Amount.toFixed(2);
    line.PriceSource = result.Source;
    line.PriceNote = this.priceNote(result.Source, quantity);
  }

  private priceNote(source: PriceSource, quantity: number): string | null {
    switch (source) {
      case 'PriceTier':
        return `tier @ qty ${quantity}`;
      case 'PriceList':
        return 'from a price list';
      case 'ProductPrice':
        return 'product default price';
      default:
        return null;
    }
  }

  /**
   * The B.2 price-source badge. Three states, deliberately distinct:
   *  - resolved from the catalog → what rule won;
   *  - no rule matched → "enter a price" (NOT an override — the operator has overridden nothing);
   *  - operator typed over a resolved price → "overridden", which is the BO-D33 signal that direct
   *    entry is winning.
   * Collapsing the middle case into "overridden" would accuse the user of an edit they never made.
   */
  public PriceBadge(line: OrderDraftLine): { Text: string; Overridden: boolean } | null {
    if (!line.ProductID) return null;
    if (line.PriceNote === NO_PRICE_RULE) return { Text: 'no catalog price — enter one', Overridden: false };
    if (line.PriceSource === 'DirectEntry') return { Text: 'overridden (direct entry)', Overridden: true };
    return { Text: line.PriceNote ?? line.PriceSource, Overridden: false };
  }

  // ─── lines ─────────────────────────────────────────────────────────────────

  public OnProductChanged(line: OrderDraftLine): void {
    this.applyResolvedPrice(line);
    this.touch();
  }

  public OnQuantityChanged(line: OrderDraftLine): void {
    // Re-resolve ONLY while the price is still engine-derived. Once the operator has overridden it,
    // a quantity change must not silently undo their entry (BO-D33: direct entry wins).
    if (line.PriceSource !== 'DirectEntry') this.applyResolvedPrice(line);
    this.touch();
  }

  /** Typing in the price column IS the override (B.2 / BO-D33). */
  public OnUnitPriceChanged(line: OrderDraftLine): void {
    line.PriceSource = 'DirectEntry';
    // Clear the no-rule sentinel: once they type, this IS a direct entry, badged as such.
    line.PriceNote = null;
    this.touch();
  }

  public AddLine(): void {
    this.Draft?.Lines.push(this.newLine());
    this.touch();
  }

  public RemoveLine(key: string): void {
    const d = this.Draft;
    if (!d) return;
    d.Lines = d.Lines.filter((l) => l.Key !== key);
    if (d.Lines.length === 0) d.Lines.push(this.newLine());
    this.touch();
  }

  public LineIssue(line: OrderDraftLine): string | null {
    return lineIssue(line);
  }
  public LineNet(line: OrderDraftLine): number {
    return lineNet(line);
  }

  /** Deferred-revenue lines carry a service period (UPD-2). */
  public IsDeferredLine(line: OrderDraftLine): boolean {
    if (!line.ProductID) return false;
    const product = OrdersEngineBase.Instance.Products.find((p) => UUIDsEqual(p.ID, line.ProductID as string));
    return product?.RevenueRecognitionType === 'Deferred';
  }

  public touch(): void {
    if (this.tabs.ActiveId && this.Draft) this.tabs.UpdateState(this.tabs.ActiveId, this.Draft);
    // Any edit invalidates the server's verdict on the previous shape.
    this.ConfirmErrors = [];
    this.cdr.markForCheck();
  }

  // ─── money strip ───────────────────────────────────────────────────────────

  public get Money(): { Total: number; Paid: number; Balance: number; PaymentStatus: string } {
    return this.Draft
      ? draftMoney(this.Draft)
      : { Total: 0, Paid: 0, Balance: 0, PaymentStatus: 'Unpaid' };
  }

  public get PaymentVariant(): MJStatBadgeVariant {
    switch (this.Money.PaymentStatus) {
      case 'Paid':
        return 'success';
      case 'PartiallyPaid':
        return 'info';
      case 'WrittenOff':
        return 'error';
      default:
        return 'default';
    }
  }

  // ─── status (a picker, not a stepper) ──────────────────────────────────────

  /**
   * The start-status drop-down's options.
   *
   * Replaces the old arrow stepper, which promised motion this screen doesn't do: the editor is
   * where an order is COMPOSED, so the only status question it can answer is "which status should
   * this order begin life in?".
   *
   * `Confirmed` is offered but is NOT a status write — see `Save`. `Posted`/`Fulfilled`/`Voided` are
   * offered-but-disabled with their reason rather than hidden, so the full lifecycle stays legible
   * and a disabled option teaches instead of vanishing.
   */
  public get StatusOptions(): StatusOption[] {
    return (Object.keys(START_STATUS_BLOCKED) as OrderStatusValue[]).map((value) => ({
      Value: value,
      Blocked: START_STATUS_BLOCKED[value],
    }));
  }

  public get OrderTypeOptions(): OrderTypeOption[] {
    return (Object.keys(ORDER_TYPE_LABEL) as OrderTypeValue[]).map((value) => ({
      Value: value,
      Label: ORDER_TYPE_LABEL[value],
    }));
  }

  /** Payment terms, off the engine's cache — a real picker, not a UUID field. */
  public get TermsOptions(): TermsOption[] {
    return OrdersEngineBase.Instance.PaymentTermsTypes.map((t) => ({ ID: t.ID, Label: t.Name })).sort((a, b) =>
      a.Label.localeCompare(b.Label),
    );
  }

  /**
   * The start-status picker only applies to an order that doesn't exist yet. Once saved, status is
   * owned by the verbs (Confirm books a JE; Void reverses) — a drop-down that silently re-wrote a
   * live order's status would bypass every one of those rules.
   */
  public get CanPickStartStatus(): boolean {
    return !this.IsSaved && !this.IsLocked;
  }

  /** What picking `Confirmed` actually means, said out loud next to the control. */
  public get StartStatusNote(): string | null {
    if (!this.CanPickStartStatus) return 'Status is set by the actions below once the order exists.';
    if (this.Draft?.StartStatus === 'Confirmed')
      return 'Saving will create the order and then Confirm it — booking its journal entries.';
    return null;
  }

  public OnStartStatusChanged(): void {
    this.touch();
  }

  public get StatusVariant(): MJStatBadgeVariant {
    switch (this.Draft?.Status) {
      case 'Voided':
        return 'error';
      case 'Fulfilled':
      case 'Posted':
        return 'success';
      case 'Confirmed':
        return 'info';
      default:
        return 'default';
    }
  }

  /** Post-Confirm the destructive verb becomes "Create reversal…" (F2) — never a backward edit. */
  public get VoidVerbLabel(): string {
    return this.IsLocked ? 'Create reversal…' : 'Void order…';
  }

  // ─── save ──────────────────────────────────────────────────────────────────

  public get Issues(): string[] {
    return this.Draft ? orderDraftIssues(this.Draft) : [];
  }

  public get CanSave(): boolean {
    return !!this.Draft && !this.IsSaving && !this.IsLocked && this.Issues.length === 0;
  }

  public get SaveBlockedReason(): string | null {
    if (this.IsLocked) return `A ${this.Draft?.Status} order cannot be edited — correct it with a reversal order.`;
    return this.Issues[0] ?? null;
  }

  /** An existing order is being updated; a new one is being created. Different verb, same button. */
  public get SaveVerbLabel(): string {
    return this.IsSaved ? 'Save updates' : 'Save order';
  }

  /**
   * Save the order + its lines in ONE transaction, then — if the operator asked for the order to
   * start `Confirmed` — book it through the SAME Confirm path the button uses.
   *
   * `entity.TransactionGroup = tg; await entity.Save()` QUEUES rather than commits, and the queued
   * order's ID is available immediately — so the lines can chain their OrderID inside the same
   * transaction. `tg.Submit()` commits everything or nothing: a header with no lines is not a state
   * this editor can produce.
   *
   * On the Confirm path this deliberately persists `Draft`/`Quoted` and then calls
   * `Orders.ConfirmOrder`. Writing `Status='Confirmed'` from here would produce a Confirmed order
   * with no journal entry — the exact silent corruption the remote operation exists to prevent —
   * because only the server can put the order row and its journal entries in one TransactionGroup.
   */
  public async Save(): Promise<void> {
    const d = this.Draft;
    if (!d || !this.CanSave) return;

    // Read the intent BEFORE the write: `Save` is what turns "start it Confirmed" into a booking.
    const bookAfterSave = !d.OrderID && d.StartStatus === 'Confirmed';
    if (!d.OrderID) d.Status = this.persistableStartStatus(d.StartStatus);

    this.IsSaving = true;
    this.clearMessages();
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const tg = await this.ProviderToUse.CreateTransactionGroup();

      const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, this.ProviderToUse.CurrentUser);
      if (d.OrderID) await order.Load(d.OrderID);
      else order.NewRecord();
      this.applyDraftToOrder(d, order);
      order.TransactionGroup = tg;
      await order.Save();

      await this.queueLines(d, order.ID, md, tg);

      if (!(await tg.Submit())) throw new Error('The order could not be saved — the transaction rolled back.');

      d.OrderID = order.ID;
      d.OrderNumber = order.OrderNumber;
      if (this.tabs.ActiveId) {
        this.tabs.UpdateState(this.tabs.ActiveId, d, false);
        this.renameActiveTab(order.OrderNumber ?? 'Order');
      }
      this.ActionMessage = `Saved order ${order.OrderNumber}.`;
      this.ActionIsError = false;
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
      return;
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }

    // The order now exists as a Draft/Quoted. Confirm is a SECOND, server-atomic step — if it is
    // blocked, the order survives as a draft and the banner says why, which is recoverable. The
    // alternative (a client-written "Confirmed" with no JE) would not be.
    if (bookAfterSave) await this.Confirm();
  }

  /**
   * What actually gets written for a requested start status.
   *
   * Only Draft/Quoted are ever persisted directly. `Confirmed` maps to `Draft` here because the
   * booking happens right after, through the remote operation; every other value is unreachable
   * (the drop-down disables it) and falls back to the safest status rather than being trusted.
   */
  private persistableStartStatus(requested: OrderStatusValue): OrderStatus {
    return requested === 'Quoted' ? 'Quoted' : 'Draft';
  }

  /** Copy the whole editable surface onto the entity. Server-materialized columns are never touched. */
  private applyDraftToOrder(d: OrderDraft, order: mjBizAppsOrdersOrderEntity): void {
    order.OrderType = d.OrderType;
    order.Status = d.Status;
    order.OrderDate = new Date(d.OrderDate);
    order.RequestedDeliveryDate = d.RequestedDeliveryDate ? new Date(d.RequestedDeliveryDate) : null;
    order.DueDate = d.DueDate ? new Date(d.DueDate) : null;
    order.CustomerOrganizationID = this.blankToNull(d.CustomerOrganizationID);
    order.CustomerPersonID = this.blankToNull(d.CustomerPersonID);
    order.SalesRepUserID = this.blankToNull(d.SalesRepUserID);
    order.BillToAddressID = this.blankToNull(d.BillToAddressID);
    order.ShipToAddressID = this.blankToNull(d.ShipToAddressID);
    order.PaymentTermsTypeID = this.blankToNull(d.PaymentTermsTypeID);
    order.ContractID = this.blankToNull(d.ContractID);
    order.ApprovalTaskID = this.blankToNull(d.ApprovalTaskID);
    order.ReversesOrderID = this.blankToNull(d.ReversesOrderID);
    order.ReversalReason = this.blankToNull(d.ReversalReason);
    order.ExternalDocumentNumber = this.blankToNull(d.ExternalDocumentNumber);
    order.Description = this.blankToNull(d.Description);
    order.Notes = this.blankToNull(d.Notes);
  }

  /** An empty text box means "no value", not an empty string — nullable columns want NULL. */
  private blankToNull(value: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  /** Queue each live line onto the same transaction, chaining the (already-available) order id. */
  private async queueLines(
    d: OrderDraft,
    orderId: string,
    md: Metadata,
    tg: Awaited<ReturnType<typeof this.ProviderToUse.CreateTransactionGroup>>,
  ): Promise<void> {
    const live = d.Lines.filter((l) => !isOrderLineEmpty(l));
    let lineNumber = 1;
    for (const l of live) {
      const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, this.ProviderToUse.CurrentUser);
      line.NewRecord();
      line.OrderID = orderId;
      line.ProductID = l.ProductID as string;
      line.LineNumber = lineNumber++;
      line.Quantity = parseNum(l.Quantity);
      line.UnitPrice = parseNum(l.UnitPrice);
      // percent (what the operator typed) → fraction (what the column stores + its CHECK allows).
      line.DiscountPct = discountFraction(l);
      line.ServicePeriodStart = l.ServicePeriodStart ? new Date(l.ServicePeriodStart) : null;
      line.ServicePeriodEnd = l.ServicePeriodEnd ? new Date(l.ServicePeriodEnd) : null;
      line.TransactionGroup = tg;
      await line.Save();
    }
  }

  private renameActiveTab(label: string): void {
    const tab = this.tabs.ActiveTab;
    if (tab) {
      tab.Label = label;
      tab.Icon = 'fa-solid fa-file-invoice-dollar';
    }
  }

  // ─── confirm ───────────────────────────────────────────────────────────────

  public get CanConfirm(): boolean {
    return this.IsSaved && !this.IsLocked && !this.IsConfirming && this.Issues.length === 0;
  }

  public get ConfirmBlockedReason(): string | null {
    if (this.IsLocked) return `This order is already ${this.Draft?.Status}.`;
    if (!this.IsSaved) return 'Save the order first — Confirm books its journal entries.';
    return this.Issues[0] ?? null;
  }

  public async Confirm(): Promise<void> {
    const d = this.Draft;
    if (!d?.OrderID || !this.CanConfirm) return;

    this.IsConfirming = true;
    this.clearMessages();
    this.cdr.markForCheck();
    try {
      const result = await this.client.Confirm(this.opProvider, d.OrderID);
      if (!result.Success) {
        // The §13.1 loud blocking banner — the most important failure in the app: it names what to
        // fix and, when it's a mapping gap, where to fix it.
        this.ConfirmErrors = result.Errors ?? ['Confirm was blocked.'];
        this.ShowAccountLinksFix = isAccountMappingFailure(result.Errors);
        this.cdr.markForCheck();
        return;
      }
      d.Status = (result.Status as OrderStatus) ?? 'Confirmed';
      if (this.tabs.ActiveId) {
        this.tabs.UpdateState(this.tabs.ActiveId, d, false);
        this.tabs.SetStatus(this.tabs.ActiveId, 'complete');
      }
      const jeCount = result.JournalEntryIDs?.length ?? 0;
      this.ActionMessage = `Confirmed ${d.OrderNumber} — booked ${jeCount} journal ${jeCount === 1 ? 'entry' : 'entries'}.`;
      this.ActionIsError = false;
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.IsConfirming = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Follow the §13.1 deep link: open Accounting's Accounts category so the operator can add the
   * missing GL link, then retry Confirm.
   *
   * A real navigation, not prose. Explorer is a tabbed SPA — this opens a TAB via NavigationService;
   * an <a href> would do nothing once the shell is running (see CrossAppLinkService).
   */
  public async FixInAccounting(): Promise<void> {
    const opened = await this.links.Open('Accounting', 'Accounts');
    if (!opened) {
      // Never leave the user staring at a dead control: if the app or nav item cannot be resolved
      // (renamed, not installed, no access), say where to go by hand.
      this.setError('Could not open Accounting from here — open it from the app launcher and go to Accounts → Account links.');
    }
  }

  private clearMessages(): void {
    this.ActionMessage = null;
    this.ActionIsError = false;
    this.ConfirmErrors = [];
    this.ShowAccountLinksFix = false;
  }

  private setError(message: string): void {
    this.ActionMessage = message;
    this.ActionIsError = true;
    this.cdr.markForCheck();
  }

  /** The provider, narrowed to the Remote-Operation seam (every ProviderBase implements it). */
  private get opProvider(): IRemoteOperationProvider {
    return this.ProviderToUse as unknown as IRemoteOperationProvider;
  }
}
