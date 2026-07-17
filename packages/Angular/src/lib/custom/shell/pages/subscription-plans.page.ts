import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NormalizeUUID } from '@memberjunction/global';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersSubscriptionPlanEntity } from '@mj-biz-apps/orders-entities';

const SUBSCRIPTION_PLAN_ENTITY = 'MJ_BizApps_Orders: Subscription Plans';

/** Value-list union DERIVED from the entity — never hand-copied (it widens when the CHECK grows). */
export type BillingCycle = mjBizAppsOrdersSubscriptionPlanEntity['BillingCycle'];

/** One roster row: the plan's own fields plus the product it sells (a plan is meaningless without it). */
export interface SubscriptionPlanRow {
  ID: string;
  Name: string;
  ProductID: string;
  Product: string;
  BillingCycle: BillingCycle;
  CustomCycleDays: number | null;
  PricePerCycle: number | null;
  TrialDays: number;
  IsActive: boolean;
}

/** A product a plan can be attached to. `ProductID` is NOT NULL, so one must be picked. */
export interface ProductOption {
  ID: string;
  Name: string;
}

/** The editable shape. Mirrors every writable field on the entity — nothing invented. */
export interface SubscriptionPlanDraft {
  /** null ⇒ a new plan. */
  ID: string | null;
  Name: string;
  ProductID: string;
  BillingCycle: BillingCycle;
  /** Empty ⇒ NULL. Only meaningful when BillingCycle = Custom. */
  CustomCycleDays: number | null;
  /** Empty ⇒ NULL, which means "derive from the product/pricing engine" — NOT "free". */
  PricePerCycle: number | null;
  TrialDays: number;
  IsActive: boolean;
}

export type ActiveFilter = 'all' | 'active' | 'inactive';
export type SortKey = 'name' | 'product' | 'cycle';

/**
 * Products → Subscription plans — the CRUD roster for `MJ_BizApps_Orders: Subscription Plans`.
 *
 * A plan is how a product is *sold over time*: cycle, price per cycle, trial. The rows already
 * existed (`Subscription.SubscriptionPlanID` points at them) with no screen to create one, so a
 * recurring product could not be given terms without touching the database.
 *
 * Two fields carry meaning that is easy to get backwards, so the editor states it inline:
 * `PricePerCycle = NULL` means **derive from the product/pricing engine**, not "free"; and
 * `CustomCycleDays` is only consulted when `BillingCycle = Custom`.
 *
 * **No usage count — deliberately.** Plans are referenced by Subscriptions, an unbounded
 * transactional table no engine caches. Counting them means reading the whole table, and a
 * `MaxRows`-truncated read prints a number that is quietly WRONG. Skipped rather than faked.
 *
 * **No delete — deliberately, mirroring product-types.page.ts.** `Subscription.SubscriptionPlanID`
 * is a real FK: deleting a referenced plan fails at the database with an opaque constraint error,
 * and even an unreferenced plan is a contract other rows resolve their billing terms through.
 * Retirement via `IsActive` is the right verb — an inactive plan stops being sellable while every
 * live subscription keeps billing on the terms it was sold.
 */
