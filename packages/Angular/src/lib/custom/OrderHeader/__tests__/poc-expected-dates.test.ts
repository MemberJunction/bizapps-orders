// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrdersEngine, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * Percentage of Completion lines show their dates as "Expected start" / "Expected end"
 * (bc-aidp-next-golive#455). They are optional, since recognition follows attested progress, and
 * stay editable until the order is booked.
 */

function seedEngine(): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._revenueRecognitionTypes = [
        { ID: 'rr-poc', Code: 'PercentComplete', ScheduleBasis: 'OnMeasurement', RequiresServicePeriod: false },
        { ID: 'rr-backend', Code: 'AllBackEnd', ScheduleBasis: 'AtBooking', RequiresServicePeriod: true },
        { ID: 'rr-upfront', Code: 'UpFront', ScheduleBasis: 'AtBooking', RequiresServicePeriod: false },
    ];
    engine._productTypes = [{ ID: 't-service', Code: 'Service' }];
    engine._products = [
        { ID: 'p-poc', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-poc' },
        { ID: 'p-backend', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-backend' },
        { ID: 'p-upfront', ProductTypeID: 't-service', RevenueRecognitionTypeID: 'rr-upfront' },
    ];
    engine._eventProducts = [];
}

beforeEach(seedEngine);
afterEach(() => {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._revenueRecognitionTypes = [];
    engine._productTypes = [];
    engine._products = [];
});

function editor(editMode: boolean, moneyLocked = false): MJOOrderLinesEditorComponent {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, { EditMode: editMode, _order: { MoneyLocked: moneyLocked } });
    return c;
}

const line = (ProductID: string, start: Date | null = null) =>
    ({ ID: 'l1', ProductID, ServicePeriodStart: start, ServicePeriodEnd: null }) as unknown as mjBizAppsOrdersOrderLineEntity;

describe('POC line dates are an expected window (golive#455)', () => {
    it('an editable POC line shows the expected dates, not the required service period', () => {
        const c = editor(true);
        expect(c.ShowsExpectedServicePeriod(line('p-poc'))).toBe(true);
        expect(c.NeedsStatedServicePeriod(line('p-poc'))).toBe(false);
        expect(c.CanEditServicePeriod()).toBe(true);
    });

    it('a date-driven line keeps the required service period instead', () => {
        const c = editor(true);
        expect(c.ShowsExpectedServicePeriod(line('p-backend'))).toBe(false);
        expect(c.NeedsStatedServicePeriod(line('p-backend'))).toBe(true);
        expect(c.ShowsExpectedServicePeriod(line('p-upfront'))).toBe(false);
    });

    it('read mode shows them only when the line has a date', () => {
        expect(editor(false).ShowsExpectedServicePeriod(line('p-poc'))).toBe(false);
        expect(editor(false).ShowsExpectedServicePeriod(line('p-poc', new Date(Date.UTC(2026, 6, 1))))).toBe(true);
    });

    it('the template labels them Expected start and Expected end', () => {
        const html = readFileSync(fileURLToPath(new URL('../order-lines-editor.component.html', import.meta.url)), 'utf8');
        const start = html.indexOf('@if (ShowsExpectedServicePeriod(line))');
        expect(start).toBeGreaterThan(-1);
        const block = html.slice(start, html.indexOf('COVERAGE OVERLAP', start));
        expect(block).toContain('Expected start');
        expect(block).toContain('Expected end');
        expect(block).toContain('SetServicePeriod(line, \'Start\', $event)');
        expect(block).toContain('SetServicePeriod(line, \'End\', $event)');
    });
});
