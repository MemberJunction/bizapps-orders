/**
 * Setting a payment exception aside (bc-aidp-next-golive#449): which rows may move to `Ignored`, the
 * save rule the entity runs on every tier, and the bulk guard that keeps a payment waiting for a
 * missing invoice (bc-aidp-next-golive#446) out of a pre-go-live sweep.
 */
import { describe, expect, it } from 'vitest';
import { ExternalPaymentEntity } from '../ExternalPaymentEntity';
import {
    DISPOSITION_REASON_MAX,
    PlanSetAside,
    SetAsideReasonText,
    SetAsideRowRefusal,
    SetAsideSaveRefusal,
    type SetAsideCandidate,
} from '../external-payment-set-aside';

const HEADER_ID = '99999999-2222-4333-8444-555555555555';

const row = (over: Partial<SetAsideCandidate> = {}): SetAsideCandidate => ({
    ID: 'id-1',
    ExternalPaymentRef: '0rp01',
    Disposition: 'Unmatched',
    PaymentDate: '2026-08-15',
    PaymentHeaderID: null,
    ...over,
});

describe('which exceptions may be set aside', () => {
    it('allows Held, Unmatched and Refused rows with no cash recorded', () => {
        for (const d of ['Held', 'Unmatched', 'Refused']) expect(SetAsideRowRefusal({ Disposition: d, PaymentHeaderID: null })).toBeNull();
    });

    it('refuses rows with cash recorded: Reapplied, ReversalNeeded, Captured, or any row with a header', () => {
        for (const d of ['Reapplied', 'ReversalNeeded', 'Captured']) expect(SetAsideRowRefusal({ Disposition: d, PaymentHeaderID: HEADER_ID })).toMatch(/cash recorded/);
        expect(SetAsideRowRefusal({ Disposition: 'Unmatched', PaymentHeaderID: HEADER_ID })).toMatch(/cash recorded/);
    });

    it('says a row already set aside is', () => {
        expect(SetAsideRowRefusal({ Disposition: 'Ignored', PaymentHeaderID: null })).toMatch(/already set aside/);
    });
});

describe('the save rule for a move to Ignored', () => {
    const change = (over: Partial<Parameters<typeof SetAsideSaveRefusal>[0]> = {}) =>
        SetAsideSaveRefusal({ Saved: true, From: 'Unmatched', To: 'Ignored', Reason: 'Pre-go-live AR', PaymentHeaderID: null, ...over });

    it('allows an exception with a reason', () => {
        expect(change()).toBeNull();
    });

    it('needs a reason', () => {
        expect(change({ Reason: '  ' })).toMatch(/needs a reason/);
        expect(change({ Reason: null })).toMatch(/needs a reason/);
    });

    it('refuses a row with cash recorded', () => {
        expect(change({ From: 'Reapplied', PaymentHeaderID: HEADER_ID })).toMatch(/cannot be set aside/);
        expect(change({ From: 'ReversalNeeded', PaymentHeaderID: HEADER_ID })).toMatch(/cannot be set aside/);
    });

    it('does not apply to a new row, a row already Ignored, or a move to anything else', () => {
        // The poll inserts rows as Ignored for money another path books; that is not a person's set-aside.
        expect(change({ Saved: false, From: null, Reason: null })).toBeNull();
        expect(change({ From: 'Ignored', Reason: null })).toBeNull();
        expect(change({ To: 'Captured', From: 'Unmatched', Reason: null })).toBeNull();
    });
});

describe('the reason stored on the row', () => {
    it('names who and which day', () => {
        expect(SetAsideReasonText('  Pre-go-live AR ', 'Pat Example', '2026-11-05')).toBe('Set aside by Pat Example on 2026-11-05: Pre-go-live AR');
        expect(SetAsideReasonText('Pre-go-live AR', null, '2026-11-05')).toBe('Set aside on 2026-11-05: Pre-go-live AR');
    });

    it('fits the column', () => {
        expect(SetAsideReasonText('x'.repeat(900), 'Pat Example', '2026-11-05')).toHaveLength(DISPOSITION_REASON_MAX);
    });
});

describe('the bulk guard (golive#446 payments are not swept up)', () => {
    const CUT = '2026-10-01';

    it('takes old Unmatched rows dated before the cut day', () => {
        const plan = PlanSetAside([row({ ID: 'a' }), row({ ID: 'b', PaymentDate: '2026-09-30' })], { PaidBefore: CUT });
        expect(plan.Eligible.map((r) => r.ID)).toEqual(['a', 'b']);
        expect(plan.Excluded).toEqual([]);
    });

    it('leaves out Unmatched rows on or after the cut day, or with no date', () => {
        const plan = PlanSetAside(
            [row({ ID: 'old' }), row({ ID: 'cut', PaymentDate: CUT }), row({ ID: 'new', PaymentDate: '2026-10-20' }), row({ ID: 'undated', PaymentDate: null })],
            { PaidBefore: CUT },
        );
        expect(plan.Eligible.map((r) => r.ID)).toEqual(['old']);
        expect(plan.Excluded.map((x) => x.Row.ID)).toEqual(['cut', 'new', 'undated']);
        expect(plan.Excluded[1].Why).toMatch(/waiting for an invoice/);
    });

    it('takes no Unmatched row in bulk without a cut day, but still takes Held and Refused ones', () => {
        const plan = PlanSetAside([row({ ID: 'u' }), row({ ID: 'h', Disposition: 'Held' }), row({ ID: 'r', Disposition: 'Refused', PaymentDate: '2026-10-20' })], { PaidBefore: null });
        expect(plan.Eligible.map((r) => r.ID)).toEqual(['h', 'r']);
        expect(plan.Excluded.map((x) => x.Row.ID)).toEqual(['u']);
        expect(plan.Excluded[0].Why).toMatch(/no "paid before" day/);
    });

    it('lets one row be set aside on its own, whatever its date', () => {
        expect(PlanSetAside([row({ PaymentDate: '2026-10-20' })], { PaidBefore: CUT }).Eligible).toHaveLength(1);
        expect(PlanSetAside([row({ PaymentDate: null })], { PaidBefore: null }).Eligible).toHaveLength(1);
    });

    it('never takes a row with cash recorded, alone or in bulk', () => {
        expect(PlanSetAside([row({ Disposition: 'Reapplied', PaymentHeaderID: HEADER_ID })], { PaidBefore: CUT }).Eligible).toEqual([]);
        const plan = PlanSetAside([row({ ID: 'a' }), row({ ID: 'x', Disposition: 'ReversalNeeded', PaymentHeaderID: HEADER_ID })], { PaidBefore: CUT });
        expect(plan.Eligible.map((r) => r.ID)).toEqual(['a']);
    });

    it('reads a Date cell by its day, as a simple or entity read returns it', () => {
        const plan = PlanSetAside([row({ ID: 'a', PaymentDate: new Date('2026-09-30T00:00:00Z') }), row({ ID: 'b', PaymentDate: new Date('2026-10-01T00:00:00Z') })], { PaidBefore: CUT });
        expect(plan.Eligible.map((r) => r.ID)).toEqual(['a']);
    });
});

