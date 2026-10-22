/**
 * @fileoverview Bill.com webhook verification and the one thing a Bill.com webhook can do for us.
 *
 * WHAT BILL.COM PUBLISHES (developer.bill.com, "Webhook Events & Subscriptions", read 2026-09-20):
 * subscriptions are created with `POST /v3/subscriptions` naming `events[]` and a `notificationUrl`;
 * every notification is signed HMAC-SHA256 over the raw body with the subscription's `securityKey`,
 * base64, in the `x-bill-sha-signature` header; failed deliveries retry with exponential backoff and a
 * subscription that keeps failing is disabled by BILL; at most 10 subscriptions per organisation.
 * The AR events are invoice.created / invoice.updated / invoice.archived / invoice.restored. THERE IS
 * NO PAYMENT-RECEIVED EVENT, and `invoice.updated` carries no receivable-payment id.
 *
 * SO A WEBHOOK IS A NUDGE, NOT A SOURCE. The poll (`Orders.PollExternalPayments`) stays authoritative
 * for cash; a verified `invoice.updated` on an invoice we issued means "something changed on this
 * invoice — probably a payment", and the right response is to run the poll for that provider NOW
 * rather than at the next scheduled tick. That is all the handler does. If the signature does not
 * verify, nothing runs — an unverified nudge could be used to make us hammer Bill.com's API.
 *
 * WHERE THE KEY LIVES. `PaymentProvider.CredentialsRef` on the `BillCom` row is otherwise unused (the
 * connector holds the API credential). The default `EnvironmentSecretResolver` turns a ref such as
 * `BILLCOM_BLUECYPRESS` into `Credentials.WebhookSecret` from `BILLCOM_BLUECYPRESS_WEBHOOK_SECRET`;
 * that is the subscription's `securityKey`. No key configured → every delivery is refused.
 *
 * WEB CRYPTO, NOT `node:crypto`, for the same reason the Stripe driver's `HmacSha256Hex` uses it: the
 * server tsconfig carries no Node types, and the same code must type-check wherever the package is
 * compiled.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

export const BILLCOM_SIGNATURE_HEADER = 'x-bill-sha-signature';

const encoder = new TextEncoder();

/** HMAC-SHA256 over the raw body, base64 — what BILL puts in the signature header. */
export async function SignBillComPayload(rawBody: string, securityKey: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', encoder.encode(securityKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)));
    let binary = '';
    for (const byte of mac) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** Constant-time comparison of the header against our own signature over the raw body. */
export async function VerifyBillComSignature(
    rawBody: string,
    headers: Record<string, string | undefined>,
    securityKey: string | null | undefined,
): Promise<{ Valid: boolean; Reason?: string }> {
    if (!securityKey) {
        return { Valid: false, Reason: 'No Bill.com webhook security key is configured for this provider (CredentialsRef → <REF>_WEBHOOK_SECRET).' };
    }
    const presented = headers[BILLCOM_SIGNATURE_HEADER] ?? headers[BILLCOM_SIGNATURE_HEADER.toUpperCase()];
    if (!presented) return { Valid: false, Reason: `Missing ${BILLCOM_SIGNATURE_HEADER} header.` };
    const expected = await SignBillComPayload(rawBody, securityKey);
    if (!constantTimeEqual(expected, presented.trim())) {
        return { Valid: false, Reason: 'Signature does not match the raw body under the configured security key.' };
    }
    return { Valid: true };
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export interface BillComWebhookEvent {
    /** e.g. `invoice.updated`, `invoice.archived`, `test`. */
    Type: string;
    /** The invoice (or other entity) id the event is about, when the payload names one. */
    EntityID: string | null;
    /** BILL's own event id, when present. */
    EventID: string | null;
    OccurredAt: string | null;
}

/**
 * Pull the little we need out of a notification. BILL's envelope shape has varied across releases, so
 * this reads the common spellings and returns null when none of them fit — the handler then still
 * nudges the poll, because a verified but unparseable notification is still a sign something changed.
 */
export function ParseBillComWebhookEvent(rawBody: string): BillComWebhookEvent | null {
    try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const body = parsed as Record<string, unknown>;
        const type = str(body.type ?? body.eventType ?? body.event ?? (body.metadata as Record<string, unknown> | undefined)?.type);
        if (!type) return null;
        const data = (body.data ?? body.payload ?? body.object ?? {}) as Record<string, unknown>;
        return {
            Type: type,
            EntityID: str(data.id ?? body.entityId ?? body.objectId ?? body.id),
            EventID: str(body.eventId ?? body.notificationId ?? body.messageId),
            OccurredAt: str(body.createdTime ?? body.timestamp ?? body.occurredAt),
        };
    } catch {
        return null;
    }
}

/** Does this event type plausibly mean cash moved on an invoice we hold? */
export function IsPaymentRelevant(eventType: string): boolean {
    const t = eventType.toLowerCase();
    return t.startsWith('invoice.') || t.includes('payment');
}

function str(v: unknown): string | null {
    return v == null ? null : String(v);
}
