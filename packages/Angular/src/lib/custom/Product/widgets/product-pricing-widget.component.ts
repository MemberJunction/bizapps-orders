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
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
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

export interface WidgetToast {
    Type: 'success' | 'error' | 'info';
    Message: string;
    Icon: string;
}

const PRODUCT_PRICES_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PRICE_LISTS_ENTITY = 'MJ_BizApps_Orders: Price Lists';

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

    private cdr = inject(ChangeDetectorRef);
    private navService = inject(NavigationService, { optional: true });

    public IsLoading = false;
    public IsSaving = false;
    public IsAdvancedGridView = false;

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
        if (this.Product?.StandaloneSellingPrice && Number(this.Product.StandaloneSellingPrice) > 0) {
            return Number(this.Product.StandaloneSellingPrice);
        }
        const baseFirstTier = this.AllPriceRecords.find(p => !p.PriceListID && (Number(p.MinQuantity) === 1 || !p.MinQuantity));
        if (baseFirstTier && Number(baseFirstTier.Amount) > 0) {
            return Number(baseFirstTier.Amount);
        }
        return 0;
    }

    public get FormattedBasePrice(): string {
        return FormatMoney(this.BaseListPrice);
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
        };
    }

    public async LoadPricingData(): Promise<void> {
        if (!this.Product?.ID) return;

        this.IsLoading = true;
        this.cdr.markForCheck();

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
        this.cdr.markForCheck();

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
            this.cdr.markForCheck();
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
        this.cdr.markForCheck();

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
            this.cdr.markForCheck();
        }
    }

    public async DeleteTier(tier: LadderTierRow): Promise<void> {
        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            if (this.Product.Prices && this.Product.Prices.Items.includes(tier.Record)) {
                this.Product.Prices.Remove(tier.Record);
            }
            const deleted = await tier.Record.Delete();
            if (deleted) {
                await this.LoadPricingData();
                this.PriceChanged.emit();
                this.ShowToast(`Deleted ${tier.BracketLabel} (${tier.UnitRangeText})`, 'info');
            } else {
                console.error('Failed to delete tier:', tier.Record.LatestResult);
                const errMsg = this.extractErrorMessage(tier.Record.LatestResult);
                this.ShowToast(`Failed to delete tier: ${errMsg}`, 'error');
            }
        } catch (err) {
            console.error('Failed to delete tier:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            this.ShowToast(`Error deleting tier: ${errMsg}`, 'error');
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
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
        this.cdr.markForCheck();

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
            this.cdr.markForCheck();
        }, durationMs);
    }

    public DismissToast(): void {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.ActiveToast = null;
        this.cdr.markForCheck();
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
}
