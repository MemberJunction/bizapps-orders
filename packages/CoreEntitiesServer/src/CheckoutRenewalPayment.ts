/**
 * Paying a renewal through the checkout — the "update your card" link (#289).
 *
 * When the renewal card is declined, or the bank demands the absent buyer authenticate, the charge
 * pass e-mails the buyer a signed link. The link opens the checkout in a mode that pays the OPEN
 * renewal order on-session: no new order, no re-pricing. The session's `DraftOrderID` points at that
 * confirmed renewal order, and the order having a renewal line is what identifies the mode — a
 * checkout never writes a line with `RenewsSubscriptionID`, only `Orders.SpawnRenewals` does. Paying
 * keeps the new card the same way a first purchase does (customer reuse, `setup_future_usage`) and
 * makes it the subscription's renewal card; the capture is the ordinary checkout capture, so
 * `ReconcilePaymentGatedGrants` restores any access the cutoff suspended.
 *
 * WHO PAYS. The renewal card's owner, when a person owns it: the buyer whose card was declined. On a
 * gift that is the buyer, not the beneficiary the renewal order bills (#683). The e-mail goes to
 * them, the session is theirs, the payment is booked to them and the new card is filed in their
 * wallet. The order's bill-to stays the beneficiary. A card an organization owns leaves the payer as
 * the order's bill-to, as before. The old card's gateway customer is reused only when it belongs to
 * the payer; otherwise the payer's own customer is found or made, so a card never joins someone
 * else's.
 *
 * ONLY A RENEWING SUBSCRIPTION. The link pays a renewal only while the subscription it names is
 * Active with automatic renewal on. A cancelled subscription, or one whose renewal was turned off,
 * has withdrawn the renewal the order is for (#683).
 *
 * THE LINK. `<base>/renew/<token>`, where the token is the renewal order id, the subscription id and
 * an expiry, signed with HMAC-SHA256. Nothing in it names a person. It expires no later than the
 * access cutoff plus `RENEWAL_LINK_GRACE_DAYS`, and it is single-use in effect: it is refused once the
 * order is paid or once a checkout session for the order has confirmed.
 *
 * THE SECRET comes from server configuration, never from the database or the repo. This package has
 * no Node globals, so the server bootstrap reads it and hands it over with
 * {@link ConfigureRenewalPaymentLinks}. Without one, links are neither signed nor accepted.
 *
 * CONNECTS TO:
 *   SESSION:  CheckoutSessionService (InitializeRenewalPaymentSession, OpenPaymentIntentForSession,
 *             CompleteCheckout, applySettledPaymentToOrder)
 *   CARD:     CheckoutSavedInstrument (ReplaceCardOnSubscriptionIDs)
 *   SENDER:   packages/Server/src/services/renewal-payment-link.ts (from the charge pass)
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { ToISODate } from '@mj-biz-apps/orders-entities';
import { AddDays } from './PaymentTermsBehavior.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

/**
 * Days a renewal link stays usable after the access cutoff. A renewal suspended at the cutoff can
 * still be paid for a week, and paying it restores access.
 */
export const RENEWAL_LINK_GRACE_DAYS = 7;

/** Days a link lasts from the due day when the access cutoff is switched off. */
export const RENEWAL_LINK_DAYS_WITHOUT_CUTOFF = 30;

/** A shorter secret is treated as no secret: an HMAC key should carry at least 256 bits. */
export const RENEWAL_LINK_MIN_SECRET_LENGTH = 32;

let configuredSecret: string | null = null;

/**
 * Hand this package the link-signing secret, from server configuration. A secret shorter than
 * {@link RENEWAL_LINK_MIN_SECRET_LENGTH} leaves links switched off.
 */
export function ConfigureRenewalPaymentLinks(options: { Secret: string | null | undefined }): void {
    const secret = options.Secret?.trim() ?? '';
    configuredSecret = secret.length >= RENEWAL_LINK_MIN_SECRET_LENGTH ? secret : null;
}

