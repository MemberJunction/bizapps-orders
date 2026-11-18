/**
 * CheckoutWidget server subclass — refuses a widget configuration whose currency is not USD (#818).
 *
 * Orders do not yet record a currency, so `OpenPaymentIntent` only accepts `SUPPORTED_PAYMENT_CURRENCY`
 * ('USD'). Refusing a non-USD `currency` in `Configuration` at save time stops a widget from being
 * saved with a currency that checkout would display and then refuse at payment.
 */
import { BaseEntity, ValidationErrorInfo, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersCheckoutWidgetEntity } from '@mj-biz-apps/orders-entities';

import { SUPPORTED_PAYMENT_CURRENCY } from './PaymentIntentService.js';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';

/**
 * Refuses a widget currency that is not {@link SUPPORTED_PAYMENT_CURRENCY} (#818).
 * Returns the refusal message, or null when the currency is unset/empty or matches USD.
 */
export function UnsupportedWidgetCurrencyRefusal(currency: unknown): string | null {
    if (typeof currency !== 'string') {
        return null;
    }
    const trimmed = currency.trim();
    if (!trimmed || trimmed.toUpperCase() === SUPPORTED_PAYMENT_CURRENCY) {
        return null;
    }
    return `Payments can only be taken in ${SUPPORTED_PAYMENT_CURRENCY} — '${trimmed}' is not supported, because orders do not yet record a currency.`;
}

/**
 * Inspects a raw `CheckoutWidget.Configuration` JSON string for an unsupported currency (#818).
 */
export function CheckCheckoutWidgetConfigurationCurrency(configuration: string | null | undefined): string | null {
    if (!configuration) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(configuration);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return UnsupportedWidgetCurrencyRefusal((parsed as { currency?: unknown }).currency);
    } catch {
        return null;
    }
}

@RegisterClass(BaseEntity, CHECKOUT_WIDGET_ENTITY, 10)
export class CheckoutWidgetEntityServer extends mjBizAppsOrdersCheckoutWidgetEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const refusal = CheckCheckoutWidgetConfigurationCurrency(this.Configuration);
        if (refusal) {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo('Configuration', refusal, this.Configuration));
        }
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCheckoutWidgetEntityServer(): void {
    // intentionally empty
}
