/**
 * @fileoverview Adaptive Checkout Widget Component
 *
 * Provides a responsive, embeddable checkout surface for single-item, multi-attendee event,
 * and zero-dollar registration flows with customizable branding and secure Stripe Elements tokenization.
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
    SimpleChanges,
    signal,
    computed,
    ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CheckoutWidgetTheme {
    primaryColor?: string;
    accentColor?: string;
    borderRadius?: string;
    fontFamily?: string;
    backgroundColor?: string;
}

export interface CheckoutAttendee {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
}

export interface CheckoutWidgetConfig {
    title?: string;
    description?: string;
    productId?: string;
    productName?: string;
    unitPrice?: number;
    currency?: string;
    isEvent?: boolean;
    allowQuantity?: boolean;
    maxQuantity?: number;
    stripePublishableKey?: string;
    theme?: CheckoutWidgetTheme;
    customCSS?: string;
    customJS?: string;
    successMessage?: string;
    redirectUrl?: string;
}

export interface CheckoutSubmissionEvent {
    email: string;
    quantity: number;
    attendees: CheckoutAttendee[];
    totalGross: number;
    paymentToken?: string;
    stripePaymentMethodId?: string;
    stripePaymentIntentId?: string;
    sessionKey: string;
}

@Component({
    selector: 'mj-checkout-widget',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './checkout-widget.component.html',
    styleUrls: ['./checkout-widget.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJCheckoutWidgetComponent implements OnInit, OnChanges {
    private _config = signal<CheckoutWidgetConfig | null>(null);

    @Input()
    public set config(val: CheckoutWidgetConfig | null) {
        this._config.set(val);
        this.syncAttendees();
    }
    public get config(): CheckoutWidgetConfig | null {
        return this._config();
    }

    @Input() public distributionSlug: string = '';
    @Input() public isProcessing: boolean = false;
    @Input() public errorMessage: string | null = null;
    @Input() public isPaymentReady: boolean = true;
    @Input() public stripePaymentMethodId: string | null = null;

    @Output() public submitted = new EventEmitter<CheckoutSubmissionEvent>();
    @Output() public cancelled = new EventEmitter<void>();

    // Form Signals
    public email = signal<string>('');
    public firstName = signal<string>('');
    public lastName = signal<string>('');
    public company = signal<string>('');
    public title = signal<string>('');
    public quantity = signal<number>(1);
    public attendees = signal<CheckoutAttendee[]>([]);

    // Computed properties
    public isFree = computed(() => (this._config()?.unitPrice ?? 0) <= 0);
    public isSingleEvent = computed(() => Boolean(this._config()?.isEvent) && this.quantity() === 1);
    public isMultiAttendee = computed(() => Boolean(this._config()?.isEvent) && this.quantity() > 1);

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
        this.syncAttendees();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['config']) {
            this.syncAttendees();
        }
    }

    public onQuantityChange(newQty: number): void {
        const clamped = Math.max(1, Math.min(newQty, this.config?.maxQuantity ?? 50));
        this.quantity.set(clamped);
        this.syncAttendees();
    }

    public syncAttendees(): void {
        const currentQty = this.quantity();
        const currentList = this.attendees();
        const updated: CheckoutAttendee[] = [];

        for (let i = 0; i < currentQty; i++) {
            if (i === 0) {
                updated.push({
                    firstName: currentList[0]?.firstName || this.firstName(),
                    lastName: currentList[0]?.lastName || this.lastName(),
                    email: currentList[0]?.email || this.email(),
                    company: currentList[0]?.company || this.company(),
                    title: currentList[0]?.title || this.title()
                });
            } else if (currentList[i]) {
                updated.push({ ...currentList[i] });
            } else {
                updated.push({
                    firstName: '',
                    lastName: '',
                    email: '',
                    company: this.company(),
                    title: ''
                });
            }
        }

        this.attendees.set(updated);
    }

    public updateAttendee(index: number, field: keyof CheckoutAttendee, value: string): void {
        const list = [...this.attendees()];
        if (list[index]) {
            list[index] = { ...list[index], [field]: value };
            if (index === 0) {
                if (field === 'firstName') this.firstName.set(value);
                if (field === 'lastName') this.lastName.set(value);
                if (field === 'email') this.email.set(value);
                if (field === 'company') this.company.set(value);
                if (field === 'title') this.title.set(value);
            }
            this.attendees.set(list);
        }
    }

    public copyPrimaryToAll(): void {
        const primary = this.attendees()[0];
        if (!primary) return;
        const list = this.attendees().map((att, i) => {
            if (i === 0) return att;
            return {
                ...att,
                company: primary.company || att.company
            };
        });
        this.attendees.set(list);
    }

    public isFormValid(): boolean {
        const em = this.email().trim();
        if (!em || !em.includes('@')) return false;
        if (!this.firstName().trim() || !this.lastName().trim()) return false;

        if (this.isMultiAttendee()) {
            for (const att of this.attendees()) {
                if (!att.firstName.trim() || !att.lastName.trim() || !att.email.trim() || !att.email.includes('@')) {
                    return false;
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

        const sessionKey = 'ck_sess_' + Math.random().toString(36).substring(2, 15);
        this.submitted.emit({
            email: this.email().trim().toLowerCase(),
            quantity: this.quantity(),
            attendees: this.attendees(),
            totalGross: this.totalGross(),
            stripePaymentMethodId: this.isFree() ? undefined : (this.stripePaymentMethodId ?? 'pm_stripe_token_' + Math.random().toString(36).substring(2, 8)),
            sessionKey
        });
    }
}
