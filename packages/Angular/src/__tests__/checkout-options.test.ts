/**
 * Product options on the checkout widget (golive #399): the server discovers the sold product's
 * options; the widget renders them, starts on each default, gates Pay on required ones and sends
 * the picks on the draft line.
 */
import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { MJCheckoutWidgetComponent, type CheckoutWidgetConfig } from '../lib/checkout-widget/checkout-widget.component';
import { buildCheckoutDraftLine } from '../lib/checkout-widget/checkout-draft-line';

if (typeof globalThis.window === 'undefined') {
    (globalThis as unknown as { window: Record<string, unknown> }).window = globalThis as unknown as Record<string, unknown>;
}

const OPTIONS: CheckoutWidgetConfig['productOptions'] = [
    {
        code: 'TIER',
        label: 'Tier',
        required: true,
        defaultValue: 'STANDARD',
        values: [
            { value: 'STANDARD', label: 'Standard' },
            { value: 'PRO', label: 'Pro' },
        ],
    },
    { code: 'SIZE', label: 'Size', required: true, values: [{ value: 'SMALL', label: 'Small' }] },
];

function filled(): MJCheckoutWidgetComponent {
    const c = new MJCheckoutWidgetComponent();
    c.config = { unitPrice: 0, productOptions: OPTIONS } as CheckoutWidgetConfig;
    c.email.set('jane@example.com');
    c.firstName.set('Jane');
    c.lastName.set('Doe');
    c.onBillingCountryChange('US');
    c.onBillingRegionChange('IL');
    c.onBillingPostalCodeChange('60601');
    return c;
}

describe('checkout widget product options', () => {
    it('starts each option on its default and keeps Pay disabled until every required one is picked', () => {
        const c = filled();
        expect(c.optionPickFor('TIER')).toBe('STANDARD');
        expect(c.isFormValid()).toBe(false);
        c.onOptionPicked('SIZE', 'SMALL');
        expect(c.isFormValid()).toBe(true);
        c.onOptionPicked('TIER', '');
        expect(c.isFormValid()).toBe(false);
    });

    it('drops the quote when a pick changes, since the pick can change the price', () => {
        const c = filled();
        const spy = vi.spyOn(c.quoteInvalidated, 'emit');
        c.onOptionPicked('TIER', 'PRO');
        expect(spy).toHaveBeenCalled();
    });

    it('keeps a buyer’s pick across a config refresh while the product still offers it', () => {
        const c = filled();
        c.onOptionPicked('TIER', 'PRO');
        c.config = { unitPrice: 0, productOptions: OPTIONS } as CheckoutWidgetConfig;
        expect(c.optionPickFor('TIER')).toBe('PRO');
        c.config = { unitPrice: 0 } as CheckoutWidgetConfig;
        expect(c.optionPickFor('TIER')).toBe('');
    });

    it('sends the picks on the draft line', () => {
        const c = filled();
        c.onOptionPicked('SIZE', 'SMALL');
        const spy = vi.spyOn(c.submitted, 'emit');
        c.handleSubmit();
        const event = spy.mock.calls[0][0];
        expect(event.optionPicks).toEqual({ TIER: 'STANDARD', SIZE: 'SMALL' });
        expect(buildCheckoutDraftLine('p1', event)).toMatchObject({ ProductID: 'p1', OptionPicks: { TIER: 'STANDARD', SIZE: 'SMALL' } });
    });

    it('leaves OptionPicks off a line with none', () => {
        const c = new MJCheckoutWidgetComponent();
        c.config = { unitPrice: 0 } as CheckoutWidgetConfig;
        const line = buildCheckoutDraftLine('p1', { quantity: 1, optionPicks: {} } as never);
        expect(line).not.toHaveProperty('OptionPicks');
    });
});
