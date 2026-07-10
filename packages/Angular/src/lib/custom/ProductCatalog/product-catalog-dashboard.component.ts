import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsAccountingGLAccountLinkEntity } from '@mj-biz-apps/accounting-entities';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const GL_ROLE_ENTITY = 'MJ_BizApps_Accounting: GL Account Roles';
const GL_ACCOUNT_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';
const GL_LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';

/** Revenue-recognition type, derived from the generated entity union (rule 2c). */
type Recognition = mjBizAppsOrdersProductEntity['RevenueRecognitionType'];

interface ProductRow {
  ID: string;
  Name: string;
  ProductType: string | null;
  ProductCategory: string | null;
  Recognition: Recognition;
  IsActive: boolean;
  Description: string | null;
}

interface RoleOption { ID: string; Name: string }
interface AccountOption { ID: string; Code: string; Name: string }
interface LinkRow { ID: string; Role: string; Account: string }

/**
 * Product Catalog — the orders catalog-management surface. Lists products with type, category, and
 * revenue-recognition, and (for the selected product) shows + edits its **GL-account links** inline:
 * the AM-5 account-mapping picker embedded in the product view, so a product's Sales / Deferred-Revenue
 * account can be wired in the UI instead of via the seed harness.
 *
 * Account links are accounting's polymorphic GLAccountLink rows (EntityID = the Products entity's
 * metadata id, RecordID = the product id); we read/write them by entity name — no cross-package dep.
 */
