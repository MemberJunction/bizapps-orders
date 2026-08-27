/**
 * Pure helpers for the anonymous checkout edge: slug validation and origin allowlist.
 * Extracted so unit tests do not have to boot Express or the ClassFactory.
 */

/** POST route suffixes that must never be treated as a distribution slug. */
export const CHECKOUT_RESERVED_SLUGS: ReadonlySet<string> = new Set([
    'initialize',
    'draft',
    'payment-intent',
    'complete',
]);

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Public distribution slugs: short, URL-safe, not colliding with the POST verbs
 * mounted on the same root.
 */
export function isValidCheckoutSlug(slug: string): boolean {
    if (!slug || slug.length > 128) {
        return false;
    }
    if (CHECKOUT_RESERVED_SLUGS.has(slug.toLowerCase())) {
        return false;
    }
    return SLUG_PATTERN.test(slug);
}

/**
 * True when the browser Origin is the same host:port as this request (the
 * first-party `GET /checkout/:slug` page posting back to MJAPI).
 */
export function isSameOrigin(origin: string, hostHeader: string | undefined): boolean {
    if (!origin || !hostHeader) {
        return false;
    }
    try {
        const url = new URL(origin);
        return url.host.toLowerCase() === hostHeader.toLowerCase();
    } catch {
        return false;
    }
}

export interface CheckoutOriginPolicy {
    allowedOrigins?: string[];
}

/**
 * Widget `allowedOrigins` is a **cross-origin embed** allowlist. Same-origin
 * posts from the MJAPI-hosted public page always pass. When the allowlist is
 * absent or empty, any origin is allowed (the distribution slug remains the
 * access control).
 */
/**
 * Client IP for rate limiting and Turnstile.
 *
 * `TrustedProxyHops` is the number of reverse proxies that append to
 * `X-Forwarded-For`. 0 (the default) ignores XFF entirely and uses the socket
 * address — the leftmost XFF hop is client-supplied and must never key a
 * security decision. When hops is N, the Nth-from-the-right entry is used
 * (the address the outermost trusted proxy observed).
 */
export function resolveClientIp(
    req: { headers: { [key: string]: unknown }; socket?: { remoteAddress?: string } },
    trustedProxyHops = 0
): string {
    const socket = req.socket?.remoteAddress ?? 'unknown';
    if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) {
        return socket;
    }
    const fwd = req.headers['x-forwarded-for'];
    const raw = Array.isArray(fwd) ? fwd.join(',') : typeof fwd === 'string' ? fwd : undefined;
    if (!raw) {
        return socket;
    }
    const hops = raw.split(',').map((h) => h.trim()).filter((h) => h.length > 0);
    const idx = hops.length - trustedProxyHops;
    if (idx < 0 || idx >= hops.length) {
        return socket;
    }
    return hops[idx];
}

export function originAllowed(
    origin: string,
    policy: CheckoutOriginPolicy,
    hostHeader?: string
): boolean {
    if (isSameOrigin(origin, hostHeader)) {
        return true;
    }
    if (!policy.allowedOrigins || policy.allowedOrigins.length === 0) {
        return true;
    }
    const normalized = origin.replace(/\/+$/, '').toLowerCase();
    return policy.allowedOrigins.some(
        (allowed) => allowed.replace(/\/+$/, '').toLowerCase() === normalized
    );
}
