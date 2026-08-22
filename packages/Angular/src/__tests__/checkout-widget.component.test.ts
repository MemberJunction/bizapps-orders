/**
 * Unit tests for MJCheckoutWidgetComponent
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJCheckoutWidgetComponent, type CheckoutWidgetConfig } from '../lib/checkout-widget/checkout-widget.component';

describe('MJCheckoutWidgetComponent', () => {
    let component: MJCheckoutWidgetComponent;

    beforeEach(() => {
        component = new MJCheckoutWidgetComponent();
    });

    describe('computed properties', () => {
        it('detects free SKU when unitPrice is 0 or negative', () => {
            component.config = { unitPrice: 0 } as CheckoutWidgetConfig;
            expect(component.isFree()).toBe(true);

            component.config = { unitPrice: 49.99 } as CheckoutWidgetConfig;
            expect(component.isFree()).toBe(false);
        });

        it('computes subtotal and total gross based on quantity', () => {
            component.config = { unitPrice: 100 } as CheckoutWidgetConfig;
            component.quantity.set(3);
            expect(component.subtotal()).toBe(300);
            expect(component.totalGross()).toBe(300);
        });

        it('detects single event vs multi-attendee registration mode', () => {
            component.config = { isEvent: true, unitPrice: 50 } as CheckoutWidgetConfig;
            component.quantity.set(1);
            expect(component.isSingleEvent()).toBe(true);
            expect(component.isMultiAttendee()).toBe(false);

            component.quantity.set(3);
            expect(component.isSingleEvent()).toBe(false);
            expect(component.isMultiAttendee()).toBe(true);
        });
    });

    describe('attendee synchronization', () => {
        it('syncs attendees array length when quantity increases', () => {
            component.config = { isEvent: true } as CheckoutWidgetConfig;
            component.firstName.set('Jane');
            component.lastName.set('Doe');
            component.email.set('jane@example.com');
            component.company.set('Acme');

            component.onQuantityChange(3);

            expect(component.attendees()).toHaveLength(3);
            expect(component.attendees()[0].firstName).toBe('Jane');
            expect(component.attendees()[0].email).toBe('jane@example.com');
            expect(component.attendees()[1].company).toBe('Acme');
        });

        it('copies primary company to all attendees', () => {
            component.config = { isEvent: true } as CheckoutWidgetConfig;
            component.onQuantityChange(2);
            component.updateAttendee(0, 'company', 'Global Enterprises');

            component.copyPrimaryToAll();

            expect(component.attendees()[0].company).toBe('Global Enterprises');
            expect(component.attendees()[1].company).toBe('Global Enterprises');
        });
    });

    describe('form validation and submission', () => {
        it('validates free registration without requiring card details', () => {
            component.config = { unitPrice: 0, isEvent: false } as CheckoutWidgetConfig;
            component.email.set('jane@example.com');
            component.firstName.set('Jane');
            component.lastName.set('Doe');

            expect(component.isFormValid()).toBe(true);
        });

        it('requires payment readiness when total is greater than 0', () => {
            component.config = { unitPrice: 100, isEvent: false } as CheckoutWidgetConfig;
            component.email.set('jane@example.com');
            component.firstName.set('Jane');
            component.lastName.set('Doe');
            component.isPaymentReady = false;

            expect(component.isFormValid()).toBe(false);

            component.isPaymentReady = true;

            expect(component.isFormValid()).toBe(true);
        });

        it('emits submitted event with normalized payload', () => {
            component.config = { unitPrice: 0 } as CheckoutWidgetConfig;
            component.email.set(' Jane.Doe@Example.com ');
            component.firstName.set('Jane');
            component.lastName.set('Doe');
            component.syncAttendees();

            const emitSpy = vi.spyOn(component.submitted, 'emit');
            component.handleSubmit();

            expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
                email: 'jane.doe@example.com',
                quantity: 1,
                totalGross: 0
            }));
        });
    });
});