@Component({
  standalone: false,
  selector: 'mj-product-catalog-dashboard',
  templateUrl: './product-catalog-dashboard.component.html',
  styleUrls: ['./product-catalog-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'ProductCatalogDashboard')
export class ProductCatalogDashboardComponent extends BaseDashboard {
  private cdr = inject(ChangeDetectorRef);
  private forms = inject(MJFormPresenterService);

  public IsBusy = false;
  public LoadError: string | null = null;

  public AllProducts: ProductRow[] = [];
  public Categories: string[] = [];
  public TypeCount = 0;
  public CategoryCount = 0;

  public Roles: RoleOption[] = [];
  public Accounts: AccountOption[] = [];

  // ─── filters ───────────────────────────────────────────────────────────────
  public Search = '';
  public CategoryFilter = 'All';
  public ActiveOnly = true;

  // ─── selection + account mapping ─────────────────────────────────────────────
  public SelectedProductID: string | null = null;
  public DetailLoading = false;
  public Links: LinkRow[] = [];
  public NewRoleID = '';
  public NewAccountID = '';
  public Saving = false;
  public ActionMessage: string | null = null;
  public ActionIsError = false;

  private productsEntityId = '';

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Product Catalog';
  }

  protected initDashboard(): void {
    this.productsEntityId = new Metadata().EntityByName(PRODUCT_ENTITY)?.ID ?? '';
  }

  protected async loadData(): Promise<void> {
    this.IsBusy = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      await this.loadCatalog();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsBusy = false;
      this.cdr.markForCheck();
    }
  }

  private async loadCatalog(): Promise<void> {
    // Product Types come from the shared front-end catalog engine (cached, reactive) — not a per-page RunView.
    await OrdersEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    const rv = new RunView();
    const [products, categories, roles, accounts] = await rv.RunViews([
      { EntityName: PRODUCT_ENTITY, Fields: ['ID', 'Name', 'ProductType', 'ProductCategory', 'RevenueRecognitionType', 'IsActive', 'Description'], OrderBy: 'Name ASC', ResultType: 'simple' },
      { EntityName: PRODUCT_CATEGORY_ENTITY, Fields: ['ID', 'Name'], OrderBy: 'Name ASC', ResultType: 'simple' },
      { EntityName: GL_ROLE_ENTITY, ExtraFilter: `Status='Active'`, Fields: ['ID', 'Name'], OrderBy: 'Sequence ASC, Name ASC', ResultType: 'simple' },
      { EntityName: GL_ACCOUNT_ENTITY, ExtraFilter: `IsActive=1`, Fields: ['ID', 'Code', 'Name'], OrderBy: 'Code ASC', ResultType: 'simple' },
    ]);
    this.AllProducts = ((products.Results ?? []) as Array<{ ID: string; Name: string; ProductType: string | null; ProductCategory: string | null; RevenueRecognitionType: Recognition; IsActive: boolean; Description: string | null }>)
      .map(p => ({ ID: p.ID, Name: p.Name, ProductType: p.ProductType, ProductCategory: p.ProductCategory, Recognition: p.RevenueRecognitionType, IsActive: p.IsActive, Description: p.Description }));
    this.TypeCount = OrdersEngineBase.Instance.ProductTypes.length;
    const cats = (categories.Results ?? []) as Array<{ Name: string }>;
    this.CategoryCount = cats.length;
    this.Categories = cats.map(c => c.Name);
    this.Roles = ((roles.Results ?? []) as RoleOption[]);
    this.Accounts = ((accounts.Results ?? []) as AccountOption[]);
  }

  // ─── filtered view ───────────────────────────────────────────────────────────

  public get FilteredProducts(): ProductRow[] {
    const q = this.Search.trim().toLowerCase();
    return this.AllProducts.filter(p => {
      if (this.ActiveOnly && !p.IsActive) return false;
      if (this.CategoryFilter !== 'All' && p.ProductCategory !== this.CategoryFilter) return false;
      if (q && !p.Name.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  public get ActiveCount(): number { return this.AllProducts.filter(p => p.IsActive).length; }

  // ─── selection + account mapping ─────────────────────────────────────────────

  public get SelectedProduct(): ProductRow | null {
    return this.AllProducts.find(p => p.ID === this.SelectedProductID) ?? null;
  }

  public async SelectProduct(row: ProductRow): Promise<void> {
    this.SelectedProductID = row.ID;
    this.ActionMessage = null;
    this.NewRoleID = '';
    this.NewAccountID = '';
    await this.loadLinks(row.ID);
  }

  private async loadLinks(productID: string): Promise<void> {
    this.DetailLoading = true;
    this.Links = [];
    this.cdr.markForCheck();
    try {
      const rv = new RunView();
      const res = await rv.RunView<{ ID: string; GLAccountRole: string | null; GLAccount: string | null }>({
        EntityName: GL_LINK_ENTITY,
        ExtraFilter: `EntityID='${this.productsEntityId}' AND RecordID='${productID}' AND Status='Active'`,
        Fields: ['ID', 'GLAccountRole', 'GLAccount'],
        ResultType: 'simple',
      });
      this.Links = (res.Results ?? []).map(l => ({ ID: l.ID, Role: l.GLAccountRole ?? '(role)', Account: l.GLAccount ?? '(account)' }));
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.DetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  public get CanAddMapping(): boolean {
    return !!this.SelectedProductID && !!this.NewRoleID && !!this.NewAccountID && !this.Saving;
  }

  public async AddMapping(): Promise<void> {
    const productID = this.SelectedProductID;
    if (!this.CanAddMapping || !productID) return;
    this.Saving = true;
    this.ActionMessage = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const link = await md.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(GL_LINK_ENTITY);
      link.NewRecord();
      link.GLAccountID = this.NewAccountID;
      link.GLAccountRoleID = this.NewRoleID;
      link.EntityID = this.productsEntityId;
      link.RecordID = productID;
      link.Status = 'Active';
      if (await link.Save()) {
        this.ActionMessage = 'Account mapping added.';
        this.ActionIsError = false;
        this.NewRoleID = '';
        this.NewAccountID = '';
        await this.loadLinks(productID);
      } else {
        this.setError(`Could not add mapping: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.Saving = false;
      this.cdr.markForCheck();
    }
  }

  public async RemoveMapping(link: LinkRow): Promise<void> {
    const productID = this.SelectedProductID;
    if (!productID) return;
    this.Saving = true;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const rec = await md.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(GL_LINK_ENTITY);
      if (await rec.Load(link.ID)) {
        rec.Status = 'Disabled';
        if (await rec.Save()) {
          await this.loadLinks(productID);
        } else {
          this.setError(`Could not remove mapping: ${rec.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
      }
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.Saving = false;
      this.cdr.markForCheck();
    }
  }

  public OpenProduct(): void {
    if (!this.SelectedProductID) return;
    this.forms.Open({ EntityName: PRODUCT_ENTITY, PrimaryKey: CompositeKey.FromID(this.SelectedProductID), Presentation: 'dialog', Width: '94vw' });
  }

  /** Create a new product via the entity form (create mode = no PrimaryKey); refresh the catalog on save. */
  public async OnNewProduct(): Promise<void> {
    const ref = this.forms.Open({ EntityName: PRODUCT_ENTITY, Presentation: 'dialog', Width: '94vw' });
    const saved = await ref.AfterSaved();
    if (saved) {
      await this.loadData();
    }
  }

  private setError(message: string): void {
    this.ActionMessage = message;
    this.ActionIsError = true;
    this.cdr.markForCheck();
  }
}