/** The configured secret, or null when renewal links are switched off. */
export function RenewalPaymentLinkSecret(): string | null {
    return configuredSecret;
}

export interface RenewalPaymentTokenClaims {
    OrderID: string;
    SubscriptionID: string;
    ExpiresAt: Date;
}

export type RenewalPaymentTokenFailure = 'malformed' | 'signature' | 'expired' | 'not-configured';

export interface RenewalPaymentTokenAccepted extends RenewalPaymentTokenClaims {
    Valid: true;
}

export interface RenewalPaymentTokenRefused {
    Valid: false;
    Reason: RenewalPaymentTokenFailure;
}

export type RenewalPaymentTokenCheck = RenewalPaymentTokenAccepted | RenewalPaymentTokenRefused;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
        const bytes = new Uint8Array(new ArrayBuffer(binary.length));
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/**
 * Sign a renewal link token: `<payload>.<signature>`, both base64url, where the payload is the order
 * id, the subscription id and the expiry in Unix seconds.
 */
export async function SignRenewalPaymentToken(claims: RenewalPaymentTokenClaims, secret: string): Promise<string> {
    const orderID = RequireUUID(claims.OrderID, 'OrderID').toLowerCase();
    const subscriptionID = RequireUUID(claims.SubscriptionID, 'SubscriptionID').toLowerCase();
    const expires = Math.floor(claims.ExpiresAt.getTime() / 1000);
    if (!Number.isFinite(expires)) throw new Error('A renewal link needs an expiry.');
    const payload = toBase64Url(new TextEncoder().encode(`${orderID}.${subscriptionID}.${expires}`));
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), new TextEncoder().encode(payload)));
    return `${payload}.${toBase64Url(signature)}`;
}

/**
 * Check a renewal link token. The signature is checked before the payload is read, with the
 * constant-time comparison `crypto.subtle.verify` makes, and an expired token is refused even when
 * its signature is good.
 */
export async function VerifyRenewalPaymentToken(
    token: string | null | undefined,
    secret: string | null,
    now: Date = new Date(),
): Promise<RenewalPaymentTokenCheck> {
    if (!secret) return { Valid: false, Reason: 'not-configured' };
    const parts = (token ?? '').trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].length > 400 || parts[1].length > 100) {
        return { Valid: false, Reason: 'malformed' };
    }
    const signature = fromBase64Url(parts[1]);
    if (!signature) return { Valid: false, Reason: 'malformed' };
    const good = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signature, new TextEncoder().encode(parts[0]));
    if (!good) return { Valid: false, Reason: 'signature' };

    const payloadBytes = fromBase64Url(parts[0]);
    const fields = payloadBytes ? new TextDecoder().decode(payloadBytes).split('.') : [];
    if (fields.length !== 3 || !UUID.test(fields[0]) || !UUID.test(fields[1]) || !/^\d{1,12}$/.test(fields[2])) {
        return { Valid: false, Reason: 'malformed' };
    }
    const expiresAt = new Date(Number(fields[2]) * 1000);
    if (expiresAt.getTime() <= now.getTime()) return { Valid: false, Reason: 'expired' };
    return { Valid: true, OrderID: fields[0], SubscriptionID: fields[1], ExpiresAt: expiresAt };
}

/**
 * When a renewal link stops working: the end (UTC) of the day `RENEWAL_LINK_GRACE_DAYS` after the
 * access cutoff, counted from the renewal's due day. With the cutoff off, the end of the day
 * `RENEWAL_LINK_DAYS_WITHOUT_CUTOFF` after the due day.
 */
export function RenewalPaymentLinkExpiresAt(dueDay: string, cutoffDaysPastDue: number | null): Date {
    const days = cutoffDaysPastDue == null ? RENEWAL_LINK_DAYS_WITHOUT_CUTOFF : cutoffDaysPastDue + RENEWAL_LINK_GRACE_DAYS;
    const lastDay = AddDays(dueDay, days);
    if (!lastDay) throw new Error(`'${dueDay}' is not a day.`);
    return new Date(`${lastDay}T23:59:59Z`);
}

