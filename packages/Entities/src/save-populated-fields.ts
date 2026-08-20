/**
 * Fields the save path fills in, so `Validate()` must not treat them as user errors
 * on a record that has not been saved yet.
 *
 * Fast Entry and the editor gate confirm on `Validate()`. `OrderNumber`, each line's
 * `UnitPrice` / `CompanyID` / `LineNumber` are NOT NULL in metadata, and they are
 * empty on a new draft because `OrderEntityServer.Save()` mints or stamps them.
 * Running the generated checks up front disabled Confirm with
 * "Order Number cannot be null" on every complete order.
 *
 * After the first save those values exist, so a later empty is a real failure.
 */

const LINE_POPULATED = /^(Lines)\[(\d+)\]\.(UnitPrice|CompanyID|LineNumber)$/;

/**
 * True when this validation error is for a field the save itself will populate.
 */
export function IsSavePopulatedFieldError(
    source: string,
    headerIsSaved: boolean,
    lineIsSaved: (index: number) => boolean,
): boolean {
    if (source === 'OrderNumber' || source === 'PaymentNumber') return !headerIsSaved;
    const match = LINE_POPULATED.exec(source);
    if (!match) return false;
    return !lineIsSaved(Number(match[2]));
}
