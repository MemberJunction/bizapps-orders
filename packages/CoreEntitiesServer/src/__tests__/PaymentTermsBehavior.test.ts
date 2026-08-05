/**
 * PaymentTermsBehavior — when an order is due.
 *
 * The reason this module exists is worth restating at the top of its tests: `DueDate` was null on
 * every order, so `Orders.GetOverdueWorklist` returned zero rows against 67 orders carrying an
 * unpaid balance. The collections surface reported a quiet afternoon because its only input was
 * never populated. Every assertion here is about that column ending up with a defensible value.
 */
import { describe, expect, it } from 'vitest';
import {
    AddDays,
    BestCustomerTerms,
    CustomerTermsApply,
    ResolveDueDate,
    type CustomerTermsFacts,
    type TermsResolutionInput,
} from '../PaymentTermsBehavior.js';

const NET30 = 'a0000000-0000-0000-0000-000000000030';
const NET60 = 'a0000000-0000-0000-0000-000000000060';
const RECEIPT = 'a0000000-0000-0000-0000-000000000000';
const CO_A = 'c0000000-0000-0000-0000-00000000000a';
const CO_B = 'c0000000-0000-0000-0000-00000000000b';

const termsByID = new Map([
    [NET30.toLowerCase(), { PaymentTermsTypeID: NET30, NetDays: 30 }],
    [NET60.toLowerCase(), { PaymentTermsTypeID: NET60, NetDays: 60 }],
    [RECEIPT.toLowerCase(), { PaymentTermsTypeID: RECEIPT, NetDays: 0 }],
]);

const customer = (over: Partial<CustomerTermsFacts> = {}): CustomerTermsFacts => ({
    PaymentTermsTypeID: NET60,
    NetDays: 60,
    CompanyID: null,
    StartedAt: null,
    EndedAt: null,
    Status: 'Active',
    ...over,
});

const input = (over: Partial<TermsResolutionInput> = {}): TermsResolutionInput => ({
    StatedDueDate: null,
    StatedPaymentTermsTypeID: null,
    OrderDate: '2026-07-01',
    CompanyID: CO_A,
    CustomerTerms: [],
    CompanyDefault: null,
    TermsByID: termsByID,
    ...over,
});

describe('date arithmetic', () => {
    it('adds days without drifting across a DST boundary', () => {
        expect(AddDays('2026-03-01', 30)).toBe('2026-03-31');
        expect(AddDays('2026-07-01', 30)).toBe('2026-07-31');
    });

    it('treats zero days as the order date itself', () => {
        expect(AddDays('2026-07-01', 0)).toBe('2026-07-01');
    });

    it('returns null for an unusable date rather than inventing one', () => {
        expect(AddDays('not a date', 30)).toBeNull();
    });
});

describe('the walk', () => {
    it('takes a STATED due date and never recomputes it', () => {
        // This is where a contracts app lands: it supplies the answer Orders cannot derive.
        const result = ResolveDueDate(input({ StatedDueDate: '2026-09-15', StatedPaymentTermsTypeID: NET30 }));
        expect(result.DueDate).toBe('2026-09-15');
        expect(result.Source).toBe('StatedDueDate');
        // Recorded as stated, so the next save knows not to move it.
        expect(result.WasStated).toBe(true);
    });

    it('derives from STATED terms when no date was given', () => {
        const result = ResolveDueDate(input({ StatedPaymentTermsTypeID: NET30 }));
        expect(result.DueDate).toBe('2026-07-31');
        expect(result.Source).toBe('StatedTerms');
        expect(result.PaymentTermsTypeID).toBe(NET30);
        expect(result.WasStated).toBe(false);
    });

    it('falls through when stated terms cannot be resolved, rather than refusing the sale', () => {
        // The unresolvable id is still on the order, so the mistake is visible without holding up
        // the money.
        const result = ResolveDueDate(input({ StatedPaymentTermsTypeID: 'a0000000-0000-0000-0000-0000000000ff' }));
        expect(result.Source).toBe('DueOnReceipt');
    });

    it('uses the CUSTOMER terms next', () => {
        const result = ResolveDueDate(input({ CustomerTerms: [customer()] }));
        expect(result.DueDate).toBe('2026-08-30');
        expect(result.Source).toBe('CustomerTerms');
        expect(result.PaymentTermsTypeID).toBe(NET60);
    });

    it('then the selling company default', () => {
        const result = ResolveDueDate(input({ CompanyDefault: { PaymentTermsTypeID: NET30, NetDays: 30 } }));
        expect(result.DueDate).toBe('2026-07-31');
        expect(result.Source).toBe('CompanyDefault');
    });

    it('ends on due-on-receipt with a real date, not a null', () => {
        // A null here is what made every order invisible to the aging report. An explicit
        // due-on-receipt gives the worklist something to age against on every order.
        const result = ResolveDueDate(input());
        expect(result.DueDate).toBe('2026-07-01');
        expect(result.Source).toBe('DueOnReceipt');
        expect(result.PaymentTermsTypeID).toBeNull();
    });

    it('prefers each rung over the ones below it', () => {
        const full = input({
            CustomerTerms: [customer()],
            CompanyDefault: { PaymentTermsTypeID: NET30, NetDays: 30 },
        });
        expect(ResolveDueDate({ ...full, StatedDueDate: '2026-12-01' }).Source).toBe('StatedDueDate');
        expect(ResolveDueDate({ ...full, StatedPaymentTermsTypeID: NET30 }).Source).toBe('StatedTerms');
        expect(ResolveDueDate(full).Source).toBe('CustomerTerms');
        expect(ResolveDueDate({ ...full, CustomerTerms: [] }).Source).toBe('CompanyDefault');
    });
});

