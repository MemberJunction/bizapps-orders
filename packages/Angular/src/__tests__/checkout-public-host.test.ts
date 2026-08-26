import { describe, expect, it } from 'vitest';
import {
    buildCheckoutDraftLine,
    formatStripeError,
    intentAlreadyCollected,
    stripeConfirmAlreadyCollected,
} from '../lib/checkout-widget/checkout-draft-line';
import type { CheckoutSubmissionEvent } from '../lib/checkout-widget/checkout-widget.component';

describe('buildCheckoutDraftLine', () => {
    it('sends introspected extension field maps, not a product-type-specific attendee shape', () => {
        const event: CheckoutSubmissionEvent = {
            email: 'jane@example.com',
            quantity: 2,
            attendees: [
                { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
            ],
            extensionData: {
                entityName: 'MJ_BizApps_Orders: Course Order Lines',
                fields: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', cohort: '2027' },
                units: [
                    { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', cohort: '2027' },
                    { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', cohort: '2027' },
                ],
            },
            totalGross: 550,
            sessionKey: 'k',
        };
        const line = buildCheckoutDraftLine('prod-course', event);
        expect(line.ProductID).toBe('prod-course');
        expect(line.Quantity).toBe(2);
        expect(line.Attendees).toBeUndefined();
        expect(line.ExtensionData).toEqual({
            EntityName: 'MJ_BizApps_Orders: Course Order Lines',
            Fields: event.extensionData.fields,
            Units: event.extensionData.units,
        });
        expect(JSON.stringify(line)).not.toContain('DietaryPreferences');
    });

    it('omits ExtensionData when the product type has no companion fields', () => {
        const event: CheckoutSubmissionEvent = {
            email: 'a@b.com',
            quantity: 1,
            attendees: [],
            extensionData: {},
            totalGross: 10,
            sessionKey: 'k',
        };
        const line = buildCheckoutDraftLine('prod-simple', event);
        expect(line.ExtensionData).toBeUndefined();
    });
});

describe('stripe confirm retry helpers', () => {
    it('treats Succeeded as already collected', () => {
        expect(intentAlreadyCollected('Succeeded')).toBe(true);
        expect(intentAlreadyCollected('RequiresPayment')).toBe(false);
        expect(stripeConfirmAlreadyCollected({ code: 'payment_intent_unexpected_state', message: 'A processing error occurred.' })).toBe(true);
        expect(stripeConfirmAlreadyCollected({ code: 'card_declined', message: 'Your card was declined.' })).toBe(false);
        expect(formatStripeError({ message: 'A processing error occurred.', code: 'payment_intent_unexpected_state' })).toContain('payment_intent_unexpected_state');
    });
});
