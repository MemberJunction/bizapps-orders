/**
 * @fileoverview One readable message from the errors accounting returns for a refused booking.
 *
 * Accounting checks every draft in a booking and reports each failure separately. One bad order
 * line can stage a draft per recognition period, so the same refusal came back once per period and
 * the message repeated it dozens of times. Each distinct refusal is said once here, naming every
 * order line it applies to.
 *
 * The person confirming an order cannot act on accounting's pipeline codes (`MALFORMED_DRAFT`,
 * `ACCOUNT_INACTIVE`, ...), so {@link DescribeBookingErrors} turns each into a sentence naming the
 * order line, its product and what to change (bizapps-orders#742). The codes stay in the server log,
 * through {@link BookingErrorLogText}, for whoever has to trace the refusal.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

/** One error from `Accounting.CreateJournalEntries`, as much of it as this reads. */
export interface BookingError {
    Code?: string | null;
    Message?: string | null;
    DraftIndex?: number;
}

/** The order line a draft books, as a refusal names it. */
export interface BookingErrorLine {
    LineNumber: number | string | null | undefined;
    Product?: string | null;
}

/**
 * Names the order line a draft belongs to: its line number, or the number and product. Returns null
 * when the draft has none. Omit it where drafts are not per order line.
 */
export type BookingErrorLineLookup = (draftIndex: number) => BookingErrorLine | number | string | null | undefined;

/** A lookup's answer as a line; a bare number or a miss names the line by that number or the draft. */
function asLine(found: ReturnType<BookingErrorLineLookup>, draftIndex: number): BookingErrorLine {
    if (found == null) return { LineNumber: draftIndex };
    if (typeof found === 'number' || typeof found === 'string') return { LineNumber: found };
    return found;
}

interface ErrorGroup {
    Code: string;
    Message: string;
    /** Labels for the log: line numbers, or the draft index when the line is unknown. */
    LineLabels: string[];
    /** The lines as a sentence names them: `order line 2 (Annual Membership)`. */
    Lines: string[];
}

/** Errors that read the same: the same code and text. */
const byCodeAndText = (code: string, message: string) => `${code}\u0000${message}`;

/**
 * Each distinct refusal once, with every order line it applies to.
 *
 * @param keyOf which errors count as the same refusal
 */
function groupErrors(
    errors: ReadonlyArray<BookingError> | null | undefined,
    lineFor: BookingErrorLineLookup | undefined,
    keyOf: (code: string, message: string) => string = byCodeAndText,
): ErrorGroup[] {
    const groups = new Map<string, ErrorGroup>();
    for (const error of errors ?? []) {
        const code = error.Code || 'ERROR';
        const message = (error.Message ?? '').trim();
        const key = keyOf(code, message);
        let group = groups.get(key);
        if (!group) {
            group = { Code: code, Message: message, LineLabels: [], Lines: [] };
            groups.set(key, group);
        }
        if (lineFor && error.DraftIndex !== undefined) {
            const line = asLine(lineFor(error.DraftIndex), error.DraftIndex);
            const number = line.LineNumber ?? error.DraftIndex;
            const label = String(number);
            if (!group.LineLabels.includes(label)) {
                group.LineLabels.push(label);
                group.Lines.push(line.Product ? `${label} (${line.Product})` : label);
            }
        }
    }
    return [...groups.values()];
}

/**
 * The raw codes and accounting's text, each distinct one once: `MALFORMED_DRAFT (order lines 2, 3):
 * ...`. For the server log, not for the person confirming.
 */
export function BookingErrorLogText(
    errors: ReadonlyArray<BookingError> | null | undefined,
    lineFor?: BookingErrorLineLookup,
): string {
    return groupErrors(errors, lineFor)
        .map((group) => {
            const which =
                group.LineLabels.length === 0
                    ? ''
                    : ` (order line${group.LineLabels.length === 1 ? '' : 's'} ${group.LineLabels.join(', ')})`;
            return `${group.Code}${which}: ${group.Message}`;
        })
        .join('; ');
}

/** `Order line 2 (Annual Membership)`, `Order lines 2 (A) and 3 (B)`, or `One of the order's lines`. */
function linesPhrase(lines: string[]): string {
    if (lines.length === 0) return "One of the order's lines";
    if (lines.length === 1) return `Order line ${lines[0]}`;
    return `Order lines ${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`;
}

