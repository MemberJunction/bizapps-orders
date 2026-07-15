/**
 * revrec — the PURE recognition-DATE waterfall (F4, UPD-2 · dated-entry semantics per MOD-11).
 *
 * Turns a service window into the list of recognition DATES a rev-rec schedule fires on. The AMOUNTS
 * are the straight-line split of the line total (accounting's computeStraightLineSchedule owns that,
 * driven by the number of dates here) — this module owns only the CADENCE:
 *
 *   SingleDate    → ONE recognition on the event date (e.g. an event product; ScheduleCount = 1).
 *   ServicePeriod → monthly ANNIVERSARY dates from the service start through the end (7/13, 8/13, …),
 *                   inclusive of the start month, one per month the service spans. No lapse gaps.
 *
 * Pure (dates in → dates out) so the browser can preview a schedule and the server can persist it.
 *
 * CONNECTS TO:
 *   BRIDGE: CreateRevRecScheduleOperation → Accounting.CreateScheduledJournalEntries (B3.1)
 */

export type RevRecShape = 'SingleDate' | 'ServicePeriod';

export interface RevRecWaterfallInput {
  Shape: RevRecShape;
  /** Service start (also the first recognition for ServicePeriod). */
  StartDate: Date;
  /** Service end (inclusive month) — required for ServicePeriod. */
  EndDate?: Date;
  /** The single recognition date for SingleDate (defaults to StartDate). */
  EventDate?: Date;
}

/** The recognition dates (ISO yyyy-mm-dd, UTC) the schedule fires on. Never empty for valid input. */
export function computeRecognitionDates(input: RevRecWaterfallInput): string[] {
  if (input.Shape === 'SingleDate') {
    return [isoDate(input.EventDate ?? input.StartDate)];
  }
  return monthlyAnniversaries(input.StartDate, input.EndDate ?? input.StartDate);
}

/** Monthly anniversary dates from start through end (inclusive), anchored on the start day-of-month. */
function monthlyAnniversaries(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const anchorDay = start.getUTCDate();
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const endT = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  // Guard against a bad window (end before start) → at least the start recognition.
  if (endT < Date.UTC(year, month, anchorDay)) return [isoDate(start)];
  // Cap the loop defensively (a service window longer than 50 years is not a thing here).
  for (let i = 0; i < 600; i++) {
    const d = clampedAnniversary(year, month, anchorDay);
    if (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) > endT) break;
    dates.push(isoDate(d));
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return dates.length ? dates : [isoDate(start)];
}

/** The anchor day for a given month, clamped to that month's last day (e.g. 31 → Feb 28/29). */
function clampedAnniversary(year: number, month: number, anchorDay: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

function isoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}
