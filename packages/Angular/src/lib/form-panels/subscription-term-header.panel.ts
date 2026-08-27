import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../panels/money-format';
import { FormatCoverageWindow, TermStatusChipClass } from './document-form.helpers';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SubscriptionTerms:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscription Terms',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-term-header-panel',
    templateUrl: './subscription-term-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class SubscriptionTermHeaderPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionTermEntity> {
    public get Title(): string {
        return `Term ${this.Record.TermNumber || 1}`;
    }

    public get StatusClass(): string {
        return TermStatusChipClass(this.Record.Status);
    }

    public get Coverage(): string {
        return FormatCoverageWindow(this.Record.StartDate, this.Record.EndDate);
    }

    public get Amount(): string {
        return FormatMoney(this.Record.Amount);
    }

    public get Subscription(): string {
        return this.Record.Subscription || '—';
    }
}