@Component({
  standalone: false,
  selector: 'mj-subscription-plans-page',
  templateUrl: './subscription-plans.page.html',
  styleUrls: ['./subscription-plans.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionPlansPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: SubscriptionPlanRow[] = [];
  public Products: ProductOption[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  /** Search matches Name AND ID (and product) — the ID is a first-class handle, not just a key. */
  public Search = '';
  public Filter: ActiveFilter = 'all';
  public Sort: SortKey = 'name';

  public Draft: SubscriptionPlanDraft | null = null;
  public IsSaving = false;
  public SaveError: string | null = null;

  /** Options for the cycle dropdown, kept beside the derived union above. */
  public readonly BillingCycleOptions: ReadonlyArray<BillingCycle> = ['Monthly', 'Quarterly', 'Annual', 'Custom'];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }

  public Refresh(): void {
    void this.load();
  }

  /**
   * ONE extra read for the plans; the product picker comes free from the engine's catalog cache.
   * Never a read per row.
   */
  private async load(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(forceRefresh, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.Products = engine.Products.map((p) => ({ ID: p.ID, Name: p.Name })).sort((a, b) => a.Name.localeCompare(b.Name));

      const rv = new RunView();
      const plans = await rv.RunView<SubscriptionPlanRow>(
        {
          EntityName: SUBSCRIPTION_PLAN_ENTITY,
          Fields: ['ID', 'Name', 'ProductID', 'Product', 'BillingCycle', 'CustomCycleDays', 'PricePerCycle', 'TrialDays', 'IsActive'],
          OrderBy: 'Name',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      // RunView does NOT throw — it reports failure on the result object.
      if (!plans.Success) throw new Error(plans.ErrorMessage || 'Subscription plans could not be loaded.');
      this.Rows = plans.Results ?? [];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ─── roster view ─────────────────────────────────────────────────────────────

  /** Filter → search → sort. Recomputed per change-detection pass; the set is dozens of rows. */
  public get VisibleRows(): SubscriptionPlanRow[] {
    const term = this.Search.trim().toLowerCase();
    const rows = this.Rows.filter((r) => this.matchesFilter(r) && this.matchesSearch(r, term));
    return rows.sort((a, b) => this.compare(a, b));
  }

  private matchesFilter(row: SubscriptionPlanRow): boolean {
    if (this.Filter === 'active') return row.IsActive;
    if (this.Filter === 'inactive') return !row.IsActive;
    return true;
  }

  /** Name AND ID (this entity has no Code), plus the product the plan sells. */
  private matchesSearch(row: SubscriptionPlanRow, term: string): boolean {
    if (!term) return true;
    return (
      row.Name.toLowerCase().includes(term) ||
      row.ID.toLowerCase().includes(term) ||
      (row.Product?.toLowerCase().includes(term) ?? false)
    );
  }

  private compare(a: SubscriptionPlanRow, b: SubscriptionPlanRow): number {
    if (this.Sort === 'product') return (a.Product ?? '').localeCompare(b.Product ?? '') || a.Name.localeCompare(b.Name);
    if (this.Sort === 'cycle') return a.BillingCycle.localeCompare(b.BillingCycle) || a.Name.localeCompare(b.Name);
    return a.Name.localeCompare(b.Name);
  }

  public get ActiveCount(): number {
    return this.Rows.filter((r) => r.IsActive).length;
  }

  /** "Every 45 days" reads; "Custom" does not. */
  public CycleLabel(row: SubscriptionPlanRow): string {
    if (row.BillingCycle !== 'Custom') return row.BillingCycle;
    return row.CustomCycleDays ? `Custom — every ${row.CustomCycleDays} days` : 'Custom — days not set';
  }

  // ─── editor ──────────────────────────────────────────────────────────────────

  public New(): void {
    this.SaveError = null;
    this.Draft = {
      ID: null,
      Name: '',
      ProductID: this.Products[0]?.ID ?? '',
      BillingCycle: 'Monthly',
      CustomCycleDays: null,
      PricePerCycle: null,
      TrialDays: 0,
      IsActive: true,
    };
    this.cdr.markForCheck();
  }

  /** The roster row carries every field the editor writes, so no re-read is needed to open it. */
  public Edit(row: SubscriptionPlanRow): void {
    this.SaveError = null;
    this.Draft = {
      ID: row.ID,
      Name: row.Name,
      ProductID: row.ProductID,
      BillingCycle: row.BillingCycle,
      CustomCycleDays: row.CustomCycleDays,
      PricePerCycle: row.PricePerCycle,
      TrialDays: row.TrialDays,
      IsActive: row.IsActive,
    };
    this.cdr.markForCheck();
  }

  public Cancel(): void {
    this.Draft = null;
    this.SaveError = null;
    this.cdr.markForCheck();
  }

  /** A Custom cycle without a day count is not a cycle — the DB would take it; a biller could not. */
  public get NeedsCustomCycleDays(): boolean {
    const d = this.Draft;
    return !!d && d.BillingCycle === 'Custom' && !(Number(d.CustomCycleDays) > 0);
  }

  /** Name and ProductID are both NOT NULL on the table. */
  public get CanSave(): boolean {
    const d = this.Draft;
    if (!d || this.IsSaving) return false;
    return d.Name.trim().length > 0 && d.ProductID.trim().length > 0 && !this.NeedsCustomCycleDays;
  }

  /** The picked product's display name, for the "what am I editing" line in the dialog. */
  public get DraftProductName(): string {
    const id = this.Draft?.ProductID;
    if (!id) return '';
    const key = NormalizeUUID(id);
    return this.Products.find((p) => NormalizeUUID(p.ID) === key)?.Name ?? '';
  }

  public async Save(): Promise<void> {
    const d = this.Draft;
    if (!d || !this.CanSave) return;

    this.IsSaving = true;
    this.SaveError = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const p = await md.GetEntityObject<mjBizAppsOrdersSubscriptionPlanEntity>(
        SUBSCRIPTION_PLAN_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (d.ID) {
        if (!(await p.Load(d.ID))) throw new Error(`Subscription plan ${d.ID} could not be loaded.`);
      } else {
        p.NewRecord();
      }
      this.applyDraft(p, d);

      // Save() returns a BOOLEAN and does not throw on a logical failure — ignoring it is the
      // classic silent-failure bug, so surface the entity's own message.
      if (!(await p.Save())) {
        throw new Error(p.LatestResult?.CompleteMessage ?? 'The subscription plan could not be saved.');
      }

      this.Draft = null;
      await this.load();
    } catch (e) {
      this.SaveError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Typed generated properties only — never .Get()/.Set(). A non-Custom cycle drops any stray
   * CustomCycleDays: leaving it behind would be a value the biller ignores but a reader believes.
   */
  private applyDraft(p: mjBizAppsOrdersSubscriptionPlanEntity, d: SubscriptionPlanDraft): void {
    p.Name = d.Name.trim();
    p.ProductID = d.ProductID;
    p.BillingCycle = d.BillingCycle;
    p.CustomCycleDays = d.BillingCycle === 'Custom' ? Number(d.CustomCycleDays) : null;
    p.PricePerCycle = this.toNullableNumber(d.PricePerCycle);
    p.TrialDays = Number(d.TrialDays) || 0;
    p.IsActive = d.IsActive;
  }

  /** Blank ⇒ NULL ("derive from pricing"), never 0 ("free") — the two mean opposite things here. */
  private toNullableNumber(value: number | null): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
