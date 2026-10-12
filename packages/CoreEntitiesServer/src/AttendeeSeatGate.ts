/**
 * AttendeeSeatGate — the reads behind "does every seat on this order name its attendee?" (#590).
 *
 * An event product with `RequiresAttendeeInfo` set may not be confirmed until each seat names who is
 * coming. The attendee is an `EventOrderLine` sharing its line's key, so a line names at most one, and
 * the rule is one seat per line: quantity 1 with an attendee. The rule itself is
 * `AttendeeSeatShortfalls` in `@mj-biz-apps/orders-entities`; this file gathers its facts.
 *
 * WHICH PRODUCTS: read from `EventProduct` at confirm, not from the catalog cache, so a flag changed
 * in another process is the one enforced.
 *
 * WHICH ATTENDEES: the caller passes what it holds in memory. A line whose `EventOrderLine` is in
 * memory is judged by that row, because that is what this save writes. A saved line with no extension
 * in memory is looked up on disk, which covers a confirm of a draft whose lines were saved earlier and
 * reloaded without their extensions.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-entities AttendeeSeatShortfalls
 *   CALLER: OrderEntityServer (confirm)
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { AttendeeSeatShortfalls, type AttendeeSeatLineFacts } from '@mj-biz-apps/orders-entities';
import { EVENT_ORDER_LINE_ENTITY, EVENT_PRODUCT_ENTITY } from './entity-names.js';
import { RequireUUIDs } from './sql-guards.js';

/** One order line as the confirm holds it. */
export interface AttendeeGateLine {
    ID: string;
    IsSaved: boolean;
    LineNumber: number | null;
    ProductID: string | null;
    Quantity: number;
    ReversesOrderLineID: string | null;
    /**
     * The attendee on the line's `EventOrderLine` held in memory: a Person id, or null when the row is
     * in memory with no Person. `undefined` when no `EventOrderLine` is in memory, so the gate reads
     * the disk for a saved line.
     */
    AttendeePersonID: string | null | undefined;
}

/**
 * The reasons the order cannot confirm under the attendee rule, one per offending line. Empty when no
 * line is for an event that requires attendees, or every such line names one.
 */
export async function FindAttendeeShortfalls(
    lines: readonly AttendeeGateLine[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    const productIDs = distinct(lines.map((line) => line.ProductID));
    if (productIDs.length === 0) return [];

    const events = await loadEventsRequiringAttendees(productIDs, provider, user);
    if (events.size === 0) return [];

    const needsDisk = lines.filter(
        (line) =>
            line.IsSaved &&
            line.AttendeePersonID === undefined &&
            !!line.ProductID &&
            events.has(line.ProductID.toLowerCase()),
    );
    const onDisk = await loadSavedAttendees(
        needsDisk.map((line) => line.ID),
        provider,
        user,
    );

    const facts: AttendeeSeatLineFacts[] = lines.map((line) => {
        const event = line.ProductID ? events.get(line.ProductID.toLowerCase()) : undefined;
        const hasAttendee =
            line.AttendeePersonID !== undefined ? !!line.AttendeePersonID : onDisk.has(line.ID.toLowerCase());
        return {
            LineNumber: line.LineNumber,
            ProductName: event?.Name ?? null,
            Quantity: line.Quantity,
            RequiresAttendee: !!event,
            HasAttendee: hasAttendee,
            IsReversal: !!line.ReversesOrderLineID || line.Quantity < 0,
        };
    });
    return AttendeeSeatShortfalls(facts);
}

/**
 * A buyer-facing refusal when a checkout line for an event that requires attendees does not carry
 * one set of attendee details per seat, or null when it does or the product needs none.
 *
 * Checkout turns each set into its own line of quantity 1 with its attendee, so a matching count is
 * what lets the confirm pass. Asked before anything is written, so the buyer is told what to enter
 * rather than seeing the confirm refuse a line number they never saw.
 */
export async function CheckoutAttendeeShortfall(
    productID: string,
    quantity: number,
    attendeeSets: number,
    provider: IMetadataProvider,
    user: UserInfo | undefined,
): Promise<string | null> {
    if (attendeeSets === quantity) return null;
    const event = (await loadEventsRequiringAttendees([productID], provider, user)).get(productID.toLowerCase());
    if (!event) return null;
    const seats = quantity === 1 ? 'the ticket' : `each of the ${quantity} tickets`;
    return `Enter the attendee for ${seats} to ${event.Name} (attendees were given for ${attendeeSets}).`;
}

/** The event products among `productIDs` that require attendees, keyed by lower-cased id. */
async function loadEventsRequiringAttendees(
    productIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo | undefined,
): Promise<Map<string, { ID: string; Name: string }>> {
    const ids = RequireUUIDs(productIDs, 'ProductID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: EVENT_PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')}) AND RequiresAttendeeInfo = 1`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(`Could not read the event products on this order: ${res?.ErrorMessage ?? 'unknown error'}`);
    }
    return new Map((res.Results ?? []).map((row) => [row.ID.toLowerCase(), row]));
}

/** The lines among `lineIDs` with an `EventOrderLine` on disk, by lower-cased id. */
async function loadSavedAttendees(lineIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<Set<string>> {
    if (lineIDs.length === 0) return new Set();
    const ids = RequireUUIDs(lineIDs, 'OrderLineID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: EVENT_ORDER_LINE_ENTITY,
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(`Could not read the attendees on this order: ${res?.ErrorMessage ?? 'unknown error'}`);
    }
    // PersonID is NOT NULL on EventOrderLine, so a row is an attendee.
    return new Set((res.Results ?? []).map((row) => row.ID.toLowerCase()));
}

function distinct(values: (string | null)[]): string[] {
    const byKey = new Map<string, string>();
    for (const value of values) {
        if (value && !byKey.has(value.toLowerCase())) byKey.set(value.toLowerCase(), value);
    }
    return [...byKey.values()];
}
