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
                StandaloneSellingPrice: 0,
                IsTaxable: true,
            },
            { OrderLineExtensionEntity: 'MJ_BizApps_Orders: Event Order Lines' },
            450,
        );

        expect(option.ProductTypeID).toBe('type-event');
        expect(option.OrderLineExtensionEntity).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(option.ListPrice).toBe(450);
        expect(option.Taxable).toBe(true);
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
                StandaloneSellingPrice: 1,
                IsTaxable: false,
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
                StandaloneSellingPrice: 12,
                IsTaxable: false,
            },
            { OrderLineExtensionEntity: null },
            0,
        );

        expect(option.OrderLineExtensionEntity).toBeNull();
        expect(option.ListPrice).toBe(12);
    });
});
