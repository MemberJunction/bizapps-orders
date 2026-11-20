/**
 * The pay-renewal mode of the public checkout (#289): what the update-card link's page shows, read
 * from `/initialize`. Pure, so it is testable without the host component.
 */

/** The renewal order the page pays. Nothing about the buyer: the page is opened from an e-mailed link. */
export interface CheckoutRenewalPaymentView {
    OrderNumber: string;
    /** The amount due, in major units. */
    Amount: number;
    /** What renews: the renewal lines' product names. */
    Description: string;
    SubscriptionNumber: string | null;
    /** `YYYY-MM-DD`. */
    DueDate: string | null;
}

/** The renewal an `/initialize` response describes, or null when it describes none. */
export function ReadRenewalPayment(response: unknown): CheckoutRenewalPaymentView | null {
    if (!response || typeof response !== 'object') return null;
    const renewal = (response as Record<string, unknown>)['RenewalPayment'];
    if (!renewal || typeof renewal !== 'object') return null;
    const r = renewal as Record<string, unknown>;
    const amount = Number(r['Amount']);
    if (typeof r['OrderNumber'] !== 'string' || !r['OrderNumber'] || !Number.isFinite(amount) || amount <= 0) return null;
    return {
        OrderNumber: r['OrderNumber'],
        Amount: Math.round(amount * 100) / 100,
        Description: typeof r['Description'] === 'string' ? r['Description'] : '',
        SubscriptionNumber: typeof r['SubscriptionNumber'] === 'string' && r['SubscriptionNumber'] ? r['SubscriptionNumber'] : null,
        DueDate: typeof r['DueDate'] === 'string' && r['DueDate'] ? r['DueDate'] : null,
    };
}

/** The amount as the page shows it: two decimals, with the currency code when the widget has one. */
export function FormatRenewalAmount(amount: number, currency?: string | null): string {
    const value = amount.toFixed(2);
    return currency ? `${value} ${currency.toUpperCase()}` : value;
}

/** What the page says once the renewal is paid. */
export function RenewalPaidMessage(view: CheckoutRenewalPaymentView): string {
    return `Thank you. Renewal ${view.OrderNumber} is paid, and the card you used will be charged for future renewals.`;
}
