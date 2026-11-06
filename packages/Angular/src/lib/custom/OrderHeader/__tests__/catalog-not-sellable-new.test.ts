// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import type { MJOProductOption } from '../../../data/orders-queries';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * A product whose IsSellableNew is off (bc-aidp-next-golive#360) stays in the editor's catalog so a
 * line already on the order keeps its name, subscription flag and quantity cap, but the add-product
 * picker does not offer it.
 */

const SELLABLE = 'c1c2c3d4-0000-4000-8000-000000000001';
const FLAGGED = 'c1c2c3d4-0000-4000-8000-000000000002';

function product(ID: string, Name: string, NotSellableNew?: boolean): MJOProductOption {
    return {
        ID,
        Name,
        SKU: '',
        TypeName: 'Membership',
        ProductTypeID: 't1',
        OrderLineExtensionEntity: null,
        CompanyName: 'Northwind',
        CompanyID: 'c1',
        ListPrice: null,
        Taxable: false,
        MaxQuantityPerLine: 1,
        SubscriptionTypeID: 'sub-annual',
        ContainsSubscription: false,
        ...(NotSellableNew ? { NotSellableNew } : {}),
    };
}

function editor(): MJOOrderLinesEditorComponent {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, {
        Catalog: [product(SELLABLE, 'Annual Membership'), product(FLAGGED, 'Annual Membership (converted)', true)],
        ProductQuery: 'annual',
        _order: { CompanyID: 'c1' },
        catalogVersion: 1,
        pickerCache: null,
    });
    return c;
}

describe('a product not sold new in the line editor', () => {
    it('is not offered by the picker', () => {
        expect(editor().PickerResults.map((p) => p.ID)).toEqual([SELLABLE]);
    });

    it('still describes a line already on the order', () => {
        const line = { ID: 'L1', ProductID: FLAGGED, Quantity: 5 } as unknown as mjBizAppsOrdersOrderLineEntity;
        const option = editor().ProductFor(line);
        expect(option?.Name).toBe('Annual Membership (converted)');
        expect(option?.SubscriptionTypeID).toBe('sub-annual');
        expect(option?.MaxQuantityPerLine).toBe(1);
    });
});