/**
 * The entity's own `Validate()` and `SetAside()`, on an instance held with `Object.create` (the house
 * pattern in `SubscriptionEntity.test.ts`), so the rule runs for real without metadata.
 */
function entity(opts: { saved: boolean; from: string; header?: string | null }) {
    const e = Object.create(ExternalPaymentEntity.prototype) as ExternalPaymentEntity;
    const fields = new Map<string, { Dirty: boolean; Value: unknown; OldValue: unknown }>([
        ['Disposition', { Dirty: false, Value: opts.from, OldValue: opts.from }],
        ['DispositionReason', { Dirty: false, Value: 'Bill.com invoice inv1 is not one Orders issued.', OldValue: null }],
        ['PaymentHeaderID', { Dirty: false, Value: opts.header ?? null, OldValue: opts.header ?? null }],
    ]);
    const set = (name: string, value: unknown) => {
        const f = fields.get(name)!;
        f.Value = value;
        f.Dirty = value !== f.OldValue;
    };
    Object.defineProperty(e, 'IsSaved', { value: opts.saved });
    Object.defineProperty(e, 'GetFieldByName', { value: (name: string) => fields.get(name) });
    Object.defineProperty(e, 'Get', { value: (name: string) => fields.get(name)?.Value });
    Object.defineProperty(e, 'Set', { value: set });
    return { e, fields, set };
}

function validate(e: ExternalPaymentEntity) {
    const parent = Object.getPrototypeOf(ExternalPaymentEntity.prototype) as { Validate: () => unknown };
    const original = parent.Validate;
    parent.Validate = () => ({ Success: true, Errors: [] });
    try {
        return e.Validate();
    } finally {
        parent.Validate = original;
    }
}

describe('ExternalPaymentEntity', () => {
    it('SetAside moves an Unmatched row to Ignored with the reason, and the save validates', () => {
        const { e, fields } = entity({ saved: true, from: 'Unmatched' });
        expect(e.SetAside('Pre-go-live AR', 'Pat Example')).toBeNull();
        expect(fields.get('Disposition')!.Value).toBe('Ignored');
        expect(String(fields.get('DispositionReason')!.Value)).toMatch(/^Set aside by Pat Example on \d{4}-\d{2}-\d{2}: Pre-go-live AR$/);
        expect(validate(e).Success).toBe(true);
    });

    it('SetAside refuses a re-applied row and changes nothing', () => {
        const { e, fields } = entity({ saved: true, from: 'Reapplied', header: HEADER_ID });
        expect(e.SetAside('tidy up')).toMatch(/cash recorded/);
        expect(fields.get('Disposition')!.Value).toBe('Reapplied');
    });

    it('SetAside needs a reason', () => {
        const { e, fields } = entity({ saved: true, from: 'Held' });
        expect(e.SetAside('   ')).toMatch(/needs a reason/);
        expect(fields.get('Disposition')!.Value).toBe('Held');
    });

    it('Validate refuses a direct write that sets a re-applied row Ignored', () => {
        const { e, set } = entity({ saved: true, from: 'Reapplied', header: HEADER_ID });
        set('Disposition', 'Ignored');
        const result = validate(e) as { Success: boolean; Errors: Array<{ Source: string; Message: string }> };
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('Disposition');
        expect(result.Errors[0].Message).toMatch(/cannot be set aside/);
    });

    it('Validate refuses a direct write that clears the reason while setting aside', () => {
        const { e, set } = entity({ saved: true, from: 'Unmatched' });
        set('Disposition', 'Ignored');
        set('DispositionReason', '');
        expect((validate(e) as { Success: boolean }).Success).toBe(false);
    });

    it('Validate leaves the poll\'s own writes alone: a new Ignored row, and Unmatched to Captured', () => {
        const fresh = entity({ saved: false, from: 'Ignored' });
        fresh.set('Disposition', 'Ignored');
        expect((validate(fresh.e) as { Success: boolean }).Success).toBe(true);
        const captured = entity({ saved: true, from: 'Unmatched' });
        captured.set('Disposition', 'Captured');
        expect((validate(captured.e) as { Success: boolean }).Success).toBe(true);
    });
});
