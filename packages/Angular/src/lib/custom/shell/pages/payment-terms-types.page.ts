import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersPaymentTermsTypeEntity } from '@mj-biz-apps/orders-entities';

const PAYMENT_TERMS_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Terms Types';

/** One roster row. The type's own fields — this entity has no value-list column. */
export interface PaymentTermsTypeRow {
  ID: string;
  Name: string;
  Code: string;
  NetDays: number;
  Description: string | null;
  IsActive: boolean;
}

/** The editable shape. Mirrors every writable field on the entity — nothing invented. */
export interface PaymentTermsTypeDraft {
  /** null ⇒ a new terms type. */
  ID: string | null;
  Name: string;
  Code: string;
  NetDays: number;
  Description: string;
  IsActive: boolean;
}

export type ActiveFilter = 'all' | 'active' | 'inactive';
export type SortKey = 'name' | 'code' | 'netdays';

/**
 * Payments → Terms types — the CRUD roster for `MJ_BizApps_Orders: Payment Terms Types`.
 *
 * These rows already exist in the schema (`Order.PaymentTermsTypeID` points at them) but had no
 * management screen: an organization needing terms the seed data didn't ship had no way to create
 * them. `NetDays` is the operative field — it is what turns a posting date into a `DueDate`, so it
 * is the whole reason a terms type exists.
 *
 * **No usage count — deliberately.** The only thing that references a terms type is `Order`, an
 * unbounded transactional table that no engine caches. Counting would mean reading the whole Orders
 * table, and a `MaxRows`-truncated read would print a number that is quietly WRONG — worse than no
 * number at all. Skipped rather than faked.
 *
 * **No delete — deliberately, mirroring product-types.page.ts.** `Order.PaymentTermsTypeID` is a
 * real FK (nullable, but enforced): deleting a referenced terms type fails at the database with an
 * opaque constraint error. Deleting an *unreferenced* one is still a trapdoor — `Code` is a stable
 * machine contract that migrations and integrations refer to by name. Retirement is what an admin
 * actually wants, and `IsActive` already does it: inactive terms stop being selectable while every
 * existing order keeps resolving its due date. So this page offers the flag, not the trapdoor.
 */
