/**
 * Where a checkout came from, as the embedding host states it (for example a chat or voice agent
 * that opens the checkout inside its own panel, with the conversation it came from).
 *
 * Kept on the checkout session (`MetadataJSON.Attribution`), which points at the order once it
 * confirms (`DraftOrderID`). It is reporting data: an attribution that cannot be read is dropped,
 * never a reason to refuse a buyer's checkout. Pure, so the browser and the server share it.
 */
export interface CheckoutAttribution {
    /** The channel, e.g. `voice_agent`. Letters, digits and `_ - . :`, at most 50 characters. */
    Source: string;
    /** The host's own reference, e.g. a conversation id. At most 200 printable characters. */
    Reference: string | null;
}

export const MAX_ATTRIBUTION_SOURCE_LENGTH = 50;
export const MAX_ATTRIBUTION_REFERENCE_LENGTH = 200;

const SOURCE = /^[A-Za-z0-9_.:-]+$/;
// Printable, no control characters: it ends up in reports and exports.
const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/;

/** The attribution to keep, or null when there is none or it cannot be read. */
export function NormalizeCheckoutAttribution(input: unknown): CheckoutAttribution | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const raw = input as Record<string, unknown>;
    const source = typeof raw['source'] === 'string' ? raw['source'].trim() : '';
    if (!source || source.length > MAX_ATTRIBUTION_SOURCE_LENGTH || !SOURCE.test(source)) return null;
    const refRaw = typeof raw['reference'] === 'string' ? raw['reference'].trim() : '';
    const reference = refRaw && refRaw.length <= MAX_ATTRIBUTION_REFERENCE_LENGTH && PRINTABLE.test(refRaw) ? refRaw : null;
    return { Source: source, Reference: reference };
}
