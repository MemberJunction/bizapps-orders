import { describe, expect, it } from 'vitest';
import {
    CheckAnswersAgainstQuestions,
    CheckCheckoutAnswers,
    INVALID_CHECKOUT_QUESTIONS_MESSAGE,
    MAX_CHECKOUT_ANSWER_LENGTH,
    ReadCheckoutQuestions,
    type CheckoutQuestion,
} from '../checkout-questions.js';

const SOURCE: CheckoutQuestion = {
    key: 'source',
    label: 'How did you hear about us?',
    type: 'select',
    options: ['Search', { value: 'referral', label: 'A colleague' }, 'Other'],
    required: true,
    otherOptionKey: 'Other',
};
const NOTE: CheckoutQuestion = { key: 'note', label: 'Anything else?', type: 'text', maxLength: 10 };

describe('ReadCheckoutQuestions', () => {
    it('reads no questions when the widget asks none', () => {
        expect(ReadCheckoutQuestions(undefined)).toEqual({ Questions: [] });
        expect(ReadCheckoutQuestions(null)).toEqual({ Questions: [] });
    });

    it('accepts a well-formed list', () => {
        expect(ReadCheckoutQuestions([SOURCE, NOTE])).toEqual({ Questions: [SOURCE, NOTE] });
    });

    it.each([
        ['not an array', { key: 'x' }],
        ['a duplicate key', [NOTE, { ...NOTE, label: 'Again' }]],
        ['an unknown type', [{ ...NOTE, type: 'number' }]],
        ['a select with no options', [{ ...SOURCE, options: [] }]],
        ['duplicate option values', [{ ...SOURCE, options: ['A', 'A'] }]],
        ['an otherOptionKey that is not an option', [{ ...SOURCE, otherOptionKey: 'Elsewhere' }]],
        ['options on a text question', [{ ...NOTE, options: ['A'] }]],
        ['a blank label', [{ ...NOTE, label: ' ' }]],
        ['a key longer than the column', [{ ...NOTE, key: 'k'.repeat(101) }]],
        ['a non-integer maxLength', [{ ...NOTE, maxLength: 2.5 }]],
    ])('refuses %s rather than dropping it', (_name, raw) => {
        expect(ReadCheckoutQuestions(raw)).toEqual({ Questions: [], Error: INVALID_CHECKOUT_QUESTIONS_MESSAGE });
    });
});

describe('CheckAnswersAgainstQuestions', () => {
    it('refuses a missing required answer', () => {
        expect(CheckAnswersAgainstQuestions([SOURCE], undefined).Error).toBe('"How did you hear about us?" needs an answer.');
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: '  ' } }).Error).toBe(
            '"How did you hear about us?" needs an answer.',
        );
    });

    it('skips an unanswered optional question', () => {
        expect(CheckAnswersAgainstQuestions([NOTE], {})).toEqual({ Answers: [] });
    });

    it('records a select answer by its option value, with the label as asked', () => {
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'referral' } })).toEqual({
            Answers: [{ QuestionKey: 'source', QuestionLabel: 'How did you hear about us?', Answer: 'referral', OtherText: null }],
        });
    });

    it('refuses a select answer that is not one of its options', () => {
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'A colleague' } }).Error).toBe(
            '"A colleague" is not one of the choices for "How did you hear about us?".',
        );
    });

    it('requires the text answer when the buyer chooses Other', () => {
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'Other' } }).Error).toBe(
            'Please say more about your answer to "How did you hear about us?".',
        );
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'Other', OtherText: ' A podcast ' } }).Answers).toEqual([
            { QuestionKey: 'source', QuestionLabel: 'How did you hear about us?', Answer: 'Other', OtherText: 'A podcast' },
        ]);
    });

    it('drops text sent alongside an option other than Other', () => {
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'Search', OtherText: 'stray' } }).Answers[0].OtherText).toBeNull();
    });

    it('refuses an answer for a question the widget does not ask', () => {
        expect(CheckAnswersAgainstQuestions([NOTE], { note: { Value: 'hi' }, forged: { Value: 'x' } }).Error).toBe(
            'An answer was sent for a question this checkout does not ask.',
        );
    });

    it('refuses answers longer than the question accepts', () => {
        expect(CheckAnswersAgainstQuestions([NOTE], { note: { Value: 'x'.repeat(11) } }).Error).toBe(
            'The answer to "Anything else?" is too long (at most 10 characters).',
        );
        const other = 'x'.repeat(MAX_CHECKOUT_ANSWER_LENGTH + 1);
        expect(CheckAnswersAgainstQuestions([SOURCE], { source: { Value: 'Other', OtherText: other } }).Error).toContain('too long');
    });

    it('refuses answers that are not an object', () => {
        expect(CheckAnswersAgainstQuestions([NOTE], ['x']).Error).toBe('The checkout answers could not be read.');
        expect(CheckAnswersAgainstQuestions([NOTE], { note: 'hi' }).Error).toBe('The answer to "Anything else?" could not be read.');
    });

    it('returns answers in the widget order', () => {
        const check = CheckAnswersAgainstQuestions([SOURCE, NOTE], { note: { Value: 'hi' }, source: { Value: 'Search' } });
        expect(check.Answers.map((a) => a.QuestionKey)).toEqual(['source', 'note']);
    });
});

describe('CheckCheckoutAnswers', () => {
    it('refuses every answer when the question list is malformed', () => {
        expect(CheckCheckoutAnswers('not a list', {})).toEqual({ Answers: [], Error: INVALID_CHECKOUT_QUESTIONS_MESSAGE });
    });
});
