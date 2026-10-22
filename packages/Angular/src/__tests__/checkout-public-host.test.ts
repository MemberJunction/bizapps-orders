import { describe, expect, it } from 'vitest';
import {
    alreadySubscribedDetail,
    buildCheckoutDraftLine,
    formatStripeError,
    intentAlreadyCollected,
    memberDiscountNotice,
    stripeConfirmAlreadyCollected,
} from '../lib/checkout-widget/checkout-draft-line';
import type { CheckoutSubmissionEvent } from '../lib/checkout-widget/checkout-widget.component';

describe('buildCheckoutDraftLine', () => {
    it('sends introspected extension field maps, not a product-type-specific attendee shape', () => {
        const event: CheckoutSubmissionEvent = {
            email: 'jane@example.com',
            quantity: 2,
            billingAddress: { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
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
            billingAddress: { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
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
    });

    it('shows the buyer the gateway message without its error code', () => {
        expect(formatStripeError({ message: 'Your card has been declined.', code: 'card_declined' })).toBe('Your card has been declined.');
        expect(formatStripeError({ message: 'We are unable to authenticate your payment method.', code: 'payment_intent_authentication_failure' }))
            .not.toContain('payment_intent_authentication_failure');
        expect(formatStripeError({ message: '  ', code: 'card_declined' })).toBe('Payment failed.');
        expect(formatStripeError(null)).toBe('Payment failed.');
    });
});

describe('alreadySubscribedDetail (#323)', () => {
    it('describes an AlreadySubscribed refusal with product ids and source only', () => {
        const detail = alreadySubscribedDetail({
            Success: false,
            ErrorMessage: 'You already have an active subscription to Annual Membership, so it cannot be bought again.',
            Refusal: { Code: 'AlreadySubscribed', Source: 'built-in', ProductIDs: ['prod-1'] },
        });
        expect(detail).toEqual({ productIds: ['prod-1'], source: 'built-in' });
    });

    it('carries no personal data even when the response does', () => {
        const detail = alreadySubscribedDetail({
            Success: false,
            Email: 'jane@example.com',
            Refusal: { Code: 'AlreadySubscribed', Source: 'host', ProductIDs: ['prod-1'], Email: 'jane@example.com' },
        });
        expect(JSON.stringify(detail)).not.toContain('@');
        expect(detail).toEqual({ productIds: ['prod-1'], source: 'host' });
    });

    it('is null for any other refusal or error', () => {
        expect(alreadySubscribedDetail({ Success: false, Refusal: { Code: 'HostRefused', Source: 'host', ProductIDs: [] } })).toBeNull();
        expect(alreadySubscribedDetail({ Success: false, Refusal: { Code: 'Unverified', Source: 'built-in', ProductIDs: [] } })).toBeNull();
        expect(alreadySubscribedDetail({ Success: false, ErrorMessage: 'This checkout does not sell that product' })).toBeNull();
        expect(alreadySubscribedDetail(null)).toBeNull();
    });
});

describe('memberDiscountNotice (#324)', () => {
    it('stops once on a draft whose member token earned no discount', () => {
        const draft = { Success: true, MemberDiscountApplied: false, MemberDiscountMessage: 'Membership has lapsed.' };
        expect(memberDiscountNotice(draft, false)).toBe('Membership has lapsed. Submit again to continue at the standard rate.');
        expect(memberDiscountNotice(draft, true)).toBeNull();
    });

    it('does not promise the standard rate when the buyer\'s own code was priced instead (#358)', () => {
        const draft = { Success: true, MemberDiscountApplied: false, MemberDiscountMessage: 'Your member discount cannot be combined.', AppliedPromotionCodes: ['SAVE10'] };
        expect(memberDiscountNotice(draft, false)).toBe('Your member discount cannot be combined. Submit again to continue.');
    });

    it('carries on when the discount applied or no token was sent', () => {
        expect(memberDiscountNotice({ Success: true, MemberDiscountApplied: true }, false)).toBeNull();
        expect(memberDiscountNotice({ Success: true }, false)).toBeNull();
        expect(memberDiscountNotice(null, false)).toBeNull();
    });
});