/** The link the buyer is sent: `<base>/renew/<token>`. */
export function RenewalPaymentLinkUrl(baseUrl: string, token: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/renew/${encodeURIComponent(token)}`;
}

/** A renewal order as the pay-renewal mode reads it. */
export interface RenewalPaymentOrder {
    OrderID: string;
    OrderNumber: string;
    Status: string;
    CompanyID: string;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    BillToPersonID: string | null;
    BillToOrganizationID: string | null;
    /** `YYYY-MM-DD`, the next unpaid due day; null when nothing is owed. */
    NextDueDate: string | null;
    /** The subscriptions the order's renewal lines renew. Empty means the order is not a renewal. */
    SubscriptionIDs: string[];
    /** What the order renews, for the page and the e-mail: the renewal lines' product names. */
    Description: string;
    SubscriptionNumber: string | null;
    /** The checkout widget that sold the subscription, which the pay-renewal page is shown in. */
    SourceCheckoutWidgetID: string | null;
    /** The renewal card's gateway customer and provider, so the new card joins the same customer. */
    RenewalCardProviderCustomerRef: string | null;
    RenewalCardPaymentProviderID: string | null;
    /** Who owns the renewal card's wallet entry: a person, else an organization. */
    RenewalCardOwnerPersonID: string | null;
    RenewalCardOwnerOrganizationID: string | null;
    /** The renewed subscriptions' state, for the refusal rule. */
    Subscriptions: Array<{ ID: string; Status: string; AutoRenew: boolean }>;
    /**
     * Who pays through the link: the renewal card's owning person, else the order's bill-to. The
     * e-mail, the session, the payment and the new card all follow this, never the beneficiary.
     */
    PayerPersonID: string | null;
    /** Set only when no person pays: the order's bill-to organization. */
    PayerOrganizationID: string | null;
}

/**
 * Who pays a renewal through the link: the person who owns the renewal card, else the order's
 * bill-to person, else its bill-to organization. See the header.
 */
export function RenewalPayer(
    order: Pick<RenewalPaymentOrder, 'BillToPersonID' | 'BillToOrganizationID' | 'RenewalCardOwnerPersonID'>,
): { PersonID: string | null; OrganizationID: string | null } {
    const person = order.RenewalCardOwnerPersonID ?? order.BillToPersonID;
    return { PersonID: person, OrganizationID: person ? null : order.BillToOrganizationID };
}

/**
 * Whether the old renewal card's gateway customer belongs to the payer, so the new card may join it.
 * A person's card belongs to that person; an organization's card to a payer that is the
 * organization itself.
 */
export function PayerOwnsRenewalCustomer(
    order: Pick<RenewalPaymentOrder, 'RenewalCardOwnerPersonID' | 'RenewalCardOwnerOrganizationID' | 'PayerPersonID' | 'PayerOrganizationID'>,
): boolean {
    const same = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    if (order.RenewalCardOwnerPersonID) return same(order.RenewalCardOwnerPersonID, order.PayerPersonID);
    return !order.PayerPersonID && same(order.RenewalCardOwnerOrganizationID, order.PayerOrganizationID);
}

/**
 * Load a renewal order with what the pay-renewal mode needs, or null when the order does not exist.
 * An order with no renewal line comes back with no `SubscriptionIDs`.
 */
export async function LoadRenewalPaymentOrder(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RenewalPaymentOrder | null> {
    const id = RequireUUID(orderID, 'OrderHeaderID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const orders = await rv.RunView<{
        ID: string;
        OrderNumber: string;
        Status: string;
        CompanyID: string;
        TotalGross: number | null;
        AmountPaid: number | null;
        Balance: number | null;
        BillToPersonID: string | null;
        BillToOrganizationID: string | null;
        NextDueDate: unknown;
    }>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Headers',
            ExtraFilter: `ID = '${id}'`,
            Fields: ['ID', 'OrderNumber', 'Status', 'CompanyID', 'TotalGross', 'AmountPaid', 'Balance', 'BillToPersonID', 'BillToOrganizationID', 'NextDueDate'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const order = orders.Results?.[0];
    if (!order) return null;

    const lines = await rv.RunView<{ RenewsSubscriptionID: string | null; Product: string | null }>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Lines',
            ExtraFilter: `OrderHeaderID = '${id}' AND RenewsSubscriptionID IS NOT NULL`,
            Fields: ['RenewsSubscriptionID', 'Product'],
            OrderBy: 'LineNumber',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const renewalLines = lines.Results ?? [];
    const subscriptionIDs = [...new Set(renewalLines.map((l) => l.RenewsSubscriptionID).filter((s): s is string => !!s))];

    const out: RenewalPaymentOrder = {
        OrderID: order.ID,
        OrderNumber: order.OrderNumber,
        Status: order.Status,
        CompanyID: order.CompanyID,
        TotalGross: Number(order.TotalGross ?? 0),
        AmountPaid: Number(order.AmountPaid ?? 0),
        Balance: Number(order.Balance ?? 0),
        BillToPersonID: order.BillToPersonID,
        BillToOrganizationID: order.BillToOrganizationID,
        NextDueDate: ToISODate(order.NextDueDate),
        SubscriptionIDs: subscriptionIDs,
        Description: [...new Set(renewalLines.map((l) => l.Product).filter((p): p is string => !!p))].join(', '),
        SubscriptionNumber: null,
        SourceCheckoutWidgetID: null,
        RenewalCardProviderCustomerRef: null,
        RenewalCardPaymentProviderID: null,
        RenewalCardOwnerPersonID: null,
        RenewalCardOwnerOrganizationID: null,
        Subscriptions: [],
        PayerPersonID: null,
        PayerOrganizationID: null,
    };
    const payer = () => {
        const p = RenewalPayer(out);
        out.PayerPersonID = p.PersonID;
        out.PayerOrganizationID = p.OrganizationID;
        return out;
    };
    if (!subscriptionIDs.length) return payer();

    // The first renewed subscription: its number, the checkout that sold it, and its renewal card.
    const subscriptions = await rv.RunView<{
        ID: string;
        SubscriptionNumber: string;
        OrderLineID: string | null;
        DefaultCustomerPaymentMethodID: string | null;
        Status: string;
        AutoRenew: boolean | number | null;
    }>(
        {
            EntityName: 'MJ_BizApps_Orders: Subscriptions',
            ExtraFilter: `ID IN (${RequireUUIDs(subscriptionIDs, 'SubscriptionID').map((s) => `'${s}'`).join(',')})`,
            Fields: ['ID', 'SubscriptionNumber', 'OrderLineID', 'DefaultCustomerPaymentMethodID', 'Status', 'AutoRenew'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    out.Subscriptions = (subscriptions.Results ?? []).map((s) => ({ ID: s.ID, Status: s.Status, AutoRenew: s.AutoRenew === true || s.AutoRenew === 1 }));
    const first = (subscriptions.Results ?? []).find((s) => s.ID.toLowerCase() === subscriptionIDs[0].toLowerCase()) ?? subscriptions.Results?.[0];
    if (!first) return payer();
    out.SubscriptionNumber = first.SubscriptionNumber;

    if (first.OrderLineID) {
        const source = await rv.RunView<{ SourceCheckoutWidgetID: string | null }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Headers',
                ExtraFilter: `ID IN (SELECT OrderHeaderID FROM __mj_BizAppsOrders.OrderLine WHERE ID = '${RequireUUID(first.OrderLineID, 'OrderLineID')}')`,
                Fields: ['SourceCheckoutWidgetID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        out.SourceCheckoutWidgetID = source.Results?.[0]?.SourceCheckoutWidgetID ?? null;
    }
    if (first.DefaultCustomerPaymentMethodID) {
        const wallet = await rv.RunView<{ OwnerPersonID: string | null; OwnerOrganizationID: string | null }>(
            {
                EntityName: 'MJ_BizApps_Orders: Customer Payment Methods',
                ExtraFilter: `ID = '${RequireUUID(first.DefaultCustomerPaymentMethodID, 'CustomerPaymentMethodID')}'`,
                Fields: ['OwnerPersonID', 'OwnerOrganizationID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        out.RenewalCardOwnerPersonID = wallet.Results?.[0]?.OwnerPersonID ?? null;
        out.RenewalCardOwnerOrganizationID = wallet.Results?.[0]?.OwnerOrganizationID ?? null;
        const card = await rv.RunView<{ PaymentProviderID: string | null; ProviderCustomerRef: string | null }>(
            {
                EntityName: 'MJ_BizApps_Orders: Payment Details',
                ExtraFilter: `ID IN (SELECT PaymentDetailID FROM __mj_BizAppsOrders.CustomerPaymentMethod WHERE ID = '${RequireUUID(first.DefaultCustomerPaymentMethodID, 'CustomerPaymentMethodID')}')`,
                Fields: ['PaymentProviderID', 'ProviderCustomerRef'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        out.RenewalCardPaymentProviderID = card.Results?.[0]?.PaymentProviderID ?? null;
        out.RenewalCardProviderCustomerRef = card.Results?.[0]?.ProviderCustomerRef ?? null;
    }
    return payer();
}

/** True when a checkout session for this order has already confirmed — the link has been used. */
export async function RenewalPaymentAlreadyConfirmed(orderID: string, provider: IMetadataProvider, user: UserInfo): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const found = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ_BizApps_Orders: Checkout Sessions',
            ExtraFilter: `DraftOrderID = '${RequireUUID(orderID, 'OrderHeaderID')}' AND Status = 'Confirmed'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (found.Results ?? []).length > 0;
}

