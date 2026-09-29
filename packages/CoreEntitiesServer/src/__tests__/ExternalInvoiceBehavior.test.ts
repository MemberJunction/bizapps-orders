/**
 * Turning one billing unit into what a rail sends, and deciding when it may be sent or withdrawn.
 * No I/O. The cases that matter are the refusals — a payload that does not tie, an instalment with
 * no frozen number, a cancel on money already applied — because each of those, let through, reaches
 * a customer or the ledger looking perfectly ordinary.
 */
import { describe, expect, it } from 'vitest';
import type { InvoiceDocument, InvoiceRow } from '../InvoiceBehavior.js';
import { MAX_DOCUMENT_NUMBER_LENGTH, ReissueDocumentNumber } from '../InvoiceBehavior.js';
import {
    BuildExternalInvoicePayload,
    ClassifyIssueFailure,
    DecideAdoption,
    DecideCancel,
    DecideInvoiceable,
    type ExternalInvoiceUnitFacts,
} from '../ExternalInvoiceBehavior.js';

const row = (n: number, amount: number, qty = 1, over: Partial<InvoiceRow> = {}): InvoiceRow => ({
    LineID: `l${n}`, LineNumber: n, ProductName: `P${n}`, ProductSKU: null, Description: null, Quantity: qty, UnitPrice: amount / qty,
    DiscountAmount: 0, Amount: amount, IncludedInParent: false, ServicePeriodStart: null, ServicePeriodEnd: null, ReversesOrderLineID: null, Children: [], ...over,
});

const doc = (over: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
    Kind: 'Invoice', DocumentNumber: 'ORD-1', OrderNumber: 'ORD-1', OrderHeaderID: 'o', OrderDate: '2026-09-01', DueDate: '2026-10-01', DaysUntilDue: 10,
    Status: 'Confirmed', PaymentStatusLabel: 'Unpaid', CompanyID: 'c', CompanyName: 'Co', Issuer: {} as never, BillTo: {} as never, ShipTo: null,
    TermsLabel: 'Net 30', ExternalDocumentNumber: null, ReversesOrderNumber: null, ReversalReason: null, Description: null,
    Rows: [row(1, 200, 2), row(2, 50.25)], Ladder: [], ListSubtotal: 250.25, DiscountTotal: 0, NetTotal: 250.25, ChargeTotal: 10, TaxTotal: 5,
    Gross: 265.25, AmountPaid: 0, AmountDue: 265.25, Payments: [], Notes: [], ...over,
});

const whole = (over: Partial<ExternalInvoiceUnitFacts> = {}): ExternalInvoiceUnitFacts => ({
    CompanyID: 'c', InstallmentNumber: 1, InstallmentCount: 1, DueDate: '2026-10-01', Amount: 265.25, DocumentNumber: null, ...over,
});

/**
 * Two ways the payload builder used to refuse orders it should have sent. Both were found by review
 * after the rail was already working end to end, and both park the unit as Failed for good.
 */
/**
 * An unconfirmed send leaves the claim in place. Automatic retry of that state is how one billing unit
 * became two invoices in a customer's inbox: the rail had committed the invoice and only the response
 * was lost, so "retry the timeout" meant "send it again".
 */
describe('DecideInvoiceable — an interrupted send', () => {
    const sending = (allowReissue: boolean) =>
        DecideInvoiceable({ OrderStatus: 'Confirmed', HasSchedule: false, ScheduleRowStatus: null, ScheduleRowNamed: false, ExistingStatus: 'Sending', AllowReissue: allowReissue });

    it('refuses an automatic retry and says how to check', () => {
        const d = sending(false);
        expect(d.Verdict).toBe('Refuse');
        expect(d.Code).toBe('IN_FLIGHT');
        expect(d.Reason).toMatch(/check the rail/i);
    });

    it('lets a person who has checked the rail re-issue deliberately', () => {
        expect(sending(true).Verdict).toBe('Issue');
    });
});

/**
 * Craig ruled on golive #242 (2026-09-22) and Jeremy agreed: an instalment is never re-issued.
 * Cancelling one raises a credit memo and a REPLACEMENT row with the next number. The old number
 * cannot come back anyway — Bill.com keeps it on the archived invoice and refuses a duplicate with
 * 422 — so offering a re-issue promised something that could only fail at the rail.
 */
