import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersProductTypeEntity } from '@mj-biz-apps/orders-entities';

const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

/** Value-list unions DERIVED from the entity — never hand-copied (they widen when a CHECK grows). */
export type RevenueRecognitionType = mjBizAppsOrdersProductTypeEntity['DefaultRevenueRecognitionType'];
export type SubscriptionType = mjBizAppsOrdersProductTypeEntity['DefaultSubscriptionType'];

/** One roster row: the type's own fields plus the count that says whether it is safe to retire. */
export interface ProductTypeRow {
  ID: string;
  Name: string;
  Code: string | null;
  BehaviorClass: string | null;
  IsActive: boolean;
  /** How many products reference this type. Non-zero ⇒ retiring it would strand them. */
  ProductCount: number;
}

/** The editable shape. Mirrors every writable field on the entity — nothing invented. */
export interface ProductTypeDraft {
  /** null ⇒ a new type. */
  ID: string | null;
  Name: string;
  Code: string;
  Description: string;
  RequiresFulfillment: boolean;
  DefaultRevenueRecognitionType: RevenueRecognitionType;
  DefaultIsTaxable: boolean;
  IsBillableRecurring: boolean;
  DefaultSubscriptionType: SubscriptionType;
  ProductExtensionEntity: string;
  OrderLineExtensionEntity: string;
  BehaviorClass: string;
  IsActive: boolean;
}

export type ActiveFilter = 'all' | 'active' | 'inactive';
export type SortKey = 'name' | 'code' | 'products';

/**
 * Products → Types — the CRUD roster for `MJ_BizApps_Orders: Product Types`.
 *
 * This page exists because **`Product.ProductTypeID` is NON-NULLABLE**: a product cannot be created
 * without a type, and until now there was no screen that created one. "New product" was therefore a
 * dead end for any organization whose catalog needed a type the seed data didn't ship.
 *
 * The **product count** column is the point of the roster, not decoration: a type with products
 * behind it cannot be retired without stranding them, so the count is what an admin reads before
 * touching the active flag.
 *
 * **No delete — deliberately (rule 12).** `Product.ProductTypeID` is a non-nullable FK, so deleting
 * a referenced type fails at the database with an opaque constraint error, and deleting an
 * *unreferenced* one is still a trapdoor: a type is a stable machine contract (its `Code`, its
 * `BehaviorClass` ClassFactory key, its extension-entity names) that migrations and behavior
 * plugins refer to by name. Retiring is what an admin actually wants, and `IsActive` already does
 * it — an inactive type stops being selectable while every existing product keeps resolving its
 * behavior. So this page offers the flag and not the trapdoor.
 */
