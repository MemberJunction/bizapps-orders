// @vitest-environment jsdom
/**
 * The price picker's Override Explanation box appears only once the line has left its default
 * (bizapps-orders#723). A disabled box on every line read as a field to fill in. Rendered through the
 * picker's real template; the line is a stand-in that holds field values the way an entity does.
 */
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ApplicablePrice, LineEngineDefault, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOLinePricePickerComponent } from '../line-price-picker.component';

const BASE = 'a1b2c3d4-0000-4000-8000-000000000001';
const MEMBER = 'a1b2c3d4-0000-4000-8000-000000000002';

const ENGINE: LineEngineDefault = { UnitPrice: 1200, ProductPriceID: BASE, PriceName: 'Base list price' };
const APPLICABLE = [
    { ID: BASE, Name: 'Base list price', UnitPrice: 1200 },
    { ID: MEMBER, Name: 'Member rate', UnitPrice: 900 },
] as unknown as ApplicablePrice[];

interface FakeField {
    Value: unknown;
    OldValue: unknown;
    readonly Dirty: boolean;
    RestoreOldValue(value: unknown): void;
}

function field(value: unknown): FakeField {
    return {
        Value: value,
        OldValue: value,
        get Dirty() {
            return this.Value !== this.OldValue;
        },
        RestoreOldValue(old: unknown) {
            this.OldValue = old;
            this.Value = old;
        },
    };
}

/** A saved line on its default price, whose fields behave like an entity's. */
function defaultLine(): mjBizAppsOrdersOrderLineEntity {
    const fields: Record<string, FakeField> = {
        UnitPrice: field(1200),
        ProductPriceID: field(BASE),
        PriceOverridden: field(false),
        PriceOverrideReason: field(null),
    };
    return {
        ID: 'L1',
        get UnitPrice() {
            return fields.UnitPrice.Value;
        },
        get ProductPriceID() {
            return fields.ProductPriceID.Value;
        },
        GetFieldByName: (name: string) => fields[name] ?? null,
    } as unknown as mjBizAppsOrdersOrderLineEntity;
}

beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
    TestBed.resetTestingModule();
});

function render(line: mjBizAppsOrdersOrderLineEntity) {
    TestBed.configureTestingModule({
        imports: [MJOLinePricePickerComponent],
        providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(MJOLinePricePickerComponent);
    fixture.componentRef.setInput('Line', line);
    fixture.componentRef.setInput('OverrideKind', 'list');
    fixture.componentRef.setInput('Applicable', APPLICABLE);
    fixture.componentRef.setInput('EngineDefault', ENGINE);
    fixture.componentRef.setInput('DefaultUnit', 1200);
    fixture.detectChanges();
    return fixture;
}

describe('Override Explanation (#723)', () => {
    it('is not shown while the Default row is selected', () => {
        const el = render(defaultLine()).nativeElement as HTMLElement;
        expect(el.querySelector('select')).not.toBeNull();
        expect(el.querySelector('.mjo-lpp__reason')).toBeNull();
        expect(el.querySelector('textarea')).toBeNull();
        expect(el.textContent).not.toContain('Override Explanation');
    });

    it('is shown, enabled and required, once a named price is selected', () => {
        const fixture = render(defaultLine());
        const el = fixture.nativeElement as HTMLElement;
        const select = el.querySelector('select') as HTMLSelectElement;
        select.value = MEMBER;
        select.dispatchEvent(new Event('change'));
        fixture.componentRef.changeDetectorRef.markForCheck();
        fixture.detectChanges();

        const box = el.querySelector('.mjo-lpp__reason textarea') as HTMLTextAreaElement | null;
        expect(box).not.toBeNull();
        expect(box?.disabled).toBe(false);
        expect(box?.required).toBe(true);
        expect(el.querySelector('.mjo-lpp__reason')?.textContent).toContain('Override Explanation');
    });
});
