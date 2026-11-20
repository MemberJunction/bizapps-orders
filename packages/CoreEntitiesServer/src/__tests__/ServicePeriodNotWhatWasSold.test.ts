import { afterEach, describe, expect, it } from 'vitest';
import { RegisterOrderLineEditVeto } from '@mj-biz-apps/orders-entities';
import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

/**
 * A SERVICE PERIOD IS NOT WHAT WAS SOLD (bc-aidp-next-golive#322).
 *
 * The deal lock refuses order-line edits while the deal is closed, and its own message says what it is
 * protecting: "before changing what was sold". Service dates are the coverage WINDOW — the product,
 * the quantity and the price are untouched.
 *
 * That distinction is load-bearing rather than pedantic. `ConfirmEligibility` will not confirm a line
 * whose product requires a service period until it has BOTH a start and an end; Sales can state a term
 * START on a deal line and nothing more, because `DealLine` has no date columns at all. So with the
 * lock covering every field, the only route to a confirmable order ran through reopening the deal —
 * and reopening is itself now refused for the confirm (golive#323).
 *
 * These drive the real rule on a real `OrderLineEntityServer`. `Object.create` holds the entity
 * without standing up metadata, the same way the sibling veto tests do; only the status read and the
 * dirty-field list are shadowed, because those are the inputs, not the rule.
 */

const ORDER = 'c3221111-0000-4000-8000-000000000001';
const FROZEN = 'This deal is closed. Set the status back to Open before changing what was sold.';

afterEach(() => {
    RegisterOrderLineEditVeto(null);
});

/**
 * `OldValue` is what the column held BEFORE this save. Left off, it is `undefined` — a row that never
 * carried the date — which is the fill case, so the stubs that predate the narrowing still describe
 * exactly what they were written to describe.
 */
type Dirty = { Name: string; Dirty: boolean; OldValue?: unknown };

/**
 * @param dirty which fields the save is changing, and what each held before.
 * @param status what the STORED order status reads, or null for a read that answered nothing.
 */
function line(dirty: Dirty[], status: string | null = 'Quoted', answer: string | null = FROZEN) {
    const asked = { count: 0 };
    RegisterOrderLineEditVeto({
        MayEdit: async () => {
            asked.count++;
            return answer;
        },
    });

    const entity = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer & {
        refuseVetoedEdit(result: unknown, kind: string): Promise<void>;
    };
    for (const [k, v] of Object.entries({
        OrderHeaderID: ORDER,
        ID: 'c3221111-0000-4000-8000-000000000002',
        IsSaved: true,
        BypassExternalEditVeto: false,
        ContextCurrentUser: { ID: 'user-1' },
        Fields: dirty,
    })) {
        Object.defineProperty(entity, k, { value: v, writable: true });
    }
    // The only collaborator: the stored-status read. Shadowed rather than stubbed at RunView, because
    // what this rule depends on is the ANSWER, not how it is fetched.
    Object.defineProperty(entity, 'storedOrderStatus', { value: async () => status, writable: true });

    return { entity, asked };
}

const result = () => ({ Success: true, Errors: [] as unknown[] });

async function run(dirty: Dirty[], status: string | null = 'Quoted', kind = 'update', answer: string | null = FROZEN) {
    const { entity, asked } = line(dirty, status, answer);
    const r = result();
    await entity.refuseVetoedEdit(r, kind);
    return { refused: !r.Success, asked: asked.count, errors: r.Errors };
}

/** Both dates arriving on a line that had neither: the fill the confirm is waiting on. */
const DATES: Dirty[] = [
    { Name: 'ServicePeriodStart', Dirty: true, OldValue: null },
    { Name: 'ServicePeriodEnd', Dirty: true, OldValue: null },
];

/** Both dates MOVING off values the line already carried: a change to the agreed window. */
const MOVED: Dirty[] = [
    { Name: 'ServicePeriodStart', Dirty: true, OldValue: new Date('2026-01-01') },
    { Name: 'ServicePeriodEnd', Dirty: true, OldValue: new Date('2026-12-31') },
];

