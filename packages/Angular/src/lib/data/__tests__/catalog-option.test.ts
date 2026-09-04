import { describe, expect, it } from 'vitest';
import { CatalogOptionFrom } from '../orders-queries';

describe('CatalogOptionFrom', () => {
    it('carries the product type and its order-line extension entity', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-1',
                Name: 'Annual Summit Ticket',
                SKU: 'EVT-SUMMIT',
                ProductType: 'Event',
                ProductTypeID: 'type-event',
                Company: 'Meridian',
                CompanyID: 'co-1',
                ProductCategoryID: 'cat-1',
                IsTaxable: true,
                MaxQuantityPerLine: 1,
            },
            { OrderLineExtensionEntity: 'MJ_BizApps_Orders: Event Order Lines' },
            450,
        );

        expect(option.ProductTypeID).toBe('type-event');
        expect(option.OrderLineExtensionEntity).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(option.ListPrice).toBe(450);
        expect(option.CompanyID).toBe('co-1');
        expect(option.ProductCategoryID).toBe('cat-1');
        expect(option.Taxable).toBe(true);
        expect(option.MaxQuantityPerLine).toBe(1);
    });

    it('leaves OrderLineExtensionEntity null when the type is missing', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-3',
                Name: 'Unknown Type SKU',
                SKU: 'UNK-1',
                ProductType: '',
                ProductTypeID: 'type-missing',
                Company: 'Meridian',
                CompanyID: 'co-1',
                ProductCategoryID: null,
                IsTaxable: false,
                MaxQuantityPerLine: null,
            },
            undefined,
            0,
        );
        expect(option.OrderLineExtensionEntity).toBeNull();
    });

    it('leaves OrderLineExtensionEntity null when the type has no extension', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-2',
                Name: 'Sticker Pack',
                SKU: 'STK-1',
                ProductType: 'Goods',
                ProductTypeID: 'type-goods',
                Company: 'Meridian',
                CompanyID: 'co-1',
                ProductCategoryID: null,
                IsTaxable: false,
                MaxQuantityPerLine: null,
            },
            { OrderLineExtensionEntity: null },
            0,
        );

        expect(option.OrderLineExtensionEntity).toBeNull();
        expect(option.ListPrice).toBe(0);
    });

    it('uses the ProductPrice figure, not StandaloneSellingPrice', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-4',
                Name: 'Member Dues',
                SKU: 'DUE-1',
                ProductType: 'Dues',
                ProductTypeID: 'type-dues',
                Company: 'Meridian',
                CompanyID: 'co-1',
                ProductCategoryID: 'cat-dues',
                IsTaxable: false,
                MaxQuantityPerLine: null,
            },
            { OrderLineExtensionEntity: null },
            150,
        );
        expect(option.ListPrice).toBe(150);
    });
});
