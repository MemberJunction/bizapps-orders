/**
 * Orders.ResolveChargeException — book a charge-without-payment finance exception as a paid order and
 * clear it (#567).
 *
 * Finance works gateway charge mismatches in accounting's review list. For a charge the gateway took
 * with nothing in Orders behind it, `Orders.CreateOrderFromProviderPayment` books the paid order, but
 * it takes the provider and the charge id, which a reviewer looking at the exception does not have.
 * This operation takes the exception instead:
 *
 *   1. checks the caller may clear finance exceptions, BEFORE anything is written: an order booked
 *      for an exception its booker cannot clear would leave the month's close blocked by a charge that
 *      is already paid;
 *   2. reads the exception and its type, and takes the provider and charge from it
 *      (`ChargeExceptionResolution.ts`), so the charge booked is always the one the exception names;
 *   3. books the order through `Orders.CreateOrderFromProviderPayment`, unchanged;
 *   4. clears the exception through `Accounting.ClearFinanceException` as Corrected, with a note naming
 *      the order and the payment.
 *
 * A REPEAT FINISHES THE JOB. Booking is one order per charge, and a repeat call returns the order
 * already created. So a clear that failed after the order was booked is retried by running this again,
 * and nothing is booked twice.
 *
 * CONNECTS TO:
 *   PURE:   ./ChargeExceptionResolution.ts
 *   BOOKS:  ./CreateOrderFromProviderPaymentOperation.ts
 *   CLEARS: ./AccountingBridge.ts `ResolveAccountingOperation` → 'Accounting.ClearFinanceException'
 *   RAISED: ./ReconcilePaymentProviderChargesOperation.ts
 */
import {
    AuthorizationEvaluator,
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersResolveChargeExceptionOperation as OrdersResolveChargeExceptionOperationBase,
    type OrdersCreateOrderFromProviderPaymentOutput,
    type OrdersResolveChargeExceptionInput,
    type OrdersResolveChargeExceptionOutput,
} from '@mj-biz-apps/orders-entities';
import { ResolveAccountingOperation } from './AccountingBridge.js';
import {
    ChargeExceptionResolutionNote,
    CheckChargeExceptionForOrder,
    CheckResolveChargeExceptionInput,
    type ChargeExceptionRow,
    type ChargeExceptionTarget,
} from './ChargeExceptionResolution.js';
import { CreateOrderFromProviderPaymentOperation } from './CreateOrderFromProviderPaymentOperation.js';
import { PROVIDER_CHARGE_MISMATCH_TYPE_CODE } from './ReconcilePaymentProviderChargesOperation.js';
import { RequireUUID } from './sql-guards.js';

const FINANCE_EXCEPTION_ENTITY = 'MJ_BizApps_Accounting: Finance Exceptions';
const FINANCE_EXCEPTION_TYPE_ENTITY = 'MJ_BizApps_Accounting: Finance Exception Types';
/** Accounting's authorization to clear an exception; its operation checks it again. */
export const FINANCE_EXCEPTIONS_CLEAR_AUTH = 'MJ.BizApps.Accounting.FinanceExceptions.Clear';
const CLEAR_KEY = 'Accounting.ClearFinanceException';

type Output = OrdersResolveChargeExceptionOutput;
type BookingOutput = OrdersCreateOrderFromProviderPaymentOutput;

/** Books the charge an exception names. The operation passes the gateway path; a check supplies the charge. */
export type BookExceptionCharge = (
    target: ChargeExceptionTarget & { ProductID: string; BillToPersonID: string; BillToOrganizationID: string | null },
) => Promise<BookingOutput>;

interface ClearInput {
    FinanceExceptionID: string;
    Outcome: 'Reviewed' | 'Corrected';
    Note: string;
}

interface ClearOutput {
    Success: boolean;
    Status?: string;
    Errors?: Array<{ Code: string; Message: string }>;
}

function refuse(code: string, message: string, extra: Partial<Output> = {}): Output {
    return { Success: false, Cleared: false, Code: code, Message: message, ...extra };
}

@RegisterClass(BaseRemotableOperation, 'Orders.ResolveChargeException')
export class ResolveChargeExceptionOperation extends OrdersResolveChargeExceptionOperationBase {
    protected async InternalExecute(input: OrdersResolveChargeExceptionInput, provider: IMetadataProvider, user: UserInfo): Promise<Output> {
        return ResolveChargeException(
            input,
            async (target) => {
                const result = await new CreateOrderFromProviderPaymentOperation().ExecuteServer(target, {
                    provider,
                    user,
                    emitProgress: () => undefined,
                });
                return (
                    result.Output ?? { Success: false, Code: 'BookingFailed', Message: result.ErrorMessage ?? 'The order could not be booked.' }
                );
            },
            provider,
            user,
        );
    }
}

/**
 * Steps 1 to 4. Exported so a check can book through `CreateOrderFromGatewayCharge` with the charge
 * the gateway would report: a provider in test mode runs the stub driver, which has no charges to read.
 */
