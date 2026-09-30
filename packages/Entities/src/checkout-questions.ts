/**
 * Questions a checkout widget asks the buyer before payment, and the check their answers pass.
 *
 * The questions live in the widget's Configuration (`questions`), not in any entity's columns, so
 * a host can ask "How did you hear about us?" without a schema change. Pure; no database, no
 * provider. The browser runs the same check to gate the Pay button, and the server runs it on the
 * answers it stored before it opens a payment intent or completes the checkout — the server check
 * is the one that counts.
 *
 * Answers are judged against the widget's own question list, never against anything the buyer
 * sent: a key the widget does not ask is refused, and a select answer must be one of its options.
 */

/** One choice of a `select` question. A bare string is both its value and its label. */
export interface CheckoutQuestionOption {
    value: string;
    label: string;
}

export interface CheckoutQuestion {
    /** Stable identifier, recorded on the order as `QuestionKey`. */
    key: string;
    /** The question as the buyer sees it. */
    label: string;
    type: 'select' | 'text';
    /** Required for `select`. */
    options?: Array<string | CheckoutQuestionOption>;
    required?: boolean;
    /**
     * The value of the option that needs a free-text answer ("Other"). Choosing it makes the
     * text answer required. `select` only.
     */
    otherOptionKey?: string;
    /** Longest accepted answer. Defaults to, and may not exceed, {@link MAX_CHECKOUT_ANSWER_LENGTH}. */
    maxLength?: number;
}

/** The buyer's answer to one question, as the checkout edge receives it. */
export interface CheckoutAnswerInput {
    Value?: string;
    /** The free-text answer given after choosing the question's `otherOptionKey` option. */
    OtherText?: string;
}

/** Answers keyed by question key. */
export type CheckoutAnswersInput = Record<string, CheckoutAnswerInput>;

/** An answer that passed the check, shaped as the order records it. */
export interface ResolvedCheckoutAnswer {
    QuestionKey: string;
    QuestionLabel: string;
    Answer: string;
    OtherText: string | null;
}

export interface CheckoutAnswersCheck {
    /** Every answered question, in the widget's question order. Empty when `Error` is set. */
    Answers: ResolvedCheckoutAnswer[];
    /** Why the answers were refused, worded for the buyer. */
    Error?: string;
}

/** Column widths of OrderCheckoutAnswer. */
export const MAX_CHECKOUT_QUESTION_KEY_LENGTH = 100;
export const MAX_CHECKOUT_QUESTION_LABEL_LENGTH = 500;
export const MAX_CHECKOUT_ANSWER_LENGTH = 1000;

/** Message for a widget whose `questions` cannot be read; the checkout is refused, not skipped. */
export const INVALID_CHECKOUT_QUESTIONS_MESSAGE = 'This checkout is not configured correctly (its questions are invalid).';

export function CheckoutQuestionOptionValue(option: string | CheckoutQuestionOption): string {
    return typeof option === 'string' ? option : option.value;
}

export function CheckoutQuestionOptionLabel(option: string | CheckoutQuestionOption): string {
    return typeof option === 'string' ? option : option.label;
}

/**
 * The widget's questions, or an error when `questions` is present but malformed.
 *
 * A malformed list refuses the checkout rather than dropping the bad entries: a required question
 * that silently disappeared would let every order through without the answer the host asked for.
 */
export function ReadCheckoutQuestions(raw: unknown): { Questions: CheckoutQuestion[]; Error?: string } {
    if (raw === undefined || raw === null) return { Questions: [] };
    if (!Array.isArray(raw)) return { Questions: [], Error: INVALID_CHECKOUT_QUESTIONS_MESSAGE };

    const keys = new Set<string>();
    for (const q of raw as unknown[]) {
        if (!IsValidQuestion(q) || keys.has(q.key)) {
            return { Questions: [], Error: INVALID_CHECKOUT_QUESTIONS_MESSAGE };
        }
        keys.add(q.key);
    }
    return { Questions: raw as CheckoutQuestion[] };
}

