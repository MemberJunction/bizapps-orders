/**
 * @fileoverview An event whose product requires attendee information is sold one seat per line,
 * and every such line names its attendee.
 *
 * `EventProduct.RequiresAttendeeInfo` was edited on the product form and read by nothing, so an
 * order for five seats of such an event confirmed with no attendee at all. The attendee lives on
 * `EventOrderLine`, an IS-A child of the order line that shares its key, so a line holds at most
 * one attendee. One attendee per seat therefore means one line per seat at quantity 1, which is
 * also what checkout builds when the buyer enters an attendee for each ticket.
 *
 * Checked twice, from the same facts: when an order books, on every path that confirms one; and
 * in checkout before the payment intent opens, because checkout takes the money before it
 * confirms, and a refusal at confirm would leave a paid checkout with no order.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { EVENT_ORDER_LINE_ENTITY, EVENT_PRODUCT_ENTITY } from './entity-names.js';
import { RequireUUIDs } from './sql-guards.js';

/** What the order-side rule needs to know about one line. */
export interface AttendeeLineFacts {
    LineNumber: number | null;
    ProductID: string | null;
    Quantity: number;
    /**
     * A reversal or a bundle component. A reversal unwinds a seat that was already named; a
     * component is sold by its bundle line. Neither carries an attendee of its own.
     */
    Exempt: boolean;
    /** The line has an `EventOrderLine` row naming a person, in memory or on disk. */
    HasAttendee: boolean;
}

/** What the checkout-side rule needs to know about one requested line. */
export interface CheckoutAttendeeFacts {
    ProductID: string;
    Quantity: number;
    /** One entry per attendee the buyer entered for this line: the e-mail, or null when blank. */
    AttendeeEmails: ReadonlyArray<string | null>;
}

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();

/**
 * The refusals for an order about to book, one per offending line; empty when it may book.
 * `requiringProductIDs` holds the products whose event requires attendee information.
 */
export function ExplainMissingAttendees(
    lines: ReadonlyArray<AttendeeLineFacts>,
    requiringProductIDs: ReadonlySet<string>,
): string[] {
    const messages: string[] = [];
    for (const line of lines) {
        if (line.Exempt || !line.ProductID || !requiringProductIDs.has(key(line.ProductID))) continue;
        const label = `Order line ${line.LineNumber ?? '?'}`;
        if (line.Quantity !== 1) {
            messages.push(
                `${label} sells ${line.Quantity} seats of an event that requires attendee information. ` +
                    `Add one line per attendee, each at quantity 1 with its attendee.`,
            );
        } else if (!line.HasAttendee) {
            messages.push(`${label} is for an event that requires attendee information and has no attendee.`);
        }
    }
    return messages;
}

/**
 * The buyer-facing refusal for a checkout whose event tickets lack an attendee each; null when every
 * ticket has one. An attendee counts when it has an e-mail, because completion finds or creates the
 * attendee's person by e-mail and the attendee row cannot be written without that person.
 */
export function ExplainMissingCheckoutAttendees(
    lines: ReadonlyArray<CheckoutAttendeeFacts>,
    requiringProductIDs: ReadonlySet<string>,
): string | null {
    for (const line of lines) {
        if (!requiringProductIDs.has(key(line.ProductID))) continue;
        const named = line.AttendeeEmails.filter((email) => !!email?.trim()).length;
        if (named !== line.Quantity || line.AttendeeEmails.length !== line.Quantity) {
            return line.Quantity === 1
                ? `This event requires attendee information. Enter the attendee's name and e-mail address.`
                : `This event requires attendee information for every ticket. ` +
                      `Enter a name and e-mail address for each of the ${line.Quantity} attendees.`;
        }
    }
    return null;
}

/**
 * The products, among `productIDs`, whose event requires attendee information, as lower-cased ids.
 * A product with no `EventProduct` row is not an event and is never in the result. Throws when the
 * read fails: booking on "could not tell" is the outcome this rule exists to prevent.
 */
export async function LoadProductsRequiringAttendees(
    productIDs: ReadonlyArray<string | null | undefined>,
    provider: IRunViewProvider | undefined,
    user: UserInfo | undefined,
): Promise<Set<string>> {
    const ids = RequireUUIDs([...new Set(productIDs.filter((id): id is string => !!id))], 'ProductID');
    if (!ids.length) return new Set();

    const res = await new RunView(provider).RunView<{ ID: string }>(
        {
            EntityName: EVENT_PRODUCT_ENTITY,
            ExtraFilter: `RequiresAttendeeInfo = 1 AND ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(
            `Could not read which events require attendee information: ${res?.ErrorMessage ?? 'no error message supplied'}`,
        );
    }
    return new Set((res.Results ?? []).map((row) => key(row.ID)));
}

/** The lines, among `lineIDs`, that have an `EventOrderLine` row on disk, as lower-cased ids. */
export async function LoadLinesWithAttendee(
    lineIDs: ReadonlyArray<string | null | undefined>,
    provider: IRunViewProvider,
    user: UserInfo | undefined,
): Promise<Set<string>> {
    const ids = RequireUUIDs([...new Set(lineIDs.filter((id): id is string => !!id))], 'OrderLineID');
    if (!ids.length) return new Set();

    const res = await new RunView(provider).RunView<{ ID: string }>(
        {
            EntityName: EVENT_ORDER_LINE_ENTITY,
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(`Could not read the attendees of this order's lines: ${res?.ErrorMessage ?? 'no error message supplied'}`);
    }
    return new Set((res.Results ?? []).map((row) => key(row.ID)));
}
