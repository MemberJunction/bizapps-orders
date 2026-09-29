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
    BuildCheckoutCompleteDetail,
    CHECKOUT_CANCEL_EVENT,
    CHECKOUT_CLOSE_EVENT,
    CHECKOUT_RESET_REFUSED_EVENT,
    CHECKOUT_RESET_REQUEST_EVENT,
    CHECKOUT_COMPLETE_EVENT,
    CHECKOUT_ERROR_EVENT,
    CHECKOUT_STATE_CHANGE_EVENT,
    CheckoutElementEvent,
    type CheckoutElementState,
} from './checkout-events';
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
    destroy?(): void;
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
    private state: CheckoutElementState | null = null;
    /** Bumped by Cancel: the template re-creates the widget, which clears everything the buyer entered. */
    public formGeneration = 0;

    /** From the element's attributes, for a host that embeds the checkout in its own panel. */
    public prefillEmail: string | null = null;
    private attributionSource: string | null = null;
    private attributionReference: string | null = null;
    private readonly onResetRequested = (): void => this.resetRequested();

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
        this.setState('LOADING');
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
            this.setState('CHECKOUT');
        } catch {
            this.loadError = 'Checkout is temporarily unavailable. Please try again.';
        } finally {
            if (this.loadError) this.reportError(this.loadError);
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
        (this.hostEl?.nativeElement as HTMLElement | undefined)?.removeEventListener?.(CHECKOUT_RESET_REQUEST_EVENT, this.onResetRequested);
        try {
            this.card?.unmount?.();
        } catch {
            /* already gone */
        }
    }

    /**
     * Cancel resets the checkout to a blank form and tells the host page, which may close the modal
     * the checkout sits in. The widget is re-created, so every field the buyer filled in is cleared,
     * and the card field is mounted again on the new form. The session stays open for the next try.
     */
    public onCancelled(): void {
        if (this.processing) {
            return;
        }
        this.resetForm();
        this.dispatch(CHECKOUT_CANCEL_EVENT, {});
        this.dispatch(CHECKOUT_CLOSE_EVENT, {});
        this.cdr.detectChanges();
    }

    /**
     * A reset the embedding host asked for, by dispatching `checkout-reset` on the element (a voice
     * or chat agent closing its panel, say). Refused while a payment is in flight — resetting then
     * would strand a charge the buyer cannot see. Unlike Cancel it sends no `checkout-cancel` or
     * `checkout-close`: the host started it.
     */
    private resetRequested(): void {
        if (this.processing) {
            this.dispatch(CHECKOUT_RESET_REFUSED_EVENT, { state: this.state });
            return;
        }
        if (this.successMessage) {
            // The last purchase is confirmed and its session closed: the next one needs a new
            // session, so forget this one's key and start from the beginning.
            this.successMessage = null;
            this.orderNumber = null;
            this.config = null;
            this.sessionId = '';
            this.forgetClientKey();
            this.resetForm();
            void this.ngOnInit();
            return;
        }
        this.resetForm();
        this.cdr.detectChanges();
    }

    /** Back to a blank form: every field, the error banner and the card entry. The session stays open. */
    private resetForm(): void {
        this.errorMessage = null;
        this.stripePaymentMethodId = null;
        try {
            this.card?.destroy?.();
        } catch {
            /* already gone */
        }
        this.card = null;
        this.cardMounted = false;
        this.isPaymentReady = !this.config?.stripePublishableKey;
        this.formGeneration++;
        this.setState('CHECKOUT');
    }

    public async onSubmitted(event: CheckoutSubmissionEvent): Promise<void> {
        if (this.processing || !this.config?.productId) {
            return;
        }
        this.processing = true;
        this.errorMessage = null;
        this.setState('PROCESSING');
        try {
            const line = buildCheckoutDraftLine(this.config.productId, event);
            const draft = await this.post('/draft', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
                email: event.email,
                lines: [line],
                ...(this.attributionSource
                    ? { attribution: { source: this.attributionSource, reference: this.attributionReference } }
                    : {}),
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
            this.reportError(this.errorMessage);
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
        // Dispatched before any redirect, so a host listener sees the sale on this page.
        this.setState('SUCCESS');
        this.dispatch(
            CHECKOUT_COMPLETE_EVENT,
            BuildCheckoutCompleteDetail({
                sessionId: this.sessionId,
                productName: this.config?.productName ?? this.config?.title,
                productId: this.config?.productId,
                totalGross: done.TotalGross,
                currency: this.config?.currency,
                // The applied promotion code, once the checkout takes one.
                coupon: null,
            })
        );
        if (this.config?.redirectUrl) {
            window.location.href = this.config.redirectUrl;
        }
        this.cdr.detectChanges();
    }

    /** Reports a state the host page can track; repeats of the same state are not re-sent. */
    private setState(state: CheckoutElementState): void {
        if (this.state === state) return;
        this.state = state;
        this.dispatch(CHECKOUT_STATE_CHANGE_EVENT, { state });
    }

    private reportError(message: string): void {
        this.setState('ERROR');
        this.dispatch(CHECKOUT_ERROR_EVENT, { message });
    }

    /** Dispatches on the `<mj-orders-checkout>` element; bubbling and composed, so `document` hears it too. */
    private dispatch<T>(name: string, detail: T): void {
        const el = this.hostEl?.nativeElement as HTMLElement | undefined;
        el?.dispatchEvent(CheckoutElementEvent(name, detail));
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
            this.reportError(this.errorMessage);
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
        // For a host that embeds the checkout in its own panel: an e-mail it already knows, and
        // where the checkout came from. The server keeps the attribution only if it reads as one.
        this.prefillEmail = el.getAttribute('email') || el.getAttribute('data-email') || null;
        this.attributionSource = el.getAttribute('source') || el.getAttribute('data-source') || null;
        this.attributionReference = el.getAttribute('source-ref') || el.getAttribute('data-source-ref') || null;
        el.addEventListener?.(CHECKOUT_RESET_REQUEST_EVENT, this.onResetRequested);
    }

    private forgetClientKey(): void {
        try {
            sessionStorage.removeItem(`mj-checkout-key:${this.slug}`);
        } catch {
            /* private mode */
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
