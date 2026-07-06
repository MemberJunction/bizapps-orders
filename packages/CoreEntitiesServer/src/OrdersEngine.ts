/**
 * OrdersEngine — the Orders catalog cache + GL-account resolver (plan/amendment §4).
 *
 * A BaseEngine cache over the product catalog (types, categories, products). Its job for the
 * accounting integration is `ResolveAccount`: given a product + a role (Sales / Deferred Revenue),
 * walk product → up the category tree → (optionally) the company default, resolving each hop
 * through accounting's polymorphic GLAccountLink via `AccountingEngineBase.ResolveLinkedAccount`.
 * `buildDraftForOrder` then turns a Confirmed order into the balanced JournalEntryDraft the
 * `Accounting.CreateJournalEntry` operation consumes (Dr AR per company / Cr revenue per line).
 *
 * The pure Dr/Cr assembly lives in orderJournalDraft.ts (offline-unit-tested). This engine adds
 * the DB-backed resolution the assembly needs.
 *
 * ⚠ v1 resolution model (documented; company-context for revenue is OQ-I with Robert): REVENUE
 * accounts resolve via product OR category links — both carry their own company via the resolved
 * GLAccount.CompanyID, so the order needs no CompanyID (S5). AR is company-level: once revenue
 * resolution establishes each company, its AR account resolves via the company-default link. A
 * company-level REVENUE default (Amith's Izzy example) is reachable only when a company context is
 * supplied to ResolveAccount — for a bare order it is not, so every product must reach a revenue
 * link at the product or category level in v1.
 *
 * CONNECTS TO:
 *   ACCOUNTING: @mj-biz-apps/accounting-engine-base (AccountingEngineBase.ResolveLinkedAccount, GLAccountByID)
 *   PURE:       ./orderJournalDraft (buildOrderJournalDraft)
 *   CALLER:     OrderEntityServer (books the JE on first Confirmed)
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
  mjBizAppsOrdersProductCategoryEntity,
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { buildOrderJournalDraft, type ResolvedOrderLine } from './orderJournalDraft.js';

const PRODUCT_TYPES_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_CATEGORIES_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCTS_ENTITY = 'MJ_BizApps_Orders: Products';
const COMPANIES_ENTITY = 'MJ: Companies';

const ROLE_ACCOUNTS_RECEIVABLE = 'Accounts Receivable';
const ROLE_SALES = 'Sales';
const ROLE_DEFERRED_REVENUE = 'Deferred Revenue';

/** A resolved GL account: its ID and (from the account) the company it belongs to. */
export interface ResolvedAccount {
  GLAccountID: string;
  CompanyID: string;
}

/** Outcome of turning an order into a draft: the draft, or the resolution errors that blocked it. */
export interface OrderDraftBuildResult {
  Draft?: JournalEntryDraft;
  Errors: string[];
}

@RegisterForStartup()
export class OrdersEngine extends BaseEngine<OrdersEngine> {
  private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];
  private _productCategories: mjBizAppsOrdersProductCategoryEntity[] = [];
  private _products: mjBizAppsOrdersProductEntity[] = [];
  private _entityIdCache = new Map<string, string>();

  public static get Instance(): OrdersEngine {
    return super.getInstance<OrdersEngine>();
  }

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const params: Array<Partial<BaseEnginePropertyConfig>> = [
      { PropertyName: '_productTypes', EntityName: PRODUCT_TYPES_ENTITY },
      { PropertyName: '_productCategories', EntityName: PRODUCT_CATEGORIES_ENTITY },
      { PropertyName: '_products', EntityName: PRODUCTS_ENTITY },
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

  public ProductByID(id: string): mjBizAppsOrdersProductEntity | undefined {
    const key = uuidKey(id);
    return this.Products.find(p => uuidKey(p.ID) === key);
  }
  public ProductCategoryByID(id: string): mjBizAppsOrdersProductCategoryEntity | undefined {
    const key = uuidKey(id);
    return this.ProductCategories.find(c => uuidKey(c.ID) === key);
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

  /** The revenue role a product books to, from its recognition type. */
  private revenueRole(product: mjBizAppsOrdersProductEntity): string {
    return product.RevenueRecognitionType === 'Deferred' ? ROLE_DEFERRED_REVENUE : ROLE_SALES;
  }

  // ─── order → draft ───────────────────────────────────────────────────────────

  /**
   * Resolve every line's revenue account and each involved company's AR account, then assemble the
   * balanced order-booking draft. Returns typed resolution errors instead of throwing — the caller
   * reservoirs them so a booking failure never silently vanishes.
   */
  public buildDraftForOrder(
    order: mjBizAppsOrdersOrderEntity,
    lines: mjBizAppsOrdersOrderLineEntity[]
  ): OrderDraftBuildResult {
    const asOfDate = order.OrderDate ?? new Date();
    const errors: string[] = [];
    const resolvedLines = this.resolveRevenueLines(lines, asOfDate, errors);
    const arByCompany = this.resolveArAccounts(resolvedLines, asOfDate, errors);
    if (errors.length > 0) return { Errors: errors };
    const draft = buildOrderJournalDraft({
      Lines: resolvedLines,
      ArAccountByCompany: arByCompany,
      Context: {
        EffectiveDate: toISODate(asOfDate),
        EntryType: 'OrderBooking',
        OrderID: order.ID,
        Description: `Order ${order.OrderNumber}`,
      },
    });
    return { Draft: draft, Errors: [] };
  }

  /** Resolve each line's revenue account (product → category). Collects errors, never throws. */
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
      const role = this.revenueRole(product);
      const account = this.ResolveAccount(line.ProductID, role, asOfDate);
      if (!account) {
        errors.push(`Line ${index}: no "${role}" account resolved for product "${product.Name}".`);
        return;
      }
      resolved.push({
        LineIndex: index,
        OrderLineID: line.ID,
        Amount: Number(line.Quantity) * Number(line.UnitPrice),
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
