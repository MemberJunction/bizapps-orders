import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { LoadProductListPriceLabel } from '../panels/catalog-list-price';
import { LoadProductLookupNames, type ProductLookupNames } from '../panels/product-lookup-names';
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
    /** Resolved by id — the record's virtual name fields are unreliable (Pin 28). */
    public Lookups: ProductLookupNames = { Type: '—', Category: '—', RevRec: '—', Successor: '—' };
    private listPriceFor: string | null = null;
    /** The ids `Lookups` was resolved for; a change re-resolves, so the header follows edits. */
    private lookupsFor: string | null = null;
    private cdr = inject(ChangeDetectorRef, { optional: true });

    public get Title(): string {
        return this.Record.Name || 'New product';
    }

    public async ngOnInit(): Promise<void> {
        await this.refreshLookups();
    }

    public get TypeName(): string {
        this.refreshLookupsIfChanged();
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

    public get RevRec(): string {
        this.refreshLookupsIfChanged();
        return this.Lookups.RevRec;
    }

    private lookupsKey(): string {
        const r = this.Record;
        return [r?.ProductTypeID, r?.ProductCategoryID, r?.RevenueRecognitionTypeID, r?.SuccessorProductID].join('|');
    }

    private refreshLookupsIfChanged(): void {
        if (this.lookupsFor !== null && this.lookupsFor !== this.lookupsKey()) void this.refreshLookups();
    }

    private async refreshLookups(): Promise<void> {
        const key = this.lookupsKey();
        this.lookupsFor = key;
        const lookups = await LoadProductLookupNames(this.Record);
        if (this.lookupsFor !== key) return; // a newer edit started its own resolve
        this.Lookups = lookups;
        this.cdr?.markForCheck();
    }
}
