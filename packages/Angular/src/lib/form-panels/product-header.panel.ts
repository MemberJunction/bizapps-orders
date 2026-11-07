import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { LoadProductListPriceLabel } from '../panels/catalog-list-price';
import { ProductLookupNamesTracker, REV_REC_FROM_TYPE_LABEL, type ProductLookupNames } from '../panels/product-lookup-names';
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
export class ProductHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> implements OnInit {
    public ListPriceLabel = '—';
    private listPriceFor: string | null = null;
    private cdr = inject(ChangeDetectorRef, { optional: true });
    /** Resolved by id — the record's virtual name fields are unreliable (Pin 28). Follows edits. */
    private lookups = new ProductLookupNamesTracker(() => this.cdr?.markForCheck());

    public get Title(): string {
        return this.Record.Name || 'New product';
    }

    public async ngOnInit(): Promise<void> {
        await this.lookups.Refresh(this.Record);
    }

    public get Lookups(): ProductLookupNames {
        return this.lookups.For(this.Record);
    }

    public get TypeName(): string {
        return this.Lookups.Type;
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

    /** The same name the Accounting section shows: the product's own type, else its type's default. */
    public get RevRec(): string {
        return this.Lookups.RevRec;
    }

    /** Says where `RevRec` comes from when the product does not set it itself. */
    public get RevRecSource(): string | null {
        return this.Lookups.RevRecFromType ? REV_REC_FROM_TYPE_LABEL : null;
    }
}
