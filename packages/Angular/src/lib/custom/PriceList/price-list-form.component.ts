import { Component, inject } from '@angular/core';
import { BaseFormComponent, type FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersPriceListEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPriceListFormComponent } from '../../generated/Entities/mjBizAppsOrdersPriceList/mjbizappsorderspricelist.form.component';

export interface PriceListSimResult {
    Quantity: number;
    EffectiveUnitPrice: number;
    TotalOrderAmount: number;
    DiscountPercent: number;
    SavingsAmount: number;
}

/**
 * Custom Price List form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Structure:
 * 1. Hero Identity Card: Name, Code, Status chip, currency, and assignment counts.
 * 2. Interactive Volume & Tier Pricing Simulator.
 * 3. General Information & Validity Period.
 * 4. Product Prices & Volume Tiers (Related entity data grid).
 * 5. Customer & Organization Assignments (Related entity data grid).
 */
@Component({
    standalone: false,
    selector: 'bizapps-price-list-form',
    templateUrl: './price-list-form.component.html',
    styleUrls: ['./price-list-form.component.css'],
})
export class BizAppsPriceListFormComponent extends mjBizAppsOrdersPriceListFormComponent {
    public declare record: mjBizAppsOrdersPriceListEntity;

    protected navigationService = inject(NavigationService, { optional: true });

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    public SimBasePrice = 100;
    public SimQuantity = 25;
    public SimCalculationMode: 'volume' | 'tiered' = 'volume';
    public SimResult: PriceListSimResult = {
        Quantity: 25,
        EffectiveUnitPrice: 85,
        TotalOrderAmount: 2125,
        DiscountPercent: 15,
        SavingsAmount: 375,
    };

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'pricingSimulator', sectionName: 'Interactive Volume & Tier Simulator', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information & Currency', isExpanded: true },
            { sectionKey: 'validityPeriod', sectionName: 'Validity & Schedule Window', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersProductPrices', sectionName: 'Product Prices & Tier Rules', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPriceListAssignments', sectionName: 'Assigned Organizations & Accounts', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersOrderCompanyPolicies', sectionName: 'Company Policies', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);

        this.RecalculateSim();
    }

    public get StatusBadgeClass(): string {
        return this.record?.Status === 'Active'
            ? 'mjo-status-chip mjo-status-chip--active'
            : 'mjo-status-chip mjo-status-chip--inactive';
    }

    public get FormattedValidityWindow(): string {
        if (!this.record?.EffectiveFrom && !this.record?.EffectiveTo) return 'Perpetual / Ongoing';
        const fromStr = this.record.EffectiveFrom
            ? new Date(this.record.EffectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Immediate';
        const toStr = this.record.EffectiveTo
            ? new Date(this.record.EffectiveTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Ongoing';
        return `${fromStr} – ${toStr}`;
    }

    public OnSimQtyChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.SimQuantity = parseInt(input.value, 10) || 1;
        this.RecalculateSim();
    }

    public OnSimBasePriceChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.SimBasePrice = parseFloat(input.value) || 0;
        this.RecalculateSim();
    }

    public SetSimMode(mode: 'volume' | 'tiered'): void {
        this.SimCalculationMode = mode;
        this.RecalculateSim();
    }

    public RecalculateSim(): void {
        const qty = this.SimQuantity;
        const base = this.SimBasePrice;

        let discountPct = 0;
        if (qty >= 50) {
            discountPct = 25;
        } else if (qty >= 20) {
            discountPct = 15;
        }

        let total = 0;
        if (this.SimCalculationMode === 'volume') {
            // All units get the tier price
            const unitPrice = base * (1 - discountPct / 100);
            total = qty * unitPrice;
        } else {
            // Graduated tiered: first 19 at base, 20-49 at 15% off, 50+ at 25% off
            const tier1Qty = Math.min(qty, 19);
            const tier2Qty = Math.max(0, Math.min(qty - 19, 30));
            const tier3Qty = Math.max(0, qty - 49);

            total = (tier1Qty * base) +
                    (tier2Qty * (base * 0.85)) +
                    (tier3Qty * (base * 0.75));
        }

        const effectiveUnit = qty > 0 ? total / qty : base;
        const undiscountedTotal = qty * base;
        const savings = Math.max(0, undiscountedTotal - total);
        const effectiveDiscountPct = undiscountedTotal > 0 ? (savings / undiscountedTotal) * 100 : 0;

        this.SimResult = {
            Quantity: qty,
            EffectiveUnitPrice: effectiveUnit,
            TotalOrderAmount: total,
            DiscountPercent: effectiveDiscountPct,
            SavingsAmount: savings,
        };
    }
}

/** Tree-shaking prevention anchor function */
export function LoadPriceListFormComponent(): void {
    // Anchors BizAppsPriceListFormComponent in bundlers
}
