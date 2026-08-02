/**
 * BaseDeliveryChannel — the seam a document leaves the building through.
 *
 * WHY A SEAM AT ALL, WHEN EMAIL IS THE ONLY CHANNEL TODAY. Because the callers are already plural and
 * the second channel is already named. §4.4 of the plan settles delivery as "thin send-via-email of
 * the rendered order first, with an Action-plugin seam", and lists a bill-presentment service as the
 * adapter that arrives when a channel needs it. A hard-coded `sendEmail()` would have to be unpicked
 * from every caller on the day that happens; a class keyed by channel code is a metadata row and a
 * subclass, which is the same shape `BasePaymentProvider` uses for gateways and for the same reason.
 *
 * IT IS DOCUMENT-AGNOSTIC ON PURPOSE. Nothing below knows what an invoice is. A channel takes a
 * rendered document — a subject, a body, a recipient — and gets it to that recipient. That is what
 * makes this reusable for statements, dunning notices, order confirmations and receipts without any
 * of them teaching the channel a new noun. The KIND of document is carried as free text purely so a
 * channel can log it or route on it, never so it can branch on it.
 *
 * IT DOES NOT RENDER, AND IT DOES NOT DECIDE. Rendering belongs to whoever owns the document's shape;
 * deciding whether to send belongs to `DeliveryBehavior`. A channel that rendered would need one
 * template per document type and would become the place every future document type is edited. A
 * channel that decided would put "is this order confirmed?" in the mail layer.
 *
 * REFUSAL IS NOT AN EXCEPTION — the same contract the payment drivers follow. A rejected address is a
 * normal outcome of asking; a mail server being unreachable is not. Only the second throws, because a
 * caller that has to read exception messages to tell "bad address" from "provider down" will
 * eventually treat one as the other, and the two want completely different responses.
 *
 * CONNECTS TO:
 *   PURE:    ./DeliveryBehavior.ts — who it goes to, and whether it should
 *   SHIPPED: ./EmailDeliveryChannel.ts
 *   LOOKUP:  ./DeliveryResolver.ts
 *   DOC:     plans/bizapps-orders-master.md §4.4
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { DeliveryChannelCode, DeliveryContact } from './DeliveryBehavior.js';

/** A document that has already been rendered and is ready to leave. */
export interface DeliverableDocument {
    /** `Invoice`, `Statement`, `OrderConfirmation`, … — for logging and routing, never for branching. */
    Kind: string;
    /** The document's own number. Appears in the subject and in every log line about this send. */
    DocumentNumber: string;
    /** Already built by `BuildSubject` or supplied by the caller. */
    Subject: string;
    /** The rendered document. HTML today; a channel that cannot render HTML uses `BodyPlain`. */
    BodyHtml: string;
    /**
     * A plain-text alternative. OPTIONAL, and its absence is not fatal — but a channel sending only
     * HTML gives spam filters one of their strongest signals, so callers are encouraged to supply one.
     */
    BodyPlain?: string;
}

/** Where a document is going, and who it is from. */
export interface DeliveryAddressing {
    To: DeliveryContact[];
    CC?: string[];
    BCC?: string[];
    /** The sending address. Null lets the channel fall back to its provider's configured default. */
    From?: string | null;
    FromName?: string | null;
}

export interface DeliveryResult {
    Success: boolean;
    /** Why not, when not — in the provider's words where it has any. */
    Reason?: string;
    /** The provider's own message id, for correlating with its logs. */
    ProviderMessageID?: string;
    /** Addresses the channel actually accepted, which may be fewer than were offered. */
    Delivered: string[];
}

/** Everything a channel needs that is not the document itself. */
export interface DeliveryContext {
    Provider: IMetadataProvider;
    User: UserInfo;
    /**
     * Render without sending, for a preview screen. A channel MUST honour this — a preview that sends
     * is the worst possible bug in a mail path, because it is invisible on the sending side.
     */
    PreviewOnly?: boolean;
}

/**
 * The channel contract.
 *
 * Registered against this base by channel code:
 *
 * ```ts
 * @RegisterClass(BaseDeliveryChannel, 'Email')
 * export class EmailDeliveryChannel extends BaseDeliveryChannel { … }
 * ```
 *
 * NOT DECORATED ITSELF, matching `BasePaymentProvider`. MJ's ClassFactory instantiates the base when
 * no key matches, so a self-registration would make "nobody registered a channel" indistinguishable
 * from "the channel refused" — `DeliveryResolver` checks for exactly that.
 */
export class BaseDeliveryChannel {
    /** Which channel this is. Set by the resolver; the ClassFactory constructs with no arguments. */
    public Code!: DeliveryChannelCode;

    /**
     * Send it. The default REFUSES rather than reporting a success nobody can verify.
     *
     * A channel author who forgets to override should find out from a clear message, not from a
     * customer who never received their invoice and a log full of successes.
     */
    public async Deliver(
        _document: DeliverableDocument,
        _addressing: DeliveryAddressing,
        _context: DeliveryContext,
    ): Promise<DeliveryResult> {
        return {
            Success: false,
            Delivered: [],
            Reason:
                `The '${this.Code ?? 'unknown'}' delivery channel has no implementation. This is a channel ` +
                `that was never registered, not a message that was rejected — check the @RegisterClass key ` +
                `against the channel code.`,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadBaseDeliveryChannel(): void {
    // intentionally empty
}
