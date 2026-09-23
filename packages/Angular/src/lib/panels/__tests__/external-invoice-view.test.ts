/**
 * The external-invoicing screens' decisions.
 *
 * ONE OF THESE COSTS MONEY WHEN IT IS WRONG. `CanSend` gates the button that puts an invoice in front
 * of a customer; offering it against a unit already live on the rail — or one whose last send was
 * never confirmed — is how a single billing unit becomes two invoices in somebody's inbox. That is not
 * hypothetical: the server-side version of the same mistake reached the sandbox (design §13.9).
 */
import { describe, expect, it } from 'vitest';
import {
    CanCancel,
    CanSend,
    DispositionChipClass,
    DispositionLabel,
    StateChipClass,
    StateLabel,
    type ExternalInvoiceLike,
    type PaymentExceptionDisposition,
} from '../external-invoice-view';

const row = (Status: ExternalInvoiceLike['Status'], ExternalStatus: string | null = null): ExternalInvoiceLike => ({ Status, ExternalStatus });

describe('CanSend', () => {
    it('allows a send on a confirmed order with a rail and nothing live', () => {
        expect(CanSend('Confirmed', [], true)).toBe(true);
    });

    it('refuses while a unit is already Sent', () => {
        expect(CanSend('Confirmed', [row('Sent')], true)).toBe(false);
    });

    it('refuses while a unit is in flight — the rail may already hold that invoice', () => {
        expect(CanSend('Confirmed', [row('Sending')], true)).toBe(false);
    });

    it('refuses when ANY unit is live, even beside finished ones', () => {
        expect(CanSend('Confirmed', [row('Canceled'), row('Sent')], true)).toBe(false);
        expect(CanSend('Confirmed', [row('Failed'), row('Sending')], true)).toBe(false);
    });

    it('allows a re-send after a failure or a cancellation', () => {
        expect(CanSend('Confirmed', [row('Failed')], true)).toBe(true);
        expect(CanSend('Confirmed', [row('Canceled')], true)).toBe(true);
    });

    it('refuses on any order that is not confirmed', () => {
        for (const status of ['Draft', 'Quoted', 'Voided', '', null, undefined]) {
            expect(CanSend(status, [], true)).toBe(false);
        }
    });

    it('refuses when no company on the order has a rail', () => {
        expect(CanSend('Confirmed', [], false)).toBe(false);
    });
});

describe('CanCancel', () => {
    it('allows it only for a selected, live invoice', () => {
        expect(CanCancel(row('Sent'), true)).toBe(true);
    });

    it('refuses for anything not live, and for nothing selected', () => {
        expect(CanCancel(null, true)).toBe(false);
        expect(CanCancel(undefined, true)).toBe(false);
        for (const s of ['Sending', 'Failed', 'Canceled'] as const) expect(CanCancel(row(s), true)).toBe(false);
    });

    it('refuses without a rail, whatever is selected', () => {
        expect(CanCancel(row('Sent'), false)).toBe(false);
    });
});

describe('how a row reads', () => {
    it("carries the rail's own status beside Sent, when there is one", () => {
        expect(StateLabel(row('Sent', 'OPEN'))).toBe('Sent · OPEN');
        expect(StateLabel(row('Sent'))).toBe('Sent');
    });

    it('calls an unconfirmed send "in flight", not sent and not failed', () => {
        expect(StateLabel(row('Sending'))).toBe('In flight');
    });

    it('spells cancelled the way the rest of the product does', () => {
        expect(StateLabel(row('Canceled'))).toBe('Cancelled');
    });

    it('styles a failure as danger and a live invoice as success', () => {
        expect(StateChipClass(row('Failed'))).toBe('mj-chip--danger');
        expect(StateChipClass(row('Sent'))).toBe('mj-chip--success');
        expect(StateChipClass(row('Sending'))).toBe('mj-chip--info');
        expect(StateChipClass(row('Canceled'))).toBe('mj-chip--outline');
    });
});

describe('why a payment is waiting', () => {
    it('says what an Unmatched payment actually means — the money is fine, the invoice is ours', () => {
        expect(DispositionLabel('Unmatched')).toBe('No invoice here');
    });

    it('gives every disposition plain words', () => {
        const all: PaymentExceptionDisposition[] = ['Held', 'Unmatched', 'Refused', 'ReversalNeeded'];
        for (const d of all) {
            expect(DispositionLabel(d)).toBeTruthy();
            expect(DispositionLabel(d)).not.toBe(d);
        }
    });

    it('marks only a needed reversal as danger', () => {
        expect(DispositionChipClass('ReversalNeeded')).toBe('mj-chip--danger');
        expect(DispositionChipClass('Held')).toBe('mj-chip--info');
        expect(DispositionChipClass('Unmatched')).toBe('mj-chip--outline');
        expect(DispositionChipClass('Refused')).toBe('mj-chip--outline');
    });
});

describe('the vendor is never named in this module', () => {
    it('keeps the rail a seam — the provider row supplies its own name', async () => {
        const source = await import('node:fs').then((fs) =>
            fs.readFileSync(new URL('../external-invoice-view.ts', import.meta.url), 'utf8'),
        );
        // The file header may cite the design note; no label, class or branch may name a vendor.
        const code = source.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*')).join('\n');
        expect(code).not.toMatch(/Bill\.?com/i);
    });
});
