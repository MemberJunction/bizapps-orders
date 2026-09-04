import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    BaseEntity,
    CompositeKey,
    Metadata,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    BaseFormComponent,
    BaseFormsModule,
    type EntityFormConfig,
    type FormNavigationEvent,
} from '@memberjunction/ng-base-forms';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    ClampLineQuantity,
    FieldIsDirty,
    ListApplicablePrices,
    LoadOrdersEngine,
    OrdersEngine,
    loadApplicabilityContext,
    moneyEqual,
    priceOverrideCatalogInstalled,
    userPriceOverrideKind,
    type ApplicablePrice,
    type PriceOverrideKind,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import { GetCatalogOptions, type MJOProductOption } from '../../data/orders-queries';
import { MJOPricingScheduler, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';
import {
    ExtensionCollapsedHint,
    ExtensionToggleLabel,
} from './line-extension-fields';
import { CachedExtensionEntityInfo, CachedExtensionFormConfig } from './line-extension-cache';

/**
 * Inline catalog picker + line cards for an order header.
 *
 * Lines are `Order.Lines.Create()` children. When the product type declares an
 * `OrderLineExtensionEntity`, the extension is managed by `line.Extension` as a
 * `BaseEntity` companion and persists atomically on the server inside the order's
 * transaction. Newly added lines start expanded; existing lines stay collapsed
 * behind a disclosure.
 */
@Component({
    standalone: true,
    selector: 'mjo-order-lines-editor',
    imports: [
        CommonModule,
        FormsModule,
        BaseFormsModule,
        MJOConsequenceChipComponent,
        MJOPriceSourceBadgeComponent,
        MJOMoneyPipe,
    ],
    templateUrl: './order-lines-editor.component.html',
    styleUrls: ['./order-lines-editor.component.css'],
})
export class MJOOrderLinesEditorComponent implements OnDestroy {
    private readonly pricing = inject(MJOPricingScheduler);
    private readonly cdr = inject(ChangeDetectorRef);

    private _order: OrderHeaderEntity | null = null;
    private readonly expandedLineIds = new Set<string>();

    @Input() public Provider: IMetadataProvider | null = null;
    @Input() public EditMode = true;

    @Input()
    public set Order(value: OrderHeaderEntity | null) {
        this.unbindOrder();
        this._order = value;
        if (value) void this.onOrderBound();
    }
    public get Order(): OrderHeaderEntity | null {
        return this._order;
    }

    @Output() public PricingChanged = new EventEmitter<MJOPricingState>();
    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public Catalog: MJOProductOption[] = [];
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };
    public ProductQuery = '';
    public PickerCursor = 0;
    public PickerOpen = false;
    /** True when the catalog list would overflow the viewport below the search box. */
    public PickerOpensUp = false;
    public CatalogError: string | null = null;
    @ViewChild('pickerHost') private pickerHost?: ElementRef<HTMLElement>;
    /** 'none' hides the picker; 'list' is named prices only; 'any' also types an amount. */
    public OverrideKind: PriceOverrideKind = 'none';
    private readonly applicableByLine = new Map<string, ApplicablePrice[]>();
    private readonly overrideEditorLineIds = new Set<string>();
    private readonly customAmountLineIds = new Set<string>();
    private readonly defaultUnitByLine = new Map<string, number | null>();

    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return [...(this._order?.Lines.Items ?? [])];
    }

    public get PickerResults(): MJOProductOption[] {
        const q = this.ProductQuery.trim().toLowerCase();
        const matches = this.Catalog.filter(
            (p) => !q || p.Name.toLowerCase().includes(q) || p.SKU.toLowerCase().includes(q),
        );
        return matches.slice(0, 8);
    }

    public OpenPicker(): void {
        this.PickerOpen = true;
        this.PickerCursor = 0;
        this.updatePickerFlip();
    }

    public OnProductQueryChange(): void {
        if (this.PickerOpen) this.updatePickerFlip();
    }

    public ClosePickerSoon(): void {
        setTimeout(() => {
            this.PickerOpen = false;
            this.PickerOpensUp = false;
            this.cdr.detectChanges();
        }, 140);
    }

    public OnPickerKey(event: KeyboardEvent): void {
        const results = this.PickerResults;
        switch (event.key) {
            case 'ArrowDown':
                this.PickerCursor = Math.min(this.PickerCursor + 1, Math.max(results.length - 1, 0));
                event.preventDefault();
                break;
            case 'ArrowUp':
                this.PickerCursor = Math.max(this.PickerCursor - 1, 0);
                event.preventDefault();
                break;
            case 'Enter':
                if (results[this.PickerCursor]) {
                    void this.AddProduct(results[this.PickerCursor]);
                    event.preventDefault();
                }
                break;
            case 'Escape':
                this.PickerOpen = false;
                break;
            default:
                break;
        }
    }

    public async AddProduct(product: MJOProductOption): Promise<void> {
        if (!this.EditMode || !this._order) return;
        if (product.OrderLineExtensionEntity) {
            await this.addExtendedLine(product);
        } else {
            await this.addPlainLine(product);
        }
        this.ProductQuery = '';
        this.PickerCursor = 0;
        this.PickerOpen = false;
        this.schedulePricing();
        void this.refreshAllApplicable();
        this.cdr.detectChanges();
    }

    public Bump(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        if (!this.EditMode) return;
        line.Quantity = this.clampQuantity(line, Number(line.Quantity ?? 0) + delta);
        void this.refreshApplicable(line);
        this.schedulePricing();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        line.Quantity = this.clampQuantity(line, Number.parseFloat(target.value));
        void this.refreshApplicable(line);
        this.schedulePricing();
    }

    public QuantityAtMax(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const max = this.ProductFor(line)?.MaxQuantityPerLine;
        return max != null && max > 0 && Number(line.Quantity ?? 0) >= max;
    }

    public QuantityCappedToOne(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.ProductFor(line)?.MaxQuantityPerLine === 1;
    }

    public Remove(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.EditMode) return;
        this.expandedLineIds.delete(line.ID);
        this.overrideEditorLineIds.delete(line.ID);
        this.customAmountLineIds.delete(line.ID);
        this._order?.Lines.Remove(line);
        this.schedulePricing();
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => UUIDsEqual(p.ID, line.ProductID));
    }

    /** True when the line books to a different company than the order's selling company. */
    public ShowsForeignRevenue(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const product = this.ProductFor(line);
        if (!product?.CompanyName) return false;
        const sellingID = this._order?.CompanyID;
        if (product.CompanyID && sellingID) return !UUIDsEqual(product.CompanyID, sellingID);
        const sellingName = this._order?.Company;
        if (!sellingName) return true;
        return product.CompanyName.trim().toLowerCase() !== String(sellingName).trim().toLowerCase();
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines.find((priced) => UUIDsEqual(priced.ClientKey, line.ID));
    }

    public get CanOverride(): boolean {
        return this.EditMode && this.OverrideKind !== 'none';
    }

    public ApplicableFor(line: mjBizAppsOrdersOrderLineEntity): ApplicablePrice[] {
        return this.applicableByLine.get(line.ID) ?? [];
    }

    public SelectedPriceID(line: mjBizAppsOrdersOrderLineEntity): string {
        if (this.customAmountLineIds.has(line.ID)) return '__custom__';
        if (!this.IsOverridden(line)) return '';
        if (line.ProductPriceID) return String(line.ProductPriceID);
        return this.OverrideKind === 'any' ? '__custom__' : '';
    }

    public DisplayUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        if (this.IsOverridden(line)) return Number(line.UnitPrice ?? 0);
        return this.PricedLine(line)?.UnitPrice ?? null;
    }

    public DefaultLabel(line: mjBizAppsOrdersOrderLineEntity): string {
        const unit = this.DefaultUnit(line);
        return unit == null ? 'Default price' : `Default · ${unit.toFixed(2)}`;
    }

    public ShowCustomAmount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.OverrideKind === 'any' && this.SelectedPriceID(line) === '__custom__';
    }

    public CanExplainOverride(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const picked = this.SelectedPriceID(line);
        if (picked && picked !== '__custom__') return true;
        if (picked === '__custom__') {
            const typed = this.DisplayUnit(line);
            const def = this.DefaultUnit(line);
            if (typed == null || def == null) return typed != null;
            return !moneyEqual(typed, def);
        }
        return false;
    }

    public DefaultUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        if (this.defaultUnitByLine.has(line.ID)) return this.defaultUnitByLine.get(line.ID) ?? null;
        return this.IsOverridden(line) ? null : (this.PricedLine(line)?.UnitPrice ?? null);
    }

    public PickNamedPrice(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanOverride) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const id = target.value;
        if (!id) {
            this.ResetOverride(line);
            return;
        }
        if (id === '__custom__') {
            this.customAmountLineIds.add(line.ID);
            this.stamp(line, 'ProductPriceID', null);
            this.markOverridden(line);
            this.cdr.detectChanges();
            return;
        }
        this.customAmountLineIds.delete(line.ID);
        const hit = this.ApplicableFor(line).find((p) => UUIDsEqual(p.ID, id));
        if (!hit) return;
        this.stamp(line, 'ProductPriceID', hit.ID);
        this.stamp(line, 'UnitPrice', hit.UnitPrice);
        this.markOverridden(line);
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    public TypeAmount(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanOverride || this.OverrideKind !== 'any') return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const amount = Number.parseFloat(target.value);
        if (!Number.isFinite(amount) || amount < 0) return;
        this.customAmountLineIds.add(line.ID);
        this.stamp(line, 'ProductPriceID', null);
        this.stamp(line, 'UnitPrice', amount);
        this.markOverridden(line);
        this.schedulePricing();
    }

    public IsOverrideEditorOpen(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.overrideEditorLineIds.has(line.ID);
    }

    public ToggleOverrideEditor(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.CanOverride) return;
        if (this.overrideEditorLineIds.has(line.ID)) {
            this.overrideEditorLineIds.delete(line.ID);
            return;
        }
        this.overrideEditorLineIds.add(line.ID);
        if (this.OverrideKind === 'any' && this.IsOverridden(line) && !line.ProductPriceID) {
            this.customAmountLineIds.add(line.ID);
        }
        void this.refreshApplicable(line);
    }

    public DoneOverrideEditor(line: mjBizAppsOrdersOrderLineEntity): void {
        this.overrideEditorLineIds.delete(line.ID);
    }

    public ResetOverride(line: mjBizAppsOrdersOrderLineEntity): void {
        this.clearOverride(line);
        this.customAmountLineIds.delete(line.ID);
        this.overrideEditorLineIds.delete(line.ID);
        this.schedulePricing();
    }

    public IsOverridden(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const flag = line.GetFieldByName('PriceOverridden');
        if (flag && (flag.Value === true || flag.Value === 1 || flag.Value === '1')) return true;
        return FieldIsDirty(line, 'UnitPrice', 'ProductPriceID');
    }

    public OverrideReasonText(line: mjBizAppsOrdersOrderLineEntity): string {
        const field = line.GetFieldByName('PriceOverrideReason');
        return field?.Value == null ? '' : String(field.Value);
    }

    public SetOverrideReason(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanExplainOverride(line)) return;
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        const reason = target.value.trim();
        this.stamp(line, 'PriceOverridden', true);
        this.stamp(line, 'PriceOverrideReason', reason === '' ? null : reason);
    }

    public OpenProduct(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        if (!line.ProductID) return;
        this.Navigate.emit({
            Kind: 'record',
            EntityName: MJO_ENTITIES.Product,
            PrimaryKey: CompositeKey.FromID(line.ProductID),
        });
    }

    public OnExtensionNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
    }

    public OnExtensionFormCreated(form: BaseFormComponent): void {
        form.showEmptyFields = true;
        this.cdr.detectChanges();
    }

    private readonly hydratingLineIds = new Set<string>();

    public ExtensionFor(line: mjBizAppsOrdersOrderLineEntity): BaseEntity | null {
        if (line.EntityInfo?.Name !== MJO_ENTITIES.OrderLine) {
            return line;
        }
        if (line instanceof OrderLineEntity) {
            if (line.Extension?.Entity) {
                return line.Extension.Entity;
            }
            if (line.IsSaved && !this.hydratingLineIds.has(line.ID)) {
                const extName = this.ProductFor(line)?.OrderLineExtensionEntity;
                if (extName) {
                    void this.hydrateSingleLine(line, extName);
                }
            }
            return null;
        }
        return (line as unknown as OrderLineEntity).Extension?.Entity ?? null;
    }

    public ExtensionFormConfigFor(line: mjBizAppsOrdersOrderLineEntity): EntityFormConfig {
        return CachedExtensionFormConfig(this.extensionEntityName(line));
    }

    public IsExtensionOpen(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.expandedLineIds.has(line.ID);
    }

    public ToggleExtension(line: mjBizAppsOrdersOrderLineEntity): void {
        if (this.expandedLineIds.has(line.ID)) this.expandedLineIds.delete(line.ID);
        else this.expandedLineIds.add(line.ID);
    }

    public ExtensionLabel(line: mjBizAppsOrdersOrderLineEntity): string {
        return ExtensionToggleLabel(this.extensionEntityName(line));
    }

    public ExtensionHint(line: mjBizAppsOrdersOrderLineEntity): string {
        return ExtensionCollapsedHint(this.extensionEntityName(line));
    }

    public ngOnDestroy(): void {
        this.unbindOrder();
        this.pricing.CancelPending();
    }

    private get metadata(): IMetadataProvider {
        return this.Provider ?? Metadata.Provider;
    }

    private async onOrderBound(): Promise<void> {
        if (this.Catalog.length === 0) await this.loadCatalog();
        if (this._order && !this._order.Lines.IsLoaded && this._order.IsSaved) {
            await this._order.Lines.Load();
        }
        await this.hydrateExtensions();
        await this.resolveOverrideKind();
        this.schedulePricing();
        void this.refreshAllApplicable();
        this.cdr.detectChanges();
    }

    private unbindOrder(): void {
        this.expandedLineIds.clear();
        this.hydratingLineIds.clear();
        this.applicableByLine.clear();
        this.overrideEditorLineIds.clear();
        this.customAmountLineIds.clear();
        this.defaultUnitByLine.clear();
        this.OverrideKind = 'none';
    }

    private async addPlainLine(product: MJOProductOption): Promise<void> {
        if (!this._order) return;
        const line = await this._order.Lines.Create();
        line.ProductID = product.ID;
        line.Quantity = ClampLineQuantity(1, product.MaxQuantityPerLine);
    }

    private async addExtendedLine(product: MJOProductOption): Promise<void> {
        if (!this._order || !product.OrderLineExtensionEntity) return;
        CachedExtensionEntityInfo(this.metadata, product.OrderLineExtensionEntity);
        const line = (await this._order.Lines.Create()) as OrderLineEntity;
        line.ProductID = product.ID;
        line.Quantity = ClampLineQuantity(1, product.MaxQuantityPerLine);
        if (line instanceof OrderLineEntity) {
            await line.Extension.EnsureEntity(product.OrderLineExtensionEntity);
        }
        this.expandedLineIds.add(line.ID);
    }

    private async hydrateSingleLine(line: OrderLineEntity, extName: string): Promise<void> {
        if (this.hydratingLineIds.has(line.ID)) return;
        this.hydratingLineIds.add(line.ID);
        try {
            CachedExtensionEntityInfo(this.metadata, extName);
            await line.Extension.EnsureEntity(extName);
            this.cdr.detectChanges();
        } finally {
            this.hydratingLineIds.delete(line.ID);
        }
    }

    private async hydrateExtensions(): Promise<void> {
        if (!this._order) return;
        if (this.Catalog.length === 0) await this.loadCatalog();
        for (const line of this.Lines) {
            const extName = this.ProductFor(line)?.OrderLineExtensionEntity;
            if (extName && line.IsSaved) {
                if (line instanceof OrderLineEntity) {
                    await this.hydrateSingleLine(line, extName);
                } else if ((line as unknown as OrderLineEntity).Extension) {
                    await this.hydrateSingleLine(line as unknown as OrderLineEntity, extName);
                }
            }
        }
    }

    private clampQuantity(line: mjBizAppsOrdersOrderLineEntity, quantity: number): number {
        return ClampLineQuantity(quantity, this.ProductFor(line)?.MaxQuantityPerLine);
    }

    private extensionEntityName(line: mjBizAppsOrdersOrderLineEntity): string {
        return (
            this.ExtensionFor(line)?.EntityInfo.Name ??
            this.ProductFor(line)?.OrderLineExtensionEntity ??
            ''
        );
    }

    private async loadCatalog(): Promise<void> {
        try {
            this.Catalog = await GetCatalogOptions(this.metadata.CurrentUser);
            this.CatalogError = null;
        } catch (error) {
            this.Catalog = [];
            this.CatalogError = error instanceof Error ? error.message : String(error);
        }
    }

    private updatePickerFlip(): void {
        // Measure after the list is in the DOM so max-height (240px) is the right budget.
        requestAnimationFrame(() => {
            const host = this.pickerHost?.nativeElement;
            if (!host || !this.PickerOpen) {
                this.PickerOpensUp = false;
                return;
            }
            const rect = host.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const listHeight = 240;
            this.PickerOpensUp = spaceBelow < listHeight && spaceAbove > spaceBelow;
            this.cdr.detectChanges();
        });
    }

    private schedulePricing(): void {
        if (!this._order) return;
        this.pricing.SchedulePricing(this._order, (state) => {
            this.Pricing = state;
            this.PricingChanged.emit(state);
            for (const line of this.Lines) {
                if (!this.IsOverridden(line)) {
                    this.defaultUnitByLine.set(line.ID, this.PricedLine(line)?.UnitPrice ?? null);
                }
            }
            this.cdr.detectChanges();
        });
    }

    private stamp(line: mjBizAppsOrdersOrderLineEntity, fieldName: string, value: unknown): void {
        const field = line.GetFieldByName(fieldName);
        if (!field) return;
        const baseline = field.OldValue;
        field.Value = value;
        if (!field.Dirty) field.RestoreOldValue(baseline);
    }

    private clearOverride(line: mjBizAppsOrdersOrderLineEntity): void {
        const unit = line.GetFieldByName('UnitPrice');
        const named = line.GetFieldByName('ProductPriceID');
        if (unit) unit.Value = unit.OldValue;
        if (named) named.Value = named.OldValue;
        this.stamp(line, 'PriceOverridden', false);
        this.stamp(line, 'PriceOverrideReason', null);
    }

    private markOverridden(line: mjBizAppsOrdersOrderLineEntity): void {
        this.stamp(line, 'PriceOverridden', true);
    }

    private async resolveOverrideKind(): Promise<void> {
        const user = this.metadata.CurrentUser as UserInfo | null;
        this.OverrideKind = userPriceOverrideKind(user, this.metadata);
        if (this.OverrideKind !== 'none') return;
        if (!priceOverrideCatalogInstalled(this.metadata)) return;
        this.OverrideKind = await this.overrideKindFromLiveRoles(user);
    }

    private async overrideKindFromLiveRoles(user: UserInfo | null): Promise<PriceOverrideKind> {
        const roleIDs = (user?.UserRoles ?? []).map((r) => r.RoleID).filter(Boolean);
        if (!roleIDs.length) return 'none';
        const quoted = roleIDs.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
        const rv = new RunView();
        const res = await rv.RunView<{ Authorization: string; Type: string }>({
            EntityName: 'MJ: Authorization Roles',
            ExtraFilter: `RoleID IN (${quoted}) AND Type LIKE 'Allow%' AND Authorization LIKE 'MJ.BizApps.Orders.Price.Override%'`,
            ResultType: 'simple',
        });
        const names = (res.Success ? res.Results : [])
            .map((row) => String(row.Authorization ?? ''))
            .filter(Boolean);
        if (names.some((n) => n === 'MJ.BizApps.Orders.Price.OverrideAny' || n === 'MJ.BizApps.Orders.Price.Override')) {
            return 'any';
        }
        if (names.includes('MJ.BizApps.Orders.Price.OverrideList')) return 'list';
        return 'none';
    }

    private async refreshAllApplicable(): Promise<void> {
        if (!this.CanOverride) return;
        await Promise.all(this.Lines.map((line) => this.refreshApplicable(line)));
        this.cdr.detectChanges();
    }

    private async refreshApplicable(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        if (!this.CanOverride || !this._order || !line.ProductID) return;
        const user = this.metadata.CurrentUser as UserInfo | null;
        if (!user) return;
        try {
            await LoadOrdersEngine(this.metadata, user);
            const product = OrdersEngine.Instance.ProductByID(line.ProductID);
            const companyID = product?.CompanyID ?? this._order.CompanyID;
            if (!companyID) return;
            const ctx = {
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: companyID,
                Quantity: Number(line.Quantity ?? 0),
                AsOf: this._order.OrderDate ? new Date(this._order.OrderDate) : new Date(),
                OrganizationID: this._order.BillToOrganizationID ?? null,
                PersonID: this._order.BillToPersonID ?? null,
                ApplicabilityContext: await loadApplicabilityContext(
                    {
                        OrderHeaderID: this._order.ID ?? null,
                        ProductID: line.ProductID,
                        BillToPersonID: this._order.BillToPersonID ?? null,
                        BillToOrganizationID: this._order.BillToOrganizationID ?? null,
                        ShipToPersonID: this._order.ShipToPersonID ?? null,
                        ShipToOrganizationID: this._order.ShipToOrganizationID ?? null,
                        BillToAddressID: this._order.BillToAddressID ?? null,
                        ShipToAddressID: this._order.ShipToAddressID ?? null,
                    },
                    this.metadata,
                    user,
                ),
            };
            this.applicableByLine.set(line.ID, await ListApplicablePrices(ctx, this.metadata, user));
        } catch {
            this.applicableByLine.set(line.ID, []);
        }
    }
}
