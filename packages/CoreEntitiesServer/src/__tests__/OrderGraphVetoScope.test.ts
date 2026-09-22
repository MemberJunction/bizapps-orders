import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * `super.X()` resolves on the prototype ABOVE `OrderLineEntityServer.prototype`, which is SHARED by
 * every instance in the module registry. Vitest isolates per file today, which is the only reason
 * patching one in place has been harmless; every patch is recorded here and undone in `afterEach`
 * rather than left to that.
 *
 * Two are needed — `super.ValidateAsync` on the save path and `super.Delete` on the delete path —
 * and each is the step AFTER the rule under test, never the rule itself.
 */
const protoPatches: Array<() => void> = [];

function patchParentProto(instance: object, name: string, value: unknown): void {
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(instance)) as Record<string, unknown>;
    const original = Object.getOwnPropertyDescriptor(proto, name);
    protoPatches.push(() => {
        if (original) Object.defineProperty(proto, name, original);
        else delete proto[name];
    });
    Object.defineProperty(proto, name, { value, writable: true, configurable: true });
}

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
        // Read by the dimension-pair check in ValidateAsync. Shadowed like the fields above
        // because Object.create leaves the generated accessors unusable on a bare prototype.
        DimensionID: null,
        DimensionValueID: null,
        // Read by the override-reason check in the same ValidateAsync, for the same reason.
        PriceOverridden: false,
        PriceOverrideReason: null,
        LineNumber: 1,
    })) {
        Object.defineProperty(line, k, { value: v, writable: true });
    }
    // `super.ValidateAsync()` and the booked-parent check are not what this is about; stub only those,
    // so `refuseVetoedEdit` — the thing under test — still runs for real.
    Object.defineProperty(line, 'refuseNewLineOnBookedOrder', { value: async () => undefined, writable: true });
    patchParentProto(line, 'ValidateAsync', async () => ({ Success: true, Errors: [] }));
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
    for (const m of ['saveTaxReasons', 'stampLineDimensions', 'writePromotionRecords', 'writeChargeRecords']) {
        Object.defineProperty(order, m, { value: async () => undefined, writable: true });
    }
    return order;
}

afterEach(() => {
    RegisterOrderLineEditVeto(null);
    // Reverse order: two patches of the same name must unwind to the original, not to each other.
    while (protoPatches.length) protoPatches.pop()!();
});

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

describe('the shape Orders own cancellation reversal relies on', () => {
    /**
     * `CancelSubscriptionOperation` marks its reversal line with `MarkAsOrdersOwnWrite` AND adds it to
     * `order.Lines`, so the graph loop runs over it and ASSIGNS the flag — overwriting the mark. That is
     * only safe because the save counts as booking, and nothing tested that it does.
     *
     * It is a brand-new order created straight into `Confirmed`: not saved, so no `ConfirmedAt` yet.
     * If `willBookOnThisSave()` ever stopped returning true for that shape, the loop would set the
     * bypass to false and a registered vetoer would refuse Orders' own reversal.
     */
    it('a new order created as Confirmed counts as booking', () => {
        const header = Object.create(OrderEntityServer.prototype) as {
            willBookOnThisSave(): boolean;
        };
        Object.defineProperty(header, 'bookingInFlight', { value: false, writable: true });
        Object.defineProperty(header, 'IsSaved', { value: false, writable: true });
        Object.defineProperty(header, 'Status', { value: 'Confirmed', writable: true });
        Object.defineProperty(header, 'ConfirmedAt', { value: null, writable: true });

        expect(
            header.willBookOnThisSave(),
            'the cancellation reversal is saved through the graph, and its mark survives only if this books',
        ).toBe(true);
    });

    it('an ALREADY-booked order saving again does not count as booking', () => {
        // The other half, and the one that makes the first assertion mean something: if this also
        // returned true, the bypass would be set on every save of a booked order and the scoping
        // would be decorative.
        const header = Object.create(OrderEntityServer.prototype) as {
            willBookOnThisSave(): boolean;
        };
        Object.defineProperty(header, 'bookingInFlight', { value: false, writable: true });
        Object.defineProperty(header, 'IsSaved', { value: true, writable: true });
        Object.defineProperty(header, 'Status', { value: 'Confirmed', writable: true });
        Object.defineProperty(header, 'ConfirmedAt', { value: new Date(), writable: true });

        expect(header.willBookOnThisSave()).toBe(false);
    });
});

