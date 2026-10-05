/**
 * OrderHeaderPaymentSchedule server subclass — two rules the database cannot state (AIDP-24).
 *
 * 1. `CompanyID` IS THE ORDER'S, NEVER AUTHORED (D86, golive #311). An order is invoiced once per
 *    instalment by the company that sold it, whatever company owns each product (D61), so a new row
 *    is stamped with the order header's `CompanyID` whatever the caller sent. The ledger divides the
 *    row among the product companies (`CompanySlices`). A row that already exists keeps its company:
 *    an order that issued an instalment under the old per-company rows finishes on them, and moving
 *    one of its rows would leave that schedule out of tie.
 *
 * 2. THE ROLLUPS ARE THE DATABASE'S. `AmountPaid` and `Balance` are maintained by
 *    `spRecalcOrderHeaderPaymentSchedule`, and `spUpdateOrderHeaderPaymentSchedule` would obey a
 *    stale client copy of them — the same erase-the-total hazard OrderHeader had (golive #186). So
 *    they are re-read from the row before every update, exactly as `OrderEntityServer` does.
 *
 * 3. ONLY THE OPERATION ISSUES (D91). Invoicing is what creates the receivable and posts the
 *    billing entry, so a row may not arrive at `Invoiced` — or acquire an invoice number — by any
 *    route other than `Orders.IssueInstalmentInvoice`. Half-issuing a row by hand froze it with no
 *    journal entry behind it and nothing to show that anything was missing.
 *
 * Everything else — immutability past Scheduled, identity set-once — is a trigger, where a bypassed
 * class cannot reach it. This one cannot be: the trigger sees the same UPDATE either way and has no
 * idea which code path sent it.
 */
import { BaseEntity, BaseEntityResult, EntitySaveOptions, IRunViewProvider, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderPaymentScheduleEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';
import { IsInstalmentIssueInProgress } from './instalmentIssueGuard.js';
import { RequireUUID } from './sql-guards.js';

@RegisterClass(BaseEntity, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY)
export class OrderHeaderPaymentScheduleEntityServer extends mjBizAppsOrdersOrderHeaderPaymentScheduleEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = this.checkIssuedOnlyByOperation() ?? (await this.stampCompany());
        if (problem) {
            // Registered rather than thrown: a refusal is a business outcome the caller reads off
            // LatestResult, the same contract every other save failure in this package uses.
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        if (this.IsSaved) await this.adoptRollupsFromRow();
        return super.Save(options);
    }

    /**
     * Refuse an issue that did not come from `Orders.IssueInstalmentInvoice`.
     *
     * Three transitions count as issuing, because each one on its own leaves a row the trigger will
     * then freeze: advancing `Status` to `Invoiced`, and setting `DocumentNumber` or `InvoicedAt`
     * where the stored row had none. A row created outright as `Invoiced` counts too — the CHECK
     * constraint makes that possible as long as the identity columns come with it.
     *
     * Read from `OldValue`, not from `Dirty`: what matters is the stored row, and a caller that
     * loads, edits and re-sets the same value should pass.
     */
    private checkIssuedOnlyByOperation(): string | null {
        const stored = (name: string): unknown => (this.IsSaved ? this.GetFieldByName(name)?.OldValue : null);

        const advancing = this.Status === 'Invoiced' && stored('Status') !== 'Invoiced';
        const numbering = !!this.DocumentNumber && !stored('DocumentNumber');
        const stamping = !!this.InvoicedAt && !stored('InvoicedAt');
        if (!advancing && !numbering && !stamping) return null;

        if (IsInstalmentIssueInProgress(this.ID)) return null;

        return (
            `An instalment is invoiced through Orders.IssueInstalmentInvoice, which freezes the document ` +
            `number and posts the billing entry in one transaction. Setting ` +
            `${[advancing ? 'Status to Invoiced' : null, numbering ? 'DocumentNumber' : null, stamping ? 'InvoicedAt' : null]
                .filter(Boolean)
                .join(', ')} directly would leave the row frozen with no entry behind it.`
        );
    }

    /** Stamp a new row with the order's `CompanyID`. Returns the refusal when the order cannot be read. */
    private async stampCompany(): Promise<string | null> {
        if (this.IsSaved) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const orderID = RequireUUID(this.OrderHeaderID, 'OrderHeaderID');
        const header = await rv.RunView<{ CompanyID: string }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID='${orderID}'`, Fields: ['CompanyID'], ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        if (!header.Success) return `Could not read the order to place the instalment: ${header.ErrorMessage ?? 'unknown error'}`;
        const companyID = header.Results?.[0]?.CompanyID;
        if (!companyID) return `Order ${orderID} was not found, so the instalment has no company to bill from.`;
        this.CompanyID = companyID;
        return null;
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
