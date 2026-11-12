/**
 * What the embedding page knew about the visitor when they checked out: the page URL, the host of the
 * page that sent them there, and the first-party cookies the host named in the element's
 * `capture-cookies` attribute (for example a marketing tool's visitor cookie, so an outbound consumer
 * can tie the buyer to their browsing).
 *
 * Only what attribution needs is kept, because a URL can carry personal data (an e-mail in a query
 * string, a token in a link): the page URL keeps its origin, path and the standard tracking
 * parameters (`utm_*` and the ad platforms' click ids), and the referrer keeps its host only.
 *
 * Kept on the checkout session (`MetadataJSON.Tracking`), which points at the order once it confirms
 * (`DraftOrderID`). Like attribution it is reporting data from the browser: a value that cannot be
 * read is dropped, never a reason to refuse a buyer's checkout. Pure, so the browser and the server
 * share it.
 */
export interface CheckoutTracking {
    /** The page the checkout was embedded on: `http(s)` only, at most 2000 characters, reduced to origin, path and tracking parameters. */
    PageURL: string | null;
    /** Captured cookies by name. At most 10; names up to 64 token characters, values up to 512 printable characters. */
    Cookies: Record<string, string>;
    /** The host of the page that linked to the checkout page (`document.referrer`), lower case. Null when there was none. */
    ReferrerHost: string | null;
}

export const MAX_TRACKING_PAGE_URL_LENGTH = 2000;
export const MAX_TRACKING_COOKIES = 10;
export const MAX_TRACKING_COOKIE_NAME_LENGTH = 64;
export const MAX_TRACKING_COOKIE_VALUE_LENGTH = 512;

/** Query parameters kept on the page URL: UTM tags and the ad platforms' click ids (Google, Meta, Microsoft, LinkedIn). */
const TRACKING_PARAM = /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|li_fat_id)$/i;

const COOKIE_NAME = /^[A-Za-z0-9_.-]+$/;
// Printable, no control characters and no `;` (a cookie value never holds one): it ends up in
// reports and in requests to other systems.
const COOKIE_VALUE = /^[^\u0000-\u001f\u007f;]+$/;

function parseWebURL(input: unknown): URL | null {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw || raw.length > MAX_TRACKING_PAGE_URL_LENGTH) return null;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

function normalizePageURL(input: unknown): string | null {
    const url = parseWebURL(input);
    if (!url) return null;
    const kept = new URLSearchParams();
    url.searchParams.forEach((value, name) => {
        if (TRACKING_PARAM.test(name)) kept.append(name, value);
    });
    const query = kept.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}

function normalizeReferrerHost(input: unknown): string | null {
    return parseWebURL(input)?.hostname.toLowerCase() || null;
}

function normalizeCookies(input: unknown): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return cookies;
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
        if (Object.keys(cookies).length >= MAX_TRACKING_COOKIES) break;
        if (name.length > MAX_TRACKING_COOKIE_NAME_LENGTH || !COOKIE_NAME.test(name)) continue;
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text || text.length > MAX_TRACKING_COOKIE_VALUE_LENGTH || !COOKIE_VALUE.test(text)) continue;
        cookies[name] = text;
    }
    return cookies;
}

/** The tracking to keep, or null when there is none or none of it can be read. */
export function NormalizeCheckoutTracking(input: unknown): CheckoutTracking | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const raw = input as Record<string, unknown>;
    const pageURL = normalizePageURL(raw['pageUrl']);
    const cookies = normalizeCookies(raw['cookies']);
    const referrerHost = normalizeReferrerHost(raw['referrer']);
    if (pageURL === null && referrerHost === null && Object.keys(cookies).length === 0) return null;
    return { PageURL: pageURL, Cookies: cookies, ReferrerHost: referrerHost };
}

const STORED_HOST = /^[a-z0-9.:\[\]-]{1,253}$/;

/**
 * Read back what an earlier draft stored (`MetadataJSON.Tracking`) through the same bounds. The stored
 * referrer is already a host, so it is checked as one rather than parsed as a URL.
 */
export function NormalizeStoredCheckoutTracking(stored: unknown): CheckoutTracking | null {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const raw = stored as Record<string, unknown>;
    const host = typeof raw['ReferrerHost'] === 'string' ? raw['ReferrerHost'].trim().toLowerCase() : '';
    const tracking = NormalizeCheckoutTracking({ pageUrl: raw['PageURL'], cookies: raw['Cookies'] });
    const referrerHost = STORED_HOST.test(host) ? host : null;
    if (!tracking && referrerHost === null) return null;
    return { PageURL: tracking?.PageURL ?? null, Cookies: tracking?.Cookies ?? {}, ReferrerHost: referrerHost };
}

/**
 * Combine a draft's tracking with what an earlier draft of the same session stored. The new page
 * URL and referrer win when present; cookies are merged with the new values winning, because a tracker can set its cookie
 * after the first draft.
 */
export function MergeCheckoutTracking(earlier: CheckoutTracking | null, latest: CheckoutTracking | null): CheckoutTracking | null {
    if (!earlier) return latest;
    if (!latest) return earlier;
    const cookies = { ...earlier.Cookies, ...latest.Cookies };
    const names = Object.keys(cookies).slice(0, MAX_TRACKING_COOKIES);
    return {
        PageURL: latest.PageURL ?? earlier.PageURL,
        ReferrerHost: latest.ReferrerHost ?? earlier.ReferrerHost,
        Cookies: Object.fromEntries(names.map((name) => [name, cookies[name]])),
    };
}

/** Read a cookie list attribute (`"a, b c"`) into the names it holds, dropping any that can't be a cookie name. */
export function ParseCaptureCookieNames(attribute: string | null | undefined): string[] {
    if (!attribute) return [];
    const names = attribute.split(/[\s,]+/).filter((name) => name.length > 0 && name.length <= MAX_TRACKING_COOKIE_NAME_LENGTH && COOKIE_NAME.test(name));
    return [...new Set(names)].slice(0, MAX_TRACKING_COOKIES);
}

/** The named cookies present in a `document.cookie` string. Values are URI-decoded when they can be. */
export function ReadNamedCookies(cookieHeader: string, names: string[]): Record<string, string> {
    const wanted = new Set(names);
    const found: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (!wanted.has(name) || name in found) continue;
        const raw = part.slice(eq + 1).trim();
        let value = raw;
        try {
            value = decodeURIComponent(raw);
        } catch {
            /* keep the raw value */
        }
        if (value) found[name] = value;
    }
    return found;
}
