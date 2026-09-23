/**
 * The customer's address as it was when the order was confirmed (golive #263).
 *
 * `OrderHeader.BillToAddressID`, `ShipToAddressID` and `OrderLine.ShipToAddressID` point at live
 * Common `Address` rows, and the address editors save onto the same row. Where the customer was on
 * the date of sale decides which state the sale counts in, so a later edit to that row would move
 * every earlier sale with it. Record Changes keeps the old values, but nothing downstream reads them.
 *
 * So the first confirm copies the address onto the order as JSON, and everything that reports on a
 * confirmed order reads that copy. Draft and Quoted orders have no snapshot and keep following the
 * live row. The database refuses to rewrite a snapshot once written (51015 / 51016).
 *
 * @module @mj-biz-apps/orders-entities
 */

/** The postal fields copied from a Common `Address` row, plus the row they came from. */
export interface OrderAddressSnapshot {
    AddressID: string;
    Line1: string | null;
    Line2: string | null;
    Line3: string | null;
    City: string | null;
    StateProvince: string | null;
    PostalCode: string | null;
    Country: string | null;
}

/** Anything carrying an `Address` row's postal fields — the entity, or a simple view row. */
export interface AddressLike {
    ID: string;
    Line1?: string | null;
    Line2?: string | null;
    Line3?: string | null;
    City?: string | null;
    StateProvince?: string | null;
    PostalCode?: string | null;
    Country?: string | null;
}

/** The `Address` columns a snapshot copies, for a `Fields` list on a view read. */
export const ADDRESS_SNAPSHOT_FIELDS = ['ID', 'Line1', 'Line2', 'Line3', 'City', 'StateProvince', 'PostalCode', 'Country'] as const;

/** The line columns that must not change once the order is confirmed. */
export const ORDER_LINE_ADDRESS_FIELDS = ['ShipToAddressID', 'ShipToAddressSnapshot'] as const;

/** The snapshot JSON for an address row. Blank strings are stored as null. */
export function BuildAddressSnapshot(address: AddressLike): string {
    const snapshot: OrderAddressSnapshot = {
        AddressID: address.ID,
        Line1: text(address.Line1),
        Line2: text(address.Line2),
        Line3: text(address.Line3),
        City: text(address.City),
        StateProvince: text(address.StateProvince),
        PostalCode: text(address.PostalCode),
        Country: text(address.Country),
    };
    return JSON.stringify(snapshot);
}

/**
 * Read a stored snapshot, or null when there is none.
 *
 * @throws when the column holds something that is not a snapshot. The column's CHECK accepts only
 * JSON and only the confirm path writes it, so a malformed value means the row was altered by hand;
 * falling back to the live address would silently report the sale in the wrong place.
 */
export function ParseAddressSnapshot(json: string | null | undefined): OrderAddressSnapshot | null {
    if (json == null || json.trim() === '') return null;
    const parsed: unknown = JSON.parse(json);
    if (!isSnapshot(parsed)) {
        throw new Error(`Stored address snapshot is not in the expected shape: ${json}`);
    }
    return parsed;
}

function isSnapshot(value: unknown): value is OrderAddressSnapshot {
    if (value == null || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (typeof record.AddressID !== 'string' || !record.AddressID) return false;
    return ADDRESS_SNAPSHOT_FIELDS.filter((f) => f !== 'ID').every(
        (f) => record[f] == null || typeof record[f] === 'string',
    );
}

function text(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length ? trimmed : null;
}
