/**
 * Public host for `<mj-checkout-widget>`: loads widget Configuration from the
 * anonymous checkout edge, mounts Stripe when the SKU is paid, and drives
 * initialize → draft → payment-intent → complete.
 *
 * Registered as the Angular Element `<mj-orders-checkout>` for GET /checkout/:slug
 * (and usable as a normal Angular component in Explorer or any host app).
 */
import {
    AfterViewChecked,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnDestroy,
    OnInit,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    MJCheckoutWidgetComponent,
    type CheckoutSubmissionEvent,
    type CheckoutWidgetConfig,
} from './checkout-widget.component';
import {
    buildCheckoutDraftLine,
    formatStripeError,
    intentAlreadyCollected,
    stripeConfirmAlreadyCollected,
} from './checkout-draft-line';

export { buildCheckoutDraftLine } from './checkout-draft-line';

interface StripeCard {
    mount(target: string | HTMLElement): void;
    on(event: string, handler: (ev: { complete?: boolean }) => void): void;
    unmount?(): void;
}

interface StripeInstance {
    elements(): { create(type: string): StripeCard };
    confirmCardPayment(
        clientSecret: string,
        opts: { payment_method: { card: StripeCard; billing_details?: { email?: string } } }
    ): Promise<{ error?: { message?: string }; paymentIntent?: { status?: string } }>;
}

declare global {
    interface Window {
        Stripe?: (publishableKey: string) => StripeInstance;
    }
}

@Component({
    selector: 'mj-orders-checkout',
    standalone: true,
    imports: [CommonModule, MJCheckoutWidgetComponent],
    templateUrl: './checkout-public-host.component.html',
    styleUrls: ['./checkout-public-host.component.css'],
})
export class CheckoutPublicHostComponent implements OnInit, AfterViewChecked, OnDestroy {
    private readonly hostEl = inject(ElementRef, { optional: true });
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public slug = '';
    @Input() public apiRoot = '/checkout';

    public config: CheckoutWidgetConfig | null = null;
    public sessionKey = '';
    public sessionId = '';
    public processing = false;
    public isPaymentReady = false;
    public stripePaymentMethodId: string | null = null;
    public errorMessage: string | null = null;
    public loadError: string | null = null;
    public successMessage: string | null = null;
    public orderNumber: string | null = null;

    private stripe: StripeInstance | null = null;
    private card: StripeCard | null = null;
    private cardMounted = false;
    private destroyed = false;

    public get isFree(): boolean {
        return (this.config?.unitPrice ?? 0) <= 0;
    }

    public async ngOnInit(): Promise<void> {
        this.readHostAttributes();
        if (!this.slug) {
            this.loadError = 'This checkout link is missing its reference.';
            return;
        }
        this.sessionKey = this.clientKey();
        if (!this.sessionKey) {
            this.loadError = 'Checkout requires a secure random source. Open this page over HTTPS.';
            return;
        }
        try {
            const init = await this.post('/initialize', {
                slug: this.slug,
                clientSessionKey: this.sessionKey,
            });
            if (!init?.Success) {
                this.loadError = this.str(init?.ErrorMessage, 'This checkout is not available.');
                return;
            }
            this.sessionId = this.str(init.SessionID);
            const cfg = (init.Configuration || {}) as CheckoutWidgetConfig;
            if (typeof init.CustomCSS === 'string' && init.CustomCSS && !cfg.customUI?.css) {
                cfg.customUI = { ...(cfg.customUI || {}), css: init.CustomCSS };
            }
            if (typeof init.CustomJS === 'string' && init.CustomJS && !cfg.customUI?.js) {
                cfg.customUI = { ...(cfg.customUI || {}), js: init.CustomJS };
            }
            if (!cfg.productId) {
                this.loadError = 'This checkout is not configured with a product.';
                return;
            }
            this.config = cfg;
        } catch {
            this.loadError = 'Checkout is temporarily unavailable. Please try again.';
        } finally {
            this.cdr.detectChanges();
        }
    }

    public ngAfterViewChecked(): void {
        if (this.destroyed || this.cardMounted || !this.config) {
            return;
        }
        if (!this.config.stripePublishableKey) {
            this.isPaymentReady = true;
            return;
        }
        const mount = document.getElementById('stripe-card-element');
        if (mount) {
            void this.mountStripe(mount);
        }
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
        try {
            this.card?.unmount?.();
        } catch {
            /* already gone */
        }
    }

    public onCancelled(): void {
        this.errorMessage = null;
    }

