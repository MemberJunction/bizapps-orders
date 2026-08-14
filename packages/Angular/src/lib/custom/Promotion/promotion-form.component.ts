import { Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent, type FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersPromotionEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPromotionFormComponent } from '../../generated/Entities/mjBizAppsOrdersPromotion/mjbizappsorderspromotion.form.component';
import { FormatMoney } from '../../panels/money-format';

/**
 * Custom Promotion & Campaign form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Structure:
 * 1. Hero Identity Card: Name, Code, Value Badge (% or $ discount), Stacking Rule pill, Status.
 * 2. Campaign Budget & Redemptions Meter: Live visualization of max vs claimed redemptions.
 * 3. Terms & Qualification Rules (Min order, Min qty, Stacking order).
 * 4. Schedule & Temporal Window (Date range, Time of day).
 * 5. Coupon Codes & Target Criteria (Related entity data grids).
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Promotions')
@Component({
    standalone: false,
    selector: 'bizapps-promotion-form',
    templateUrl: './promotion-form.component.html',
    styleUrls: ['./promotion-form.component.css'],
})
export class BizAppsPromotionFormComponent extends mjBizAppsOrdersPromotionFormComponent {
    public declare record: mjBizAppsOrdersPromotionEntity;

    protected navigationService = inject(NavigationService, { optional: true });

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'promotionDetails', sectionName: 'Promotion Core Details & Discount Value', isExpanded: true },
            { sectionKey: 'termsAndConditions', sectionName: 'Qualification Rules & Stacking Order', isExpanded: true },
            { sectionKey: 'usageLimits', sectionName: 'Usage Limits & Redemption Caps', isExpanded: true },
            { sectionKey: 'scheduleAndStatus', sectionName: 'Campaign Schedule & Active Window', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPromotionCodes', sectionName: 'Issued Coupon Codes & Keys', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPromotionTargets', sectionName: 'Target Product Categories & Rules', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Historical Order Redemptions', isExpanded: false },
            { sectionKey: 'advancedConfiguration', sectionName: 'Advanced Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);
    }

    public get FormattedValue(): string {
        if (!this.record) return '—';
        const val = this.record.Value ?? 0;
        const typeStr = (this.record.PromotionType || '').toLowerCase();
        if (typeStr.includes('percent') || val <= 1) {
            return `${val}% Off`;
        }
        return `${FormatMoney(val)} Off`;
    }

    public get StatusBadgeClass(): string {
        const status: mjBizAppsOrdersPromotionEntity['Status'] | undefined = this.record?.Status;
        switch (status) {
            case 'Active':
                return 'mjo-status-chip mjo-status-chip--active';
            case 'Draft':
                return 'mjo-status-chip mjo-status-chip--draft';
            case 'Paused':
                return 'mjo-status-chip mjo-status-chip--paused';
            case 'Expired':
            default:
                return 'mjo-status-chip mjo-status-chip--inactive';
        }
    }

    public get FormattedScheduleWindow(): string {
        if (!this.record?.EffectiveFrom && !this.record?.EffectiveTo) return 'Continuous Campaign';
        const fromStr = this.record.EffectiveFrom
            ? new Date(this.record.EffectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Immediate';
        const toStr = this.record.EffectiveTo
            ? new Date(this.record.EffectiveTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Open-ended';
        return `${fromStr} – ${toStr}`;
    }

    public get StackingBadgeLabel(): string {
        if (!this.record) return 'Non-stackable';
        return this.record.AllowsStacking ? `Stackable (Seq #${this.record.StackSequence ?? 0})` : 'Exclusive (Non-stackable)';
    }
}

/** Tree-shaking prevention anchor function */
export function LoadPromotionFormComponent(): void {
    // Anchors BizAppsPromotionFormComponent in bundlers
}
