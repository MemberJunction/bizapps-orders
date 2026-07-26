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
 * ── THE ALLOCATION INVARIANT (D68) ─────────────────────────────────────────────────────────────
 * `Amount` MUST equal the sum of the payment's lines. A payment that says 1000 arrived while its
 * allocations total 600 is internally inconsistent, and the missing 400 has no home in the ledger —
 * which is how "unapplied cash" became a concept that needed inventing. Requiring the two to agree
 * removes it: every dollar lands on an order, and allocating MORE than an order is worth simply
 * drives that order's balance negative, which is a customer credit and spendable as tender.
 *
 * The invariant is enforced at the CAPTURE TRANSITION, not on every save. A `Pending` payment is a
 * draft — half-entered, correctable, booking nothing — exactly as a `Draft` order may sit with no
 * lines. Locking on save rather than on status would make an ordinary typo permanent.
 *
 * Lines are held in memory on `Lines` and saved with the header inside ONE transaction (the shape
 * `OrderEntityServer` uses), so there is never a persisted moment where the header and its lines
 * disagree. After capture both are frozen — the header by trigger 51005, the lines by 51010/51011.
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
    IRunViewProvider,
    LogError,
    RunView,
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
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** Statuses whose entry belongs in the ledger. */
const BOOKED_STATUSES = new Set(['Captured', 'Refunded']);

interface CreateJournalEntriesResult {
    Success: boolean;
    Errors?: Array<{ Code?: string; Message?: string }>;
    Results?: Array<{ JournalEntryID?: string }>;
}

@RegisterClass(BaseEntity, PAYMENT_HEADER_ENTITY)
export class PaymentHeaderEntityServer extends mjBizAppsOrdersPaymentHeaderEntity {
    private _lines: BaseEntity[] = [];

    /**
     * Unsaved allocation lines to persist with this payment (D68). Populate before `Save()`;
     * they are written inside the same transaction as the header, so the two can never be seen
     * disagreeing. Lines already persisted from an earlier save are counted too — this collection
     * is only the NEW ones.
     */
    public get Lines(): BaseEntity[] {
        return this._lines;
    }
    public set Lines(value: BaseEntity[]) {
        this._lines = value ?? [];
    }

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
        const capturing = this.willBookOnThisSave();

        // A Pending payment with no new lines is an ordinary row save — nothing to co-ordinate.
        if (!capturing && this._lines.length === 0) {
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

            // The lines go down BEFORE the invariant is checked, because the check reads what is
            // actually persisted rather than what this object happens to be holding — a line that
            // silently failed to save would otherwise still count toward the total.
            await this.savePendingLines(options);

            if (capturing) {
                await this.assertAllocationInvariant();
                // Only reach the fee builder when there IS a fee. Since the cash leg moved to the
                // allocation (D13), this is the header's ONLY entry — so a payment without a fee has
                // nothing to book here, and an account-credit transfer (Amount 0, D68) would
                // otherwise trip the builder's zero-gross guard even though it is perfectly valid.
                if (Number(this.ProcessingFeeAmount ?? 0) > 0) {
                    await this.bookProcessingFee(options);
                }
            }

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

    /**
     * Persist the in-memory allocation lines against this payment.
     *
     * `PaymentLineEntityServer` books each one's journal entries as it saves, and it reads the
     * payment's status to decide whether to — so by the time these run the header is already
     * `Captured` and the cash leg follows automatically.
     */
    private async savePendingLines(options?: EntitySaveOptions): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        for (const line of this._lines) {
            line.Set('PaymentHeaderID', this.ID);
            if (!line.Get('AllocatedAt')) line.Set('AllocatedAt', new Date());
            if (!(await line.Save(options))) {
                throw new Error(
                    `Failed to save a payment allocation for ${this.PaymentNumber}: ` +
                        `${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        this._lines = [];
        void provider;
        void user;
    }

    /**
     * `Amount` must equal the sum of the payment's persisted lines (D68).
     *
     * Checked at CAPTURE only. A `Pending` payment is a draft and may be as inconsistent as a
     * half-typed form; capture is the moment it becomes a claim about money that actually moved,
     * and from then on the header and lines are both frozen.
     *
     * Read from the database rather than from `this._lines`: that is the number the ledger and
     * every downstream report will see.
     */
    private async assertAllocationInvariant(): Promise<void> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ Amount: number }>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `PaymentHeaderID='${this.ID}'`,
                Fields: ['Amount'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        if (!res?.Success) {
            throw new Error(
                `Could not read the allocations for payment ${this.PaymentNumber}: ${res?.ErrorMessage ?? 'unknown error'}`,
            );
        }

        const rows = res.Results ?? [];
        const allocated = Math.round(rows.reduce((sum, l) => sum + Number(l.Amount ?? 0), 0) * 100) / 100;
        const amount = Math.round(Number(this.Amount ?? 0) * 100) / 100;

        // DIRECTION. `Amount` is stored as a positive magnitude on both a capture and a refund —
        // "how much moved" — while the LINES are signed by which way it moved: positive applies cash
        // to an order, negative takes it back off. So a refund of 250 is Amount 250 with lines
        // totalling -250, and comparing the two naively would fail every refund ever written.
        // `Status === 'Refunded'` is the same discriminator the booking path already uses to decide
        // whether to mirror the entry (D53), so the two stay in step by construction.
        const reversal = this.Status === 'Refunded';
        const expected = reversal ? -amount : amount;
        if (allocated === expected) return;

        const shortfall = Math.round((expected - allocated) * 100) / 100;
        const verb = reversal ? 'refunded' : 'captured';
        throw new Error(
            `Payment ${this.PaymentNumber} cannot be ${verb}: it is for ${amount} but its ` +
                `${rows.length} allocation${rows.length === 1 ? '' : 's'} total ${allocated} ` +
                `(expected ${expected}), leaving ${shortfall} unaccounted for. Every part of a payment must ` +
                `land on an order — allocating MORE than an order is worth is allowed and simply leaves that ` +
                `order with a credit balance, which can be spent on another order later. Adjust the ` +
                `allocations, or record the payment for what actually moved.`,
        );
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
