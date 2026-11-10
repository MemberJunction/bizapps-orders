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
import type {
    CompositeFilterDescriptor,
    FilterFieldInfo,
} from '@memberjunction/ng-filter-builder';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { NavigationService } from '@memberjunction/ng-shared';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersPriceListEntity
} from '@mj-biz-apps/orders-entities';
import { FormatDate, FormatMoney } from '../../../panels/money-format';
import {
    ApplicabilityNeedsRevenue,
    AsDateValue,
    BuildRevenueBandApplicability,
    ComparePriceRows,
    DEFAULT_REVENUE_BAND_EDGES,
    DescribeInapplicableReason,
    DescribeRevenueLadder,
    DescribeRevenueLadderIssue,
    IsRuleApplicable,
    LoadOrdersEngine,
    OlderOrdersCutoff,
    OrdersEngine,
    PRICE_APPLICABILITY_SOURCES,
    ParseRevenueBand,
    ProductPriceEntity,
    RevenueBandName,
    RevenueBandRangeText,
    RequireUUID,
    RevenueBandsFromEdges,
    ToISODate,
    Today,
    TodayAsDateValue,
    UniquePriceName,
    priceApplies,
    type PriceRule,
    type PricingModel,
    type RevenueBandRange,
} from '@mj-biz-apps/orders-entities';

/** The columns `ComparePriceRows` reads, which a generated price entity exposes but does not declare as a type. */
type PriceOrderRowLike = { Priority?: number | null; Applicability?: string | null; Name?: string | null; Description?: string | null };

export interface PriceChannel {
    ID: string | null;
    Name: string;
    Icon: string;
    TierCount: number;
    DiscountDescription?: string;
}

export interface LadderTierRow {
    Record: ProductPriceEntity;
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
    /** 'Inactive', 'Ended 3 Nov 2026', 'Ends 31 Dec 2026', or '' for a price in force with no end. */
    StatusText: string;
    /** No longer applies to new lines: inactive, or its Effective To has passed. */
    Retired: boolean;
    Record: ProductPriceEntity;
}

/** One revenue band of the selected channel, as the band editor shows it. Edges are in $M in the inputs. */
export interface BandRow {
    Record: ProductPriceEntity;
    ID: string;
    Range: RevenueBandRange;
    MinMillions: number | null;
    MaxMillions: number | null;
    RangeText: string;
    Amount: number;
    StatusText: string;
    Retired: boolean;
}

export type PricingViewMode = 'cards' | 'bands' | 'grid';

/** Dotted Source.Field labels for the When sentence. Everything else is read from metadata. */
const PRICE_WHEN_FIELDS: Array<{ name: string; displayName: string }> = [
    { name: 'BillToOrganization.Type', displayName: 'Bill-to organization · Type' },
    { name: 'BillToOrganization.OrganizationType', displayName: 'Bill-to organization · Type' },
    { name: 'BillToOrganization.Status', displayName: 'Bill-to organization · Status' },
    { name: 'BillToOrganization.Name', displayName: 'Bill-to organization · Name' },
    { name: 'BillToPerson.Title', displayName: 'Bill-to person · Title' },
    { name: 'BillToPerson.Status', displayName: 'Bill-to person · Status' },
    { name: 'ShipToOrganization.Type', displayName: 'Ship-to organization · Type' },
    { name: 'ShipToOrganization.OrganizationType', displayName: 'Ship-to organization · Type' },
    { name: 'Order.Status', displayName: 'Order · Status' },
    { name: 'Order.OrderDate', displayName: 'Order · Date' },
    { name: 'Product.SKU', displayName: 'Product · SKU' },
    { name: 'Product.Status', displayName: 'Product · Status' },
];

const MILLION = 1_000_000;

