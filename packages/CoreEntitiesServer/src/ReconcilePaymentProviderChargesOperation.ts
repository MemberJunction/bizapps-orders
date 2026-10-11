/**
 * Orders.ReconcilePaymentProviderCharges — match a gateway's charges and refunds to Orders' payments
 * (#477).
 *
 * For a window of business days, lists the gateway's charges and refunds and matches them to
 * `PaymentIntent` and the captured `PaymentHeader` by intent and charge id. It reports three kinds of
 * mismatch (see `ChargeReconciliation.ts`) and corrects none of them.
 *
 * PREVIEW REPORTS, A REAL RUN RAISES. With `Preview`, the mismatches come back in the output and
 * nothing is written. Without it, each is raised as a `PROVIDER_CHARGE_MISMATCH` finance exception —
 * finance already works that list, and a report nobody opens is what the audit criticised. The raise
 * is idempotent per mismatch and amount, so the nightly run raises nothing new until something
 * changes. The scheduled job ships disabled and set to Preview.
 *
 * ONLY LIVE PROVIDERS. A provider in test mode runs the stub driver, which has no charges to list; a
 * provider holding a gateway test key is live in this sense and is reconciled.
 *
 * WHAT THE GATEWAY KEY NEEDS. Read access to charges and refunds. A restricted production key without
 * it fails here with the gateway's own message, per provider, and the other providers still run.
 *
 * CONNECTS TO:
 *   PURE:    ./ChargeReconciliation.ts
 *   DRIVER:  ./BasePaymentProvider.ts `ListCharges`, `ListRefunds`, `RetrieveCharge`
 *   REVIEW:  ./AccountingBridge.ts
 *   ACTION:  packages/Server/src/custom/reconcile-payment-provider-charges.action.ts
 */
import {
    BaseRemotableOperation,
    IMetadataProvider,
    IRunViewProvider,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersReconcilePaymentProviderChargesOperation as OrdersReconcilePaymentProviderChargesOperationBase,
    ToISODate,
    type OrdersReconcilePaymentProviderChargesInput,
    type OrdersReconcilePaymentProviderChargesOutput,
} from '@mj-biz-apps/orders-entities';
import { GetActiveFinanceExceptionType, RaiseFinanceExceptions, type FinanceExceptionToRaise } from './AccountingBridge.js';
import type { BasePaymentProvider, GatewayCharge } from './BasePaymentProvider.js';
import { CalendarDayOrToday } from './calendar-day.js';
import {
    ChargeMismatchDedupeKey,
    CreatedInWindow,
    FindChargeMismatches,
    GatewayWindow,
    type ChargeMismatch,
    type ReconcilablePayment,
} from './ChargeReconciliation.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { EscapeSQLString, RequireOptionalDay, RequireUUID } from './sql-guards.js';

export const PROVIDER_CHARGE_MISMATCH_TYPE_CODE = 'PROVIDER_CHARGE_MISMATCH';
const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';

/** Days of look-back when the caller names no start: a week, so a missed night is caught the next. */
const DEFAULT_WINDOW_DAYS = 7;
/** Padding on the gateway read, so a payment dated near midnight in any time zone finds its charge. */
const GATEWAY_PAD_DAYS = 2;
const ID_BATCH = 200;
const RAISE_BATCH = 100;

type ProviderResult = OrdersReconcilePaymentProviderChargesOutput['Providers'][number];