describe('setting a service period on the order of a closed deal', () => {
    it('is allowed, and never even asks the lock', async () => {
        const out = await run(DATES);
        expect(out.refused, 'this is the defect: a Won deal could not get its order confirmed').toBe(false);
        expect(out.asked, 'not asked at all — the lock has no claim on a coverage window').toBe(0);
    });

    it('is allowed when only the END is filled, which is the half Sales cannot state', async () => {
        const out = await run([
            { Name: 'ServicePeriodStart', Dirty: false, OldValue: new Date('2026-01-01') },
            { Name: 'ServicePeriodEnd', Dirty: true, OldValue: null },
        ]);
        expect(out.refused).toBe(false);
        expect(out.asked).toBe(0);
    });
});

describe('filling a blank is not the same as changing a date', () => {
    /**
     * The narrower rule asked for in review on #322. A date that was never set cannot be set anywhere
     * else — Sales states only a term START on a deal line, so the END arrives blank and the order is
     * the only place to put it. A date that is already there had a source, and moving it changes the
     * coverage window that was agreed at the close, which is what the lock is for.
     */
    it('refuses a save that moves dates the line already carried', async () => {
        const out = await run(MOVED);
        expect(out.refused, 'a date with a prior value is a change, not a fill').toBe(true);
        expect(out.asked, 'and it goes to the lock like any other edit to a closed deal').toBe(1);
    });

    it('refuses when one date is filled and the other is moved', async () => {
        const out = await run([
            { Name: 'ServicePeriodStart', Dirty: true, OldValue: new Date('2026-01-01') },
            { Name: 'ServicePeriodEnd', Dirty: true, OldValue: null },
        ]);
        expect(out.refused, 'every dirty date has to be a fill, not just one of them').toBe(true);
        expect(out.asked).toBe(1);
    });

    it('treats a cleared-to-empty-string prior value as blank', async () => {
        const out = await run([{ Name: 'ServicePeriodEnd', Dirty: true, OldValue: '' }]);
        expect(out.refused, "'' is a column holding nothing, whatever wrote it").toBe(false);
        expect(out.asked).toBe(0);
    });

    it('treats a whitespace-only prior value as blank', async () => {
        const out = await run([{ Name: 'ServicePeriodEnd', Dirty: true, OldValue: '   ' }]);
        expect(out.refused).toBe(false);
        expect(out.asked).toBe(0);
    });

    it('treats a prior value of undefined as blank — a row that never carried the date', async () => {
        const out = await run([{ Name: 'ServicePeriodEnd', Dirty: true, OldValue: undefined }]);
        expect(out.refused).toBe(false);
        expect(out.asked).toBe(0);
    });

    /**
     * The provider hands these columns back as `null` or as a `Date` — measured, with a probe inside
     * the rule against the live database. This case covers the shape it does NOT currently produce:
     * if these columns ever arrive as ISO strings, a set date must still read as set. A blankness
     * test that only knew about `Date` would silently exempt every edit on that day.
     */
    it('treats a non-empty string prior value as SET, not blank', async () => {
        const out = await run([{ Name: 'ServicePeriodEnd', Dirty: true, OldValue: '2027-09-30' }]);
        expect(out.refused, 'a date is a date whether it arrives as a Date or as text').toBe(true);
        expect(out.asked).toBe(1);
    });

    it('refuses CLEARING a date that was set — removing a window is not filling one', async () => {
        const out = await run([{ Name: 'ServicePeriodEnd', Dirty: true, OldValue: new Date('2027-09-30') }]);
        expect(out.refused, 'the prior value decides, whatever the new one is').toBe(true);
        expect(out.asked).toBe(1);
    });

    it('never consults a field that is not dirty, even one holding a date', async () => {
        // The real shape of the report: Sales wrote the term START onto the line, the END is blank,
        // and the rep fills only the end. The start carries a date and must not defeat the exemption.
        const out = await run([
            { Name: 'ServicePeriodStart', Dirty: false, OldValue: new Date('2026-10-01') },
            { Name: 'ServicePeriodEnd', Dirty: true, OldValue: null },
        ]);
        expect(out.refused, 'only what the save is CHANGING can disqualify it').toBe(false);
        expect(out.asked).toBe(0);
    });
});

