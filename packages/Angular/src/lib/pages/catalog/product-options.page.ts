import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Metadata, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import {
    OrdersEngine,
    type mjBizAppsOrdersProductOptionEntity,
    type mjBizAppsOrdersProductOptionValueEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../data/entity-names';

/** The fields of an option being created or edited. */
export interface OptionDraft {
    ID: string | null;
    Code: string;
    Name: string;
    Description: string;
    /** '' is a shared option (CompanyID null); otherwise the owning company's ID. */
    CompanyID: string;
    SortOrder: number;
    IsActive: boolean;
}

/** The fields of a value being created or edited. */
export interface OptionValueDraft {
    ID: string | null;
    Code: string;
    Label: string;
    SortOrder: number;
    IsActive: boolean;
}

/** A company an option can belong to. */
export interface OptionCompanyChoice {
    ID: string;
    Name: string;
}

/**
 * The companies that own catalog rows, from the cached products and categories. An option belongs to
 * a company only so that company's categories and products can assign it, so a company with no
 * catalog has nothing to offer it on.
 */
export function OptionCompanyChoices(
    rows: ReadonlyArray<{ CompanyID: string | null; Company?: string | null }>,
): OptionCompanyChoice[] {
    const byID = new Map<string, string>();
    for (const r of rows) {
        if (!r.CompanyID) continue;
        const k = r.CompanyID.toLowerCase();
        if (!byID.has(k)) byID.set(k, String(r.Company ?? '') || r.CompanyID);
    }
    return [...byID].map(([ID, Name]) => ({ ID, Name })).sort((a, b) => a.Name.localeCompare(b.Name));
}

/** Why an option draft cannot be saved, or null. The database enforces the same uniqueness. */
export function OptionDraftProblem(
    draft: OptionDraft,
    options: ReadonlyArray<{ ID: string; Code: string; CompanyID: string | null }>,
): string | null {
    const code = draft.Code.trim();
    if (!code) return 'Enter a code.';
    if (!draft.Name.trim()) return 'Enter a name.';
    const clash = options.find(
        (o) =>
            !(draft.ID && UUIDsEqual(o.ID, draft.ID)) &&
            o.Code.trim().toLowerCase() === code.toLowerCase() &&
            (o.CompanyID ?? '').toLowerCase() === draft.CompanyID.toLowerCase(),
    );
    if (clash) return draft.CompanyID ? `This company already has an option with code ${code}.` : `A shared option already has code ${code}.`;
    return null;
}

/** Why a value draft cannot be saved, or null. */
export function OptionValueDraftProblem(
    draft: OptionValueDraft,
    values: ReadonlyArray<{ ID: string; Code: string }>,
): string | null {
    const code = draft.Code.trim();
    if (!code) return 'Enter a code.';
    if (!draft.Label.trim()) return 'Enter a label.';
    if (values.some((v) => !(draft.ID && UUIDsEqual(v.ID, draft.ID)) && v.Code.trim().toLowerCase() === code.toLowerCase())) {
        return `This option already has a value with code ${code}.`;
    }
    return null;
}

/**
 * `mjo-product-options-page` — the option catalog (golive #399).
 *
 * Options such as Tier and Size, and their values. An option is SHARED (every company may use it,
 * and only a shared option can be assigned on a product type, since types are global) or belongs to
 * one company. Which products offer an option is set on the product type, category and product
 * forms, in their Options panel.
 *
 * A value a line has used cannot be deleted (the line's pick refers to it); it is deactivated
 * instead, so this page offers Active rather than Delete.
 */
@Component({
    selector: 'mjo-product-options-page',
    standalone: true,
    imports: [CommonModule, EntityViewerModule, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-list-check" class="mjo-po__note">
            <strong>Options are choices made on the order line, such as Tier or Size.</strong>
            Price rules can test them, and entitlement templates can grant on them. Which products offer
            an option is set in the Options panel of a product type, category or product.
        </mj-alert>

        <!-- Every option as a grid, with the workspace's columns, filters and saved views; a row opens
             the option's own form. The cards below edit an option and its values in one place. -->
        <div class="mjo-po__viewer-host">
            @if (OptionEntityInfo) {
                <mj-view-workspace [Entity]="OptionEntityInfo" [AutoSaveView]="true"></mj-view-workspace>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading options...</div>
            }
        </div>

        @if (Error) {
            <div class="mjo-po__err" role="alert">{{ Error }}</div>
        }

        <div class="mjo-po__grid">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                    <h3>Options and their values</h3>
                    <span class="right">
                        <button type="button" class="mjo-po__btn" [disabled]="Busy" (click)="NewOption()">New option</button>
                    </span>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr><th>Option</th><th>Scope</th><th>Values</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            @for (option of Options; track option.ID) {
                                <tr class="mjo-po__row" [class.is-selected]="IsSelected(option)" (click)="Select(option)">
                                    <td>
                                        {{ option.Name }}
                                        <div class="secondary mono">{{ option.Code }}</div>
                                    </td>
                                    <td class="small">{{ option.CompanyID ? (option.Company || 'Company') : 'Shared' }}</td>
                                    <td class="small">{{ ValueSummary(option) }}</td>
                                    <td>
                                        <span class="mjo-chip" [class]="option.IsActive ? 'mjo-chip--success' : 'mjo-chip--outline'">
                                            {{ option.IsActive ? 'Active' : 'Inactive' }}
                                        </span>
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="small muted">{{ Loaded ? 'No options yet.' : 'Loading options…' }}</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            @if (Draft; as draft) {
                <div class="mj-card">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        <h3>{{ draft.ID ? draft.Name || 'Option' : 'New option' }}</h3>
                    </div>
                    <div class="mj-card-pad mjo-po__form">
                        <label><span>Code</span><input [value]="draft.Code" (input)="draft.Code = Text($event)" maxlength="100"></label>
                        <label><span>Name</span><input [value]="draft.Name" (input)="draft.Name = Text($event)" maxlength="200"></label>
                        <label><span>Description</span><input [value]="draft.Description" (input)="draft.Description = Text($event)"></label>
                        <label>
                            <span>Scope</span>
                            <select (change)="draft.CompanyID = Text($event)">
                                <option value="" [selected]="!draft.CompanyID">Shared: every company, and product types</option>
                                @for (company of Companies; track company.ID) {
                                    <option [value]="company.ID" [selected]="SameID(draft.CompanyID, company.ID)">{{ company.Name }} only</option>
                                }
                            </select>
                        </label>
                        <label><span>Sort order</span><input type="number" step="1" [value]="draft.SortOrder" (change)="draft.SortOrder = Num($event)"></label>
                        <label class="mjo-po__check"><input type="checkbox" [checked]="draft.IsActive" (change)="draft.IsActive = Checked($event)"><span>Active</span></label>
                        @if (OptionProblem; as problem) {
                            <div class="mjo-po__err" role="alert">{{ problem }}</div>
                        }
                        <div class="mjo-po__actions">
                            <button type="button" class="mjo-po__btn is-primary" [disabled]="Busy || !!OptionProblem" (click)="SaveOption()">Save option</button>
                            <button type="button" class="mjo-po__btn" [disabled]="Busy" (click)="CancelOption()">Cancel</button>
                        </div>
                    </div>

                    @if (draft.ID) {
                        <div class="mj-card-head">
                            <i class="fa-solid fa-list" aria-hidden="true"></i>
                            <h3>Values</h3>
                        </div>
                        <div class="mj-table-wrap">
                            <table class="mj-table mj-table--compact">
                                <thead><tr><th>Code</th><th>Label</th><th class="num">Sort</th><th>Active</th><th></th></tr></thead>
                                <tbody>
                                    @for (value of ValueDrafts; track $index) {
                                        <tr>
                                            <td><input class="mjo-po__cell" [value]="value.Code" (input)="value.Code = Text($event)" maxlength="100" aria-label="Value code"></td>
                                            <td><input class="mjo-po__cell" [value]="value.Label" (input)="value.Label = Text($event)" maxlength="200" aria-label="Value label"></td>
                                            <td class="num"><input class="mjo-po__cell is-num" type="number" step="1" [value]="value.SortOrder" (change)="value.SortOrder = Num($event)" aria-label="Sort order"></td>
                                            <td><input type="checkbox" [checked]="value.IsActive" (change)="value.IsActive = Checked($event)" aria-label="Active"></td>
                                            <td>
                                                <button type="button" class="mjo-po__btn" [disabled]="Busy || !!ValueProblem(value)" [attr.title]="ValueProblem(value)" (click)="SaveValue(value)">Save</button>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        <div class="mj-card-pad">
                            <button type="button" class="mjo-po__btn" [disabled]="Busy" (click)="AddValue()">Add value</button>
                            <div class="small muted mjo-po__hint">A value a line has used cannot be deleted; untick Active to stop offering it.</div>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host { display: block; height: 100%; overflow: auto; padding: var(--mj-space-6); }
            .mjo-po__note { margin-bottom: var(--mj-space-4); }
            .mjo-po__viewer-host {
                height: 360px; min-height: 300px; margin-bottom: var(--mj-space-4); background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); overflow: hidden;
                display: flex; flex-direction: column;
            }
            mj-view-workspace { display: flex; flex-direction: column; flex: 1 1 auto; height: 100%; width: 100%; min-height: 0; }
            .mjo-po__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--mj-space-4); align-items: start; }
            .mjo-po__row { cursor: pointer; }
            .mjo-po__row.is-selected td { background: var(--mj-bg-surface-hover); }
            .mjo-po__form { display: flex; flex-direction: column; gap: var(--mj-space-2); }
            .mjo-po__form label { display: grid; grid-template-columns: 110px minmax(0, 1fr); align-items: center; gap: var(--mj-space-2); font-size: var(--mj-text-sm); }
            .mjo-po__form input, .mjo-po__form select, .mjo-po__cell {
                height: 28px; padding: 0 8px; border: 1px solid var(--mj-border-strong); border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; font-size: var(--mj-text-sm);
            }
            .mjo-po__cell { width: 100%; box-sizing: border-box; }
            .mjo-po__cell.is-num { width: 70px; }
            .mjo-po__form .mjo-po__check { display: flex; }
            .mjo-po__form .mjo-po__check input { height: auto; }
            .mjo-po__actions { display: flex; gap: 4px; }
            .mjo-po__btn {
                height: 28px; padding: 0 10px; border: 1px solid var(--mj-border-strong); border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; font-size: var(--mj-text-xs); cursor: pointer;
            }
            .mjo-po__btn.is-primary { background: var(--mj-brand-primary); border-color: var(--mj-brand-primary); color: var(--mj-text-inverse, #fff); }
            .mjo-po__btn:disabled { opacity: 0.5; cursor: default; }
            .mjo-po__err { color: var(--mj-status-error); font-size: var(--mj-text-sm); margin-bottom: var(--mj-space-2); }
            .mjo-po__hint { margin-top: var(--mj-space-2); }
            @media (max-width: 960px) { .mjo-po__grid { grid-template-columns: minmax(0, 1fr); } }
            @media (max-width: 760px) { :host { padding: var(--mj-space-4); } }
        `,
    ],
})
export class MJOProductOptionsPageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    public OptionEntityInfo: EntityInfo | null = null;
    public Options: mjBizAppsOrdersProductOptionEntity[] = [];
    public Companies: OptionCompanyChoice[] = [];
    public Draft: OptionDraft | null = null;
    public ValueDrafts: OptionValueDraft[] = [];
    public Loaded = false;
    public Busy = false;
    public Error: string | null = null;

    public async ngOnInit(): Promise<void> {
        this.OptionEntityInfo = new Metadata().Entities.find((e) => e.Name === MJO_ENTITIES.ProductOption) ?? null;
        await this.reload(false);
        this.cdr.detectChanges();
    }

    public IsSelected(option: mjBizAppsOrdersProductOptionEntity): boolean {
        return !!this.Draft?.ID && UUIDsEqual(this.Draft.ID, option.ID);
    }

    public ValueSummary(option: mjBizAppsOrdersProductOptionEntity): string {
        const values = this.valuesOf(option.ID);
        const active = values.filter((v) => v.IsActive);
        if (!values.length) return 'No values';
        return active.map((v) => v.Label).join(', ') + (active.length < values.length ? ` (+${values.length - active.length} inactive)` : '');
    }

    public NewOption(): void {
        this.Draft = { ID: null, Code: '', Name: '', Description: '', CompanyID: '', SortOrder: 0, IsActive: true };
        this.ValueDrafts = [];
    }

    public Select(option: mjBizAppsOrdersProductOptionEntity): void {
        this.Draft = {
            ID: option.ID,
            Code: option.Code,
            Name: option.Name,
            Description: option.Description ?? '',
            CompanyID: option.CompanyID ?? '',
            SortOrder: option.SortOrder ?? 0,
            IsActive: option.IsActive,
        };
        this.ValueDrafts = this.valuesOf(option.ID).map((v) => ({
            ID: v.ID,
            Code: v.Code,
            Label: v.Label,
            SortOrder: v.SortOrder ?? 0,
            IsActive: v.IsActive,
        }));
    }

    public CancelOption(): void {
        this.Draft = null;
        this.ValueDrafts = [];
    }

    public get OptionProblem(): string | null {
        return this.Draft ? OptionDraftProblem(this.Draft, this.Options) : null;
    }

    public ValueProblem(value: OptionValueDraft): string | null {
        return OptionValueDraftProblem(value, this.ValueDrafts.filter((v) => v !== value && v.ID) as Array<{ ID: string; Code: string }>);
    }

    public AddValue(): void {
        const next = this.ValueDrafts.reduce((max, v) => Math.max(max, v.SortOrder), 0) + 1;
        this.ValueDrafts = [...this.ValueDrafts, { ID: null, Code: '', Label: '', SortOrder: next, IsActive: true }];
    }

    public async SaveOption(): Promise<void> {
        const d = this.Draft;
        if (!d || this.OptionProblem) return;
        await this.run(async () => {
            const option = await this.metadata.GetEntityObject<mjBizAppsOrdersProductOptionEntity>(MJO_ENTITIES.ProductOption, this.user);
            if (d.ID) {
                if (!(await option.Load(d.ID))) throw new Error('The option could not be loaded.');
            } else {
                option.NewRecord();
            }
            option.Code = d.Code.trim();
            option.Name = d.Name.trim();
            option.Description = d.Description.trim() || null;
            option.CompanyID = d.CompanyID || null;
            option.SortOrder = d.SortOrder;
            option.IsActive = d.IsActive;
            if (!(await option.Save())) throw new Error(option.LatestResult?.CompleteMessage ?? 'The option could not be saved.');
            d.ID = option.ID;
        });
    }

    public async SaveValue(draft: OptionValueDraft): Promise<void> {
        const optionID = this.Draft?.ID;
        if (!optionID || this.ValueProblem(draft)) return;
        await this.run(async () => {
            const value = await this.metadata.GetEntityObject<mjBizAppsOrdersProductOptionValueEntity>(MJO_ENTITIES.ProductOptionValue, this.user);
            if (draft.ID) {
                if (!(await value.Load(draft.ID))) throw new Error('The value could not be loaded.');
            } else {
                value.NewRecord();
                value.ProductOptionID = optionID;
            }
            value.Code = draft.Code.trim();
            value.Label = draft.Label.trim();
            value.SortOrder = draft.SortOrder;
            value.IsActive = draft.IsActive;
            if (!(await value.Save())) throw new Error(value.LatestResult?.CompleteMessage ?? 'The value could not be saved.');
            draft.ID = value.ID;
        });
    }

    public Text(event: Event): string {
        return (event.target as HTMLInputElement | HTMLSelectElement).value;
    }

    public Num(event: Event): number {
        return Number((event.target as HTMLInputElement).value) || 0;
    }

    public Checked(event: Event): boolean {
        return (event.target as HTMLInputElement).checked;
    }

    public SameID(a: string | null | undefined, b: string | null | undefined): boolean {
        return !!a && !!b && UUIDsEqual(a, b);
    }

    private valuesOf(optionID: string): mjBizAppsOrdersProductOptionValueEntity[] {
        return (OrdersEngine.Instance.ProductOptionValues ?? [])
            .filter((v) => UUIDsEqual(v.ProductOptionID, optionID))
            .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Label.localeCompare(b.Label));
    }

    /** One save at a time; the engine is reloaded after it so every screen sees the change. */
    private async run(action: () => Promise<void>): Promise<void> {
        if (this.Busy) return;
        this.Busy = true;
        this.Error = null;
        try {
            await action();
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        }
        const error = this.Error;
        await this.reload(true);
        this.Error = error;
        // Keep the editor on the option just saved, with its values as stored.
        const selected = this.Draft?.ID ? this.Options.find((o) => UUIDsEqual(o.ID, this.Draft?.ID ?? '')) : undefined;
        if (selected && !error) this.Select(selected);
        this.Busy = false;
        this.cdr.detectChanges();
    }

    private async reload(force: boolean): Promise<void> {
        try {
            await OrdersEngine.Instance.Config(force, this.user, this.metadata);
            const engine = OrdersEngine.Instance;
            this.Options = [...(engine.ProductOptions ?? [])].sort(
                (a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Name.localeCompare(b.Name),
            );
            this.Companies = OptionCompanyChoices([...(engine.Products ?? []), ...(engine.ProductCategories ?? [])]);
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        }
        this.Loaded = true;
        this.cdr.detectChanges();
    }

    private get metadata(): IMetadataProvider {
        return Metadata.Provider as unknown as IMetadataProvider;
    }

    private get user(): UserInfo {
        return this.metadata.CurrentUser as UserInfo;
    }
}
