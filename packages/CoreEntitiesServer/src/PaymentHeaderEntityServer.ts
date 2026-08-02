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
    LogStatus,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import { ShouldHoldForLateSettlement, SplitCapturedAmount } from './PaymentProviderBehavior.js';
import { PaymentJournalEntryFactory } from './PaymentJournalEntryFactory.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';

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
        // A rail that settles on somebody else's schedule may not reach Captured here, whoever asked.
        await this.deferCaptureWhenSettlementIsLate();

        const capturing = this.willBookOnThisSave();

        // A Pending payment with no new lines is an ordinary row save — nothing to co-ordinate.
        if (!capturing && this._lines.length === 0) {
            return super.Save(options);
        }

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            // SETTLE WITH THE GATEWAY BEFORE THE ROW IS WRITTEN (D19).
            //
            // Two reasons, and the second is the one that bit. If the ledger were written first and the
            // gateway then declined, the rollback would undo our entries — but a gateway that CAPTURED
            // and then failed to answer has taken the customer's money while we recorded nothing.
            //
            // And the gateway is the authority on the AMOUNT and the FEE: a partial capture, or a fee
            // different from the one assumed, is what actually moved. Those land on THIS object, so
            // they have to be set before `super.Save()` persists it. Calling this afterwards computed
            // the right fee and threw it away — the row kept its zero, and the only reason anyone
            // noticed was that PV4 asserted the fee rather than just the status.
            if (capturing) await this.settleWithProvider();

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
                // BOOK THE LINES THAT WERE ALREADY ON DISK. A payment that was saved `Pending` — the
                // shape a bank debit takes, because nothing has cleared when the caller asks — persisted
                // its allocations with nothing booked, exactly as `PaymentLineEntityServer` intends
                // ("it books when the payment reaches Captured, not here"). THIS is that moment, and
                // without this call the cash leg never books: `savePendingLines` only writes the
                // transient collection, which is empty on a promotion.
                //
                // Safe to run on every capture. `BookedAt` is the allocation's idempotency key, so a
                // line booked on its own save is skipped here rather than credited twice.
                await this.bookPersistedLines(options);
                await this.assertAllocationInvariant();
                // Only reach the fee builder when there IS a fee AND this tender books one inline.
                // Since the cash leg moved to the allocation (D13), this is the header's ONLY entry —
                // so a payment without a fee has nothing to book here, and an account-credit transfer
                // (Amount 0, D68) would otherwise trip the builder's zero-gross guard even though it
                // is perfectly valid.
                //
                // OFF BY DEFAULT (D82). A per-payment fee leg cannot reconcile to a bank statement,
                // because the processor batches into payouts and deducts costs that never attach to
                // any payment. The fee is still READ from the gateway and still stored on this row;
                // it simply does not become a journal entry unless a deployment asks for it.
                if (Number(this.ProcessingFeeAmount ?? 0) > 0 && (await this.feeBooksInline())) {
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
     * A payment on an asynchronously-settling rail lands `Pending`, whatever the caller wrote.
     *
     * WHY THIS IS HERE AND NOT ONLY IN `Orders.CapturePayment`. The operation already asks the driver
     * this question and sets the status accordingly, and that was the whole of the rule — which made
     * it a rule the OPERATION follows rather than one the system enforces. Every other way of writing
     * a payment went straight past it: a workflow saving a `PaymentHeader`, a UI form, a migration, a
     * test builder that defaults `Status` to `'Captured'`. Each of those books `Dr Cash` for a bank
     * debit that has not cleared, and the entry is perfectly balanced, so nothing downstream can tell.
     * Finance sees cash four days before the bank does, and the only symptom is a reconciliation that
     * is off by whatever ACH ran that week.
     *
     * This is the last shared point before booking, so it is the honest place for the invariant. The
     * operation's copy stays — it needs the answer BEFORE the save so it can report the status it is
     * about to produce — and the two now agree by construction rather than by both remembering.
     *
     * THE PROMOTION MUST STILL PASS. When the webhook moves a `Pending` payment to `Captured`, that IS
     * the bank answering, and deferring it again would mean a bank debit could never book at all. The
     * signal is the PERSISTED status: a row that was already `Pending` is being promoted; a new row,
     * or one arriving from any other state, is a caller declaring cash that has not moved.
     *
     * SILENT ON PURPOSE, AND ONLY HERE. It changes the status rather than refusing the save, because
     * `Pending` is what the caller should have written and refusing would strand a payment the gateway
     * has already been told about. `Orders.CapturePayment` reports the resulting status back, so a
     * caller going through the front door is told plainly what happened.
     */
    private async deferCaptureWhenSettlementIsLate(): Promise<void> {
        if (this.Status !== 'Captured') return;

        // The webhook promoting a Pending payment — the bank has answered, so this one books.
        const previousStatus = this.GetFieldByName('Status')?.OldValue as string | undefined;
        if (this.IsSaved && previousStatus === 'Pending') return;

        const providerID = (this as unknown as { PaymentProviderID?: string | null }).PaymentProviderID;
        // No gateway means a RECORDED payment — cheque, cash, wire. Nothing settles late.
        if (!providerID) return;

        let settlesLate = false;
        try {
            const driver = await ResolvePaymentProvider(
                providerID,
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ContextCurrentUser as UserInfo,
            );
            settlesLate = driver.SettlesAsynchronously === true;
        } catch {
            // A provider that will not resolve is a configuration fault, and `settleWithProvider` is
            // about to report it far more precisely than a status guess here would. Leaving the
            // status alone keeps every rail that worked before working unchanged.
            return;
        }

        if (
            !ShouldHoldForLateSettlement({
                RequestedStatus: this.Status,
                PersistedStatus: previousStatus,
                IsSaved: this.IsSaved,
                HasProvider: true,
                SettlesAsynchronously: settlesLate,
            })
        ) {
            return;
        }

        LogStatus(
            `Payment ${this.PaymentNumber}: this provider settles asynchronously, so the payment is ` +
                `held at Pending and its allocations persist unbooked. The webhook books the cash leg ` +
                `when the bank confirms.`,
        );
        this.Status = 'Pending';
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
     * Re-save any allocation already on disk that has not booked yet, so its cash leg lands.
     *
     * ONLY REACHABLE FROM A DELAYED CAPTURE. A payment captured in one act saves its lines from the
     * transient collection while the header is already `Captured`, so each one books as it is written
     * and arrives here with `BookedAt` set — this method then finds nothing and costs one query. A
     * payment that sat `Pending` first (a bank debit waiting on the bank) persisted its lines
     * unbooked, and this is the only place that debt is settled.
     *
     * RE-SAVED AS ENTITY OBJECTS, deliberately. `PaymentLineEntityServer.Save` is what books an
     * allocation, and it needs the real subclass to do it — reading these as `simple` rows and
     * updating them would write the columns and book nothing, which is the failure this method exists
     * to prevent.
     */
    private async bookPersistedLines(options?: EntitySaveOptions): Promise<void> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<BaseEntity>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `PaymentHeaderID='${this.ID}' AND BookedAt IS NULL`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );

        if (!result?.Success) {
            throw new Error(
                `Could not read the unbooked allocations for payment ${this.PaymentNumber}: ` +
                    `${result?.ErrorMessage ?? 'unknown error'}`,
            );
        }

        for (const line of result.Results ?? []) {
            // A no-op save: nothing on the row changes, and the ONLY purpose is to run the subclass's
            // booking path now that the header it reads is Captured.
            if (!(await line.Save(options))) {
                throw new Error(
                    `Could not book an allocation of payment ${this.PaymentNumber}: ` +
                        `${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
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

    /**
     * Ask the gateway to actually take the money, and record what it says happened.
     *
     * NO PROVIDER, NO CALL. `PaymentProviderID` is nullable, and a payment without one is a payment
     * nobody is asking a gateway about — a back-office correction, an account-credit transfer (D68), a
     * historical import. Those capture exactly as they did before this method existed, which is why it
     * returns early rather than refusing: requiring a provider would break every one of them.
     *
     * ALREADY SETTLED IS NOT RE-SETTLED. A payment carrying a `ProviderChargeID` has been through the
     * gateway once. Re-saving it for any reason must not charge the customer again, so the presence of
     * that reference is the idempotency key — the same shape as `JournalEntryID` for booking.
     *
     * THE GATEWAY'S NUMBERS WIN. `Amount` and `ProcessingFeeAmount` are overwritten from the capture
     * result, because what moved is what moved. `SplitCapturedAmount` then checks the three reconcile
     * before the fee leg is built, so a nonsensical fee is refused here rather than producing an entry
     * that will not balance three calls later.
     */
    private async settleWithProvider(): Promise<void> {
        const providerID = (this as unknown as { PaymentProviderID?: string | null }).PaymentProviderID;
        if (!providerID) return;

        const alreadySettled = (this as unknown as { ProviderChargeID?: string | null }).ProviderChargeID;
        if (alreadySettled) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // THE GATEWAY'S INTENT STRING LIVES ON `PaymentIntent`, NOT HERE. `PaymentHeader.PaymentIntentID`
        // is a foreign key to our row; `PaymentIntent.ProviderIntentID` is what Stripe calls it. Reading
        // a `ProviderIntentID` off the header would compile — every column access here is a cast, since
        // the generated base does not declare them — and be `undefined` at run time, refusing every
        // provider-backed capture with a message about a missing intent.
        const intent = await this.loadProviderIntent();
        if (!intent) {
            throw new Error(
                `Payment ${this.PaymentNumber} names a payment provider but no provider intent, so there ` +
                    `is nothing for the gateway to capture. Open an intent first, or clear ` +
                    `PaymentProviderID for a payment that is being recorded rather than collected.`,
            );
        }

        const driver = await ResolvePaymentProvider(providerID, provider, user);

        const capture = await driver.Capture({
            ProviderIntentID: intent,
            Amount: this.Amount ?? 0,
            CurrencyCode: await this.functionalCurrency(),
        });

        if (!capture.Success) {
            // A REFUSAL, not a fault — the card was declined, the intent was in the wrong state. It
            // still fails the save, because a payment that did not capture must not be Captured; but it
            // fails with the gateway's own words, which is what the person retrying needs.
            throw new Error(
                `The gateway refused to capture payment ${this.PaymentNumber}: ` +
                    `${capture.Reason ?? 'no reason given'}`,
            );
        }

        // UNDEFINED means the driver could not determine a fee, which is NOT the same as no fee (see
        // BasePaymentProvider). Keeping whatever was already on the row is the honest response: we do
        // not know, so we do not overwrite what somebody may have entered.
        const gross = capture.Amount ?? this.Amount ?? 0;
        if (capture.FeeAmount != null) {
            const split = SplitCapturedAmount(gross, capture.FeeAmount);
            this.Amount = split.Gross;
            this.ProcessingFeeAmount = split.Fee;
            this.NetAmount = split.Net;
        } else {
            this.Amount = Math.round(gross * 100) / 100;
        }

        if (capture.ProviderChargeID) {
            (this as unknown as { ProviderChargeID: string }).ProviderChargeID = capture.ProviderChargeID;
        }
    }

    /** The gateway's own intent string, from the `PaymentIntent` row this payment points at. */
    private async loadProviderIntent(): Promise<string | null> {
        const intentID = (this as unknown as { PaymentIntentID?: string | null }).PaymentIntentID;
        if (!intentID) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; ProviderIntentID: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Payment Intents',
                ExtraFilter: `ID = '${intentID}'`,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return result?.Results?.[0]?.ProviderIntentID ?? null;
    }

    /**
     * The currency to transact in.
     *
     * THERE IS NO CURRENCY COLUMN ON A PAYMENT, deliberately (MOD-4): these tables are single-currency,
     * and the currency is a property of the COMPANY collecting the money. Reading it from the receiving
     * company's accounting profile keeps that true rather than quietly introducing a second opinion.
     *
     * Defaults to USD only when the profile cannot be read, because a gateway call needs *some* code and
     * refusing the capture over a missing profile row would be a worse failure than the wrong exponent —
     * which, for USD against any other two-decimal currency, is not even wrong.
     */
    private async functionalCurrency(): Promise<string> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; FunctionalCurrencyCode: string | null }>(
            {
                EntityName: 'MJ_BizApps_Accounting: Accounting Company Profiles',
                ExtraFilter: `ID = '${this.ReceivingCompanyID}'`,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return result?.Results?.[0]?.FunctionalCurrencyCode ?? 'USD';
    }

    /**
     * Whether this payment's TENDER books its processor fee as its own ledger leg (D82).
     *
     * READ FROM `PaymentType.BookProcessingFeeInline`, which defaults to 0 for every tender. The fee
     * is still read from the gateway and still stored on this row; this decides only whether it
     * becomes a journal entry. See the migration for why off is the correct default rather than the
     * timid one — a per-payment fee leg cannot reconcile to a statement, because the processor
     * batches into payouts and deducts costs that never attach to any payment.
     *
     * A MISSING TENDER ANSWERS FALSE, LOUDLY. Booking a fee we could not justify is worse than
     * omitting one the month-end accrual will pick up anyway, and refusing the whole capture over it
     * would hold up real money for a reporting detail. This is the same posture `bookProcessingFee`
     * already takes when no Processing Fee account is linked: say so plainly, book the payment, move on.
     *
     * READ FROM THE ENGINE CACHE, NOT A PER-CALL QUERY. This used to be a `RunView` naming the single
     * column, which reads as a careful minimal query and is really a hidden dependency on CodeGen
     * having run: `Fields` names a column that must exist in the base view and be registered as an
     * `EntityField`, and when it is not, `RunView` does not throw — it returns unsuccessfully, this
     * method takes its defensive branch, and the switch is silently stuck off. Payment types are a
     * lookup of eleven rows read on every capture; they belong in {@link OrdersEngine}, where a
     * missing field fails the load once at startup instead of every call site guessing a default.
     */
    private async feeBooksInline(): Promise<boolean> {
        await LoadOrdersEngine(
            this.ProviderToUse as unknown as IMetadataProvider,
            this.ContextCurrentUser as UserInfo,
        );

        const tender = OrdersEngine.Instance.PaymentTypeByID(this.PaymentTypeID);
        if (!tender) {
            LogError(
                `Payment ${this.PaymentNumber}: payment type ${this.PaymentTypeID} is not in the orders ` +
                    `lookup cache, so whether this tender books its fee inline is unknown. No fee entry ` +
                    `will be booked; the processor cost is accrued at month end.`,
            );
            return false;
        }

        return tender.BookProcessingFeeInline === true;
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
