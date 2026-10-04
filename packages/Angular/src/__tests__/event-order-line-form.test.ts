import '@angular/compiler';
import '../public-api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { BizAppsEventOrderLineFormComponent } from '../lib/custom/EventOrderLine/event-order-line-form.component';
import { DescribeLineEvent } from '../lib/custom/EventOrderLine/line-event-summary';

const here = import.meta.dirname;
const css = readFileSync(
    join(here, '../lib/custom/EventOrderLine/event-order-line-form.component.css'),
    'utf8',
);

/** The declarations of the first rule whose selector is exactly `selector`. */
function RuleBody(selector: string): string {
    const start = css.indexOf(`${selector} {`);
    expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start));
}

describe('Event Order Line form layout', () => {
    // mj-form-field defaults to a fixed 200px label column beside the control. The form's
    // columns are narrower than that inside an order line card, which left the Person
    // lookup with no width at all.
    it('stacks each field label above its control', () => {
        const field = RuleBody('.mjo-eol-form ::ng-deep .mj-forms-field');
        expect(field).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
        expect(RuleBody('.mjo-eol-form ::ng-deep .mj-forms-field-validation')).toMatch(/grid-column:\s*1;/);
    });

    it('lets the primary grid columns shrink below their content', () => {
        expect(RuleBody('.mjo-eol-primary-grid')).toMatch(
            /grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\);/,
        );
    });
});

describe('DescribeLineEvent', () => {
    // Noon UTC keeps the calendar day the same in any test-runner time zone.
    const at = (day: string) => new Date(`${day}T12:00:00Z`);

    it('reports no event when the product has no Event Products row', () => {
        expect(DescribeLineEvent(undefined)).toBeNull();
        expect(DescribeLineEvent(null)).toBeNull();
    });

    it('shows the event name and its date range', () => {
        expect(DescribeLineEvent({ Name: 'Annual Conference', EventStartsAt: at('2026-10-12'), EventEndsAt: at('2026-10-14') }))
            .toEqual({ Name: 'Annual Conference', Dates: 'Oct 12, 2026 – Oct 14, 2026' });
    });

    it('shows one date for a one-day event or one with no end', () => {
        expect(DescribeLineEvent({ Name: 'Workshop', EventStartsAt: at('2026-10-12'), EventEndsAt: at('2026-10-12') })?.Dates)
            .toBe('Oct 12, 2026');
        expect(DescribeLineEvent({ Name: 'Workshop', EventStartsAt: at('2026-10-12'), EventEndsAt: null })?.Dates)
            .toBe('Oct 12, 2026');
    });
});

describe('Event Order Line form event summary', () => {
    const html = readFileSync(
        join(here, '../lib/custom/EventOrderLine/event-order-line-form.component.html'),
        'utf8',
    );

    it('shows the line event read-only, and says so when the product has none', () => {
        expect(html).toContain('@if (LineEvent; as ev)');
        expect(html).toContain('This product has no event record');
        // Read-only: the summary is text, not a form field.
        const summary = html.slice(html.indexOf('mjo-eol-event'), html.indexOf('mjo-eol-primary-grid'));
        expect(summary).not.toContain('<mj-form-field');
    });
});

describe('BizAppsEventOrderLineFormComponent.LineEvent', () => {
    afterEach(() => vi.restoreAllMocks());

    it("looks the event up by the line's product ID", () => {
        const lookup = vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockReturnValue({
            Name: 'Annual Conference',
            EventStartsAt: new Date('2026-10-12T12:00:00Z'),
            EventEndsAt: null,
        } as never);
        const form = Object.create(BizAppsEventOrderLineFormComponent.prototype) as BizAppsEventOrderLineFormComponent;
        Object.defineProperty(form, 'record', { value: { ProductID: 'prod-1' } });

        expect(form.LineEvent).toEqual({ Name: 'Annual Conference', Dates: 'Oct 12, 2026' });
        expect(lookup).toHaveBeenCalledWith('prod-1');
    });

    it('is null when the product has no Event Products row', () => {
        vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockReturnValue(undefined);
        const form = Object.create(BizAppsEventOrderLineFormComponent.prototype) as BizAppsEventOrderLineFormComponent;
        Object.defineProperty(form, 'record', { value: { ProductID: 'prod-2' } });

        expect(form.LineEvent).toBeNull();
    });
});