function IsValidQuestion(q: unknown): q is CheckoutQuestion {
    if (!q || typeof q !== 'object') return false;
    const c = q as Partial<CheckoutQuestion>;
    if (typeof c.key !== 'string' || !c.key.trim() || c.key.length > MAX_CHECKOUT_QUESTION_KEY_LENGTH) return false;
    if (typeof c.label !== 'string' || !c.label.trim() || c.label.length > MAX_CHECKOUT_QUESTION_LABEL_LENGTH) return false;
    if (c.maxLength !== undefined && (!Number.isInteger(c.maxLength) || c.maxLength < 1)) return false;
    if (c.type === 'text') return c.options === undefined && c.otherOptionKey === undefined;
    if (c.type !== 'select') return false;
    if (!Array.isArray(c.options) || c.options.length === 0) return false;
    const values = new Set<string>();
    for (const o of c.options) {
        const value = typeof o === 'string' ? o : o && typeof o === 'object' ? o.value : undefined;
        const label = typeof o === 'string' ? o : o && typeof o === 'object' ? o.label : undefined;
        if (typeof value !== 'string' || !value || typeof label !== 'string' || !label || values.has(value)) return false;
        if (value.length > MAX_CHECKOUT_ANSWER_LENGTH) return false;
        values.add(value);
    }
    return c.otherOptionKey === undefined || values.has(c.otherOptionKey);
}

/** Longest answer a question accepts: its own `maxLength`, capped at the column width. */
export function CheckoutAnswerMaxLength(question: CheckoutQuestion): number {
    return Math.min(question.maxLength ?? MAX_CHECKOUT_ANSWER_LENGTH, MAX_CHECKOUT_ANSWER_LENGTH);
}

/**
 * Check the buyer's answers against the widget's questions.
 *
 * Refuses: answers that are not an object, a key the widget does not ask, a missing required
 * answer, a select answer that is not one of its options, the "Other" option without its text,
 * and an answer longer than the question accepts. Answers are trimmed; text given alongside an
 * option other than "Other" is dropped.
 */
export function CheckAnswersAgainstQuestions(questions: CheckoutQuestion[], answers: unknown): CheckoutAnswersCheck {
    const refuse = (error: string): CheckoutAnswersCheck => ({ Answers: [], Error: error });

    if (answers !== undefined && answers !== null && (typeof answers !== 'object' || Array.isArray(answers))) {
        return refuse('The checkout answers could not be read.');
    }
    const input = (answers ?? {}) as Record<string, unknown>;

    const asked = new Set(questions.map((q) => q.key));
    for (const key of Object.keys(input)) {
        if (!asked.has(key)) return refuse('An answer was sent for a question this checkout does not ask.');
    }

    const resolved: ResolvedCheckoutAnswer[] = [];
    for (const q of questions) {
        const raw = input[q.key];
        if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
            return refuse(`The answer to "${q.label}" could not be read.`);
        }
        const entry = (raw ?? {}) as CheckoutAnswerInput;
        const value = typeof entry.Value === 'string' ? entry.Value.trim() : '';
        const otherText = typeof entry.OtherText === 'string' ? entry.OtherText.trim() : '';

        if (!value) {
            if (q.required) return refuse(`"${q.label}" needs an answer.`);
            continue;
        }
        if (value.length > CheckoutAnswerMaxLength(q)) {
            return refuse(`The answer to "${q.label}" is too long (at most ${CheckoutAnswerMaxLength(q)} characters).`);
        }

        let recordedOther: string | null = null;
        if (q.type === 'select') {
            if (!(q.options ?? []).some((o) => CheckoutQuestionOptionValue(o) === value)) {
                return refuse(`"${value}" is not one of the choices for "${q.label}".`);
            }
            if (q.otherOptionKey !== undefined && value === q.otherOptionKey) {
                if (!otherText) return refuse(`Please say more about your answer to "${q.label}".`);
                if (otherText.length > MAX_CHECKOUT_ANSWER_LENGTH) {
                    return refuse(`The answer to "${q.label}" is too long (at most ${MAX_CHECKOUT_ANSWER_LENGTH} characters).`);
                }
                recordedOther = otherText;
            }
        }

        resolved.push({ QuestionKey: q.key, QuestionLabel: q.label, Answer: value, OtherText: recordedOther });
    }
    return { Answers: resolved };
}

/** {@link ReadCheckoutQuestions} then {@link CheckAnswersAgainstQuestions}, for a raw Configuration value. */
export function CheckCheckoutAnswers(rawQuestions: unknown, answers: unknown): CheckoutAnswersCheck {
    const read = ReadCheckoutQuestions(rawQuestions);
    if (read.Error) return { Answers: [], Error: read.Error };
    return CheckAnswersAgainstQuestions(read.Questions, answers);
}