describe('DecideInvoiceable — a cancelled unit', () => {
    const decide = (over: Partial<Parameters<typeof DecideInvoiceable>[0]> = {}) =>
        DecideInvoiceable({
            OrderStatus: 'Confirmed',
            HasSchedule: false,
            ScheduleRowStatus: null,
            ScheduleRowNamed: false,
            ExistingStatus: 'Canceled',
            AllowReissue: false,
            ...over,
        });

    it('never re-issues a cancelled instalment, even when asked', () => {
        const d = decide({ ScheduleRowNamed: true, HasSchedule: true, AllowReissue: true });
        expect(d.Verdict).toBe('Refuse');
        expect(d.Code).toBe('HAS_HISTORY');
        expect(d.Reason).toMatch(/never re-issued/i);
        expect(d.Reason).toMatch(/replacement row/i);
    });

    it('still lets a whole-order unit be re-issued deliberately — no ruling there yet', () => {
        expect(decide({ AllowReissue: true }).Verdict).toBe('Issue');
        expect(decide({ AllowReissue: false }).Verdict).toBe('Refuse');
    });
});

describe('BuildExternalInvoicePayload — refusals that should not happen', () => {
    it('sends a fractional-quantity order instead of drifting a cent per line', () => {
        // 2.5 × 13.332 stores as 33.33 a line. rowLines derives 13.33 back out, so summing the raw
        // products gave 99.98 against a unit amount of 99.99 — and with both sides cent-quantised the
        // half-cent tolerance is exact equality, so a correctly priced order was refused.
        const rows = [row(1, 33.33, 2.5), row(2, 33.33, 2.5), row(3, 33.33, 2.5)];
        const d = doc({ Rows: rows, ChargeTotal: 0, TaxTotal: 0, ListSubtotal: 99.99, NetTotal: 99.99, Gross: 99.99, AmountDue: 99.99 });
        const r = BuildExternalInvoicePayload(d, whole({ Amount: 99.99 }), '2026-09-22');
        expect(r.OK).toBe(true);
        if (r.OK) {
            expect(r.Payload.Amount).toBe(99.99);
            // Every line carries real money; the rail totals them the same way we just did.
            const total = r.Payload.Lines.reduce((s, l) => s + Math.round(l.Quantity * l.UnitPrice * 100) / 100, 0);
            expect(Math.round(total * 100) / 100).toBe(99.99);
        }
    });

    it('judges "already paid" on money applied to THIS unit, not the order-wide spread', () => {
        // On a split order the document builder spreads an order-level payment across companies pro
        // rata, so company A's payment showed up on company B's document and refused B's invoice.
        const d = doc({ AmountPaid: 120 });
        const spread = BuildExternalInvoicePayload(d, whole(), '2026-09-22');
        expect(spread.OK).toBe(false); // without the unit figure, the spread still refuses

        const unitTruth = BuildExternalInvoicePayload(d, whole(), '2026-09-22', 0);
        expect(unitTruth.OK).toBe(true); // nothing was captured against this unit, so it may be sent
    });

    it('still refuses when the money really was applied to this unit', () => {
        const r = BuildExternalInvoicePayload(doc({ AmountPaid: 0 }), whole(), '2026-09-22', 120);
        expect(r.OK).toBe(false);
        if (!r.OK) expect(r.Reason).toMatch(/120\.00 applied/);
    });
});

