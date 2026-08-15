import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../panels/money-format';
import { ProductAvatarIcon, ProductStatusChipClass } from './document-form.helpers';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-header-panel',
    templateUrl: './product-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class ProductHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {
    public get Title(): string {
        return this.Record.Name || 'New product';
    }

    public get TypeName(): string {
        return this.Record.ProductType || '—';
    }

    public get AvatarIcon(): string {
        return ProductAvatarIcon(this.TypeName);
    }

    public get StatusClass(): string {
        return ProductStatusChipClass(this.Record.Status);
    }

    public get Price(): string {
        return FormatMoney(this.Record.StandaloneSellingPrice);
    }

    public get RevRec(): string {
        return this.Record.RevenueRecognitionType || '—';
    }
}