/** Accounting's text with a closing full stop, so a sentence can follow it. */
function asSentence(message: string): string {
    if (!message) return '';
    return /[.!?]$/.test(message) ? message : `${message}.`;
}

/** Accounting refuses a journal line for zero or less; the message names the amount. */
const NON_POSITIVE_AMOUNT = /(greater than zero|> ?0|must be positive)/i;

/**
 * Errors the person confirming is told about together. A code whose sentence does not quote
 * accounting's text is one refusal whatever the text says (the account or amount differs line by
 * line), so its lines are named in one sentence.
 */
function plainKey(code: string, message: string): string {
    switch (code) {
        case 'MALFORMED_DRAFT':
            return NON_POSITIVE_AMOUNT.test(message) ? `${code}\u0000zero` : byCodeAndText(code, message);
        case 'ACCOUNT_UNKNOWN':
        case 'ACCOUNT_INACTIVE':
        case 'MULTI_COMPANY_DRAFT':
        case 'UNBALANCED':
            return code;
        case 'DIMENSION_UNKNOWN':
        case 'DIMENSION_VALUE_UNKNOWN':
            return 'DIMENSION';
        default:
            return byCodeAndText(code, message);
    }
}

/** One plain sentence (or two) for a group: which line, what is wrong, what to change. */
function describeGroup(group: ErrorGroup): string {
    const which = linesPhrase(group.Lines);
    const one = group.Lines.length <= 1;
    const its = one ? 'its' : 'their';
    const accounting = asSentence(group.Message);
    switch (group.Code) {
        case 'MALFORMED_DRAFT':
            if (NON_POSITIVE_AMOUNT.test(group.Message)) {
                return (
                    `${which} would post an amount of zero to the ledger. Check ${its} price and service dates: ` +
                    `a line needs a price above zero, and service dates that cover at least one recognition period.`
                );
            }
            return (
                `${which}: accounting refused ${its} ledger entry. ${accounting} Check the product's GL accounts ` +
                `and revenue recognition type.`
            ).replace(/\s+/g, ' ');
        case 'ACCOUNT_UNKNOWN':
            return (
                `${which} ${one ? 'books' : 'book'} to a GL account that does not exist in accounting. Set the ` +
                `product's GL accounts (or its product type's) to accounts that exist.`
            );
        case 'ACCOUNT_INACTIVE':
            return (
                `${which} ${one ? 'books' : 'book'} to an inactive GL account. Set the product's GL accounts (or its ` +
                `product type's) to active accounts, or ask accounting to reactivate the account.`
            );
        case 'DIMENSION_UNKNOWN':
        case 'DIMENSION_VALUE_UNKNOWN':
            return (
                `${which} ${one ? 'carries' : 'carry'} a GL dimension tag accounting does not recognize. Change the ` +
                `tag in the line's options, or the product's dimension default.`
            );
        case 'MULTI_COMPANY_DRAFT':
            return (
                `${which} ${one ? 'books' : 'book'} to GL accounts of more than one company. Set the product's GL ` +
                `accounts to accounts of the order's company.`
            );
        case 'UNBALANCED':
            return (
                `The ledger entry for ${which.charAt(0).toLowerCase()}${which.slice(1)} does not balance. Nothing on ` +
                `the order can fix this: report it with the order number.`
            );
        case 'ENTRY_TYPE_UNKNOWN':
        case 'ENTRY_TYPE_INACTIVE':
            return `${accounting} Nothing on the order needs to change.`.trim();
        default:
            // INTERNAL_ERROR and any code this does not know: accounting's own text is all there is.
            return group.Lines.length === 0
                ? `Accounting could not book the order. ${accounting}`.trim()
                : `Accounting could not book ${which.charAt(0).toLowerCase()}${which.slice(1)}. ${accounting}`.trim();
    }
}

/**
 * Joins `errors` into one message for the person confirming: each distinct refusal once, as a
 * sentence naming the order line, its product and what to change. The codes are left out; log
 * {@link BookingErrorLogText} for them.
 *
 * @param lineFor names the order line a draft belongs to. Omit it where drafts are not per order line.
 */
export function DescribeBookingErrors(
    errors: ReadonlyArray<BookingError> | null | undefined,
    lineFor?: BookingErrorLineLookup,
): string {
    const sentences: string[] = [];
    for (const group of groupErrors(errors, lineFor, plainKey)) {
        const sentence = describeGroup(group);
        if (!sentences.includes(sentence)) sentences.push(sentence);
    }
    return sentences.join(' ');
}
