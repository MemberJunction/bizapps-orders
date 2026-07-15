/**
 * CreateRevRecScheduleOperation — the orders→accounting rev-rec BRIDGE (`Orders.CreateRevRecSchedule`, F4).
 *
 * For a deferred-revenue order line, builds the recognition-DATE waterfall (F4 cadence) and pushes a
 * DeferredRevenueRelease schedule to accounting via `Accounting.CreateScheduledJournalEntries` (B3.1):
 * N dated entries, each Dr Deferred Revenue / Cr Revenue, releasing the deferred amount over the
 * service period (MOD-11 — dated entries created at booking-lock, materialized by date later, B3.2).
 * Stamps OrderLine.RevenueRecognitionScheduleID with the schedule head.
 *
 * No-op (success) for a non-deferred line. Code-only Remote Operation; in-process + over GraphQL.
 *
 * CONNECTS TO:
 *   PURE:       @mj-biz-apps/orders-engine-base (computeRecognitionDates, computeLineNet)
 *   RESOLVE:    OrdersEngine.Base.ResolveAccount (Deferred Revenue + Sales roles)
 *   ACCOUNTING: @mj-biz-apps/accounting-core-entities-server (CreateScheduledJournalEntriesOperation)
 */
import { BaseRemotableOperation, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CreateScheduledJournalEntriesOperation } from '@mj-biz-apps/accounting-core-entities-server';
import { computeLineNet, computeRecognitionDates } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ROLE_DEFERRED_REVENUE = 'Deferred Revenue';
const ROLE_SALES = 'Sales';

export interface CreateRevRecScheduleInput {
  OrderLineID: string;
}
export interface CreateRevRecScheduleOutput {
  Success: boolean;
  /** True when a schedule was created; false + Skipped for a non-deferred line. */
  Scheduled?: boolean;
  Skipped?: string;
  ScheduledEntryIDs?: string[];
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.CreateRevRecSchedule')
export class CreateRevRecScheduleOperation extends BaseRemotableOperation<CreateRevRecScheduleInput, CreateRevRecScheduleOutput> {
  public readonly OperationKey = 'Orders.CreateRevRecSchedule';

  protected async InternalExecute(
    input: CreateRevRecScheduleInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CreateRevRecScheduleOutput> {
    const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    if (!(await line.Load(input.OrderLineID))) return { Success: false, Errors: [`Order line ${input.OrderLineID} not found.`] };
    if (line.RevenueRecognitionScheduleID) return { Success: true, Scheduled: false, Skipped: 'already scheduled' };

    await OrdersEngine.Instance.Config(false, user);
    const base = OrdersEngine.Instance.Base;
    const product = base.ProductByID(line.ProductID);
    if (!product) return { Success: false, Errors: [`Unknown product ${line.ProductID} for line ${input.OrderLineID}.`] };
    if (product.RevenueRecognitionType !== 'Deferred') return { Success: true, Scheduled: false, Skipped: 'not a deferred-revenue product' };

    const asOf = line.ServicePeriodStart ?? new Date();
    const dates = computeRecognitionDates({
      Shape: product.DeferredRecognitionShape ?? 'SingleDate',
      StartDate: line.ServicePeriodStart ?? asOf,
      EndDate: line.ServicePeriodEnd ?? undefined,
      EventDate: line.ServicePeriodStart ?? asOf,
    });
    // Release schedule: Dr Deferred Revenue / Cr Sales (revenue earned over time).
    const defRev = base.ResolveAccount(line.ProductID, ROLE_DEFERRED_REVENUE, asOf);
    const revenue = base.ResolveAccount(line.ProductID, ROLE_SALES, asOf);
    if (!defRev || !revenue) {
      return { Success: false, Errors: [`Cannot resolve ${!defRev ? ROLE_DEFERRED_REVENUE : ROLE_SALES} for the rev-rec schedule of line ${input.OrderLineID}.`] };
    }
    const total = computeLineNet(Number(line.Quantity), Number(line.UnitPrice), line.DiscountPct);
    const currencyCode = await this.currencyForCompany(defRev.CompanyID, user);

    const res = await new CreateScheduledJournalEntriesOperation().Execute({
      CompanyID: defRev.CompanyID,
      EntryType: 'DeferredRevenueRelease',
      CurrencyCode: currencyCode,
      TotalAmount: total,
      DebitGLAccountID: defRev.GLAccountID,
      CreditGLAccountID: revenue.GLAccountID,
      RecognitionDates: dates,
      Description: `Rev-rec release — order line ${line.LineNumber}`,
      OrderID: line.OrderID,
      OrderLineID: line.ID,
    }, { user });
    const out = res.Output;
    if (!out?.Success) {
      LogError(`CreateRevRecScheduleOperation: schedule op failed for line ${input.OrderLineID}: ${JSON.stringify(out?.Errors)}`);
      return { Success: false, Errors: (out?.Errors ?? []).map(e => e.Message) };
    }
    const ids = out.ScheduledEntryIDs ?? [];
    if (ids[0]) {
      line.RevenueRecognitionScheduleID = ids[0];
      if (!(await line.Save())) LogError(`CreateRevRecScheduleOperation: could not stamp RevenueRecognitionScheduleID on line ${input.OrderLineID}`);
    }
    return { Success: true, Scheduled: true, ScheduledEntryIDs: ids };
  }

  /** The receiving company's functional currency (falls back to the first currency). */
  private async currencyForCompany(companyID: string, user: UserInfo): Promise<string> {
    const res = await new RunView().RunView<{ FunctionalCurrencyCode: string }>(
      { EntityName: 'MJ_BizApps_Accounting: Accounting Company Profiles', ExtraFilter: `ID='${companyID}'`, Fields: ['FunctionalCurrencyCode'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Results?.[0]?.FunctionalCurrencyCode ?? 'USD';
  }
}

/** Tree-shaking anchor — called from the server bootstrap so `@RegisterClass` is retained. */
export function LoadCreateRevRecScheduleOperation(): void {
  // intentionally empty
}
