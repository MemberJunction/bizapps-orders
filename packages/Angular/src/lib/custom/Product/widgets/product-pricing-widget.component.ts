import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../../../panels/money-format';

export interface TierSimResult {
    Quantity: number;
    MatchedBand: string;
    UnitPrice: number;
    DiscountPercent: number;
    TotalAmount: number;
    TotalSavings: number;
    EstimatedMarginPercent: number;
}

/**
 * Droppable Product Pricing & Volume Tiers Widget.
 *
 * Provides a real-time interactive price simulator alongside the
 * product's active price list rules and volume tier assignments.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-pricing-widget',
    templateUrl: './product-pricing-widget.component.html',
    styleUrls: ['./product-pricing-widget.component.css'],
})
export class BizAppsProductPricingWidgetComponent implements OnInit {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public SimQuantity = 25;
    public SimResult: TierSimResult = {
        Quantity: 25,
        MatchedBand: 'Standard Tier (1–19 units)',
        UnitPrice: 100,
        DiscountPercent: 0,
        TotalAmount: 2500,
        TotalSavings: 0,
        EstimatedMarginPercent: 45,
    };

    ngOnInit(): void {
        this.RecalculateSimulation();
    }

    public get BasePrice(): number {
        return Number(this.Product?.StandaloneSellingPrice || 1200);
    }

    public get FormattedBasePrice(): string {
        return FormatMoney(this.BasePrice);
    }

    public get ProductPricesViewParams(): RunViewParams | null {
        if (!this.Product?.IsSaved || !this.Product?.ID) return null;
        return {
            EntityName: 'MJ_BizApps_Orders: Product Prices',
            ExtraFilter: `ProductID = '${this.Product.ID}'`,
            OrderBy: 'MinQuantity ASC, EffectiveFrom DESC',
            ResultType: 'entity_object',
        };
    }

    public get NewPriceRecordValues(): Record<string, unknown> {
        return {
            ProductID: this.Product?.ID,
        };
    }

    public OnSliderChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.SimQuantity = parseInt(input.value, 10) || 1;
        this.RecalculateSimulation();
    }

    public RecalculateSimulation(): void {
        const qty = this.SimQuantity;
        const base = this.BasePrice;

        let discountPct = 0;
        let band = 'Base Tier (1–19 units)';

        if (qty >= 50) {
            discountPct = 25;
            band = 'Volume Enterprise (50+ units)';
        } else if (qty >= 20) {
            discountPct = 15;
            band = 'Volume Mid-Market (20–49 units)';
        }

        const unit = base * (1 - discountPct / 100);
        const total = qty * unit;
        const savings = (qty * base) - total;
        const margin = 40 + (discountPct > 0 ? 5 : 0);

        this.SimResult = {
            Quantity: qty,
            MatchedBand: band,
            UnitPrice: unit,
            DiscountPercent: discountPct,
            TotalAmount: total,
            TotalSavings: savings,
            EstimatedMarginPercent: margin,
        };
    }

    public FormatCurrency(val: number): string {
        return FormatMoney(val);
    }
}