describe('BuildExternalInvoicePayload', () => {
    it('schedule-less: one line per row, plus charges and tax, tying to the cent', () => {
        const r = BuildExternalInvoicePayload(doc(), whole(), '2026-09-22');
        expect(r.OK).toBe(true);
        if (!r.OK) return;
        expect(r.Payload.Lines).toEqual([
            { Description: 'P1', Quantity: 2, UnitPrice: 100 },
            { Description: 'P2', Quantity: 1, UnitPrice: 50.25 },
            { Description: 'Charges', Quantity: 1, UnitPrice: 10 },
            { Description: 'Tax', Quantity: 1, UnitPrice: 5 },
        ]);
        expect(r.Payload).toMatchObject({ DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: '2026-10-01', Amount: 265.25 });
    });

    it('uses the row description when there is one, and folds a rollup child into its parent', () => {
        const parent = row(1, 150, 1, { Description: 'Bundle of things', Children: [row(3, 0, 1, { IncludedInParent: true })] });
        const r = BuildExternalInvoicePayload(
            doc({ Rows: [parent], ListSubtotal: 150, NetTotal: 150, ChargeTotal: 0, TaxTotal: 0, Gross: 150, AmountDue: 150 }),
            whole({ Amount: 150 }),
            '2026-09-22',
        );
        expect(r.OK && r.Payload.Lines).toEqual([{ Description: 'P1 — Bundle of things', Quantity: 1, UnitPrice: 150 }]);
    });

    it('a quantity whose unit price does not multiply back exactly collapses to one unit at the row amount', () => {
        const r = BuildExternalInvoicePayload(
            doc({ Rows: [row(1, 10, 3)], ListSubtotal: 10, NetTotal: 10, ChargeTotal: 0, TaxTotal: 0, Gross: 10, AmountDue: 10 }),
            whole({ Amount: 10 }),
            '2026-09-22',
        );
        expect(r.OK && r.Payload.Lines).toEqual([{ Description: 'P1 (×3)', Quantity: 1, UnitPrice: 10 }]);
    });

    it('instalment: a single line naming N of M, for the instalment amount, under the frozen number', () => {
        const r = BuildExternalInvoicePayload(doc(), whole({ InstallmentNumber: 2, InstallmentCount: 4, Amount: 66.31, DocumentNumber: 'ORD-1-2', DueDate: '2027-03-18' }), '2026-09-22');
        expect(r.OK && r.Payload).toMatchObject({
            DocumentNumber: 'ORD-1-2', DueDate: '2027-03-18', Amount: 66.31,
            Lines: [{ Description: 'Instalment 2 of 4 — order ORD-1', Quantity: 1, UnitPrice: 66.31 }],
        });
    });

    it('an instalment with no frozen number is refused — issue it first', () => {
        const r = BuildExternalInvoicePayload(doc(), whole({ InstallmentNumber: 2, InstallmentCount: 4, Amount: 66.31 }), '2026-09-22');
        expect(r.OK).toBe(false);
        expect(!r.OK && r.Reason).toMatch(/frozen/i);
    });

    it('refuses when the lines do not tie to the amount', () => {
        const r = BuildExternalInvoicePayload(doc(), whole({ Amount: 999 }), '2026-09-22');
        expect(r.OK).toBe(false);
        expect(!r.OK && r.Reason).toMatch(/does not tie/);
    });

    it('a partly paid order billed as a whole is refused — the gross would bill the customer twice', () => {
        const r = BuildExternalInvoicePayload(doc({ AmountPaid: 250, AmountDue: 15.25 }), whole(), '2026-09-22');
        expect(r.OK).toBe(false);
        expect(!r.OK && r.Reason).toMatch(/already has 250\.00 applied/);
    });

    it('a credit memo is not an invoice and is refused', () => {
        const r = BuildExternalInvoicePayload(doc({ Kind: 'Credit Memo' }), whole(), '2026-09-22');
        expect(r.OK).toBe(false);
    });
});