@Component({
  standalone: false,
  selector: 'mj-product-types-page',
  templateUrl: './product-types.page.html',
  styleUrls: ['./shell-table.css', './product-types.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTypesPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: ProductTypeRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  /** Search matches Name AND ID — the ID is a first-class handle, not just an internal key. */
  public Search = '';
  public Filter: ActiveFilter = 'all';
  public Sort: SortKey = 'name';

  private draftValue: ProductTypeDraft | null = null;
  /** JSON of the draft as it was OPENED — `IsDirty` is this vs. the live object. */
  private draftBaseline = '';
  /**
   * The editor's working copy. Assigning one snapshots it, so dirty-tracking cannot be forgotten at
   * a new call site — `ngModel` mutates this object's fields, it never reassigns the draft.
   */
  public get Draft(): ProductTypeDraft | null {
    return this.draftValue;
  }
  public set Draft(value: ProductTypeDraft | null) {
    this.draftValue = value;
    this.draftBaseline = value === null ? '' : JSON.stringify(value);
  }
  /** True when the open editor holds unsaved edits — what gates the dismiss confirm. */
  public get IsDirty(): boolean {
    return this.draftValue !== null && JSON.stringify(this.draftValue) !== this.draftBaseline;
  }
  public IsSaving = false;
  public SaveError: string | null = null;

  /** Value lists for the editor's dropdowns, kept beside the derived unions above. */
  public readonly RecognitionOptions: ReadonlyArray<Exclude<RevenueRecognitionType, null>> = ['Immediate', 'Deferred'];
  public readonly SubscriptionOptions: ReadonlyArray<SubscriptionType> = ['None', 'Standard', 'Membership'];

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

  private async load(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(forceRefresh, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.Rows = this.buildRows(engine);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Count products per type once (Map keyed on a NORMALIZED UUID), then project the rows. */
  private buildRows(engine: OrdersEngineBase): ProductTypeRow[] {
    const counts = new Map<string, number>();
    for (const p of engine.Products) {
      const key = NormalizeUUID(p.ProductTypeID);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return engine.ProductTypes.map((t) => ({
      ID: t.ID,
      Name: t.Name,
      Code: t.Code,
      BehaviorClass: t.BehaviorClass,
      IsActive: t.IsActive,
      ProductCount: counts.get(NormalizeUUID(t.ID)) ?? 0,
    }));
  }

  // ─── roster view ─────────────────────────────────────────────────────────────

  /** Filter → search → sort. Recomputed per change-detection pass; the set is dozens of rows. */
  public get VisibleRows(): ProductTypeRow[] {
    const term = this.Search.trim().toLowerCase();
    const rows = this.Rows.filter((r) => this.matchesFilter(r) && this.matchesSearch(r, term));
    return rows.sort((a, b) => this.compare(a, b));
  }

  private matchesFilter(row: ProductTypeRow): boolean {
    if (this.Filter === 'active') return row.IsActive;
    if (this.Filter === 'inactive') return !row.IsActive;
    return true;
  }

  /** Name AND ID (and code, which is the machine name of the same thing). */
  private matchesSearch(row: ProductTypeRow, term: string): boolean {
    if (!term) return true;
    return (
      row.Name.toLowerCase().includes(term) ||
      row.ID.toLowerCase().includes(term) ||
      (row.Code?.toLowerCase().includes(term) ?? false)
    );
  }

  private compare(a: ProductTypeRow, b: ProductTypeRow): number {
    if (this.Sort === 'products') return b.ProductCount - a.ProductCount || a.Name.localeCompare(b.Name);
    if (this.Sort === 'code') return (a.Code ?? '').localeCompare(b.Code ?? '') || a.Name.localeCompare(b.Name);
    return a.Name.localeCompare(b.Name);
  }

  public get InUseCount(): number {
    return this.Rows.filter((r) => r.ProductCount > 0).length;
  }

  // ─── editor ──────────────────────────────────────────────────────────────────

  public New(): void {
    this.SaveError = null;
    this.Draft = {
      ID: null,
      Name: '',
      Code: '',
      Description: '',
      RequiresFulfillment: false,
      DefaultRevenueRecognitionType: 'Immediate',
      DefaultIsTaxable: true,
      IsBillableRecurring: false,
      DefaultSubscriptionType: 'None',
      ProductExtensionEntity: '',
      OrderLineExtensionEntity: '',
      BehaviorClass: '',
      IsActive: true,
    };
    this.cdr.markForCheck();
  }

  public Edit(row: ProductTypeRow): void {
    this.SaveError = null;
    // UUIDsEqual, never === : SQL Server hands UUIDs back uppercase and === silently matches nothing.
    const t = OrdersEngineBase.Instance.ProductTypes.find((x) => UUIDsEqual(x.ID, row.ID));
    if (!t) {
      this.SaveError = `Product type "${row.Name}" is no longer loaded — refresh and try again.`;
      this.cdr.markForCheck();
      return;
    }
    this.Draft = {
      ID: t.ID,
      Name: t.Name,
      Code: t.Code ?? '',
      Description: t.Description ?? '',
      RequiresFulfillment: t.RequiresFulfillment,
      DefaultRevenueRecognitionType: t.DefaultRevenueRecognitionType,
      DefaultIsTaxable: t.DefaultIsTaxable,
      IsBillableRecurring: t.IsBillableRecurring,
      DefaultSubscriptionType: t.DefaultSubscriptionType,
      ProductExtensionEntity: t.ProductExtensionEntity ?? '',
      OrderLineExtensionEntity: t.OrderLineExtensionEntity ?? '',
      BehaviorClass: t.BehaviorClass ?? '',
      IsActive: t.IsActive,
    };
    this.cdr.markForCheck();
  }

  public Cancel(): void {
    this.Draft = null;
    this.SaveError = null;
    this.cdr.markForCheck();
  }

  public get CanSave(): boolean {
    return !!this.Draft && this.Draft.Name.trim().length > 0 && !this.IsSaving;
  }

  /** The count behind the type being edited — an admin deactivating needs it in front of them. */
  public get DraftProductCount(): number {
    const id = this.Draft?.ID;
    if (!id) return 0;
    return this.Rows.find((r) => UUIDsEqual(r.ID, id))?.ProductCount ?? 0;
  }

  public async Save(): Promise<void> {
    const d = this.Draft;
    if (!d || !this.CanSave) return;

    this.IsSaving = true;
    this.SaveError = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const t = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(
        PRODUCT_TYPE_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (d.ID) {
        if (!(await t.Load(d.ID))) throw new Error(`Product type ${d.ID} could not be loaded.`);
      } else {
        t.NewRecord();
      }
      this.applyDraft(t, d);

      // Save() returns a BOOLEAN and does not throw on a logical failure — ignoring it is the
      // classic silent-failure bug, so surface the entity's own message.
      if (!(await t.Save())) {
        throw new Error(t.LatestResult?.CompleteMessage ?? 'The product type could not be saved.');
      }

      this.Draft = null;
      await this.load(true);
    } catch (e) {
      this.SaveError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  /** Typed generated properties only — never .Get()/.Set(). Blank text ⇒ NULL, not ''. */
  private applyDraft(t: mjBizAppsOrdersProductTypeEntity, d: ProductTypeDraft): void {
    t.Name = d.Name.trim();
    t.Code = d.Code.trim() || null;
    t.Description = d.Description.trim() || null;
    t.RequiresFulfillment = d.RequiresFulfillment;
    t.DefaultRevenueRecognitionType = d.DefaultRevenueRecognitionType;
    t.DefaultIsTaxable = d.DefaultIsTaxable;
    t.IsBillableRecurring = d.IsBillableRecurring;
    t.DefaultSubscriptionType = d.DefaultSubscriptionType;
    t.ProductExtensionEntity = d.ProductExtensionEntity.trim() || null;
    t.OrderLineExtensionEntity = d.OrderLineExtensionEntity.trim() || null;
    t.BehaviorClass = d.BehaviorClass.trim() || null;
    t.IsActive = d.IsActive;
  }
}
