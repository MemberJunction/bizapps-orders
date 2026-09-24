import '@angular/compiler';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * THE RETURNS PAGE HAS TO BE REACHABLE (bc-aidp-next-golive#250).
 *
 * O-US4 had no user-facing route at all. The page rendered its origin card only when `Origin` was
 * set, `ngOnInit` returned immediately unless `@Input() OriginOrderID` was populated — and a
 * repo-wide search for `OriginOrderID` found exactly one file, the page itself. Nothing ever set it.
 * So the page showed "Select an order to return / Choose the original order to start a return" and
 * offered nothing to choose with, and a confirmed order could not be returned from the UI.
 *
 * The approved design had the answer all along: `mockups/orders/return.html` carries a block
 * commented `<!-- origin picker -->` with a "Change origin order" control. The origin DISPLAY was
 * built and the origin SELECTION was not.
 *
 * ── WHY NOT FIX IT IN THE SHELL ────────────────────────────────────────────────────────────────
 *
 * Because that half is dead. `orders-sections.component.ts` hands a page its pending record by name
 * — `setInput('OrderID', …)` else `setInput('RecordID', …)` — and the issue's own lead suggested
 * adding a case for `OriginOrderID` there. But `PendingRecordID`'s ONLY writer is `openRecord()`,
 * which has zero callers: orders now open as Explorer record tabs through `openEntity`. A case added
 * there would never execute, and would read as a fix in review.
 *
 * ── THESE CHECKS WERE MUTATION-TESTED AND FOUR OF THEM HELD NOTHING ────────────────────────────
 *
 * Review ran nine mutations against the page. Four survived every check here: dropping
 * `PickerOpen = false`, dropping the `!firstChange` guard, dropping `MaxRows`, and not clearing
 * `Origin` before a load. A fifth, `Preset: 'booked'` → `'drafts'`, was caught by only one test —
 * and NOT by the one titled "does not offer Draft or Quoted orders", which asserted merely that the
 * preset was not `'all'`. The one thing its title promised was the one thing it did not check.
 *
 * Each of those is now pinned by name below, with the mutation it exists to kill stated on it.
 */

const mockGetOrders = vi.fn();
const mockGetOrderLines = vi.fn();

vi.mock('../../data/orders-queries', () => ({
    GetOrders: (...args: unknown[]) => mockGetOrders(...args),
    GetOrderLines: (...args: unknown[]) => mockGetOrderLines(...args),
}));

// STATIC, not a dynamic import inside the first test. Importing the page pulls in Angular's JIT
// compile of a large standalone component; done inside `page()` the first test paid that cost and
// timed out at 5s under full-suite load while passing in isolation -- the worst shape of flake,
// because the file looks fine when you re-run it on its own.
import { MJOReturnPageComponent } from '../orders/return.page';

const ORDERS = [
    { ID: 'o-1', OrderNumber: 'ORD-000010', Status: 'Confirmed', TotalGross: 1200, BillToOrganization: 'Sidecar' },
    { ID: 'o-2', OrderNumber: 'ORD-000011', Status: 'Confirmed', TotalGross: 340, BillToPerson: 'Marcus Webb' },
];

interface PageOpts {
    /** Start with the picker OPEN, so closing it is an observable change rather than a no-op. */
    pickerOpen?: boolean;
}

/** The component over stubs — it is one method across a handful of collaborators. */
function page(opts: PageOpts = {}) {
    const c = Object.create(MJOReturnPageComponent.prototype) as Record<string, unknown> & {
        OriginOrderID: string | null;
        PickerOrders: unknown[];
        PickerOpen: boolean;
        PickerLoaded: boolean;
        Origin: unknown;
        Lines: unknown[];
        Error: string | null;
        ngOnInit(): Promise<void>;
        ngOnChanges(changes: Record<string, unknown>): Promise<void>;
        ChooseOrigin(id: string | null): Promise<void>;
        FilterOrders(search: string): Promise<void>;
        OpenPicker(): void;
    };
    c.OriginOrderID = null;
    c.PickerOrders = [];
    // NOT false by default. The fixture used to pre-set this to the value the code under test
    // assigns, so deleting `this.PickerOpen = false` from the page left every check green.
    c.PickerOpen = opts.pickerOpen === true;
    c.PickerLoaded = false;
    c.Origin = null;
    c.Lines = [];
    c.Error = null;
    // `Object.create` does not run the constructor, so class-field initialisers never fire. The
    // generation token has to be seeded here or `++undefined` is NaN, `NaN === NaN` is false, and
    // EVERY load treats itself as superseded and silently returns — which is what this fixture did
    // until the new race check caught it.
    (c as Record<string, unknown>).originLoadToken = 0;
    (c as Record<string, unknown>).cdr = { detectChanges: () => undefined };
    // Prior returns are the server's answer; this suite is about reaching the page at all.
    (c as unknown as { LoadPriorReturns(ids: string[]): Promise<Map<string, number>> }).LoadPriorReturns =
        async () => new Map<string, number>();
    return c;
}

const presetOf = (call: unknown[] | undefined) => (call?.[0] as { Preset?: string } | undefined)?.Preset;

beforeEach(() => {
    mockGetOrders.mockReset();
    mockGetOrderLines.mockReset();
    mockGetOrderLines.mockResolvedValue([]);
});

describe('the returns page can be reached', () => {
    it('offers BOOKED orders to pick from, filtered server-side', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();

        await c.ngOnInit();

        expect(presetOf(mockGetOrders.mock.calls[0]), 'a return reverses a booked order — IsBooked is Confirmed')
            .toBe('booked');
        expect(c.PickerOrders, 'and the page holds them for the picker').toHaveLength(2);
    });

    it('asks for booked orders SPECIFICALLY, not merely something other than all', async () => {
        // Kills `Preset: 'booked'` -> 'drafts', which the old "does not offer Draft or Quoted" check
        // let through: it asserted only that the preset was not 'all', so the page could have asked
        // for exactly the orders that title says must never be offered.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();

        await c.ngOnInit();

        const presets = mockGetOrders.mock.calls.map((a) => presetOf(a));
        expect(presets, 'Draft and Quoted orders have no money to give back').not.toContain('drafts');
        expect(presets, 'and "all" would offer orders the server would refuse').not.toContain('all');
        expect(presets.every((p) => p === 'booked'), `every read must be booked — got ${JSON.stringify(presets)}`)
            .toBe(true);
    });

    it('caps the list it asks for, rather than pulling every order', async () => {
        // Kills dropping `MaxRows`. The cap alone was not enough — see the server-side search below,
        // which is what stops the cap hiding older orders.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();

        await c.ngOnInit();

        const call = mockGetOrders.mock.calls[0]?.[0] as { MaxRows?: number };
        expect(call?.MaxRows, 'an uncapped read of every booked order is the bug the options doc records')
            .toBeGreaterThan(0);
    });

    it('sends the typed filter to the SERVER, so the cap cannot hide older orders', async () => {
        // The cap is only safe because the search is server-side. `MJDropdownComponent` filters its
        // own `Data` in the browser, so without this the 201st-oldest booked order is unreachable by
        // scrolling AND by typing — returns against older orders stop being possible.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockClear();

        await c.FilterOrders('ORD-0000');

        const call = mockGetOrders.mock.calls[0]?.[0] as { Search?: string; Preset?: string };
        expect(call?.Search, 'the text has to reach the query, not just the rendered list').toBe('ORD-0000');
        expect(call?.Preset, 'and it still only offers booked orders').toBe('booked');
    });

    it('distinguishes "not asked yet" from "asked and got nothing"', async () => {
        // `run()` returns [] when the query FAILS, and orders-queries argues this case against
        // itself: "a failed query that reads as good news is the worst outcome available". Without
        // the flag the empty state also flashed on every open, during the initial load.
        mockGetOrders.mockResolvedValue([]);
        const c = page();

        expect(c.PickerLoaded, 'before the read, the page must not claim there are none').toBe(false);
        await c.ngOnInit();
        expect(c.PickerLoaded, 'after the read, the empty state is allowed to speak').toBe(true);
    });

    it('loads the order the picker chooses, and closes the picker behind it', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page({ pickerOpen: true });
        await c.ngOnInit();
        mockGetOrders.mockResolvedValue([ORDERS[0]]);

        await c.ChooseOrigin('o-1');

        expect(c.OriginOrderID).toBe('o-1');
        expect(c.Origin, 'the origin card can only render once this is set').toEqual(ORDERS[0]);
        // Kills dropping `PickerOpen = false`. It starts TRUE here on purpose.
        expect(c.PickerOpen, 'leaving it open covers the order it just loaded').toBe(false);
    });

    it('asks for the ONE order by id, not every order then find', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockClear();
        mockGetOrders.mockResolvedValue([ORDERS[0]]);

        await c.ChooseOrigin('o-1');

        const call = mockGetOrders.mock.calls[0]?.[0] as { OrderHeaderID?: string; Preset?: string };
        expect(call?.OrderHeaderID, 'MJOGetOrdersOptions has OrderHeaderID for exactly this').toBe('o-1');
        expect(call?.Preset, 'reading the whole table to keep one row is the bug that doc records').toBeUndefined();
    });

    it('still loads when the order arrives AFTER construction', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        expect(c.Origin, 'nothing was selected yet').toBeNull();

        mockGetOrders.mockResolvedValue([ORDERS[1]]);
        c.OriginOrderID = 'o-2';
        await c.ngOnChanges({ OriginOrderID: { firstChange: false } });

        expect(c.Origin, 'ngOnInit runs once; without ngOnChanges this stays null for ever').toEqual(
            ORDERS[1],
        );
    });

    it('does NOT reload on the first change, because ngOnInit already did', async () => {
        // Kills dropping the `!firstChange` guard — the double-load protection the comment above it
        // exists to justify, which nothing held.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockClear();

        c.OriginOrderID = 'o-1';
        await c.ngOnChanges({ OriginOrderID: { firstChange: true } });

        expect(mockGetOrders, 'the first change is ngOnInit’s own binding arriving').not.toHaveBeenCalled();
    });

    it('clears the previous origin before loading the next one', async () => {
        // Kills not clearing `Origin` first. Without it a failed second pick leaves the FIRST order
        // on screen with the second order's id, and Confirm return books against what is displayed.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockResolvedValue([ORDERS[0]]);
        await c.ChooseOrigin('o-1');
        expect(c.Origin).toEqual(ORDERS[0]);

        mockGetOrders.mockResolvedValue([]);
        await c.ChooseOrigin('gone');

        expect(c.Origin, 'the stale origin must not survive a failed load').toBeNull();
        expect(c.Lines, 'nor its lines').toHaveLength(0);
    });

    it('says so when the chosen order cannot be loaded, rather than showing an empty page', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockResolvedValue([]);

        await c.ChooseOrigin('gone');

        expect(c.Origin).toBeNull();
        expect(c.Error, 'an empty origin card reads as a quiet day rather than a failure').toBeTruthy();
    });

    it('lets the NEWEST pick win when two are in flight', async () => {
        // Three sequential awaits assign to shared fields. The picker is on screen throughout,
        // because the load clears `Origin` first and the @else branch renders — so a second pick
        // starts a second pass. Without a generation token the slower response lands last and
        // `Origin` and `Lines` describe different orders, which ConfirmReturn then books.
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();

        let releaseSlow: (v: unknown) => void = () => undefined;
        mockGetOrders.mockImplementationOnce(
            () => new Promise((resolve) => {
                releaseSlow = () => resolve([ORDERS[0]]);
            }),
        );
        const slow = c.ChooseOrigin('o-1');

        mockGetOrders.mockResolvedValueOnce([ORDERS[1]]);
        await c.ChooseOrigin('o-2');

        releaseSlow(undefined);
        await slow;

        expect(c.Origin, 'the abandoned first pick must not overwrite the second').toEqual(ORDERS[1]);
    });
});