describe('which customer terms apply', () => {
    it('ignores inactive rows', () => {
        expect(CustomerTermsApply(customer({ Status: 'Inactive' }), '2026-07-01', CO_A)).toBe(false);
    });

    it('is effective on the ORDER date, not on today', () => {
        // Renegotiating must not restate what an old order was due on.
        const row = customer({ StartedAt: '2026-08-01' });
        expect(CustomerTermsApply(row, '2026-07-01', CO_A)).toBe(false);
        expect(CustomerTermsApply(row, '2026-08-01', CO_A)).toBe(true);
    });

    it('treats EndedAt as exclusive', () => {
        // Terms that ended on the 1st do not cover an order placed on the 1st.
        const row = customer({ EndedAt: '2026-07-01' });
        expect(CustomerTermsApply(row, '2026-06-30', CO_A)).toBe(true);
        expect(CustomerTermsApply(row, '2026-07-01', CO_A)).toBe(false);
    });

    it('honours company scoping in both directions', () => {
        expect(CustomerTermsApply(customer({ CompanyID: CO_A }), '2026-07-01', CO_A)).toBe(true);
        expect(CustomerTermsApply(customer({ CompanyID: CO_B }), '2026-07-01', CO_A)).toBe(false);
        // An unscoped row applies to anyone's order.
        expect(CustomerTermsApply(customer(), '2026-07-01', CO_B)).toBe(true);
        // A scoped row cannot apply to an order with no company at all.
        expect(CustomerTermsApply(customer({ CompanyID: CO_A }), '2026-07-01', null)).toBe(false);
    });

    it('prefers a company-scoped row over an unscoped one', () => {
        // A subsidiary that negotiated its own terms meant to override the group's.
        const best = BestCustomerTerms(
            [customer({ PaymentTermsTypeID: NET60, NetDays: 60 }), customer({ CompanyID: CO_A, PaymentTermsTypeID: NET30, NetDays: 30 })],
            '2026-07-01',
            CO_A,
        );
        expect(best?.PaymentTermsTypeID).toBe(NET30);
    });

    it('prefers the most recently started row among equals', () => {
        const best = BestCustomerTerms(
            [
                customer({ StartedAt: '2026-01-01', PaymentTermsTypeID: NET30, NetDays: 30 }),
                customer({ StartedAt: '2026-06-01', PaymentTermsTypeID: NET60, NetDays: 60 }),
            ],
            '2026-07-01',
            CO_A,
        );
        expect(best?.PaymentTermsTypeID).toBe(NET60);
    });

    it('lets any dated row beat an undated one', () => {
        const best = BestCustomerTerms(
            [customer({ PaymentTermsTypeID: NET30, NetDays: 30 }), customer({ StartedAt: '2026-01-01', PaymentTermsTypeID: NET60, NetDays: 60 })],
            '2026-07-01',
            CO_A,
        );
        expect(best?.PaymentTermsTypeID).toBe(NET60);
    });

    it('returns null when nothing applies', () => {
        expect(BestCustomerTerms([customer({ Status: 'Inactive' })], '2026-07-01', CO_A)).toBeNull();
        expect(BestCustomerTerms([], '2026-07-01', CO_A)).toBeNull();
    });
});
