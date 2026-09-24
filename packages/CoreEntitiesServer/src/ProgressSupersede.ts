/**
 * Superseding a posted progress observation (golive #260) — the pieces with no I/O.
 *
 * WHY SUPERSEDE EXISTS. `Orders.RecordProgress` refuses an observation dated on or before the last
 * posted one, and a posted observation is immutable. Both are right; together, one mistyped date
 * froze the line until the calendar caught up with the typo. A supersede is the recovery path that
 * keeps immutability: a NEW observation names the one it replaces, the replaced observation's
 * recognition is reversed on its own date, and the new catch-up is computed as if it had never
 * posted. No row is edited. A row is superseded because another row points at it.
 *
 * ONLY THE LATEST OBSERVATION CAN BE SUPERSEDED. Recognition is cumulative, so reversing the latest
 * observation's delta restores exactly the total the one before it left. Reversing an older one
 * would unwind a delta that later observations were computed on top of. To back out further,
 * supersede again: each supersede makes the observation before it the latest.
 *
 * CONNECTS TO:
 *   RecordProgressOperation (the transaction) · GetProgressWorklistOperation (what "last" means)
 */
import type { AuthorizationInfo, UserInfo } from '@memberjunction/core';
import { UserHasAuthorization } from '@mj-biz-apps/orders-entities';
import { ComputeCatchUp, type CatchUp } from './RevenueRecognition.js';

export const PROGRESS_SUPERSEDE_AUTH = 'MJ.BizApps.Orders.Progress.Supersede';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** The fields of an observation row that decide which rows still count. */
export interface ObservationLink {
    ID: string;
    SupersedesMeasurementID?: string | null;
}

/**
 * The observations that still count, in the order given — every row no other row supersedes.
 *
 * A superseding row counts; the row it names does not. Callers pass Posted rows oldest first, so the
 * last element is the line's latest observation: the one the ordering guard compares against, the
 * one the worklist shows, and the only one a supersede may name.
 */
export function EffectiveObservations<T extends ObservationLink>(rows: T[]): T[] {
    const superseded = new Set(
        rows.map((r) => r.SupersedesMeasurementID?.toLowerCase()).filter((id): id is string => !!id),
    );
    return rows.filter((r) => !superseded.has(r.ID.toLowerCase()));
}

export interface SupersedePlan {
    /** Recognition taken back out on the replaced observation's date — its delta, negated. */
    Reversal: number;
    /** What the line had recognised before the replaced observation posted. */
    Restored: number;
    /** The new observation's catch-up, computed from `Restored`. */
    CatchUp: CatchUp;
}

/**
 * The arithmetic of a supersede, in the same magnitude space as {@link ComputeCatchUp}.
 *
 * The reversal is the replaced observation's own `RecognitionAmount`, negated — not a recomputation —
 * so the REVENUE the pair recognises nets to exactly zero whatever the rounding history. (Its contra
 * legs are shaped from the line's current billing, so they need not mirror the replaced entry's.)
 * The new catch-up then runs against
 * the restored total, which makes the new observation's `RecognitionAmount` its own delta and nothing
 * else: a later supersede of IT reverses exactly what it posted.
 */
export function PlanSupersede(
    lineAmount: number,
    percentComplete: number,
    recognizedToDate: number,
    replacedRecognitionAmount: number,
): SupersedePlan {
    const reversal = money(-Number(replacedRecognitionAmount ?? 0));
    const restored = money(recognizedToDate + reversal);
    return { Reversal: reversal, Restored: restored, CatchUp: ComputeCatchUp(lineAmount, percentComplete, restored) };
}

/**
 * The last day of the month containing `isoDate`, as `YYYY-MM-DD`.
 *
 * Calendar arithmetic on the date's own parts, never through a local-time `Date`, so the answer
 * does not depend on the host's timezone.
 */
export function MonthEnd(isoDate: string): string {
    const [y, m] = isoDate.slice(0, 10).split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * The advisory for a measurement date after the current business month's end — or null.
 *
 * Warns, never blocks: forward dating is allowed with no cap. `today` is the BUSINESS calendar day
 * (`BusinessTimeZoneEngine.Today()`), so "this month" means the organisation's month, not the
 * server clock's.
 */
export function FutureDateWarning(measurementDate: string, today: string): string | null {
    const monthEnd = MonthEnd(today);
    if (measurementDate <= monthEnd) return null;
    return (
        `Measurement date ${measurementDate} is after the end of the current month (${monthEnd}). ` +
        `Nothing is blocked, but no later observation can be dated on or before it — check the year ` +
        `and month before posting.`
    );
}

/**
 * Why `user` may not supersede, or null when they may.
 *
 * FAILS CLOSED, as {@link UserHasAuthorization} does. A supersede reverses posted revenue, and a
 * missing row means the grant was never installed, not that nobody needs one — so that case gets its
 * own message rather than reading as "you lack the role".
 *
 * Checked on top of `MJ.BizApps.Orders.Progress.Attest`, which `Orders.RecordProgress` requires of
 * every observation first: a supersede is itself an attestation.
 */
export function SupersedeRefusal(user: UserInfo, authorizations: AuthorizationInfo[]): string | null {
    if (!authorizations.some((a) => a.Name === PROGRESS_SUPERSEDE_AUTH)) {
        return (
            `The ${PROGRESS_SUPERSEDE_AUTH} authorization is not installed, so no one can supersede a ` +
            `progress observation. Sync the BizApps Orders metadata to install it.`
        );
    }
    if (!UserHasAuthorization(PROGRESS_SUPERSEDE_AUTH, user, { Authorizations: authorizations })) {
        return (
            `Superseding a posted progress observation needs the ${PROGRESS_SUPERSEDE_AUTH} ` +
            `authorization, held by the Orders Revenue Supervisor role.`
        );
    }
    return null;
}
