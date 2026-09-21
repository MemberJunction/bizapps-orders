/**
 * Turning one billing unit into what a rail sends, and deciding when it may be sent or withdrawn.
 * No I/O. The cases that matter are the refusals — a payload that does not tie, an instalment with
 * no frozen number, a cancel on money already applied — because each of those, let through, reaches
 * a customer or the ledger looking perfectly ordinary.
 */
import { describe, expect, it } from 'vitest';
import type { InvoiceDocument, InvoiceRow } from '../InvoiceBehavior.js';
import {
    BuildExternalInvoicePayload,
    ClassifyIssueFailure,
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
