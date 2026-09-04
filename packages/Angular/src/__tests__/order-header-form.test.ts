import '@angular/compiler';
import '../public-api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import type {
    MJOPricingResult,
    MJOPricingState,
} from '../lib/services/pricing-scheduler.service';
import { mjBizAppsOrdersOrderHeaderFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersOrderHeader/mjbizappsordersorderheader.form.component';
import {
    BizAppsOrderHeaderFormComponent,
    ORDER_FORM_NEW_TABS,
    ORDER_FORM_SAVED_TABS,
    OrderFormTabs,
} from '../lib/custom/OrderHeader/order-header-form.component';
import { OrderHeaderExpandedFromPref } from '../lib/custom/OrderHeader/order-header-prefs';

const here = import.meta.dirname;

describe('BizAppsOrderHeaderFormComponent', () => {
    it('subclasses the generated order header form', () => {
        expect(BizAppsOrderHeaderFormComponent.prototype instanceof mjBizAppsOrdersOrderHeaderFormComponent).toBe(true);
    });

    it('registers under MJ_BizApps_Orders: Order Headers', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Order Headers',
        );
        expect(registrations.find((r) => r.SubClass === BizAppsOrderHeaderFormComponent)).toBeDefined();
    });

    it('wins ClassFactory priority over the generated form', () => {
        const active = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Order Headers',
        );
        expect(active?.SubClass).toBe(BizAppsOrderHeaderFormComponent);
    });

    it('keeps only payment and details on a new order', () => {
        expect(OrderFormTabs(false).map((tab) => tab.key)).toEqual(['payment', 'details']);
        expect(ORDER_FORM_NEW_TABS.map((tab) => tab.key)).toEqual(['payment', 'details']);
    });

    it('adds charges, accounting and subscriptions only after the order is saved', () => {
        expect(OrderFormTabs(true).map((tab) => tab.key)).toEqual([
            'payment',
            'details',
            'charges',
            'accounting',
            'subs',
        ]);
        expect(ORDER_FORM_SAVED_TABS.map((tab) => tab.key)).toEqual(['charges', 'accounting', 'subs']);
    });

    it('does not put bill-to or ship-to on the header tab strip', () => {
        expect(OrderFormTabs(true).map((tab) => tab.key)).not.toContain('bill');
        expect(OrderFormTabs(true).map((tab) => tab.key)).not.toContain('ship');
    });

    it('hard-stops leftover related grids on the full-page compose form', () => {
        const ts = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.ts'),
            'utf8',
        );
        expect(ts).toContain('ShowRelatedEntities: false');
    });

    it('lists applied payments via Payment Headers filtered by PaymentLine.OrderHeaderID', () => {
        const ts = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.ts'),
            'utf8',
        );
        const html = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        expect(ts).toContain('EntityName: MJO_ENTITIES.PaymentHeader');
        expect(ts).toContain("ID IN (SELECT PaymentHeaderID FROM [__mj_BizAppsOrders].[PaymentLine] WHERE OrderHeaderID = '${this.record.ID}')");
        expect(html).toContain("[Height]=\"'fit-content'\"");
        expect(html).toContain('[MaxHeight]="RelatedGridHeight"');
    });

    it('collapses the header to customer + date and persists only for saved orders', () => {
        expect(OrderHeaderExpandedFromPref(false, '0')).toBe(true);
        expect(OrderHeaderExpandedFromPref(true, '0')).toBe(false);
        const html = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        expect(html).toContain('ToggleHeader()');
        expect(html).toContain('@if (HeaderExpanded)');
        expect(html).toContain('HeaderCollapsedMeta');
    });
});

