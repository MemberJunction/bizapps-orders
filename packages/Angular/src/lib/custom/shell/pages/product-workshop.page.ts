import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  inject,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import {
  PageRefreshService,
  WorkspaceTabStore,
  type WorkspaceTab,
  type GlResolutionResult,
  type GlResolutionStep,
} from '@mj-biz-apps/accounting-ng';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsAccountingGLAccountLinkEntity } from '@mj-biz-apps/accounting-entities';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const COMPANY_ENTITY = 'MJ: Companies';
const GL_LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';

/**
 * The value lists are DERIVED from the generated entity — never hand-copied. A migration that adds a
 * status therefore breaks the compile here rather than silently shipping a stale dropdown.
 */
export type ProductStatus = mjBizAppsOrdersProductEntity['Status'];
export type ProductRevenueRecognitionType = mjBizAppsOrdersProductEntity['RevenueRecognitionType'];
export type ProductDeferredRecognitionShape = NonNullable<mjBizAppsOrdersProductEntity['DeferredRecognitionShape']>;
export type ProductSubscriptionType = mjBizAppsOrdersProductEntity['SubscriptionType'];
export type ProductDefaultBillingCycle = NonNullable<mjBizAppsOrdersProductEntity['DefaultBillingCycle']>;
export type GLAccountLinkStatus = mjBizAppsAccountingGLAccountLinkEntity['Status'];

/**
 * The workshop's disclosure SECTIONS — the settings groups inside one product's card.
 *
 * These were tabs once. That was the wrong axis: tabs belong to open DOCUMENTS (a product each),
 * not to slices of one document. Sections are now collapsible disclosures in the card, and the tab
 * strip carries the open products.
 */
export type ProductSectionId = 'general' | 'revenue' | 'subscription' | 'gl' | 'advanced';

/** The in-progress product edit. Dates are ISO yyyy-mm-dd strings because that is what <input type="date"> speaks. */
export interface ProductDraft {
  Name: string;
  SKU: string;
  ProductTypeID: string | null;
  ProductCategoryID: string | null;
  OwningCompanyID: string | null;
  Status: ProductStatus;
  SuccessorProductID: string | null;
  AvailableFrom: string | null;
  AvailableTo: string | null;
  RevenueRecognitionType: ProductRevenueRecognitionType;
  DeferredRecognitionShape: ProductDeferredRecognitionShape | null;
  StandaloneSellingPrice: number | null;
  SubscriptionType: ProductSubscriptionType;
  BehaviorClass: string;
  DefaultBillingCycle: ProductDefaultBillingCycle | null;
  DefaultSubscriptionTermMonths: number | null;
  IsTaxable: boolean;
  IsActive: boolean;
  Description: string;
}

/** One GL link row, flattened for the template (which does no entity work). */
export interface GLLinkRow {
  ID: string;
  GLAccountRoleID: string;
  RoleName: string;
  GLAccountID: string;
  AccountCode: string;
  AccountName: string;
  /** The account's owning company — the advisory company check reads this. */
  AccountCompanyID: string | null;
  Status: GLAccountLinkStatus;
  StartedAt: Date | null;
  EndedAt: Date | null;
  Comments: string | null;
}

/** The link being added/edited in the GL section's inline editor. */
export interface GLLinkDraft {
  /** Null = a new link. */
  ID: string | null;
  GLAccountRoleID: string | null;
  GLAccountID: string | null;
  Status: GLAccountLinkStatus;
  StartedAt: string | null;
  EndedAt: string | null;
  Comments: string;
}

/**
 * Everything ONE open product tab owns.
 *
 * Section open/closed lives here (not on the component) so switching tabs never scrambles which
 * sections you had expanded on the product you were editing.
 */
export interface ProductDraftState {
  /** Null while the tab is an unsaved new-product draft; stamped by the first successful save. */
  ProductID: string | null;
  Draft: ProductDraft;
  Links: GLLinkRow[];
  LinkDraft: GLLinkDraft | null;
  LinkError: string | null;
  Resolution: GlResolutionResult | null;
  OpenSections: Record<ProductSectionId, boolean>;
  SaveError: string | null;
  SaveMessage: string | null;
}

/** A picker option — flattened so the template never touches an entity. */
export interface PickOption {
  ID: string;
  Label: string;
}

/** A GL account option, carrying enough to drive the advisory company hint. */
export interface AccountOption extends PickOption {
  CompanyID: string;
  /** True when this account belongs to the product's owning company — the preferred set. */
  MatchesOwningCompany: boolean;
}

/** A row in the "open existing product" picker popover. */
export interface ProductPickRow {
  ID: string;
  Name: string;
  SKU: string | null;
  /** Already open in a tab — picking it focuses that tab rather than looking like a no-op. */
  AlreadyOpen: boolean;
}

/** A section's header descriptor. */
export interface SectionHeader {
  Id: ProductSectionId;
  Label: string;
  Icon: string;
}