describe('DecideInvoiceable', () => {
    const base = { OrderStatus: 'Confirmed', HasSchedule: false, ScheduleRowStatus: null, ScheduleRowNamed: false, ExistingStatus: null, AllowReissue: false } as const;
    it('a confirmed schedule-less order with no history issues', () => expect(DecideInvoiceable(base).Code).toBe('OK'));
    it('a draft refuses', () => expect(DecideInvoiceable({ ...base, OrderStatus: 'Draft' }).Code).toBe('NOT_CONFIRMED'));
    it('a voided order refuses', () => expect(DecideInvoiceable({ ...base, OrderStatus: 'Voided' }).Code).toBe('NOT_CONFIRMED'));
    it('an order with a schedule must name the instalment', () => expect(DecideInvoiceable({ ...base, HasSchedule: true }).Code).toBe('NAME_THE_INSTALMENT'));
    it('a Scheduled instalment is not yet invoiceable', () =>
        expect(DecideInvoiceable({ ...base, HasSchedule: true, ScheduleRowNamed: true, ScheduleRowStatus: 'Scheduled' }).Code).toBe('INSTALMENT_NOT_INVOICED'));
    it('an Invoiced instalment issues', () =>
        expect(DecideInvoiceable({ ...base, HasSchedule: true, ScheduleRowNamed: true, ScheduleRowStatus: 'Invoiced' }).Code).toBe('OK'));
    it('Sent → AlreadySent; Sending → IN_FLIGHT; Canceled/Failed → HAS_HISTORY unless AllowReissue', () => {
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Sent' }).Verdict).toBe('AlreadySent');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Sending' }).Code).toBe('IN_FLIGHT');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Canceled' }).Code).toBe('HAS_HISTORY');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Failed' }).Code).toBe('HAS_HISTORY');
        expect(DecideInvoiceable({ ...base, ExistingStatus: 'Canceled', AllowReissue: true }).Code).toBe('OK');
    });
    it('history is checked before status, so a Sent draft (impossible, but) still reads AlreadySent', () =>
        expect(DecideInvoiceable({ ...base, OrderStatus: 'Draft', ExistingStatus: 'Sent' }).Verdict).toBe('AlreadySent'));
});

describe('DecideCancel', () => {
    it('only a Sent invoice can be cancelled', () => expect(DecideCancel({ Status: 'Failed', PaidAmountOnUnit: 0, ExternalDueAmount: null, ExternalTotal: null }).Code).toBe('NOT_SENT'));
    it('refuses when money has been applied to the unit', () =>
        expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 10, ExternalDueAmount: 100, ExternalTotal: 100 }).Code).toBe('HAS_PAYMENT'));
    it('refuses when BILL shows a payment we have not polled yet', () =>
        expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 0, ExternalDueAmount: 60, ExternalTotal: 100 }).Code).toBe('PAYMENT_PENDING_ON_RAIL'));
    it('allows an untouched Sent invoice, including when BILL could not be read', () => {
        expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 0, ExternalDueAmount: 100, ExternalTotal: 100 }).OK).toBe(true);
        expect(DecideCancel({ Status: 'Sent', PaidAmountOnUnit: 0, ExternalDueAmount: null, ExternalTotal: null }).OK).toBe(true);
    });
});

describe('ClassifyIssueFailure', () => {
    it('network and session are transient; a missing email is permanent', () => {
        expect(ClassifyIssueFailure('ETIMEDOUT')).toBe('Transient');
        expect(ClassifyIssueFailure('HTTP 503 from gateway')).toBe('Transient');
        expect(ClassifyIssueFailure('Bill.com requires a customer email')).toBe('Permanent');
        expect(ClassifyIssueFailure(null)).toBe('Permanent');
    });
    it('money and document numbers are not HTTP status codes', () => {
        expect(ClassifyIssueFailure('ORD-1 already has 500.00 applied; sending the full 1250.00 to the rail would bill the customer twice.')).toBe('Permanent');
        expect(ClassifyIssueFailure('INV-500 lines total 499.99, which does not tie to the unit amount 500.00.')).toBe('Permanent');
        expect(ClassifyIssueFailure('Bill.com refused the invoice (HTTP 503).')).toBe('Transient');
        expect(ClassifyIssueFailure('Request failed with status 429')).toBe('Transient');
    });
});

