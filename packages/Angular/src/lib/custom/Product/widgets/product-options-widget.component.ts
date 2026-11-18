import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompositeKey, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import {
    LoadOrdersEngine,
    OrdersEngine,
    type ProductOptionRow,
    type ProductOptionValueRow,
    type mjBizAppsOrdersProductOptionAssignmentEntity,
    type mjBizAppsOrdersProductOptionAssignmentValueEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../../data/entity-names';
import { AssignableOptions, BuildOptionRows, type OptionLevel, type OptionLevelScope, type OptionRowView } from './product-option-rows';

/** The assignment being added or edited, before it is saved. */
export interface OptionAssignmentDraft {
    /** The assignment's ID when editing one this level already has. */
    AssignmentID: string | null;
    OptionID: string;
    IsRequired: boolean;
    DefaultValueID: string;
    /** The values allowed; empty means every active value of the option. */
    AllowedValueIDs: string[];
    SortOrder: number;
}

/**
 * The Options panel of a product type, category or product (golive #399).
 *
 * Lists the options this level assigns and the ones it inherits, each inherited row saying which
 * type or category it comes from, the way inherited prices show where they come from. Add, edit,
 * exclude and remove act on this level's own `ProductOptionAssignment` rows; an inherited option is
 * changed here by giving this level its own row, which then wins whole. Role is always `LineOption`:
 * variant SKUs are refused on save until they are wired.
 *
 * Binds to the entities and `OrdersEngine` directly (docs/ui-architecture.md). The server applies the
 * same rules on save (`ProductOptionRules.ts`), including the company boundary this panel offers.
 */
@Component({
    standalone: true,
    selector: 'mjo-product-options-widget',
    imports: [CommonModule],
    templateUrl: './product-options-widget.component.html',
    styleUrls: ['./product-options-widget.component.css'],
})
export class MJOProductOptionsWidgetComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public Level: OptionLevel = 'Product';
    @Input() public RecordID: string | null = null;
    @Input() public CompanyID: string | null = null;
    @Input() public ProductTypeID: string | null = null;
    /** The product's own category, or the category's parent; null for a product type. */
    @Input() public CategoryID: string | null = null;
    @Input() public EditMode = false;
    @Input() public Provider: IMetadataProvider | null = null;
    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public Rows: OptionRowView[] = [];
    public Assignable: ProductOptionRow[] = [];
    public Loaded = false;
    public Busy = false;
    public Error: string | null = null;
    public Draft: OptionAssignmentDraft | null = null;

    public async ngOnChanges(): Promise<void> {
        await this.Refresh(false);
    }

    /** The company rule as the panel states it beside the option picker. */
    public get CompanyRuleText(): string {
        return this.Level === 'Type'
            ? 'Product types are shared by every company, so only shared options can be assigned here.'
            : "Shared options and this company's own options can be assigned here.";
    }

    /** Re-read the catalog (after a save, `force` reloads the engine) and rebuild the rows. */
    public async Refresh(force: boolean): Promise<void> {
        if (!this.RecordID) {
            this.Rows = [];
            this.Loaded = true;
            return;
        }
        try {
            const user = this.metadata.CurrentUser as UserInfo | null;
            if (force) await OrdersEngine.Instance.Config(true, user ?? undefined, this.metadata);
            else await LoadOrdersEngine(this.metadata, user);
            const engine = OrdersEngine.Instance;
            const scope = this.scope();
            this.Rows = BuildOptionRows(scope, engine.OptionCatalog, (level, id) =>
                level === 'Type'
                    ? engine.ProductTypeByID(id)?.Name ?? 'product type'
                    : level === 'Category'
                      ? engine.ProductCategoryByID(id)?.Name ?? 'category'
                      : engine.ProductByID(id)?.Name ?? 'product',
            );
            this.Assignable = AssignableOptions(scope, engine.OptionCatalog);
            this.Error = null;
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        }
        this.Loaded = true;
        this.cdr.markForCheck();
    }

    /** Active values of an option, in display order. */
    public ValuesOf(optionID: string): ProductOptionValueRow[] {
        return (OrdersEngine.Instance.OptionCatalog.Values ?? [])
            .filter((v) => UUIDsEqual(v.ProductOptionID, optionID) && v.IsActive)
            .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Label.localeCompare(b.Label));
    }

    public OptionName(optionID: string): string {
        return OrdersEngine.Instance.ProductOptions.find((o) => UUIDsEqual(o.ID, optionID))?.Name ?? 'Option';
    }

    /** Start adding an option this level does not assign yet. */
    public StartAdd(event: Event): void {
        const select = event.target as HTMLSelectElement | null;
        const optionID = select?.value;
        if (select) select.value = '';
        if (!optionID) return;
        this.Draft = { AssignmentID: null, OptionID: optionID, IsRequired: false, DefaultValueID: '', AllowedValueIDs: [], SortOrder: 0 };
    }

    /** Edit this level's own row, or give this level its own copy of an inherited one. */
    public StartEdit(row: OptionRowView): void {
        const source = row.Own && !row.Own.IsExcluded ? row.Own : row.Inherited?.Assignment ?? null;
        const listed = source
            ? OrdersEngine.Instance.OptionCatalog.AssignmentValues.filter((av) => UUIDsEqual(av.ProductOptionAssignmentID, source.ID)).map(
                  (av) => av.ProductOptionValueID,
              )
            : [];
        this.Draft = {
            AssignmentID: row.Own?.ID ?? null,
            OptionID: row.Option.ID,
            IsRequired: !!source?.IsRequired,
            DefaultValueID: source?.DefaultProductOptionValueID ?? '',
            AllowedValueIDs: listed,
            SortOrder: source?.SortOrder ?? 0,
        };
    }

    public CancelEdit(): void {
        this.Draft = null;
    }

    public SetDraftRequired(event: Event): void {
        if (this.Draft) this.Draft.IsRequired = (event.target as HTMLInputElement).checked;
    }

    public SetDraftDefault(event: Event): void {
        if (this.Draft) this.Draft.DefaultValueID = (event.target as HTMLSelectElement).value;
    }

    public SetDraftSort(event: Event): void {
        if (this.Draft) this.Draft.SortOrder = Number((event.target as HTMLInputElement).value) || 0;
    }

    public IsAllowed(valueID: string): boolean {
        return !!this.Draft?.AllowedValueIDs.some((id) => UUIDsEqual(id, valueID));
    }

    public ToggleAllowed(valueID: string, event: Event): void {
        if (!this.Draft) return;
        const on = (event.target as HTMLInputElement).checked;
        const rest = this.Draft.AllowedValueIDs.filter((id) => !UUIDsEqual(id, valueID));
        this.Draft.AllowedValueIDs = on ? [...rest, valueID] : rest;
    }

    /** The default must be an allowed value; with values listed, only those are offered. */
    public DefaultChoices(): ProductOptionValueRow[] {
        if (!this.Draft) return [];
        const all = this.ValuesOf(this.Draft.OptionID);
        return this.Draft.AllowedValueIDs.length ? all.filter((v) => this.IsAllowed(v.ID)) : all;
    }

    /** Why the draft cannot be saved yet, or null. */
    public get DraftProblem(): string | null {
        const d = this.Draft;
        if (!d) return null;
        if (d.DefaultValueID && !this.DefaultChoices().some((v) => UUIDsEqual(v.ID, d.DefaultValueID))) {
            return 'The default must be one of the allowed values.';
        }
        return null;
    }

    /**
     * Save the draft as this level's assignment and sync its allowed values.
     *
     * The default is written after the allowed values: the server checks a saved assignment's
     * default against the values it lists, so writing the default first could refuse a default that
     * the new list allows.
     */
    public async SaveDraft(): Promise<void> {
        const d = this.Draft;
        if (!d || this.DraftProblem || !this.RecordID) return;
        await this.run(async () => {
            const assignment = await this.assignmentFor(d.AssignmentID);
            this.placeOnLevel(assignment);
            assignment.ProductOptionID = d.OptionID;
            assignment.IsExcluded = false;
            assignment.IsRequired = d.IsRequired;
            assignment.SortOrder = d.SortOrder;
            assignment.Role = 'LineOption';
            assignment.DefaultProductOptionValueID = d.AllowedValueIDs.length ? null : d.DefaultValueID || null;
            await this.save(assignment);
            await this.syncAllowedValues(assignment.ID, d.AllowedValueIDs);
            const wantDefault = d.DefaultValueID || null;
            if (d.AllowedValueIDs.length && wantDefault) {
                assignment.DefaultProductOptionValueID = wantDefault;
                await this.save(assignment);
            }
            this.Draft = null;
        });
    }

    /** Stop offering an inherited option from this level down: an excluded row at this level. */
    public async Exclude(row: OptionRowView): Promise<void> {
        if (!this.RecordID) return;
        await this.run(async () => {
            const assignment = await this.assignmentFor(row.Own?.ID ?? null);
            this.placeOnLevel(assignment);
            assignment.ProductOptionID = row.Option.ID;
            assignment.IsExcluded = true;
            assignment.IsRequired = false;
            assignment.DefaultProductOptionValueID = null;
            assignment.Role = 'LineOption';
            await this.save(assignment);
            await this.syncAllowedValues(assignment.ID, []);
        });
    }

    /** Remove this level's own row; an inherited option, if any, applies again. */
    public async Remove(row: OptionRowView): Promise<void> {
        if (!row.Own) return;
        const ownID = row.Own.ID;
        await this.run(async () => {
            await this.syncAllowedValues(ownID, []);
            const assignment = await this.assignmentFor(ownID);
            if (!(await assignment.Delete())) {
                throw new Error(assignment.LatestResult?.CompleteMessage ?? 'The option could not be removed.');
            }
        });
    }

    public OpenOption(optionID: string, event?: Event): void {
        event?.stopPropagation();
        this.Navigate.emit({ Kind: 'record', EntityName: MJO_ENTITIES.ProductOption, PrimaryKey: CompositeKey.FromID(optionID) });
    }

    private scope(): OptionLevelScope {
        const engine = OrdersEngine.Instance;
        return {
            Level: this.Level,
            ID: this.RecordID ?? '',
            CompanyID: this.Level === 'Type' ? null : this.CompanyID,
            ProductTypeID: this.Level === 'Product' ? this.ProductTypeID : null,
            CategoryChainAbove: this.Level === 'Type' ? [] : engine.CategoryChain(this.CategoryID),
        };
    }

    private placeOnLevel(a: mjBizAppsOrdersProductOptionAssignmentEntity): void {
        a.ProductTypeID = this.Level === 'Type' ? this.RecordID : null;
        a.ProductCategoryID = this.Level === 'Category' ? this.RecordID : null;
        a.ProductID = this.Level === 'Product' ? this.RecordID : null;
    }

    private async assignmentFor(id: string | null): Promise<mjBizAppsOrdersProductOptionAssignmentEntity> {
        const a = await this.metadata.GetEntityObject<mjBizAppsOrdersProductOptionAssignmentEntity>(
            MJO_ENTITIES.ProductOptionAssignment,
            this.metadata.CurrentUser as UserInfo,
        );
        if (id) {
            if (!(await a.Load(id))) throw new Error('The option assignment could not be loaded.');
        } else {
            a.NewRecord();
        }
        return a;
    }

    /** Make the assignment's allowed values exactly `valueIDs`: add the missing rows, delete the rest. */
    private async syncAllowedValues(assignmentID: string, valueIDs: readonly string[]): Promise<void> {
        const existing = OrdersEngine.Instance.OptionCatalog.AssignmentValues.filter((av) =>
            UUIDsEqual(av.ProductOptionAssignmentID, assignmentID),
        ) as unknown as Array<{ ID: string; ProductOptionValueID: string }>;
        for (const row of existing) {
            if (valueIDs.some((id) => UUIDsEqual(id, row.ProductOptionValueID))) continue;
            const entity = await this.metadata.GetEntityObject<mjBizAppsOrdersProductOptionAssignmentValueEntity>(
                MJO_ENTITIES.ProductOptionAssignmentValue,
                this.metadata.CurrentUser as UserInfo,
            );
            if (!(await entity.Load(row.ID)) || !(await entity.Delete())) {
                throw new Error(entity.LatestResult?.CompleteMessage ?? 'An allowed value could not be removed.');
            }
        }
        for (const valueID of valueIDs) {
            if (existing.some((row) => UUIDsEqual(row.ProductOptionValueID, valueID))) continue;
            const entity = await this.metadata.GetEntityObject<mjBizAppsOrdersProductOptionAssignmentValueEntity>(
                MJO_ENTITIES.ProductOptionAssignmentValue,
                this.metadata.CurrentUser as UserInfo,
            );
            entity.NewRecord();
            entity.ProductOptionAssignmentID = assignmentID;
            entity.ProductOptionValueID = valueID;
            await this.save(entity);
        }
    }

    private async save(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }): Promise<void> {
        if (!(await entity.Save())) throw new Error(entity.LatestResult?.CompleteMessage ?? 'The change could not be saved.');
    }

    /** One action at a time; the catalog is reloaded afterwards whether it succeeded or not. */
    private async run(action: () => Promise<void>): Promise<void> {
        if (this.Busy) return;
        this.Busy = true;
        this.Error = null;
        try {
            await action();
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            const error = this.Error;
            await this.Refresh(true);
            this.Error = error;
            this.Busy = false;
            this.cdr.markForCheck();
        }
    }

    private get metadata(): IMetadataProvider {
        return this.Provider ?? (Metadata.Provider as unknown as IMetadataProvider);
    }
}