/**
 * World-Class Product Pricing Matrix & Volume Ladder Widget (Option 1).
 *
 * Provides commercial channel segmentation (Base List, Wholesale, Partner),
 * rapid 1-click volume tier ladder configuration with automatic gap/overlap protection,
 * live discount & savings math, non-intrusive toast notifications, and an interactive step curve.
 *
 * Three views of one channel's prices: cards (each price with its When), the revenue band editor
 * (one row per band of the bill-to organization's revenue, edges in $M, see
 * `pricing/revenueBands.ts`), and MJ's data grid. Retired prices — inactive, or past their
 * Effective To — are hidden until asked for; Retire is the way to stop a price, because a saved
 * line keeps its stated price and only new lines read the catalog.
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
    @Output() public TierAdded = new EventEmitter<ProductPriceEntity>();

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

    /** Template access to the shared date formatter: an `EffectiveTo` is a calendar day, not an instant. */
    public readonly FormatDate = FormatDate;

    public IsLoading = false;
    public IsSaving = false;
    public ViewMode: PricingViewMode = 'cards';
    /** Set once the person picks a view; until then the widget opens on the band editor when bands exist. */
    private viewChosen = false;
    public QuoteDrawerOpen = false;
    public ExpandedPriceID: string | null = null;
    public SelectedPriceID: string | null = null;
    public WhenEditorPriceID: string | null = null;
    public AdvancedEditingID: string | null = null;
    public WhenFilter: CompositeFilterDescriptor | null = null;
    public WhenFields: FilterFieldInfo[] = [];
    /** The When builder lists each source's common fields; this shows every column instead. */
    public ShowAllWhenFields = false;
    public ShowRetired = false;
    public NewPriceName = 'Base';
    public NewPriceAmount = 0;
    /**
     * Effective From for the next price or tier added, as `YYYY-MM-DD` for the date input. Defaults to
     * the business day; an order dated before it gets no list price from it (bc-aidp-next-golive#437).
     */
    public NewPriceEffectiveFrom = Today();
    public QuoteOrgType = 'Member';
    /** The sample organization's annual revenue in $M; null = unknown, which is what a band cannot decide. */
    public QuoteRevenueMillions: number | null = null;
    public QuoteResult: { AmountText: string; Why: string; Skipped: string[] } = { AmountText: '—', Why: '', Skipped: [] };
    public InheritedRecords: ProductPriceEntity[] = [];

    public ActiveToast: WidgetToast | null = null;
    private toastTimer?: ReturnType<typeof setTimeout>;

    public Channels: PriceChannel[] = [
        { ID: null, Name: 'Standard', Icon: 'fa-solid fa-globe', TierCount: 0 }
    ];
    public SelectedChannelID: string | null = null;

    public AllPriceRecords: ProductPriceEntity[] = [];
    public LadderTiers: LadderTierRow[] = [];
    public StepBars: StepCurveBar[] = [];

    // Revenue band editor
    public BandRows: BandRow[] = [];
    public LadderIssues: string[] = [];
    public NewBandMinMillions: number | null = 0;
    public NewBandMaxMillions: number | null = null;
    public NewBandAmount = 0;
    public BandSetupEdgesText = DEFAULT_REVENUE_BAND_EDGES.map((e) => e / MILLION).join(', ');
    public BandSetupAmount = 0;

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
        // Again here: the field initializer can run before the business time zone has loaded.
        this.NewPriceEffectiveFrom = Today();
        this.LoadPricingData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Product'] && !changes['Product'].isFirstChange()) {
            this.LoadPricingData();
        }
        // Leaving Edit can hide an empty price list's tab; don't leave the panel on a tab it no longer shows.
        if (changes['EditMode'] && !this.EditMode && !this.VisibleChannels.some((c) => c.ID === this.SelectedChannelID)) {
            this.SelectChannel(null);
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

    /**
     * The price-list tabs to show: Standard always; a price list only when it prices this product, or
     * in Edit so a price can be added to it. A list with nothing on it is noise on every other product.
     */
    public get VisibleChannels(): PriceChannel[] {
        return this.Channels.filter((c) => c.ID == null || c.TierCount > 0 || this.EditMode);
    }

    /** Price-list tabs only when there is more than the Standard tab to choose from. */
    public get ShowChannelBar(): boolean {
        return this.VisibleChannels.length > 1;
    }

    /** Kept for callers that read the old flag; the grid is now one of three views. */
    public get IsAdvancedGridView(): boolean {
        return this.ViewMode === 'grid';
    }

    public get PricesForChannel(): ProductPriceEntity[] {
        return this.AllPriceRecords.filter((p) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID,
        );
    }

    // ---- Retirement -------------------------------------------------------------------------------

    /**
     * A price that no longer applies to new lines: inactive, or its Effective To is before today.
     * Saved lines keep their stated price either way (`StatedLineUnitPrice`), so retiring is safe
     * for existing orders and is the way to stop a price; deleting one loses the trail.
     */
    public IsRetired(p: ProductPriceEntity): boolean {
        if (p.Status !== 'Active') return true;
        if (this.IsOlderOrdersOnly(p)) return true;
        const to = ToISODate(p.EffectiveTo);
        return to != null && to < Today();
    }

    /**
     * An Active price kept for orders created before a cutover that has passed (`OlderOrdersCutoff`):
     * no new order can match it, so it is retired for the catalog's purposes and hidden with the
     * inactive ones. It is still in force for those older orders, so it is not offered for
     * activation; deactivating it would move their prices.
     */
    public IsOlderOrdersOnly(p: ProductPriceEntity): boolean {
        if (p.Status !== 'Active') return false;
        const cutoff = OlderOrdersCutoff((p as { Applicability?: string | null }).Applicability);
        return cutoff != null && cutoff.getTime() <= Date.now();
    }

    /** Activate is offered for a price that is inactive or expired, not for one kept for older orders. */
    public CanActivate(p: ProductPriceEntity): boolean {
        return this.IsRetired(p) && !this.IsOlderOrdersOnly(p);
    }

    public StatusTextFor(p: ProductPriceEntity): string {
        if (p.Status !== 'Active') return 'Inactive';
        const cutoff = this.IsOlderOrdersOnly(p) ? OlderOrdersCutoff((p as { Applicability?: string | null }).Applicability) : null;
        if (cutoff) return `Orders before ${FormatDate(cutoff)}`;
        const to = ToISODate(p.EffectiveTo);
        if (to == null) return '';
        return to < Today() ? `Expired ${FormatDate(p.EffectiveTo)}` : `Expires ${FormatDate(p.EffectiveTo)}`;
    }

    /** Retired prices of this product on the selected channel, hidden unless ShowRetired. */
    public get RetiredCount(): number {
        return this.PricesForChannel.filter((p) => this.IsRetired(p)).length;
    }

    public ToggleRetired(): void {
        this.ShowRetired = !this.ShowRetired;
        this.rebuildBands();
        this.cdr?.markForCheck();
    }

    public async RetirePrice(p: ProductPriceEntity): Promise<void> {
        if (!this.EditMode) return;
        p.Status = 'Inactive';
        const name = this.PriceDisplayName(p);
        await this.savePricesAndReload(`${name} deactivated. Existing order lines keep their price.`);
    }

    public async RestorePrice(p: ProductPriceEntity): Promise<void> {
        if (!this.EditMode) return;
        p.Status = 'Active';
        const to = ToISODate(p.EffectiveTo);
        if (to != null && to < Today()) p.EffectiveTo = null;
        await this.savePricesAndReload(`${this.PriceDisplayName(p)} activated.`);
    }

    /** The card's Status select: the same save and message as Retire / Restore. */
    public async OnStatusChange(p: ProductPriceEntity): Promise<void> {
        if (!this.EditMode) return;
        const name = this.PriceDisplayName(p);
        await this.savePricesAndReload(
            p.Status === 'Active'
                ? `${name} activated.`
                : `${name} deactivated. Existing order lines keep their price.`,
        );
    }

    /** The row's Effective To as the date input shows it. */
    public EffectiveToInput(p: ProductPriceEntity): string {
        return ToISODate(p.EffectiveTo) ?? '';
    }

    public async OnEffectiveToChange(p: ProductPriceEntity, value: string): Promise<void> {
        if (!this.EditMode) return;
        const next = value ? AsDateValue(value) : null;
        const prev = ToISODate(p.EffectiveTo);
        if ((next ? ToISODate(next) : null) === prev) return;
        p.EffectiveTo = next;
        await this.savePricesAndReload(next ? `${this.PriceDisplayName(p)} expires ${FormatDate(next)}.` : `${this.PriceDisplayName(p)} has no expiration date.`);
    }

    // ---- Cards ------------------------------------------------------------------------------------

    public get VisiblePrices(): PriceCard[] {
        const inChannel = (p: ProductPriceEntity) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID;
        const productRows = this.AllPriceRecords.filter(inChannel).filter((p) => this.ShowRetired || !this.IsRetired(p));
        const names = new Set(productRows.map((p) => this.PriceDisplayName(p).trim().toLowerCase()));
        const inherited = this.InheritedRecords.filter(
            (p) => inChannel(p) && !names.has(this.PriceDisplayName(p).trim().toLowerCase()),
        );
        const toCard = (p: ProductPriceEntity, inherited: boolean): PriceCard => ({
            ID: p.ID,
            Name: this.PriceDisplayName(p),
            Amount: Number(p.Amount) || 0,
            Inherited: inherited,
            SourceLabel: inherited ? `Inherited from ${this.categoryName(p.ProductCategoryID)}` : '',
            WhenText: this.WhenSentence(p),
            StatusText: inherited ? '' : this.StatusTextFor(p),
            Retired: inherited ? false : this.IsRetired(p),
            Record: p as ProductPriceEntity,
        });
        const productCards = productRows.map((p) => toCard(p, false)).sort((a, b) => this.comparePrices(a.Record, b.Record));
        return [...productCards, ...inherited.map((p) => toCard(p, true))];
    }

    /**
     * The one order prices are listed in, in the cards, the simulation and (as far as SQL can) the grid.
     * `ComparePriceRows` in orders-entities holds the rule, so the product Overview lists them the same way.
     */
    private comparePrices(a: ProductPriceEntity, b: ProductPriceEntity): number {
        return ComparePriceRows(a as PriceOrderRowLike, b as PriceOrderRowLike);
    }

    /** The category an inherited price comes from, by name; the engine is loaded before any card is built. */
    private categoryName(categoryID: string | null | undefined): string {
        return OrdersEngine.Instance.ProductCategoryByID(categoryID)?.Name?.trim() || 'category';
    }

    public PriceCanExpand(row: PriceCard): boolean {
        if (row.Inherited) return this.EditMode;
        if (this.EditMode) return true;
        return this.HasAdvanced(row.Record);
    }

    public PriceDisplayName(p: ProductPriceEntity): string {
        const n = (p as { Name?: string }).Name?.trim();
        if (n) return n;
        return p.Description?.trim() || 'Price';
    }

    public HasWhen(p: ProductPriceEntity): boolean {
        return this.WhenSentence(p).length > 0;
    }

    public WhenSentence(p: ProductPriceEntity): string {
        const raw = (p as { Applicability?: string | null }).Applicability;
        if (raw == null || String(raw).trim() === '') return '';
        const band = ParseRevenueBand(raw);
        if (band) return `Customer annual revenue ${RevenueBandRangeText(band)}`;
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
            return 'Has conditions';
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

    private readonly whenLabelCache = new Map<string, string>();

    /** `Bill-to organization · Status`: the source's label and the field's display name from metadata. */
    private whenFieldLabel(stored: string): string {
        const cached = this.whenLabelCache.get(stored);
        if (cached) return cached;
        const label = this.resolveWhenFieldLabel(stored);
        this.whenLabelCache.set(stored, label);
        return label;
    }

    private resolveWhenFieldLabel(stored: string): string {
        const hit = PRICE_WHEN_FIELDS.find((f) => f.name === stored);
        if (hit) return hit.displayName;
        const dot = stored.indexOf('.');
        if (dot <= 0) return stored;
        const sourceKey = stored.slice(0, dot);
        const fieldName = stored.slice(dot + 1);
        const src = PRICE_APPLICABILITY_SOURCES.find((s) => s.key === sourceKey);
        if (!src) return stored.replace('.', ' · ');
        if (src.fields) {
            const f = src.fields.find((x) => x.name === fieldName);
            return `${src.label} · ${f?.label ?? fieldName}`;
        }
        let display = fieldName;
        try {
            const ent = src.entityName ? new Metadata().EntityByName(src.entityName) : null;
            const f = ent?.Fields.find((x) => x.Name === fieldName);
            if (f?.DisplayName) display = f.DisplayName;
        } catch {
            /* metadata not loaded yet: the raw name is fine */
        }
        return `${src.label} · ${display}`;
    }

    public OpenPriceRecord(p: ProductPriceEntity, event?: Event): void {
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
            ExtraFilter: `ProductID = '${this.Product.ID}' AND ${
                this.SelectedChannelID ? `PriceListID = '${RequireUUID(this.SelectedChannelID, 'PriceListID')}'` : 'PriceListID IS NULL'
            }`,
            // Same order as the cards, as far as SQL can: a band ladder's prices rise with revenue, so
            // Amount stands in for the band edge the JSON holds.
            OrderBy: 'Priority DESC, Amount ASC, Name ASC',
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
                this.AllPriceRecords = [...this.Product.Prices.Items] as ProductPriceEntity[];
            } else {
                const md = new Metadata();
                await LoadOrdersEngine(Metadata.Provider, md.CurrentUser);
                this.AllPriceRecords = OrdersEngine.Instance.ProductPricesFor(this.Product.ID) as ProductPriceEntity[];
            }

            const rv = new RunView();
            // Only live lists get a tab: the resolver ignores an inactive list's prices, so showing one
            // here would offer prices no customer can receive.
            const listsResult = await rv.RunView<mjBizAppsOrdersPriceListEntity>({
                EntityName: PRICE_LISTS_ENTITY,
                ExtraFilter: `Status = 'Active'`,
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
            // A banded product opens on its ladder; the person can still switch to the cards.
            if (!this.viewChosen && this.ViewMode === 'cards' && this.BandRows.some((b) => !b.Retired)) {
                this.ViewMode = 'bands';
            }
        } catch (err) {
            console.error('Failed to load product pricing records:', err);
        } finally {
            this.IsLoading = false;
            this.cdr?.markForCheck();
        }
    }

    private countPricesOnChannel(listId: string | null): number {
        const match = (p: ProductPriceEntity) =>
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
                Name: 'Standard',
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

    public SetView(mode: PricingViewMode): void {
        this.ViewMode = mode;
        this.viewChosen = true;
        this.cdr?.markForCheck();
    }

    public ToggleAdvancedView(): void {
        this.SetView(this.ViewMode === 'grid' ? 'cards' : 'grid');
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
                EffectiveDatesText: rec.EffectiveTo ? `Until ${FormatDate(rec.EffectiveTo)}` : 'Always Active',
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
        this.rebuildBands();
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

    // ---- Revenue band editor ----------------------------------------------------------------------

    /** The channel's band rows, lowest band first, retired ones only when asked for. */
    private rebuildBands(): void {
        const rows: BandRow[] = [];
        for (const p of this.PricesForChannel) {
            const range = ParseRevenueBand((p as { Applicability?: string | null }).Applicability);
            if (!range) continue;
            const retired = this.IsRetired(p);
            if (retired && !this.ShowRetired) continue;
            rows.push({
                Record: p,
                ID: p.ID,
                Range: range,
                MinMillions: range.Min == null ? null : range.Min / MILLION,
                MaxMillions: range.Max == null ? null : range.Max / MILLION,
                RangeText: RevenueBandRangeText(range),
                Amount: Number(p.Amount) || 0,
                StatusText: this.StatusTextFor(p),
                Retired: retired,
            });
        }
        rows.sort((a, b) => (a.Range.Min ?? -Infinity) - (b.Range.Min ?? -Infinity));
        this.BandRows = rows;

        const live = rows.filter((r) => !r.Retired);
        this.LadderIssues = DescribeRevenueLadder(live.map((r) => r.Range)).map(DescribeRevenueLadderIssue);

        const top = live[live.length - 1];
        this.NewBandMinMillions = top ? (top.Range.Max == null ? null : top.Range.Max / MILLION) : 0;
        this.NewBandMaxMillions = null;
        this.NewBandAmount = top ? top.Amount : this.BaseListPrice || 0;
    }

    /** Whether the highest live band has no upper edge, so an added band above it would overlap. */
    public get TopBandOpen(): boolean {
        const live = this.BandRows.filter((r) => !r.Retired);
        return live.length > 0 && live[live.length - 1].Range.Max == null;
    }

    /** What the setup form's edges would create, so the person sees the ladder before it is written. */
    public get BandSetupPreview(): string {
        const bands = RevenueBandsFromEdges(this.parseEdgesText(this.BandSetupEdgesText));
        if (bands.length === 0) return 'Enter each band\'s lower limit in $M, ascending, e.g. 0, 2, 5, 10.';
        const first = RevenueBandRangeText(bands[0]);
        const last = RevenueBandRangeText(bands[bands.length - 1]);
        return bands.length === 1 ? `1 band: ${first}` : `${bands.length} bands: ${first} … ${last}`;
    }

    private parseEdgesText(text: string): number[] {
        return String(text ?? '')
            .split(/[\s,;]+/)
            .map((t) => t.replace(/[$M]/gi, ''))
            .filter((t) => t !== '')
            .map((t) => Number(t) * MILLION)
            .filter((n) => Number.isFinite(n) && n >= 0);
    }

    private millionsToUsd(value: number | string | null | undefined): number | null {
        if (value == null || String(value).trim() === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return null;
        return Math.round(n * MILLION);
    }

    /**
     * The priority new bands take: the one the product's live bands already share, else the next free
     * priority on the channel. Bands sit at ONE priority on purpose: the write-time collision check
     * then refuses two bands whose ranges overlap, and disjoint bands never tie (#1004).
     */
    private bandPriority(): number {
        const counts = new Map<number, number>();
        for (const r of this.BandRows) {
            if (r.Retired) continue;
            const p = Number(r.Record.Priority) || 0;
            counts.set(p, (counts.get(p) ?? 0) + 1);
        }
        let best: number | null = null;
        let bestCount = 0;
        for (const [p, c] of counts) {
            if (c > bestCount || (c === bestCount && best != null && p > best)) {
                best = p;
                bestCount = c;
            }
        }
        return best ?? this.nextPriorityOnChannel();
    }

    /**
     * The name the editor proposes for a band on the selected tab: `Under $2M rev` on Standard,
     * `Under $2M rev · Member Pricing` on a price list, so the same ladder can exist on both.
     */
    private proposedBandName(range: RevenueBandRange): string {
        const list = this.SelectedChannelID === null ? '' : this.Channels.find((c) => c.ID === this.SelectedChannelID)?.Name?.trim();
        return list ? `${RevenueBandName(range)} · ${list}` : RevenueBandName(range);
    }

    /**
     * `proposedBandName`, made unique among this product's prices, whatever their list or status:
     * `UX_ProductPrice_Product_Name` is unique on (ProductID, Name) and a deactivated band still holds
     * its name. `except` is the row being renamed, whose own name does not count as taken.
     */
    private freeBandName(range: RevenueBandRange, except?: ProductPriceEntity): string {
        const taken = this.AllPriceRecords.filter((p) => p !== except && (!except || p.ID !== except.ID)).map((p) => p.Name);
        return UniquePriceName(this.proposedBandName(range), taken).slice(0, 200);
    }

    private applyBandToRecord(p: ProductPriceEntity, range: RevenueBandRange, amount: number, priority: number): void {
        p.ProductID = this.Product.ID;
        p.PriceListID = this.SelectedChannelID;
        p.Name = this.freeBandName(range);
        p.Applicability = BuildRevenueBandApplicability(range);
        p.Amount = Number.isFinite(amount) ? amount : 0;
        p.PricingModel = 'PerUnit';
        p.FeeType = 'Standard';
        p.Priority = priority;
        p.Status = 'Active';
        p.EffectiveFrom = this.newPriceEffectiveFromValue();
    }

    public async AddBand(): Promise<void> {
        if (!this.EditMode) return;
        if (!this.Product?.ID) {
            this.ShowToast('Save the product first.', 'error');
            return;
        }
        if (!(await this.ensurePricesLoaded())) {
            this.ShowToast('Product.Prices collection is not available. Reload after CodeGen.', 'error');
            return;
        }
        const min = this.millionsToUsd(this.NewBandMinMillions);
        const max = this.millionsToUsd(this.NewBandMaxMillions);
        if (min == null && max == null) {
            this.ShowToast('Enter a From or To value.', 'error');
            return;
        }
        if (min != null && max != null && min >= max) {
            this.ShowToast('To must be greater than From.', 'error');
            return;
        }
        const range: RevenueBandRange = { Min: min, Max: max };
        this.IsSaving = true;
        this.cdr?.markForCheck();
        let newPrice: ProductPriceEntity | null = null;
        try {
            newPrice = await this.Product.Prices.Create() as ProductPriceEntity;
            this.applyBandToRecord(newPrice, range, Number(this.NewBandAmount), this.bandPriority());
            const saved = await this.saveProductGraph();
            if (saved) {
                this.ShowToast(`Added ${newPrice.Name} · ${this.FormatCurrency(newPrice.Amount)}`, 'success');
                this.PriceChanged.emit();
                this.TierAdded.emit(newPrice);
                await this.LoadPricingData();
            } else {
                this.discardUnsaved(newPrice);
            }
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error', 6000);
            if (newPrice) this.discardUnsaved(newPrice);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    /** Write a whole ladder at once from the setup form's edges, every band at the starting price. */
    public async CreateBandLadder(): Promise<void> {
        if (!this.EditMode) return;
        if (!this.Product?.ID) {
            this.ShowToast('Save the product first.', 'error');
            return;
        }
        if (!(await this.ensurePricesLoaded())) {
            this.ShowToast('Product.Prices collection is not available. Reload after CodeGen.', 'error');
            return;
        }
        const bands = RevenueBandsFromEdges(this.parseEdgesText(this.BandSetupEdgesText));
        if (bands.length === 0) {
            this.ShowToast('Enter at least one breakpoint in $M.', 'error');
            return;
        }
        this.IsSaving = true;
        this.cdr?.markForCheck();
        const created: ProductPriceEntity[] = [];
        try {
            const priority = this.bandPriority();
            const amount = Number(this.BandSetupAmount);
            for (const range of bands) {
                const p = await this.Product.Prices.Create() as ProductPriceEntity;
                this.applyBandToRecord(p, range, amount, priority);
                created.push(p);
            }
            const saved = await this.saveProductGraph();
            if (saved) {
                this.ShowToast(`Created ${bands.length} revenue bands at ${this.FormatCurrency(amount)}. Adjust each price in the table.`, 'success', 6000);
                this.PriceChanged.emit();
                await this.LoadPricingData();
            } else {
                for (const p of created) this.discardUnsaved(p);
            }
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error', 6000);
            for (const p of created) this.discardUnsaved(p);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    public async SaveBandEdges(row: BandRow): Promise<void> {
        if (!this.EditMode) return;
        const min = this.millionsToUsd(row.MinMillions);
        const max = this.millionsToUsd(row.MaxMillions);
        if (min === row.Range.Min && max === row.Range.Max) return;
        if (min == null && max == null) {
            this.ShowToast('Enter a From or To value.', 'error');
            this.resetBandInputs(row);
            return;
        }
        if (min != null && max != null && min >= max) {
            this.ShowToast('To must be greater than From.', 'error');
            this.resetBandInputs(row);
            return;
        }
        const next: RevenueBandRange = { Min: min, Max: max };
        // A name the editor proposed follows the edges; a name the person typed stays. A proposed name
        // may carry a "(2)" suffix from `freeBandName`, so the test is on the stem.
        const name = (row.Record.Name ?? '').trim();
        const proposed = this.proposedBandName(row.Range);
        if (!name || name === proposed || name === RevenueBandName(row.Range) || /^(.*) \(\d+\)$/.exec(name)?.[1] === proposed) {
            row.Record.Name = this.freeBandName(next, row.Record);
        }
        row.Record.Applicability = BuildRevenueBandApplicability(next);
        await this.savePricesAndReload(`${row.Record.Name}: ${RevenueBandRangeText(next)}`);
    }

    private resetBandInputs(row: BandRow): void {
        row.MinMillions = row.Range.Min == null ? null : row.Range.Min / MILLION;
        row.MaxMillions = row.Range.Max == null ? null : row.Range.Max / MILLION;
        this.cdr?.markForCheck();
    }

    /** The message when a price field is left empty or unreadable on blur; the old amount stays. */
    private static readonly PRICE_KEPT = 'Price not changed. Enter a number such as 1,250.00.';

    public async SaveBandAmount(row: BandRow): Promise<void> {
        if (!this.EditMode) return;
        // `mjoCurrency` writes null for an empty or unreadable field, and Number(null) is 0: without this
        // test, deleting a price to retype it and clicking away saved the band at $0.00 (PR #1052 review).
        const typed = row.Record.Amount as number | null | undefined;
        const amount = typed == null ? NaN : Number(typed);
        if (!Number.isFinite(amount)) {
            row.Record.Amount = row.Amount;
            this.ShowToast(BizAppsProductPricingWidgetComponent.PRICE_KEPT, 'error');
            this.cdr?.markForCheck();
            return;
        }
        if (amount === row.Amount) {
            row.Record.Amount = row.Amount;
            return;
        }
        await this.savePricesAndReload(`${this.PriceDisplayName(row.Record)} updated to ${this.FormatCurrency(amount)}.`);
    }

    public async SaveBandName(row: BandRow): Promise<void> {
        if (!this.EditMode) return;
        if (!row.Record.Dirty) return;
        await this.savePricesAndReload(`Renamed to ${this.PriceDisplayName(row.Record)}`);
    }

    /** Save every dirty price through the product graph, report, and reload the widget. */
    private async savePricesAndReload(successMessage: string): Promise<boolean> {
        this.IsSaving = true;
        this.cdr?.markForCheck();
        try {
            const ok = await this.saveProductGraph();
            if (ok) {
                this.ShowToast(successMessage, 'success');
                this.PriceChanged.emit();
            }
            await this.LoadPricingData();
            return ok;
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error', 6000);
            await this.LoadPricingData();
            return false;
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    // ---- Quantity tiers (legacy ladder) ------------------------------------------------------------

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

        let newPrice: ProductPriceEntity | null = null;
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
            if (this.Product.Prices) {
                newPrice = await this.Product.Prices.Create() as ProductPriceEntity;
            } else {
                const md = new Metadata();
                const obj = await md.GetEntityObject<ProductPriceEntity>(PRODUCT_PRICES_ENTITY);
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
            // The chosen calendar day pinned to midnight UTC, not new Date(): an instant serialises in
            // UTC, which dated every evening-created price TOMORROW and made it refuse to apply until then.
            newPrice.EffectiveFrom = this.newPriceEffectiveFromValue();
            const bracket = maxQty != null ? `${minQty}–${maxQty}` : `${minQty}+`;
            (newPrice as { Name?: string }).Name = `${this.NewTierModel || 'Volume'} ${bracket}`.slice(0, 100);

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
                this.discardUnsaved(newPrice);
            }
        } catch (err) {
            console.error('Failed to create tier bracket:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            this.ShowToast(`Error creating pricing bracket: ${errMsg}`, 'error', 6000);
            if (newPrice) this.discardUnsaved(newPrice);
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
    public HasAdvanced(p: ProductPriceEntity | null | undefined): boolean {
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
        this.WhenFilter = this.parseWhenFilter(row.Record) ?? { logic: 'and', filters: [] };
        this.WhenEditorPriceID = row.ID;
        this.cdr?.markForCheck();
    }

    public ToggleAllWhenFields(showAll: boolean): void {
        this.ShowAllWhenFields = showAll;
        this.WhenFields = this.buildWhenFields();
        this.cdr?.markForCheck();
    }

    public OnWhenFilterChange(filter: CompositeFilterDescriptor): void {
        this.WhenFilter = filter;
    }

    private parseWhenFilter(p: ProductPriceEntity): CompositeFilterDescriptor | null {
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

    /**
     * The fields the When builder offers. By default each source's `commonFields` (the handful a
     * price rule tests: status, type, region, revenue), so the picker is a short list rather than
     * every column of five entities; "every field" lists them all. A field a stored When already
     * names stays listed either way, so an existing rule always round-trips.
     */
    private buildWhenFields(): FilterFieldInfo[] {
        const md = new Metadata();
        const out: FilterFieldInfo[] = [];
        const inUse = this.whenFieldsInUse();
        for (const src of PRICE_APPLICABILITY_SOURCES) {
            if (src.fields) {
                for (const f of src.fields) {
                    out.push({ name: `${src.key}.${f.name}`, displayName: `${src.label} · ${f.label}`, type: f.type });
                }
                continue;
            }
            if (!src.entityName) continue;
            const ent = md.EntityByName(src.entityName);
            if (!ent) continue;
            const common = this.ShowAllWhenFields ? null : new Set(src.commonFields ?? []);
            for (const f of ent.Fields) {
                if (f.Name.startsWith('__mj')) continue;
                const name = `${src.key}.${f.Name}`;
                if (common && !common.has(f.Name) && !inUse.has(name)) continue;
                out.push({
                    name,
                    displayName: `${src.label} · ${f.DisplayName || f.Name}`,
                    type: this.filterTypeFor(f.TSType),
                });
            }
        }
        return out;
    }

    /** Every `Source.Field` the open When editor's filter names. */
    private whenFieldsInUse(): Set<string> {
        const names = new Set<string>();
        const walk = (node: CompositeFilterDescriptor | { field?: string } | null | undefined): void => {
            if (!node) return;
            if ('filters' in node && Array.isArray(node.filters)) {
                for (const f of node.filters) walk(f as CompositeFilterDescriptor);
                return;
            }
            const field = (node as { field?: string }).field;
            if (field) names.add(field);
        };
        walk(this.WhenFilter);
        return names;
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
            this.AllPriceRecords = [...this.Product.Prices.Items] as ProductPriceEntity[];
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

    /**
     * Take a row that FAILED to save back out of the grid.
     *
     * `Prices.Create()` appends to the collection immediately, and `syncFromCollection` copies the
     * collection into the grid — so a failed save used to leave a phantom row on screen while the
     * tab counter (which counts saved records) honestly said it wasn't there.
     */
    private discardUnsaved(price: ProductPriceEntity): void {
        if (price.IsSaved) return;
        this.Product?.Prices?.Remove(price);
        this.syncFromCollection();
    }

    private nextPriorityOnChannel(): number {
        const peers = this.AllPriceRecords.filter((p) =>
            this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID,
        );
        const max = peers.reduce((m, p) => Math.max(m, Number(p.Priority) || 0), 0);
        return max + 10;
    }

    public async SavePrice(p: ProductPriceEntity): Promise<void> {
        if (!this.EditMode) return;
        // Same guard as SaveBandAmount: an emptied price field is "no change", never $0.00.
        const typed = p.Amount as number | null | undefined;
        if (typed == null || !Number.isFinite(Number(typed))) {
            p.Amount = this.savedAmountOf(p);
            this.ShowToast(BizAppsProductPricingWidgetComponent.PRICE_KEPT, 'error');
            this.cdr?.markForCheck();
            return;
        }
        await this.saveProductGraph();
        this.cdr?.markForCheck();
    }

    /** The amount a price row had before the current edit, from the entity's field tracking, else 0. */
    private savedAmountOf(p: ProductPriceEntity): number {
        const field = (p as { GetFieldByName?: (name: string) => { OldValue?: unknown } | null }).GetFieldByName?.('Amount');
        const old = Number(field?.OldValue);
        return Number.isFinite(old) ? old : 0;
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
        let newPrice: ProductPriceEntity | null = null;
        try {
            newPrice = await this.Product.Prices.Create() as ProductPriceEntity;
            newPrice.ProductID = this.Product.ID;
            newPrice.PriceListID = this.SelectedChannelID;
            (newPrice as { Name?: string }).Name = name;
            newPrice.Amount = Number.isFinite(amount) ? amount : 0;
            newPrice.PricingModel = 'PerUnit';
            newPrice.FeeType = 'Standard';
            newPrice.Priority = this.nextPriorityOnChannel();
            newPrice.Status = 'Active';
            // Same rule as AddTierBracket.
            newPrice.EffectiveFrom = this.newPriceEffectiveFromValue();
            const saved = await this.saveProductGraph();
            if (saved) {
                this.ShowToast(`Added ${name} · ${this.FormatCurrency(newPrice.Amount)}`, 'success');
                this.PriceChanged.emit();
                this.TierAdded.emit(newPrice);
                await this.LoadPricingData();
            } else {
                this.discardUnsaved(newPrice);
            }
        } catch (err) {
            this.ShowToast(err instanceof Error ? err.message : String(err), 'error', 6000);
            if (newPrice) this.discardUnsaved(newPrice);
        } finally {
            this.IsSaving = false;
            this.cdr?.markForCheck();
        }
    }

    /** The Effective From the add row names, or today when the input was cleared. */
    private newPriceEffectiveFromValue(): Date {
        return AsDateValue(this.NewPriceEffectiveFrom) ?? TodayAsDateValue();
    }

    public async OverrideInherited(row: PriceCard): Promise<void> {
        this.NewPriceName = row.Name;
        this.NewPriceAmount = row.Amount;
        await this.AddPrice();
    }

    // ---- Test a quote -----------------------------------------------------------------------------

    public OpenQuote(): void {
        this.QuoteDrawerOpen = true;
        this.RunQuote();
        this.cdr?.markForCheck();
    }

    /** A price row as the resolver's rule, for the same quantity / date / status test it applies. */
    private ruleFromPrice(p: ProductPriceEntity): PriceRule {
        const rec = p as ProductPriceEntity & {
            RecurrenceMonths?: string | null;
            RecurrenceDaysOfWeek?: string | null;
            RecurrenceDayOfMonthMin?: number | null;
            RecurrenceDayOfMonthMax?: number | null;
            TimeOfDayStart?: string | null;
            TimeOfDayEnd?: string | null;
        };
        return {
            ID: p.ID,
            PricingModel: (p.PricingModel || 'PerUnit') as PricingModel,
            Amount: Number(p.Amount) || 0,
            PackageQuantity: p.PackageQuantity == null ? null : Number(p.PackageQuantity),
            MinQuantity: p.MinQuantity == null ? null : Number(p.MinQuantity),
            MaxQuantity: p.MaxQuantity == null ? null : Number(p.MaxQuantity),
            EffectiveFrom: new Date(p.EffectiveFrom),
            EffectiveTo: p.EffectiveTo == null ? null : new Date(p.EffectiveTo),
            RecurrenceMonths: rec.RecurrenceMonths ?? null,
            RecurrenceDaysOfWeek: rec.RecurrenceDaysOfWeek ?? null,
            RecurrenceDayOfMonthMin: rec.RecurrenceDayOfMonthMin ?? null,
            RecurrenceDayOfMonthMax: rec.RecurrenceDayOfMonthMax ?? null,
            TimeOfDayStart: rec.TimeOfDayStart ?? null,
            TimeOfDayEnd: rec.TimeOfDayEnd ?? null,
            Priority: Number(p.Priority) || 0,
            Status: p.Status,
        };
    }

    /** The product's own rows on one tab, then the category rows whose name no product row has taken. */
    private candidatesOn(listID: string | null): Array<{ Record: ProductPriceEntity; Inherited: boolean }> {
        const inChannel = (p: ProductPriceEntity) => (listID === null ? !p.PriceListID : p.PriceListID === listID);
        const own = this.AllPriceRecords.filter(inChannel);
        const names = new Set(own.map((p) => this.PriceDisplayName(p).trim().toLowerCase()));
        return [
            ...own.map((p) => ({ Record: p, Inherited: false })),
            ...this.InheritedRecords.filter((p) => inChannel(p) && !names.has(this.PriceDisplayName(p).trim().toLowerCase())).map((p) => ({
                Record: p,
                Inherited: true,
            })),
        ];
    }

    /**
     * Which price a sample bill-to organization would get today: the resolver's own quantity / date /
     * status test (`IsRuleApplicable`), then each row's When against the sample's type and revenue,
     * then highest priority wins. Revenue left blank is "unknown", so every row that tests revenue is
     * reported as undecidable, which is what a rep sees in the price picker (`BandUndecided`).
     *
     * On a price-list tab the candidates are that list's rows AND the Standard rows, the list's at one
     * priority higher, which is how `PriceResolver.loadRules` prices a customer on that list: a list
     * that does not price the line falls back to Standard rather than to "no price" (PR #1052 review).
     */
    public RunQuote(): void {
        const revenue = this.millionsToUsd(this.QuoteRevenueMillions);
        const ctx = {
            BillToOrganization: { Type: this.QuoteOrgType, OrganizationType: this.QuoteOrgType },
            BillToOrganizationRevenue: revenue == null ? null : { AnnualRevenue: revenue },
        };
        const quantity = Number(this.SimQuantity) || 1;
        const now = new Date();
        const onList = this.SelectedChannelID !== null;
        type Candidate = { Record: ProductPriceEntity; Inherited: boolean; EffectivePriority: number };
        const withPriority = (c: { Record: ProductPriceEntity; Inherited: boolean }, bump: number): Candidate => ({
            ...c,
            EffectivePriority: (Number(c.Record.Priority) || 0) + bump,
        });
        const candidates: Candidate[] = onList
            ? [...this.candidatesOn(this.SelectedChannelID).map((c) => withPriority(c, 1)), ...this.candidatesOn(null).map((c) => withPriority(c, 0))]
            : this.candidatesOn(null).map((c) => withPriority(c, 0));
        candidates.sort((a, b) => b.EffectivePriority - a.EffectivePriority || this.comparePrices(a.Record, b.Record));
        const hits: Array<Candidate & { Name: string }> = [];
        const skip: string[] = [];
        for (const c of candidates) {
            const name = this.PriceDisplayName(c.Record);
            const rule = this.ruleFromPrice(c.Record);
            const reason = IsRuleApplicable(rule, { Quantity: quantity, AsOf: now });
            if (reason) {
                skip.push(`${name}: ${DescribeInapplicableReason(rule, reason)}`);
                continue;
            }
            const raw = (c.Record as { Applicability?: string | null }).Applicability;
            if (revenue == null && ApplicabilityNeedsRevenue(raw)) {
                skip.push(`${name}: requires annual revenue (none on file)`);
                continue;
            }
            let ok = true;
            try {
                ok = priceApplies(raw, ctx);
            } catch {
                ok = false;
            }
            if (ok) hits.push({ ...c, Name: name });
            else skip.push(`${name}: conditions not met`);
        }
        const win = hits[0];
        const tied = win ? hits.filter((h) => h.EffectivePriority === win.EffectivePriority) : [];
        if (win && tied.length > 1) {
            this.QuoteResult = {
                AmountText: 'Conflict',
                Why: `${tied.map((t) => t.Name).join(' and ')} both apply at priority ${win.Record.Priority}. Change a priority or narrow the conditions.`,
                Skipped: skip,
            };
        } else if (win) {
            const when = this.WhenSentence(win.Record);
            const fellBack = onList && !win.Record.PriceListID;
            this.QuoteResult = {
                AmountText: this.FormatCurrency(Number(win.Record.Amount) || 0),
                Why: `${win.Name}${fellBack ? ' · Standard price' : ''}${win.Inherited ? ' · Inherited from ' + this.categoryName(win.Record.ProductCategoryID) : ''}${when ? ' · ' + when : ''}`,
                Skipped: skip,
            };
        } else {
            this.QuoteResult = { AmountText: '—', Why: 'No price applies.', Skipped: skip };
        }
        this.cdr?.markForCheck();
    }

    private async loadInheritedPrices(): Promise<void> {
        this.InheritedRecords = [];
        const categoryId = this.Product?.ProductCategoryID;
        if (!categoryId) return;
        const md = new Metadata();
        await LoadOrdersEngine(Metadata.Provider, md.CurrentUser);
        const chain = OrdersEngine.Instance.CategoryChain(categoryId);
        this.InheritedRecords = OrdersEngine.Instance.ProductPricesFor(null, chain).filter(
            (p) => !p.ProductID && (!p.Status || p.Status === 'Active'),
        ) as ProductPriceEntity[];
    }
}
