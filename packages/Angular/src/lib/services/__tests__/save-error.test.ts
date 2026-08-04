import { describe, expect, it } from 'vitest';
import { ReadableSaveError } from '../save-error';

/**
 * The save path throws with a SERIALISED validation result, so `error.message` is
 * a JSON blob. A user who clicked Save saw this across the footer:
 *
 *   Nothing was saved. {"Source":"OrderNumber","Message":"Order Number cannot be
 *   null","Value":null,"Type":"Failure"}
 *
 * Everything they needed was the one sentence in the middle. These pin the
 * extraction AND the fallbacks, because the failure mode that matters is not
 * "ugly" — it is swallowing an error we failed to parse.
 */
describe('ReadableSaveError', () => {
    it('pulls the sentence out of the real serialised failure', () => {
        const thrown = new Error(
            '{"Source":"OrderNumber","Message":"Order Number cannot be null","Value":null,"Type":"Failure"}',
        );
        expect(ReadableSaveError(thrown)).toBe('Order Number cannot be null');
    });

    it('handles a prefix before the JSON, which is how the save path throws', () => {
        const thrown = new Error('Save refused: {"Message":"Company is required","Type":"Failure"}');
        expect(ReadableSaveError(thrown)).toBe('Company is required');
    });

    it('lists several complaints rather than running them together', () => {
        const thrown = new Error(
            '[{"Message":"Order Number cannot be null"},{"Message":"Company is required"}]',
        );
        expect(ReadableSaveError(thrown)).toBe('Order Number cannot be null · Company is required');
    });

    it('keeps a plain message untouched', () => {
        expect(ReadableSaveError(new Error('Network request failed'))).toBe('Network request failed');
    });

    // The important negatives: never swallow. An error we cannot parse is still
    // more useful on screen than an empty banner.
    it('falls back to the raw text when the JSON is malformed', () => {
        const thrown = new Error('{"Message":"unterminated');
        expect(ReadableSaveError(thrown)).toBe('{"Message":"unterminated');
    });

    it('falls back when the JSON parses but carries no Message', () => {
        const thrown = new Error('{"Source":"OrderNumber","Type":"Failure"}');
        expect(ReadableSaveError(thrown)).toBe('{"Source":"OrderNumber","Type":"Failure"}');
    });

    it('handles a non-Error being thrown', () => {
        expect(ReadableSaveError('something went wrong')).toBe('something went wrong');
    });
});