/** The shape RunView returns for the product's GL links. */
interface GLLinkRaw {
  ID: string;
  GLAccountID: string;
  GLAccountRoleID: string;
  Status: GLAccountLinkStatus;
  StartedAt: Date | null;
  EndedAt: Date | null;
  Comments: string | null;
}

/** The shape RunView returns for companies. */
interface CompanyRaw {
  ID: string;
  Name: string;
}

/**
 * Products → Product workshop.
 *
 * The one place a product is CREATED and EDITED. Two axes, deliberately separated:
 *  - **Tabs = open PRODUCTS** (the `order-editor.page.ts` workspace pattern, same `WorkspaceTabStore`).
 *    Each tab is a product you're working on, or an unsaved new-product draft.
 *  - **Disclosure sections = the settings groups** of the product in the active tab — General,
 *    Revenue, Subscription, GL accounts, Advanced — stacked in the card, each a header + rule you
 *    click to expand. More than one may be open at once; a collapsed section that CONTAINS a problem
 *    flags it on its header, so folding a section can never hide an error.
 *
 * The GL section is the headline: a product's GL link is a POLYMORPHIC `GLAccountLink` row
 * (EntityID = the Products entity, RecordID = the product's ID). Booking walks product → category
 * chain → company, so the section shows the whole resolution CHAIN, not just this product's own link
 * — a product with no direct link may still book perfectly well via its category.
 */
