/**
 * VAT location evidence a self-serve checkout records on the order beside its billing address
 * (MemberJunction/bizapps-orders#480): the country of the buyer's IP address and the country of
 * the issuer of the card that paid. Codes only; the IP address itself is never stored.
 *
 *   EDGE:    packages/Server/src/checkout-edge-policy.ts (resolveIpCountryHeader)
 *   WRITE:   ./CheckoutSessionService.ts (CompleteCheckout → OrderHeader.IPCountry, CardIssuingCountry)
 *   DRIVER:  ./StripePaymentProvider.ts (StripeInstrumentFromIntent → RetrievedInstrument.IssuingCountry)
 */

/**
 * Two-letter codes edge networks and GeoIP databases send that name no country: unknown (XX, ZZ),
 * the Tor network (T1), and continent-level results (EU, AP). Recording one would look like
 * evidence while saying nothing about where the buyer is.
 */
const NOT_A_COUNTRY: ReadonlySet<string> = new Set(['XX', 'ZZ', 'T1', 'EU', 'AP']);

/** What the edge observed about the buyer's location, passed into CompleteCheckout. */
export interface CheckoutLocationEvidence {
    /** The country the proxy or CDN in front of the server resolved the buyer's IP to, as sent. */
    IPCountry?: string | null;
}

/**
 * The ISO 3166-1 alpha-2 code in `value`, upper-cased, or null when it is not one. Null is the
 * answer for anything that cannot be relied on as evidence, so a checkout records nothing rather
 * than something wrong, and the sale still completes.
 */
export function ToIsoCountryCode(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || NOT_A_COUNTRY.has(code)) {
        return null;
    }
    return code;
}
