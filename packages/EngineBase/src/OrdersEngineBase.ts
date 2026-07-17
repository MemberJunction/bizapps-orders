/**
 * OrdersEngineBase — the browser-safe Orders catalog engine (plan/amendment §4; F0 engine split).
 *
 * A `BaseEngine` singleton caching the product catalog (types, categories, products) and, in
 * lockstep, accounting's link/account caches (via `AccountingEngineBase`). It owns the GL-account
 * resolution (`ResolveAccount`: product → up the category tree → company default, through
 * accounting's polymorphic GLAccountLink) and `buildDraftsForOrder` (turn a Confirmed order into
 * the balanced per-company `JournalEntryDraft`s the accounting op consumes). The pure Dr/Cr
 * assembly lives in `./orderJournalDraft` (offline-unit-tested).
 *
 * Mirrors `AccountingEngineBase`: `Config` entries auto-subscribe to `BaseEntity` events so cached
 * collections stay current reactively and `ObserveProperty(name)` emits on change. Everything here
 * is isomorphic — the server-only wrapper `OrdersEngine`
 * (`@mj-biz-apps/orders-core-entities-server`) composes over THIS instance (AIEngineBase/AIEngine
 * pattern); it does not duplicate the cache.
 *
 * ⚠ Catalog size: `Config` caches ALL products/categories (needed for booking resolution). For a
 * very large catalog a lighter browser config variant / lazy product loading is a future option
 * (plans/DEFERRALS.md) — fine for v1 catalogs.
 *
 * CONNECTS TO:
 *   ACCOUNTING: @mj-biz-apps/accounting-engine-base (ResolveLinkedAccount, GLAccountByID)
 *   PURE:       ./orderJournalDraft (buildOrderJournalDrafts)
 *   SERVER:     OrdersEngine (@mj-biz-apps/orders-core-entities-server) — thin wrapper over this
 */
import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  Metadata,
  RegisterForStartup,
  UserInfo,
} from '@memberjunction/core';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import type { JournalEntryDraft } from '@mj-biz-apps/accounting-engine-base';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersPaymentTermsTypeEntity,
  mjBizAppsOrdersPriceListEntity,
  mjBizAppsOrdersPriceTierEntity,
  mjBizAppsOrdersProductCategoryEntity,
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersProductPriceEntity,
  mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { buildOrderJournalDrafts, type ResolvedOrderLine } from './orderJournalDraft.js';
import { computeLineNet } from './orderLifecycle.js';
import { resolveProductPrice, type ResolvePriceResult } from './pricing.js';

const PRODUCT_TYPES_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_CATEGORIES_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCTS_ENTITY = 'MJ_BizApps_Orders: Products';
const PAYMENT_TERMS_TYPES_ENTITY = 'MJ_BizApps_Orders: Payment Terms Types';
const PRODUCT_PRICES_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PRICE_TIERS_ENTITY = 'MJ_BizApps_Orders: Price Tiers';
const PRICE_LISTS_ENTITY = 'MJ_BizApps_Orders: Price Lists';
const COMPANIES_ENTITY = 'MJ: Companies';

const ROLE_ACCOUNTS_RECEIVABLE = 'Accounts Receivable';
const ROLE_SALES = 'Sales';
const ROLE_DEFERRED_REVENUE = 'Deferred Revenue';

/** A resolved GL account: its ID and (from the account) the company it belongs to. */
export interface ResolvedAccount {
  GLAccountID: string;
  CompanyID: string;
}

/**
 * Outcome of turning an order into its booking drafts (ONE PER COMPANY — MOD-11), or the
 * resolution errors that blocked it. Drafts is non-empty exactly when Errors is empty.
 */
export interface OrderDraftBuildResult {
  Drafts?: JournalEntryDraft[];
  Errors: string[];
}