describe('REMOVING a line through the order graph', () => {
    /**
     * `deleteRemovedLines` set no bypass at all before this change, which no review asked about. It is
     * the same asymmetry as the save loops, pointing the other way: the loop runs on any header save
     * with removed lines, so outside booking it is as likely to be a person on the deal workspace as
     * Orders itself — and while booking, a refusal would block the close that creates the record the
     * freeze exists to protect.
     *
     * A refusal still surfaces here as a THROW rather than a validation refusal. The second review
     * called that out and called it non-blocking, and it is left alone deliberately: changing the shape
     * of a failed removal is a different change from deciding who may make one.
     */
    function orderRemoving(line: unknown, booking: boolean) {
        const order = Object.create(OrderEntityServer.prototype) as {
            deleteRemovedLines(): Promise<boolean>;
        };
        Object.defineProperty(order, 'bookingInFlight', { value: booking, writable: true });
        Object.defineProperty(order, 'Lines', { value: { Removed: [line] }, writable: true });
        // Clearing the rows that point at a removed line is a different subject, and it runs first.
        Object.defineProperty(order, 'deleteLineDependents', { value: async () => undefined, writable: true });
        return order;
    }

    /** A real line whose own `Delete()` runs for real, so the real veto decides. */
    function removableLine(track: { reachedDb: number }) {
        const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer & {
            BypassExternalEditVeto?: boolean;
        };
        for (const [k, v] of Object.entries({
            OrderHeaderID: ORDER,
            ID: 'b1c2d3e4-0000-4000-8000-000000000003',
            IsSaved: true,
            ContextCurrentUser: { ID: 'user-1' },
            Fields: [],
            LineNumber: 1,
            // The refusal is recorded through `RegisterResultHistoryEntry`, and `ExtractEntityErrorMessage`
            // reads it back out of here to build the thrown message.
            _resultHistory: [],
        })) {
            Object.defineProperty(line, k, { value: v, writable: true });
        }
        // Real getters on BaseEntity that `Object.create` leaves unusable, as in `realLine` above.
        Object.defineProperty(line, 'LeafEntity', { value: null, writable: true });
        Object.defineProperty(line, 'RootEntity', { value: null, writable: true });
        // Only the row delete itself is stubbed. Counting it is what makes "refused" mean "stopped
        // BEFORE the row was touched" rather than just "returned false".
        patchParentProto(line, 'Delete', async () => {
            track.reachedDb++;
            return true;
        });
        return line;
    }

    it('asks the veto when not booking, and a refusal stops the delete before the row', async () => {
        RegisterOrderLineEditVeto({ MayEdit: async () => FROZEN });
        const track = { reachedDb: 0 };
        const line = removableLine(track);

        // The operator has to be told WHY, same as on the save path.
        await expect(orderRemoving(line, false).deleteRemovedLines()).rejects.toThrow(
            new RegExp(FROZEN.slice(0, 30)),
        );
        expect(line.BypassExternalEditVeto, 'the graph loop must not claim this write as Orders own').toBe(
            false,
        );
        expect(track.reachedDb, 'the row must not be deleted by a refused removal').toBe(0);
    });

    it('does not ask WHILE BOOKING, because a refusal there would block the close', async () => {
        let asked = false;
        RegisterOrderLineEditVeto({
            MayEdit: async () => {
                asked = true;
                return FROZEN;
            },
        });
        const track = { reachedDb: 0 };
        const line = removableLine(track);

        await expect(orderRemoving(line, true).deleteRemovedLines()).resolves.toBe(true);
        expect(line.BypassExternalEditVeto, 'booking is the one case that may claim the bypass').toBe(true);
        expect(asked, 'and the vetoer should not even be consulted').toBe(false);
        expect(track.reachedDb, 'the removal went through').toBe(1);
    });
});

