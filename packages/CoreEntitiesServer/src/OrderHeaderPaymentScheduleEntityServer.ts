/**
 * OrderHeaderPaymentSchedule server subclass — two rules the database cannot state (AIDP-24).
 *
 * 1. `CompanyID` IS DERIVED, NEVER AUTHORED (D86). The row bills for a selling company, and which
 *    company is a fact about the order's lines. A single-company order — nearly all of them — gets
 *    its one company stamped whatever the caller sent. A multi-company order keeps a `CompanyID`
 *    that names one of its line companies and refuses anything else, because there is no honest
 *    way to guess.
 *
 * 2. THE ROLLUPS ARE THE DATABASE'S. `AmountPaid` and `Balance` are maintained by
 *    `spRecalcOrderHeaderPaymentSchedule`, and `spUpdateOrderHeaderPaymentSchedule` would obey a
 *    stale client copy of them — the same erase-the-total hazard OrderHeader had (golive #186). So
 *    they are re-read from the row before every update, exactly as `OrderEntityServer` does.
 *
 * Everything else — immutability past Scheduled, identity set-once — is a trigger, where a bypassed
 * class cannot reach it.
 */
import { BaseEntity, BaseEntityResult, EntitySaveOptions, IRunViewProvider, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderPaymentScheduleEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

@RegisterClass(BaseEntity, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY)
export class OrderHeaderPaymentScheduleEntityServer extends mjBizAppsOrdersOrderHeaderPaymentScheduleEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = await this.stampCompany();
        if (problem) {
            // Registered rather than thrown: a refusal is a business outcome the caller reads off
            // LatestResult, the same contract every other save failure in this package uses.
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        if (this.IsSaved) await this.adoptRollupsFromRow();
        return super.Save(options);
    }

    /** Stamp `CompanyID` from the order's lines. Returns the refusal when it cannot be derived. */
    private async stampCompany(): Promise<string | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const orderID = RequireUUID(this.OrderHeaderID, 'OrderHeaderID');
        const lines = await rv.RunView<{ CompanyID: string }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID='${orderID}'`, Fields: ['CompanyID'], ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        if (!lines.Success) return `Could not read the order's lines to place the instalment: ${lines.ErrorMessage ?? 'unknown error'}`;

        const companies = [...new Set((lines.Results ?? []).map((l) => String(l.CompanyID).toLowerCase()))];
        if (companies.length === 0) {
            // No lines yet (a draft being composed): the header company is the only fact there is.
            const header = await rv.RunView<{ CompanyID: string }>(
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID='${orderID}'`, Fields: ['CompanyID'], ResultType: 'simple' },
                this.ContextCurrentUser,
            );
            const companyID = header.Results?.[0]?.CompanyID;
            if (!companyID) return `Order ${orderID} was not found, so the instalment has no company to bill for.`;
            this.CompanyID = companyID;
            return null;
        }
        if (companies.length === 1) {
            this.CompanyID = (lines.Results ?? [])[0].CompanyID;
            return null;
        }
        const chosen = String(this.CompanyID ?? '').toLowerCase();
        if (companies.includes(chosen)) return null;
        // ponytail: a multi-company order needs the caller to say which company's schedule this row
        // joins; the authoring helper does, a hand-typed row must. Splitting one row across companies
        // is not a thing — that is two rows.
        return `This order sells for ${companies.length} companies; the instalment must name one of them (CompanyID).`;
    }

    /** Copy the trigger-maintained rollups back onto this object so the update cannot erase them. */
    private async adoptRollupsFromRow(): Promise<void> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const fresh = await rv.RunView<{ AmountPaid: number; Balance: number | null }>(
            {
                EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                ExtraFilter: `ID='${RequireUUID(this.ID, 'ID')}'`,
                Fields: ['AmountPaid', 'Balance'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const row = fresh.Results?.[0];
        if (!row) return;
        for (const name of ['AmountPaid', 'Balance']) this.GetFieldByName(name)?.ResetNeverSetFlag();
        this.SetMany({ AmountPaid: row.AmountPaid, Balance: row.Balance }, true, true, true);
    }

    private buildRejection(message: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderHeaderPaymentScheduleEntityServer(): void {
    // intentionally empty
}
