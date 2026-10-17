/**
 * @fileoverview One readable message from the errors accounting returns for a refused booking.
 *
 * Accounting checks every draft in a booking and reports each failure separately. One bad order
 * line can stage a draft per recognition period, so the same refusal came back once per period and
 * the message repeated it dozens of times. Each distinct refusal is said once here, naming every
 * order line it applies to.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

/** One error from `Accounting.CreateJournalEntries`, as much of it as this reads. */
export interface BookingError {
    Code?: string | null;
    Message?: string | null;
    DraftIndex?: number;
}

/**
 * Joins `errors` into one message, each distinct code and text once.
 *
 * @param lineFor names the order line a draft belongs to (its line number), or returns null when
 *   the draft has none. Omit it where drafts are not per order line.
 */
export function DescribeBookingErrors(
    errors: ReadonlyArray<BookingError> | null | undefined,
    lineFor?: (draftIndex: number) => number | string | null | undefined,
): string {
    const groups = new Map<string, { Code: string; Message: string; Lines: string[] }>();
    for (const error of errors ?? []) {
        const code = error.Code || 'ERROR';
        const message = (error.Message ?? '').trim();
        const key = `${code}\u0000${message}`;
        let group = groups.get(key);
        if (!group) {
            group = { Code: code, Message: message, Lines: [] };
            groups.set(key, group);
        }
        if (lineFor && error.DraftIndex !== undefined) {
            const line = lineFor(error.DraftIndex) ?? error.DraftIndex;
            const label = String(line);
            if (!group.Lines.includes(label)) group.Lines.push(label);
        }
    }
    return [...groups.values()]
        .map((group) => {
            const which =
                group.Lines.length === 0
                    ? ''
                    : ` (order line${group.Lines.length === 1 ? '' : 's'} ${group.Lines.join(', ')})`;
            return `${group.Code}${which}: ${group.Message}`;
        })
        .join('; ');
}
