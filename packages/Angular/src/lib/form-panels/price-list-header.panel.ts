import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPriceListEntity } from '@mj-biz-apps/orders-entities';
import { FormatCoverageWindow } from './document-form.helpers';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PriceLists:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Price Lists',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-price-list-header-panel',
    templateUrl: './price-list-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class PriceListHeaderPanel extends BaseFormPanel<mjBizAppsOrdersPriceListEntity> {
    public get Title(): string {
        return this.Record.Name || 'New price list';
    }

    public get StatusClass(): string {
        return this.Record.Status === 'Active'
            ? 'mjo-doc-chip mjo-doc-chip--ok'
            : 'mjo-doc-chip mjo-doc-chip--muted';
    }

    public get Validity(): string {
        if (!this.Record.EffectiveFrom && !this.Record.EffectiveTo) {
            return 'Ongoing';
        }
        return FormatCoverageWindow(this.Record.EffectiveFrom, this.Record.EffectiveTo);
    }
}
