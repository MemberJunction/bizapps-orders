import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsOrdersPaymentProviderEntity } from '@mj-biz-apps/orders-entities';

const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const COMPANY_ENTITY = 'MJ: Companies';

/** Value-list union DERIVED from the entity — never hand-copied (it widens when the CHECK grows). */
export type ProviderType = mjBizAppsOrdersPaymentProviderEntity['ProviderType'];

/**
 * One roster row.
 *
 * `HasCredentials` is a BOOLEAN, not the value: `CredentialsRef` is credential-shaped, so this page
 * reports whether it is set and never renders what it is. See the class doc.
 */
export interface PaymentProviderRow {
  ID: string;
  Name: string;
  ProviderType: ProviderType;
  CompanyID: string;
  Company: string;
  IsLiveMode: boolean;
  IsActive: boolean;
  HasCredentials: boolean;
}

/** A company the provider account can belong to. `CompanyID` is NOT NULL, so one must be picked. */
export interface CompanyOption {
  ID: string;
  Name: string;
}

/**
 * The editable shape. Mirrors every writable field on the entity — except that `CredentialsRef` is
 * WRITE-ONLY here: `CredentialsRefInput` starts blank on every edit and is applied only when typed.
 */
export interface PaymentProviderDraft {
  /** null ⇒ a new provider account. */
  ID: string | null;
  Name: string;
  ProviderType: ProviderType;
  CompanyID: string;
  IsLiveMode: boolean;
  IsActive: boolean;
  /** Blank ⇒ leave the stored reference exactly as it is. Never pre-filled from the record. */
  CredentialsRefInput: string;
  /** Explicit intent to unset the stored reference (mutually exclusive with typing a new one). */
  ClearCredentialsRef: boolean;
  /** Read-only display state — whether a reference is currently stored. Never the value. */
  HasCredentials: boolean;
}

export type ActiveFilter = 'all' | 'active' | 'inactive';
export type SortKey = 'name' | 'type' | 'company';

/**
 * Payments → Providers — the CRUD roster for `MJ_BizApps_Orders: Payment Providers`.
 *
 * A provider account is the per-company binding to a processor (Stripe today, Manual for
 * cash/check/wire capture). These rows already existed with no management UI, so onboarding a
 * second company — or flipping an account from sandbox to live — had no screen.
 *
 * **`CredentialsRef` is treated as SENSITIVE.** The column's own description says it is an MJ
 * Credentials-engine *key*, "NEVER a secret value at rest" — but it is credential-shaped, it names
 * the thing that unlocks a live payment processor, and the cost of being wrong is unbounded. So it
 * is handled as a secret regardless: the roster shows **Set / Not set**, the editor shows the same
 * state, and the input is **write-only** — blank on open, never echoing the stored value, applied
 * only when something is typed. Clearing it takes an explicit checkbox. If the credential model
 * later grows a genuinely secret column, this is the pattern it inherits.
 *
 * **`IsLiveMode` is surfaced loudly** — it is the difference between a test charge and a real one,
 * so it is a roster column and a flagged control, not a checkbox buried in a form.
 *
 * **No usage count — deliberately.** Providers are referenced by Payments / payment intents:
 * unbounded transactional tables no engine caches. Counting them means reading the whole table, and
 * a `MaxRows`-truncated read prints a number that is quietly WRONG. Skipped rather than faked.
 *
 * **No delete — deliberately, mirroring product-types.page.ts.** `Payment.PaymentProviderID` is a
 * NON-NULLABLE FK: deleting a referenced provider fails at the database with an opaque constraint
 * error, and deleting an unreferenced one destroys the audit trail's counterparty. Retirement via
 * `IsActive` is what an admin actually wants — an inactive account stops being selectable for new
 * payments while every historical payment still resolves the account it ran through.
 */
