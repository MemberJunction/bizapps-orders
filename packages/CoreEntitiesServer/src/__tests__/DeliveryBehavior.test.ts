/**
 * Unit tests for deciding who a document goes to. No network, no database, no mail server.
 *
 * THE FAILURE THESE GUARD AGAINST IS SILENT, which is why they are worth having. A document that fails
 * to send is noticed — somebody chases the invoice. A document that sends to the WRONG person is not:
 * it arrives at a real inbox, looks entirely correct, and discloses one customer's commercial terms to
 * another. Nothing downstream catches it, and no amount of testing the mail provider would.
 *
 * So the interesting cases below are all refusals:
 *
 *   NO FALLBACK RECIPIENT. The tempting rule is "billing contacts, or the primary contact if there are
 *   none". That rule is how an invoice reaches a general-enquiries inbox or a former employee. If
 *   nobody has recorded where bills go, the honest answer is that we do not know.
 *
 *   A VOIDED ORDER STILL RENDERS. The reader deliberately produces a document for a voided order so
 *   somebody can look at what was voided — and once that document is a PDF in an accounts-payable
 *   inbox, nothing distinguishes it from a bill for money that is genuinely owed.
 *
 *   A CREDIT MEMO IS NOT AN INVOICE. They differ by a sign that does not survive a subject line, and
 *   "Invoice CN-1042" for a document that owes the customer money generates a support call rather
 *   than a payment.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildSubject,
    DecideDelivery,
    DeliveryIdempotencyKey,
    ResolveRecipients,
    type DeliverableFacts,
    type DeliveryContact,
} from '../DeliveryBehavior.js';

const billing = (address: string | null, name = 'A Person'): DeliveryContact => ({
    Address: address,
    FullName: name,
    Purpose: 'Billing',
});

const facts = (over: Partial<DeliverableFacts> = {}): DeliverableFacts => ({
    Kind: 'Invoice',
    DocumentNumber: 'INV-1042',
    SourceStatus: 'Confirmed',
    IssuerName: 'Contoso',
    AmountDue: 250,
    AmountDueDisplay: '$250.00',
    DueDateDisplay: '30 Sep 2026',
    ...over,
});

// ─── Recipients ────────────────────────────────────────────────────────────────────────────────

describe('ResolveRecipients — no fallback, ever', () => {
    it('takes the billing contacts', () => {
        const out = ResolveRecipients([billing('ap@contoso.com')]);
        expect(out.map((c) => c.Address)).toEqual(['ap@contoso.com']);
    });

    it('REFUSES to fall back to a primary contact', () => {
        // The whole point. A primary contact is not a billing contact, and guessing is how an invoice
        // reaches somebody who has no idea what to do with it — or should not have seen it.
        const out = ResolveRecipients([
            { Address: 'ceo@contoso.com', FullName: 'The CEO', Purpose: 'Primary' },
            { Address: 'someone@contoso.com', FullName: 'Somebody', Purpose: 'Other' },
        ]);
        expect(out).toEqual([]);
    });

    it('DE-DUPLICATES case-insensitively', () => {
        // The same address recorded twice sends the same invoice twice, and a customer who gets two
        // bills for one order will reasonably ask whether they owe twice.
        const out = ResolveRecipients([billing('AP@Contoso.com'), billing('ap@contoso.com')]);
        expect(out).toHaveLength(1);
    });

    it('drops blank and whitespace-only addresses', () => {
        expect(ResolveRecipients([billing(null), billing(''), billing('   ')])).toEqual([]);
    });

    it('trims an address that was recorded with padding', () => {
        expect(ResolveRecipients([billing('  ap@contoso.com  ')])[0].Address).toBe('ap@contoso.com');
    });

    it('survives an empty or absent list', () => {
        expect(ResolveRecipients([])).toEqual([]);
        expect(ResolveRecipients(undefined as unknown as DeliveryContact[])).toEqual([]);
    });
});

// ─── The decision ──────────────────────────────────────────────────────────────────────────────

describe('DecideDelivery — what may be sent', () => {
    it('sends a confirmed order to a billing contact', () => {
        const d = DecideDelivery({ Document: facts(), Recipients: [billing('ap@contoso.com')] });
        expect(d.Verdict).toBe('Send');
        expect(d.Code).toBe('OK');
    });

    it('REFUSES a voided order — the case that matters most', () => {
        // A voided order renders perfectly. Emailing it puts a bill for money nobody owes in an
        // accounts-payable inbox, where it is indistinguishable from a real one.
        const d = DecideDelivery({
            Document: facts({ SourceStatus: 'Voided' }),
            Recipients: [billing('ap@contoso.com')],
        });
        expect(d.Verdict).toBe('Refuse');
        expect(d.Code).toBe('NOT_DELIVERABLE');
    });

    it('REFUSES a draft', () => {
        const d = DecideDelivery({
            Document: facts({ SourceStatus: 'Draft' }),
            Recipients: [billing('ap@contoso.com')],
        });
        expect(d.Verdict).toBe('Refuse');
        expect(d.Code).toBe('NOT_DELIVERABLE');
    });

    it('refuses a cancelled order under either spelling', () => {
        for (const status of ['Cancelled', 'Canceled']) {
            const d = DecideDelivery({ Document: facts({ SourceStatus: status }), Recipients: [billing('a@b.com')] });
            expect(d.Code).toBe('NOT_DELIVERABLE');
        }
    });

    it('REFUSES when there is nobody to send to', () => {
        const d = DecideDelivery({ Document: facts(), Recipients: [] });
        expect(d.Verdict).toBe('Refuse');
        expect(d.Code).toBe('NO_RECIPIENT');
    });

    it('names the ORDER problem before the address problem', () => {
        // Both are wrong. Reporting the missing address would send somebody off to add a contact that
        // would not have helped — the order is not a bill.
        const d = DecideDelivery({ Document: facts({ SourceStatus: 'Draft' }), Recipients: [] });
        expect(d.Code).toBe('NOT_DELIVERABLE');
    });

    it('refuses when there is no document at all', () => {
        expect(DecideDelivery({ Document: null, Recipients: [billing('a@b.com')] }).Code).toBe('NO_DOCUMENT');
    });

    it('sends a quote happily — it is real, it is just not a bill', () => {
        const d = DecideDelivery({
            Document: facts({ SourceStatus: 'Quoted', Kind: 'Quote' }),
            Recipients: [billing('ap@contoso.com')],
        });
        expect(d.Verdict).toBe('Send');
    });
});

// ─── The subject ───────────────────────────────────────────────────────────────────────────────

describe('BuildSubject', () => {
    it('leads with the document number, which is what a person searches for', () => {
        expect(BuildSubject(facts())).toBe('Invoice INV-1042 from Contoso — $250.00 due 30 Sep 2026');
    });

    it('calls a CREDIT MEMO a credit memo', () => {
        // Not "Invoice CN-1042". The sign does not survive a subject line, and a customer told they
        // owe money they are in fact owed will call rather than pay.
        const subject = BuildSubject(facts({ Kind: 'Credit Memo', DocumentNumber: 'CN-1042' }));
        expect(subject).toMatch(/^Credit memo CN-1042 from Contoso/);
    });

    it('calls a quote a quote', () => {
        expect(BuildSubject(facts({ Kind: 'Quote', DocumentNumber: 'Q-77' }))).toMatch(/^Quote Q-77/);
    });

    it('stops cleanly when there is no due date, rather than trailing "due"', () => {
        const subject = BuildSubject(facts({ DueDateDisplay: null }));
        expect(subject).toBe('Invoice INV-1042 from Contoso — $250.00');
        expect(subject).not.toMatch(/due\s*$/);
    });

    it('stops after the company when there are no figures at all', () => {
        expect(BuildSubject(facts({ AmountDueDisplay: undefined, DueDateDisplay: null }))).toBe(
            'Invoice INV-1042 from Contoso',
        );
    });
});

// ─── Idempotency ───────────────────────────────────────────────────────────────────────────────

describe('DeliveryIdempotencyKey', () => {
    it('is stable across re-renders of the same document', () => {
        // Keyed on identity, NOT content. A re-render produces byte-different HTML (a new generated-on
        // date) while being the same delivery — keying on the body would make every retry look new,
        // which is exactly backwards from what a caller wants to detect.
        expect(DeliveryIdempotencyKey('INV-1042', 'Email', 'ap@contoso.com')).toBe(
            DeliveryIdempotencyKey('INV-1042', 'Email', 'ap@contoso.com'),
        );
    });

    it('ignores case and padding in the address', () => {
        expect(DeliveryIdempotencyKey('INV-1042', 'Email', ' AP@Contoso.com ')).toBe(
            DeliveryIdempotencyKey('INV-1042', 'Email', 'ap@contoso.com'),
        );
    });

    it('differs per document and per recipient', () => {
        const a = DeliveryIdempotencyKey('INV-1042', 'Email', 'ap@contoso.com');
        expect(a).not.toBe(DeliveryIdempotencyKey('INV-1043', 'Email', 'ap@contoso.com'));
        expect(a).not.toBe(DeliveryIdempotencyKey('INV-1042', 'Email', 'other@contoso.com'));
    });
});
