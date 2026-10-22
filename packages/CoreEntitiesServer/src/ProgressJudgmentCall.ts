/**
 * `PROGRESS_JUDGMENT_CALL` — the finance exception an attestation raises when it is the kind of
 * number a second person should look at (golive #279, type 1).
 *
 * NOTHING HERE BLOCKS POSTING. The observation posts, its catch-up entry posts, and the observation
 * also lands on accounting's review list. Three things make an observation a judgment call, and
 * each is switched and sized by finance through the type's Configuration, not by this code:
 *
 *   FlagBackwardSlide           the catch-up is negative — revenue comes back out
 *   FlagFirstObservation        the line had no earlier posted observation
 *   MaxSingleObservationAmount  |RecognitionAmount| is above this
 *
 * One exception per observation, whose summary names every reason that applied.
 *
 * RAISED INSIDE `Orders.RecordProgress`'S TRANSACTION, after the observation is written, and a
 * failure to raise fails the attestation: accounting's operation joins the caller's transaction,
 * so the row and the exception commit together or not at all, and a judgment call is never posted
 * without its review row. `Preview` never reaches this.
 *
 * A type that accounting does not define, or has switched off, raises nothing. A switch or limit
 * missing from the Configuration disables that one check rather than inventing a default.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GetActiveFinanceExceptionType, RaiseFinanceExceptions } from './AccountingBridge.js';
import { ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from './entity-names.js';

export const PROGRESS_JUDGMENT_CALL = 'PROGRESS_JUDGMENT_CALL';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** The type's Configuration, read strictly: a switch is on only when it is literally `true`. */
export interface JudgmentCallConfig {
    FlagBackwardSlide: boolean;
    FlagFirstObservation: boolean;
    /** Null when the configuration sets no limit, which disables the amount check. */
    MaxSingleObservationAmount: number | null;
}

export function ReadJudgmentCallConfig(configuration: Record<string, unknown>): JudgmentCallConfig {
    const max = configuration.MaxSingleObservationAmount;
    return {
        FlagBackwardSlide: configuration.FlagBackwardSlide === true,
        FlagFirstObservation: configuration.FlagFirstObservation === true,
        MaxSingleObservationAmount: typeof max === 'number' && Number.isFinite(max) ? max : null,
    };
}

export interface JudgmentCallFacts {
    /** The signed catch-up this observation posted. */
    RecognitionAmount: number;
    /** True when the line had no earlier Posted observation. */
    IsFirstObservation: boolean;
}

/** Every reason this observation is a judgment call, in a fixed order; empty when it is not one. */
export function JudgmentCallReasons(config: JudgmentCallConfig, facts: JudgmentCallFacts): string[] {
    const amount = money(facts.RecognitionAmount);
    const reasons: string[] = [];
    if (config.FlagBackwardSlide && amount < 0) {
        reasons.push(`backward slide (${amount.toFixed(2)} taken back out of revenue)`);
    }
    if (config.FlagFirstObservation && facts.IsFirstObservation) {
        reasons.push('first observation on the line');
    }
    if (config.MaxSingleObservationAmount !== null && Math.abs(amount) > config.MaxSingleObservationAmount) {
        reasons.push(
            `${Math.abs(amount).toFixed(2)} is above the single-observation limit of ${config.MaxSingleObservationAmount.toFixed(2)}`,
        );
    }
    return reasons;
}

/** The posted observation, as `Orders.RecordProgress` holds it right after writing the row. */
export interface PostedObservation {
    ObservationID: string;
    OrderLineID: string;
    OrderNumber: string;
    LineNumber: number;
    CompanyID: string;
    /** `YYYY-MM-DD`. */
    MeasurementDate: string;
    PercentComplete: number;
    RecognitionAmount: number;
    IsFirstObservation: boolean;
    /** Who signed the observation. */
    AttestedByUserID: string;
}

export interface JudgmentCallOutcome {
    /** Empty when the observation is not a judgment call, or the type is missing or inactive. */
    Reasons: string[];
    FinanceExceptionID?: string;
    /** False when accounting already held this observation's exception. */
    Created: boolean;
}

/**
 * Raise the observation's judgment-call exception if any reason applies.
 *
 * @throws when accounting cannot be reached or refuses the raise — the caller rolls back
 */
export async function RaiseProgressJudgmentCall(
    observation: PostedObservation,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<JudgmentCallOutcome> {
    const type = await GetActiveFinanceExceptionType(PROGRESS_JUDGMENT_CALL, provider, user);
    if (!type) return { Reasons: [], Created: false };

    const reasons = JudgmentCallReasons(ReadJudgmentCallConfig(type.Configuration), observation);
    if (reasons.length === 0) return { Reasons: [], Created: false };

    const percent = `${(observation.PercentComplete * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
    const outcome = await RaiseFinanceExceptions(
        [
            {
                TypeCode: PROGRESS_JUDGMENT_CALL,
                SourceEntityName: ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY,
                SourceRecordID: observation.ObservationID,
                CompanyID: observation.CompanyID,
                Amount: money(observation.RecognitionAmount),
                ExceptionDate: observation.MeasurementDate,
                Summary:
                    `Progress on order ${observation.OrderNumber} line ${observation.LineNumber} attested at ${percent} ` +
                    `for ${observation.MeasurementDate}, posting ${money(observation.RecognitionAmount).toFixed(2)}: ` +
                    `${reasons.join('; ')}.`,
                DedupeKey: observation.ObservationID,
                SourceCreatedByUserID: observation.AttestedByUserID,
                CreatorUnresolved: false,
            },
        ],
        'the progress judgment-call exception',
        provider,
        user,
    );
    const result = outcome.Results?.[0];
    return { Reasons: reasons, FinanceExceptionID: result?.FinanceExceptionID, Created: result?.Created ?? false };
}
