/**
 * PaymentLine server subclass — the cash-application guard (plan D18/D41) AND the cash leg (D13).
 *
 * `PaymentLine` is the junction that says "this much of that payment settles this order". The only
 * protection it had was `CHECK (Amount <> 0)`, so nothing stopped applying $500 against a $100
 * order. The rollup triggers would dutifully compute `Balance = -400` and `PaymentStatus = 'Paid'`,
 * and the customer would appear to be owed money the ledger has no record of.
 *
 * ONE RULE HERE (D68 revised the other away)
 *   A negative application (un-apply, or spending a credit) may not push the order's applied total
 *   BELOW zero. Un-applying more than was ever applied is always a mistake.
 *
 * THERE IS DELIBERATELY NO CEILING. An earlier version refused any application that pushed the
 * order's applied total above its gross, on the reasoning that an over-payment should be recorded
 * "deliberately" as a credit memo. That was wrong, and it made the honest case unrecordable: a
 * customer who sends 1000 for a 900 order has done nothing unusual, and the money is in the bank
 * whether or not the schema likes it. Over-applying now simply drives the order's balance negative,
 * and a negative balance IS the credit — spendable on another order via the Account Credit tender.
 *
 * WHAT GUARDS THE PAYMENT INSTEAD: `PaymentHeaderEntityServer` requires a captured payment's Amount
 * to equal the sum of its lines (D68). That is a payment-side sum, so it belongs on the payment —
 * and being an equality rather than a ceiling, it makes over-allocating a payment impossible by
 * construction rather than by a second check.
 *
 * ── THE CASH LEG MOVED HERE (2026-07-26, D13 payment half) ──────────────────────────────────
 * It used to live on `PaymentHeader` capture, which booked `Dr Cash / Cr AR` against the RECEIVING
 * company and nothing else. That was wrong the moment an order carried another company's product:
 * the collector's receivable was credited for money it was never owed, and the owner's receivable
 * stayed open forever — balanced, posted, and invisible.
 *
 * ALLOCATION is the earliest point the companies are even KNOWN. A capture says how much cash
 * arrived; only the allocation says whose revenue it settles. So the entries belong here, one per
 * company owning a line on the order (plans/archive/intercompany-balancing.md §2).
 *
 * `BookedAt` is the idempotency key rather than a `JournalEntryID`, because one allocation produces
 * N entries. They are found the other way round, through accounting's D25 provenance pair.
 *
 * CONNECTS TO:
 *   FACTORY:  PaymentAllocationFactory (./PaymentAllocationFactory.ts)
 *   LOOKUP:   AccountingEngineBase.ResolveIntercompanyAccounts (BA-D26)
 *   TRIGGERS: trg_PaymentLine_RollupTotals → spRecalcOrderHeaderTotals (D41)
 *   TABLE:    __mj_BizAppsOrders.PaymentLine
 */
import {
    BaseEntity,
    BaseEntityResult,
    BaseRemotableOperation,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersPaymentLineEntity } from '@mj-biz-apps/orders-entities';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { PaymentAllocationFactory, type OrderLineShare } from './PaymentAllocationFactory.js';

const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';

/** Payment statuses whose allocations belong in the ledger. */
const BOOKED_STATUSES = new Set(['Captured', 'Refunded']);

interface CreateJournalEntriesResult {
    Success: boolean;
    Errors?: Array<{ Code?: string; Message?: string }>;
    Results?: Array<{ JournalEntryID?: string }>;
}

interface PaymentContext {
    PaymentNumber: string;
    ReceivingCompanyID: string;
    Status: string;
    PaymentDate: Date;
}

/** Cents of slack, so decimal rounding never trips the guard on an exact-payment case. */
const TOLERANCE = 0.005;