@RegisterForStartup()
export class OrdersEngineBase extends BaseEngine<OrdersEngineBase> {
  private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];
  private _productCategories: mjBizAppsOrdersProductCategoryEntity[] = [];
  private _products: mjBizAppsOrdersProductEntity[] = [];
  private _paymentTermsTypes: mjBizAppsOrdersPaymentTermsTypeEntity[] = [];
  private _productPrices: mjBizAppsOrdersProductPriceEntity[] = [];
  private _priceTiers: mjBizAppsOrdersPriceTierEntity[] = [];
  private _priceLists: mjBizAppsOrdersPriceListEntity[] = [];
  private _entityIdCache = new Map<string, string>();

  public static get Instance(): OrdersEngineBase {
    return super.getInstance<OrdersEngineBase>();
  }

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const params: Array<Partial<BaseEnginePropertyConfig>> = [
      { PropertyName: '_productTypes', EntityName: PRODUCT_TYPES_ENTITY },
      { PropertyName: '_productCategories', EntityName: PRODUCT_CATEGORIES_ENTITY },
      { PropertyName: '_products', EntityName: PRODUCTS_ENTITY },
      { PropertyName: '_paymentTermsTypes', EntityName: PAYMENT_TERMS_TYPES_ENTITY },
      { PropertyName: '_productPrices', EntityName: PRODUCT_PRICES_ENTITY },
      { PropertyName: '_priceTiers', EntityName: PRICE_TIERS_ENTITY },
      { PropertyName: '_priceLists', EntityName: PRICE_LISTS_ENTITY },
    ];
    const result = await this.Load(params, provider as IMetadataProvider, forceRefresh ?? false, contextUser);
    // Resolution reads accounting's link/account caches — keep them loaded in lockstep.
    await AccountingEngineBase.Instance.Config(forceRefresh ?? false, contextUser, provider);
    return result;
  }

  // ─── cached collections ──────────────────────────────────────────────────────
  public get ProductTypes(): mjBizAppsOrdersProductTypeEntity[] {
    return this.GetConfigData<mjBizAppsOrdersProductTypeEntity>('_productTypes');
  }
  public get ProductCategories(): mjBizAppsOrdersProductCategoryEntity[] {
    return this.GetConfigData<mjBizAppsOrdersProductCategoryEntity>('_productCategories');
  }
  public get Products(): mjBizAppsOrdersProductEntity[] {
    return this.GetConfigData<mjBizAppsOrdersProductEntity>('_products');
  }

  public get PaymentTermsTypes(): mjBizAppsOrdersPaymentTermsTypeEntity[] {
    return this.GetConfigData<mjBizAppsOrdersPaymentTermsTypeEntity>('_paymentTermsTypes');
  }

  public ProductByID(id: string): mjBizAppsOrdersProductEntity | undefined {
    const key = uuidKey(id);
    return this.Products.find(p => uuidKey(p.ID) === key);
  }
  public ProductCategoryByID(id: string): mjBizAppsOrdersProductCategoryEntity | undefined {
    const key = uuidKey(id);
    return this.ProductCategories.find(c => uuidKey(c.ID) === key);
  }
  public ProductTypeByID(id: string): mjBizAppsOrdersProductTypeEntity | undefined {
    const key = uuidKey(id);
    return this.ProductTypes.find(t => uuidKey(t.ID) === key);
  }

  /** Does the product's type require physical fulfillment (F1.6 / UPD-3)? False when unknown. */
  public RequiresFulfillment(productID: string): boolean {
    const typeID = this.ProductByID(productID)?.ProductTypeID;
    return typeID ? (this.ProductTypeByID(typeID)?.RequiresFulfillment ?? false) : false;
  }

  /** The payment terms' net-days (F1.4 DueDate derivation); null when no/unknown terms. */
  public NetDaysForTerms(termsTypeID: string | null | undefined): number | null {
    if (!termsTypeID) return null;
    const key = uuidKey(termsTypeID);
    return this.PaymentTermsTypes.find(t => uuidKey(t.ID) === key)?.NetDays ?? null;
  }

  // ─── pricing (F9) ──────────────────────────────────────────────────────────
  public get ProductPrices(): mjBizAppsOrdersProductPriceEntity[] {
    return this.GetConfigData<mjBizAppsOrdersProductPriceEntity>('_productPrices');
  }
  public get PriceTiers(): mjBizAppsOrdersPriceTierEntity[] {
    return this.GetConfigData<mjBizAppsOrdersPriceTierEntity>('_priceTiers');
  }
  public get PriceLists(): mjBizAppsOrdersPriceListEntity[] {
    return this.GetConfigData<mjBizAppsOrdersPriceListEntity>('_priceLists');
  }

  /**
   * Resolve a suggested unit price for (product, qty, date) per the F9 precedence (BO-D33). Returns
   * `{ Amount: null, Source: 'DirectEntry' }` when no rule applies — the caller keeps the typed
   * UnitPrice. Never blocks. Delegates the selection to the pure `resolveProductPrice`.
   */
  public ResolvePrice(productID: string, quantity: number, asOfDate: Date, priceListID?: string | null): ResolvePriceResult {
    const key = uuidKey(productID);
    const productPrices = this.ProductPrices.filter(p => uuidKey(p.ProductID) === key).map(p => ({
      ID: p.ID,
      PriceListID: p.PriceListID,
      PricingModel: p.PricingModel,
      Amount: p.Amount,
      MinQuantity: p.MinQuantity,
      MaxQuantity: p.MaxQuantity,
      EffectiveFrom: p.EffectiveFrom,
      EffectiveTo: p.EffectiveTo,
    }));
    const ppKeys = new Set(productPrices.map(p => uuidKey(p.ID)));
    const priceTiers = this.PriceTiers.filter(t => ppKeys.has(uuidKey(t.ProductPriceID))).map(t => ({
      ProductPriceID: t.ProductPriceID,
      MinQuantity: t.MinQuantity,
      MaxQuantity: t.MaxQuantity,
      Amount: t.Amount,
      SortOrder: t.SortOrder,
    }));
    const priceLists = this.PriceLists.map(l => ({ ID: l.ID, IsActive: l.IsActive, EffectiveFrom: l.EffectiveFrom, EffectiveTo: l.EffectiveTo }));
    return resolveProductPrice({ Quantity: quantity, AsOfDate: asOfDate, PriceListID: priceListID ?? null, ProductPrices: productPrices, PriceTiers: priceTiers, PriceLists: priceLists });
  }

  // ─── account resolution ────────────────────────────────────────────────────

  /** __mj.Entity ID for an entity name, memoized (metadata is process-stable). */
  private entityId(entityName: string): string | undefined {
    const cached = this._entityIdCache.get(entityName);
    if (cached) return cached;
    const id = new Metadata().EntityByName(entityName)?.ID;
    if (id) this._entityIdCache.set(entityName, id);
    return id;
  }

  /** Turn a resolved link into {account, company}; null if the account is not in cache. */
  private accountFromLink(glAccountID: string): ResolvedAccount | null {
    const companyID = AccountingEngineBase.Instance.GLAccountByID(glAccountID)?.CompanyID;
    return companyID ? { GLAccountID: glAccountID, CompanyID: companyID } : null;
  }

  /** The company-default account for a role — the final fallback hop and the AR resolver. */
  public ResolveCompanyAccount(companyID: string, role: string, asOfDate: Date): ResolvedAccount | null {
    const entityId = this.entityId(COMPANIES_ENTITY);
    if (!entityId) return null;
    const hit = AccountingEngineBase.Instance.ResolveLinkedAccount(entityId, companyID, role, asOfDate);
    return hit ? this.accountFromLink(hit.Link.GLAccountID) : null;
  }

  /** Walk product link → up the category tree → (optional) company default. First hit wins. */
  public ResolveAccount(
    productID: string,
    role: string,
    asOfDate: Date,
    fallbackCompanyID?: string
  ): ResolvedAccount | null {
    const aeb = AccountingEngineBase.Instance;
    const productsEntityId = this.entityId(PRODUCTS_ENTITY);
    const productHit = productsEntityId && aeb.ResolveLinkedAccount(productsEntityId, productID, role, asOfDate);
    if (productHit) return this.accountFromLink(productHit.Link.GLAccountID);

    const categoryHit = this.resolveUpCategoryTree(productID, role, asOfDate);
    if (categoryHit) return categoryHit;

    if (fallbackCompanyID) return this.ResolveCompanyAccount(fallbackCompanyID, role, asOfDate);
    return null;
  }

  /** Walk the product's category chain upward; first Active link in the role wins. */
  private resolveUpCategoryTree(productID: string, role: string, asOfDate: Date): ResolvedAccount | null {
    const catsEntityId = this.entityId(PRODUCT_CATEGORIES_ENTITY);
    if (!catsEntityId) return null;
    const aeb = AccountingEngineBase.Instance;
    const seen = new Set<string>();
    let categoryID = this.ProductByID(productID)?.ProductCategoryID ?? null;
    while (categoryID && !seen.has(uuidKey(categoryID))) {
      seen.add(uuidKey(categoryID));
      const hit = aeb.ResolveLinkedAccount(catsEntityId, categoryID, role, asOfDate);
      if (hit) return this.accountFromLink(hit.Link.GLAccountID);
      categoryID = this.ProductCategoryByID(categoryID)?.ParentID ?? null;
    }
    return null;
  }

  /**
   * The revenue role a product books to, from its recognition type.
   *
   * PUBLIC because the Products catalog (§13.3) shows "where will this book, and does it resolve?"
   * BEFORE an order is confirmed — and it must ask the same question booking asks. A UI copy of
   * `Deferred ? 'Deferred Revenue' : 'Sales'` would be a second definition of the rule, free to
   * drift from the one the ledger actually uses, which would make the catalog's tripwire lie in
   * exactly the case it exists to catch.
   */
  public RevenueRoleFor(product: mjBizAppsOrdersProductEntity): string {
    return product.RevenueRecognitionType === 'Deferred' ? ROLE_DEFERRED_REVENUE : ROLE_SALES;
  }

  // ─── order → draft ───────────────────────────────────────────────────────────

  /**
   * Resolve every line's revenue account and each involved company's AR account, then assemble the
   * balanced order-booking drafts — ONE PER COMPANY (MOD-11; accounting MOD-12 rejects mixed
   * drafts). Returns typed resolution errors instead of throwing — the caller reservoirs them so
   * a booking failure never silently vanishes.
   */
  public buildDraftsForOrder(
    order: mjBizAppsOrdersOrderEntity,
    lines: mjBizAppsOrdersOrderLineEntity[]
  ): OrderDraftBuildResult {
    const asOfDate = order.OrderDate ?? new Date();
    const errors: string[] = [];
    const resolvedLines = this.resolveRevenueLines(lines, asOfDate, errors);
    const arByCompany = this.resolveArAccounts(resolvedLines, asOfDate, errors);
    if (errors.length > 0) return { Errors: errors };
    const drafts = buildOrderJournalDrafts({
      Lines: resolvedLines,
      ArAccountByCompany: arByCompany,
      Context: {
        EffectiveDate: toISODate(asOfDate),
        EntryType: 'OrderBooking',
        OrderID: order.ID,
        CounterpartyOrganizationID: order.CustomerOrganizationID ?? undefined,
        Description: `Order ${order.OrderNumber}`,
      },
    });
    return { Drafts: drafts, Errors: [] };
  }

  /**
   * Resolve each line's revenue account by the FULL hierarchy: product → category chain → the
   * product's owning company. Collects errors, never throws.
   *
   * ⚠ The company tier was previously dead here: this called `ResolveAccount(productID, role,
   * asOfDate)` — three args — while the fallback company is the optional FOURTH. So booking was
   * really "product → category → fail", and the company defaults every deployment is seeded with
   * were never consulted. The Catalog's "will it book?" tripwire DID pass the fallback, so the
   * screen was strictly more optimistic than booking: a product could read as resolved and still
   * fail at Confirm. Same engine method, different arguments — the worst kind of divergence,
   * because it looks shared. (Marcelo 2026-07-16: "the front end is supposed to be kind of a thin
   * wrapper when it comes to mirroring server functionality.")
   *
   * NOTE the company tier is only reachable for a product that HAS an OwningCompanyID (it is
   * nullable). A company-less product still resolves by product/category link only — which is
   * correct today, because the company is currently derived FROM the resolved account
   * (see `accountFromLink`). That derivation is itself under review: deriving the company from the
   * account inverts cause and effect, and it collapses companies that share books via
   * `ParentAccountingCompanyID`. See plans/QUESTIONS.md + plans/BACKLOG.md (account-vs-role links).
   */
  private resolveRevenueLines(
    lines: mjBizAppsOrdersOrderLineEntity[],
    asOfDate: Date,
    errors: string[]
  ): ResolvedOrderLine[] {
    const resolved: ResolvedOrderLine[] = [];
    lines.forEach((line, index) => {
      const product = this.ProductByID(line.ProductID);
      if (!product) {
        errors.push(`Line ${index}: unknown product ${line.ProductID}.`);
        return;
      }
      const role = this.RevenueRoleFor(product);
      // The 4th argument is the fix: the product's owning company is the last tier of the
      // documented hierarchy (product → category → company). Omitting it silently skipped it.
      const account = this.ResolveAccount(line.ProductID, role, asOfDate, product.OwningCompanyID ?? undefined);
      if (!account) {
        errors.push(`Line ${index}: no "${role}" account resolved for product "${product.Name}".`);
        return;
      }
      resolved.push({
        LineIndex: index,
        OrderLineID: line.ID,
        // Book revenue NET of trade discount (F1); tax is separate (S4, deferred). AR = revenue in v1.
        Amount: computeLineNet(Number(line.Quantity), Number(line.UnitPrice), line.DiscountPct),
        RevenueAccountID: account.GLAccountID,
        CompanyID: account.CompanyID,
        Description: line.Description ?? undefined,
      });
    });
    return resolved;
  }

  /** Resolve the AR account for each distinct company the revenue lines touched. */
  private resolveArAccounts(
    resolvedLines: ResolvedOrderLine[],
    asOfDate: Date,
    errors: string[]
  ): Map<string, string> {
    const arByCompany = new Map<string, string>();
    for (const companyID of new Set(resolvedLines.map(l => l.CompanyID))) {
      const ar = this.ResolveCompanyAccount(companyID, ROLE_ACCOUNTS_RECEIVABLE, asOfDate);
      if (!ar) {
        errors.push(`No "${ROLE_ACCOUNTS_RECEIVABLE}" account resolved for company ${companyID}.`);
        continue;
      }
      arByCompany.set(companyID, ar.GLAccountID);
    }
    return arByCompany;
  }
}

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();
const toISODate = (d: Date): string => new Date(d).toISOString().slice(0, 10);
