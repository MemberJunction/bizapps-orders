import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPriceListEntity } from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../panels/money-format';
import { RecalculatePriceListSim, type PriceListSimResult } from './document-form.helpers';

const SECTION_KEY = 'simulator';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PriceLists:simulator',
    metadata: {
        entity: 'MJ_BizApps_Orders: Price Lists',
        slot: 'after-fields',
        sortKey: 90,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-price-list-simulator-panel',
    templateUrl: './price-list-simulator.panel.html',
    styleUrls: ['./price-list-simulator.css'],
})
export class PriceListSimulatorPanel extends BaseFormPanel<mjBizAppsOrdersPriceListEntity> {
    public readonly SectionKey = SECTION_KEY;
    public BasePrice = 100;
    public Quantity = 25;
    public Mode: 'volume' | 'tiered' = 'volume';
    public Result: PriceListSimResult = RecalculatePriceListSim(100, 25, 'volume');

    public OnBasePrice(event: Event): void {
        this.BasePrice = parseFloat((event.target as HTMLInputElement).value) || 0;
        this.recalc();
    }

    public OnQuantity(event: Event): void {
        this.Quantity = parseInt((event.target as HTMLInputElement).value, 10) || 1;
        this.recalc();
    }

    public SetMode(mode: 'volume' | 'tiered'): void {
        this.Mode = mode;
        this.recalc();
    }

    public Money(value: number): string {
        return FormatMoney(value);
    }

    private recalc(): void {
        this.Result = RecalculatePriceListSim(this.BasePrice, this.Quantity, this.Mode);
    }
}