@RegisterClass(BaseEntity, PAYMENT_LINE_ENTITY)
export class PaymentLineEntityServer extends mjBizAppsOrdersPaymentLineEntity {
    /**
     * The applied-total check runs in `Save`, not `Validate`, because it needs to read sibling rows
     * — `Validate()` is synchronous by contract, and a guard that cannot see the other applications
     * is not a guard.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = await this.checkApplicationTotal();
        if (problem) {
            // Registered rather than thrown: a rejected application is a business outcome the
            // caller inspects on LatestResult, the same contract every other save failure uses.
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }

        // `BookedAt` is the idempotency key: a re-saved allocation (a note edited, a user
        // backfilled) must not credit AR a second time.
        if (this.BookedAt) return super.Save(options);

        // When saved as part of a parent PaymentHeader save, the parent PaymentHeader
        // coordinates the booking of all allocations in one atomic batch inside the parent transaction.
        if (options?.IsParentEntitySave) {
            return super.Save(options);
        }

        const payment = await this.loadPayment();
        // Nothing to book yet for an allocation against a Pending payment — no cash has landed.
        // It books when the payment reaches Captured, not here.
        if (!payment || !BOOKED_STATUSES.has(payment.Status)) return super.Save(options);

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            if (!(await super.Save(options))) {
                throw new Error(
                    `Failed to save the payment allocation: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
            await this.bookAllocation(payment, options);
            await dbProvider.CommitTransaction();
            return true;
        } catch (err) {
            LogError(`PaymentLineEntityServer.Save failed for allocation ${this.ID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after allocation save error: ${rollbackErr}`);
            }
            // Same reasoning as OrderEntityServer (D50): a bare `false` leaves LatestResult holding
            // the row's SUCCESSFUL save, so the caller sees no reason for the refusal.
            this.RegisterResultHistoryEntry(this.buildRejection(err instanceof Error ? err.message : String(err)));
            return false;
        }
    }

    /**
     * Book one journal entry per company owning a line on the order this allocation settles.
     *
     * Single-company orders produce exactly one entry — the shape the ledger had before — so this
     * is a generalisation of the old behaviour rather than a parallel path.
     */
    private async bookAllocation(payment: PaymentContext, options?: EntitySaveOptions): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const orderLines = await this.loadOrderLines();
        if (orderLines.length === 0) {
            throw new Error(
                `Cannot allocate ${this.Amount} to order ${this.OrderHeaderID}: the order has no lines, so ` +
                    `there is no basis for deciding whose revenue the cash settles.`,
            );
        }
        const order = await this.loadOrderNumber();

        // The intercompany lookup is accounting's (BA-D26), read from its cache. Config is cheap
        // after the first call and keeps the pair current when one is added mid-session.
        await AccountingEngineBase.Instance.Config(false, user, provider);
        const factory = new PaymentAllocationFactory(
            await BuildGLAccountResolver(provider, user),
            (source, target, asOf) => {
                const hit = AccountingEngineBase.Instance.ResolveIntercompanyAccounts(source, target, asOf);
                return hit ? { DueToGLAccountID: hit.DueTo.GLAccountID, DueFromGLAccountID: hit.DueFrom.GLAccountID } : null;
            },
            EntityIDFor(PAYMENT_LINE_ENTITY),
        );

        const { Drafts } = await factory.BuildAllocationDrafts({
            PaymentLineID: this.ID,
            PaymentNumber: payment.PaymentNumber,
            OrderNumber: order,
            Amount: this.Amount ?? 0,
            ReceivingCompanyID: payment.ReceivingCompanyID,
            OrderLines: orderLines,
            TargetOrderLineID: this.OrderLineID ?? null,
            PaymentDate: payment.PaymentDate,
            // A negative allocation un-applies cash, and a refunded payment reverses: both mirror.
            IsReversal: payment.Status === 'Refunded' || (this.Amount ?? 0) < 0,
        });

        const result = await this.createJournalEntries(Drafts, provider, user);
        if ((result.Results?.length ?? 0) !== Drafts.length) {
            throw new Error(
                `Accounting returned ${result.Results?.length ?? 0} journal entries for an allocation that ` +
                    `produced ${Drafts.length} drafts. The cash leg is incomplete; refusing to commit.`,
            );
        }

