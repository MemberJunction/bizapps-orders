/**
 * Deciding who a document goes to, and whether it should go at all — with no channel and no network.
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE SENDING. Sending is the easy half: MJ's communication
 * framework already owns providers, templates, retries and logging, and nothing here should
 * reimplement any of it. The half that goes wrong is everything BEFORE the send — working out which
 * address is the right one, noticing that there isn't one, and refusing to send a document that should
 * not exist yet. Those are decisions over plain data, so they are proven here with literals rather
 * than against a mail server.
 *
 * ═══ THE FAILURE THIS MODULE EXISTS TO PREVENT ═══
 *
 * A bill sent to the wrong person is worse than a bill not sent. The second is visible — somebody
 * chases it — while the first is silent, arrives at a real inbox, and discloses one customer's
 * commercial terms to another. So recipient resolution REFUSES rather than falls back: there is no
 * "if we can't find the billing contact, try the first person we have". Every candidate address must
 * be one somebody deliberately recorded against this customer for this purpose.
 *
 * SENDING A DRAFT IS THE OTHER ONE. A document rendered from an unconfirmed order carries real
 * numbers, a real customer name and no legal standing, and once it is a PDF in an accounts-payable
 * inbox nothing distinguishes it from a real invoice. {@link DecideDelivery} refuses those by status
 * rather than trusting every caller to check first.
 *
 * IDEMPOTENCY IS ADVISORY HERE, DELIBERATELY. {@link DeliveryIdempotencyKey} produces a stable key for
 * a (document, channel, address) triple so a caller CAN detect a repeat, but this module cannot know
 * whether a repeat is a mistake. Re-sending an invoice because the customer asked again is ordinary;
 * re-sending it because a workflow retried is not. The key makes the distinction available to whoever
 * has the context to make it.
 *
 * CONNECTS TO:
 *   SEAM:    ./BaseDeliveryChannel.ts — what actually sends
 *   CHANNEL: ./EmailDeliveryChannel.ts — the one shipped implementation
 *   DOC:     plans/archive/bizapps-orders-master.md §4.4
 */

/** How a document leaves the building. A union rather than an enum, per the house style. */
export type DeliveryChannelCode = 'Email';

/** One party a document could be sent to, as recorded against the customer. */
export interface DeliveryContact {
    /** The address itself — an email today, whatever the channel speaks tomorrow. */
    Address: string | null;
    /** For the display name on the message. */
    FullName?: string | null;
    /**
     * What this contact is FOR. Only contacts recorded for billing are eligible; see the header for
     * why there is no fallback to "any address we happen to hold".
     */
    Purpose: 'Billing' | 'Primary' | 'Other';
}

/** Everything the decision needs about the document being sent. */
export interface DeliverableFacts {
    /** `Invoice`, `Quote`, `CreditMemo`, `Statement`, … — free text, since new kinds are expected. */
    Kind: string;
    /** The document's own number, which becomes part of the subject and the idempotency key. */
    DocumentNumber: string;
    /** The originating order's status. A draft must not be delivered as though it were a bill. */
    SourceStatus: string;
    /** The company that is owed the money — the sender, from the customer's point of view. */
    IssuerName: string;
    /** What is owed. Zero is legitimate (a fully paid invoice, a credit memo). */
    AmountDue: number;
    /** Formatted for display by the caller's locale rules — this module never formats money. */
    AmountDueDisplay?: string;
    /** When it is due, already formatted. Null when the document carries no due date. */
    DueDateDisplay?: string | null;
}

/**
 * Order statuses whose document is NOT a bill and must not be delivered as one.
 *
 * `Voided` is the dangerous member. A voided order still renders — the reader deliberately produces a
 * document so somebody can look at what was voided — and a bill for money nobody owes is
 * indistinguishable from a real one once it has been emailed.
 */
const UNDELIVERABLE_STATUSES = new Set(['Draft', 'Voided', 'Cancelled', 'Canceled']);

/**
 * Statuses that produce a document which is real but is NOT an invoice.
 *
 * A quote is delivered happily; it just must not be described as a bill in the subject line, which is
 * why the kind rather than the status drives the wording.
 */
const QUOTE_STATUSES = new Set(['Quoted']);

export type DeliveryVerdict = 'Send' | 'Refuse';

export interface DeliveryDecision {
    Verdict: DeliveryVerdict;
    /** Why not, when not — written for the person who has to fix it. */
    Reason: string;
    /** A stable code so a caller can branch without parsing prose. */
    Code: 'OK' | 'NOT_DELIVERABLE' | 'NO_RECIPIENT' | 'NO_DOCUMENT';
}

