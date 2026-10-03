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
import { WithOrderReference } from './checkout-redirect';
import {
    ACCOUNT_STEP_FAILED,
    AccountMessage,
    CheckPasswordEntry,
    IsAccountSettled,
    MayRedirect,
    ReadCheckoutAccount,
    VerificationNote,
    type CheckoutAccountView,
} from './checkout-account';
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
    ACCESS_POLL_INTERVAL_MS,
    ACCESS_POLL_TIMEOUT_MS,
    AccessMessage,
    CHECKOUT_ACCESS_STATE_EVENT,
    IsFinalAccessState,
    ReadAccessState,
    type CheckoutAccessState,
} from './checkout-access';
import {
    MJCheckoutWidgetComponent,
    type CheckoutAppliedPromotion,
    type CheckoutServerPricedTotal,
    type CheckoutSubmissionEvent,
    type CheckoutWidgetConfig,
} from './checkout-widget.component';
import {
    buildCheckoutDraftLine,
    formatStripeError,
    intentAlreadyCollected,
    memberDiscountNotice,
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
        opts: {
            payment_method: {
                card: StripeCard;
                billing_details?: {
                    email?: string;
                    address?: { country?: string; state?: string; postal_code?: string };
                };
            };
        }
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
    /** A host-signed membership token, verified server-side on /draft and never stored (#324). */
    @Input() public memberToken = '';

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
    /** The code the server last priced, fed back to the widget so it shows the discounted total. */
    public appliedPromotion: CheckoutAppliedPromotion | null = null;
    /** Why the last code could not be used. */
    public promotionError: string | null = null;
    /** The total the server last priced the draft at, fed back so the widget charges what it shows. */
    public serverPricedTotal: CheckoutServerPricedTotal | null = null;
    /** The server's total and tax for the details last drafted — shown before the buyer is charged. */
    public quotedTotal: number | null = null;
    public quotedTax: number | null = null;

    /** The post-payment account step, when the host registered one (#292). */
    public account: CheckoutAccountView | null = null;
    public password = '';
    public passwordConfirmation = '';
    public passwordError: string | null = null;
    public passwordBusy = false;
    public passwordSet = false;
    /** True while the account step is being asked for. */
    public accountLoading = false;
    /** The buyer chose to leave a failed account step. */
    private accountDismissed = false;

    public get accountMessage(): string | null {
        return this.account ? AccountMessage(this.account, this.passwordSet) : null;
    }

    public get verificationNote(): string | null {
        return VerificationNote(this.account);
    }

    /** Whether the buyer's access is ready (#325); null while nothing is tracked. */
    public accessState: CheckoutAccessState | null = null;
    /** How often, and for how long, the success screen asks. Fields so a test can shorten them. */
    public accessPollIntervalMs = ACCESS_POLL_INTERVAL_MS;
    public accessPollTimeoutMs = ACCESS_POLL_TIMEOUT_MS;
    /** True while access is being asked for; the redirect waits on it. */
    private accessTracking = false;

    public get accessMessage(): string | null {
        return AccessMessage(this.accessState, this.config?.accessMessages);
    }

    private stripe: StripeInstance | null = null;
    private card: StripeCard | null = null;
    private cardMounted = false;
    private destroyed = false;
    private memberNoticeShown = false;
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
        // A reset runs this again: a failure from the previous attempt must not outlive it.
        this.loadError = null;
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
        if (await this.resumeAccountStep()) {
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

    /** The buyer pressed Apply: price the form with the code and show what it does. */
    public async onPromotionCodeApplied(event: CheckoutSubmissionEvent): Promise<void> {
        if (this.processing || !this.config?.productId || !event.promotionCode) {
            return;
        }
        this.processing = true;
        this.promotionError = null;
        try {
            const draft = await this.post('/draft', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
                email: event.email,
                lines: [buildCheckoutDraftLine(this.config.productId, event)],
                billingAddress: event.billingAddress,
                answers: event.answers,
                choices: event.choices,
                ...(this.attributionSource
                    ? { attribution: { source: this.attributionSource, reference: this.attributionReference } }
                    : {}),
                ...(this.memberToken ? { memberToken: this.memberToken } : {}),
                promotionCodes: [event.promotionCode],
            });
            this.applyPromotionOutcome(draft, event);
        } catch {
            this.promotionError = 'The code could not be checked. Please try again.';
        } finally {
            this.processing = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Read a draft's verdict on the buyer's code into the widget's inputs. Returns true when the
     * draft priced the code (or no code was sent), false when the code was refused.
     */
    private applyPromotionOutcome(draft: Record<string, unknown> | null | undefined, event: CheckoutSubmissionEvent): boolean {
        if (!event.promotionCode) {
            this.appliedPromotion = null;
            return true;
        }
        if (!draft?.Success) {
            this.appliedPromotion = null;
            this.promotionError = this.str(draft?.ErrorMessage, 'That code could not be applied.');
            return false;
        }
        const unusable = Array.isArray(draft.UnusablePromotionCodes)
            ? (draft.UnusablePromotionCodes as Array<{ Code?: unknown; Reason?: unknown }>)
            : [];
        if (unusable.length > 0) {
            this.appliedPromotion = null;
            this.promotionError = `${this.str(unusable[0].Code, event.promotionCode)} can't be used: ${this.str(unusable[0].Reason, 'not valid for this order')}.`;
            return false;
        }
        const applied = Array.isArray(draft.AppliedPromotionCodes) ? (draft.AppliedPromotionCodes as unknown[]) : [];
        this.appliedPromotion = {
            code: this.str(applied[0], event.promotionCode),
            discount: Number(draft.Discount ?? 0),
            total: Number(draft.TotalGross ?? 0),
            quantity: event.quantity,
        };
        return true;
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
        this.setState('CHECKOUT');
        this.dispatch(CHECKOUT_CANCEL_EVENT, {});
        this.dispatch(CHECKOUT_CLOSE_EVENT, {});
        this.cdr.detectChanges();
    }

    /**
     * A reset the embedding host asked for, by dispatching `checkout-reset` on the element (a voice
     * or chat agent closing its panel, say). Refused while a payment is in flight — resetting then
     * would strand a charge the buyer cannot see. Unlike Cancel it sends no `checkout-cancel` or
     * `checkout-close`: the host started it. Also refused while the account step after a sale is
     * unsettled, since the buyer could not come back to it.
     *
     * A reset always starts a new session, before a sale as well as after one: the server matches
     * the buyer's person record once per session, so a kept session would carry the previous
     * conversation's buyer into the next. The e-mail and attribution are read again, so a host
     * starting a new conversation sets them on the element before it dispatches the reset.
     */
    private resetRequested(): void {
        if (this.processing || this.accountUnsettled) {
            this.dispatch(CHECKOUT_RESET_REFUSED_EVENT, { state: this.state });
            return;
        }
        this.successMessage = null;
        this.orderNumber = null;
        this.account = null;
        this.accountDismissed = false;
        this.password = '';
        this.passwordConfirmation = '';
        this.passwordError = null;
        this.passwordSet = false;
        this.config = null;
        this.sessionId = '';
        this.forgetClientKey();
        this.forgetCompleting();
        this.resetForm();
        void this.ngOnInit();
    }

    /** The account step is still asking the buyer for something, and the buyer has not left it. */
    private get accountUnsettled(): boolean {
        return this.accountLoading || this.passwordBusy || (!this.accountDismissed && !IsAccountSettled(this.account));
    }

    /**
     * Back to a blank form: every field, the error banner and the card entry. The session stays open.
     * The caller reports the state, since a host reset reports `LOADING` next, not `CHECKOUT`.
     */
    private resetForm(): void {
        this.errorMessage = null;
        this.stripePaymentMethodId = null;
        this.serverPricedTotal = null;
        try {
            this.card?.destroy?.();
        } catch {
            /* already gone */
        }
        this.card = null;
        this.cardMounted = false;
        this.isPaymentReady = !this.config?.stripePublishableKey;
        this.formGeneration++;
    }

    /** A price input changed: every total the server priced for the old inputs is stale, tax included. */
    public onQuoteInvalidated(): void {
        this.quotedTotal = null;
        this.quotedTax = null;
        this.serverPricedTotal = null;
        this.appliedPromotion = null;
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
                billingAddress: event.billingAddress,
                answers: event.answers,
                ...(this.attributionSource
                    ? { attribution: { source: this.attributionSource, reference: this.attributionReference } }
                    : {}),
                choices: event.choices,
                ...(this.memberToken ? { memberToken: this.memberToken } : {}),
                promotionCodes: event.promotionCode ? [event.promotionCode] : [],
            });
            if (!this.applyPromotionOutcome(draft, event)) {
                // The code was refused: say why and stop before any payment, so the buyer can remove
                // it or try another rather than pay a price they did not expect.
                return;
            }
            if (!draft?.Success) {
                throw new Error(this.str(draft?.ErrorMessage, 'Could not price this checkout.'));
            }
            // The widget cannot price a member discount itself, so it is told the server's total; a
            // second press of Pay then carries that total and passes the check below.
            this.serverPricedTotal = { total: Number(draft.TotalGross ?? 0), quantity: event.quantity };
            const notice = memberDiscountNotice(draft, this.memberNoticeShown);
            if (notice) {
                this.memberNoticeShown = true;
                this.errorMessage = notice;
                return;
            }
            if (!draft.RequiresPayment) {
                await this.finish();
                return;
            }
            // The server's total is the one charged. If it differs from what the buyer was shown
            // (tax for the location, a code typed but never applied, or a price that changed), show
            // it and ask for a second press rather than charge a different amount than the button said.
            if (this.quoteChanged(draft, event.totalGross)) {
                return;
            }
            const intent = await this.post('/payment-intent', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
                autoRenewConsent: event.autoRenewConsent === true,
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
                    billing_details: {
                        email: event.email,
                        address: {
                            country: event.billingAddress.Country,
                            state: event.billingAddress.StateProvince,
                            postal_code: event.billingAddress.PostalCode,
                        },
                    },
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

    /**
     * Stop before charging when the server's total differs from what the buyer was shown. Tax
     * depends on the billing location, so the first press of Pay is also the first time the total
     * including tax is known; the buyer sees it and presses Pay again.
     */
    private quoteChanged(draft: Record<string, unknown>, shownTotal: number): boolean {
        const total = typeof draft.TotalGross === 'number' ? draft.TotalGross : 0;
        const tax = typeof draft.Tax === 'number' ? draft.Tax : 0;
        if (Math.abs(total - shownTotal) <= 0.005) {
            return false;
        }
        this.quotedTotal = total;
        this.quotedTax = tax > 0 ? tax : null;
        this.errorMessage = tax > 0
            ? `The total is ${total.toFixed(2)}, including ${tax.toFixed(2)} sales tax. Review it and press Pay again.`
            : `The total is ${total.toFixed(2)}. Review it and press Pay again.`;
        return true;
    }

    private async finish(): Promise<void> {
        // Remembered before completing, so a reload after payment returns to the account step.
        this.rememberCompleting(this.sessionId);
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
        this.cdr.detectChanges();
        // Access is tracked alongside the account step. A redirect waits for both, so the buyer sees
        // "ready" (or the support text) before leaving. With nothing tracked the first answer ends the wait.
        const access = this.trackAccess();
        if (done.AccountStep === true) {
            await this.loadAccount();
        } else {
            this.forgetCompleting();
            this.leaveIfDone();
        }
        await access;
        this.cdr.detectChanges();
    }

    /**
     * Asks whether the order's access is ready until it is, it has failed, or the wait runs out.
     * Never throws: a status that cannot be read leaves the confirmation as it is. Holds the
     * redirect while it runs, and follows it once it ends if nothing else is left to do.
     */
    private async trackAccess(): Promise<void> {
        this.accessTracking = true;
        try {
            const deadline = Date.now() + this.accessPollTimeoutMs;
            for (;;) {
                let state: CheckoutAccessState | null = null;
                try {
                    state = ReadAccessState(
                        await this.post('/access-status', { sessionId: this.sessionId, clientSessionKey: this.sessionKey })
                    );
                } catch {
                    return;
                }
                if (state === null || state === 'NotTracked') return;
                if (state !== this.accessState) {
                    this.accessState = state;
                    this.dispatch(CHECKOUT_ACCESS_STATE_EVENT, { state });
                    this.cdr.detectChanges();
                }
                if (IsFinalAccessState(state) || Date.now() >= deadline) return;
                await new Promise((resolve) => setTimeout(resolve, this.accessPollIntervalMs));
            }
        } finally {
            this.accessTracking = false;
            this.leaveIfDone();
        }
    }

    /** Asks for the account step of the completed checkout. The host is asked again only after a failure. */
    private async loadAccount(): Promise<void> {
        this.accountLoading = true;
        this.cdr.detectChanges();
        try {
            const res = await this.post('/account', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
            });
            this.account = res.Success ? ReadCheckoutAccount(res.Account) : ACCOUNT_STEP_FAILED;
        } catch {
            this.account = ACCOUNT_STEP_FAILED;
        } finally {
            this.accountLoading = false;
        }
        if (IsAccountSettled(this.account)) this.forgetCompleting();
        this.syncAccountState();
        this.leaveIfDone();
        this.cdr.detectChanges();
    }

    /** Asks the host again after the account step failed. */
    public async retryAccount(): Promise<void> {
        if (this.accountLoading) return;
        await this.loadAccount();
    }

    /** Leaves a failed account step. A reload of this checkout in the same tab offers it again. */
    public dismissAccount(): void {
        this.accountDismissed = true;
        this.leaveIfDone();
    }

    /**
     * A reload after payment: when this tab completed a checkout whose account step is not settled,
     * shows the confirmation and the account step instead of a new checkout.
     */
    private async resumeAccountStep(): Promise<boolean> {
        const sessionId = this.completingSession();
        if (!sessionId) return false;
        try {
            const res = await this.post('/account', { sessionId, clientSessionKey: this.sessionKey });
            const account = res.Success ? ReadCheckoutAccount(res.Account) : null;
            if (!account) {
                this.forgetCompleting();
                return false;
            }
            this.sessionId = sessionId;
            this.successMessage = 'Thank you. Your order is confirmed.';
            this.account = account;
            if (IsAccountSettled(account)) this.forgetCompleting();
            this.syncAccountState();
            return true;
        } catch {
            return false;
        } finally {
            this.cdr.detectChanges();
        }
    }

    /** Sends the new account's password. The host's policy decides; its message is shown when it refuses. */
    public async submitPassword(): Promise<void> {
        const problem = CheckPasswordEntry(this.password, this.passwordConfirmation);
        if (problem) {
            this.passwordError = problem;
            return;
        }
        this.passwordBusy = true;
        this.passwordError = null;
        try {
            const res = await this.post('/account/password', {
                sessionId: this.sessionId,
                clientSessionKey: this.sessionKey,
                password: this.password,
            });
            this.account = ReadCheckoutAccount(res.Account) ?? this.account;
            if (IsAccountSettled(this.account)) this.forgetCompleting();
            this.syncAccountState();
            if (res.Success) {
                this.passwordSet = true;
                this.password = '';
                this.passwordConfirmation = '';
                this.leaveIfDone();
            } else {
                this.passwordError = this.str(res.ErrorMessage, 'That password could not be set. Please try another.');
            }
        } catch {
            this.passwordError = 'That password could not be set right now. Please try again.';
        } finally {
            this.passwordBusy = false;
            this.cdr.detectChanges();
        }
    }

    /** Leaves the password for later: the buyer can reset it at sign-in. */
    public skipPassword(): void {
        if (this.account) this.account = { ...this.account, CanSetPassword: false };
        this.forgetCompleting();
        this.syncAccountState();
        this.leaveIfDone();
    }

    /**
     * `PASSWORD` while the account step's password form shows, and `SUCCESS` once it no longer does.
     * Nothing is sent when the form never showed: `finish()` has already reported `SUCCESS`, and a
     * reload that resumes a settled step should not report a second sale.
     */
    private syncAccountState(): void {
        if (this.account?.CanSetPassword) {
            this.setState('PASSWORD');
        } else if (this.state === 'PASSWORD') {
            this.setState('SUCCESS');
        }
    }

    /** Follows the widget's redirect once nothing is left for the buyer to do here. */
    private leaveIfDone(): void {
        if (this.config?.redirectUrl && !this.accountLoading && !this.accessTracking && MayRedirect(this.account, this.accountDismissed)) {
            // The landing page learns which order completed from `?order=` (#295).
            window.location.href = WithOrderReference(this.config.redirectUrl, this.orderNumber, window.location.href);
        }
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
        const memberToken = el.getAttribute('member-token') || el.getAttribute('data-member-token');
        if (memberToken) {
            this.memberToken = memberToken;
        }
        this.readConversationAttributes();
        el.addEventListener?.(CHECKOUT_RESET_REQUEST_EVENT, this.onResetRequested);
    }

    /**
     * For a host that embeds the checkout in its own panel: an e-mail it already knows, and where the
     * checkout came from. The server keeps the attribution only if it reads as one.
     */
    private readConversationAttributes(): void {
        const el = this.hostEl?.nativeElement as HTMLElement | undefined;
        if (!el) {
            return;
        }
        this.prefillEmail = el.getAttribute('email') || el.getAttribute('data-email') || null;
        this.attributionSource = el.getAttribute('source') || el.getAttribute('data-source') || null;
        this.attributionReference = el.getAttribute('source-ref') || el.getAttribute('data-source-ref') || null;
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

    private get completingKey(): string {
        return `mj-checkout-completing:${this.slug}`;
    }

    private rememberCompleting(sessionId: string): void {
        try {
            sessionStorage.setItem(this.completingKey, sessionId);
        } catch {
            /* private mode */
        }
    }

    private forgetCompleting(): void {
        try {
            sessionStorage.removeItem(this.completingKey);
        } catch {
            /* private mode */
        }
    }

    private completingSession(): string | null {
        try {
            return sessionStorage.getItem(this.completingKey);
        } catch {
            return null;
        }
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
