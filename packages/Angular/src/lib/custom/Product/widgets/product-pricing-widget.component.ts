import {
    Component,
    EventEmitter,
    Input,
    OnInit,
    OnChanges,
    SimpleChanges,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView, CompositeKey, EntityFieldTSType } from '@memberjunction/core';
import {
    createEmptyFilter,
    type CompositeFilterDescriptor,
    type FilterFieldInfo,
} from '@memberjunction/ng-filter-builder';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { NavigationService } from '@memberjunction/ng-shared';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersPriceListEntity
} from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../../../panels/money-format';
import { PRICE_APPLICABILITY_SOURCES, priceApplies } from '@mj-biz-apps/orders-entities';

export interface PriceChannel {
    ID: string | null;
    Name: string;
    Icon: string;
    TierCount: number;
    DiscountDescription?: string;
}

export interface LadderTierRow {
    Record: mjBizAppsOrdersProductPriceEntity;
    ID: string;
    TierNumber: number;
    BracketLabel: string;
    MinQuantity: number;
    MaxQuantity: number | null;
    UnitRangeText: string;
    Amount: number;
    DiscountPercent: number;
    UnitSavings: number;
    PricingModel: string;
    FeeType: string;
    EffectiveDatesText: string;
    IsBaseBracket: boolean;
}

export interface StepCurveBar {
    Label: string;
    Amount: number;
    FormattedAmount: string;
    Percentage: number;
}

export interface WidgetToast {
    Type: 'success' | 'error' | 'info';
    Message: string;
    Icon: string;
}

const PRODUCT_PRICES_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PRICE_LISTS_ENTITY = 'MJ_BizApps_Orders: Price Lists';
const PRODUCT_CATEGORIES_ENTITY = 'MJ_BizApps_Orders: Product Categories';

export interface PriceCard {
    ID: string;
    Name: string;
    Amount: number;
    Inherited: boolean;
    SourceLabel: string;
    WhenText: string;
    Record: mjBizAppsOrdersProductPriceEntity;
}

/** Dotted Source.Field labels for the When sentence. */
const PRICE_WHEN_FIELDS: Array<{ name: string; displayName: string }> = [
    { name: 'BillToOrganization.Type', displayName: 'Bill-to organization · Type' },
    { name: 'BillToOrganization.Status', displayName: 'Bill-to organization · Status' },
    { name: 'BillToOrganization.Name', displayName: 'Bill-to organization · Name' },
    { name: 'BillToPerson.Title', displayName: 'Bill-to person · Title' },
    { name: 'BillToPerson.Status', displayName: 'Bill-to person · Status' },
    { name: 'ShipToOrganization.Type', displayName: 'Ship-to organization · Type' },
    { name: 'Order.Status', displayName: 'Order · Status' },
    { name: 'Order.OrderDate', displayName: 'Order · Date' },
    { name: 'Product.SKU', displayName: 'Product · SKU' },
    { name: 'Product.Status', displayName: 'Product · Status' },
];

