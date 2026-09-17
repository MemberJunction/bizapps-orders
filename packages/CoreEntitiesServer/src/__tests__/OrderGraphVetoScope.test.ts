import { afterEach, describe, expect, it } from 'vitest';
import { RegisterOrderLineEditVeto } from '@mj-biz-apps/orders-entities';
import { OrderEntityServer } from '../OrderEntityServer.js';
import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

/**
 * THE WHOLE-ORDER PATH IS NOT ENTITLED TO SKIP AN EXTERNAL FREEZE (golive#206 item 1, review 2).
 *
 * There are two ways a line gets saved. On its own — which is what the deal form's "What's being
 * sold" grid does — and as part of the whole order, header and lines together, which is what the deal
 * workspace does when somebody uses its Add or Remove line buttons.
 *
 * The first fix for item 2 set `BypassExternalEditVeto = true` in this loop unconditionally, on the
 * reasoning that the earlier review said to set it wherever `BypassBookedCheck` is set. That put the
 * reported defect back on a different screen: the grid refused a line on a locked deal while the
 * workspace saved the whole order and was never asked at all. Item 1 says "whichever screen or API
 * path it comes from".
 *
 * The two flags part company precisely here. `BypassBookedCheck` means "the booked-parent rule
 * already ran at the header", and it did. `BypassExternalEditVeto` means "this write is Orders' own",
 * and this loop cannot claim that: it runs on ANY header save with dirty lines. Booking is the case
 * that genuinely is Orders' own work, and nothing at the header level runs the external veto.
 *
 * These drive the real classes. `Object.create` matches the sibling veto tests — it is how these
 * server entities are held without standing up metadata.
 */

const ORDER = 'b1c2d3e4-0000-4000-8000-000000000001';
const FROZEN = 'This deal is closed. Reopen it to change what was sold.';

/** A real `OrderLineEntityServer` whose Save runs the REAL ValidateAsync, so the real veto decides. */
function realLine(calls: { asked: number }) {
    const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer & {
        Save(): Promise<boolean>;
        BypassExternalEditVeto?: boolean;
        LineNumber?: number;
    };
    for (const [k, v] of Object.entries({
        OrderHeaderID: ORDER,
        ID: 'b1c2d3e4-0000-4000-8000-000000000002',
        IsSaved: true,
        ContextCurrentUser: { ID: 'user-1' },
        Fields: [],
        Quantity: 1,
        ReversesOrderLineID: null,
        LineNumber: 1,
    })) {
        Object.defineProperty(line, k, { value: v, writable: true });
    }
    // `super.ValidateAsync()` and the booked-parent check are not what this is about; stub only those,
    // so `refuseVetoedEdit` — the thing under test — still runs for real.
    Object.defineProperty(line, 'refuseNewLineOnBookedOrder', { value: async () => undefined, writable: true });
    Object.defineProperty(
        Object.getPrototypeOf(Object.getPrototypeOf(line)),
        'ValidateAsync',
        { value: async () => ({ Success: true, Errors: [] }), writable: true, configurable: true },
    );
    // `ExtractEntityErrorMessage` walks LeafEntity/RootEntity and reads LatestResult off each. Those
    // are real getters on BaseEntity that `Object.create` leaves unusable, so they are shadowed here —
    // and LatestResult is populated on failure the way a real save does, because carrying the veto's
    // words into the thrown message is the half worth asserting.
    Object.defineProperty(line, 'LeafEntity', { value: null, writable: true });
    Object.defineProperty(line, 'RootEntity', { value: null, writable: true });
    Object.defineProperty(line, 'LatestResult', { value: null, writable: true });
    line.Save = async () => {
        calls.asked++;
        const result = await line.ValidateAsync();
        if (!result.Success) {
            Object.defineProperty(line, 'LatestResult', {
                value: { Message: result.Errors[0]?.Message ?? '', Errors: result.Errors },
                writable: true,
            });
        }
        return result.Success;
    };
    return line;
}

/** The smallest `OrderEntityServer` `savePendingLines` will run against. */
function orderWith(line: unknown, booking: boolean) {
    const order = Object.create(OrderEntityServer.prototype) as OrderEntityServer & {
        savePendingLines(options?: unknown): Promise<void>;
    };
    for (const [k, v] of Object.entries({
        _pendingPromotions: null,
        _pendingCharges: null,
        bookingInFlight: booking,
        Lines: { Items: [line] },
    })) {
        Object.defineProperty(order, k, { value: v, writable: true });
    }
    // Everything after the line loop is someone else's subject.
    for (const m of ['saveTaxReasons', 'writePromotionRecords', 'writeChargeRecords']) {
        Object.defineProperty(order, m, { value: async () => undefined, writable: true });
    }
    return order;
}

afterEach(() => RegisterOrderLineEditVeto(null));

describe('saving the whole order, NOT booking', () => {
    it('asks the veto, and a refusal stops the save', async () => {
        // The reported case, on the screen it came back on: the deal workspace saves the order graph
        // for a line a person added to a deal another app has frozen.
        RegisterOrderLineEditVeto({ MayEdit: async () => FROZEN });
        const calls = { asked: 0 };
        const line = realLine(calls);
        const order = orderWith(line, false);

        // The message matters as much as the refusal: an operator has to be told WHY.
        await expect(order.savePendingLines()).rejects.toThrow(new RegExp(FROZEN.slice(0, 30)));
        expect(line.BypassExternalEditVeto, 'the graph loop must not claim this write as Orders own').toBe(false);
        expect(calls.asked, 'the line was actually saved through, not skipped').toBe(1);
    });

    it('lets the line through when nothing has frozen it', async () => {
        // The ordinary case. Asking the veto must not become a refusal by itself.
        RegisterOrderLineEditVeto({ MayEdit: async () => null });
        const calls = { asked: 0 };
        const order = orderWith(realLine(calls), false);

        await expect(order.savePendingLines()).resolves.toBeUndefined();
        expect(calls.asked).toBe(1);
    });
});

describe('saving the whole order WHILE BOOKING', () => {
    it('does not ask, because booking is Orders own work', async () => {
        // The deal close confirms the order, and the freeze is not in place yet when it does. A veto
        // that refused here would block the close that creates the very record it is protecting.
        let asked = false;
        RegisterOrderLineEditVeto({
            MayEdit: async () => {
                asked = true;
                return FROZEN;
            },
        });
        const calls = { asked: 0 };
        const line = realLine(calls);
        const order = orderWith(line, true);

        await expect(order.savePendingLines()).resolves.toBeUndefined();
        expect(line.BypassExternalEditVeto, 'booking is the one case that may claim the bypass').toBe(true);
        expect(asked, 'and the vetoer should not even be consulted').toBe(false);
    });
});
