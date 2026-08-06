/**
 * Turning a save rejection into something a person can act on.
 *
 * Lives here rather than in the page it serves, for two reasons. It is pure —
 * no Angular, no injection — so it is testable as a plain function, and putting
 * it in the component file meant a unit test importing it dragged the whole
 * component graph in and demanded the JIT compiler. And more than one screen
 * saves an order, so more than one will want the same treatment.
 */

/** One field-level complaint, as the save path serialises them. */
interface MJOSaveFailure {
    Source?: string;
    Message?: string;
    Type?: string;
}

/**
 * Turn a save rejection into a sentence a person can act on.
 *
 * The save path throws with a SERIALISED validation result, so the raw
 * `error.message` is a JSON blob — a user clicking Save saw
 * `{"Source":"OrderNumber","Message":"Order Number cannot be null","Value":null,
 * "Type":"Failure"}` across the footer. Everything they needed was the one
 * sentence buried in the middle of it.
 *
 * Falls back to the raw text whenever the shape is not what we expect. An
 * unparseable error is still better shown than swallowed — the point is to
 * prefer the readable form, never to hide information.
 */
export function ReadableSaveError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    // Whichever bracket comes FIRST. Preferring '{' looked equivalent and was not:
    // for an ARRAY of failures it sliced from the inner brace, leaving a trailing
    // "},{...}]" that could not parse — so a multi-complaint save, the case most in
    // need of tidying, was the one that fell back to raw JSON.
    const brace = raw.indexOf('{');
    const bracket = raw.indexOf('[');
    const start = brace < 0 ? bracket : bracket < 0 ? brace : Math.min(brace, bracket);
    if (start < 0) return raw;
    try {
        const parsed: unknown = JSON.parse(raw.slice(start));
        const failures: MJOSaveFailure[] = Array.isArray(parsed) ? parsed : [parsed as MJOSaveFailure];
        const messages = failures.map((f) => f?.Message).filter((m): m is string => !!m);
        // Several complaints read as a list, not one run-on sentence.
        if (messages.length) return messages.join(' · ');
    } catch {
        // Not JSON after all — fall through to the raw text.
    }
    return raw;
}
