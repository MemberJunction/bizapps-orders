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
import type {
  mjBizAppsOrdersProductCategoryEntity,
  mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';
import type { mjBizAppsAccountingGLAccountLinkEntity } from '@mj-biz-apps/accounting-entities';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const COMPANY_ENTITY = 'MJ: Companies';
const GL_LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';

/**
 * The roles booking actually walks a category chain for. A category is a fallback tier in the
 * product → category → company resolution, and the only roles that walk are the revenue pair — so
 * these are the roles whose CHAIN this page previews. The link editor itself still offers every
 * active role (a category may carry any link; only these two are worth previewing).
 */
const REVENUE_ROLES = ['Sales', 'Deferred Revenue'] as const;

/**
 * Value lists are DERIVED from the generated entities — never hand-copied. A migration that widens
 * one breaks the compile here rather than silently shipping a stale dropdown (root CLAUDE.md 2c).
 */
export type GLAccountLinkStatus = mjBizAppsAccountingGLAccountLinkEntity['Status'];
export type ProductStatus = mjBizAppsOrdersProductEntity['Status'];

/** The workshop's disclosure SECTIONS — the settings groups inside ONE category's card. */
export type CategorySectionId = 'general' | 'gl' | 'products';

/** Which products the picker shows, relative to the category in the active tab. */
export type MembershipFilter = 'in' | 'out' | 'all';

/** The in-progress category edit. */
export interface CategoryWorkshopDraft {
  Name: string;
  Code: string;
  /** Null = a root category. */
  ParentID: string | null;
  Description: string;
  IsActive: boolean;
}

/** One GL link row, flattened for the template (which does no entity work). */
export interface CategoryGLLinkRow {
  ID: string;
  GLAccountRoleID: string;
  RoleName: string;
  GLAccountID: string;
  AccountCode: string;
  AccountName: string;
  /** The account's owning company — a category has none of its own, so this is FYI, not a check. */
  AccountCompanyName: string;
  Status: GLAccountLinkStatus;
  StartedAt: Date | null;
  EndedAt: Date | null;
  Comments: string | null;
}

/** The link being added/edited in the GL section's inline editor. */
export interface CategoryGLLinkDraft {
  /** Null = a new link. */
  ID: string | null;
  GLAccountRoleID: string | null;
  GLAccountID: string | null;
  Status: GLAccountLinkStatus;
  StartedAt: string | null;
  EndedAt: string | null;
  Comments: string;
}

/** Everything ONE open category tab owns. Section open/closed lives here so switching tabs never
 *  scrambles which sections you had expanded on the category you were editing. */
export interface CategoryDraftState {
  /** Null while the tab is an unsaved new-category draft; stamped by the first successful save. */
  CategoryID: string | null;
  Draft: CategoryWorkshopDraft;
  Links: CategoryGLLinkRow[];
  LinkDraft: CategoryGLLinkDraft | null;
  LinkError: string | null;
  /** One chain per revenue role — a category has no single role of its own (see REVENUE_ROLES). */
  Resolutions: GlResolutionResult[];
  OpenSections: Record<CategorySectionId, boolean>;
  SaveError: string | null;
  SaveMessage: string | null;
  /** Assigning/unassigning a product writes the PRODUCT — its own error surface. */
  MembershipError: string | null;
}

/** A picker option — flattened so the template never touches an entity. */
export interface PickOption {
  ID: string;
  Label: string;
}

/** A GL account option. Category has no company, so the company is LABELLED, never enforced. */
export interface AccountOption extends PickOption {
  CompanyName: string;
}

/** A row in the "open existing category" popover. */
export interface CategoryPickRow {
  ID: string;
  Name: string;
  Code: string | null;
  /** Already open in a tab — picking it focuses that tab rather than looking like a no-op. */
  AlreadyOpen: boolean;
}

/** A row in the product picker (the RIGHT pane). */
export interface ProductPickerRow {
  ID: string;
  Name: string;
  SKU: string | null;
  TypeID: string;
  TypeName: string;
  Status: ProductStatus;
  /** This product's CURRENT category — null when unassigned. */
  CategoryID: string | null;
  CategoryName: string | null;
  /** True when it already belongs to the category in the active tab. */
  IsMember: boolean;
  /** True when it belongs to some OTHER category — adding it here MOVES it (a re-parent, not a copy). */
  IsMemberOfOther: boolean;
}

/** A section's header descriptor. */
export interface SectionHeader {
  Id: CategorySectionId;
  Label: string;
  Icon: string;
}

/** The shape RunView returns for the category's GL links. */
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
 * Products → Category workshop.
 *
 * The one place a category is CREATED and EDITED — deliberately the SAME idiom as the product
 * workshop (`product-workshop.page.ts`), not a new one:
 *  - **Tabs = open CATEGORIES** (the same `WorkspaceTabStore`), each a category you're working on
 *    or an unsaved new-category draft.
 *  - **Disclosure sections = the settings groups** of the category in the active tab, stacked in the
 *    card as `<mj-accordion-panel [Bare]>` headers. A collapsed section that CONTAINS a problem
 *    flags it on its header, so folding one can never hide an error.
 *
 * Two things make this page different from the product workshop, both from the domain:
 *
 * 1. **The category IS a link target, and needs its own chart of accounts** (Marcelo: "the product
 *    and the category are gonna have to have their own chart of accounts"). Accounts resolve
 *    product → category → company, so a category's `GLAccountLink` is the tier that keeps a whole
 *    branch of the catalog bookable. Hence the GL section is OPEN by default here (on a product it
 *    is closed): on a category, the mapping IS the point.
 *
 * 2. **The company tier cannot be previewed from here.** `GLAccountLink` is polymorphic — it points
 *    AT a Product / ProductCategory / Company row, and Product/Category carry no GL columns of their
 *    own. A ProductCategory has no company of its own either (no `OwningCompanyID`), so the walk
 *    this page can honestly show is **category → its ancestors** and stops there. The company
 *    default below it depends on the PRODUCT's `OwningCompanyID`, which differs per product in the
 *    category — so the product workshop shows that tier and this page does not pretend to.
 *
 * Dependency direction (Marcelo: "we shouldn't have dependencies that point down the dependency
 * tree"): orders depends on accounting, never the reverse. This page IMPORTS accounting's engine +
 * its shared `<mj-gl-resolution-preview>`; nothing here is re-implemented and nothing is pushed back.
 */
@Component({
  standalone: false,
  selector: 'mj-category-workshop-page',
  templateUrl: './category-workshop.page.html',
  styleUrls: ['./category-workshop.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryWorkshopPageComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  /** One tab per OPEN CATEGORY — the product workshop's shape, same store. */
  private tabs = new WorkspaceTabStore<CategoryDraftState>();
  private keySeq = 0;
  /** False until the engines + pickers are loaded; an early @Input arrival parks until then. */
  private ready = false;
  private pendingOpen: { CategoryID: string | null } | null = null;

  /**
   * Null = "open a fresh new-category draft". A non-null id OPENS OR FOCUSES that category's tab —
   * it never replaces the page's content. The shell REUSES this instance, hence OnChanges.
   */
  @Input() CategoryID: string | null = null;

  @ViewChild('pickerSearch') private pickerSearch?: ElementRef<HTMLInputElement>;

  public IsLoading = false;
  public IsSaving = false;
  public LoadError: string | null = null;

  // ─── the open-existing picker (the split button's ▾ half) ──────────────────
  public PickerOpen = false;
  public PickerSearch = '';

  // ─── pickers ───────────────────────────────────────────────────────────────
  public Parents: PickOption[] = [];
  public ProductTypes: PickOption[] = [];
  public Roles: PickOption[] = [];
  /** All active GL accounts, labelled with the company whose chart they belong to. */
  public Accounts: AccountOption[] = [];
  private companyNameByID = new Map<string, string>();

  public IsSavingLink = false;
  /** The id of the product whose membership is mid-save — the row disables itself, not the pane. */
  public SavingProductID: string | null = null;

  // ─── the product picker's LEFT-hand filters ────────────────────────────────
  // These are page-level (not per-tab): a filter is how you are looking right now, not a property of
  // the category, so it deliberately survives a tab switch.
  /** One input, three targets: Name, SKU and ID (ids are meaningless to users but stay searchable). */
  public ProductSearch = '';
  public Membership: MembershipFilter = 'all';
  public FilterTypeID = '';
  public FilterStatus = '';

  public readonly LinkStatusOptions: GLAccountLinkStatus[] = ['Active', 'Pending', 'Disabled'];
  public readonly StatusOptions: ProductStatus[] = ['Draft', 'Active', 'Discontinued', 'EOL'];

  public readonly SectionHeaders: SectionHeader[] = [
    { Id: 'general', Label: 'General', Icon: 'fa-solid fa-sitemap' },
    { Id: 'gl', Label: 'GL accounts', Icon: 'fa-solid fa-diagram-project' },
    { Id: 'products', Label: 'Products', Icon: 'fa-solid fa-box' },
  ];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.init();
  }

  /** The shell reuses this instance, so a changed id must OPEN OR FOCUS — never clobber the page. */
  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    const change = changes['CategoryID'];
    if (!change || change.isFirstChange()) return; // init() applies the first value.
    await this.applyInput(this.CategoryID);
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
      const first = this.pendingOpen ? this.pendingOpen.CategoryID : this.CategoryID;
      this.pendingOpen = null;
      await this.applyInput(first);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The open-or-focus rule for the shell's `CategoryID`. */
  private async applyInput(categoryID: string | null): Promise<void> {
    if (!this.ready) {
      this.pendingOpen = { CategoryID: categoryID };
      return;
    }
    if (!categoryID) {
      this.OpenNewDraft();
      return;
    }
    if (this.focusCategoryTab(categoryID)) return; // already open — focus, never duplicate
    await this.openCategory(categoryID);
  }

  /** True when a tab for that category already existed (and is now active). */
  private focusCategoryTab(categoryID: string): boolean {
    const existing = this.tabs.Tabs.find((t) => !!t.State.CategoryID && UUIDsEqual(t.State.CategoryID, categoryID));
    if (!existing) return false;
    this.tabs.Activate(existing.Id);
    this.syncActiveViews();
    this.cdr.markForCheck();
    return true;
  }

  // ─── tabs = open categories ────────────────────────────────────────────────

  public get Tabs(): WorkspaceTab<CategoryDraftState>[] {
    return this.tabs.Tabs;
  }
  public get ActiveTabId(): string | null {
    return this.tabs.ActiveId;
  }
  public get ActiveState(): CategoryDraftState | null {
    return this.tabs.ActiveTab?.State ?? null;
  }
  public get HasTabs(): boolean {
    return this.tabs.Count > 0;
  }

  public OpenNewDraft(): void {
    this.tabs.Open({
      Id: `cw-${++this.keySeq}-${Date.now()}`,
      Label: 'New category',
      Icon: 'fa-solid fa-sitemap',
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

  /** Load one category into a NEW tab (the caller has already ruled out a duplicate). */
  private async openCategory(categoryID: string): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const c = OrdersEngineBase.Instance.ProductCategoryByID(categoryID);
      if (!c) throw new Error(`Product category ${categoryID} was not found.`);
      const state = this.emptyState();
      state.CategoryID = c.ID;
      state.Draft = CategoryWorkshopPageComponent.DraftFromCategory(c);
      this.tabs.Open({
        Id: `cw-${++this.keySeq}-${NormalizeUUID(c.ID)}`,
        Label: c.Name || 'New category',
        Icon: 'fa-solid fa-sitemap',
        Status: 'complete',
        State: state,
      });
      await this.loadLinks(state);
      this.buildResolutions(state);
      this.syncActiveViews();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Re-read the active tab's category + links from a freshened cache (the header Refresh). */
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
      if (state.CategoryID) {
        const c = engine.ProductCategoryByID(state.CategoryID);
        if (!c) throw new Error(`Product category ${state.CategoryID} was not found.`);
        state.Draft = CategoryWorkshopPageComponent.DraftFromCategory(c);
        this.renameActiveTab();
        if (this.tabs.ActiveId) this.tabs.MarkClean(this.tabs.ActiveId);
        await this.loadLinks(state);
        this.buildResolutions(state);
      }
      this.syncActiveViews();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Whatever depends on WHICH tab is active — only the parent list (a category can't parent itself). */
  private syncActiveViews(): void {
    this.refreshParentOptions();
  }

  /** The tab caption follows the category's Name — the label is how you find the tab again. */
  private renameActiveTab(): void {
    const tab = this.tabs.ActiveTab;
    if (!tab) return;
    tab.Label = tab.State.Draft.Name.trim() || 'New category';
  }

  // ─── disclosure sections ───────────────────────────────────────────────────

  public IsSectionOpen(id: CategorySectionId): boolean {
    return this.ActiveState?.OpenSections[id] === true;
  }

  /** Wired to `mj-accordion-panel`'s `(ExpandedChange)`. Independent disclosures — any number may be
   *  open at once; these panels are not a single-select accordion. */
  public SetSectionOpen(id: CategorySectionId, open: boolean): void {
    const state = this.ActiveState;
    if (!state) return;
    state.OpenSections[id] = open;
    this.cdr.markForCheck();
  }

  /**
   * How many problems a section is carrying — rendered on its header OPEN OR CLOSED, so a collapsed
   * section can never swallow an error.
   */
  public SectionIssues(id: CategorySectionId): number {
    const state = this.ActiveState;
    if (!state) return 0;
    switch (id) {
      case 'general':
        return state.Draft.Name.trim().length === 0 ? 1 : 0;
      case 'gl':
        return (state.LinkError ? 1 : 0) + state.Resolutions.filter((r) => !r.ResolvedCode).length;
      case 'products':
        return state.MembershipError ? 1 : 0;
      default:
        return 0;
    }
  }

  public SectionIssueTitle(id: CategorySectionId): string {
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

  /** Matches Name, Code and ID. Name/Code is what a human types; the ID stays searchable in FULL
   *  because a developer occasionally has one — but it is never what the list LEADS with. */
  public get PickerRows(): CategoryPickRow[] {
    const q = this.PickerSearch.trim().toLowerCase();
    return OrdersEngineBase.Instance.ProductCategories.filter((c) => {
      if (!q) return true;
      return (
        c.Name.toLowerCase().includes(q) ||
        (c.Code ?? '').toLowerCase().includes(q) ||
        NormalizeUUID(c.ID).includes(q)
      );
    })
      .map((c) => ({
        ID: c.ID,
        Name: c.Name,
        Code: c.Code,
        AlreadyOpen: this.tabs.Tabs.some((t) => !!t.State.CategoryID && UUIDsEqual(t.State.CategoryID, c.ID)),
      }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public async PickCategory(row: CategoryPickRow): Promise<void> {
    this.ClosePicker();
    if (this.focusCategoryTab(row.ID)) return;
    await this.openCategory(row.ID);
  }

  // ─── derived state the template reads ──────────────────────────────────────

  public get IsNew(): boolean {
    return !this.ActiveState?.CategoryID;
  }

  public get CanSave(): boolean {
    const state = this.ActiveState;
    if (!state) return false;
    return !this.IsSaving && state.Draft.Name.trim().length > 0;
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

  // ─── pickers ───────────────────────────────────────────────────────────────

  private async loadPickers(engine: OrdersEngineBase, aeb: AccountingEngineBase): Promise<void> {
    this.ProductTypes = engine.ProductTypes.map((t) => ({ ID: t.ID, Label: t.Name })).sort((a, b) =>
      a.Label.localeCompare(b.Label),
    );
    // Roles carry Status + Sequence (not IsActive); Sequence is the roster's own intended order.
    this.Roles = aeb.GLAccountRoles.filter((r) => r.Status === 'Active')
      .sort((a, b) => a.Sequence - b.Sequence || a.Name.localeCompare(b.Name))
      .map((r) => ({ ID: r.ID, Label: r.Name }));

    await this.loadCompanies();
    this.refreshAccountOptions(aeb);
    this.refreshParentOptions();
  }

  /** Company names label the accounts — a category has no company of its own, so this is the only
   *  way a user can see WHOSE chart of accounts they are about to link this category to. */
  private async loadCompanies(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const companies = await rv.RunView<CompanyRaw>(
      { EntityName: COMPANY_ENTITY, Fields: ['ID', 'Name'], OrderBy: 'Name ASC', ResultType: 'simple' },
      this.ProviderToUse.CurrentUser,
    );
    // RunView does NOT throw — it reports failure on the result. Ignoring it is a silent bug.
    if (!companies.Success) throw new Error(companies.ErrorMessage ?? 'Could not load companies.');
    this.companyNameByID = new Map((companies.Results ?? []).map((c) => [NormalizeUUID(c.ID), c.Name]));
  }

  private refreshAccountOptions(aeb: AccountingEngineBase): void {
    this.Accounts = aeb.GLAccounts.filter((a) => a.IsActive)
      .map((a) => ({
        ID: a.ID,
        Label: `${a.Code} ${a.Name}`,
        CompanyName: this.companyNameByID.get(NormalizeUUID(a.CompanyID)) ?? '(unknown company)',
      }))
      // Grouped by company then code: the chart of accounts is per-company, so reading it any other
      // way mixes two companies' charts into one list.
      .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName) || a.Label.localeCompare(b.Label));
  }

  /**
   * The parent picker offers every category EXCEPT the one being edited and its own descendants. A
   * cycle is refused at the only place it can be introduced.
   */
  private refreshParentOptions(): void {
    const current = this.ActiveState?.CategoryID ?? null;
    const banned = current ? this.descendantsOf(current) : new Set<string>();
    this.Parents = OrdersEngineBase.Instance.ProductCategories.filter((c) => !banned.has(NormalizeUUID(c.ID)))
      .map((c) => ({ ID: c.ID, Label: c.Code ? `${c.Name} (${c.Code})` : c.Name }))
      .sort((a, b) => a.Label.localeCompare(b.Label));
  }

  /** The category itself plus everything beneath it — the set that must not become its parent. */
  private descendantsOf(id: string): Set<string> {
    const childKeys = new Map<string, string[]>();
    for (const c of OrdersEngineBase.Instance.ProductCategories) {
      if (!c.ParentID) continue;
      const pk = NormalizeUUID(c.ParentID);
      const list = childKeys.get(pk) ?? [];
      list.push(NormalizeUUID(c.ID));
      childKeys.set(pk, list);
    }
    const banned = new Set<string>([NormalizeUUID(id)]);
    const queue: string[] = [NormalizeUUID(id)];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const kid of childKeys.get(cur) ?? []) {
        if (banned.has(kid)) continue; // also guards a pre-existing cycle in the data
        banned.add(kid);
        queue.push(kid);
      }
    }
    return banned;
  }

  // ─── load a tab's links + resolutions ──────────────────────────────────────

  private async loadLinks(state: CategoryDraftState): Promise<void> {
    state.Links = [];
    if (!state.CategoryID) return; // A new category has no record id to link against yet.
    const entityId = this.categoryEntityId();
    if (!entityId) throw new Error(`The '${PRODUCT_CATEGORY_ENTITY}' entity is not registered in this instance.`);

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<GLLinkRaw>(
      {
        EntityName: GL_LINK_ENTITY,
        // The polymorphic target: THIS category, on the Product Categories entity.
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${state.CategoryID}'`,
        Fields: ['ID', 'GLAccountID', 'GLAccountRoleID', 'Status', 'StartedAt', 'EndedAt', 'Comments'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!result.Success) throw new Error(result.ErrorMessage ?? 'Could not load this category’s GL account links.');
    state.Links = (result.Results ?? []).map((l) => this.toLinkRow(l));
  }

  private toLinkRow(l: GLLinkRaw): CategoryGLLinkRow {
    const aeb = AccountingEngineBase.Instance;
    const account = aeb.GLAccountByID(l.GLAccountID);
    const role = aeb.GLAccountRoles.find((r) => UUIDsEqual(r.ID, l.GLAccountRoleID));
    return {
      ID: l.ID,
      GLAccountRoleID: l.GLAccountRoleID,
      RoleName: role?.Name ?? '(unknown role)',
      GLAccountID: l.GLAccountID,
      AccountCode: account?.Code ?? '?',
      AccountName: account?.Name ?? '(unknown account)',
      AccountCompanyName: account ? (this.companyNameByID.get(NormalizeUUID(account.CompanyID)) ?? '—') : '—',
      Status: l.Status,
      StartedAt: l.StartedAt ? new Date(l.StartedAt) : null,
      EndedAt: l.EndedAt ? new Date(l.EndedAt) : null,
      Comments: l.Comments,
    };
  }

  /**
   * The resolution chain, per revenue role: **this category → its ancestors**.
   *
   * NOT the whole booking walk. Booking walks product → category chain → company, but the company
   * tier hangs off the PRODUCT's `OwningCompanyID` (a ProductCategory has no company of its own), so
   * it differs product-by-product within this category. Showing a company step here would be
   * inventing one. The product workshop shows the full three-tier chain; this page shows the tier it
   * actually owns, and says so on the page.
   */
  private buildResolutions(state: CategoryDraftState): void {
    state.Resolutions = [];
    if (!state.CategoryID) return;
    for (const role of REVENUE_ROLES) state.Resolutions.push(this.buildRoleChain(state, role));
  }

  private buildRoleChain(state: CategoryDraftState, role: string): GlResolutionResult {
    const engine = OrdersEngineBase.Instance;
    const aeb = AccountingEngineBase.Instance;
    const entityId = this.categoryEntityId();
    const asOf = new Date();
    const steps: GlResolutionStep[] = [];
    let won = false;

    const push = (scope: string, glAccountId: string | null): void => {
      const account = glAccountId ? aeb.GLAccountByID(glAccountId) : null;
      const isWinner = !won && !!account;
      if (isWinner) won = true;
      steps.push({ Scope: scope, AccountCode: account?.Code ?? null, AccountName: account?.Name ?? null, Won: isWinner });
    };

    // This category first, then up the parent chain — cycle-guarded (bad data must not hang the page).
    let categoryID: string | null = state.CategoryID;
    let label = state.Draft.Name || '(unnamed)';
    const seen = new Set<string>();
    while (categoryID && !seen.has(NormalizeUUID(categoryID))) {
      seen.add(NormalizeUUID(categoryID));
      const hit = entityId ? aeb.ResolveLinkedAccount(entityId, categoryID, role, asOf) : null;
      push(`Category: ${label}`, hit?.Link.GLAccountID ?? null);
      const parentID: string | null = engine.ProductCategoryByID(categoryID)?.ParentID ?? null;
      categoryID = parentID;
      label = parentID ? (engine.ProductCategoryByID(parentID)?.Name ?? '?') : '';
    }

    const winner = steps.find((s) => s.Won);
    return {
      Role: role,
      Steps: steps,
      ResolvedCode: winner?.AccountCode ?? null,
      ResolvedName: winner?.AccountName ?? null,
    };
  }

  private categoryEntityId(): string | null {
    return this.entityIdFor(PRODUCT_CATEGORY_ENTITY);
  }

  private entityIdFor(entityName: string): string | null {
    return this.ProviderToUse.Entities.find((e) => e.Name === entityName)?.ID ?? null;
  }

  // ─── save the category ─────────────────────────────────────────────────────

  public async Save(): Promise<void> {
    const state = this.ActiveState;
    const tabId = this.tabs.ActiveId;
    if (!state || !tabId || !this.CanSave) return;
    this.IsSaving = true;
    state.SaveError = null;
    state.SaveMessage = null;
    this.cdr.markForCheck();
    try {
      const c = await this.ProviderToUse.GetEntityObject<mjBizAppsOrdersProductCategoryEntity>(
        PRODUCT_CATEGORY_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (state.CategoryID) {
        const loaded = await c.Load(state.CategoryID);
        if (!loaded) throw new Error(`Product category ${state.CategoryID} could not be loaded for editing.`);
      } else {
        c.NewRecord();
      }
      this.applyDraftTo(c, state.Draft);

      // Save() returns a boolean and does NOT throw on a logical failure — check it, and surface the
      // server's real validation message rather than a generic "save failed".
      if (!(await c.Save())) {
        throw new Error(c.LatestResult?.CompleteMessage || 'The category could not be saved.');
      }

      const wasNew = !state.CategoryID;
      state.CategoryID = c.ID;
      state.SaveMessage = wasNew ? 'Category created.' : 'Category saved.';
      this.tabs.MarkClean(tabId);
      this.tabs.SetStatus(tabId, 'complete');
      this.renameActiveTab();
      // The engine caches categories; a stale cache would show the old row on the next page.
      await OrdersEngineBase.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      await this.loadLinks(state);
      this.buildResolutions(state);
      this.syncActiveViews();
    } catch (e) {
      state.SaveError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  /** Draft → typed entity properties. Empty strings become NULL (a blank code is "no code", not ''). */
  private applyDraftTo(c: mjBizAppsOrdersProductCategoryEntity, d: CategoryWorkshopDraft): void {
    c.Name = d.Name.trim();
    c.Code = d.Code.trim() || null;
    c.Description = d.Description.trim() || null;
    c.ParentID = d.ParentID;
    c.IsActive = d.IsActive;
  }

  // ─── GL links: add / edit / remove ─────────────────────────────────────────

  public AddLink(): void {
    const state = this.ActiveState;
    if (!state) return;
    state.LinkError = null;
    state.LinkDraft = {
      ID: null,
      // Sales is the role a category most often carries — it is the default revenue role a product
      // falls back to when it is not Deferred. Pre-selected, never forced.
      GLAccountRoleID: this.Roles.find((r) => r.Label === 'Sales')?.ID ?? null,
      GLAccountID: null,
      Status: 'Active',
      StartedAt: null,
      EndedAt: null,
      Comments: '',
    };
    this.cdr.markForCheck();
  }

  public EditLink(row: CategoryGLLinkRow): void {
    const state = this.ActiveState;
    if (!state) return;
    state.LinkError = null;
    state.LinkDraft = {
      ID: row.ID,
      GLAccountRoleID: row.GLAccountRoleID,
      GLAccountID: row.GLAccountID,
      Status: row.Status,
      StartedAt: CategoryWorkshopPageComponent.ToInputDate(row.StartedAt),
      EndedAt: CategoryWorkshopPageComponent.ToInputDate(row.EndedAt),
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
    if (!state || !d || !this.CanSaveLink || !state.CategoryID) return;
    const entityId = this.categoryEntityId();
    if (!entityId) {
      state.LinkError = `The '${PRODUCT_CATEGORY_ENTITY}' entity is not registered in this instance.`;
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
      // The polymorphic target: this category, on the Product Categories entity.
      link.EntityID = entityId;
      link.RecordID = state.CategoryID;
      link.GLAccountRoleID = d.GLAccountRoleID!;
      link.GLAccountID = d.GLAccountID!;
      link.Status = d.Status;
      link.StartedAt = CategoryWorkshopPageComponent.FromInputDate(d.StartedAt);
      link.EndedAt = CategoryWorkshopPageComponent.FromInputDate(d.EndedAt);
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

  public async RemoveLink(row: CategoryGLLinkRow): Promise<void> {
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
  private async afterLinkChange(state: CategoryDraftState): Promise<void> {
    const aeb = AccountingEngineBase.Instance;
    await aeb.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    await this.loadLinks(state);
    this.buildResolutions(state);
    this.refreshAccountOptions(aeb);
    this.cdr.markForCheck();
  }

  // ─── the product picker (filters LEFT, picker RIGHT) ───────────────────────

  public OnProductFilterChanged(): void {
    this.cdr.markForCheck();
  }

  public ClearProductFilters(): void {
    this.ProductSearch = '';
    this.Membership = 'all';
    this.FilterTypeID = '';
    this.FilterStatus = '';
    this.cdr.markForCheck();
  }

  public get HasProductFilters(): boolean {
    return (
      this.ProductSearch.trim().length > 0 ||
      this.Membership !== 'all' ||
      this.FilterTypeID !== '' ||
      this.FilterStatus !== ''
    );
  }

  /** How many products currently sit in the open category — the number the section header carries. */
  public get MemberCount(): number {
    const id = this.ActiveState?.CategoryID;
    if (!id) return 0;
    return OrdersEngineBase.Instance.Products.filter((p) => !!p.ProductCategoryID && UUIDsEqual(p.ProductCategoryID, id))
      .length;
  }

  /** The RIGHT pane's rows, after the LEFT pane's filters. Members sort first — the pane is about
   *  this category, so what is IN it leads. */
  public get ProductRows(): ProductPickerRow[] {
    const rows = OrdersEngineBase.Instance.Products.map((p) => this.toProductRow(p)).filter((r) =>
      this.matchesProductFilters(r),
    );
    return rows.sort(
      (a, b) => (a.IsMember === b.IsMember ? 0 : a.IsMember ? -1 : 1) || a.Name.localeCompare(b.Name),
    );
  }

  private toProductRow(p: mjBizAppsOrdersProductEntity): ProductPickerRow {
    const openID = this.ActiveState?.CategoryID ?? null;
    const isMember = !!openID && !!p.ProductCategoryID && UUIDsEqual(p.ProductCategoryID, openID);
    const category = p.ProductCategoryID ? OrdersEngineBase.Instance.ProductCategoryByID(p.ProductCategoryID) : null;
    return {
      ID: p.ID,
      Name: p.Name,
      SKU: p.SKU,
      TypeID: p.ProductTypeID,
      TypeName: this.ProductTypes.find((t) => UUIDsEqual(t.ID, p.ProductTypeID))?.Label ?? '—',
      Status: p.Status,
      CategoryID: p.ProductCategoryID,
      CategoryName: category?.Name ?? null,
      IsMember: isMember,
      IsMemberOfOther: !!p.ProductCategoryID && !isMember,
    };
  }

  /** Name, SKU and ID — humans search by name; the ID is matched in FULL because it is searchable. */
  private matchesProductFilters(r: ProductPickerRow): boolean {
    const q = this.ProductSearch.trim().toLowerCase();
    if (q && !(r.Name.toLowerCase().includes(q) || (r.SKU ?? '').toLowerCase().includes(q) || NormalizeUUID(r.ID).includes(q)))
      return false;
    if (this.Membership === 'in' && !r.IsMember) return false;
    if (this.Membership === 'out' && r.IsMember) return false;
    // UUIDsEqual, never `===` — SQL Server returns UUIDs uppercase, PostgreSQL lowercase.
    if (this.FilterTypeID && !UUIDsEqual(r.TypeID, this.FilterTypeID)) return false;
    if (this.FilterStatus && r.Status !== this.FilterStatus) return false;
    return true;
  }

  /**
   * Add/remove a product to/from the open category by writing `Product.ProductCategoryID`.
   *
   * There is no join table — a product belongs to at MOST one category — so "add" on a product that
   * already sits in another category is a MOVE, not a copy. The row says so before you click.
   */
  public async SetMembership(row: ProductPickerRow, member: boolean): Promise<void> {
    const state = this.ActiveState;
    if (!state || !state.CategoryID || this.SavingProductID) return;
    this.SavingProductID = row.ID;
    state.MembershipError = null;
    this.cdr.markForCheck();
    try {
      const p = await this.ProviderToUse.GetEntityObject<mjBizAppsOrdersProductEntity>(
        PRODUCT_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      const loaded = await p.Load(row.ID);
      if (!loaded) throw new Error(`Product ${row.ID} could not be loaded.`);
      p.ProductCategoryID = member ? state.CategoryID : null;
      if (!(await p.Save())) {
        throw new Error(p.LatestResult?.CompleteMessage || 'The product’s category could not be changed.');
      }
      // The picker reads only the engine cache — without this refresh the row would not move.
      await OrdersEngineBase.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    } catch (e) {
      state.MembershipError = e instanceof Error ? e.message : String(e);
    } finally {
      this.SavingProductID = null;
      this.cdr.markForCheck();
    }
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

  private static DraftFromCategory(c: mjBizAppsOrdersProductCategoryEntity): CategoryWorkshopDraft {
    return {
      Name: c.Name,
      Code: c.Code ?? '',
      ParentID: c.ParentID,
      Description: c.Description ?? '',
      IsActive: c.IsActive,
    };
  }

  /**
   * A fresh tab payload.
   *
   * Section defaults differ from the product workshop's ON PURPOSE. There, GL accounts starts
   * CLOSED because the resolution chain usually answers for a product. Here, the category IS the
   * chart-of-accounts tier — the mapping is the reason you opened the page — so **GL accounts opens
   * with General**. Products starts closed: it is a bulk-membership tool, not a per-edit field, and
   * a collapsed section still flags its own issues on the header.
   */
  private emptyState(): CategoryDraftState {
    return {
      CategoryID: null,
      Draft: CategoryWorkshopPageComponent.EmptyDraft(),
      Links: [],
      LinkDraft: null,
      LinkError: null,
      Resolutions: [],
      OpenSections: { general: true, gl: true, products: false },
      SaveError: null,
      SaveMessage: null,
      MembershipError: null,
    };
  }

  private static EmptyDraft(): CategoryWorkshopDraft {
    // Mirrors the schema's own default (IsActive=1) so a new row matches what the DB would do.
    return { Name: '', Code: '', ParentID: null, Description: '', IsActive: true };
  }
}
