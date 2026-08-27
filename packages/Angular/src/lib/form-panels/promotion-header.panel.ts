import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPromotionEntity } from '@mj-biz-apps/orders-entities';
import { FormatCoverageWindow, PromotionStatusChipClass, PromotionValueLabel } from './document-form.helpers';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Promotions:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Promotions',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-promotion-header-panel',
    templateUrl: './promotion-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class PromotionHeaderPanel extends BaseFormPanel<mjBizAppsOrdersPromotionEntity> {
    public get Title(): string {
        return this.Record.Name || 'New promotion';
    }

    public get StatusClass(): string {
        return PromotionStatusChipClass(this.Record.Status);
    }

    public get ValueLabel(): string {
        return PromotionValueLabel(this.Record.Value, this.Record.PromotionType);
    }

    public get Schedule(): string {
        if (!this.Record.EffectiveFrom && !this.Record.EffectiveTo) {
            return 'Continuous';
        }
        return FormatCoverageWindow(this.Record.EffectiveFrom, this.Record.EffectiveTo);
    }

    public get Stacking(): string {
        return this.Record.AllowsStacking
            ? `Stackable (#${this.Record.StackSequence ?? 0})`
            : 'Exclusive';
    }

    public get MaxUses(): string {
        return this.Record.MaxRedemptions ? `${this.Record.MaxRedemptions}` : 'Unlimited';
    }
}
