import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    BaseEntity,
    CompositeKey,
    FieldValueCollection,
    Metadata,
    type BaseEntityEvent,
    type IMetadataProvider,
} from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    BaseFormsModule,
    DIALOG_FORM_CONFIG,
    type EntityFormConfig,
    type FormNavigationEvent,
} from '@memberjunction/ng-base-forms';
import {
    OrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { Subscription } from 'rxjs';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import { GetCatalogOptions, type MJOProductOption } from '../../data/orders-queries';
import { MJOPricingScheduler, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';
import {
    ExtensionEntityLabel,
    SimpleExtensionFields,
    type LineExtensionField,
} from './line-extension-fields';

export type LineExtensionMode = 'simple' | 'extended';

const EXTENSION_MODE_SETTING = 'mj.orders.orderLine.extensionMode';

/**
 * Inline catalog picker + line cards for an order header.
 *
 * Lines are `Order.Lines.Create()` children — or, when the product type
 * declares an `OrderLineExtensionEntity`, the IS-A child is created and its
 * parent is added to `Lines`. The leaf is saved after the header graph save.
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
    private saveSub: Subscription | null = null;
    private readonly extensions = new Map<string, BaseEntity>();

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
    public ExtensionError: string | null = null;
    public ExtensionMode: LineExtensionMode = readExtensionMode();

    public readonly ExtensionFormConfig: EntityFormConfig = {
        ...DIALOG_FORM_CONFIG,
        EnableRecordLinks: false,
        CollapsibleSections: true,
    };

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
        if (!this._order) return;
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
        line.Quantity = Math.max(1, Number(line.Quantity ?? 0) + delta);
        this.schedulePricing();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const n = Number.parseFloat(target.value);
        line.Quantity = !Number.isFinite(n) || n <= 0 ? 1 : n;
        this.schedulePricing();
    }

    public Remove(line: mjBizAppsOrdersOrderLineEntity): void {
        this.extensions.delete(line.ID);
        this._order?.Lines.Remove(line);
        this.schedulePricing();
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => UUIDsEqual(p.ID, line.ProductID));
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines.find((priced) => UUIDsEqual(priced.ClientKey, line.ID));
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

    public ExtensionFor(line: mjBizAppsOrdersOrderLineEntity): BaseEntity | null {
        return this.extensions.get(line.ID) ?? null;
    }

    public ExtensionLabelFor(line: mjBizAppsOrdersOrderLineEntity): string {
        const name =
            this.ExtensionFor(line)?.EntityInfo.Name ??
            this.ProductFor(line)?.OrderLineExtensionEntity ??
            '';
        return ExtensionEntityLabel(name);
    }

    public SimpleFieldsFor(line: mjBizAppsOrdersOrderLineEntity): LineExtensionField[] {
        const ext = this.ExtensionFor(line);
        return ext ? SimpleExtensionFields(ext) : [];
    }

    public SetExtensionMode(mode: LineExtensionMode): void {
        this.ExtensionMode = mode;
        UserInfoEngine.Instance.SetSettingDebounced(EXTENSION_MODE_SETTING, mode);
    }

    public ngOnDestroy(): void {
        this.unbindOrder();
        this.pricing.CancelPending();
    }

    private get metadata(): IMetadataProvider {
        return this.Provider ?? Metadata.Provider;
    }

    private async onOrderBound(): Promise<void> {
        this.bindOrderEvents();
        if (this.Catalog.length === 0) await this.loadCatalog();
        if (this._order && !this._order.Lines.IsLoaded && this._order.IsSaved) {
            await this._order.Lines.Load();
        }
        await this.hydrateExtensions();
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    private bindOrderEvents(): void {
        if (!this._order) return;
        this.saveSub = this._order.RegisterEventHandler((event) => {
            if (!isSuccessfulSaveEvent(event.type, event.payload)) return;
            void this.persistExtensions();
        });
    }

    private unbindOrder(): void {
        this.saveSub?.unsubscribe();
        this.saveSub = null;
    }

    private async addPlainLine(product: MJOProductOption): Promise<void> {
        if (!this._order) return;
        const line = await this._order.Lines.Create();
        line.ProductID = product.ID;
        line.Quantity = 1;
    }

    private async addExtendedLine(product: MJOProductOption): Promise<void> {
        if (!this._order || !product.OrderLineExtensionEntity) return;
        const ext = await this.metadata.GetEntityObject(
            product.OrderLineExtensionEntity,
            this.metadata.CurrentUser,
        );
        ext.NewRecord();
        const parent = ext.ISAParent;
        if (!isOrderLine(parent)) {
            await this.addPlainLine(product);
            return;
        }
        parent.ProductID = product.ID;
        parent.Quantity = 1;
        this._order.Lines.Add(parent);
        this.extensions.set(parent.ID, ext);
    }

    private async hydrateExtensions(): Promise<void> {
        const next = new Map<string, BaseEntity>();
        for (const line of this.Lines) {
            const kept = this.extensions.get(line.ID);
            if (kept) {
                next.set(line.ID, kept);
                continue;
            }
            const ext = await this.loadExtensionFor(line);
            if (ext) next.set(line.ID, ext);
        }
        this.extensions.clear();
        for (const [id, ext] of next) this.extensions.set(id, ext);
    }

    private async loadExtensionFor(line: mjBizAppsOrdersOrderLineEntity): Promise<BaseEntity | null> {
        const extName = this.ProductFor(line)?.OrderLineExtensionEntity;
        if (!extName) return null;
        if (line.ISAChild?.EntityInfo.Name === extName) return line.ISAChild;
        if (!line.IsSaved) return null;

        const ext = await this.metadata.GetEntityObject(extName, this.metadata.CurrentUser);
        if (await ext.InnerLoad(CompositeKey.FromID(line.ID))) return ext;

        // Child row is missing. NewRecord would also NewRecord the parent and try
        // to INSERT the Order Line again — hydrate the parent from the line we
        // already have so the later leaf save is an UPDATE + child INSERT.
        ext.NewRecord(new FieldValueCollection([{ FieldName: 'ID', Value: line.ID }]));
        const parent = ext.ISAParent;
        if (parent) {
            await parent.LoadFromData(line.GetAll(), true);
        }
        return ext;
    }

    private async persistExtensions(): Promise<void> {
        this.ExtensionError = null;
        for (const ext of this.extensions.values()) {
            if (ext.IsSaved && !ext.Dirty) continue;
            const saved = await ext.Save();
            if (!saved) {
                this.ExtensionError = ext.LatestResult?.CompleteMessage ?? 'Failed to save line extension';
            }
        }
        this.cdr.detectChanges();
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
            this.cdr.detectChanges();
        });
    }
}

function isOrderLine(entity: BaseEntity | null): entity is mjBizAppsOrdersOrderLineEntity {
    return entity != null && entity.EntityInfo.Name === MJO_ENTITIES.OrderLine;
}

function readExtensionMode(): LineExtensionMode {
    return UserInfoEngine.Instance.GetSetting(EXTENSION_MODE_SETTING) === 'extended'
        ? 'extended'
        : 'simple';
}

function isSuccessfulSaveEvent(
    type: BaseEntityEvent['type'],
    payload: BaseEntityEvent['payload'],
): boolean {
    if (type !== 'save' && type !== 'graph_save') return false;
    if (payload == null || typeof payload !== 'object') return true;
    if (!('Success' in payload)) return true;
    return payload.Success !== false;
}