export async function ResolveChargeException(
    input: OrdersResolveChargeExceptionInput,
    book: BookExceptionCharge,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Output> {
    const checked = CheckResolveChargeExceptionInput(input);
    if (typeof checked === 'string') return refuse('BadInput', checked);

    if (!UserCanClearFinanceExceptions(user, provider)) {
        return refuse(
            'NotAuthorized',
            `Resolving a finance exception clears it, which requires the ${FINANCE_EXCEPTIONS_CLEAR_AUTH} authorization (the Finance role). Nothing was booked.`,
        );
    }

    const row = await loadException(checked.FinanceExceptionID, provider, user);
    if (!row) return refuse('ExceptionNotFound', `No finance exception has the ID ${checked.FinanceExceptionID}, or you cannot read it.`);

    const target = CheckChargeExceptionForOrder(row, PROVIDER_CHARGE_MISMATCH_TYPE_CODE);
    if ('Code' in target) return refuse(target.Code, target.Message);

    const booked = await book({
        ...target,
        ProductID: checked.ProductID,
        BillToPersonID: checked.BillToPersonID,
        BillToOrganizationID: checked.BillToOrganizationID,
    });
    const order: Partial<Output> = {
        ProviderChargeID: target.ProviderChargeID,
        WasExisting: booked.WasExisting ?? false,
        OrderHeaderID: booked.OrderHeaderID ?? null,
        OrderNumber: booked.OrderNumber ?? null,
        PaymentHeaderID: booked.PaymentHeaderID ?? null,
        PaymentNumber: booked.PaymentNumber ?? null,
        Amount: booked.Amount ?? null,
    };
    if (!booked.Success) {
        return refuse(booked.Code ?? 'BookingFailed', `The order was not booked, and the exception stays open: ${booked.Message}`, order);
    }

    const note = ChargeExceptionResolutionNote(target.ProviderChargeID, booked);
    const cleared = await clearException(checked.FinanceExceptionID, note, provider, user);
    if (cleared) {
        return refuse(
            'ClearRefused',
            `Order ${booked.OrderNumber ?? booked.OrderHeaderID} is booked and paid, but the exception could not be cleared: ${cleared}. ` +
                `Run this again to clear it; the order is not booked twice.`,
            order,
        );
    }
    return {
        ...order,
        Success: true,
        Cleared: true,
        Message: `${booked.Message} Finance exception cleared as Corrected.`,
    };
}

/** The same test accounting's clear makes first, so a caller it would refuse books nothing. */
export function UserCanClearFinanceExceptions(user: UserInfo | null | undefined, provider: IMetadataProvider): boolean {
    if (!user) return false;
    const catalog = provider.Authorizations ?? [];
    const auth = catalog.find((a) => a.Name === FINANCE_EXCEPTIONS_CLEAR_AUTH);
    return !!auth && new AuthorizationEvaluator().UserCanExecuteWithAncestors(auth, user, catalog);
}

/** The exception and its type's code, read as the caller: the Finance role can read both. */
async function loadException(id: string, provider: IMetadataProvider, user: UserInfo): Promise<ChargeExceptionRow | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const rows = await rv.RunView<{
        ID: string;
        Status: string;
        FinanceExceptionTypeID: string;
        SourceEntity: string;
        SourceRecordID: string;
        DedupeKey: string;
    }>(
        {
            EntityName: FINANCE_EXCEPTION_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(id, 'FinanceExceptionID')}'`,
            Fields: ['ID', 'Status', 'FinanceExceptionTypeID', 'SourceEntity', 'SourceRecordID', 'DedupeKey'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!rows.Success) throw new Error(`Could not read finance exception ${id}: ${rows.ErrorMessage}`);
    const row = rows.Results?.[0];
    if (!row) return null;
    const types = await rv.RunView<{ Code: string }>(
        {
            EntityName: FINANCE_EXCEPTION_TYPE_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(row.FinanceExceptionTypeID, 'FinanceExceptionTypeID')}'`,
            Fields: ['Code'],
            ResultType: 'simple',
        },
        user,
    );
    if (!types.Success) throw new Error(`Could not read the type of finance exception ${id}: ${types.ErrorMessage}`);
    return {
        ID: row.ID,
        Status: row.Status,
        TypeCode: types.Results?.[0]?.Code ?? '',
        SourceEntity: row.SourceEntity,
        SourceRecordID: row.SourceRecordID,
        DedupeKey: row.DedupeKey,
    };
}

/** Clears the exception as Corrected. Null when cleared, otherwise why not. */
async function clearException(id: string, note: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const op = ResolveAccountingOperation<ClearInput, ClearOutput>(CLEAR_KEY, 'clear the finance exception');
    const result = await op.Execute({ FinanceExceptionID: id, Outcome: 'Corrected', Note: note }, { provider, user });
    if (!result.Success) return `${CLEAR_KEY} did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`;
    const out = result.Output;
    if (!out) return `${CLEAR_KEY} returned no payload`;
    if (!out.Success) return (out.Errors ?? []).map((e) => `${e.Code}: ${e.Message}`).join('; ') || 'refused with no reason';
    return null;
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadResolveChargeExceptionOperation(): void {
    void ResolveChargeExceptionOperation;
}
