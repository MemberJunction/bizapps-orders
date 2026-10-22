/**
 * `Orders.DetectUnattestedProgress` — `PROGRESS_UNATTESTED`, the nightly finance exception for a
 * percentage-of-completion line nobody has attested for too long (golive #279, type 2).
 *
 * A POC line recognises revenue only when somebody attests its progress, so a line left alone
 * recognises nothing and reports nothing: the silence looks exactly like a project with no news.
 * This pass puts such lines on accounting's review list. Nothing is blocked by it.
 *
 * THE SET IS THE PROGRESS WORKLIST'S, not a second query. A line is overdue when it is on the
 * worklist (booked, POC, not yet at 100%), its order is not Voided, and its last posted attestation
 * — or, when it has never been attested, the business day its order was booked — is more than
 * `MaxDaysWithoutAttestation` days before the as-of business day. The threshold is the type's
 * Configuration, owned by accounting; a type accounting does not define or has switched off raises
 * nothing, and an active type with no usable threshold is reported as a failure rather than given
 * a default.
 *
 * ONE EXCEPTION PER LINE PER MONTH. The dedupe key is `<OrderLineID>|<YYYY-MM>` of the as-of day,
 * and accounting's raise is idempotent on it: the second night of a month finds the row the first
 * night created, and a line still unattested next month is raised again for that month.
 *
 * A FAILED RAISE IS REPORTED, not swallowed: the output comes back `Success: false` with the
 * reason, which the Action turns into a failed run.
 *
 * CONNECTS TO:
 *   SELECTION: GetProgressWorklistOperation.Build (./GetProgressWorklistOperation.ts)
 *   RAISE:     GetActiveFinanceExceptionType, RaiseFinanceExceptions (./AccountingBridge.ts)
 *   CALLER:    the `Orders.DetectUnattestedProgress` Action, run by its scheduled job
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    LocalDay,
    OrdersDetectUnattestedProgressOperation as OrdersDetectUnattestedProgressOperationBase,
    type OrdersDetectUnattestedProgressInput,
    type OrdersDetectUnattestedProgressOutput,
    type ProgressWorklistRow,
    type UnattestedProgressLine,
} from '@mj-biz-apps/orders-entities';
import { GetActiveFinanceExceptionType, RaiseFinanceExceptions, type FinanceExceptionToRaise, type RaiseFinanceExceptionsOutcome } from './AccountingBridge.js';
import { ORDER_LINE_ENTITY } from './entity-names.js';
import { GetProgressWorklistOperation } from './GetProgressWorklistOperation.js';
import { DaysBetween } from './InvoiceBehavior.js';
import { BusinessDay } from './PaymentGatedAccess.js';
import { RequireDate } from './sql-guards.js';

export const PROGRESS_UNATTESTED = 'PROGRESS_UNATTESTED';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** `MaxDaysWithoutAttestation` from the type's Configuration, or null when it is not a whole number of at least 0. */
export function ReadMaxDaysWithoutAttestation(configuration: Record<string, unknown>): number | null {
    const v = configuration.MaxDaysWithoutAttestation;
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/** `<OrderLineID>|<YYYY-MM>` — one exception per line per month of the as-of day. */
export function UnattestedDedupeKey(orderLineID: string, asOfDay: string): string {
    return `${orderLineID}|${asOfDay.slice(0, 7)}`;
}

/**
 * The worklist rows overdue for attestation as of `asOfDay`.
 *
 * @param confirmedDayOf the business day of the order's `ConfirmedAt` instant — passed in so the
 *   rule stays a pure function of its inputs
 */
export function SelectUnattestedLines(
    rows: ProgressWorklistRow[],
    asOfDay: string,
    maxDays: number,
    confirmedDayOf: (instant: string) => string,
): UnattestedProgressLine[] {
    const out: UnattestedProgressLine[] = [];
    for (const row of rows) {
        if (row.OrderStatus === 'Voided') continue;
        if (row.LastPercentComplete >= 1) continue;
        const confirmedOn = row.ConfirmedAt ? confirmedDayOf(row.ConfirmedAt) : null;
        const since = row.LastMeasurementDate ?? confirmedOn;
        // A worklist line is booked by construction; one with no readable day to count from is
        // not evidence of neglect, so it is left out rather than guessed at.
        if (!since) continue;
        const days = DaysBetween(since, asOfDay);
        if (days <= maxDays) continue;
        out.push({
            OrderLineID: row.OrderLineID,
            OrderNumber: row.OrderNumber,
            LineNumber: row.LineNumber,
            CompanyID: row.CompanyID,
            LastMeasurementDate: row.LastMeasurementDate ?? null,
            ConfirmedOn: confirmedOn,
            DaysWithoutAttestation: days,
            UnrecognizedAmount: money(Number(row.LineAmount) - Math.abs(Number(row.RecognizedToDate))),
            DedupeKey: UnattestedDedupeKey(row.OrderLineID, asOfDay),
        });
    }
    return out;
}

/** The exception for one overdue line; the creator is the last attester, or none when never attested. */
export function UnattestedException(
    line: UnattestedProgressLine,
    lastAttestedByUserID: string | null | undefined,
    asOfDay: string,
    maxDays: number,
): FinanceExceptionToRaise {
    const since = line.LastMeasurementDate
        ? `last attested ${line.LastMeasurementDate}`
        : `never attested since booking on ${line.ConfirmedOn}`;
    return {
        TypeCode: PROGRESS_UNATTESTED,
        SourceEntityName: ORDER_LINE_ENTITY,
        SourceRecordID: line.OrderLineID,
        CompanyID: line.CompanyID,
        Amount: line.UnrecognizedAmount ?? null,
        ExceptionDate: asOfDay,
        Summary:
            `Progress on order ${line.OrderNumber} line ${line.LineNumber} is ${line.DaysWithoutAttestation} days without ` +
            `attestation (${since}; the limit is ${maxDays} days).`,
        DedupeKey: line.DedupeKey,
        SourceCreatedByUserID: lastAttestedByUserID ?? null,
        CreatorUnresolved: false,
    };
}

@RegisterClass(BaseRemotableOperation, 'Orders.DetectUnattestedProgress')
export class DetectUnattestedProgressOperation extends OrdersDetectUnattestedProgressOperationBase {
    protected async InternalExecute(
        input: OrdersDetectUnattestedProgressInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersDetectUnattestedProgressOutput> {
        let asOf: string;
        try {
            asOf = input?.AsOfDate ? RequireDate(input.AsOfDate, 'AsOfDate') : await BusinessDay(provider, user);
        } catch (e) {
            return this.fail('', e instanceof Error ? e.message : String(e));
        }

        try {
            const type = await GetActiveFinanceExceptionType(PROGRESS_UNATTESTED, provider, user);
            if (!type) {
                return { Success: true, AsOfDate: asOf, TypeInactive: true, Lines: [], Raised: 0, AlreadyRaised: 0, Message: `${PROGRESS_UNATTESTED} is not active in accounting; nothing was raised.` };
            }
            const maxDays = ReadMaxDaysWithoutAttestation(type.Configuration);
            if (maxDays === null) {
                return this.fail(asOf, `${PROGRESS_UNATTESTED} has no usable MaxDaysWithoutAttestation in its Configuration; set a whole number of days.`);
            }

            const worklist = await new GetProgressWorklistOperation().Build({ MaxCount: Number.MAX_SAFE_INTEGER }, provider, user);
            if (!worklist.Success) return this.fail(asOf, worklist.Message ?? 'The progress worklist could not be read.', maxDays);

            // The zone engine is loaded by `BusinessDay`; when the caller named the day it may not be yet.
            await BusinessDay(provider, user);
            const lines = SelectUnattestedLines(worklist.Rows, asOf, maxDays, (instant) => LocalDay(new Date(instant)));
            if (lines.length === 0) {
                return { Success: true, AsOfDate: asOf, TypeInactive: false, MaxDaysWithoutAttestation: maxDays, Lines: [], Raised: 0, AlreadyRaised: 0, Message: 'No percentage-of-completion line is overdue for attestation.' };
            }

            const attesterByLine = new Map(worklist.Rows.map((r) => [r.OrderLineID.toLowerCase(), r.LastAttestedByUserID ?? null]));
            let outcome: RaiseFinanceExceptionsOutcome;
            try {
                outcome = await RaiseFinanceExceptions(
                    lines.map((l) => UnattestedException(l, attesterByLine.get(l.OrderLineID.toLowerCase()), asOf, maxDays)),
                    'the unattested-progress exceptions',
                    provider,
                    user,
                );
            } catch (e) {
                // The lines come back with the failure, so the run record names what went unraised.
                return { ...this.fail(asOf, e instanceof Error ? e.message : String(e), maxDays), Lines: lines };
            }
            let raised = 0;
            let already = 0;
            for (const r of outcome.Results ?? []) {
                const line = lines[r.Index];
                if (!line) continue;
                line.FinanceExceptionID = r.FinanceExceptionID ?? null;
                line.Created = r.Created;
                if (r.Created) raised++;
                else if (!r.Skipped) already++;
            }
            return {
                Success: true,
                AsOfDate: asOf,
                TypeInactive: false,
                MaxDaysWithoutAttestation: maxDays,
                Lines: lines,
                Raised: raised,
                AlreadyRaised: already,
                Message: `${lines.length} line(s) overdue for attestation: ${raised} raised, ${already} already on the review list this month.`,
            };
        } catch (e) {
            return this.fail(asOf, e instanceof Error ? e.message : String(e));
        }
    }

    private fail(asOf: string, message: string, maxDays: number | null = null): OrdersDetectUnattestedProgressOutput {
        return { Success: false, AsOfDate: asOf, TypeInactive: false, MaxDaysWithoutAttestation: maxDays, Lines: [], Raised: 0, AlreadyRaised: 0, Message: message };
    }
}

/** Registers {@link DetectUnattestedProgressOperation}. Called from the server bootstrap. */
export function LoadDetectUnattestedProgressOperation(): void {
    void DetectUnattestedProgressOperation;
}
