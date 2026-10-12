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
                CompanyID: 'co-1',
                Company: 'Meridian',
                IsTaxable: true,
                MaxQuantityPerLine: 1,
                SubscriptionTypeID: null,
            },
            { OrderLineExtensionEntity: 'MJ_BizApps_Orders: Event Order Lines' },
            450,
        );

        expect(option.ProductTypeID).toBe('type-event');
        expect(option.OrderLineExtensionEntity).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(option.ListPrice).toBe(450);
        expect(option.Taxable).toBe(true);
        expect(option.MaxQuantityPerLine).toBe(1);
        expect(option.CompanyID).toBe('co-1');
    });

    it('leaves OrderLineExtensionEntity null when the type is missing', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-3',
                Name: 'Unknown Type SKU',
                SKU: 'UNK-1',
                ProductType: '',
                ProductTypeID: 'type-missing',
                CompanyID: 'co-1',
                Company: 'Meridian',
                IsTaxable: false,
                MaxQuantityPerLine: null,
                SubscriptionTypeID: null,
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
                CompanyID: 'co-1',
                Company: 'Meridian',
                IsTaxable: false,
                MaxQuantityPerLine: null,
                SubscriptionTypeID: null,
            },
            { OrderLineExtensionEntity: null },
            0,
        );

        expect(option.OrderLineExtensionEntity).toBeNull();
        expect(option.ListPrice).toBe(0);
        // A mug starts no term, which is what keeps term-only fields off its line.
        expect(option.SubscriptionTypeID).toBeNull();
    });

    it("carries the product's subscription type, so a line editor can tell a membership apart", () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-4',
                Name: 'Sidecar Membership',
                SKU: 'MEM-SIDECAR',
                ProductType: 'Membership',
                ProductTypeID: 'type-membership',
                Company: 'Meridian',
                IsTaxable: false,
                MaxQuantityPerLine: null,
                SubscriptionTypeID: 'subtype-annual',
            },
            { OrderLineExtensionEntity: null },
            0,
        );

        expect(option.SubscriptionTypeID).toBe('subtype-annual');
    });

    it('shows no list price when the product has no base price row', () => {
        const option = CatalogOptionFrom(
            {
                ID: 'prod-5',
                Name: 'Unpriced Add-on',
                SKU: 'ADD-1',
                ProductType: 'Service',
                ProductTypeID: 'type-service',
                CompanyID: 'co-1',
                Company: 'Meridian',
                IsTaxable: false,
                MaxQuantityPerLine: null,
                SubscriptionTypeID: null,
            },
            { OrderLineExtensionEntity: null },
            null,
        );

        // Null, not $0.00: the line will not price it, and zero reads as free.
        expect(option.ListPrice).toBeNull();
    });
});
