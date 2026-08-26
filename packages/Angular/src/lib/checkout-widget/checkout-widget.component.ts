/**
 * @fileoverview Generic Adaptive Checkout Widget Component
 *
 * Provides a responsive, embeddable checkout surface for single-item, multi-unit
 * extended products, zero-dollar registrations, and custom domain extensions
 * with dynamic metadata-driven field generation, customUI JSON configuration,
 * CSS theming, and custom JS lifecycle hooks.
 *
 * @module @mj-biz-apps/orders-angular/checkout-widget
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ElementRef,
    Renderer2,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
    CustomUIConfiguration,
    CustomUIThemeConfiguration,
    CheckoutWidgetConfiguration
} from '@mj-biz-apps/orders-entities';

export interface CheckoutWidgetTheme extends CustomUIThemeConfiguration {
    primaryColor?: string;
    accentColor?: string;
    borderRadius?: string;
    fontFamily?: string;
    backgroundColor?: string;
    textColor?: string;
}

export interface ExtensionFieldDef {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select';
    required?: boolean;
    placeholder?: string;
    defaultValue?: unknown;
    options?: Array<{ label: string; value: string | number }>;
}

export interface CheckoutAttendee {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    [key: string]: unknown;
}

export interface CheckoutWidgetConfig extends CheckoutWidgetConfiguration {
    title?: string;
    description?: string;
    productId?: string;
    productName?: string;
    unitPrice?: number;
    currency?: string;
    unitMode?: 'perUnit' | 'perLine';
    allowQuantity?: boolean;
    maxQuantity?: number;
    stripePublishableKey?: string;
    theme?: CheckoutWidgetTheme;
    customCSS?: string;
    customJS?: string;
    customUI?: CustomUIConfiguration;
    successMessage?: string;
    redirectUrl?: string;
    extensionEntityName?: string;
    extensionFields?: ExtensionFieldDef[];
    isEvent?: boolean;
}

export interface CheckoutSubmissionEvent {
    email: string;
    quantity: number;
    attendees: CheckoutAttendee[];
    extensionData: {
        entityName?: string;
        fields?: Record<string, unknown>;
        units?: Array<Record<string, unknown>>;
    };
    totalGross: number;
    paymentToken?: string;
    stripePaymentMethodId?: string;
    stripePaymentIntentId?: string;
    sessionKey: string;
}

declare global {
    interface Window {
        MJCheckoutHooks?: Record<string, (arg1?: unknown, arg2?: unknown) => unknown>;
    }
}

@Component({
    selector: 'mj-checkout-widget',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './checkout-widget.component.html',
    styleUrls: ['./checkout-widget.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJCheckoutWidgetComponent implements OnInit, OnChanges, OnDestroy {
    public readonly widgetInstanceId: string = 'mj-cw-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 9));
    private _fallbackSessionKey: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ck_sess_' + Math.random().toString(36).substring(2, 15);
    private _config = signal<CheckoutWidgetConfig | null>(null);
    private _lastMountedJS: string | null = null;
    private _customStyleEl: HTMLStyleElement | null = null;

    constructor(
        private el?: ElementRef,
        private renderer?: Renderer2
    ) {}

    @Input()
    public set config(val: CheckoutWidgetConfig | null) {
        this._config.set(val);
        this.syncUnits();
    }
    public get config(): CheckoutWidgetConfig | null {
        return this._config();
    }

    @Input() public distributionSlug: string = '';
    @Input() public sessionKey: string = '';
    @Input() public isProcessing: boolean = false;
    
    private _errorMessage = signal<string | null>(null);
    @Input()
    public set errorMessage(val: string | null) {
        this._errorMessage.set(val);
    }
    public get errorMessage(): string | null {
        return this._errorMessage();
    }

    @Input() public isPaymentReady: boolean = false;
    @Input() public stripePaymentMethodId: string | null = null;

    /**
     * The host flips this true once POST /checkout/complete succeeds. The widget then swaps to
     * the success view (Configuration.successMessage) and honors Configuration.redirectUrl —
     * the widget stays presentational; the host still owns the network choreography.
     */
    private _completed = signal<boolean>(false);
    @Input()
    public set completed(val: boolean) {
        const was = this._completed();
        this._completed.set(!!val);
        if (!was && val) {
            this.onCompleted();
        }
    }
    public get completed(): boolean {
        return this._completed();
    }

    @Output() public submitted = new EventEmitter<CheckoutSubmissionEvent>();
    @Output() public cancelled = new EventEmitter<void>();

    // Internal error message for client-side validation failures
    public internalErrorMessage = signal<string | null>(null);
    public displayErrorMessage = computed<string | null>(() => this._errorMessage() || this.internalErrorMessage());

    // Form state signals
    public email = signal<string>('');
    public firstName = signal<string>('');
    public lastName = signal<string>('');
    public company = signal<string>('');
    public title = signal<string>('');
    public quantity = signal<number>(1);

    // Generic units array holding field maps for each unit
    public units = signal<Array<Record<string, unknown>>>([]);

    // Backward-compatibility signal for legacy attendees
    public attendees = computed<CheckoutAttendee[]>(() => {
        return this.units().map(u => ({
            firstName: String(u['firstName'] || u['FirstName'] || ''),
            lastName: String(u['lastName'] || u['LastName'] || ''),
            email: String(u['email'] || u['Email'] || ''),
            company: u['company'] ? String(u['company']) : (u['Company'] ? String(u['Company']) : undefined),
            title: u['title'] ? String(u['title']) : (u['Title'] ? String(u['Title']) : undefined),
            ...u
        }));
    });

    // Unified customUI computed values
    public activeCSS = computed<string>(() => {
        const cfg = this._config();
        return cfg?.customUI?.css || cfg?.customCSS || '';
    });

    public activeJS = computed<string>(() => {
        const cfg = this._config();
        return cfg?.customUI?.js || cfg?.customJS || '';
    });

    public activeTheme = computed<CustomUIThemeConfiguration | null>(() => {
        const cfg = this._config();
        return cfg?.customUI?.theme || cfg?.theme || null;
    });

    public activeComponentOverrideKey = computed<string | null>(() => {
        const cfg = this._config();
        return cfg?.customUI?.componentOverrideKey || null;
    });

    // Active field definitions
    public activeFieldDefs = computed<ExtensionFieldDef[]>(() => {
        const customFields = this._config()?.extensionFields;
        if (customFields && Array.isArray(customFields) && customFields.length > 0) {
            return customFields;
        }
        // Default standard attendee fields
        return [
            { name: 'firstName', label: 'First Name', type: 'text', required: true, placeholder: 'Jane' },
            { name: 'lastName', label: 'Last Name', type: 'text', required: true, placeholder: 'Doe' },
            { name: 'email', label: 'Email Address', type: 'text', required: true, placeholder: 'jane.doe@example.com' },
            { name: 'company', label: 'Company / Organization', type: 'text', required: false, placeholder: 'Acme Corp' },
            { name: 'title', label: 'Job Title', type: 'text', required: false, placeholder: 'Director' }
        ];
    });

    // Computed properties
    public isFree = computed(() => (this._config()?.unitPrice ?? 0) <= 0);
    public isPerUnit = computed(() => {
        const cfg = this._config();
        return cfg?.unitMode === 'perUnit' || Boolean(cfg?.isEvent);
    });
    public isSingleUnit = computed(() => !this.isPerUnit() || this.quantity() === 1);
    public isMultiUnit = computed(() => this.isPerUnit() && this.quantity() > 1);

    public subtotal = computed(() => {
        const price = this._config()?.unitPrice ?? 0;
        return price * this.quantity();
    });

    public totalGross = computed(() => this.subtotal());

    public currencySymbol = computed(() => {
        const c = this._config()?.currency?.toUpperCase() ?? 'USD';
        switch (c) {
            case 'EUR': return '€';
            case 'GBP': return '£';
            default: return '$';
        }
    });

    public ngOnInit(): void {
        this.syncUnits();
        this.applyCustomCSS(this.activeCSS());
        if (this.activeJS() && this.activeJS() !== this._lastMountedJS) {
            this.mountCustomJS(this.activeJS());
        }
        this.executeLifecycleHook('onInit', {
            config: this.config,
            distributionSlug: this.distributionSlug
        });
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['config']) {
            this.syncUnits();
            this.applyCustomCSS(this.activeCSS());
            if (this.activeJS() && this.activeJS() !== this._lastMountedJS) {
                this.mountCustomJS(this.activeJS());
            }
        }
    }

    public ngOnDestroy(): void {
        this.executeLifecycleHook('onDestroy', { component: this });
        if (this._customStyleEl && this._customStyleEl.parentNode) {
            this._customStyleEl.parentNode.removeChild(this._customStyleEl);
            this._customStyleEl = null;
        }
    }

    private applyCustomCSS(cssContent: string): void {
        if (typeof document === 'undefined') return;

        if (!cssContent) {
            if (this._customStyleEl && this._customStyleEl.parentNode) {
                this._customStyleEl.parentNode.removeChild(this._customStyleEl);
                this._customStyleEl = null;
            }
            return;
        }

        const styleId = `mj-checkout-custom-css-${this.widgetInstanceId}`;
        if (!this._customStyleEl) {
            if (this.renderer && this.el) {
                this._customStyleEl = this.renderer.createElement('style');
                this.renderer.setAttribute(this._customStyleEl, 'type', 'text/css');
                this.renderer.setAttribute(this._customStyleEl, 'id', styleId);
                this.renderer.appendChild(this.el.nativeElement, this._customStyleEl);
            } else {
                this._customStyleEl = document.createElement('style');
                this._customStyleEl.type = 'text/css';
                this._customStyleEl.id = styleId;
                document.head.appendChild(this._customStyleEl);
            }
        }

        if (this._customStyleEl) {
            this._customStyleEl.textContent = cssContent;
        }
    }

    private mountCustomJS(scriptContent: string): void {
        if (!scriptContent || typeof window === 'undefined') return;
        this._lastMountedJS = scriptContent;
        try {
            const runner = new Function('widgetContext', scriptContent);
            runner({ component: this, config: this.config });
        } catch (err) {
            console.warn('[MJCheckoutWidget] CustomJS evaluation notice:', err);
            this.internalErrorMessage.set('Notice: Custom widget scripts could not be evaluated under current security policy.');
        }
    }

    public executeLifecycleHook(hookName: string, payload?: unknown): unknown {
        if (typeof window === 'undefined') return undefined;
        try {
            if (window.MJCheckoutHooks && typeof window.MJCheckoutHooks[hookName] === 'function') {
                return window.MJCheckoutHooks[hookName](payload, { component: this, config: this.config });
            }
        } catch (err) {
            console.warn(`[MJCheckoutWidget] Hook error in ${hookName}:`, err);
            if (hookName === 'onValidate') {
                // Fail closed on validation errors
                return 'Validation hook encountered an internal error.';
            }
        }
        return undefined;
    }

    /**
     * The UI-side quantity ceiling. The fallback matches the server's
     * DEFAULT_MAX_QUANTITY_PER_LINE (100) — the server remains the authority; a mismatched UI
     * clamp (this was 50) just refuses quantities the server would have accepted.
     */
    public effectiveMaxQuantity = computed<number>(() => this._config()?.maxQuantity ?? 100);

    /** The success text shown once the host reports completion. */
    public successText = computed<string>(() =>
        this._config()?.successMessage || 'Thank you — your order is confirmed. A receipt is on its way to your email.');

    private onCompleted(): void {
        const url = this.config?.redirectUrl;
        if (url && typeof url === 'string' && typeof window !== 'undefined') {
            // With a success message, let the buyer read it before leaving; without one,
            // redirect immediately — a blank success screen helps nobody.
            const delayMs = this.config?.successMessage ? 1500 : 0;
            window.setTimeout(() => window.location.assign(url), delayMs);
        }
    }

    public onQuantityChange(newQty: number): void {
        const clamped = Math.max(1, Math.min(newQty, this.effectiveMaxQuantity()));
        this.quantity.set(clamped);
        this.syncUnits();
        this.executeLifecycleHook('onQuantityChange', { quantity: clamped });
    }

    public syncUnits(): void {
        const currentQty = this.quantity();
        const currentUnits = this.units();
        const updated: Array<Record<string, unknown>> = [];
        const fields = this.activeFieldDefs();

        for (let i = 0; i < currentQty; i++) {
            if (i === 0) {
                const primary = currentUnits[0] || {};
                const unit0: Record<string, unknown> = { ...primary };
                for (const field of fields) {
                    if (unit0[field.name] === undefined) {
                        unit0[field.name] = field.defaultValue ?? '';
                    }
                }
                if (this.firstName()) unit0['firstName'] = this.firstName();
                if (this.lastName()) unit0['lastName'] = this.lastName();
                if (this.email()) unit0['email'] = this.email();
                if (this.company()) unit0['company'] = this.company();
                if (this.title()) unit0['title'] = this.title();
                updated.push(unit0);
            } else if (currentUnits[i]) {
                updated.push({ ...currentUnits[i] });
            } else {
                const initial: Record<string, unknown> = {};
                for (const field of fields) {
                    initial[field.name] = field.defaultValue ?? '';
                }
                if (this.company()) {
                    initial['company'] = this.company();
                }
                updated.push(initial);
            }
        }

        this.units.set(updated);
    }

    public updateUnitField(index: number, fieldName: string, value: unknown): void {
        const list = [...this.units()];
        if (list[index]) {
            list[index] = { ...list[index], [fieldName]: value };
            if (index === 0) {
                if (fieldName === 'firstName') this.firstName.set(String(value ?? ''));
                if (fieldName === 'lastName') this.lastName.set(String(value ?? ''));
                if (fieldName === 'email') this.email.set(String(value ?? ''));
                if (fieldName === 'company') this.company.set(String(value ?? ''));
                if (fieldName === 'title') this.title.set(String(value ?? ''));
            }
            this.units.set(list);
        }
    }

    public updateAttendee(index: number, field: keyof CheckoutAttendee, value: string): void {
        this.updateUnitField(index, field as string, value);
    }

    public copyPrimaryToAll(): void {
        const primary = this.units()[0];
        if (!primary) return;
        const list = this.units().map((unit, i) => {
            if (i === 0) return unit;
            const copied: Record<string, unknown> = { ...unit };
            for (const [key, val] of Object.entries(primary)) {
                if (key !== 'firstName' && key !== 'lastName' && key !== 'email' && key !== 'FirstName' && key !== 'LastName' && key !== 'Email') {
                    copied[key] = val;
                }
            }
            return copied;
        });
        this.units.set(list);
    }

    public isFormValid(): boolean {
        const currentUnits = this.units();
        const fields = this.activeFieldDefs();

        if (!currentUnits || currentUnits.length === 0) {
            const em = this.email().trim();
            const fn = this.firstName().trim();
            const ln = this.lastName().trim();
            if (!em || !em.includes('@') || !fn || !ln) return false;
            if (!this.isFree() && !this.isPaymentReady) return false;
            return true;
        }

        const unitsToValidate = this.isPerUnit() ? currentUnits : currentUnits.slice(0, 1);
        for (let i = 0; i < unitsToValidate.length; i++) {
            const unit = unitsToValidate[i];
            for (const field of fields) {
                let val = unit[field.name];
                if (i === 0) {
                    if (field.name === 'firstName' && this.firstName()) val = this.firstName();
                    if (field.name === 'lastName' && this.lastName()) val = this.lastName();
                    if (field.name === 'email' && this.email()) val = this.email();
                    if (field.name === 'company' && this.company()) val = this.company();
                    if (field.name === 'title' && this.title()) val = this.title();
                }
                if (field.required) {
                    if (val === undefined || val === null || String(val).trim() === '') {
                        return false;
                    }
                }
                if (field.name.toLowerCase().includes('email')) {
                    const emVal = String(val || '').trim();
                    if (field.required && (!emVal || !emVal.includes('@'))) {
                        return false;
                    }
                    if (emVal && !emVal.includes('@')) {
                        return false;
                    }
                }
            }
        }

        if (!this.isFree() && !this.isPaymentReady) {
            return false;
        }

        return true;
    }

    public handleSubmit(): void {
        if (!this.isFormValid() || this.isProcessing) return;
        this.internalErrorMessage.set(null);

        const currentUnits = this.units();
        const isPerUnit = this.isPerUnit();
        const finalSessionKey = this.sessionKey || this._fallbackSessionKey;

        const submission: CheckoutSubmissionEvent = {
            email: String(currentUnits[0]?.['email'] || this.email()).trim().toLowerCase(),
            quantity: this.quantity(),
            attendees: isPerUnit ? this.attendees() : [],
            extensionData: {
                entityName: this.config?.extensionEntityName,
                fields: currentUnits[0] || {},
                units: isPerUnit ? currentUnits : undefined
            },
            totalGross: this.totalGross(),
            stripePaymentMethodId: this.isFree() ? undefined : (this.stripePaymentMethodId ?? undefined),
            sessionKey: finalSessionKey
        };

        // Execute custom validation hook if present (fails closed)
        try {
            const customValidationResult = this.executeLifecycleHook('onValidate', submission);
            if (customValidationResult === false || typeof customValidationResult === 'string') {
                this.internalErrorMessage.set(typeof customValidationResult === 'string' ? customValidationResult : 'Submission validation rejected.');
                return;
            }
        } catch (hookErr) {
            this.internalErrorMessage.set('Validation failed: ' + (hookErr instanceof Error ? hookErr.message : String(hookErr)));
            return;
        }

        // Execute pre-submit enrichment hook
        this.executeLifecycleHook('onBeforeSubmit', submission);

        this.submitted.emit(submission);
    }
}