/**
 * Whether this document may be sent to these recipients.
 *
 * Both halves have to hold, and the ORDER of the checks is chosen so the message names the more
 * fundamental problem first: an unconfirmed order with no billing contact should be reported as an
 * order that is not ready, not as a missing address, because fixing the address would not help.
 */
export function DecideDelivery(input: {
    Document: DeliverableFacts | null | undefined;
    Recipients: readonly DeliveryContact[];
}): DeliveryDecision {
    if (!input.Document) {
        return { Verdict: 'Refuse', Code: 'NO_DOCUMENT', Reason: 'there is no document to deliver' };
    }

    const status = (input.Document.SourceStatus ?? '').trim();
    if (UNDELIVERABLE_STATUSES.has(status)) {
        return {
            Verdict: 'Refuse',
            Code: 'NOT_DELIVERABLE',
            Reason:
                `${input.Document.DocumentNumber} comes from a ${status.toLowerCase()} order, so it is not a bill. ` +
                `Sending it would put a document that looks exactly like a real invoice in a customer's inbox.`,
        };
    }

    if (!ResolveRecipients(input.Recipients).length) {
        return {
            Verdict: 'Refuse',
            Code: 'NO_RECIPIENT',
            Reason:
                `${input.Document.DocumentNumber} has nobody to go to — no billing contact is recorded for this ` +
                `customer. Record one rather than sending to whichever address happens to be on file.`,
        };
    }

    return { Verdict: 'Send', Code: 'OK', Reason: 'the document is deliverable and has a recipient' };
}

/**
 * Narrow a customer's contacts to the ones this document may actually go to.
 *
 * BILLING CONTACTS ONLY, AND NO FALLBACK. The tempting rule — "billing contacts, or the primary
 * contact if there are none" — is how an invoice reaches a company's general enquiries inbox, or a
 * former employee. If nobody has said where bills go, the honest answer is that we do not know.
 *
 * De-duplicated case-insensitively, because the same address recorded twice sends the same invoice
 * twice, and a customer who receives two bills for one order will reasonably ask whether they owe
 * twice.
 */
export function ResolveRecipients(contacts: readonly DeliveryContact[]): DeliveryContact[] {
    const seen = new Set<string>();
    const out: DeliveryContact[] = [];

    for (const contact of contacts ?? []) {
        if (contact?.Purpose !== 'Billing') continue;
        const address = (contact.Address ?? '').trim();
        if (!address) continue;

        const key = address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...contact, Address: address });
    }

    return out;
}

/**
 * The subject line.
 *
 * THE DOCUMENT NUMBER COMES FIRST, before the issuer's name, because that is what a person searching
 * their inbox six weeks later actually types. It is also what an accounts-payable system keys on when
 * it scrapes subjects, and burying it behind a company name that may be truncated in a list view puts
 * it out of reach of both.
 *
 * A CREDIT MEMO IS NAMED AS ONE. A credit and an invoice differ by a sign that does not survive a
 * subject line, and "Invoice CN-1042 from Contoso" for a document that owes the customer money is the
 * kind of wrong that generates a support call rather than a payment.
 */
export function BuildSubject(document: DeliverableFacts): string {
    const kind = (document.Kind ?? '').toLowerCase();
    const noun =
        kind.includes('credit') ? 'Credit memo'
        : kind.includes('quote') || QUOTE_STATUSES.has(document.SourceStatus) ? 'Quote'
        : 'Invoice';

    const amount = document.AmountDueDisplay?.trim();
    const due = document.DueDateDisplay?.trim();

    // Amount and due date are appended only when BOTH are meaningful. A subject reading
    // "Invoice INV-1042 from Contoso — due" is worse than one that stops after the company name.
    const tail = amount && due ? ` — ${amount} due ${due}` : amount ? ` — ${amount}` : '';

    return `${noun} ${document.DocumentNumber} from ${document.IssuerName}${tail}`;
}

/**
 * A stable key for "this document, on this channel, to this address".
 *
 * DELIBERATELY EXCLUDES THE TIMESTAMP AND THE BODY. A re-render of the same document produces
 * byte-different HTML (a generated-on date, a rounding of the same figure) while being the same
 * delivery, so keying on content would make every retry look like a new send — which is exactly
 * backwards from what a caller wants to detect.
 *
 * Lower-cased throughout, so an address that differs only in case does not read as a second delivery.
 */
export function DeliveryIdempotencyKey(
    documentNumber: string,
    channel: DeliveryChannelCode,
    address: string,
): string {
    return [documentNumber.trim(), channel, address.trim()].join('|').toLowerCase();
}