/**
 * THE PROPERTY THAT MAKES THIS CHANGE SAFE TO SHIP.
 *
 * Narrowing an exemption can only ever send MORE saves to the veto; it cannot refuse anything the
 * veto itself would allow. Every other case here registers a veto that refuses everything, so none
 * of them can show that. These register one that ALLOWS, which is what `DealLockOrderLineVeto`
 * returns whenever the owning deal is open, or has no status, or does not own the order at all.
 *
 * This is the regression guard for every open deal in every app. Sales' own `term-start` TS6 writes
 * a term start on a deal line and then CLEARS it, which is a change rather than a fill, and the only
 * reason the narrowing does not break it is that the deal is open and the veto says yes.
 */
describe('a veto that allows is still the one that decides', () => {
    it('lets a date that was already set be CHANGED when the deal does not lock', async () => {
        const out = await run(MOVED, 'Quoted', 'update', null);
        expect(out.refused, 'narrowing must never refuse what the veto permits').toBe(false);
        expect(out.asked, 'the exemption no longer applies, so the veto IS asked — and it allows').toBe(1);
    });

    it('lets an already-set date be CLEARED when the deal does not lock — the reset path', async () => {
        const out = await run([{ Name: 'ServicePeriodStart', Dirty: true, OldValue: new Date('2026-09-01') }], 'Quoted', 'update', null);
        expect(out.refused, "sales' reset-to-order-date must keep working on an open deal").toBe(false);
        expect(out.asked).toBe(1);
    });

    /**
     * ⚠ THIS PINS A GAP, NOT A GUARANTEE, and it is deliberately written to fail if the gap closes.
     *
     * The booked bound in this file lives entirely inside the deal lock: it decides whether to SKIP
     * the veto, so it binds only where the veto would have refused. With an allowing veto a booked
     * line takes the edit, and trigger 51003 does not cover these two columns either. Measured, not
     * inferred -- a live probe confirmed an order, loaded the line fresh, registered an allowing
     * veto, and the save landed with the stored row changed.
     *
     * That is pre-existing on `next` and is not this change's doing. If a post-confirm freeze is
     * ever added, this expectation SHOULD go red; flip it to `true` then rather than deleting it.
     */
    it('lets a booked line through when the deal does not lock — a known gap, pinned', async () => {
        const out = await run(MOVED, 'Confirmed', 'update', null);
        expect(out.refused, 'today nothing refuses this; see the comment above before changing it').toBe(false);
        expect(out.asked).toBe(1);
    });
});

describe('what the exemption deliberately does NOT cover', () => {
    it('a save that also changes the quantity still meets the lock', async () => {
        const out = await run([...DATES, { Name: 'Quantity', Dirty: true }]);
        expect(out.refused, 'changing what was sold is exactly what the lock is for').toBe(true);
        expect(out.asked).toBe(1);
        expect(String((out.errors[0] as { Message?: string })?.Message ?? '')).toContain('closed');
    });

    it('a save that also changes the price still meets the lock', async () => {
        const out = await run([...DATES, { Name: 'UnitPrice', Dirty: true }]);
        expect(out.refused).toBe(true);
        expect(out.asked).toBe(1);
    });

    it('a line on a BOOKED order still meets the lock — the period is the settled term by then', async () => {
        const out = await run(DATES, 'Confirmed');
        expect(out.refused).toBe(true);
        expect(out.asked).toBe(1);
    });

    it('a CREATE is untouched: a new line is what was sold, whatever it carries', async () => {
        const out = await run(DATES, 'Quoted', 'create');
        expect(out.refused).toBe(true);
        expect(out.asked).toBe(1);
    });

    it('a save with nothing dirty earns no exemption', async () => {
        const out = await run([{ Name: 'ServicePeriodStart', Dirty: false }]);
        expect(out.refused, 'a no-op must not become a way past the lock').toBe(true);
        expect(out.asked).toBe(1);
    });

    it('a status that cannot be read earns no exemption — the lock applies', async () => {
        const out = await run(DATES, null);
        expect(out.refused, '"could not tell" must not read as "go ahead"').toBe(true);
        expect(out.asked).toBe(1);
    });
});
