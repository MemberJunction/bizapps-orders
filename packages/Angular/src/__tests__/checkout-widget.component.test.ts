/**
 * Unit tests for MJCheckoutWidgetComponent
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJCheckoutWidgetComponent, type CheckoutWidgetConfig } from '../lib/checkout-widget/checkout-widget.component';

// Setup window polyfill for Node.js test runner
if (typeof globalThis.window === 'undefined') {
    (globalThis as unknown as { window: Record<string, unknown> }).window = globalThis as unknown as Record<string, unknown>;
}

describe('MJCheckoutWidgetComponent', () => {
    let component: MJCheckoutWidgetComponent;

    beforeEach(() => {
        component = new MJCheckoutWidgetComponent();
        if (typeof window !== 'undefined') {
            delete window.MJCheckoutHooks;
        }
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

        it('detects single event vs multi-unit registration mode', () => {
            component.config = { isEvent: true, unitPrice: 50 } as CheckoutWidgetConfig;
            component.quantity.set(1);
            expect(component.isSingleUnit()).toBe(true);
            expect(component.isMultiUnit()).toBe(false);

            component.quantity.set(3);
            expect(component.isSingleUnit()).toBe(false);
            expect(component.isMultiUnit()).toBe(true);
        });
    });

    describe('customUI configuration and theming', () => {
        it('prefers customUI.css and customUI.js over legacy top-level properties', () => {
            component.config = {
                unitPrice: 25,
                customCSS: '.legacy { color: blue; }',
                customJS: 'console.log("legacy");',
                theme: { primaryColor: '#000000' },
                customUI: {
                    css: '.modern { color: red; }',
                    js: 'console.log("modern");',
                    theme: { primaryColor: '#ff0000' },
                    componentOverrideKey: 'CustomDonationSlider'
                }
            } as CheckoutWidgetConfig;

            expect(component.activeCSS()).toBe('.modern { color: red; }');
            expect(component.activeJS()).toBe('console.log("modern");');
            expect(component.activeTheme()?.primaryColor).toBe('#ff0000');
            expect(component.activeComponentOverrideKey()).toBe('CustomDonationSlider');
        });

        it('falls back to top-level customCSS and customJS when customUI is omitted', () => {
            component.config = {
                unitPrice: 25,
                customCSS: '.legacy { color: blue; }',
                customJS: 'console.log("legacy");',
                theme: { primaryColor: '#000000' }
            } as CheckoutWidgetConfig;

            expect(component.activeCSS()).toBe('.legacy { color: blue; }');
            expect(component.activeJS()).toBe('console.log("legacy");');
            expect(component.activeTheme()?.primaryColor).toBe('#000000');
            expect(component.activeComponentOverrideKey()).toBeNull();
        });
    });

    describe('dynamic extension fields and unit synchronization', () => {
        it('uses default attendee fields when no custom fields provided', () => {
            component.config = { unitPrice: 50 } as CheckoutWidgetConfig;
            const defs = component.activeFieldDefs();
            expect(defs.map(d => d.name)).toContain('firstName');
            expect(defs.map(d => d.name)).toContain('email');
        });

        it('supports custom dynamic extension fields', () => {
            component.config = {
                unitPrice: 50,
                extensionFields: [
                    { name: 'studentId', label: 'Student ID', type: 'text', required: true },
                    { name: 'cohort', label: 'Cohort Year', type: 'number', required: false },
                    { name: 'track', label: 'Specialization Track', type: 'select', options: [{ label: 'AI', value: 'ai' }] }
                ]
            } as CheckoutWidgetConfig;

            const defs = component.activeFieldDefs();
            expect(defs).toHaveLength(3);
            expect(defs[0].name).toBe('studentId');
            expect(defs[2].type).toBe('select');
        });

        it('syncs units array length when quantity increases', () => {
            component.config = { isEvent: true } as CheckoutWidgetConfig;
            component.firstName.set('Jane');
            component.lastName.set('Doe');
            component.email.set('jane@example.com');
            component.company.set('Acme');

            component.onQuantityChange(3);

            expect(component.units()).toHaveLength(3);
            expect(component.units()[0]['firstName']).toBe('Jane');
            expect(component.units()[0]['email']).toBe('jane@example.com');
            expect(component.units()[1]['company']).toBe('Acme');
        });

        it('copies primary company to all units', () => {
            component.config = { isEvent: true } as CheckoutWidgetConfig;
            component.onQuantityChange(2);
            component.updateUnitField(0, 'company', 'Global Enterprises');

            component.copyPrimaryToAll();

            expect(component.units()[0]['company']).toBe('Global Enterprises');
            expect(component.units()[1]['company']).toBe('Global Enterprises');
        });
    });

    describe('custom JS lifecycle hooks and validation', () => {
        it('executes onValidate hook and blocks submission if hook returns false or error message', () => {
            window.MJCheckoutHooks = {
                onValidate: vi.fn().mockReturnValue('Domain @competitor.com is not allowed.')
            };

            component.config = { unitPrice: 0 } as CheckoutWidgetConfig;
            component.email.set('test@competitor.com');
            component.firstName.set('John');
            component.lastName.set('Doe');
            component.syncUnits();

            const emitSpy = vi.spyOn(component.submitted, 'emit');
            component.handleSubmit();

            expect(emitSpy).not.toHaveBeenCalled();
            expect(component.displayErrorMessage()).toBe('Domain @competitor.com is not allowed.');
        });

        it('executes onBeforeSubmit hook to enrich payload before emission', () => {
            window.MJCheckoutHooks = {
                onBeforeSubmit: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
                    payload['enrichedTracking'] = 'campaign-abc';
                })
            };

            component.config = { unitPrice: 0 } as CheckoutWidgetConfig;
            component.email.set('jane@example.com');
            component.firstName.set('Jane');
            component.lastName.set('Doe');
            component.syncUnits();

            const emitSpy = vi.spyOn(component.submitted, 'emit');
            component.handleSubmit();

            expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
                email: 'jane@example.com',
                enrichedTracking: 'campaign-abc'
            }));
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

        it('mounts custom JS exactly once during component initialization and ngOnChanges cycle', () => {
            let evalCount = 0;
            // Define global counter incremented by script execution
            (window as unknown as { __testScriptRunCount: number }).__testScriptRunCount = 0;
            
            const script = `window.__testScriptRunCount = (window.__testScriptRunCount || 0) + 1;`;
            component.config = { customJS: script } as CheckoutWidgetConfig;
            component.ngOnChanges({
                config: {
                    currentValue: component.config,
                    previousValue: null,
                    firstChange: true,
                    isFirstChange: () => true
                }
            });
            component.ngOnInit();

            expect((window as unknown as { __testScriptRunCount: number }).__testScriptRunCount).toBe(1);
        });

        it('caches generated fallback sessionKey across multiple submit retries', () => {
            component.config = { unitPrice: 0 } as CheckoutWidgetConfig;
            component.email.set('jane@example.com');
            component.firstName.set('Jane');
            component.lastName.set('Doe');

            const emitSpy = vi.spyOn(component.submitted, 'emit');
            
            component.handleSubmit();
            const firstSessionKey = emitSpy.mock.calls[0][0].sessionKey;
            expect(firstSessionKey).toBeDefined();

            component.handleSubmit();
            const secondSessionKey = emitSpy.mock.calls[1][0].sessionKey;
            expect(secondSessionKey).toBe(firstSessionKey);
        });

        it('generates a unique per-instance widgetInstanceId', () => {
            const comp1 = new MJCheckoutWidgetComponent();
            const comp2 = new MJCheckoutWidgetComponent();
            expect(comp1.widgetInstanceId).toBeDefined();
            expect(comp2.widgetInstanceId).toBeDefined();
            expect(comp1.widgetInstanceId).not.toBe(comp2.widgetInstanceId);
        });
    });

    describe('quantity ceiling', () => {
        it('clamps to config.maxQuantity when configured, and to the server-matching 100 default when not', () => {
            component.config = { unitPrice: 10, maxQuantity: 5 } as CheckoutWidgetConfig;
            component.onQuantityChange(9);
            expect(component.quantity()).toBe(5);

            // Fallback matches the server's DEFAULT_MAX_QUANTITY_PER_LINE (100), not the old 50
            component.config = { unitPrice: 10 } as CheckoutWidgetConfig;
            component.onQuantityChange(75);
            expect(component.quantity()).toBe(75);
            component.onQuantityChange(150);
            expect(component.quantity()).toBe(100);
        });
    });

    describe('completion (successMessage / redirectUrl consumption)', () => {
        it('exposes the configured successMessage once the host reports completion', () => {
            component.config = { unitPrice: 10, successMessage: 'See you at the summit!' } as CheckoutWidgetConfig;
            expect(component.completed).toBe(false);
            component.completed = true;
            expect(component.completed).toBe(true);
            expect(component.successText()).toBe('See you at the summit!');
        });

        it('falls back to a default success message when none is configured', () => {
            component.config = { unitPrice: 10 } as CheckoutWidgetConfig;
            component.completed = true;
            expect(component.successText()).toContain('confirmed');
        });

        it('schedules a redirect to config.redirectUrl on completion, delayed when a message shows', () => {
            const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((() => 0) as unknown as typeof window.setTimeout);
            component.config = {
                unitPrice: 10,
                successMessage: 'Thanks!',
                redirectUrl: 'https://example.com/welcome'
            } as CheckoutWidgetConfig;

            component.completed = true;
            expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
            expect(setTimeoutSpy.mock.calls[0][1]).toBe(1500);

            // Flipping true again does not re-schedule
            component.completed = true;
            expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
            setTimeoutSpy.mockRestore();
        });

        it('does not redirect when no redirectUrl is configured', () => {
            const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((() => 0) as unknown as typeof window.setTimeout);
            component.config = { unitPrice: 10, successMessage: 'Thanks!' } as CheckoutWidgetConfig;
            component.completed = true;
            expect(setTimeoutSpy).not.toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });
    });
});
