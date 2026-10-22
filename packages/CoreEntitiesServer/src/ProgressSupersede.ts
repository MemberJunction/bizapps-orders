/**
 * Superseding a posted progress observation (golive #260) — the pieces with no I/O.
 *
 * WHY SUPERSEDE EXISTS. `Orders.RecordProgress` refuses an observation dated on or before the last
 * posted one, and a posted observation is immutable. Both are right; together, one mistyped date
 * froze the line until the calendar caught up with the typo. A supersede is the recovery path that
 * keeps immutability: a NEW observation names the one it replaces, the replaced observation's
 * recognition is reversed, and the new catch-up is computed as if it had never posted. No row is
 * edited. A row is superseded because another row points at it.
 *
 * WHERE THE REVERSAL LANDS ({@link ReversalDate}). On the replaced observation's own date while that
 * month is open, so a mistyped future date nets to zero on the day it names. When that month is
 * closed, on the first day of the first later month that is open: finance's ruling is that a closed
 * period is not reopened by a correction. "Closed" is a month with a Posted batch for the line's
 * company, until finance's books-closed-through date replaces that test.
 *
 * THE REPLACEMENT'S CATCH-UP FOLLOWS IT ({@link CatchUpDate}). When the reversal moves, the catch-up
 * books no earlier than the reversal's date, so nothing new posts into the closed month. The
 * observation keeps the date the supervisor chose; only its entry moves.
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
    /** Recognition taken back out by the reversal — the replaced observation's delta, negated. */
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
 * The date the reversal of `replacedDate` is booked on.
 *
 * `replacedDate` itself while its month is not in `postedMonths`; otherwise day 1 of the first later
 * month that is not. `postedMonths` holds `YYYY-MM` keys: the months with a Posted batch for the
 * line's company. Months are stepped on the date's own parts, never through a local-time `Date`.
 */
export function ReversalDate(replacedDate: string, postedMonths: Iterable<string>): string {
    const closed = new Set(postedMonths);
    const day = replacedDate.slice(0, 10);
    let [y, m] = day.split('-').map(Number);
    let key = day.slice(0, 7);
    if (!closed.has(key)) return day;
    // Finite: every step leaves one more key of a finite set behind.
    while (closed.has(key)) {
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
        key = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    }
    return `${key}-01`;
}

/**
 * The date a supersede's catch-up is booked on.
 *
 * `measurementDate` itself while the replaced observation's month is open — `firstOpenDate`, from
 * {@link ReversalDate}, is then the replaced date. When that month is closed, the later of
 * `measurementDate` and `firstOpenDate`: a replacement dated into the closed month books on the
 * first open day, and one dated after it keeps its own date.
 */
export function CatchUpDate(measurementDate: string, replacedDate: string, firstOpenDate: string): string {
    const day = measurementDate.slice(0, 10);
    if (firstOpenDate === replacedDate.slice(0, 10)) return day;
    return day < firstOpenDate ? firstOpenDate : day;
}

/**
 * The "are you sure?" for a measurement date after today — or null.
 *
 * Warns, never blocks: forward dating is allowed with no cap. It exists because a mistyped year
 * posts silently and only surfaces when the next attestation is refused. `today` is the BUSINESS
 * calendar day (`BusinessTimeZoneEngine.Today()`), not the server clock's.
 */
export function FutureDateWarning(measurementDate: string, today: string): string | null {
    const day = measurementDate.slice(0, 10);
    const now = today.slice(0, 10);
    if (day <= now) return null;
    return (
        `Measurement date ${day} is after today (${now}). Are you sure? Nothing is blocked, but no ` +
        `later observation can be dated on or before it — check the year and month before posting.`
    );
}

/**
 * The "are you sure?" for a measurement date two or more months before the current month — or null.
 *
 * Warns, never blocks. The prior month and anything earlier in the current month are ordinary (a
 * month's progress is attested after it ends; a project can finish mid-month), so neither warns.
 * Whether a month is CLOSED is not decided here: that is finance's books-closed-through date, a
 * refusal rather than a warning. `today` is the BUSINESS calendar day.
 */
export function BackDatedWarning(measurementDate: string, today: string): string | null {
    const day = measurementDate.slice(0, 10);
    const floor = PriorMonthStart(today);
    if (day >= floor) return null;
    return (
        `Measurement date ${day} is two or more months before the current month (${today.slice(0, 7)}). ` +
        `Are you sure? Nothing is blocked — check the date before posting.`
    );
}

/** Day 1 of the month before the one containing `isoDate`, stepped on the date's own parts. */
function PriorMonthStart(isoDate: string): string {
    let [y, m] = isoDate.slice(0, 10).split('-').map(Number);
    m -= 1;
    if (m < 1) {
        m = 12;
        y -= 1;
    }
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
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