/**
 * World-Class Product Pricing Matrix & Volume Ladder Widget (Option 1).
 *
 * Provides commercial channel segmentation (Base List, Wholesale, Partner),
 * rapid 1-click volume tier ladder configuration with automatic gap/overlap protection,
 * live discount & savings math, non-intrusive toast notifications, and an interactive step curve.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-pricing-widget',
    templateUrl: './product-pricing-widget.component.html',
    styleUrls: ['./product-pricing-widget.component.css'],
})
export class BizAppsProductPricingWidgetComponent implements OnInit, OnChanges {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() public PriceChanged = new EventEmitter<void>();
    @Output() public TierAdded = new EventEmitter<mjBizAppsOrdersProductPriceEntity>();

    private cdr?: ChangeDetectorRef;
    private navService?: NavigationService;

    constructor() {
        try {
            this.cdr = inject(ChangeDetectorRef, { optional: true }) ?? undefined;
        } catch {
            this.cdr = undefined;
        }
        try {
            this.navService = inject(NavigationService, { optional: true }) ?? undefined;
        } catch {
            this.navService = undefined;
        }
    }

    public IsLoading = false;
    public IsSaving = false;
    public IsAdvancedGridView = false;
    public QuoteDrawerOpen = false;
    public ExpandedPriceID: string | null = null;
    public SelectedPriceID: string | null = null;
    public WhenEditorPriceID: string | null = null;
    public AdvancedEditingID: string | null = null;
    public WhenFilter: CompositeFilterDescriptor | null = null;
    public WhenFields: FilterFieldInfo[] = [];
    public NewPriceName = 'Base';
    public NewPriceAmount = 0;
    public QuoteOrgType = 'Member';
    public QuoteResult = { AmountText: '—', Why: '', Skipped: '' };
    public InheritedRecords: mjBizAppsOrdersProductPriceEntity[] = [];

    public ActiveToast: WidgetToast | null = null;
    private toastTimer?: ReturnType<typeof setTimeout>;

    public Channels: PriceChannel[] = [
        { ID: null, Name: 'Base / Direct List', Icon: 'fa-solid fa-globe', TierCount: 0 }
    ];
    public SelectedChannelID: string | null = null;

    public AllPriceRecords: mjBizAppsOrdersProductPriceEntity[] = [];
    public LadderTiers: LadderTierRow[] = [];
    public StepBars: StepCurveBar[] = [];

    // Quick Add Tier Model
    public NewTierMin = 1;
    public NewTierMax: number | null = null;
    public NewTierPrice = 0;
    public NewTierModel: 'Volume' | 'PerUnit' | 'Tiered' | 'Flat' = 'Volume';

    // Pricing Simulation
    public SimQuantity = 1;
    public SimResult = {
        DiscountPercent: 0,
        UnitPrice: 0,
        TotalAmount: 0,
        TotalSavings: 0,
    };

    public RecalculateSimulation(): void {
        const base = this.BaseListPrice;
        let discount = 0;
        if (this.SimQuantity >= 50) {
            discount = 25;
        } else if (this.SimQuantity >= 25) {
            discount = 15;
        } else if (this.SimQuantity >= 10) {
            discount = 10;
        }
        const unit = base * (1 - discount / 100);
        const total = unit * this.SimQuantity;
        const savings = (base * this.SimQuantity) - total;
        this.SimResult = {
            DiscountPercent: discount,
            UnitPrice: unit,
            TotalAmount: total,
            TotalSavings: savings,
        };
    }

    ngOnInit(): void {
        this.LoadPricingData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Product'] && !changes['Product'].isFirstChange()) {
            this.LoadPricingData();
        }
    }

    public get BaseListPrice(): number {
        // First base-channel ProductPrice. Never Product.StandaloneSellingPrice (deprecated).
        const baseFirstTier = this.AllPriceRecords.find(p => !p.PriceListID && (Number(p.MinQuantity) === 1 || !p.MinQuantity));
        if (baseFirstTier && Number(baseFirstTier.Amount) > 0) {
            return Number(baseFirstTier.Amount);
        }
        return 0;
    }

    public get FormattedBasePrice(): string {
        return FormatMoney(this.BaseListPrice);
    }

    /** Price-list tabs only when a real list exists. One "Base / Direct List" tab is leftover chrome. */
    public get ShowChannelBar(): boolean {
        return this.Channels.some((c) => c.ID != null);
    }

    public get PricesForChannel(): mjBizAppsOrdersProductPriceEntity[] {
        return this.AllPriceRecords.filter((p) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID,
        );
    }

    public get VisiblePrices(): PriceCard[] {
        const inChannel = (p: mjBizAppsOrdersProductPriceEntity) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID;
        const productRows = this.AllPriceRecords.filter(inChannel);
        const names = new Set(productRows.map((p) => this.PriceDisplayName(p).trim().toLowerCase()));
        const inherited = this.InheritedRecords.filter(
            (p) => inChannel(p) && !names.has(this.PriceDisplayName(p).trim().toLowerCase()),
        );
        const toCard = (p: mjBizAppsOrdersProductPriceEntity, inherited: boolean): PriceCard => ({
            ID: p.ID,
            Name: this.PriceDisplayName(p),
            Amount: Number(p.Amount) || 0,
            Inherited: inherited,
            SourceLabel: inherited ? 'From category' : 'This product',
            WhenText: this.WhenSentence(p),
            Record: p,
        });
        const productCards = productRows
            .map((p) => toCard(p, false))
            .sort((a, b) => (Number(b.Record.Priority) || 0) - (Number(a.Record.Priority) || 0));
        return [...productCards, ...inherited.map((p) => toCard(p, true))];
    }

    public PriceCanExpand(row: PriceCard): boolean {
        if (row.Inherited) return this.EditMode;
        if (this.EditMode) return true;
        return this.HasAdvanced(row.Record);
    }

    public PriceDisplayName(p: mjBizAppsOrdersProductPriceEntity): string {
        const n = (p as { Name?: string }).Name?.trim();
        if (n) return n;
        return p.Description?.trim() || 'Price';
    }

    public HasWhen(p: mjBizAppsOrdersProductPriceEntity): boolean {
        return this.WhenSentence(p).length > 0;
    }

    public WhenSentence(p: mjBizAppsOrdersProductPriceEntity): string {
        const raw = (p as { Applicability?: string | null }).Applicability;
        if (raw == null || String(raw).trim() === '') return '';
        try {
            const parsed = JSON.parse(String(raw)) as {
                logic?: string;
                filters?: Array<{ field?: string; operator?: string; value?: unknown; logic?: string; filters?: Array<{ field?: string; operator?: string; value?: unknown }> }>;
            };
            const parts = (parsed.filters ?? []).map((f) => this.whenPart(f)).filter(Boolean);
            if (parts.length === 0) return '';
            const join = parsed.logic === 'or' ? ' or ' : ' and ';
            return parts.join(join);
        } catch {
            return 'Has a When';
        }
    }

    private whenPart(node: {
        field?: string;
        operator?: string;
        value?: unknown;
        logic?: string;
        filters?: Array<{ field?: string; operator?: string; value?: unknown }>;
    }): string {
        if (node.filters?.length) {
            const inner = node.filters.map((f) => this.whenPart(f)).filter(Boolean).join(node.logic === 'or' ? ' or ' : ' and ');
            return inner ? `(${inner})` : '';
        }
        if (!node.field) return '';
        const labels: Record<string, string> = {
            eq: 'equals',
            neq: 'does not equal',
            gt: 'is greater than',
            gte: 'is at least',
            lt: 'is less than',
            lte: 'is at most',
            contains: 'contains',
            doesnotcontain: 'does not contain',
            startswith: 'starts with',
            endswith: 'ends with',
            isnull: 'is empty',
            isnotnull: 'is not empty',
            isempty: 'is empty',
            isnotempty: 'is not empty',
        };
        const field = this.whenFieldLabel(node.field);
        const op = labels[node.operator ?? ''] ?? node.operator ?? '';
        if (['isnull', 'isnotnull', 'isempty', 'isnotempty'].includes(node.operator ?? '')) {
            return `${field} ${op}`;
        }
        const val = node.value == null || node.value === '' ? '' : String(node.value);
        return `${field} ${op} ${val}`.trim();
    }

    private whenFieldLabel(stored: string): string {
        const hit = PRICE_WHEN_FIELDS.find((f) => f.name === stored);
        return hit?.displayName ?? stored.replace('.', ' · ');
    }

    public OpenPriceRecord(p: mjBizAppsOrdersProductPriceEntity, event?: Event): void {
        event?.stopPropagation();
        this.Navigate.emit({
            Kind: 'record',
            EntityName: PRODUCT_PRICES_ENTITY,
            PrimaryKey: CompositeKey.FromID(p.ID),
        });
        if (this.navService) {
            this.navService.OpenEntityRecord(PRODUCT_PRICES_ENTITY, CompositeKey.FromID(p.ID));
        }
    }

    public CloseQuote(): void {
        this.QuoteDrawerOpen = false;
        this.cdr?.markForCheck();
    }

    public TogglePrice(row: PriceCard): void {
        this.SelectedPriceID = row.ID;
        if (!this.PriceCanExpand(row)) {
            this.ExpandedPriceID = null;
            this.cdr?.markForCheck();
            return;
        }
        this.ExpandedPriceID = this.ExpandedPriceID === row.ID ? null : row.ID;
        this.cdr?.markForCheck();
    }

    public async OnPriceDrop(event: CdkDragDrop<PriceCard[]>): Promise<void> {
        if (!this.EditMode) return;
        const ranked = this.VisiblePrices.filter((r) => !r.Inherited);
        if (event.previousIndex === event.currentIndex) return;
        if (event.previousIndex < 0 || event.currentIndex < 0) return;
        if (event.previousIndex >= ranked.length || event.currentIndex >= ranked.length) return;
        moveItemInArray(ranked, event.previousIndex, event.currentIndex);
        let priority = ranked.length * 10;
        for (const row of ranked) {
            row.Record.Priority = priority;
            priority -= 10;
        }
        await this.saveProductGraph();
        this.cdr?.markForCheck();
    }

    public get ProductPricesViewParams(): RunViewParams | null {
        if (!this.Product?.ID) return null;
        return {
            EntityName: PRODUCT_PRICES_ENTITY,
            ExtraFilter: `ProductID = '${this.Product.ID}'`,
            OrderBy: 'MinQuantity ASC, EffectiveFrom DESC',
            ResultType: 'entity_object',
        };
    }

    public get NewPriceRecordValues(): Record<string, unknown> {
        return {
            ProductID: this.Product?.ID,
            PriceListID: this.SelectedChannelID,
            Name: 'Price',
        };
    }

    public async LoadPricingData(): Promise<void> {
        if (!this.Product?.ID) return;

        this.IsLoading = true;
        this.cdr?.markForCheck();

        try {
            if (this.Product.Prices) {
                await this.Product.Prices.Load();
                this.AllPriceRecords = [...this.Product.Prices.Items];
            } else {
                const rv = new RunView();
                const pricesResult = await rv.RunView<mjBizAppsOrdersProductPriceEntity>({
                    EntityName: PRODUCT_PRICES_ENTITY,
                    ExtraFilter: `ProductID = '${this.Product.ID}'`,
                    OrderBy: 'MinQuantity ASC, __mj_CreatedAt ASC',
                    ResultType: 'entity_object',
                    MaxRows: 100,
                });
                if (pricesResult.Success && pricesResult.Results) {
                    this.AllPriceRecords = pricesResult.Results;
                } else {
                    console.warn('Could not retrieve product prices:', pricesResult.ErrorMessage);
                }
            }

            const rv = new RunView();
            const listsResult = await rv.RunView<mjBizAppsOrdersPriceListEntity>({
                EntityName: PRICE_LISTS_ENTITY,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
                MaxRows: 50,
            });

            await this.loadInheritedPrices();

            const availableLists: mjBizAppsOrdersPriceListEntity[] = listsResult.Success && listsResult.Results ? listsResult.Results : [];
            this.buildChannelsList(availableLists);
            this.rebuildLadder();
            if (!this.NewPriceAmount) {
                this.NewPriceAmount = this.BaseListPrice || 0;
            }
        } catch (err) {
            console.error('Failed to load product pricing records:', err);
        } finally {
            this.IsLoading = false;
            this.cdr?.markForCheck();
        }
    }

    private countPricesOnChannel(listId: string | null): number {
        const match = (p: mjBizAppsOrdersProductPriceEntity) =>
            listId === null ? !p.PriceListID : p.PriceListID === listId;
        const product = this.AllPriceRecords.filter(match);
        const names = new Set(product.map((p) => this.PriceDisplayName(p).trim().toLowerCase()));
        const inherited = this.InheritedRecords.filter(
            (p) => match(p) && !names.has(this.PriceDisplayName(p).trim().toLowerCase()),
        );
        return product.length + inherited.length;
    }

    private buildChannelsList(allPriceLists: mjBizAppsOrdersPriceListEntity[]): void {
        const channels: PriceChannel[] = [
            {
                ID: null,
                Name: 'Base / Direct List',
                Icon: 'fa-solid fa-globe',
                TierCount: this.countPricesOnChannel(null),
            }
        ];

        for (const pl of allPriceLists) {
            const tierCount = this.countPricesOnChannel(pl.ID);
            let icon = 'fa-solid fa-tags';
            const nameLower = (pl.Name || '').toLowerCase();
            if (nameLower.includes('wholesale')) icon = 'fa-solid fa-boxes-stacked';
            else if (nameLower.includes('partner')) icon = 'fa-solid fa-handshake';
            else if (nameLower.includes('gov') || nameLower.includes('non-profit')) icon = 'fa-solid fa-building-columns';
            else if (nameLower.includes('vip') || nameLower.includes('enterprise')) icon = 'fa-solid fa-crown';

            channels.push({
                ID: pl.ID,
                Name: pl.Name || 'Custom Price List',
                Icon: icon,
                TierCount: tierCount,
                DiscountDescription: pl.Description || undefined,
            });
        }

        this.Channels = channels;
    }

    public SelectChannel(channelId: string | null): void {
        this.SelectedChannelID = channelId;
        this.rebuildLadder();
    }

    public ToggleAdvancedView(): void {
        this.IsAdvancedGridView = !this.IsAdvancedGridView;
        this.cdr?.markForCheck();
    }

    private rebuildLadder(): void {
        const channelRecords = this.AllPriceRecords
            .filter(p => (this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID))
            .sort((a, b) => (Number(a.MinQuantity) || 0) - (Number(b.MinQuantity) || 0));

        const base = this.BaseListPrice;

        const tiers: LadderTierRow[] = channelRecords.map((rec, index) => {
            const min = Number(rec.MinQuantity) || 1;
            const max = rec.MaxQuantity != null && !isNaN(Number(rec.MaxQuantity)) ? Number(rec.MaxQuantity) : null;

            const amount = Number(rec.Amount) || 0;
            const savings = Math.max(0, base - amount);
            const discountPct = base > 0 ? Math.max(0, Math.round((savings / base) * 1000) / 10) : 0;

            let bracketLabel = `Tier ${index + 1}`;
            if (index === 0 && min === 1) bracketLabel = 'Tier 1 (Base)';
            else if (max != null && max <= 49) bracketLabel = `Tier ${index + 1} (Mid-Market)`;
            else if (max != null && max <= 99) bracketLabel = `Tier ${index + 1} (Volume)`;
            else bracketLabel = `Tier ${index + 1} (Enterprise)`;

            const rangeText = max != null ? `${min} – ${max} units` : `${min}+ units`;

            return {
                Record: rec,
                ID: rec.ID,
                TierNumber: index + 1,
                BracketLabel: bracketLabel,
                MinQuantity: min,
                MaxQuantity: max,
                UnitRangeText: rangeText,
                Amount: amount,
                DiscountPercent: discountPct,
                UnitSavings: savings,
                PricingModel: rec.PricingModel || 'PerUnit',
                FeeType: rec.FeeType || 'Standard',
                EffectiveDatesText: rec.EffectiveTo ? `Until ${new Date(rec.EffectiveTo).toLocaleDateString()}` : 'Always Active',
                IsBaseBracket: index === 0 && min === 1 && this.SelectedChannelID === null,
            };
        });

        this.LadderTiers = tiers;

        // Auto-configure quick-add fields for next tier
        if (tiers.length === 0) {
            this.NewTierMin = 1;
            this.NewTierMax = 9;
            this.NewTierPrice = base > 0 ? base : 100;
            this.NewTierModel = 'PerUnit';
        } else {
            const lastTier = tiers[tiers.length - 1];
            if (lastTier.MaxQuantity != null && !isNaN(Number(lastTier.MaxQuantity))) {
                this.NewTierMin = Number(lastTier.MaxQuantity) + 1;
                this.NewTierMax = this.NewTierMin + 49;
                this.NewTierPrice = Math.max(1, Math.round((Number(lastTier.Amount) || base || 100) * 0.85));
            } else {
                this.NewTierMin = (Number(lastTier.MinQuantity) || 1) + 50;
                this.NewTierMax = null;
                this.NewTierPrice = Math.max(1, Math.round((Number(lastTier.Amount) || base || 100) * 0.85));
            }
            this.NewTierModel = 'Volume';
        }

        // Build Step Curve Bars
        this.buildStepBars(tiers, base);
        this.cdr?.markForCheck();
    }

    private buildStepBars(tiers: LadderTierRow[], basePrice: number): void {
        if (tiers.length === 0) {
            this.StepBars = [];
            return;
        }

        let maxPrice = basePrice;
        for (const t of tiers) {
            if (t.Amount > maxPrice) maxPrice = t.Amount;
        }

        this.StepBars = tiers.map(t => {
            const pct = maxPrice > 0 ? Math.max(12, Math.round((t.Amount / maxPrice) * 100)) : 100;
            const shortLabel = t.MaxQuantity != null ? `${t.MinQuantity}–${t.MaxQuantity}` : `${t.MinQuantity}+`;
            return {
                Label: shortLabel,
                Amount: t.Amount,
                FormattedAmount: FormatMoney(t.Amount),
                Percentage: pct,
            };
        });
    }

    public async AddTierBracket(): Promise<void> {
        if (!this.Product?.ID) {
            this.ShowToast('Cannot add pricing tier: Product must be saved first.', 'error');
            return;
        }

        const minQty = Number(this.NewTierMin) || 1;
        const maxQtyVal = this.NewTierMax != null && String(this.NewTierMax).trim() !== '' 
            ? Number(this.NewTierMax) 
            : null;
        const maxQty = maxQtyVal !== null && !isNaN(maxQtyVal) && maxQtyVal >= minQty 
            ? maxQtyVal 
            : null;
        const amount = Number(this.NewTierPrice);

        this.IsSaving = true;
        this.cdr?.markForCheck();

        try {
            // 1. Auto-adjust prior open-ended or overlapping sibling tiers in the same channel
            const channelSiblings = this.AllPriceRecords.filter(p => 
                (this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID) &&
                p.Status === 'Active' &&
                (p.FeeType || 'Standard') === 'Standard'
            );

            for (const sib of channelSiblings) {
                const sibMin = Number(sib.MinQuantity) || 1;
                const sibMax = sib.MaxQuantity != null ? Number(sib.MaxQuantity) : null;

                // If sibling started before our new tier and has open end (null) or extends into our range
                if (sibMin < minQty && (sibMax === null || sibMax >= minQty)) {
                    sib.MaxQuantity = minQty - 1;
                    const sibSaved = await sib.Save();
                    if (!sibSaved) {
                        console.warn('Could not adjust sibling tier upper bound:', sib.LatestResult);
                    }
                }
            }

            // 2. Instantiate and save the new tier bracket
            let newPrice: mjBizAppsOrdersProductPriceEntity;

            if (this.Product.Prices) {
                newPrice = await this.Product.Prices.Create();
            } else {
                const md = new Metadata();
                const obj = await md.GetEntityObject<mjBizAppsOrdersProductPriceEntity>(PRODUCT_PRICES_ENTITY);
                if (!obj) throw new Error(`Failed to create entity object for ${PRODUCT_PRICES_ENTITY}`);
                newPrice = obj;
            }

            newPrice.ProductID = this.Product.ID;
            newPrice.PriceListID = this.SelectedChannelID;
            newPrice.MinQuantity = minQty;
            newPrice.MaxQuantity = maxQty;
            newPrice.Amount = isNaN(amount) ? 0 : amount;
            newPrice.PricingModel = this.NewTierModel || 'Volume';
            newPrice.FeeType = 'Standard';
            newPrice.Priority = 0;
            newPrice.Status = 'Active';
            newPrice.EffectiveFrom = new Date();
            const bracket = maxQty != null ? `${minQty}–${maxQty}` : `${minQty}+`;
            newPrice.Name = `${this.NewTierModel || 'Volume'} ${bracket}`.slice(0, 100);

            const saved = await newPrice.Save();
            if (saved) {
                await this.LoadPricingData();
                this.PriceChanged.emit();
                this.TierAdded.emit(newPrice);
                const bracketDesc = maxQty != null ? `${minQty}–${maxQty} units` : `${minQty}+ units`;
                this.ShowToast(`Added tier bracket (${bracketDesc}) for ${this.FormatCurrency(amount)}`, 'success');
            } else {
                console.error('Failed to save product price record:', newPrice.LatestResult);
                const errMsg = this.extractErrorMessage(newPrice.LatestResult);
                this.ShowToast(`Could not save pricing bracket: ${errMsg}`, 'error', 6000);
            }
        } catch (err) {
            console.error('Failed to create tier bracket:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            this.ShowToast(`Error creating pricing bracket: ${errMsg}`, 'error', 6000);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    public async OnPriceInputBlur(tier: LadderTierRow, event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const rawVal = parseFloat(input.value.replace(/[^0-9.]/g, ''));
        if (isNaN(rawVal) || rawVal === tier.Amount) {
            input.value = this.FormatCurrency(tier.Amount);
            return;
        }

        tier.Record.Amount = rawVal;
        this.IsSaving = true;
        this.cdr?.markForCheck();

        try {
            const saved = await tier.Record.Save();
            if (saved) {
                await this.LoadPricingData();
                this.PriceChanged.emit();
                this.ShowToast(`Updated price for ${tier.BracketLabel} to ${this.FormatCurrency(rawVal)}`, 'success');
            } else {
                console.error('Failed to update price:', tier.Record.LatestResult);
                const errMsg = this.extractErrorMessage(tier.Record.LatestResult);
                this.ShowToast(`Failed to update price: ${errMsg}`, 'error');
                input.value = this.FormatCurrency(tier.Amount);
            }
        } catch (err) {
            console.error('Failed to update tier price:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            this.ShowToast(`Error updating price: ${errMsg}`, 'error');
            input.value = this.FormatCurrency(tier.Amount);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    public async DeleteTier(tier: LadderTierRow): Promise<void> {
        this.IsSaving = true;
        this.cdr?.markForCheck();
        try {
            if (!(await this.ensurePricesLoaded())) return;
            this.Product.Prices.Remove(tier.Record);
            const saved = await this.saveProductGraph();
            if (saved) {
                this.PriceChanged.emit();
                this.ShowToast(`Deleted ${tier.BracketLabel} (${tier.UnitRangeText})`, 'info');
                await this.LoadPricingData();
            }
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error');
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    public OpenTierRecord(tier: LadderTierRow): void {
        this.Navigate.emit({
            Kind: 'record',
            EntityName: PRODUCT_PRICES_ENTITY,
            PrimaryKey: CompositeKey.FromID(tier.ID),
        });
        if (this.navService) {
            this.navService.OpenEntityRecord(PRODUCT_PRICES_ENTITY, CompositeKey.FromID(tier.ID));
        }
    }

    public OpenNewPriceDialog(): void {
        this.Navigate.emit({
            Kind: 'new-record',
            EntityName: PRODUCT_PRICES_ENTITY,
            DefaultValues: this.NewPriceRecordValues,
        });
        if (this.navService) {
            this.navService.OpenNewEntityRecord(PRODUCT_PRICES_ENTITY, this.NewPriceRecordValues);
        }
    }

    public ShowToast(message: string, type: 'success' | 'error' | 'info' = 'info', durationMs = 4000): void {
        let icon = 'fa-solid fa-circle-info';
        if (type === 'success') icon = 'fa-solid fa-circle-check';
        if (type === 'error') icon = 'fa-solid fa-triangle-exclamation';

        this.ActiveToast = { Type: type, Message: message, Icon: icon };
        this.cdr?.markForCheck();

        try {
            const store = GetGlobalObjectStore();
            const notifService = store ? (store['MJNotificationService'] as { CreateSimpleNotification?: (m: string, t: string, d: number) => void } | undefined) : undefined;
            if (notifService && typeof notifService.CreateSimpleNotification === 'function') {
                notifService.CreateSimpleNotification(message, type, durationMs);
            }
        } catch {
            // Safe fallback
        }

        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.toastTimer = setTimeout(() => {
            this.ActiveToast = null;
            this.cdr?.markForCheck();
        }, durationMs);
    }

    public DismissToast(): void {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.ActiveToast = null;
        this.cdr?.markForCheck();
    }

    private extractErrorMessage(result: unknown): string {
        if (!result) return 'An unexpected error occurred.';
        if (typeof result === 'string') {
            try {
                const parsed = JSON.parse(result);
                return parsed.Message || parsed.message || result;
            } catch {
                return result;
            }
        }
        if (typeof result === 'object' && result !== null) {
            const obj = result as Record<string, unknown>;
            if (typeof obj['Message'] === 'string') return this.extractErrorMessage(obj['Message']);
            if (typeof obj['message'] === 'string') return this.extractErrorMessage(obj['message']);
        }
        return 'Operation failed';
    }

    public FormatCurrency(val: number): string {
        return FormatMoney(val);
    }

    /** Qty bands, end date, non-standard fee, recurrence — not a default List/Base row. */
    public HasAdvanced(p: mjBizAppsOrdersProductPriceEntity | null | undefined): boolean {
        if (!p) return false;
        const min = p.MinQuantity;
        const max = p.MaxQuantity;
        const fee = (p.FeeType || 'Standard').trim();
        const to = p.EffectiveTo;
        const recM = (p as { RecurrenceMonths?: string | null }).RecurrenceMonths;
        const recD = (p as { RecurrenceDaysOfWeek?: string | null }).RecurrenceDaysOfWeek;
        const pkg = p.PackageQuantity;
        if (min != null && Number(min) !== 1 && Number(min) !== 0) return true;
        if (max != null) return true;
        if (fee && fee !== 'Standard') return true;
        if (to) return true;
        if (recM && String(recM).trim()) return true;
        if (recD && String(recD).trim()) return true;
        if (pkg != null && Number(pkg) !== 0) return true;
        return false;
    }

    public OpenAdvanced(id: string, event?: Event): void {
        event?.stopPropagation();
        this.AdvancedEditingID = id;
        this.cdr?.markForCheck();
    }

    public CloseWhenEditor(): void {
        this.WhenEditorPriceID = null;
        this.WhenFilter = null;
        this.cdr?.markForCheck();
    }

    public OpenWhenEditor(row: PriceCard): void {
        this.WhenFields = this.buildWhenFields();
        this.WhenFilter = this.parseWhenFilter(row.Record) ?? createEmptyFilter();
        this.WhenEditorPriceID = row.ID;
        this.cdr?.markForCheck();
    }

    public OnWhenFilterChange(filter: CompositeFilterDescriptor): void {
        this.WhenFilter = filter;
    }

    private parseWhenFilter(p: mjBizAppsOrdersProductPriceEntity): CompositeFilterDescriptor | null {
        const raw = (p as { Applicability?: string | null }).Applicability;
        if (raw == null || String(raw).trim() === '') return null;
        try {
            const parsed = JSON.parse(String(raw)) as CompositeFilterDescriptor;
            if (parsed && Array.isArray(parsed.filters)) return parsed;
        } catch {
            /* ignore */
        }
        return null;
    }

    private buildWhenFields(): FilterFieldInfo[] {
        const md = new Metadata();
        const out: FilterFieldInfo[] = [];
        for (const src of PRICE_APPLICABILITY_SOURCES) {
            const ent = md.EntityByName(src.entityName);
            if (!ent) continue;
            for (const f of ent.Fields) {
                if (f.Name.startsWith('__mj')) continue;
                out.push({
                    name: `${src.key}.${f.Name}`,
                    displayName: `${src.label} · ${f.DisplayName || f.Name}`,
                    type: this.filterTypeFor(f.TSType),
                });
            }
        }
        return out;
    }

    private filterTypeFor(ts: EntityFieldTSType): FilterFieldInfo['type'] {
        switch (ts) {
            case EntityFieldTSType.Number:
                return 'number';
            case EntityFieldTSType.Date:
                return 'date';
            case EntityFieldTSType.Boolean:
                return 'boolean';
            default:
                return 'string';
        }
    }

    public async SaveWhen(row: PriceCard): Promise<void> {
        const filter = this.WhenFilter;
        const empty = !filter?.filters?.length;
        (row.Record as { Applicability?: string | null }).Applicability = empty ? null : JSON.stringify(filter);
        await this.SavePrice(row.Record);
        this.WhenEditorPriceID = null;
        this.WhenFilter = null;
        await this.LoadPricingData();
    }

    public async ClearWhen(row: PriceCard): Promise<void> {
        (row.Record as { Applicability?: string | null }).Applicability = null;
        await this.SavePrice(row.Record);
        this.WhenEditorPriceID = null;
        await this.LoadPricingData();
    }

    private syncFromCollection(): void {
        if (this.Product?.Prices) {
            this.AllPriceRecords = [...this.Product.Prices.Items];
        }
    }

    private async ensurePricesLoaded(): Promise<boolean> {
        if (!this.Product?.Prices) return false;
        if (this.Product.IsSaved && !this.Product.Prices.IsLoaded) {
            await this.Product.Prices.Load();
        }
        this.syncFromCollection();
        return true;
    }

    /** One graph save — Product + Prices — same as Order.Lines. Never child.Save(). */
    private async saveProductGraph(): Promise<boolean> {
        if (!this.Product) return false;
        const ok = await this.Product.Save();
        if (!ok) {
            this.ShowToast(
                `Could not save price: ${this.extractErrorMessage(this.Product.LatestResult)}`,
                'error',
                6000,
            );
        }
        this.syncFromCollection();
        return ok;
    }

    private nextPriorityOnChannel(): number {
        const peers = this.AllPriceRecords.filter((p) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID,
        );
        const max = peers.reduce((m, p) => Math.max(m, Number(p.Priority) || 0), 0);
        return max + 10;
    }

    public async SavePrice(p: mjBizAppsOrdersProductPriceEntity): Promise<void> {
        if (!this.EditMode) return;
        await this.saveProductGraph();
        this.cdr?.markForCheck();
    }

    public async AddPrice(): Promise<void> {
        if (!this.Product?.ID) {
            this.ShowToast('Save the product first.', 'error');
            return;
        }
        if (!(await this.ensurePricesLoaded())) {
            this.ShowToast('Product.Prices collection is not available. Reload after CodeGen.', 'error');
            return;
        }
        const name = (this.NewPriceName || 'List').trim().slice(0, 100);
        const amount = Number(this.NewPriceAmount);
        this.IsSaving = true;
        this.cdr?.markForCheck();
        try {
            const newPrice = await this.Product.Prices.Create();
            newPrice.ProductID = this.Product.ID;
            newPrice.PriceListID = this.SelectedChannelID;
            (newPrice as { Name?: string }).Name = name;
            newPrice.Amount = Number.isFinite(amount) ? amount : 0;
            newPrice.PricingModel = 'PerUnit';
            newPrice.FeeType = 'Standard';
            newPrice.Priority = this.nextPriorityOnChannel();
            newPrice.Status = 'Active';
            newPrice.EffectiveFrom = new Date();
            const saved = await this.saveProductGraph();
            if (saved) {
                this.ShowToast(`Added ${name} · ${this.FormatCurrency(newPrice.Amount)}`, 'success');
                this.PriceChanged.emit();
                this.TierAdded.emit(newPrice);
                await this.LoadPricingData();
            }
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error', 6000);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    public async OverrideInherited(row: PriceCard): Promise<void> {
        this.NewPriceName = row.Name;
        this.NewPriceAmount = row.Amount;
        await this.AddPrice();
    }

    public OpenQuote(): void {
        this.QuoteDrawerOpen = true;
        this.RunQuote();
        this.cdr?.markForCheck();
    }

    public RunQuote(): void {
        const ctx = { BillToOrganization: { Type: this.QuoteOrgType } };
        const hits: PriceCard[] = [];
        const skip: string[] = [];
        for (const row of this.VisiblePrices) {
            const raw = (row.Record as { Applicability?: string | null }).Applicability;
            let ok = true;
            try {
                ok = priceApplies(raw, ctx);
            } catch {
                ok = false;
            }
            if (ok) hits.push(row);
            else skip.push(`${row.Name} (When did not match)`);
        }
        hits.sort((a, b) => Number(b.Record.Priority || 0) - Number(a.Record.Priority || 0));
        const win = hits[0];
        this.QuoteResult = win
            ? {
                  AmountText: this.FormatCurrency(win.Amount),
                  Why: `${win.Name} · ${win.SourceLabel}${win.WhenText ? ' · ' + win.WhenText : ''}`,
                  Skipped: skip.length ? `Didn’t apply: ${skip.join(' · ')}` : '',
              }
            : { AmountText: '—', Why: 'No price applied for this sample.', Skipped: skip.join(' · ') };
        this.cdr?.markForCheck();
    }

    private async loadInheritedPrices(): Promise<void> {
        this.InheritedRecords = [];
        const categoryId = this.Product?.ProductCategoryID;
        if (!categoryId) return;
        const rv = new RunView();
        const cats = await rv.RunView<{ ID: string; ParentProductCategoryID: string | null; Name?: string }>({
            EntityName: PRODUCT_CATEGORIES_ENTITY,
            ExtraFilter: '',
            ResultType: 'simple',
            MaxRows: 500,
        });
        const rows = cats.Success && cats.Results ? cats.Results : [];
        const byId = new Map(rows.map((c) => [String(c.ID).toLowerCase(), c]));
        const chain: string[] = [];
        let cur: string | null = categoryId;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.toLowerCase())) {
            seen.add(cur.toLowerCase());
            chain.push(cur);
            const rec = byId.get(cur.toLowerCase());
            cur = rec?.ParentProductCategoryID ?? null;
        }
        if (!chain.length) return;
        const inList = chain.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
        const prices = await rv.RunView<mjBizAppsOrdersProductPriceEntity>({
            EntityName: PRODUCT_PRICES_ENTITY,
            ExtraFilter: `ProductCategoryID IN (${inList}) AND Status = 'Active'`,
            ResultType: 'entity_object',
            MaxRows: 200,
        });
        this.InheritedRecords = prices.Success && prices.Results ? prices.Results : [];
    }
}