describe('DecideAdoption', () => {
    // A person is typing a reference off a Bill.com screen. These are the slips.
    const base = {
        ExternalInvoiceRef: '00e01ABC',
        DocumentNumber: 'ORD-1234-A',
        UnitAmount: 600,
        RailArchived: false,
        RailInvoiceNumber: 'ORD-1234-A',
        RailTotal: 600,
    };

    it('accepts the invoice this unit actually raised', () => {
        expect(DecideAdoption(base).OK).toBe(true);
    });

    it('REFUSES AN ARCHIVED INVOICE — the slip the total cannot catch', () => {
        // A previously cancelled invoice for this very unit ties to the penny by construction, so the
        // tie check waves it through. Adopting it marks the unit Sent against a withdrawn document and
        // the order is never billed.
        const d = DecideAdoption({ ...base, RailArchived: true });
        expect(d.OK).toBe(false);
        expect(d.Code).toBe('ARCHIVED');
        expect(d.Reason).toMatch(/never be billed/i);
    });

    it('refuses a reference belonging to a different document, even when the figure matches', () => {
        const d = DecideAdoption({ ...base, RailInvoiceNumber: 'ORD-9999' });
        expect(d.OK).toBe(false);
        expect(d.Code).toBe('WRONG_DOCUMENT');
    });

    it('does not mind how the rail cases or pads the number', () => {
        expect(DecideAdoption({ ...base, RailInvoiceNumber: '  ord-1234-a ' }).OK).toBe(true);
    });

    it('falls back to the total when the rail reports no invoice number', () => {
        expect(DecideAdoption({ ...base, RailInvoiceNumber: null }).OK).toBe(true);
        expect(DecideAdoption({ ...base, RailInvoiceNumber: '', RailTotal: 599 }).Code).toBe('TIE_FAILED');
    });

    it('still refuses a total that does not tie', () => {
        expect(DecideAdoption({ ...base, RailTotal: 600.02 }).Code).toBe('TIE_FAILED');
        expect(DecideAdoption({ ...base, RailTotal: 600.004 }).OK).toBe(true); // half a cent, as everywhere else
    });

    it('reports the archive before the figure — it is the reason the figure is unhelpful', () => {
        expect(DecideAdoption({ ...base, RailArchived: true, RailTotal: 1 }).Code).toBe('ARCHIVED');
    });

    it('names the provider in EVERY refusal, because no screen in this package says a vendor', () => {
        // The caller used to patch the name in afterwards with a case-sensitive String.replace, which
        // missed the one message opening with a capital and left it reading "The rail totals…".
        const named = { ...base, RailName: 'Bill.com Sandbox' };
        for (const over of [{ RailArchived: true }, { RailInvoiceNumber: 'ORD-9999' }, { RailTotal: 1 }]) {
            const d = DecideAdoption({ ...named, ...over });
            expect(d.OK).toBe(false);
            expect(d.Reason).toContain('Bill.com Sandbox');
            expect(d.Reason).not.toMatch(/\bthe rail\b/i);
        }
    });

    it('falls back to a neutral phrase when the provider has no name to give', () => {
        expect(DecideAdoption({ ...base, RailArchived: true }).Reason).toContain('the invoicing rail');
    });
});

describe('ReissueDocumentNumber', () => {
    // Craig's ruling on golive #242, and the only way a cancelled whole-order unit can be billed at
    // all: Bill.com keeps the archived invoice's number and refuses the duplicate with 422 (spike S4).
    it('leaves a first send alone', () => {
        expect(ReissueDocumentNumber('ORD-1234', 0)).toBe('ORD-1234');
    });

    it('suffixes the re-issue, and counts up if it happens again', () => {
        expect(ReissueDocumentNumber('ORD-1234', 1)).toBe('ORD-1234-R1');
        expect(ReissueDocumentNumber('ORD-1234', 2)).toBe('ORD-1234-R2');
    });

    it('sits after the company suffix on a split order', () => {
        expect(ReissueDocumentNumber('ORD-1234-A', 1)).toBe('ORD-1234-A-R1');
        expect(ReissueDocumentNumber('ORD-1234-B', 3)).toBe('ORD-1234-B-R3');
    });

    it('treats a negative count as a first send rather than emitting nonsense', () => {
        expect(ReissueDocumentNumber('ORD-1234', -1)).toBe('ORD-1234');
    });

    it('keeps the longest realistic form inside what this app can store', () => {
        // The binding constraint is our own column; ExternalInvoice.DocumentNumber is NVARCHAR(40).
        // A 30-character order number is already far beyond anything this app generates.
        const longest = ReissueDocumentNumber(`${'O'.repeat(30)}-A`, 9);
        expect(longest.length).toBeLessThanOrEqual(MAX_DOCUMENT_NUMBER_LENGTH);
        expect(ReissueDocumentNumber('ORD-1234-A', 1).length).toBe(13);
    });
});