        this.BookedAt = new Date();
        if (!(await super.Save(options))) {
            throw new Error(
                `Failed to stamp BookedAt on the allocation: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** The payment this allocation belongs to, or null when it cannot be read. */
    private async loadPayment(): Promise<PaymentContext | null> {
        if (!this.PaymentHeaderID) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{
            PaymentNumber: string;
            ReceivingCompanyID: string;
            Status: string;
            PaymentDate: string;
        }>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter: `ID='${this.PaymentHeaderID}'`,
                Fields: ['PaymentNumber', 'ReceivingCompanyID', 'Status', 'PaymentDate'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const row = res?.Results?.[0];
        if (!row) return null;
        return {
            PaymentNumber: row.PaymentNumber,
            ReceivingCompanyID: row.ReceivingCompanyID,
            Status: row.Status,
            PaymentDate: row.PaymentDate ? new Date(row.PaymentDate) : new Date(),
        };
    }

    /** Every line of the order, with the company that owns it — the pro-rating basis. */
    private async loadOrderLines(): Promise<OrderLineShare[]> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        // LineTotalGross (= net + tax) is the basis on purpose: it is exactly what booking DEBITED
        // to AR for the line, and what the order's TotalGross rolls up from. Allocating on any
        // other basis would clear a different amount than was ever receivable.
        const res = await rv.RunView<{ ID: string; CompanyID: string; LineTotalGross: number }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.OrderHeaderID}'`,
                Fields: ['ID', 'CompanyID', 'LineTotalGross'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        if (!res?.Success) {
            throw new Error(`Could not read the order's lines to allocate the payment: ${res?.ErrorMessage ?? 'unknown error'}`);
        }
        return (res.Results ?? []).map((l) => ({
            OrderLineID: l.ID,
            CompanyID: l.CompanyID,
            Amount: Number(l.LineTotalGross ?? 0),
        }));
    }

    private async loadOrderNumber(): Promise<string> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ OrderNumber: string }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${this.OrderHeaderID}'`,
                Fields: ['OrderNumber'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        return res?.Results?.[0]?.OrderNumber ?? String(this.OrderHeaderID);
    }

    private async createJournalEntries(
        drafts: unknown[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CreateJournalEntriesResult> {
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
            BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesResult>
        >(BaseRemotableOperation, 'Accounting.CreateJournalEntries');

        if (!op) {
            throw new Error(
                `The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps ` +
                    `Accounting server package must be loaded before payments can book the cash leg.`,
            );
        }

        const result = await op.Execute({ Drafts: drafts }, { provider, user });
        if (!result.Success) {
            throw new Error(
                `Accounting.CreateJournalEntries did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`,
            );
        }
        const payload = result.Output;
        if (!payload) throw new Error('Accounting.CreateJournalEntries returned no payload.');
        if (!payload.Success) {
            const detail = (payload.Errors ?? []).map((e) => `${e.Code ?? 'ERROR'}: ${e.Message ?? ''}`).join('; ');
            throw new Error(`Journal entry booking failed for the payment allocation. ${detail}`);
        }
        return payload;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (!this.OrderHeaderID) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'OrderHeaderID',
                    'A payment line must name the order it settles.',
                    this.OrderHeaderID,
                    ValidationErrorType.Failure,
                ),
            );
        }
        return result;
    }

    /** Returns a message when this application would take the order out of range, else null. */
    private async checkApplicationTotal(): Promise<string | null> {
        if (!this.OrderHeaderID || !this.Amount) return null;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);

        const orders = await rv.RunView<{ TotalGross: number; OrderNumber: string }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${this.OrderHeaderID}'`,
                Fields: ['TotalGross', 'OrderNumber'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const order = orders?.Results?.[0];
        // An order we cannot read is not this guard's problem to report — the FK will reject it.
        if (!order) return null;

        const siblings = await rv.RunView<{ ID: string; Amount: number }>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.OrderHeaderID}'`,
                Fields: ['ID', 'Amount'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );

        // Exclude this row when it is an UPDATE, so an edit is measured against its new value only.
        const existing = (siblings?.Results ?? [])
            .filter((l) => !this.ID || l.ID.toLowerCase() !== String(this.ID).toLowerCase())
            .reduce((sum, l) => sum + Number(l.Amount ?? 0), 0);

        const proposed = Math.round((existing + Number(this.Amount)) * 100) / 100;

        // NO CEILING. Over-applying is deliberately permitted (D68): a customer paying more than an
        // order is worth is an everyday event, and the resulting NEGATIVE balance is exactly how this
        // system represents a customer credit — spendable on another order through the Account Credit
        // tender. The ceiling that used to live here refused that, which is why a payment could not be
        // recorded for what actually arrived. Consistency between a payment and its own allocations is
        // enforced instead, on the payment side (PaymentHeaderEntityServer, D68).

        if (proposed < -TOLERANCE) {
            return (
                `Applying ${this.Amount} would take the total applied against order ${order.OrderNumber} ` +
                `to ${proposed}. Only ${existing} has ever been applied, so there is nothing more to ` +
                `un-apply.`
            );
        }

        return null;
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

/** Tree-shaking anchor — the guard lives in Save, reachable only via the registration. */
export function LoadPaymentLineEntityServer(): void {
    // intentionally empty
}