@Component({
  standalone: false,
  selector: 'mj-product-workshop-page',
  templateUrl: './product-workshop.page.html',
  styleUrls: ['./product-workshop.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductWorkshopPageComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  /** One tab per OPEN PRODUCT — the `order-editor.page.ts` shape, same store. */
  private tabs = new WorkspaceTabStore<ProductDraftState>();
  private keySeq = 0;
  /** False until the engines + pickers are loaded; an early @Input arrival parks until then. */
  private ready = false;
  private pendingOpen: { ProductID: string | null } | null = null;

  /**
   * Null = "open a fresh new-product draft". A non-null id OPENS OR FOCUSES that product's tab —
   * it never replaces the page's content. The shell REUSES this instance, hence OnChanges.
   */
  @Input() ProductID: string | null = null;

  @ViewChild('pickerSearch') private pickerSearch?: ElementRef<HTMLInputElement>;

  public IsLoading = false;
  public IsSaving = false;
  public LoadError: string | null = null;

  // ─── the open-existing picker (the split button's ▾ half) ──────────────────
  public PickerOpen = false;
  public PickerSearch = '';

  // ─── pickers ───────────────────────────────────────────────────────────────
  public ProductTypes: PickOption[] = [];
  public Categories: PickOption[] = [];
  public Companies: PickOption[] = [];
  public SuccessorProducts: PickOption[] = [];
  public Roles: PickOption[] = [];
  /** All active GL accounts; `MatchesOwningCompany` marks the active product's owning-company set. */
  public Accounts: AccountOption[] = [];

  public IsSavingLink = false;

  // The value lists, derived from the generated entity's unions (see the type aliases above).
  public readonly StatusOptions: ProductStatus[] = ['Draft', 'Active', 'Discontinued', 'EOL'];
  public readonly RevenueRecognitionOptions: ProductRevenueRecognitionType[] = ['Immediate', 'Deferred'];
  public readonly DeferredShapeOptions: ProductDeferredRecognitionShape[] = ['SingleDate', 'ServicePeriod'];
  public readonly SubscriptionTypeOptions: ProductSubscriptionType[] = ['None', 'Standard', 'Membership'];
  public readonly BillingCycleOptions: ProductDefaultBillingCycle[] = ['Monthly', 'Quarterly', 'Annual', 'Custom'];
  public readonly LinkStatusOptions: GLAccountLinkStatus[] = ['Active', 'Pending', 'Disabled'];

  public readonly SectionHeaders: SectionHeader[] = [
    { Id: 'general', Label: 'General', Icon: 'fa-solid fa-box' },
    { Id: 'revenue', Label: 'Revenue', Icon: 'fa-solid fa-hand-holding-dollar' },
    { Id: 'subscription', Label: 'Subscription', Icon: 'fa-solid fa-arrows-rotate' },
    { Id: 'gl', Label: 'GL accounts', Icon: 'fa-solid fa-diagram-project' },
    { Id: 'advanced', Label: 'Advanced', Icon: 'fa-solid fa-gears' },
  ];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.init();
  }

  /** The shell reuses this instance, so a changed id must OPEN OR FOCUS — never clobber the page. */
  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    const change = changes['ProductID'];
    if (!change || change.isFirstChange()) return; // init() applies the first value.
    await this.applyInput(this.ProductID);
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }

  public Refresh(): void {
    void this.reloadActive();
  }

  // ─── boot ──────────────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const aeb = AccountingEngineBase.Instance;
      await aeb.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      await this.loadPickers(engine, aeb);
      this.ready = true;
      const first = this.pendingOpen ? this.pendingOpen.ProductID : this.ProductID;
      this.pendingOpen = null;
      await this.applyInput(first);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The open-or-focus rule for the shell's `ProductID`. */
  private async applyInput(productID: string | null): Promise<void> {
    if (!this.ready) {
      this.pendingOpen = { ProductID: productID };
      return;
    }
    if (!productID) {
      this.OpenNewDraft();
      return;
    }
    if (this.focusProductTab(productID)) return; // already open — focus, never duplicate
    await this.openProduct(productID);
  }

  /** True when a tab for that product already existed (and is now active). */
  private focusProductTab(productID: string): boolean {
    const existing = this.tabs.Tabs.find((t) => !!t.State.ProductID && UUIDsEqual(t.State.ProductID, productID));
    if (!existing) return false;
    this.tabs.Activate(existing.Id);
    this.syncActiveViews();
    this.cdr.markForCheck();
    return true;
  }

  // ─── tabs = open products ──────────────────────────────────────────────────

  public get Tabs(): WorkspaceTab<ProductDraftState>[] {
    return this.tabs.Tabs;
  }
  public get ActiveTabId(): string | null {
    return this.tabs.ActiveId;
  }
  public get ActiveState(): ProductDraftState | null {
    return this.tabs.ActiveTab?.State ?? null;
  }
  public get HasTabs(): boolean {
    return this.tabs.Count > 0;
  }

  public OpenNewDraft(): void {
    this.tabs.Open({
      Id: `pw-${++this.keySeq}-${Date.now()}`,
      Label: 'New product',
      Icon: 'fa-solid fa-box',
      Status: 'draft',
      State: this.emptyState(),
    });
    this.syncActiveViews();
    this.cdr.markForCheck();
  }

  public SelectTab(id: string): void {
    this.tabs.Activate(id);
    this.syncActiveViews();
    this.cdr.markForCheck();
  }

  /** Closing a tab with unsaved edits confirms first — a click must never silently discard work. */
  public CloseTab(id: string): void {
    const tab = this.tabs.Tabs.find((t) => t.Id === id);
    if (tab?.Dirty && !window.confirm(`“${tab.Label}” has unsaved changes. Close it and discard them?`)) return;
    this.tabs.Close(id);
    this.syncActiveViews();
    this.cdr.markForCheck();
  }

  /** Load one product into a NEW tab (the caller has already ruled out a duplicate). */
  private async openProduct(productID: string): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      const p = engine.ProductByID(productID);
      if (!p) throw new Error(`Product ${productID} was not found.`);
      const state = this.emptyState();
      state.ProductID = p.ID;
      state.Draft = ProductWorkshopPageComponent.DraftFromProduct(p);
      this.tabs.Open({
        Id: `pw-${++this.keySeq}-${NormalizeUUID(p.ID)}`,
        Label: p.Name || 'New product',
        Icon: 'fa-solid fa-box',
        Status: 'complete',
        State: state,
      });
      await this.loadLinks(state);
      this.buildResolution(state);
      this.syncActiveViews();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Re-read the active tab's product + links from a freshened cache (the header Refresh). */
  private async reloadActive(): Promise<void> {
    const state = this.ActiveState;
    if (!state) return;
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const aeb = AccountingEngineBase.Instance;
      await aeb.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      await this.loadPickers(engine, aeb);
      if (state.ProductID) {
        const p = engine.ProductByID(state.ProductID);
        if (!p) throw new Error(`Product ${state.ProductID} was not found.`);
        state.Draft = ProductWorkshopPageComponent.DraftFromProduct(p);
        this.renameActiveTab();
        if (this.tabs.ActiveId) this.tabs.MarkClean(this.tabs.ActiveId);
        await this.loadLinks(state);
        this.buildResolution(state);
      }
      this.syncActiveViews();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Whatever depends on WHICH tab is active — the successor list and the account preference marks. */
  private syncActiveViews(): void {
    this.refreshSuccessorOptions();
    this.refreshAccountOptions(AccountingEngineBase.Instance);
  }

  /** The tab caption follows the product's Name — the label is how you find the tab again. */
  private renameActiveTab(): void {
    const tab = this.tabs.ActiveTab;
    if (!tab) return;
    tab.Label = tab.State.Draft.Name.trim() || 'New product';
  }

  // ─── disclosure sections ───────────────────────────────────────────────────

  public IsSectionOpen(id: ProductSectionId): boolean {
    return this.ActiveState?.OpenSections[id] === true;
  }

  public ToggleSection(id: ProductSectionId): void {
    const state = this.ActiveState;
    if (!state) return;
    // Disclosure, not accordion: any number may be open at once (his explicit call).
    state.OpenSections[id] = !state.OpenSections[id];
    this.cdr.markForCheck();
  }

  /**
   * How many problems a section is carrying. Rendered on the section's header, OPEN OR CLOSED — a
   * collapsed section that silently swallows an error would be worse than the tabs it replaced.
   */
  public SectionIssues(id: ProductSectionId): number {
    const state = this.ActiveState;
    if (!state) return 0;
    switch (id) {
      case 'general':
        return this.generalIssues(state);
      case 'revenue':
        return this.IsDeferred && !state.Draft.DeferredRecognitionShape ? 1 : 0;
      case 'subscription':
        return this.HasSubscription && !state.Draft.DefaultBillingCycle ? 1 : 0;
      case 'gl':
        return this.glIssues(state);
      case 'advanced':
        return 0;
      default:
        return 0;
    }
  }

  private generalIssues(state: ProductDraftState): number {
    let n = 0;
    if (state.Draft.Name.trim().length === 0) n++;
    if (!state.Draft.ProductTypeID) n++;
    return n;
  }

  /** A GL section problem = the link editor's own error, or any unresolved-company advisory. */
  private glIssues(state: ProductDraftState): number {
    let n = state.LinkError ? 1 : 0;
    n += state.Links.filter((l) => this.CompanyMismatch(l)).length;
    return n;
  }

  public SectionIssueTitle(id: ProductSectionId): string {
    const n = this.SectionIssues(id);
    return n === 1 ? '1 item needs attention in this section' : `${n} items need attention in this section`;
  }

  // ─── the open-existing picker (GitHub repo-switcher shape) ─────────────────

  public TogglePicker(): void {
    this.PickerOpen = !this.PickerOpen;
    if (this.PickerOpen) {
      this.PickerSearch = '';
      // Focus lands in the search box on open — the whole point of the affordance is to type.
      void Promise.resolve().then(() => this.pickerSearch?.nativeElement.focus());
    }
    this.cdr.markForCheck();
  }

  public ClosePicker(): void {
    if (!this.PickerOpen) return;
    this.PickerOpen = false;
    this.cdr.markForCheck();
  }

  /** Outside click closes it — the popover itself stops propagation (see the template). */
  @HostListener('document:click')
  public OnDocumentClick(): void {
    this.ClosePicker();
  }

  @HostListener('document:keydown.escape')
  public OnEscape(): void {
    this.ClosePicker();
  }

  public OnPickerSearchChanged(): void {
    this.cdr.markForCheck();
  }

  /**
   * Search matches Name, SKU, and ID. Name/SKU is what a human types; ID stays searchable because a
   * developer occasionally has one — but it is never what the list is FOR.
   */
  public get PickerRows(): ProductPickRow[] {
    const q = this.PickerSearch.trim().toLowerCase();
    return OrdersEngineBase.Instance.Products.filter((p) => {
      if (!q) return true;
      return (
        p.Name.toLowerCase().includes(q) ||
        (p.SKU ?? '').toLowerCase().includes(q) ||
        p.ID.toLowerCase().includes(q)
      );
    })
      .map((p) => ({
        ID: p.ID,
        Name: p.Name,
        SKU: p.SKU,
        AlreadyOpen: this.tabs.Tabs.some((t) => !!t.State.ProductID && UUIDsEqual(t.State.ProductID, p.ID)),
      }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public async PickProduct(row: ProductPickRow): Promise<void> {
    this.ClosePicker();
    if (this.focusProductTab(row.ID)) return;
    await this.openProduct(row.ID);
  }

  // ─── derived state the template reads ──────────────────────────────────────

  public get IsNew(): boolean {
    return !this.ActiveState?.ProductID;
  }

  /** ProductTypeID is REQUIRED by the schema — with no types on file no product can be created at all. */
  public get NoProductTypes(): boolean {
    return this.ProductTypes.length === 0;
  }

  public get IsDeferred(): boolean {
    return this.ActiveState?.Draft.RevenueRecognitionType === 'Deferred';
  }

  public get HasSubscription(): boolean {
    const t = this.ActiveState?.Draft.SubscriptionType;
    return !!t && t !== 'None';
  }

  public get CanSave(): boolean {
    const state = this.ActiveState;
    if (!state) return false;
    return !this.IsSaving && !this.NoProductTypes && state.Draft.Name.trim().length > 0 && !!state.Draft.ProductTypeID;
  }

  /** The role booking will use for this product — Deferred credits Deferred Revenue, else Sales. */
  public get RevenueRole(): string {
    return this.ActiveState?.Draft.RevenueRecognitionType === 'Deferred' ? 'Deferred Revenue' : 'Sales';
  }

  public MarkDirty(): void {
    const state = this.ActiveState;
    const id = this.tabs.ActiveId;
    if (!state || !id) return;
    state.SaveMessage = null;
    this.renameActiveTab();
    this.tabs.UpdateState(id, state, true);
    this.cdr.markForCheck();
  }

  /**
   * ADVISORY ONLY — deliberately non-blocking, pending the company/account rule.
   *
   * A GL account belongs to a company; a product may declare an owning company. Linking a product to
   * an account of some OTHER company is very likely a mistake — but the rule for what is actually
   * permitted does not exist yet (the user explicitly accepted this gap: "we don't have the greatest
   * limitations and rules for that right now, but that's okay"). So this warns and never blocks the
   * save. When the real rule lands, this is the hook it replaces.
   */
  public CompanyMismatch(row: GLLinkRow): boolean {
    const owning = this.ActiveState?.Draft.OwningCompanyID;
    if (!owning || !row.AccountCompanyID) return false;
    return !UUIDsEqual(owning, row.AccountCompanyID);
  }

  /** The same advisory check for the link currently being edited. */
  public get DraftLinkCompanyMismatch(): boolean {
    const state = this.ActiveState;
    const accountId = state?.LinkDraft?.GLAccountID;
    if (!accountId || !state?.Draft.OwningCompanyID) return false;
    const account = this.Accounts.find((a) => UUIDsEqual(a.ID, accountId));
    if (!account) return false;
    return !UUIDsEqual(state.Draft.OwningCompanyID, account.CompanyID);
  }

  public get OwningCompanyName(): string {
    const id = this.ActiveState?.Draft.OwningCompanyID;
    if (!id) return '—';
    return this.Companies.find((c) => UUIDsEqual(c.ID, id))?.Label ?? '—';
  }

  // ─── pickers ───────────────────────────────────────────────────────────────

  private async loadPickers(engine: OrdersEngineBase, aeb: AccountingEngineBase): Promise<void> {
    this.ProductTypes = engine.ProductTypes.map((t) => ({ ID: t.ID, Label: t.Name })).sort((a, b) =>
      a.Label.localeCompare(b.Label),
    );
    this.Categories = engine.ProductCategories.map((c) => ({
      ID: c.ID,
      Label: c.Code ? `${c.Name} (${c.Code})` : c.Name,
    })).sort((a, b) => a.Label.localeCompare(b.Label));
    // Roles carry Status + Sequence (not IsActive); Sequence is the roster's own intended order.
    this.Roles = aeb.GLAccountRoles.filter((r) => r.Status === 'Active')
      .sort((a, b) => a.Sequence - b.Sequence || a.Name.localeCompare(b.Name))
      .map((r) => ({ ID: r.ID, Label: r.Name }));

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const companies = await rv.RunView<CompanyRaw>(
      { EntityName: COMPANY_ENTITY, Fields: ['ID', 'Name'], OrderBy: 'Name ASC', ResultType: 'simple' },
      this.ProviderToUse.CurrentUser,
    );
    if (!companies.Success) throw new Error(companies.ErrorMessage ?? 'Could not load companies.');
    this.Companies = (companies.Results ?? []).map((c) => ({ ID: c.ID, Label: c.Name }));

    this.refreshSuccessorOptions();
    this.refreshAccountOptions(aeb);
  }

  /** A product can never succeed itself — so the list depends on WHICH tab is active. */
  private refreshSuccessorOptions(): void {
    const current = this.ActiveState?.ProductID ?? null;
    this.SuccessorProducts = OrdersEngineBase.Instance.Products.filter((p) => !current || !UUIDsEqual(p.ID, current))
      .map((p) => ({ ID: p.ID, Label: p.SKU ? `${p.Name} (${p.SKU})` : p.Name }))
      .sort((a, b) => a.Label.localeCompare(b.Label));
  }

  /** Rebuilt whenever the owning company changes so the "preferred" marking follows the product. */
  private refreshAccountOptions(aeb: AccountingEngineBase): void {
    const owning = this.ActiveState?.Draft.OwningCompanyID ?? null;
    this.Accounts = aeb.GLAccounts.filter((a) => a.IsActive)
      .map((a) => ({
        ID: a.ID,
        Label: `${a.Code} ${a.Name}`,
        CompanyID: a.CompanyID,
        MatchesOwningCompany: !!owning && UUIDsEqual(owning, a.CompanyID),
      }))
      // Accounts of the product's owning company sort first — preferred, not enforced (see CompanyMismatch).
      .sort((a, b) =>
        a.MatchesOwningCompany === b.MatchesOwningCompany
          ? a.Label.localeCompare(b.Label)
          : a.MatchesOwningCompany
            ? -1
            : 1,
      );
  }

  public OnOwningCompanyChanged(): void {
    this.refreshAccountOptions(AccountingEngineBase.Instance);
    this.MarkDirty();
  }

  // ─── load a tab's links + resolution ───────────────────────────────────────

  private async loadLinks(state: ProductDraftState): Promise<void> {
    state.Links = [];
    if (!state.ProductID) return; // A new product has no record id to link against yet.
    const entityId = this.productEntityId();
    if (!entityId) throw new Error(`The '${PRODUCT_ENTITY}' entity is not registered in this instance.`);

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<GLLinkRaw>(
      {
        EntityName: GL_LINK_ENTITY,
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${state.ProductID}'`,
        Fields: ['ID', 'GLAccountID', 'GLAccountRoleID', 'Status', 'StartedAt', 'EndedAt', 'Comments'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!result.Success) throw new Error(result.ErrorMessage ?? 'Could not load this product’s GL account links.');

    const aeb = AccountingEngineBase.Instance;
    state.Links = (result.Results ?? []).map((l) => {
      const account = aeb.GLAccountByID(l.GLAccountID);
      const role = aeb.GLAccountRoles.find((r) => UUIDsEqual(r.ID, l.GLAccountRoleID));
      return {
        ID: l.ID,
        GLAccountRoleID: l.GLAccountRoleID,
        RoleName: role?.Name ?? '(unknown role)',
        GLAccountID: l.GLAccountID,
        AccountCode: account?.Code ?? '?',
        AccountName: account?.Name ?? '(unknown account)',
        AccountCompanyID: account?.CompanyID ?? null,
        Status: l.Status,
        StartedAt: l.StartedAt ? new Date(l.StartedAt) : null,
        EndedAt: l.EndedAt ? new Date(l.EndedAt) : null,
        Comments: l.Comments,
      };
    });
  }

  /**
   * The resolution CHAIN for the product's revenue role — product → category chain → company.
   *
   * The same walk booking does (and the same one gl-mapping.page.ts reports), rendered by the shared
   * `<mj-gl-resolution-preview>`. This is why the GL section is not just a link list: a product with
   * no direct link is not necessarily unbookable.
   */
  private buildResolution(state: ProductDraftState): void {
    state.Resolution = null;
    if (!state.ProductID) return;
    const engine = OrdersEngineBase.Instance;
    const aeb = AccountingEngineBase.Instance;
    const role = state.Draft.RevenueRecognitionType === 'Deferred' ? 'Deferred Revenue' : 'Sales';
    const asOf = new Date();
    const steps: GlResolutionStep[] = [];
    let won = false;

    const push = (scope: string, glAccountId: string | null): void => {
      const account = glAccountId ? aeb.GLAccountByID(glAccountId) : null;
      const isWinner = !won && !!account;
      if (isWinner) won = true;
      steps.push({
        Scope: scope,
        AccountCode: account?.Code ?? null,
        AccountName: account?.Name ?? null,
        Won: isWinner,
      });
    };

    const productEntity = this.productEntityId();
    const productHit = productEntity ? aeb.ResolveLinkedAccount(productEntity, state.ProductID, role, asOf) : null;
    push(`Product: ${state.Draft.Name || '(unnamed)'}`, productHit?.Link.GLAccountID ?? null);

    const catEntity = this.entityIdFor(PRODUCT_CATEGORY_ENTITY);
    let categoryID = state.Draft.ProductCategoryID;
    const seen = new Set<string>();
    while (categoryID && !seen.has(NormalizeUUID(categoryID))) {
      seen.add(NormalizeUUID(categoryID));
      const hit = catEntity ? aeb.ResolveLinkedAccount(catEntity, categoryID, role, asOf) : null;
      push(`Category: ${engine.ProductCategoryByID(categoryID)?.Name ?? '?'}`, hit?.Link.GLAccountID ?? null);
      categoryID = engine.ProductCategoryByID(categoryID)?.ParentID ?? null;
    }

    const coEntity = this.entityIdFor(COMPANY_ENTITY);
    if (state.Draft.OwningCompanyID && coEntity) {
      const hit = aeb.ResolveLinkedAccount(coEntity, state.Draft.OwningCompanyID, role, asOf);
      push(`Company default: ${this.OwningCompanyName}`, hit?.Link.GLAccountID ?? null);
    }

    const winner = steps.find((s) => s.Won);
    state.Resolution = {
      Role: role,
      Steps: steps,
      ResolvedCode: winner?.AccountCode ?? null,
      ResolvedName: winner?.AccountName ?? null,
    };
  }

  private productEntityId(): string | null {
    return this.entityIdFor(PRODUCT_ENTITY);
  }

  private entityIdFor(entityName: string): string | null {
    return this.ProviderToUse.Entities.find((e) => e.Name === entityName)?.ID ?? null;
  }

  // ─── save the product ──────────────────────────────────────────────────────

  public async Save(): Promise<void> {
    const state = this.ActiveState;
    const tabId = this.tabs.ActiveId;
    if (!state || !tabId || !this.CanSave) return;
    this.IsSaving = true;
    state.SaveError = null;
    state.SaveMessage = null;
    this.cdr.markForCheck();
    try {
      const p = await this.ProviderToUse.GetEntityObject<mjBizAppsOrdersProductEntity>(
        PRODUCT_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (state.ProductID) {
        const loaded = await p.Load(state.ProductID);
        if (!loaded) throw new Error(`Product ${state.ProductID} could not be loaded for editing.`);
      } else {
        p.NewRecord();
      }
      this.applyDraftTo(p, state.Draft);

      // Save() returns a boolean and does NOT throw on a logical failure — check it, and surface the
      // server's real validation message rather than a generic "save failed".
      if (!(await p.Save())) {
        throw new Error(p.LatestResult?.CompleteMessage || 'The product could not be saved.');
      }

      const wasNew = !state.ProductID;
      state.ProductID = p.ID;
      state.SaveMessage = wasNew ? 'Product created.' : 'Product saved.';
      this.tabs.MarkClean(tabId);
      this.tabs.SetStatus(tabId, 'complete');
      this.renameActiveTab();
      // The engine caches products; a stale cache would show the old row on the next page.
      await OrdersEngineBase.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      await this.loadLinks(state);
      this.buildResolution(state);
      this.syncActiveViews();
    } catch (e) {
      state.SaveError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  private applyDraftTo(p: mjBizAppsOrdersProductEntity, d: ProductDraft): void {
    p.Name = d.Name.trim();
    p.SKU = d.SKU.trim() || null;
    // Guarded by CanSave — the non-null assertion is the schema's REQUIRED FK, not an assumption.
    p.ProductTypeID = d.ProductTypeID!;
    p.ProductCategoryID = d.ProductCategoryID;
    p.OwningCompanyID = d.OwningCompanyID;
    p.Status = d.Status;
    p.SuccessorProductID = d.SuccessorProductID;
    p.AvailableFrom = ProductWorkshopPageComponent.FromInputDate(d.AvailableFrom);
    p.AvailableTo = ProductWorkshopPageComponent.FromInputDate(d.AvailableTo);
    p.RevenueRecognitionType = d.RevenueRecognitionType;
    // The shape only means anything for a Deferred product — an Immediate one must not carry a stale one.
    p.DeferredRecognitionShape = d.RevenueRecognitionType === 'Deferred' ? d.DeferredRecognitionShape : null;
    p.StandaloneSellingPrice = d.StandaloneSellingPrice;
    p.SubscriptionType = d.SubscriptionType;
    p.BehaviorClass = d.BehaviorClass.trim() || null;
    p.DefaultBillingCycle = d.SubscriptionType === 'None' ? null : d.DefaultBillingCycle;
    p.DefaultSubscriptionTermMonths = d.SubscriptionType === 'None' ? null : d.DefaultSubscriptionTermMonths;
    p.IsTaxable = d.IsTaxable;
    p.IsActive = d.IsActive;
    p.Description = d.Description.trim() || null;
  }

  // ─── GL links: add / edit / remove ─────────────────────────────────────────

  public AddLink(): void {
    const state = this.ActiveState;
    if (!state) return;
    state.LinkError = null;
    state.LinkDraft = {
      ID: null,
      GLAccountRoleID: this.Roles.find((r) => r.Label === this.RevenueRole)?.ID ?? null,
      GLAccountID: null,
      Status: 'Active',
      StartedAt: null,
      EndedAt: null,
      Comments: '',
    };
    this.cdr.markForCheck();
  }

  public EditLink(row: GLLinkRow): void {
    const state = this.ActiveState;
    if (!state) return;
    state.LinkError = null;
    state.LinkDraft = {
      ID: row.ID,
      GLAccountRoleID: row.GLAccountRoleID,
      GLAccountID: row.GLAccountID,
      Status: row.Status,
      StartedAt: ProductWorkshopPageComponent.ToInputDate(row.StartedAt),
      EndedAt: ProductWorkshopPageComponent.ToInputDate(row.EndedAt),
      Comments: row.Comments ?? '',
    };
    this.cdr.markForCheck();
  }

  public CancelLink(): void {
    const state = this.ActiveState;
    if (!state) return;
    state.LinkDraft = null;
    state.LinkError = null;
    this.cdr.markForCheck();
  }

  public get CanSaveLink(): boolean {
    const d = this.ActiveState?.LinkDraft;
    return !this.IsSavingLink && !!d?.GLAccountRoleID && !!d?.GLAccountID;
  }

  public async SaveLink(): Promise<void> {
    const state = this.ActiveState;
    const d = state?.LinkDraft;
    if (!state || !d || !this.CanSaveLink || !state.ProductID) return;
    const entityId = this.productEntityId();
    if (!entityId) {
      state.LinkError = `The '${PRODUCT_ENTITY}' entity is not registered in this instance.`;
      this.cdr.markForCheck();
      return;
    }
    this.IsSavingLink = true;
    state.LinkError = null;
    this.cdr.markForCheck();
    try {
      const link = await this.ProviderToUse.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(
        GL_LINK_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (d.ID) {
        const loaded = await link.Load(d.ID);
        if (!loaded) throw new Error(`GL account link ${d.ID} could not be loaded.`);
      } else {
        link.NewRecord();
      }
      // The polymorphic target: this product, on the Products entity.
      link.EntityID = entityId;
      link.RecordID = state.ProductID;
      link.GLAccountRoleID = d.GLAccountRoleID!;
      link.GLAccountID = d.GLAccountID!;
      link.Status = d.Status;
      link.StartedAt = ProductWorkshopPageComponent.FromInputDate(d.StartedAt);
      link.EndedAt = ProductWorkshopPageComponent.FromInputDate(d.EndedAt);
      link.Comments = d.Comments.trim() || null;

      if (!(await link.Save())) {
        throw new Error(link.LatestResult?.CompleteMessage || 'The GL account link could not be saved.');
      }

      state.LinkDraft = null;
      await this.afterLinkChange(state);
    } catch (e) {
      state.LinkError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSavingLink = false;
      this.cdr.markForCheck();
    }
  }

  public async RemoveLink(row: GLLinkRow): Promise<void> {
    const state = this.ActiveState;
    if (!state) return;
    this.IsSavingLink = true;
    state.LinkError = null;
    this.cdr.markForCheck();
    try {
      const link = await this.ProviderToUse.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(
        GL_LINK_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      const loaded = await link.Load(row.ID);
      if (!loaded) throw new Error(`GL account link ${row.ID} could not be loaded.`);
      if (!(await link.Delete())) {
        throw new Error(link.LatestResult?.CompleteMessage || 'The GL account link could not be removed.');
      }
      await this.afterLinkChange(state);
    } catch (e) {
      state.LinkError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSavingLink = false;
      this.cdr.markForCheck();
    }
  }

  /** A link change moves resolution, so the accounting cache must be refreshed before we re-walk it. */
  private async afterLinkChange(state: ProductDraftState): Promise<void> {
    const aeb = AccountingEngineBase.Instance;
    await aeb.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    await this.loadLinks(state);
    this.buildResolution(state);
    this.refreshAccountOptions(aeb);
    this.cdr.markForCheck();
  }

  // ─── date helpers ──────────────────────────────────────────────────────────

  /** DATE columns carry no timezone — read them in UTC so the input never shows yesterday. */
  private static ToInputDate(d: Date | null): string | null {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  /** …and write them back at UTC midnight, for the same reason. */
  private static FromInputDate(s: string | null): Date | null {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private static DraftFromProduct(p: mjBizAppsOrdersProductEntity): ProductDraft {
    return {
      Name: p.Name,
      SKU: p.SKU ?? '',
      ProductTypeID: p.ProductTypeID,
      ProductCategoryID: p.ProductCategoryID,
      OwningCompanyID: p.OwningCompanyID,
      Status: p.Status,
      SuccessorProductID: p.SuccessorProductID,
      AvailableFrom: ProductWorkshopPageComponent.ToInputDate(p.AvailableFrom),
      AvailableTo: ProductWorkshopPageComponent.ToInputDate(p.AvailableTo),
      RevenueRecognitionType: p.RevenueRecognitionType,
      DeferredRecognitionShape: p.DeferredRecognitionShape,
      StandaloneSellingPrice: p.StandaloneSellingPrice,
      SubscriptionType: p.SubscriptionType,
      BehaviorClass: p.BehaviorClass ?? '',
      DefaultBillingCycle: p.DefaultBillingCycle,
      DefaultSubscriptionTermMonths: p.DefaultSubscriptionTermMonths,
      IsTaxable: p.IsTaxable,
      IsActive: p.IsActive,
      Description: p.Description ?? '',
    };
  }

  /** A fresh tab payload: General open, the rest collapsed. */
  private emptyState(): ProductDraftState {
    const draft = ProductWorkshopPageComponent.EmptyDraft();
    // A single product type is the only possible answer — pre-select it rather than making the
    // user open a one-item dropdown.
    if (this.ProductTypes.length === 1) draft.ProductTypeID = this.ProductTypes[0].ID;
    return {
      ProductID: null,
      Draft: draft,
      Links: [],
      LinkDraft: null,
      LinkError: null,
      Resolution: null,
      OpenSections: { general: true, revenue: false, subscription: false, gl: false, advanced: false },
      SaveError: null,
      SaveMessage: null,
    };
  }

  private static EmptyDraft(): ProductDraft {
    // The defaults mirror the schema's own (Status=Draft, RevenueRecognitionType=Immediate,
    // SubscriptionType=None, IsTaxable=1, IsActive=1) so a new row matches what the DB would do.
    return {
      Name: '',
      SKU: '',
      ProductTypeID: null,
      ProductCategoryID: null,
      OwningCompanyID: null,
      Status: 'Draft',
      SuccessorProductID: null,
      AvailableFrom: null,
      AvailableTo: null,
      RevenueRecognitionType: 'Immediate',
      DeferredRecognitionShape: null,
      StandaloneSellingPrice: null,
      SubscriptionType: 'None',
      BehaviorClass: '',
      DefaultBillingCycle: null,
      DefaultSubscriptionTermMonths: null,
      IsTaxable: true,
      IsActive: true,
      Description: '',
    };
  }
}