describe('stamping the journal entry the booking just created', () => {
    /**
     * The changeset lists "the journal entry id once the order books" among Orders' own writes, and
     * until this was added the code did not say so anywhere.
     *
     * On the common path it did not need to: this runs only inside `if (booking)`, so the line found
     * in `this.Lines` already carries the bypass the graph loop set. Two other objects reach the same
     * `Save`, and no loop has ever touched either — a line loaded fresh when it is not in `this.Lines`,
     * and the one exercised here: `resolveOrderLineForStamp` walks UP the IS-A chain, so an Event or
     * Subscription line in the collection is not what gets stamped, its parent Order Line is.
     *
     * Nothing refuses it today, because Sales confirms the order BEFORE writing the Won status, so the
     * freeze is not yet in place. That is an ordering in another repository, and this write has no
     * reason to depend on it.
     */
    const CHILD = 'b1c2d3e4-0000-4000-8000-000000000004';
    const JE = 'b1c2d3e4-0000-4000-8000-0000000000fe';

    it('marks the IS-A PARENT it stamps, which no graph loop ever touched', async () => {
        let asked = 0;
        RegisterOrderLineEditVeto({
            MayEdit: async () => {
                asked++;
                return FROZEN;
            },
        });

        // The parent Order Line is what owns JournalEntryID and what actually gets saved.
        const calls = { asked: 0 };
        const parent = realLine(calls) as ReturnType<typeof realLine> & { JournalEntryID?: string };
        // A generated accessor routes through `Set()`, which `Object.create` leaves without Fields.
        Object.defineProperty(parent, 'JournalEntryID', { value: null, writable: true });

        // The Event Order Line actually sitting in `this.Lines`, whose ID the draft names.
        const child = Object.create(OrderLineEntityServer.prototype) as object;
        Object.defineProperty(child, 'ID', { value: CHILD, writable: true });
        Object.defineProperty(child, '_parentEntity', { value: parent, writable: true });

        const header = Object.create(OrderEntityServer.prototype) as {
            stampJournalEntryIDs(drafts: unknown[], result: unknown, options?: unknown): Promise<void>;
        };
        Object.defineProperty(header, 'Lines', { value: { Items: [child] }, writable: true });
        // Never reached: the child is found in `this.Lines`, so nothing is loaded.
        Object.defineProperty(header, 'ProviderToUse', { value: {}, writable: true });
        Object.defineProperty(header, 'ContextCurrentUser', { value: { ID: 'user-1' }, writable: true });

        await expect(
            header.stampJournalEntryIDs(
                [{ IsBooking: true, OrderLineID: CHILD }],
                { Results: [{ JournalEntryID: JE }] },
            ),
        ).resolves.toBeUndefined();

        expect(parent.JournalEntryID, 'the parent is what carries the entry').toBe(JE);
        expect(parent.BypassExternalEditVeto, 'and no loop ever set this on the parent').toBe(true);
        expect(asked, 'stamping the entry the booking just created is Orders own bookkeeping').toBe(0);
        expect(calls.asked, 'the parent was really saved, not skipped').toBe(1);
    });
});

describe('every graph loop that writes a line is scoped the same way', () => {
    /**
     * STRUCTURAL, and deliberately so. Three loops in `OrderEntityServer` set this flag —
     * `savePendingLines`, `materializeSubscriptions` and `deleteRemovedLines` — and the first and last
     * are driven for real above. The subscription loop needs a provider, a user and a decisions map
     * before it is reachable, which would test the harness rather than the rule.
     *
     * One property covers all three, and any loop added later: the bypass is never set
     * UNCONDITIONALLY. `= true` in a graph loop is precisely the defect the second review found, so
     * this fails if it comes back anywhere in the file.
     *
     * `MarkAsOrdersOwnWrite` in OrderLineEntityServer is unconditional on purpose and is not in scope
     * here: it is called by Orders' own writers, one line at a time, which is the claim it makes.
     *
     * Comments are stripped first. A comment quoting the old form must not satisfy a check about the
     * new one — that mistake has already been made once in this codebase.
     */
    it('never assigns the bypass unconditionally', () => {
        const source = readFileSync(join(import.meta.dirname, '..', 'OrderEntityServer.ts'), 'utf8');
        const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

        const assignments = [...codeOnly.matchAll(/BypassExternalEditVeto\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
        expect(assignments.length, 'the three graph loops').toBe(3);
        for (const rhs of assignments) {
            expect(rhs, `an unconditional bypass is the defect itself: ${rhs}`).toBe('this.bookingInFlight');
        }
    });
});
