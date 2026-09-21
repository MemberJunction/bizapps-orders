/**
 * The poller's decisions, with no I/O. The failures these guard are the expensive kind: the same
 * Bill.com payment captured twice, a payment applied to the wrong order because one of its invoices
 * was unknown, and a status nobody anticipated being read as "cleared".
 */
import { describe, expect, it } from 'vitest';
import {
    AllocateInvoicePayments,
    ClassifyPaymentStatus,
    DecideExternalPayment,
    ExternalPaymentIdempotencyKey,
    TenderFor,
    type UnitRef,
} from '../ExternalPaymentBehavior.js';

describe('ClassifyPaymentStatus', () => {
    it('knows the vocabulary case-insensitively and admits what it does not know', () => {
        expect(ClassifyPaymentStatus('PAID')).toBe('Cleared');
        expect(ClassifyPaymentStatus('paid')).toBe('Cleared');
        expect(ClassifyPaymentStatus('SCHEDULED')).toBe('Pending');
        expect(ClassifyPaymentStatus('VOID')).toBe('Reversed');
        expect(ClassifyPaymentStatus('MYSTERY')).toBe('Unknown');
        expect(ClassifyPaymentStatus(null)).toBe('Unknown');
    });
});

describe('DecideExternalPayment', () => {
    const seen = (Status: string | null, PriorDisposition: Parameters<typeof DecideExternalPayment>[0]['PriorDisposition'] = null) => ({ ExternalPaymentRef: '0rp1', Status, PriorDisposition });

    it('a cleared payment never seen captures', () => expect(DecideExternalPayment(seen('PAID')).Action).toBe('Capture'));
    it('a pending payment holds', () => expect(DecideExternalPayment(seen('SCHEDULED')).Action).toBe('Hold'));
    it('an unknown status holds and says so', () => {
        const d = DecideExternalPayment(seen('MYSTERY'));
        expect(d.Action).toBe('Hold');
        expect(d.Reason).toMatch(/unknown/i);
        expect(d.Reason).toContain('MYSTERY');
    });
    it('a reversed payment never captured is ignored', () => expect(DecideExternalPayment(seen('VOID')).Action).toBe('Ignore'));
    it('already captured and still cleared ignores', () => expect(DecideExternalPayment(seen('PAID', 'Captured')).Action).toBe('Ignore'));
    it('already captured and now reversed needs a reversal', () => expect(DecideExternalPayment(seen('VOID', 'Captured')).Action).toBe('ReversalNeeded'));
    it('held then cleared captures on the later pass', () => expect(DecideExternalPayment(seen('PAID', 'Held')).Action).toBe('Capture'));
    it('unmatched then cleared tries again — the invoice may have been mapped since', () => expect(DecideExternalPayment(seen('PAID', 'Unmatched')).Action).toBe('Capture'));
    it('a reversal already flagged stays flagged', () => expect(DecideExternalPayment(seen('VOID', 'ReversalNeeded')).Action).toBe('Ignore'));
    it('a row a person set aside stays Ignored even when the rail says cleared', () => expect(DecideExternalPayment(seen('PAID', 'Ignored')).Action).toBe('Ignore'));
    it('a refused capture is tried again next pass — the configuration may have been fixed', () => expect(DecideExternalPayment(seen('PAID', 'Refused')).Action).toBe('Capture'));
});

describe('AllocateInvoicePayments', () => {
    const unit = (OrderHeaderID: string, OrderHeaderPaymentScheduleID: string | null = null, CompanyID = 'c'): UnitRef => ({
        OrderHeaderID, CompanyID, OrderHeaderPaymentScheduleID, BillToOrganizationID: 'org', BillToPersonID: null,
    });
    const units: Record<string, UnitRef> = { '00e1': unit('o1'), '00e2': unit('o2', 's2'), '00eB': unit('o3', null, 'other-company') };
    const lookup = (ref: string) => units[ref];

    it('fans one payment across the units its invoices belong to, in order', () => {
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 60 }, { ExternalInvoiceRef: '00e2', Amount: 40 }], lookup);
        expect(r.OK).toBe(true);
        if (!r.OK) return;
        expect(r.Allocations).toEqual([
            { OrderHeaderID: 'o1', Amount: 60, OrderHeaderPaymentScheduleID: null },
            { OrderHeaderID: 'o2', Amount: 40, OrderHeaderPaymentScheduleID: 's2' },
        ]);
        expect(r.Payer).toEqual({ BillToOrganizationID: 'org', BillToPersonID: null });
        expect(r.CompanyID).toBe('c');
        expect(r.Total).toBe(100);
    });

    it('one unknown invoice makes the whole payment Unmatched — nothing is captured', () => {
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 60 }, { ExternalInvoiceRef: '00eX', Amount: 40 }], lookup);
        expect(r.OK).toBe(false);
        if (!r.OK) { expect(r.Unmatched).toEqual(['00eX']); expect(r.Reason).toContain('00eX'); }
    });

    it('no invoices at all is Unmatched', () => expect(AllocateInvoicePayments([], lookup).OK).toBe(false));

    it('an order with both an organisation and a person bill-to pays as the organisation', () => {
        const both: UnitRef = { ...unit('o9'), BillToOrganizationID: 'org', BillToPersonID: 'person' };
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e9', Amount: 5 }], () => both);
        expect(r.OK && r.Payer).toEqual({ BillToOrganizationID: 'org', BillToPersonID: null });
        const personOnly: UnitRef = { ...unit('o9'), BillToOrganizationID: null, BillToPersonID: 'person' };
        const r2 = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e9', Amount: 5 }], () => personOnly);
        expect(r2.OK && r2.Payer).toEqual({ BillToOrganizationID: null, BillToPersonID: 'person' });
    });

    it('invoices for two receiving companies cannot be one payment', () => {
        const r = AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 1 }, { ExternalInvoiceRef: '00eB', Amount: 1 }], lookup);
        expect(r.OK).toBe(false);
        if (!r.OK) expect(r.Reason).toMatch(/compan/i);
    });

    it('a zero or negative share is refused rather than allocated', () => {
        expect(AllocateInvoicePayments([{ ExternalInvoiceRef: '00e1', Amount: 0 }], lookup).OK).toBe(false);
    });
});

describe('idempotency key and tender', () => {
    it('keys are lower-cased type code plus the rail id', () => {
        expect(ExternalPaymentIdempotencyKey('BillCom', '0rp1')).toBe('billcom:0rp1');
    });
    it('money BILL moved is ACH; money recorded in BILL follows its receivables type', () => {
        expect(TenderFor({ OnlinePayment: true, ReceivablesType: 'CHECK' })).toBe('ACH');
        expect(TenderFor({ OnlinePayment: false, ReceivablesType: 'CHECK' })).toBe('Check');
        expect(TenderFor({ OnlinePayment: false, ReceivablesType: 'CREDIT_CARD' })).toBe('CreditCard');
        expect(TenderFor({ OnlinePayment: false, ReceivablesType: 'WIRE' })).toBe('Wire');
        expect(TenderFor({ OnlinePayment: null, ReceivablesType: null })).toBe('ACH');
    });
});