@RegisterClass(BaseRemotableOperation, 'Orders.ReconcilePaymentProviderCharges')
export class ReconcilePaymentProviderChargesOperation extends OrdersReconcilePaymentProviderChargesOperationBase {
    protected async InternalExecute(
        input: OrdersReconcilePaymentProviderChargesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersReconcilePaymentProviderChargesOutput> {
        if (input.PaymentProviderID) RequireUUID(input.PaymentProviderID, 'PaymentProviderID');
        RequireOptionalDay(input.FromDate, 'FromDate');
        RequireOptionalDay(input.ToDate, 'ToDate');
        const toDate = ToISODate(await CalendarDayOrToday(input.ToDate, provider, user)) as string;
        const fromDate = input.FromDate ? (ToISODate(input.FromDate) as string) : shiftDay(toDate, -(DEFAULT_WINDOW_DAYS - 1));
        const preview = input.Preview !== false;

        const out: OrdersReconcilePaymentProviderChargesOutput = {
            Success: true,
            Preview: preview,
            FromDate: fromDate,
            ToDate: toDate,
            Providers: [],
            Mismatches: [],
            Raised: 0,
            AlreadyRaised: 0,
            Errors: [],
        };
        if (fromDate > toDate) {
            out.Success = false;
            out.Errors.push({ Code: 'INVALID_WINDOW', Message: `FromDate ${fromDate} is after ToDate ${toDate}.` });
            return out;
        }

        for (const row of await this.loadProviders(input.PaymentProviderID ?? null, provider, user)) {
            const result: ProviderResult = { PaymentProviderID: row.ID, PaymentProviderName: row.Name, Status: 'Checked', ChargesRead: 0, RefundsRead: 0, Mismatches: 0 };
            try {
                const config = await LoadPaymentProviderConfig(row.ID, provider, user);
                if (!config.IsLiveMode) {
                    result.Status = 'Skipped';
                    result.Message = 'Test mode: the stub driver has no charges to read.';
                    out.Providers.push(result);
                    continue;
                }
                const driver = await BuildPaymentProvider(config, provider, user);
                const mismatches = await this.reconcileOne(driver, row.ID, config.CompanyID, fromDate, toDate, result, provider, user);
                result.Mismatches = mismatches.length;
                out.Mismatches.push(...mismatches.map((m) => ({ ...m, PaymentProviderID: row.ID })));
            } catch (err) {
                result.Status = 'Error';
                result.Message = err instanceof Error ? err.message : String(err);
                out.Errors.push({ PaymentProviderID: row.ID, Code: 'PROVIDER_FAILED', Message: result.Message });
            }
            out.Providers.push(result);
        }

        if (!preview && out.Mismatches.length > 0) {
            await this.raise(out, toDate, provider, user);
        }

        out.Success = out.Errors.length === 0;
        out.Message =
            `${out.Mismatches.length} mismatch(es) between ${fromDate} and ${toDate} across ` +
            `${out.Providers.filter((p) => p.Status === 'Checked').length} provider(s)` +
            (preview ? ' (preview: nothing raised).' : `: ${out.Raised} raised, ${out.AlreadyRaised} already raised.`) +
            (out.Errors.length ? ` ${out.Errors.length} error(s) — see Errors.` : '');
        LogStatus(`Orders.ReconcilePaymentProviderCharges: ${out.Message}`);
        return out;
    }

    private async reconcileOne(
        driver: BasePaymentProvider,
        paymentProviderID: string,
        providerCompanyID: string,
        fromDate: string,
        toDate: string,
        result: ProviderResult,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ChargeMismatch[]> {
        const window = GatewayWindow(fromDate, toDate, GATEWAY_PAD_DAYS);
        const listed = await driver.ListCharges({ CreatedFrom: window.From, CreatedTo: window.To });
        if (!listed.Success) throw new Error(`Could not list the gateway's charges: ${listed.Reason}`);
        const refunds = await driver.ListRefunds({ CreatedFrom: window.From, CreatedTo: window.To });
        if (!refunds.Success) throw new Error(`Could not list the gateway's refunds: ${refunds.Reason}`);
        result.ChargesRead = listed.Charges?.length ?? 0;
        result.RefundsRead = refunds.Refunds?.length ?? 0;

        const charges = new Map<string, GatewayCharge>((listed.Charges ?? []).map((c) => [c.ProviderChargeID, c]));
        const inWindow = new Set([...charges.values()].filter((c) => CreatedInWindow(c, fromDate, toDate)).map((c) => c.ProviderChargeID));
        // A refund in the window can be against an older charge; read that charge too.
        for (const refund of refunds.Refunds ?? []) {
            if (refund.ProviderChargeID && !charges.has(refund.ProviderChargeID)) {
                const read = await driver.RetrieveCharge({ ProviderChargeID: refund.ProviderChargeID });
                if (read.Success && read.Charge) charges.set(read.Charge.ProviderChargeID, read.Charge);
            }
        }

        const payments = await this.loadPayments(paymentProviderID, fromDate, toDate, [...charges.keys()], provider, user);
        // A payment in the window whose charge the listing did not return is read directly before it is
        // called missing: the charge may predate the padded window.
        const confirmedMissing = new Set<string>();
        for (const p of payments) {
            if (p.Status !== 'Captured' || !p.ProviderChargeID || charges.has(p.ProviderChargeID)) continue;
            if (p.PaymentDate < fromDate || p.PaymentDate > toDate) continue;
            const read = await driver.RetrieveCharge({ ProviderChargeID: p.ProviderChargeID });
            if (read.Success && read.Charge) charges.set(read.Charge.ProviderChargeID, read.Charge);
            else if (read.NotFound) confirmedMissing.add(p.ProviderChargeID);
            else throw new Error(`Could not read charge ${p.ProviderChargeID} from the gateway: ${read.Reason}`);
        }

        const intentIDs = await this.loadIntentIDs(
            [...charges.values()].map((c) => c.ProviderIntentID).filter((id): id is string => !!id),
            provider,
            user,
        );
        return FindChargeMismatches({
            FromDate: fromDate,
            ToDate: toDate,
            Charges: [...charges.values()],
            ChargesInWindow: inWindow,
            Payments: payments,
            ConfirmedMissing: confirmedMissing,
            IntentIDs: intentIDs,
        }).map((m) => ({ ...m, CompanyID: m.CompanyID ?? providerCompanyID }));
    }

    private async raise(
        out: OrdersReconcilePaymentProviderChargesOutput,
        exceptionDate: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const type = await GetActiveFinanceExceptionType(PROVIDER_CHARGE_MISMATCH_TYPE_CODE, provider, user);
        if (!type) {
            out.Errors.push({
                Code: 'TYPE_INACTIVE',
                Message: `The ${PROVIDER_CHARGE_MISMATCH_TYPE_CODE} finance exception type is not defined or is inactive, so the mismatches were not raised.`,
            });
            return;
        }
        const exceptions: FinanceExceptionToRaise[] = out.Mismatches.map((m) => ({
            TypeCode: PROVIDER_CHARGE_MISMATCH_TYPE_CODE,
            // The most specific record Orders has: the payment, else the intent, else the provider.
            SourceEntityName: m.PaymentHeaderID ? PAYMENT_HEADER_ENTITY : m.PaymentIntentID ? PAYMENT_INTENT_ENTITY : PAYMENT_PROVIDER_ENTITY,
            SourceRecordID: m.PaymentHeaderID ?? m.PaymentIntentID ?? m.PaymentProviderID,
            CompanyID: m.CompanyID as string,
            Amount: m.Amount,
            ExceptionDate: exceptionDate,
            Summary: m.Detail,
            DedupeKey: ChargeMismatchDedupeKey(m),
            SourceCreatedByUserID: null,
            CreatorUnresolved: false,
        }));
        for (let start = 0; start < exceptions.length; start += RAISE_BATCH) {
            const batch = exceptions.slice(start, start + RAISE_BATCH);
            try {
                const result = await RaiseFinanceExceptions(batch, 'gateway charge mismatches', provider, user);
                for (const r of result.Results) {
                    if (r.Created) out.Raised++;
                    else out.AlreadyRaised++;
                }
            } catch (err) {
                out.Errors.push({ Code: 'RAISE_FAILED', Message: err instanceof Error ? err.message : String(err) });
            }
        }
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    private async loadProviders(
        paymentProviderID: string | null,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Array<{ ID: string; Name: string }>> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; Name: string; PaymentProviderTypeID: string }>(
            {
                EntityName: PAYMENT_PROVIDER_ENTITY,
                ExtraFilter: paymentProviderID ? `ID = '${paymentProviderID}' AND IsActive = 1` : 'IsActive = 1',
                Fields: ['ID', 'Name', 'PaymentProviderTypeID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) throw new Error(`Could not read the payment providers: ${result.ErrorMessage}`);
        // Only gateways that collect: a recorded rail (Bill.com) or a manual provider has no charges.
        const out: Array<{ ID: string; Name: string }> = [];
        for (const row of result.Results ?? []) {
            try {
                const config = await LoadPaymentProviderConfig(row.ID, provider, user);
                const driver = await BuildPaymentProvider(config, provider, user);
                if (driver.ListsCharges) out.push({ ID: row.ID, Name: row.Name });
            } catch {
                // Kept, so the per-provider run reports why it cannot be built instead of dropping it.
                out.push({ ID: row.ID, Name: row.Name });
            }
        }
        return out;
    }

    /** The provider's original payments dated in the window, plus any whose charge id was read. */
    private async loadPayments(
        paymentProviderID: string,
        fromDate: string,
        toDate: string,
        chargeIDs: string[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ReconcilablePayment[]> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const fields = ['ID', 'PaymentNumber', 'ReceivingCompanyID', 'PaymentDate', 'Amount', 'Status', 'ProviderChargeID', 'PaymentIntentID'];
        const byID = new Map<string, ReconcilablePayment>();
        const add = (rows: Array<Omit<ReconcilablePayment, 'RefundedAmount' | 'PaymentDate'> & { PaymentDate: unknown }>) => {
            for (const r of rows) byID.set(r.ID, { ...r, PaymentDate: ToISODate(r.PaymentDate) ?? '', Amount: Number(r.Amount), RefundedAmount: 0 });
        };

        const dated = await rv.RunView<Omit<ReconcilablePayment, 'RefundedAmount' | 'PaymentDate'> & { PaymentDate: unknown }>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter:
                    `PaymentProviderID = '${paymentProviderID}' AND ReversesPaymentHeaderID IS NULL ` +
                    `AND PaymentDate >= '${fromDate}' AND PaymentDate <= '${toDate}'`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!dated.Success) throw new Error(`Could not read the payments: ${dated.ErrorMessage}`);
        add(dated.Results ?? []);

        for (let start = 0; start < chargeIDs.length; start += ID_BATCH) {
            const ids = chargeIDs.slice(start, start + ID_BATCH).map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const byCharge = await rv.RunView<Omit<ReconcilablePayment, 'RefundedAmount' | 'PaymentDate'> & { PaymentDate: unknown }>(
                {
                    EntityName: PAYMENT_HEADER_ENTITY,
                    ExtraFilter: `ReversesPaymentHeaderID IS NULL AND ProviderChargeID IN (${ids})`,
                    Fields: fields,
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            );
            if (!byCharge.Success) throw new Error(`Could not read the payments by charge: ${byCharge.ErrorMessage}`);
            add(byCharge.Results ?? []);
        }

        const paymentIDs = [...byID.keys()];
        for (let start = 0; start < paymentIDs.length; start += ID_BATCH) {
            const ids = paymentIDs.slice(start, start + ID_BATCH).map((id) => `'${id}'`).join(',');
            const refunds = await rv.RunView<{ ReversesPaymentHeaderID: string; Amount: number }>(
                {
                    EntityName: PAYMENT_HEADER_ENTITY,
                    ExtraFilter: `ReversesPaymentHeaderID IN (${ids}) AND Status = 'Refunded' AND ReversalSource = 'Refund'`,
                    Fields: ['ReversesPaymentHeaderID', 'Amount'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            );
            if (!refunds.Success) throw new Error(`Could not read the refunds: ${refunds.ErrorMessage}`);
            for (const r of refunds.Results ?? []) {
                const original = [...byID.values()].find((p) => p.ID.toUpperCase() === r.ReversesPaymentHeaderID.toUpperCase());
                if (original) original.RefundedAmount = Math.round((original.RefundedAmount + Math.abs(Number(r.Amount))) * 100) / 100;
            }
        }
        return [...byID.values()];
    }

    private async loadIntentIDs(providerIntentIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const unique = [...new Set(providerIntentIDs)];
        for (let start = 0; start < unique.length; start += ID_BATCH) {
            const ids = unique.slice(start, start + ID_BATCH).map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const result = await rv.RunView<{ ID: string; ProviderIntentID: string }>(
                {
                    EntityName: PAYMENT_INTENT_ENTITY,
                    ExtraFilter: `ProviderIntentID IN (${ids})`,
                    Fields: ['ID', 'ProviderIntentID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            );
            if (!result.Success) throw new Error(`Could not read the payment intents: ${result.ErrorMessage}`);
            for (const r of result.Results ?? []) map.set(r.ProviderIntentID, r.ID);
        }
        return map;
    }
}

function shiftDay(day: string, days: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Tree-shaking anchor — without it the decorator never runs and the key resolves to nothing. */
export function LoadReconcilePaymentProviderChargesOperation(): void {
    void ReconcilePaymentProviderChargesOperation;
}
