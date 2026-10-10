/**
 * Whether a referral program approves a Duration concession (golive #268).
 *
 * A referral's earned time goes on the renewed term, on the renewal order, never on the current one. A Duration
 * concession that names an active program of the order's company, extends a term bought by a renewal line, and
 * adds no more than the program's `DaysPerReferral` is approved by the program. One that adds more, or names an
 * inactive program, is routed like any other concession. Naming a program on anything else is refused.
 *
 * One rule, read in two places: the concession applies it when it is recorded, and `Orders.AmendArrangement`'s
 * preview reports it without writing.
 *
 * CONNECTS TO:
 *   USED BY: OrderConcessionEntityServer (recording) · AmendArrangementOperation (preview)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

export const REFERRAL_PROGRAM_ENTITY = 'MJ_BizApps_Orders: Referral Programs';

export interface ReferralProgramRequest {
    ReferralProgramID: string;
    DeliveryForm: string;
    ReasonCategory: string;
    AddedDays: number;
    /** The order the extended term was bought on. */
    OrderHeaderID: string;
    /** The subscription the extended term's line renews; null when that line is not a renewal. */
    RenewsSubscriptionID: string | null;
}

export interface ReferralProgramVerdict {
    ProgramName: string;
    DaysPerReferral: number;
    /** True when the program approves the concession; false when it is routed like any other. */
    InProgram: boolean;
}

/** The program's verdict on a concession that names it, or why naming it is refused. */
export async function CheckReferralProgram(
    request: ReferralProgramRequest,
    ctx: ApprovalTaskContext,
): Promise<ReferralProgramVerdict | string> {
    if (request.DeliveryForm !== 'Duration') {
        return 'A referral program grants extra time on a renewed term, so only a Duration concession names one.';
    }
    if (request.ReasonCategory !== 'Referral') return "A concession under a referral program has the reason category 'Referral'.";
    const program = await row<{ CompanyID: string; Name: string; DaysPerReferral: number; IsActive: boolean }>(
        ctx,
        REFERRAL_PROGRAM_ENTITY,
        RequireUUID(request.ReferralProgramID, 'ReferralProgramID'),
        ['CompanyID', 'Name', 'DaysPerReferral', 'IsActive'],
    );
    if (!program) return `Referral program ${request.ReferralProgramID} was not found.`;
    const order = await row<{ CompanyID: string }>(ctx, ORDER_HEADER_ENTITY, RequireUUID(request.OrderHeaderID, 'OrderHeaderID'), [
        'CompanyID',
    ]);
    if (!order || !UUIDsEqual(order.CompanyID, program.CompanyID)) {
        return `Referral program '${program.Name}' belongs to another company than this order.`;
    }
    if (!request.RenewsSubscriptionID) {
        return (
            `Referral program '${program.Name}' adds its time to the next term, on the renewal order. This term was not ` +
            `bought by a renewal; record the concession against the renewed term once the renewal is confirmed.`
        );
    }
    const daysPerReferral = Number(program.DaysPerReferral);
    return {
        ProgramName: program.Name,
        DaysPerReferral: daysPerReferral,
        InProgram: !!program.IsActive && Number(request.AddedDays) <= daysPerReferral,
    };
}

async function row<T>(ctx: ApprovalTaskContext, entityName: string, id: string, fields: string[]): Promise<T | null> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>(
        { EntityName: entityName, ExtraFilter: `ID = '${id}'`, Fields: fields, ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    return res?.Results?.[0] ?? null;
}
