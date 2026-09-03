import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { LoadProductListPriceLabel } from '../panels/catalog-list-price';
import { ProductAvatarIcon, ProductStatusChipClass } from './document-form.helpers';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
        replacesSectionKey: 'productIdentification',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-header-panel',
    templateUrl: './product-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class ProductHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {
    public ListPriceLabel = '—';
    private listPriceFor: string | null = null;
    private cdr = inject(ChangeDetectorRef, { optional: true });

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
        const id = this.Record?.ID ?? null;
        if (id && id !== this.listPriceFor) {
            this.listPriceFor = id;
            void this.refreshListPrice(id);
        }
        return this.ListPriceLabel;
    }

    private async refreshListPrice(productId: string): Promise<void> {
        this.ListPriceLabel = await LoadProductListPriceLabel(productId);
        this.cdr?.markForCheck();
    }

    public get RevRec(): string {
        return this.Record.RevenueRecognitionType || '—';
    }
}
