import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, Input, OnInit, OnChanges, OnDestroy } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { PageRefreshService, type WorkspaceTab, type GlResolutionResult, type GlResolutionStep } from '@mj-biz-apps/accounting-ng';
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

/** The workshop's inner tabs. */
export type ProductWorkshopTab = 'general' | 'revenue' | 'subscription' | 'gl' | 'advanced';

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

/** The link being added/edited in the GL tab's inline editor. */
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
 * The one place a product is CREATED and EDITED, with every option the entity carries exposed
 * across five tabs — General, Revenue, Subscription, GL accounts, Advanced. The catalog is the
 * read view; this is the write view it hands off to.
 *
 * The GL tab is the headline: a product's GL link is a POLYMORPHIC `GLAccountLink` row
 * (EntityID = the Products entity, RecordID = the product's ID). Booking walks product → category
 * chain → company, so the tab shows the whole resolution CHAIN, not just this product's own link —
 * a product with no direct link may still book perfectly well via its category.
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

  /** Null = "New product" mode. A non-null id edits that product. The shell REUSES this instance. */
  @Input() ProductID: string | null = null;

  public ActiveTabId: ProductWorkshopTab = 'general';
  public Draft: ProductDraft = ProductWorkshopPageComponent.EmptyDraft();
  public IsLoading = false;
  public IsSaving = false;
  public LoadError: string | null = null;
  public SaveError: string | null = null;
  public SaveMessage: string | null = null;
  public Dirty = false;

  // ─── pickers ───────────────────────────────────────────────────────────────
  public ProductTypes: PickOption[] = [];
  public Categories: PickOption[] = [];
  public Companies: PickOption[] = [];
  public SuccessorProducts: PickOption[] = [];
  public Roles: PickOption[] = [];
  /** All active GL accounts; `MatchesOwningCompany` marks the product's owning-company set. */
  public Accounts: AccountOption[] = [];

  // ─── GL tab ────────────────────────────────────────────────────────────────
  public Links: GLLinkRow[] = [];
  public LinkDraft: GLLinkDraft | null = null;
  public LinkError: string | null = null;
  public IsSavingLink = false;
  /** The resolution chain for the product's revenue role — null until the product is saved. */
  public Resolution: GlResolutionResult | null = null;

  // The value lists, derived from the generated entity's unions (see the type aliases above).
  public readonly StatusOptions: ProductStatus[] = ['Draft', 'Active', 'Discontinued', 'EOL'];
  public readonly RevenueRecognitionOptions: ProductRevenueRecognitionType[] = ['Immediate', 'Deferred'];
  public readonly DeferredShapeOptions: ProductDeferredRecognitionShape[] = ['SingleDate', 'ServicePeriod'];
  public readonly SubscriptionTypeOptions: ProductSubscriptionType[] = ['None', 'Standard', 'Membership'];
  public readonly BillingCycleOptions: ProductDefaultBillingCycle[] = ['Monthly', 'Quarterly', 'Annual', 'Custom'];
  public readonly LinkStatusOptions: GLAccountLinkStatus[] = ['Active', 'Pending', 'Disabled'];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

  /** The shell reuses this instance across products, so a changed id must reload the whole workshop. */
  async ngOnChanges(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }

  public Refresh(): void {
    void this.load();
  }

  // ─── tabs ──────────────────────────────────────────────────────────────────

  /**
   * These are SECTION tabs, not workspace documents — the strip is reused for its look, with the
   * new-tab affordance off and no close handler bound. 'draft' is the strip's neutral state (its
   * other states, 'rejected'/'complete', are document outcomes that mean nothing for a section).
   */
  public get Tabs(): WorkspaceTab[] {
    return [
      { Id: 'general', Label: 'General', Icon: 'fa-solid fa-box', Status: 'draft', State: null },
      { Id: 'revenue', Label: 'Revenue', Icon: 'fa-solid fa-hand-holding-dollar', Status: 'draft', State: null },
      { Id: 'subscription', Label: 'Subscription', Icon: 'fa-solid fa-arrows-rotate', Status: 'draft', State: null },
      { Id: 'gl', Label: 'GL accounts', Icon: 'fa-solid fa-diagram-project', Status: 'draft', State: null },
      { Id: 'advanced', Label: 'Advanced', Icon: 'fa-solid fa-gears', Status: 'draft', State: null },
    ];
  }

  public SelectTab(id: string): void {
    this.ActiveTabId = id as ProductWorkshopTab;
    this.cdr.markForCheck();
  }

  // ─── derived state the template reads ──────────────────────────────────────

  public get IsNew(): boolean {
    return !this.ProductID;
  }

  /** ProductTypeID is REQUIRED by the schema — with no types on file no product can be created at all. */
  public get NoProductTypes(): boolean {
    return this.ProductTypes.length === 0;
  }

  public get IsDeferred(): boolean {
    return this.Draft.RevenueRecognitionType === 'Deferred';
  }

  public get HasSubscription(): boolean {
    return this.Draft.SubscriptionType !== 'None';
  }

  public get CanSave(): boolean {
    return !this.IsSaving && !this.NoProductTypes && this.Draft.Name.trim().length > 0 && !!this.Draft.ProductTypeID;
  }

  /** The role booking will use for this product — Deferred credits Deferred Revenue, else Sales. */
  public get RevenueRole(): string {
    return this.Draft.RevenueRecognitionType === 'Deferred' ? 'Deferred Revenue' : 'Sales';
  }

  public MarkDirty(): void {
    this.Dirty = true;
    this.SaveMessage = null;
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
    if (!this.Draft.OwningCompanyID || !row.AccountCompanyID) return false;
    return !UUIDsEqual(this.Draft.OwningCompanyID, row.AccountCompanyID);
  }

  /** The same advisory check for the link currently being edited. */
  public get DraftLinkCompanyMismatch(): boolean {
    const accountId = this.LinkDraft?.GLAccountID;
    if (!accountId || !this.Draft.OwningCompanyID) return false;
    const account = this.Accounts.find((a) => UUIDsEqual(a.ID, accountId));
    if (!account) return false;
    return !UUIDsEqual(this.Draft.OwningCompanyID, account.CompanyID);
  }

  public get OwningCompanyName(): string {
    const id = this.Draft.OwningCompanyID;
    if (!id) return '—';
    return this.Companies.find((c) => UUIDsEqual(c.ID, id))?.Label ?? '—';
  }

  // ─── load ──────────────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.SaveError = null;
    this.SaveMessage = null;
    this.LinkDraft = null;
    this.LinkError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const aeb = AccountingEngineBase.Instance;
      await aeb.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);

      await this.loadPickers(engine, aeb);
      await this.loadProduct(engine);
      await this.loadLinks();
      this.buildResolution(engine, aeb);
      this.Dirty = false;
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadPickers(engine: OrdersEngineBase, aeb: AccountingEngineBase): Promise<void> {
    this.ProductTypes = engine.ProductTypes.map((t) => ({ ID: t.ID, Label: t.Name })).sort((a, b) =>
      a.Label.localeCompare(b.Label),
    );
    this.Categories = engine.ProductCategories.map((c) => ({
      ID: c.ID,
      Label: c.Code ? `${c.Name} (${c.Code})` : c.Name,
    })).sort((a, b) => a.Label.localeCompare(b.Label));
    // A product can never succeed itself.
    this.SuccessorProducts = engine.Products.filter((p) => !this.ProductID || !UUIDsEqual(p.ID, this.ProductID))
      .map((p) => ({ ID: p.ID, Label: p.SKU ? `${p.Name} (${p.SKU})` : p.Name }))
      .sort((a, b) => a.Label.localeCompare(b.Label));
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

    this.refreshAccountOptions(aeb);
  }

  /** Rebuilt whenever the owning company changes so the "preferred" marking follows the product. */
  private refreshAccountOptions(aeb: AccountingEngineBase): void {
    const owning = this.Draft.OwningCompanyID;
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

  private async loadProduct(engine: OrdersEngineBase): Promise<void> {
    if (!this.ProductID) {
      this.Draft = ProductWorkshopPageComponent.EmptyDraft();
      // A single product type is the only possible answer — pre-select it rather than making the
      // user open a one-item dropdown.
      if (this.ProductTypes.length === 1) this.Draft.ProductTypeID = this.ProductTypes[0].ID;
      return;
    }
    const p = engine.ProductByID(this.ProductID);
    if (!p) throw new Error(`Product ${this.ProductID} was not found.`);
    this.Draft = {
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

  private async loadLinks(): Promise<void> {
    this.Links = [];
    if (!this.ProductID) return; // A new product has no record id to link against yet.
    const entityId = this.productEntityId();
    if (!entityId) throw new Error(`The '${PRODUCT_ENTITY}' entity is not registered in this instance.`);

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<GLLinkRaw>(
      {
        EntityName: GL_LINK_ENTITY,
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${this.ProductID}'`,
        Fields: ['ID', 'GLAccountID', 'GLAccountRoleID', 'Status', 'StartedAt', 'EndedAt', 'Comments'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!result.Success) throw new Error(result.ErrorMessage ?? 'Could not load this product’s GL account links.');

    const aeb = AccountingEngineBase.Instance;
    this.Links = (result.Results ?? []).map((l) => {
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
   * `<mj-gl-resolution-preview>`. This is why the GL tab is not just a link list: a product with no
   * direct link is not necessarily unbookable.
   */
  private buildResolution(engine: OrdersEngineBase, aeb: AccountingEngineBase): void {
    this.Resolution = null;
    if (!this.ProductID) return;
    const role = this.RevenueRole;
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
    const productHit = productEntity ? aeb.ResolveLinkedAccount(productEntity, this.ProductID, role, asOf) : null;
    push(`Product: ${this.Draft.Name || '(unnamed)'}`, productHit?.Link.GLAccountID ?? null);

    const catEntity = this.entityIdFor(PRODUCT_CATEGORY_ENTITY);
    let categoryID = this.Draft.ProductCategoryID;
    const seen = new Set<string>();
    while (categoryID && !seen.has(categoryID.toLowerCase())) {
      seen.add(categoryID.toLowerCase());
      const hit = catEntity ? aeb.ResolveLinkedAccount(catEntity, categoryID, role, asOf) : null;
      push(`Category: ${engine.ProductCategoryByID(categoryID)?.Name ?? '?'}`, hit?.Link.GLAccountID ?? null);
      categoryID = engine.ProductCategoryByID(categoryID)?.ParentID ?? null;
    }

    const coEntity = this.entityIdFor(COMPANY_ENTITY);
    if (this.Draft.OwningCompanyID && coEntity) {
      const hit = aeb.ResolveLinkedAccount(coEntity, this.Draft.OwningCompanyID, role, asOf);
      push(`Company default: ${this.OwningCompanyName}`, hit?.Link.GLAccountID ?? null);
    }

    const winner = steps.find((s) => s.Won);
    this.Resolution = {
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
    if (!this.CanSave) return;
    this.IsSaving = true;
    this.SaveError = null;
    this.SaveMessage = null;
    this.cdr.markForCheck();
    try {
      const p = await this.ProviderToUse.GetEntityObject<mjBizAppsOrdersProductEntity>(
        PRODUCT_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (this.ProductID) {
        const loaded = await p.Load(this.ProductID);
        if (!loaded) throw new Error(`Product ${this.ProductID} could not be loaded for editing.`);
      } else {
        p.NewRecord();
      }
      const d = this.Draft;
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

      if (!(await p.Save())) {
        // Surface the server's real validation message — never a generic "save failed".
        throw new Error(p.LatestResult?.Message || 'The product could not be saved.');
      }

      const wasNew = !this.ProductID;
      this.ProductID = p.ID;
      this.Dirty = false;
      this.SaveMessage = wasNew ? 'Product created.' : 'Product saved.';
      // The engine caches products; a stale cache would show the old row on the next page.
      await OrdersEngineBase.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      await this.loadLinks();
      this.buildResolution(OrdersEngineBase.Instance, AccountingEngineBase.Instance);
    } catch (e) {
      this.SaveError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  // ─── GL links: add / edit / remove ─────────────────────────────────────────

  public AddLink(): void {
    this.LinkError = null;
    this.LinkDraft = {
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
    this.LinkError = null;
    this.LinkDraft = {
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
    this.LinkDraft = null;
    this.LinkError = null;
    this.cdr.markForCheck();
  }

  public get CanSaveLink(): boolean {
    return !this.IsSavingLink && !!this.LinkDraft?.GLAccountRoleID && !!this.LinkDraft?.GLAccountID;
  }

  public async SaveLink(): Promise<void> {
    const d = this.LinkDraft;
    if (!d || !this.CanSaveLink || !this.ProductID) return;
    const entityId = this.productEntityId();
    if (!entityId) {
      this.LinkError = `The '${PRODUCT_ENTITY}' entity is not registered in this instance.`;
      this.cdr.markForCheck();
      return;
    }
    this.IsSavingLink = true;
    this.LinkError = null;
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
      link.RecordID = this.ProductID;
      link.GLAccountRoleID = d.GLAccountRoleID!;
      link.GLAccountID = d.GLAccountID!;
      link.Status = d.Status;
      link.StartedAt = ProductWorkshopPageComponent.FromInputDate(d.StartedAt);
      link.EndedAt = ProductWorkshopPageComponent.FromInputDate(d.EndedAt);
      link.Comments = d.Comments.trim() || null;

      if (!(await link.Save())) throw new Error(link.LatestResult?.Message || 'The GL account link could not be saved.');

      this.LinkDraft = null;
      await this.afterLinkChange();
    } catch (e) {
      this.LinkError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSavingLink = false;
      this.cdr.markForCheck();
    }
  }

  public async RemoveLink(row: GLLinkRow): Promise<void> {
    this.IsSavingLink = true;
    this.LinkError = null;
    this.cdr.markForCheck();
    try {
      const link = await this.ProviderToUse.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(
        GL_LINK_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      const loaded = await link.Load(row.ID);
      if (!loaded) throw new Error(`GL account link ${row.ID} could not be loaded.`);
      if (!(await link.Delete())) throw new Error(link.LatestResult?.Message || 'The GL account link could not be removed.');
      await this.afterLinkChange();
    } catch (e) {
      this.LinkError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSavingLink = false;
      this.cdr.markForCheck();
    }
  }

  /** A link change moves resolution, so the accounting cache must be refreshed before we re-walk it. */
  private async afterLinkChange(): Promise<void> {
    const aeb = AccountingEngineBase.Instance;
    await aeb.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    await this.loadLinks();
    this.buildResolution(OrdersEngineBase.Instance, aeb);
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