    public async onSubmitted(event: CheckoutSubmissionEvent): Promise<void> {
        if (this.processing || !this.config?.productId) {
            return;
        }
        this.processing = true;
        this.errorMessage = null;
        try {
            const line = buildCheckoutDraftLine(this.config.productId, event);
            const draft = await this.post('/draft', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
                email: event.email,
                lines: [line],
            });
            if (!draft?.Success) {
                throw new Error(this.str(draft?.ErrorMessage, 'Could not price this checkout.'));
            }
            if (!draft.RequiresPayment) {
                await this.finish();
                return;
            }
            const intent = await this.post('/payment-intent', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
            });
            if (!intent?.Success) {
                throw new Error(this.str(intent?.ErrorMessage, 'Could not start payment.'));
            }
            if (intentAlreadyCollected(intent.Status)) {
                await this.finish();
                return;
            }
            if (!intent.ClientSecret) {
                throw new Error(this.str(intent?.ErrorMessage, 'Could not start payment.'));
            }
            if (!this.stripe || !this.card) {
                throw new Error('Card entry is not ready.');
            }
            const result = await this.stripe.confirmCardPayment(String(intent.ClientSecret), {
                payment_method: {
                    card: this.card,
                    billing_details: { email: event.email },
                },
            });
            if (result.error) {
                console.warn('[mj-orders-checkout] Stripe confirmCardPayment', result.error);
                if (!stripeConfirmAlreadyCollected(result.error)) {
                    throw new Error(formatStripeError(result.error));
                }
            } else {
                const stripeStatus = (result.paymentIntent?.status || '').toLowerCase();
                if (stripeStatus && stripeStatus !== 'succeeded' && stripeStatus !== 'processing') {
                    throw new Error(`Payment was not confirmed (Stripe status: ${result.paymentIntent?.status}).`);
                }
            }
            await this.finish();
        } catch (err) {
            this.errorMessage = err instanceof Error ? err.message : 'Checkout failed.';
        } finally {
            this.processing = false;
            this.cdr.detectChanges();
        }
    }

    private async finish(): Promise<void> {
        const done = await this.post('/complete', {
            sessionId: this.sessionId,
            clientSessionKey: this.sessionKey,
        });
        if (!done?.Success) {
            throw new Error(this.str(done?.ErrorMessage, 'Could not complete checkout.'));
        }
        this.orderNumber = done.OrderNumber ? String(done.OrderNumber) : null;
        this.successMessage =
            this.config?.successMessage ||
            (this.orderNumber ? `Thank you. Order ${this.orderNumber} is confirmed.` : 'Thank you. Your order is confirmed.');
        if (this.config?.redirectUrl) {
            window.location.href = this.config.redirectUrl;
        }
        this.cdr.detectChanges();
    }

    private async mountStripe(mount: HTMLElement): Promise<void> {
        const pk = this.config?.stripePublishableKey;
        if (!pk) {
            this.isPaymentReady = true;
            return;
        }
        this.cardMounted = true;
        try {
            this.stripe = await this.loadStripe(pk);
            this.card = this.stripe.elements().create('card');
            this.card.mount(mount);
            this.card.on('change', (ev) => {
                this.isPaymentReady = !!ev.complete;
            });
        } catch (err) {
            this.cardMounted = false;
            this.errorMessage = err instanceof Error ? err.message : 'Could not load card entry.';
        }
    }

    private loadStripe(pk: string): Promise<StripeInstance> {
        if (this.stripe) {
            return Promise.resolve(this.stripe);
        }
        return new Promise((resolve, reject) => {
            const inst = () => {
                if (!window.Stripe) {
                    reject(new Error('Stripe.js did not load'));
                    return;
                }
                resolve(window.Stripe(pk));
            };
            if (window.Stripe) {
                inst();
                return;
            }
            const s = document.createElement('script');
            s.src = 'https://js.stripe.com/v3/';
            s.onload = () => inst();
            s.onerror = () => reject(new Error('Could not load Stripe.js'));
            document.head.appendChild(s);
        });
    }

    private readHostAttributes(): void {
        const el = this.hostEl?.nativeElement as HTMLElement | undefined;
        if (!el) {
            return;
        }
        const slug = el.getAttribute('slug') || el.getAttribute('data-slug');
        if (slug) {
            this.slug = slug;
        }
        const apiRoot = el.getAttribute('api-root') || el.getAttribute('data-api-root');
        if (apiRoot) {
            this.apiRoot = apiRoot.replace(/\/+$/, '');
        }
    }

    private clientKey(): string {
        const storageKey = `mj-checkout-key:${this.slug}`;
        try {
            const existing = sessionStorage.getItem(storageKey);
            if (existing) {
                return existing;
            }
        } catch {
            /* private mode */
        }
        let key = '';
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            key = crypto.randomUUID();
        } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const b = new Uint8Array(16);
            crypto.getRandomValues(b);
            b[6] = (b[6] & 0x0f) | 0x40;
            b[8] = (b[8] & 0x3f) | 0x80;
            const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0'));
            key = `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
        }
        if (key) {
            try {
                sessionStorage.setItem(storageKey, key);
            } catch {
                /* ignore */
            }
        }
        return key;
    }

    private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
        const res = await fetch(`${this.apiRoot}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
        });
        const json = (await res.json()) as Record<string, unknown>;
        json._httpStatus = res.status;
        return json;
    }

    private str(value: unknown, fallback = ''): string {
        return typeof value === 'string' && value ? value : fallback;
    }
}
