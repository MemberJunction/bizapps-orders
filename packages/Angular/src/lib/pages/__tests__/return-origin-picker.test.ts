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
 * ── WHAT THESE CHECKS PIN ──────────────────────────────────────────────────────────────────────
 *
 * The picker offers only BOOKED orders, both entry routes end in the same load, and a late input
 * still loads. That last one is not hypothetical: `ngOnInit` runs once, so a page handed its order
 * after construction would otherwise keep showing the previous origin for ever.
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

/** The component over stubs — it is one method across a handful of collaborators. */
function page() {
    const c = Object.create(MJOReturnPageComponent.prototype) as Record<string, unknown> & {
        OriginOrderID: string | null;
        PickerOrders: unknown[];
        PickerOpen: boolean;
        Origin: unknown;
        Lines: unknown[];
        Error: string | null;
        ngOnInit(): Promise<void>;
        ngOnChanges(changes: Record<string, unknown>): Promise<void>;
        ChooseOrigin(id: string | null): Promise<void>;
        OpenPicker(): void;
    };
    c.OriginOrderID = null;
    c.PickerOrders = [];
    c.PickerOpen = false;
    c.Origin = null;
    c.Lines = [];
    c.Error = null;
    (c as Record<string, unknown>).cdr = { detectChanges: () => undefined };
    // Prior returns are the server's answer; this suite is about reaching the page at all.
    (c as unknown as { LoadPriorReturns(ids: string[]): Promise<Map<string, number>> }).LoadPriorReturns =
        async () => new Map<string, number>();
    return c;
}

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

        const call = mockGetOrders.mock.calls[0]?.[0] as { Preset?: string };
        expect(call?.Preset, 'a return reverses a booked order — IsBooked is Confirmed').toBe('booked');
        expect(c.PickerOrders, 'and the page holds them for the picker').toHaveLength(2);
    });

    it('does not offer Draft or Quoted orders, because there is no money to give back', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();

        await c.ngOnInit();

        const presets = mockGetOrders.mock.calls.map((a) => (a[0] as { Preset?: string })?.Preset);
        expect(presets, 'asking for "all" here would offer orders the server would refuse').not.toContain(
            'all',
        );
    });

    it('loads the order the picker chooses', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockResolvedValue([ORDERS[0]]);

        await c.ChooseOrigin('o-1');

        expect(c.OriginOrderID).toBe('o-1');
        expect(c.Origin, 'the origin card can only render once this is set').toEqual(ORDERS[0]);
        expect(c.PickerOpen, 'and the picker closes behind it').toBe(false);
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

    it('says so when the chosen order cannot be loaded, rather than showing an empty page', async () => {
        mockGetOrders.mockResolvedValue(ORDERS);
        const c = page();
        await c.ngOnInit();
        mockGetOrders.mockResolvedValue([]);

        await c.ChooseOrigin('gone');

        expect(c.Origin).toBeNull();
        expect(c.Error, 'an empty origin card reads as a quiet day rather than a failure').toBeTruthy();
    });
});
