/**
 * PaymentHeader server subclass — books the PROCESSING FEE when a payment is captured (plan D18).
 *
 * WHAT THIS BOOKS, AND WHY IT IS ONLY THE FEE
 * Capture used to book the whole cash leg here: `Dr Cash / Dr Fee / Cr AR` against the receiving
 * company. That was wrong as soon as an order carried another company's product — it credited the
 * collector's receivable for money the collector was never owed, and left the owner's receivable
 * open forever. Balanced, posted, and invisible (D13; intercompany-balancing.md §1).
 *
 * The cash and receivable sides moved to `PaymentLineEntityServer`, because ALLOCATION is the
 * earliest point at which the owning companies are known at all. A capture says how much cash
 * arrived; only an allocation says whose revenue it settles.
 *
 * The fee stays here because it genuinely is a header fact: the processor takes its cut from the
 * payment as a whole, not from any one order, and pro-rating it across allocations would invent
 * precision the underlying fact does not have.
 *
 * WHEN IT BOOKS
 * On the transition INTO `Captured`, once, and only when there IS a fee with an account to book it
 * to. `JournalEntryID` is NULL→value-once and is checked first, so a re-save never books twice.
 *
 * ATOMICITY
 * The entry is written inside the caller's transaction, exactly as order booking is. A payment that
 * fails to book does not persist as captured.
 *
 * REFUNDS reverse. A payment saved as `Refunded` books the mirror of its capture (D53): same
 * accounts, debit and credit swapped, positive amounts.
 *
 * CONNECTS TO:
 *   FACTORY:    PaymentJournalEntryFactory (./PaymentJournalEntryFactory.ts)
 *   ALLOCATION: PaymentLineEntityServer (./PaymentLineEntityServer.ts) — the cash/AR side
 *   RESOLVER:   GLAccountResolver (./GLAccountResolver.ts)
 *   OP:         'Accounting.CreateJournalEntries' — the same op OrderEntityServer uses
 *   TABLE:      __mj_BizAppsOrders.PaymentHeader
 */
import {
    BaseEntity,
    BaseEntityResult,
    BaseRemotableOperation,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { PaymentJournalEntryFactory } from './PaymentJournalEntryFactory.js';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';

/** Statuses whose entry belongs in the ledger. */
const BOOKED_STATUSES = new Set(['Captured', 'Refunded']);

interface CreateJournalEntriesResult {
    Success: boolean;
    Errors?: Array<{ Code?: string; Message?: string }>;
    Results?: Array<{ JournalEntryID?: string }>;
}

@RegisterClass(BaseEntity, PAYMENT_HEADER_ENTITY)
export class PaymentHeaderEntityServer extends mjBizAppsOrdersPaymentHeaderEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();

        // A fee larger than the payment would put a negative amount into Cash.
        const fee = this.ProcessingFeeAmount ?? 0;
        if (fee < 0 || fee > Math.abs(this.Amount ?? 0)) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'ProcessingFeeAmount',
                    `The processing fee (${fee}) must be between 0 and the payment amount ` +
                        `(${this.Amount}). A larger fee would book negative cash.`,
                    fee,
                    ValidationErrorType.Failure,
                ),
            );
        }

        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const booking = this.willBookOnThisSave();
        if (!booking) {
            return super.Save(options);
        }

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            if (!(await super.Save(options))) {
                throw new Error(
                    `Failed to save payment ${this.PaymentNumber}: ` +
                        `${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            await this.bookProcessingFee(options);

            await dbProvider.CommitTransaction();
            return true;
        } catch (err) {
            LogError(`PaymentHeaderEntityServer.Save failed for ${this.PaymentNumber ?? this.ID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after payment save error: ${rollbackErr}`);
            }
            // Same reasoning as OrderEntityServer (D50): a bare `false` with LatestResult still
            // holding the successful row save reads as "it just didn't work".
            this.RegisterResultHistoryEntry(this.buildFailureResult(err));
            return false;
        }
    }

    /**
     * True when this save is the first transition into a booked status.
     *
     * `JournalEntryID` is the idempotency key, not the status: a captured payment re-saved for any
     * reason (a note edited, a provider id backfilled) must not book again.
     */
    private willBookOnThisSave(): boolean {
        if (!BOOKED_STATUSES.has(this.Status)) return false;
        if (this.JournalEntryID) return false;
        return true;
    }

    private async bookProcessingFee(options?: EntitySaveOptions): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const factory = new PaymentJournalEntryFactory(
            await BuildGLAccountResolver(provider, user),
            EntityIDFor(PAYMENT_HEADER_ENTITY),
        );

        const { Draft, UnbookedFeeAmount } = await factory.BuildCaptureDraft({
            PaymentID: this.ID,
            PaymentNumber: this.PaymentNumber,
            CompanyID: this.ReceivingCompanyID,
            Amount: this.Amount ?? 0,
            ProcessingFeeAmount: this.ProcessingFeeAmount ?? 0,
            PaymentDate: this.PaymentDate ? new Date(this.PaymentDate) : new Date(),
            IsReversal: this.Status === 'Refunded',
        });

        if (UnbookedFeeAmount) {
            // Not fatal — the allocation entries still book the gross to Cash. But the bank
            // position is then overstated by this much, so it must not pass silently.
            LogError(
                `Payment ${this.PaymentNumber}: processing fee of ${UnbookedFeeAmount} was NOT booked ` +
                    `because no 'Processing Fee' GL account is linked for company ` +
                    `${this.ReceivingCompanyID}. Cash will read gross by that amount.`,
            );
        }

        // No fee, or no account for it: there is nothing for the HEADER to book. The cash and
        // receivable sides belong to the allocation (PaymentLineEntityServer), which is the
        // earliest point the owning companies are known.
        if (!Draft) return;

        const result = await this.createJournalEntries([Draft], provider, user);
        const journalEntryID = result.Results?.[0]?.JournalEntryID;
        if (!journalEntryID) {
            throw new Error(`Accounting returned no journal entry for payment ${this.PaymentNumber}.`);
        }

        // NULL→value-once; the DB trigger enforces the same rule independently.
        this.JournalEntryID = journalEntryID;
        if (!(await super.Save(options))) {
            throw new Error(
                `Failed to stamp JournalEntryID on payment ${this.PaymentNumber}: ` +
                    `${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
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
        if (!payload) {
            throw new Error('Accounting.CreateJournalEntries returned no payload.');
        }
        if (!payload.Success) {
            const detail = (payload.Errors ?? [])
                .map((e) => `${e.Code ?? 'ERROR'}: ${e.Message ?? ''}`)
                .join('; ');
            throw new Error(`Journal entry booking failed for payment ${this.PaymentNumber}. ${detail}`);
        }
        return payload;
    }

    private buildFailureResult(err: unknown): BaseEntityResult {
        // Same shape as OrderEntityServer's (D50): a bare `false` leaves LatestResult holding the
        // row's SUCCESSFUL save, so the caller sees no reason for the refusal.
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = err instanceof Error ? err.message : String(err);
        result.Error = err;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — booking lives in Save, which is only reachable via the registration. */
export function LoadPaymentHeaderEntityServer(): void {
    // intentionally empty
}
