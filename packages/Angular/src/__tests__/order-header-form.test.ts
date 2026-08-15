import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { mjBizAppsOrdersOrderHeaderFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersOrderHeader/mjbizappsordersorderheader.form.component';
import {
    BizAppsOrderHeaderFormComponent,
    ORDER_FORM_NEW_TABS,
    ORDER_FORM_SAVED_TABS,
    OrderFormTabs,
} from '../lib/custom/OrderHeader/order-header-form.component';
import '../public-api';

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

    it('offers Confirm as a verb and does not let Status be edited', () => {
        const header = readFileSync(
            join(here, '../lib/custom/OrderHeader/order-header-form.component.html'),
            'utf8',
        );
        expect(header).toContain('RunConfirm()');
        expect(header).toContain('Confirm order');
        expect(header).toContain('Check / ACH reference');
        expect(header).toMatch(/FieldName="Status"[\s\S]*?\[EditMode\]="false"/);
        expect(header).toMatch(/FieldName="PaymentStatus"[\s\S]*?\[EditMode\]="false"/);
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
});
