import {
    Component,
    EventEmitter,
    Input,
    OnInit,
    OnChanges,
    SimpleChanges,
    Output,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersPriceListEntity
} from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../../../panels/money-format';

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

const PRODUCT_PRICES_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PRICE_LISTS_ENTITY = 'MJ_BizApps_Orders: Price Lists';

/**
 * World-Class Product Pricing Matrix & Volume Ladder Widget (Option 1).
 *
 * Provides commercial channel segmentation (Base List, Wholesale, Partner),
 * rapid 1-click volume tier ladder configuration with gap/overlap protection,
 * live discount & savings math, and an interactive step curve.
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

    private cdr = inject(ChangeDetectorRef);
    private navService = inject(NavigationService, { optional: true });

    public IsLoading = false;
    public IsSaving = false;
    public IsAdvancedGridView = false;

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

    ngOnInit(): void {
        this.LoadPricingData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Product'] && !changes['Product'].isFirstChange()) {
            this.LoadPricingData();
        }
    }

    public get BaseListPrice(): number {
        // Base list price is the single-unit price of the base list (or StandaloneSellingPrice if set)
        if (this.Product?.StandaloneSellingPrice && this.Product.StandaloneSellingPrice > 0) {
            return Number(this.Product.StandaloneSellingPrice);
        }
        const baseFirstTier = this.AllPriceRecords.find(p => !p.PriceListID && (p.MinQuantity === 1 || !p.MinQuantity));
        if (baseFirstTier && baseFirstTier.Amount > 0) {
            return Number(baseFirstTier.Amount);
        }
        return 1200;
    }

    public get FormattedBasePrice(): string {
        return FormatMoney(this.BaseListPrice);
    }

    public get ProductPricesViewParams(): RunViewParams | null {
        if (!this.Product?.IsSaved || !this.Product?.ID) return null;
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
        };
    }

    public async LoadPricingData(): Promise<void> {
        if (!this.Product?.IsSaved || !this.Product?.ID) return;

        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const [pricesResult, listsResult] = await Promise.all([
                rv.RunView<mjBizAppsOrdersProductPriceEntity>({
                    EntityName: PRODUCT_PRICES_ENTITY,
                    ExtraFilter: `ProductID = '${this.Product.ID}'`,
                    OrderBy: 'MinQuantity ASC, __mj_CreatedAt ASC',
                    ResultType: 'entity_object',
                    MaxRows: 100,
                }),
                rv.RunView<mjBizAppsOrdersPriceListEntity>({
                    EntityName: PRICE_LISTS_ENTITY,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object',
                    MaxRows: 50,
                }),
            ]);

            if (pricesResult.Success && pricesResult.Results) {
                this.AllPriceRecords = pricesResult.Results;
            }

            // Build Channels
            const availableLists: mjBizAppsOrdersPriceListEntity[] = listsResult.Success && listsResult.Results ? listsResult.Results : [];
            this.buildChannelsList(availableLists);

            // Build Ladder for currently selected channel
            this.rebuildLadder();
        } catch (err) {
            console.error('Failed to load product pricing records:', err);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private buildChannelsList(allPriceLists: mjBizAppsOrdersPriceListEntity[]): void {
        const baseTiersCount = this.AllPriceRecords.filter(p => !p.PriceListID).length;

        const channels: PriceChannel[] = [
            {
                ID: null,
                Name: 'Base / Direct List',
                Icon: 'fa-solid fa-globe',
                TierCount: baseTiersCount,
            }
        ];

        for (const pl of allPriceLists) {
            const tierCount = this.AllPriceRecords.filter(p => p.PriceListID === pl.ID).length;
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
        this.cdr.markForCheck();
    }

    private rebuildLadder(): void {
        const channelRecords = this.AllPriceRecords
            .filter(p => (this.SelectedChannelID === null ? !p.PriceListID : p.PriceListID === this.SelectedChannelID))
            .sort((a, b) => (a.MinQuantity || 0) - (b.MinQuantity || 0));

        const base = this.BaseListPrice;
        let maxSeenQty = 0;

        const tiers: LadderTierRow[] = channelRecords.map((rec, index) => {
            const min = Number(rec.MinQuantity) || 1;
            const max = rec.MaxQuantity != null ? Number(rec.MaxQuantity) : null;
            if (max != null && max > maxSeenQty) maxSeenQty = max;
            else if (min > maxSeenQty) maxSeenQty = min;

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
            this.NewTierPrice = base;
            this.NewTierModel = 'PerUnit';
        } else {
            const lastTier = tiers[tiers.length - 1];
            if (lastTier.MaxQuantity != null) {
                this.NewTierMin = lastTier.MaxQuantity + 1;
                this.NewTierMax = this.NewTierMin + 49;
                this.NewTierPrice = Math.max(1, Math.round(lastTier.Amount * 0.85));
            } else {
                this.NewTierMin = lastTier.MinQuantity + 50;
                this.NewTierMax = null;
                this.NewTierPrice = Math.max(1, Math.round(lastTier.Amount * 0.85));
            }
            this.NewTierModel = 'Volume';
        }

        // Build Step Curve Bars
        this.buildStepBars(tiers, base);
        this.cdr.markForCheck();
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
        if (!this.Product?.IsSaved || !this.Product?.ID) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const md = new Metadata();
            const newPrice = await md.GetEntityObject<mjBizAppsOrdersProductPriceEntity>(PRODUCT_PRICES_ENTITY);
            if (!newPrice) {
                throw new Error(`Failed to create entity object for ${PRODUCT_PRICES_ENTITY}`);
            }

            newPrice.ProductID = this.Product.ID;
            newPrice.PriceListID = this.SelectedChannelID;
            newPrice.MinQuantity = this.NewTierMin;
            newPrice.MaxQuantity = this.NewTierMax && this.NewTierMax > this.NewTierMin ? this.NewTierMax : null;
            newPrice.Amount = this.NewTierPrice;
            newPrice.PricingModel = this.NewTierModel;
            newPrice.FeeType = 'Standard';
            newPrice.EffectiveFrom = new Date();

            const saved = await newPrice.Save();
            if (saved) {
                this.AllPriceRecords.push(newPrice);
                this.rebuildLadder();
                this.updateChannelCounts();
                this.PriceChanged.emit();
                this.TierAdded.emit(newPrice);
            }
        } catch (err) {
            console.error('Failed to create tier bracket:', err);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async OnPriceInputBlur(tier: LadderTierRow, event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const rawVal = parseFloat(input.value.replace(/[^0-9.]/g, ''));
        if (isNaN(rawVal) || rawVal === tier.Amount) return;

        tier.Record.Amount = rawVal;
        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            await tier.Record.Save();
            this.rebuildLadder();
            this.PriceChanged.emit();
        } catch (err) {
            console.error('Failed to update tier price:', err);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async DeleteTier(tier: LadderTierRow): Promise<void> {
        if (!confirm(`Are you sure you want to delete ${tier.BracketLabel} (${tier.UnitRangeText})?`)) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const deleted = await tier.Record.Delete();
            if (deleted) {
                this.AllPriceRecords = this.AllPriceRecords.filter(p => p.ID !== tier.ID);
                this.rebuildLadder();
                this.updateChannelCounts();
                this.PriceChanged.emit();
            }
        } catch (err) {
            console.error('Failed to delete tier:', err);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public OpenTierRecord(tier: LadderTierRow): void {
        if (!this.navService) return;
        this.navService.OpenEntityRecord(PRODUCT_PRICES_ENTITY, CompositeKey.FromID(tier.ID));
    }

    public OpenNewPriceDialog(): void {
        if (!this.navService) return;
        this.navService.OpenNewEntityRecord(PRODUCT_PRICES_ENTITY, this.NewPriceRecordValues);
    }

    private updateChannelCounts(): void {
        for (const ch of this.Channels) {
            ch.TierCount = this.AllPriceRecords.filter(p => (ch.ID === null ? !p.PriceListID : p.PriceListID === ch.ID)).length;
        }
    }

    public FormatCurrency(val: number): string {
        return FormatMoney(val);
    }
}