@Component({
  standalone: false,
  selector: 'mj-payment-terms-types-page',
  templateUrl: './payment-terms-types.page.html',
  styleUrls: ['./shell-table.css', './payment-terms-types.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentTermsTypesPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: PaymentTermsTypeRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  /** Search matches Name AND ID (and Code) — the ID is a first-class handle, not just a key. */
  public Search = '';
  public Filter: ActiveFilter = 'all';
  public Sort: SortKey = 'name';

  private draftValue: PaymentTermsTypeDraft | null = null;
  /** JSON of the draft as it was OPENED — `IsDirty` is this vs. the live object. */
  private draftBaseline = '';
  /**
   * The editor's working copy. Assigning one snapshots it, so dirty-tracking cannot be forgotten at
   * a new call site — `ngModel` mutates this object's fields, it never reassigns the draft.
   */
  public get Draft(): PaymentTermsTypeDraft | null {
    return this.draftValue;
  }
  public set Draft(value: PaymentTermsTypeDraft | null) {
    this.draftValue = value;
    this.draftBaseline = value === null ? '' : JSON.stringify(value);
  }
  /** True when the open editor holds unsaved edits — what gates the dismiss confirm. */
  public get IsDirty(): boolean {
    return this.draftValue !== null && JSON.stringify(this.draftValue) !== this.draftBaseline;
  }
  public IsSaving = false;
  public SaveError: string | null = null;

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

  /** Free: the engine already caches this entity, so the roster costs zero extra reads. */
  private async load(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(forceRefresh, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.Rows = engine.PaymentTermsTypes.map((t) => ({
        ID: t.ID,
        Name: t.Name,
        Code: t.Code,
        NetDays: t.NetDays,
        Description: t.Description,
        IsActive: t.IsActive,
      }));
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
  public get VisibleRows(): PaymentTermsTypeRow[] {
    const term = this.Search.trim().toLowerCase();
    const rows = this.Rows.filter((r) => this.matchesFilter(r) && this.matchesSearch(r, term));
    return rows.sort((a, b) => this.compare(a, b));
  }

  private matchesFilter(row: PaymentTermsTypeRow): boolean {
    if (this.Filter === 'active') return row.IsActive;
    if (this.Filter === 'inactive') return !row.IsActive;
    return true;
  }

  /** Name AND ID (and code, which is the machine name of the same thing). */
  private matchesSearch(row: PaymentTermsTypeRow, term: string): boolean {
    if (!term) return true;
    return (
      row.Name.toLowerCase().includes(term) ||
      row.ID.toLowerCase().includes(term) ||
      row.Code.toLowerCase().includes(term)
    );
  }

  private compare(a: PaymentTermsTypeRow, b: PaymentTermsTypeRow): number {
    if (this.Sort === 'netdays') return a.NetDays - b.NetDays || a.Name.localeCompare(b.Name);
    if (this.Sort === 'code') return a.Code.localeCompare(b.Code) || a.Name.localeCompare(b.Name);
    return a.Name.localeCompare(b.Name);
  }

  public get ActiveCount(): number {
    return this.Rows.filter((r) => r.IsActive).length;
  }

  // ─── editor ──────────────────────────────────────────────────────────────────

  public New(): void {
    this.SaveError = null;
    this.Draft = { ID: null, Name: '', Code: '', NetDays: 0, Description: '', IsActive: true };
    this.cdr.markForCheck();
  }

  public Edit(row: PaymentTermsTypeRow): void {
    this.SaveError = null;
    // UUIDsEqual, never === : SQL Server hands UUIDs back uppercase and === silently matches nothing.
    const t = OrdersEngineBase.Instance.PaymentTermsTypes.find((x) => UUIDsEqual(x.ID, row.ID));
    if (!t) {
      this.SaveError = `Payment terms "${row.Name}" are no longer loaded — refresh and try again.`;
      this.cdr.markForCheck();
      return;
    }
    this.Draft = {
      ID: t.ID,
      Name: t.Name,
      Code: t.Code,
      NetDays: t.NetDays,
      Description: t.Description ?? '',
      IsActive: t.IsActive,
    };
    this.cdr.markForCheck();
  }

  public Cancel(): void {
    this.Draft = null;
    this.SaveError = null;
    this.cdr.markForCheck();
  }

  /** Code and Name are both NOT NULL on the table, and NetDays must be a non-negative whole number. */
  public get CanSave(): boolean {
    const d = this.Draft;
    if (!d || this.IsSaving) return false;
    return d.Name.trim().length > 0 && d.Code.trim().length > 0 && this.netDaysValid(d.NetDays);
  }

  private netDaysValid(value: number): boolean {
    return Number.isInteger(Number(value)) && Number(value) >= 0;
  }

  public async Save(): Promise<void> {
    const d = this.Draft;
    if (!d || !this.CanSave) return;

    this.IsSaving = true;
    this.SaveError = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const t = await md.GetEntityObject<mjBizAppsOrdersPaymentTermsTypeEntity>(
        PAYMENT_TERMS_TYPE_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (d.ID) {
        if (!(await t.Load(d.ID))) throw new Error(`Payment terms type ${d.ID} could not be loaded.`);
      } else {
        t.NewRecord();
      }
      this.applyDraft(t, d);

      // Save() returns a BOOLEAN and does not throw on a logical failure — ignoring it is the
      // classic silent-failure bug, so surface the entity's own message.
      if (!(await t.Save())) {
        throw new Error(t.LatestResult?.CompleteMessage ?? 'The payment terms type could not be saved.');
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
  private applyDraft(t: mjBizAppsOrdersPaymentTermsTypeEntity, d: PaymentTermsTypeDraft): void {
    t.Name = d.Name.trim();
    t.Code = d.Code.trim();
    t.NetDays = Number(d.NetDays);
    t.Description = d.Description.trim() || null;
    t.IsActive = d.IsActive;
  }
}