describe('order header link wiring', () => {
    it('relays every form-field Navigate to the host (Explorer maps that to OpenEntityRecord)', () => {
        const html = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        const fields = [...html.matchAll(/<mj-form-field\b[^>]*>/g)].map((m) => m[0]);
        expect(fields.length).toBeGreaterThan(0);
        const missing = fields.filter((tag) => !tag.includes('(Navigate)="OnFormNavigate($event)"'));
        expect(missing).toEqual([]);
    });

    it('does not use hash hrefs for party or product names', () => {
        const header = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        const lines = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-lines-editor.component.html'),
            'utf8',
        );
        expect(header).not.toContain('href="#"');
        expect(lines).not.toContain('href="#"');
    });

    it('passes ComposeMode into the lines editor so booked orders cannot add lines', () => {
        const header = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        const ts = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.ts'),
            'utf8',
        );
        expect(ts).toContain('get ComposeMode()');
        expect(header).toContain('[EditMode]="ComposeMode"');
        expect(header).toContain('mjo-order-lines-editor');
    });

    it('gates quantity, remove, picker and the extension form on the order EditMode', () => {
        const lines = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-lines-editor.component.html'),
            'utf8',
        );
        expect(lines).toContain('[class.is-locked]="!EditMode || QuantityCappedToOne(line)"');
        expect(lines).toContain('@if (EditMode)');
        expect(lines).toContain('[EditMode]="EditMode"');
        expect(lines).toContain('mjo-ol-picker');
    });

    it('offers Confirm as a toolbar action and does not let Status be edited', () => {
        const ts = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.ts'),
            'utf8',
        );
        const header = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        expect(ts).toContain('RegisterToolbarItem');
        expect(ts).toContain('confirm-order');
        expect(ts).toContain('Confirm order');
        expect(ts).toContain('RunConfirm()');
        expect(header).toContain('Check / ACH reference');
        expect(header).toMatch(/FieldName="Status"[\s\S]*?\[EditMode\]="false"/);
        expect(header).toMatch(/FieldName="FulfillmentStatus"[\s\S]*?\[EditMode\]="false"/);
    });

    // Issue bc-aidp-next-golive#186 — an unpaid $895 order rendered its Balance as `—`. The dash is the
    // "not computed yet" marker, so a screen showing it for a real debt is claiming not to
    // know. These pin the two halves: a real zero prints, and an unknown falls back.
    describe('hero money trio (bc-aidp-next-golive#186)', () => {
        const form = (
            record: Partial<mjBizAppsOrdersOrderHeaderEntity> | null,
            pricing: MJOPricingState = { Result: null, Loading: false, Error: null },
        ): BizAppsOrderHeaderFormComponent => {
            const instance = Object.create(
                BizAppsOrderHeaderFormComponent.prototype,
            ) as BizAppsOrderHeaderFormComponent;
            instance.record = record as mjBizAppsOrdersOrderHeaderEntity;
            instance.Pricing = pricing;
            return instance;
        };

        const priced = (net: number, gross: number): MJOPricingState => ({
            Result: { Lines: [], Totals: { NetTotal: net, GrossTotal: gross } } as unknown as MJOPricingResult,
            Loading: false,
            Error: null,
        });

        it('shows the amount owed on a confirmed unpaid order', () => {
            const instance = form({ IsSaved: true, TotalGross: 895, AmountPaid: 0, Balance: 895 });
            expect(instance.Money('balance')).toBe('$895');
            expect(instance.Money('paid')).toBe('$0');
        });

        it('prints a genuine zero balance rather than a dash', () => {
            const instance = form({ IsSaved: true, TotalGross: 200, AmountPaid: 200, Balance: 0 });
            expect(instance.Money('balance')).toBe('$0');
        });

        it('derives the balance when the rollup has not landed yet', () => {
            // The server used to hand back Balance = null on a freshly-confirmed order, which is
            // what produced the reported dash. Even if that ever recurs, the tile owes a number.
            const instance = form(
                { IsSaved: true, TotalGross: null, AmountPaid: 0, Balance: null },
                priced(895, 895),
            );
            expect(instance.Money('balance')).toBe('$895');
        });

        it('shows paid and balance on an unsaved draft instead of two dashes', () => {
            const instance = form({ IsSaved: false, AmountPaid: 0, Balance: null }, priced(895, 895));
            expect(instance.Money('paid')).toBe('$0');
            expect(instance.Money('balance')).toBe('$895');
        });

        it('keeps cents across the trio when any figure has them', () => {
            const instance = form({ IsSaved: true, TotalGross: 895.5, AmountPaid: 100, Balance: 795.5 });
            expect(instance.Money('total')).toBe('$895.50');
            expect(instance.Money('paid')).toBe('$100.00');
            expect(instance.Money('balance')).toBe('$795.50');
        });

        it('says loading, not unknown, while the first price is in flight', () => {
            const instance = form(
                { IsSaved: false, AmountPaid: 0, Balance: null },
                { Result: null, Loading: true, Error: null },
            );
            expect(instance.Money('balance')).toBe('…');
        });

        it('still shows a dash when there is no record at all', () => {
            const instance = form(null);
            expect(instance.Money('balance')).toBe('—');
            expect(instance.Money('paid')).toBe('—');
        });
    });

    it('keeps existing line extensions collapsed behind a disclosure', () => {
        const lines = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-lines-editor.component.html'),
            'utf8',
        );
        expect(lines).toContain('mjo-ol-ext__toggle');
        expect(lines).toContain('[attr.aria-expanded]="IsExtensionOpen(line)"');
        expect(lines).toContain('[class.is-open]="IsExtensionOpen(line)"');
        expect(lines).toContain('ToggleExtension(line)');
    });

    it('offers OverrideList named-price pick and OverrideAny amount on a line', () => {
        const lines = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-lines-editor.component.html'),
            'utf8',
        );
        expect(lines).toContain('CanPickNamedPrice');
        expect(lines).toContain('OnPickNamedPrice(line, $event)');
        expect(lines).toContain('CanTypeAmount');
        expect(lines).toContain('OnTypeAmount(line, $event)');
        expect(lines).toContain('Engine price');
    });
});
