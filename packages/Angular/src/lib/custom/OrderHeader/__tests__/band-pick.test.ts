// See default-price-label.test.ts: the compiler import covers JIT fallback; nothing bootstraps Angular.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { ApplicablePrice } from '@mj-biz-apps/orders-entities';
import { MJOLinePricePickerComponent } from '../../../panels/line-price-picker.component';

/**
 * A revenue-band product whose buyer has no revenue on record: the rules cannot choose the band, so
 * the picker offers the bands to anyone editing the order, override grant or not.
 */
function picker(over: Partial<MJOLinePricePickerComponent>): MJOLinePricePickerComponent {
    const p = Object.create(MJOLinePricePickerComponent.prototype) as MJOLinePricePickerComponent;
    Object.assign(p as object, { DefaultUnit: null, PriceSource: null, EngineDefault: null, OverrideKind: 'none', Applicable: [] }, over);
    return p;
}

function price(ID: string, Name: string, UnitPrice: number, band: Partial<ApplicablePrice> = {}): ApplicablePrice {
    return { ID, Name, UnitPrice, ExtendedAmount: UnitPrice, PriceListID: null, InheritedFrom: 'product', InheritedFromCategoryID: null, ...band };
}

const bands = [
    price('b1', 'Under $1M rev', 11000, { IsRevenueBand: true, BandUndecided: true }),
    price('b2', '$1M–$2M rev', 14000, { IsRevenueBand: true, BandUndecided: true }),
];
const member = price('m', 'Member', 9000);

describe('MJOLinePricePickerComponent — revenue band to pick', () => {
    it('opens for a user with no override grant, offering only the bands', () => {
        const p = picker({ Applicable: [...bands, member] });
        expect(p.BandChoiceOpen).toBe(true);
        expect(p.NamedPricesFor().map((x) => x.ID)).toEqual(['b1', 'b2']);
        expect(p.DefaultLabel()).toBe('Pick a revenue band');
    });

    it('still offers every named price to a user who may override', () => {
        const p = picker({ Applicable: [...bands, member], OverrideKind: 'list' });
        expect(p.NamedPricesFor().map((x) => x.ID)).toEqual(['b1', 'b2', 'm']);
    });

    it('stays closed once the engine has chosen the band', () => {
        const p = picker({
            Applicable: [price('b2', '$1M–$2M rev', 14000, { IsRevenueBand: true, BandUndecided: false })],
            EngineDefault: { UnitPrice: 14000, ProductPriceID: 'b2', PriceName: '$1M–$2M rev' },
        });
        expect(p.BandChoiceOpen).toBe(false);
    });
});
