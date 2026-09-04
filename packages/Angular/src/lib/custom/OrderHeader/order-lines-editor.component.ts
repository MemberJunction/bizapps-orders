import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    BaseEntity,
    CompositeKey,
    Metadata,
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
    ListApplicablePrices,
    loadApplicabilityContext,
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
    public CatalogError: string | null = null;
    /** `unsynced` = auth catalog not pushed yet, so the gate is off and both controls show. */
    public OverrideAccess: PriceOverrideKind | 'unsynced' = 'none';
    private readonly applicableByLine = new Map<string, ApplicablePrice[]>();

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
    }

    public ClosePickerSoon(): void {
        setTimeout(() => {
            this.PickerOpen = false;
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
        this.cdr.detectChanges();
    }

    public Bump(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        if (!this.EditMode) return;
        line.Quantity = this.clampQuantity(line, Number(line.Quantity ?? 0) + delta);
        this.schedulePricing();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        line.Quantity = this.clampQuantity(line, Number.parseFloat(target.value));
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
        this._order?.Lines.Remove(line);
        this.schedulePricing();
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => UUIDsEqual(p.ID, line.ProductID));
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines.find((priced) => UUIDsEqual(priced.ClientKey, line.ID));
    }

    public get CanPickNamedPrice(): boolean {
        return this.OverrideAccess === 'list' || this.OverrideAccess === 'any' || this.OverrideAccess === 'unsynced';
    }

    public get CanTypeAmount(): boolean {
        return this.OverrideAccess === 'any' || this.OverrideAccess === 'unsynced';
    }

    public ApplicableFor(line: mjBizAppsOrdersOrderLineEntity): ApplicablePrice[] {
        return this.applicableByLine.get(line.ID) ?? [];
    }

    public SelectedNamedPriceID(line: mjBizAppsOrdersOrderLineEntity): string {
        return line.ProductPriceID ?? '';
    }

    public StatedAmountValue(line: mjBizAppsOrdersOrderLineEntity): number | string {
        const field = line.GetFieldByName('UnitPrice');
        if (field?.Dirty) return Number(line.UnitPrice ?? 0);
        return this.PricedLine(line)?.UnitPrice ?? '';
    }

    public OnPickNamedPrice(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const id = target.value;
        if (!id) {
            this.clearStatedPrice(line);
            this.schedulePricing();
            return;
        }
        const pick = this.ApplicableFor(line).find((p) => UUIDsEqual(p.ID, id));
        if (!pick) return;
        line.ProductPriceID = pick.ID;
        line.UnitPrice = pick.UnitPrice;
        this.schedulePricing();
    }

    public OnTypeAmount(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode || !this.CanTypeAmount) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const raw = Number.parseFloat(target.value);
        if (!Number.isFinite(raw)) return;
        line.UnitPrice = raw;
        this.schedulePricing();
    }

    private clearStatedPrice(line: mjBizAppsOrdersOrderLineEntity): void {
        const unit = line.GetFieldByName('UnitPrice');
        if (unit) unit.Value = unit.OldValue;
        const price = line.GetFieldByName('ProductPriceID');
        if (price) price.Value = price.OldValue;
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
        this.resolveOverrideAccess();
        if (this.Catalog.length === 0) await this.loadCatalog();
        if (this._order && !this._order.Lines.IsLoaded && this._order.IsSaved) {
            await this._order.Lines.Load();
        }
        await this.hydrateExtensions();
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    private resolveOverrideAccess(): void {
        const provider = this.metadata;
        const user = new Metadata().CurrentUser as UserInfo | null;
        if (!priceOverrideCatalogInstalled(provider)) {
            this.OverrideAccess = 'unsynced';
            return;
        }
        this.OverrideAccess = userPriceOverrideKind(user, provider);
    }

    private unbindOrder(): void {
        this.expandedLineIds.clear();
        this.hydratingLineIds.clear();
        this.applicableByLine.clear();
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

    private schedulePricing(): void {
        if (!this._order) return;
        this.pricing.SchedulePricing(this._order, (state) => {
            this.Pricing = state;
            this.PricingChanged.emit(state);
            if (!state.Loading) void this.refreshAllApplicable();
            this.cdr.detectChanges();
        });
    }

    private async refreshAllApplicable(): Promise<void> {
        await Promise.all(this.Lines.map((line) => this.refreshApplicableForLine(line)));
        this.cdr.detectChanges();
    }

    private async refreshApplicableForLine(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        if (!this._order || !line.ProductID) return;
        const product = this.ProductFor(line);
        const companyId = product?.CompanyID || this._order.CompanyID;
        if (!companyId) {
            this.applicableByLine.set(line.ID, []);
            return;
        }
        const md = new Metadata();
        const user = md.CurrentUser as UserInfo | null;
        const provider = this.metadata;
        if (!user) return;
        try {
            const ctx = {
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: companyId,
                Quantity: Number(line.Quantity ?? 0),
                AsOf: this._order.OrderDate ? new Date(this._order.OrderDate) : new Date(),
                OrganizationID: this._order.BillToOrganizationID ?? null,
                PersonID: this._order.BillToPersonID ?? null,
                ApplicabilityContext: await loadApplicabilityContext(
                    {
                        OrderHeaderID: this._order.ID,
                        ProductID: line.ProductID,
                        BillToPersonID: this._order.BillToPersonID ?? null,
                        BillToOrganizationID: this._order.BillToOrganizationID ?? null,
                        ShipToPersonID: this._order.ShipToPersonID ?? null,
                        ShipToOrganizationID: this._order.ShipToOrganizationID ?? null,
                        BillToAddressID: this._order.BillToAddressID ?? null,
                        ShipToAddressID: this._order.ShipToAddressID ?? null,
                        OrderFallback: this._order.IsSaved
                            ? null
                            : {
                                  OrderDate: this._order.OrderDate,
                                  Status: this._order.Status,
                                  BillToPersonID: this._order.BillToPersonID,
                                  BillToOrganizationID: this._order.BillToOrganizationID,
                                  ShipToPersonID: this._order.ShipToPersonID,
                                  ShipToOrganizationID: this._order.ShipToOrganizationID,
                                  BillToAddressID: this._order.BillToAddressID,
                                  ShipToAddressID: this._order.ShipToAddressID,
                              },
                    },
                    provider,
                    user,
                ),
            };
            this.applicableByLine.set(line.ID, await ListApplicablePrices(ctx, provider, user));
        } catch {
            this.applicableByLine.set(line.ID, []);
        }
    }
}