/**
 * Why a renewal order cannot be paid through the link, or null when it can. The rules, in order:
 * the order exists; it renews the subscription the link names; that subscription is Active with
 * automatic renewal on; it is a confirmed order; it still owes money; and no checkout session has
 * already paid it through a link.
 */
export function RenewalPaymentRefusal(
    order: Pick<RenewalPaymentOrder, 'Status' | 'Balance' | 'SubscriptionIDs' | 'Subscriptions'> | null,
    subscriptionID: string,
    alreadyConfirmed: boolean,
): string | null {
    if (!order) return 'This renewal could not be found.';
    if (!order.SubscriptionIDs.some((s) => s.toLowerCase() === subscriptionID.toLowerCase())) {
        return 'This payment link does not match its renewal. Use the link from your latest renewal notice, or contact us to renew.';
    }
    const subscription = order.Subscriptions.find((s) => s.ID.toLowerCase() === subscriptionID.toLowerCase());
    if (!subscription || subscription.Status !== 'Active' || !subscription.AutoRenew) {
        return 'This subscription is no longer set to renew, so this renewal cannot be paid here. Contact us to renew.';
    }
    if (order.Status !== 'Confirmed') return 'This renewal can no longer be paid here. Contact us to renew.';
    if (!(order.Balance > 0.005)) return 'This renewal is already paid.';
    if (alreadyConfirmed) return 'This renewal has already been paid through this link.';
    return null;
}

/** The message a buyer sees for a token that does not check out. Never says which check failed beyond expiry. */
export function RenewalPaymentTokenMessage(reason: RenewalPaymentTokenFailure): string {
    switch (reason) {
        case 'expired':
            return 'This payment link has expired. Contact us to renew.';
        case 'not-configured':
            return 'Renewal payment links are not available at the moment. Please try again later, or contact us to renew.';
        default:
            return 'This payment link is not valid.';
    }
}