@Component({
  standalone: false,
  selector: 'mj-payment-providers-page',
  templateUrl: './payment-providers.page.html',
  styleUrls: ['./payment-providers.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentProvidersPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: PaymentProviderRow[] = [];
  public Companies: CompanyOption[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  /** Search matches Name AND ID (and company) — the ID is a first-class handle, not just a key. */
  public Search = '';
  public Filter: ActiveFilter = 'all';
  public Sort: SortKey = 'name';

  private draftValue: PaymentProviderDraft | null = null;
  /** JSON of the draft as it was OPENED — `IsDirty` is this vs. the live object. */
  private draftBaseline = '';
  /**
   * The editor's working copy. Assigning one snapshots it, so dirty-tracking cannot be forgotten at
   * a new call site — `ngModel` mutates this object's fields, it never reassigns the draft.
   */
  public get Draft(): PaymentProviderDraft | null {
    return this.draftValue;
  }
  public set Draft(value: PaymentProviderDraft | null) {
    this.draftValue = value;
    this.draftBaseline = value === null ? '' : JSON.stringify(value);
  }
  /** True when the open editor holds unsaved edits — what gates the dismiss confirm. */
  public get IsDirty(): boolean {
    return this.draftValue !== null && JSON.stringify(this.draftValue) !== this.draftBaseline;
  }
  public IsSaving = false;
  public SaveError: string | null = null;

  /** Options for the type dropdown, kept beside the derived union above. */
  public readonly ProviderTypeOptions: ReadonlyArray<ProviderType> = ['Manual', 'Stripe'];

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

  /** Two batched reads, never one per row: the providers, and the companies the editor picks from. */
  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const rv = new RunView();
      const [providers, companies] = await rv.RunViews([
        {
          EntityName: PAYMENT_PROVIDER_ENTITY,
          Fields: ['ID', 'Name', 'ProviderType', 'CompanyID', 'Company', 'CredentialsRef', 'IsLiveMode', 'IsActive'],
          OrderBy: 'Name',
          ResultType: 'simple',
        },
        {
          EntityName: COMPANY_ENTITY,
          Fields: ['ID', 'Name'],
          OrderBy: 'Name',
          ResultType: 'simple',
        },
      ]);

      if (!providers.Success) throw new Error(providers.ErrorMessage || 'Payment providers could not be loaded.');
      if (!companies.Success) throw new Error(companies.ErrorMessage || 'Companies could not be loaded.');

      this.Rows = this.projectRows(providers.Results as ProviderReadModel[]);
      this.Companies = (companies.Results as CompanyOption[]).map((c) => ({ ID: c.ID, Name: c.Name }));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
      this.Companies = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The one place `CredentialsRef` is read — and it is immediately reduced to a boolean. */
  private projectRows(rows: ProviderReadModel[]): PaymentProviderRow[] {
    return rows.map((p) => ({
      ID: p.ID,
      Name: p.Name,
      ProviderType: p.ProviderType,
      CompanyID: p.CompanyID,
      Company: p.Company,
      IsLiveMode: p.IsLiveMode,
      IsActive: p.IsActive,
      HasCredentials: !!p.CredentialsRef && p.CredentialsRef.trim().length > 0,
    }));
  }

  // ─── roster view ─────────────────────────────────────────────────────────────

  /** Filter → search → sort. Recomputed per change-detection pass; the set is dozens of rows. */
  public get VisibleRows(): PaymentProviderRow[] {
    const term = this.Search.trim().toLowerCase();
    const rows = this.Rows.filter((r) => this.matchesFilter(r) && this.matchesSearch(r, term));
    return rows.sort((a, b) => this.compare(a, b));
  }

  private matchesFilter(row: PaymentProviderRow): boolean {
    if (this.Filter === 'active') return row.IsActive;
    if (this.Filter === 'inactive') return !row.IsActive;
    return true;
  }

  /** Name AND ID (this entity has no Code), plus the company it belongs to. */
  private matchesSearch(row: PaymentProviderRow, term: string): boolean {
    if (!term) return true;
    return (
      row.Name.toLowerCase().includes(term) ||
      row.ID.toLowerCase().includes(term) ||
      (row.Company?.toLowerCase().includes(term) ?? false)
    );
  }

  private compare(a: PaymentProviderRow, b: PaymentProviderRow): number {
    if (this.Sort === 'type') return a.ProviderType.localeCompare(b.ProviderType) || a.Name.localeCompare(b.Name);
    if (this.Sort === 'company') return (a.Company ?? '').localeCompare(b.Company ?? '') || a.Name.localeCompare(b.Name);
    return a.Name.localeCompare(b.Name);
  }

  public get LiveCount(): number {
    return this.Rows.filter((r) => r.IsLiveMode && r.IsActive).length;
  }

  // ─── editor ──────────────────────────────────────────────────────────────────

  public New(): void {
    this.SaveError = null;
    this.Draft = {
      ID: null,
      Name: '',
      ProviderType: 'Manual',
      CompanyID: this.Companies[0]?.ID ?? '',
      IsLiveMode: false,
      IsActive: true,
      CredentialsRefInput: '',
      ClearCredentialsRef: false,
      HasCredentials: false,
    };
    this.cdr.markForCheck();
  }

  /**
   * Opens the editor from the ROSTER row, not from a re-read of the record — deliberately: the row
   * already carries every field this page edits, and `CredentialsRef` was never projected past a
   * boolean, so there is no stored secret in reach of the form to leak.
   */
  public Edit(row: PaymentProviderRow): void {
    this.SaveError = null;
    this.Draft = {
      ID: row.ID,
      Name: row.Name,
      ProviderType: row.ProviderType,
      CompanyID: row.CompanyID,
      IsLiveMode: row.IsLiveMode,
      IsActive: row.IsActive,
      CredentialsRefInput: '',
      ClearCredentialsRef: false,
      HasCredentials: row.HasCredentials,
    };
    this.cdr.markForCheck();
  }

  public Cancel(): void {
    this.Draft = null;
    this.SaveError = null;
    this.cdr.markForCheck();
  }

  /** Typing a new reference and clearing it are contradictory intents — resolve, don't guess. */
  public get CredentialsConflict(): boolean {
    const d = this.Draft;
    return !!d && d.ClearCredentialsRef && d.CredentialsRefInput.trim().length > 0;
  }

  /** Name and CompanyID are both NOT NULL on the table. */
  public get CanSave(): boolean {
    const d = this.Draft;
    if (!d || this.IsSaving) return false;
    return d.Name.trim().length > 0 && d.CompanyID.trim().length > 0 && !this.CredentialsConflict;
  }

  public async Save(): Promise<void> {
    const d = this.Draft;
    if (!d || !this.CanSave) return;

    this.IsSaving = true;
    this.SaveError = null;
    this.cdr.markForCheck();
    try {
      const md = new Metadata();
      const p = await md.GetEntityObject<mjBizAppsOrdersPaymentProviderEntity>(
        PAYMENT_PROVIDER_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (d.ID) {
        if (!(await p.Load(d.ID))) throw new Error(`Payment provider ${d.ID} could not be loaded.`);
      } else {
        p.NewRecord();
      }
      this.applyDraft(p, d);

      // Save() returns a BOOLEAN and does not throw on a logical failure — ignoring it is the
      // classic silent-failure bug, so surface the entity's own message.
      if (!(await p.Save())) {
        throw new Error(p.LatestResult?.CompleteMessage ?? 'The payment provider could not be saved.');
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

  /** Typed generated properties only — never .Get()/.Set(). */
  private applyDraft(p: mjBizAppsOrdersPaymentProviderEntity, d: PaymentProviderDraft): void {
    p.Name = d.Name.trim();
    p.ProviderType = d.ProviderType;
    p.CompanyID = d.CompanyID;
    p.IsLiveMode = d.IsLiveMode;
    p.IsActive = d.IsActive;
    this.applyCredentialsRef(p, d);
  }

  /**
   * The write-only rule, enforced in one place: a blank input LEAVES the stored reference alone
   * (that is why it is never pre-filled — a blank box must not mean "erase it"). Only an explicit
   * clear unsets it.
   */
  private applyCredentialsRef(p: mjBizAppsOrdersPaymentProviderEntity, d: PaymentProviderDraft): void {
    const typed = d.CredentialsRefInput.trim();
    if (d.ClearCredentialsRef) {
      p.CredentialsRef = null;
    } else if (typed.length > 0) {
      p.CredentialsRef = typed;
    }
  }
}

/** The exact shape read back for the roster — declared so `Fields` and the projection can't drift. */
interface ProviderReadModel {
  ID: string;
  Name: string;
  ProviderType: ProviderType;
  CompanyID: string;
  Company: string;
  CredentialsRef: string | null;
  IsLiveMode: boolean;
  IsActive: boolean;
}
