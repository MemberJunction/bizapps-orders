/**
 * The redirect after a confirmed checkout carries the order reference (#295), so the landing page
 * knows which order just completed. Pure, so it is testable without a browser.
 *
 * Only the order number is added — never the buyer's e-mail or anything they typed: a URL ends up
 * in browser history, server logs and referrer headers.
 */
export const ORDER_REFERENCE_PARAM = 'order';

/**
 * `redirectUrl` with `order=<orderNumber>` set, keeping its other query parameters and fragment.
 * A relative `redirectUrl` is resolved against `base`. With no order number, or a URL that cannot be
 * read, the redirect is returned unchanged rather than dropped.
 */
export function WithOrderReference(redirectUrl: string, orderNumber: string | null | undefined, base: string): string {
    if (!orderNumber) return redirectUrl;
    let url: URL;
    try {
        url = new URL(redirectUrl, base);
    } catch {
        return redirectUrl;
    }
    url.searchParams.set(ORDER_REFERENCE_PARAM, orderNumber);
    return url.toString();
}
